import { Router } from "express";
import type { Schedule } from "@flowguard/shared";
import { repo } from "./repo.js";
import { runLocalTest } from "./local-runner.js";
import { trackRunStarted, trackRunFinished } from "./metrics.js";
import { notifyForRun } from "./notify.js";
import { computeNextRunIso } from "./schedule.js";

const running = new Set<string>();

export async function fireScheduleNow(sch: Schedule): Promise<{ runId: string }> {
  if (running.has(sch.id)) {
    throw new Error("Schedule already running");
  }
  const test = await repo.getTest(sch.testId);
  const env = await repo.getEnvironment(sch.environmentId);
  if (!test || !env) throw new Error("Test or environment not found");

  const run = await repo.createRun(test.id, env.id);
  trackRunStarted();
  running.add(sch.id);
  console.log(`[scheduler] run-now schedule ${sch.id} → run ${run.id}`);

  await repo.updateSchedule(sch.id, {
    lastRunAt: new Date().toISOString(),
    runsCount: (sch.runsCount ?? 0) + 1,
  });

  runLocalTest(run.id, test, env)
    .then(() => notifyForRun(run.id))
    .catch(async (err: unknown) => {
      console.error("[scheduler] run-now failed:", err);
      trackRunFinished();
      await repo.updateRun(run.id, {
        status: "error",
        error: String(err),
        finishedAt: new Date().toISOString(),
      });
      await notifyForRun(run.id);
    })
    .finally(async () => {
      running.delete(sch.id);
      const finished = await repo.getRun(run.id);
      const status =
        finished?.status === "passed"
          ? "passed"
          : finished?.status === "error"
            ? "error"
            : "failed";
      await repo.updateSchedule(sch.id, {
        lastRunStatus: status as any,
        nextRunAt: computeNextRunIso(sch.cron, sch.intervalMinutes),
        retryCount: 0,
      });
    });

  return { runId: run.id };
}

export const scheduleRunNowRouter = Router();

scheduleRunNowRouter.post("/schedules/:id/run", async (req, res) => {
  const sch = await repo.getSchedule(req.params.id);
  if (!sch) return res.status(404).json({ error: "Schedule not found" });
  if (!sch.enabled) return res.status(400).json({ error: "Schedule is paused" });
  try {
    const out = await fireScheduleNow(sch);
    res.status(201).json({ ok: true, ...out, scheduleId: sch.id });
  } catch (e: any) {
    res.status(409).json({ error: e.message || String(e) });
  }
});
