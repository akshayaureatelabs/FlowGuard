import { Router } from "express";
import { v4 as uuid } from "uuid";
import {
  CreateSuiteBody,
  UpdateSuiteBody,
  RunSuiteBody,
  CreateDatasetBody,
  UpdateDatasetBody,
} from "@flowguard/shared";
import { repo } from "./repo.js";
import { featuresStore } from "./features-store.js";
import { runLocalTest } from "./local-runner.js";
import { trackRunStarted, trackRunFinished } from "./metrics.js";
import { notifyForRun } from "./notify.js";

export const featuresRouter = Router();

// ── Suites ──────────────────────────────────────────────────────
featuresRouter.get("/projects/:projectId/suites", async (req, res) => {
  res.json(await featuresStore.listSuites(req.params.projectId));
});

featuresRouter.post("/projects/:projectId/suites", async (req, res) => {
  const parsed = CreateSuiteBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await repo.getProject(req.params.projectId)))
    return res.status(404).json({ error: "Project not found" });
  res.status(201).json(
    await featuresStore.createSuite(
      req.params.projectId,
      parsed.data.name,
      parsed.data.testIds || []
    )
  );
});

featuresRouter.get("/suites/:id", async (req, res) => {
  const s = await featuresStore.getSuite(req.params.id);
  if (!s) return res.status(404).json({ error: "Suite not found" });
  res.json(s);
});

featuresRouter.put("/suites/:id", async (req, res) => {
  const parsed = UpdateSuiteBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const s = await featuresStore.updateSuite(req.params.id, parsed.data);
  if (!s) return res.status(404).json({ error: "Suite not found" });
  res.json(s);
});

featuresRouter.delete("/suites/:id", async (req, res) => {
  if (!(await featuresStore.deleteSuite(req.params.id)))
    return res.status(404).json({ error: "Suite not found" });
  res.status(204).send();
});

/** Run all tests in a suite sequentially against one environment. */
featuresRouter.post("/suites/:id/runs", async (req, res) => {
  const parsed = RunSuiteBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const suite = await featuresStore.getSuite(req.params.id);
  if (!suite) return res.status(404).json({ error: "Suite not found" });
  const env = await repo.getEnvironment(parsed.data.environmentId);
  if (!env) return res.status(404).json({ error: "Environment not found" });

  const runs = [];
  for (const testId of suite.testIds) {
    const test = await repo.getTest(testId);
    if (!test) continue;
    const run = await repo.createRun(test.id, env.id);
    trackRunStarted();
    runs.push(run);
    // Sequential: await each run before next
    try {
      await runLocalTest(run.id, test, env);
      await notifyForRun(run.id).catch(() => {});
    } catch (err) {
      trackRunFinished();
      await repo.updateRun(run.id, {
        status: "error",
        error: String(err),
        finishedAt: new Date().toISOString(),
      });
    }
  }
  res.status(201).json({ suiteId: suite.id, runs });
});

// ── Datasets ────────────────────────────────────────────────────
featuresRouter.get("/projects/:projectId/datasets", async (req, res) => {
  res.json(await featuresStore.listDatasets(req.params.projectId));
});

featuresRouter.post("/projects/:projectId/datasets", async (req, res) => {
  const parsed = CreateDatasetBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!(await repo.getProject(req.params.projectId)))
    return res.status(404).json({ error: "Project not found" });
  res.status(201).json(
    await featuresStore.createDataset(
      req.params.projectId,
      parsed.data.name,
      parsed.data.columns || [],
      parsed.data.rows || []
    )
  );
});

featuresRouter.get("/datasets/:id", async (req, res) => {
  const d = await featuresStore.getDataset(req.params.id);
  if (!d) return res.status(404).json({ error: "Dataset not found" });
  res.json(d);
});

featuresRouter.put("/datasets/:id", async (req, res) => {
  const parsed = UpdateDatasetBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = await featuresStore.updateDataset(req.params.id, parsed.data);
  if (!d) return res.status(404).json({ error: "Dataset not found" });
  res.json(d);
});

featuresRouter.delete("/datasets/:id", async (req, res) => {
  if (!(await featuresStore.deleteDataset(req.params.id)))
    return res.status(404).json({ error: "Dataset not found" });
  res.status(204).send();
});

// ── Clone test ──────────────────────────────────────────────────
featuresRouter.post("/tests/:id/clone", async (req, res) => {
  const src = await repo.getTest(req.params.id);
  if (!src) return res.status(404).json({ error: "Test not found" });
  const name =
    (typeof req.body?.name === "string" && req.body.name.trim()) ||
    `${src.name} (copy)`;
  const copy = await repo.createTest(src.projectId, name);
  await repo.updateSteps(
    copy.id,
    (src.steps || []).map((s) => ({ ...s, id: uuid() }))
  );
  if (src.settings) await repo.updateTestSettings(copy.id, src.settings);
  const full = await repo.getTest(copy.id);
  res.status(201).json(full);
});

// ── Versions ────────────────────────────────────────────────────
featuresRouter.get("/tests/:id/versions", async (req, res) => {
  res.json(await featuresStore.listVersions(req.params.id));
});

featuresRouter.post("/tests/:id/versions", async (req, res) => {
  const test = await repo.getTest(req.params.id);
  if (!test) return res.status(404).json({ error: "Test not found" });
  const v = await featuresStore.saveVersion(
    test.id,
    test.steps || [],
    test.settings,
    req.body?.label
  );
  res.status(201).json(v);
});

featuresRouter.post("/tests/:id/versions/:versionId/restore", async (req, res) => {
  const test = await repo.getTest(req.params.id);
  if (!test) return res.status(404).json({ error: "Test not found" });
  const v = await featuresStore.getVersion(req.params.versionId);
  if (!v || v.testId !== test.id)
    return res.status(404).json({ error: "Version not found" });
  // Snapshot current before restore
  await featuresStore.saveVersion(test.id, test.steps || [], test.settings, "before-restore");
  await repo.updateSteps(test.id, v.steps);
  if (v.settings) await repo.updateTestSettings(test.id, v.settings);
  res.json(await repo.getTest(test.id));
});
