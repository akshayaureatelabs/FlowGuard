import { Router, type Request, type Response, type NextFunction } from "express";
import { repo } from "./repo.js";
import { getMetrics } from "./metrics.js";
import { listUsers, deleteUser, AUTH_DISABLED } from "./auth.js";
import { runLocalTest } from "./local-runner.js";
import { notifyForRun, getAlertStats } from "./notify.js";
import { trackRunStarted, trackRunFinished } from "./metrics.js";
import { dbMode } from "./db.js";
import type { Test, TestRun, Schedule, Team, Project } from "@flowguard/shared";

const ADMIN_KEY = process.env.ADMIN_KEY || "flowguard-admin";

/** Gate for /api/admin/* — requires the X-Admin-Key header. */
export function requireAdminKey(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["x-admin-key"];
  if (key !== ADMIN_KEY) return res.status(401).json({ error: "Invalid admin key" });
  next();
}

export const adminRouter = Router();

adminRouter.get("/config", (_req, res) => {
  res.json({
    authDisabled: AUTH_DISABLED,
    database: dbMode,
    adminKeySet: !!process.env.ADMIN_KEY,
    metrics: getMetrics(),
  });
});

adminRouter.get("/overview", async (_req, res) => {
  const projects: Project[] = await repo.listProjects();
  const tests: Test[] = [];
  for (const p of projects) tests.push(...(await repo.listTests(p.id)));
  const runs: TestRun[] = await repo.listRuns();
  const schedules: Schedule[] = await repo.listSchedules();
  const teams: Team[] = await repo.listTeams();
  const users = await listUsers();
  const metrics = getMetrics();
  const { attempts, failures, lastAt } = await getAlertStats();

  const finished = runs.filter(
    (r) => r.status === "passed" || r.status === "failed" || r.status === "error"
  );
  const passedCount = runs.filter((r) => r.status === "passed").length;
  const passRate = finished.length
    ? Math.round((passedCount / finished.length) * 100)
    : null;

  const STUCK_MS = 10 * 60 * 1000;
  const nowMs = Date.now();
  const stuckRuns = runs.filter((r) => {
    if (r.status !== "running" && r.status !== "queued") return false;
    const t = new Date(r.startedAt || r.createdAt).getTime();
    return nowMs - t > STUCK_MS;
  });

  const failingTests = tests
    .map((t) => {
      const truns = runs.filter((r) => r.testId === t.id);
      const latest = truns[0];
      return { t, latest };
    })
    .filter((x) => x.latest && (x.latest.status === "failed" || x.latest.status === "error"))
    .map((x) => ({
      id: x.t.id,
      name: x.t.name,
      projectName: projects.find((p) => p.id === x.t.projectId)?.name,
      lastStatus: x.latest!.status,
      lastRunAt: x.latest!.finishedAt || x.latest!.createdAt,
    }))
    .slice(0, 10);

  const enabledSchedules = schedules.filter((s) => s.enabled);
  const overdueSchedules = enabledSchedules.filter(
    (s) => s.nextRunAt && new Date(s.nextRunAt).getTime() < nowMs
  );
  const lastStatusCounts = { passed: 0, failed: 0, error: 0 };
  for (const s of enabledSchedules) {
    if (s.lastRunStatus === "passed") lastStatusCounts.passed += 1;
    else if (s.lastRunStatus === "failed") lastStatusCounts.failed += 1;
    else if (s.lastRunStatus === "error") lastStatusCounts.error += 1;
  }

  const trendMap = new Map<string, { runs: number; passed: number; failed: number }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    trendMap.set(d.toISOString().slice(0, 10), { runs: 0, passed: 0, failed: 0 });
  }
  for (const r of runs) {
    const day = (r.createdAt || "").slice(0, 10);
    const bucket = trendMap.get(day);
    if (!bucket) continue;
    bucket.runs += 1;
    if (r.status === "passed") bucket.passed += 1;
    if (r.status === "failed" || r.status === "error") bucket.failed += 1;
  }
  const trend7d = [...trendMap.entries()].map(([date, v]) => ({ date, ...v }));

  res.json({
    counts: {
      projects: projects.length,
      tests: tests.length,
      runs: runs.length,
      schedules: schedules.length,
      teams: teams.length,
      users: users.length,
    },
    metrics,
    passRate,
    finishedRuns: finished.length,
    stuckRuns: stuckRuns.map((r) => ({
      id: r.id,
      testName: tests.find((t) => t.id === r.testId)?.name,
      status: r.status,
      runningSince: r.startedAt || r.createdAt,
    })),
    failingTests,
    scheduler: {
      enabled: enabledSchedules.length,
      total: schedules.length,
      overdue: overdueSchedules.length,
      lastRunStatusCounts: lastStatusCounts,
    },
    alerts: { attempts, failures, lastAt },
    trend7d,
    recentRuns: runs.slice(0, 10).map(joinNames(projects, tests)),
  });
});

adminRouter.get("/projects", async (_req, res) => {
  const projects: Project[] = await repo.listProjects();
  const out = [];
  for (const p of projects) {
    const envs = await repo.listEnvironments(p.id);
    const tests = await repo.listTests(p.id);
    let runCount = 0;
    for (const t of tests) runCount += (await repo.listRuns(t.id)).length;
    out.push({
      ...p,
      environmentCount: envs.length,
      testCount: tests.length,
      runCount,
    });
  }
  res.json(out);
});

