import express from "express";
import cors from "cors";
import { v4 as uuid } from "uuid";
import {
  CreateProjectBody,
  CreateEnvironmentBody,
  CreateTestBody,
  UpdateStepsBody,
  CreateRunBody,
} from "@flowguard/shared";
import { store } from "./store.js";
import { runLocalTest } from "./local-runner.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.get("/api/projects", (_req, res) => {
  res.json(store.listProjects());
});

app.post("/api/projects", (req, res) => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const project = store.createProject(parsed.data.name);
  res.status(201).json(project);
});

app.get("/api/projects/:id", (req, res) => {
  const project = store.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json(project);
});

app.get("/api/projects/:projectId/environments", (req, res) => {
  res.json(store.listEnvironments(req.params.projectId));
});

app.post("/api/projects/:projectId/environments", (req, res) => {
  const project = store.getProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const parsed = CreateEnvironmentBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const env = store.createEnvironment(
    req.params.projectId,
    parsed.data.name,
    parsed.data.baseUrl,
    parsed.data.variables
  );
  res.status(201).json(env);
});

app.get("/api/projects/:projectId/tests", (req, res) => {
  res.json(store.listTests(req.params.projectId));
});

app.post("/api/projects/:projectId/tests", (req, res) => {
  const project = store.getProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const parsed = CreateTestBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const test = store.createTest(req.params.projectId, parsed.data.name);
  res.status(201).json(test);
});

app.get("/api/tests/:id", (req, res) => {
  const test = store.getTest(req.params.id);
  if (!test) return res.status(404).json({ error: "Test not found" });
  res.json(test);
});

app.put("/api/tests/:id/steps", (req, res) => {
  const parsed = UpdateStepsBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const steps = parsed.data.steps.map((s) => ({
    ...s,
    id: s.id || uuid(),
  }));
  const test = store.updateSteps(req.params.id, steps);
  if (!test) return res.status(404).json({ error: "Test not found" });
  res.json(test);
});

app.post("/api/tests/:id/runs", async (req, res) => {
  const test = store.getTest(req.params.id);
  if (!test) return res.status(404).json({ error: "Test not found" });

  const parsed = CreateRunBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const env = store.getEnvironment(parsed.data.environmentId);
  if (!env) return res.status(404).json({ error: "Environment not found" });

  const run = store.createRun(test.id, env.id);

  const useLocal =
    process.env.USE_LOCAL_EXECUTION === "true" ||
    process.env.USE_LOCAL_EXECUTION === undefined;

  if (useLocal) {
    runLocalTest(run.id, test, env).catch((err) => {
      console.error("Local run failed:", err);
      store.updateRun(run.id, {
        status: "error",
        error: String(err),
        finishedAt: new Date().toISOString(),
      });
    });
  }

  res.status(201).json(run);
});

app.get("/api/runs/:id", (req, res) => {
  const run = store.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  res.json(run);
});

app.get("/api/tests/:id/runs", (req, res) => {
  res.json(store.listRuns(req.params.id));
});

app.listen(PORT, () => {
  console.log(`FlowGuard API listening on http://localhost:${PORT}`);
  console.log(`USE_LOCAL_EXECUTION=${process.env.USE_LOCAL_EXECUTION ?? "true"}`);
});