adminRouter.get("/tests", async (_req, res) => {
  const projects: Project[] = await repo.listProjects();
  const tests: Test[] = [];
  for (const p of projects) tests.push(...(await repo.listTests(p.id)));
  const schedules: Schedule[] = await repo.listSchedules();
  const envsByProject = new Map<string, { id: string; name: string }[]>();
  for (const p of projects) {
    const envs = await repo.listEnvironments(p.id);
    envsByProject.set(p.id, envs.map((e: any) => ({ id: e.id, name: e.name })));
  }
  const out = await Promise.all(
    tests.map(async (t) => {
      const project = projects.find((p) => p.id === t.projectId);
      const runs: TestRun[] = await repo.listRuns(t.id);
      const testSchedules = schedules.filter((s) => s.testId === t.id);
      return {
        id: t.id,
        name: t.name,
        projectId: t.projectId,
        projectName: project?.name,
        stepCount: (t.steps || []).length,
        scheduleCount: testSchedules.length,
        runCount: runs.length,
        lastStatus: runs[0]?.status,
        lastRunAt: runs[0]?.finishedAt || runs[0]?.createdAt,
        environments: envsByProject.get(t.projectId) || [],
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      };
    })
  );
  res.json(out);
});

adminRouter.get("/runs", async (req, res) => {
  const projects: Project[] = await repo.listProjects();
  const tests: Test[] = [];
  for (const p of projects) tests.push(...(await repo.listTests(p.id)));
  const runs: TestRun[] = await repo.listRuns();
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  res.json(runs.slice(0, limit).map(joinNames(projects, tests)));
});

adminRouter.get("/schedules", async (_req, res) => {
  const projects: Project[] = await repo.listProjects();
  const tests: Test[] = [];
  for (const p of projects) tests.push(...(await repo.listTests(p.id)));
  const schedules: Schedule[] = await repo.listSchedules();
  res.json(
    schedules.map((s) => {
      const test = tests.find((t) => t.id === s.testId);
      return {
        ...s,
        testName: test?.name,
        projectName: projects.find((p) => p.id === test?.projectId)?.name,
      };
    })
  );
});

adminRouter.get("/teams", async (_req, res) => {
  const teams: Team[] = await repo.listTeams();
  const out = [];
  for (const t of teams) {
    const members = await repo.listTeamMembers(t.id);
    const invites = await repo.listInvites(t.id);
    const allProjects: Project[] = await repo.listProjects();
    const memberProjects = allProjects.filter((p) => p.teamId === t.id);
    out.push({
      ...t,
      memberCount: members.length,
      inviteCount: invites.length,
      projectCount: memberProjects.length,
    });
  }
  res.json(out);
});

adminRouter.get("/users", async (_req, res) => {
  const users = await listUsers();
  res.json(
    users.map((u) => ({
      ...u,
      apiKey: u.apiKey ? `${u.apiKey.slice(0, 4)}…${u.apiKey.slice(-4)}` : undefined,
    }))
  );
});

adminRouter.delete("/projects/:id", async (req, res) => {
  if (!(await repo.deleteProject(req.params.id)))
    return res.status(404).json({ error: "Project not found" });
  res.status(204).send();
});

adminRouter.delete("/tests/:id", async (req, res) => {
  if (!(await repo.deleteTest(req.params.id)))
    return res.status(404).json({ error: "Test not found" });
  res.status(204).send();
});

adminRouter.delete("/runs/:id", async (req, res) => {
  if (!(await repo.deleteRun(req.params.id)))
    return res.status(404).json({ error: "Run not found" });
  res.status(204).send();
});

adminRouter.delete("/schedules/:id", async (req, res) => {
  if (!(await repo.deleteSchedule(req.params.id)))
    return res.status(404).json({ error: "Schedule not found" });
  res.status(204).send();
});

adminRouter.delete("/teams/:id", async (req, res) => {
  if (!(await repo.deleteTeam(req.params.id)))
    return res.status(404).json({ error: "Team not found" });
  res.status(204).send();
});

adminRouter.delete("/users/:id", async (req, res) => {
  if (req.params.id === "local")
    return res.status(400).json({ error: "Cannot delete the local user" });
  if (!(await deleteUser(req.params.id)))
    return res.status(404).json({ error: "User not found" });
  res.status(204).send();
});

adminRouter.post("/run", async (req, res) => {
  const { testId, environmentId } = req.body || {};
  if (!testId || !environmentId)
    return res.status(400).json({ error: "testId and environmentId required" });
  const test = await repo.getTest(testId);
  if (!test) return res.status(404).json({ error: "Test not found" });
  const env = await repo.getEnvironment(environmentId);
  if (!env) return res.status(404).json({ error: "Environment not found" });

  const run = await repo.createRun(test.id, env.id);
  trackRunStarted();

  const useLocal =
    process.env.USE_LOCAL_EXECUTION === "true" ||
    process.env.USE_LOCAL_EXECUTION === undefined;

  if (useLocal) {
    runLocalTest(run.id, test, env)
      .then(() => notifyForRun(run.id))
      .catch(async (err) => {
        console.error("Admin-triggered run failed:", err);
        trackRunFinished();
        await repo.updateRun(run.id, {
          status: "error",
          error: String(err),
          finishedAt: new Date().toISOString(),
        });
        await notifyForRun(run.id);
      });
  }
  res.status(201).json(run);
});

type Joined = TestRun & {
  testName?: string;
  projectName?: string;
  projectId?: string;
};

function joinNames(projects: Project[], tests: Test[]) {
  return (run: TestRun): Joined => {
    const test = tests.find((t) => t.id === run.testId);
    const project = test
      ? projects.find((p) => p.id === test.projectId)
      : undefined;
    return { ...run, testName: test?.name, projectName: project?.name, projectId: test?.projectId };
  };
}
