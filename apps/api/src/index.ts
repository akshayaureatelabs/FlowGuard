import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { v4 as uuid } from "uuid";
import {
  CreateProjectBody,
  CreateEnvironmentBody,
  CreateTestBody,
  UpdateStepsBody,
  CreateRunBody,
  CreateModuleBody,
  CreateScheduleBody,
  UpdateTestSettingsBody,
} from "@flowguard/shared";
import { store } from "./store.js";
import { runLocalTest } from "./local-runner.js";
import {
  authMiddleware,
  registerUser,
  loginUser,
  AUTH_DISABLED,
} from "./auth.js";
import { openApiSpec } from "./openapi.js";
import { trackRequest, trackRunStarted, getMetrics } from "./metrics.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const startedAt = Date.now();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use((req, _res, next) => {
  trackRequest();
  next();
});

const limiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_MAX) || 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", limiter);

app.get("/health", (_req, res) => {
  const m = getMetrics();
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    uptimeSec: m.uptimeSec,
    auth: AUTH_DISABLED ? "disabled" : "jwt+apiKey",
    database: process.env.USE_DATABASE === "true" ? "postgres" : "memory",
    metrics: m,
  });
});

app.get("/metrics", (_req, res) => {
  res.json(getMetrics());
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.get("/openapi.json", (_req, res) => res.json(openApiSpec));

// ── Auth ────────────────────────────────────────────────────────────────────
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password required" });
    }
    const user = await registerUser(email, password, name);
    res.status(201).json(user);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password required" });
    }
    const result = await loginUser(email, password);
    res.json(result);
  } catch (e: any) {
    res.status(401).json({ error: e.message });
  }
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Protect API routes (auth disabled automatically in local memory mode)
app.use("/api", authMiddleware);

app.get("/api/projects", (_req, res) => {
  res.json(store.listProjects());
});

app.post("/api/projects", (req, res) => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(store.createProject(parsed.data.name));
});

app.get("/api/projects/:id", (req, res) => {
  const project = store.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json(project);
});

app.put("/api/projects/:id", (req, res) => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const project = store.updateProject(req.params.id, parsed.data.name);
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json(project);
});

app.delete("/api/projects/:id", (req, res) => {
  if (!store.deleteProject(req.params.id))
    return res.status(404).json({ error: "Project not found" });
  res.status(204).send();
});

app.get("/api/projects/:projectId/environments", (req, res) => {
  res.json(store.listEnvironments(req.params.projectId));
});

app.post("/api/projects/:projectId/environments", (req, res) => {
  if (!store.getProject(req.params.projectId))
    return res.status(404).json({ error: "Project not found" });
  const parsed = CreateEnvironmentBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(
    store.createEnvironment(
      req.params.projectId,
      parsed.data.name,
      parsed.data.baseUrl,
      parsed.data.variables
    )
  );
});

app.put("/api/environments/:id", (req, res) => {
  const env = store.updateEnvironment(req.params.id, {
    name: req.body?.name,
    baseUrl: req.body?.baseUrl,
    variables: req.body?.variables,
  });
  if (!env) return res.status(404).json({ error: "Environment not found" });
  res.json(env);
});

app.delete("/api/environments/:id", (req, res) => {
  if (!store.deleteEnvironment(req.params.id))
    return res.status(404).json({ error: "Environment not found" });
  res.status(204).send();
});

app.get("/api/projects/:projectId/tests", (req, res) => {
  res.json(store.listTests(req.params.projectId));
});

app.post("/api/projects/:projectId/tests", (req, res) => {
  if (!store.getProject(req.params.projectId))
    return res.status(404).json({ error: "Project not found" });
  const parsed = CreateTestBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(store.createTest(req.params.projectId, parsed.data.name));
});

app.get("/api/tests/:id", (req, res) => {
  const test = store.getTest(req.params.id);
  if (!test) return res.status(404).json({ error: "Test not found" });
  res.json(test);
});

app.put("/api/tests/:id", (req, res) => {
  const parsed = CreateTestBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const test = store.updateTest(req.params.id, parsed.data.name);
  if (!test) return res.status(404).json({ error: "Test not found" });
  res.json(test);
});

app.put("/api/tests/:id/settings", (req, res) => {
  const parsed = UpdateTestSettingsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const test = store.updateTestSettings(req.params.id, parsed.data);
  if (!test) return res.status(404).json({ error: "Test not found" });
  res.json(test);
});

app.delete("/api/tests/:id", (req, res) => {
  if (!store.deleteTest(req.params.id))
    return res.status(404).json({ error: "Test not found" });
  res.status(204).send();
});

app.put("/api/tests/:id/steps", (req, res) => {
  const parsed = UpdateStepsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const steps = parsed.data.steps.map((s) => ({ ...s, id: s.id || uuid() }));
  const test = store.updateSteps(req.params.id, steps);
  if (!test) return res.status(404).json({ error: "Test not found" });
  res.json(test);
});

app.post("/api/tests/:id/runs", async (req, res) => {
  const test = store.getTest(req.params.id);
  if (!test) return res.status(404).json({ error: "Test not found" });
  const parsed = CreateRunBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const env = store.getEnvironment(parsed.data.environmentId);
  if (!env) return res.status(404).json({ error: "Environment not found" });

  const run = store.createRun(test.id, env.id);
  trackRunStarted();

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

app.get("/api/projects/:projectId/modules", (req, res) => {
  res.json(store.listModules(req.params.projectId));
});

app.post("/api/projects/:projectId/modules", (req, res) => {
  if (!store.getProject(req.params.projectId))
    return res.status(404).json({ error: "Project not found" });
  const parsed = CreateModuleBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(store.createModule(req.params.projectId, parsed.data.name));
});

app.get("/api/modules/:id", (req, res) => {
  const mod = store.getModule(req.params.id);
  if (!mod) return res.status(404).json({ error: "Module not found" });
  res.json(mod);
});

app.put("/api/modules/:id/steps", (req, res) => {
  const parsed = UpdateStepsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const steps = parsed.data.steps.map((s) => ({ ...s, id: s.id || uuid() }));
  const mod = store.updateModuleSteps(req.params.id, steps);
  if (!mod) return res.status(404).json({ error: "Module not found" });
  res.json(mod);
});

app.delete("/api/modules/:id", (req, res) => {
  if (!store.deleteModule(req.params.id))
    return res.status(404).json({ error: "Module not found" });
  res.status(204).send();
});

app.get("/api/schedules", (req, res) => {
  const testId = req.query.testId as string | undefined;
  res.json(store.listSchedules(testId));
});

app.post("/api/schedules", (req, res) => {
  const parsed = CreateScheduleBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!store.getTest(parsed.data.testId))
    return res.status(404).json({ error: "Test not found" });
  if (!store.getEnvironment(parsed.data.environmentId))
    return res.status(404).json({ error: "Environment not found" });
  res.status(201).json(store.createSchedule(parsed.data));
});

app.put("/api/schedules/:id", (req, res) => {
  const sch = store.updateSchedule(req.params.id, req.body || {});
  if (!sch) return res.status(404).json({ error: "Schedule not found" });
  res.json(sch);
});

app.delete("/api/schedules/:id", (req, res) => {
  if (!store.deleteSchedule(req.params.id))
    return res.status(404).json({ error: "Schedule not found" });
  res.status(204).send();
});

setInterval(() => {
  const due = store.dueSchedules();
  for (const sch of due) {
    const test = store.getTest(sch.testId);
    const env = store.getEnvironment(sch.environmentId);
    if (!test || !env) continue;
    const run = store.createRun(test.id, env.id);
    trackRunStarted();
    const interval = sch.intervalMinutes || 60;
    store.updateSchedule(sch.id, {
      lastRunAt: new Date().toISOString(),
      nextRunAt: new Date(Date.now() + interval * 60_000).toISOString(),
    });
    runLocalTest(run.id, test, env).catch((err) => {
      console.error("Scheduled run failed:", err);
      store.updateRun(run.id, {
        status: "error",
        error: String(err),
        finishedAt: new Date().toISOString(),
      });
    });
    console.log(`[scheduler] triggered schedule ${sch.id} → run ${run.id}`);
  }
}, 30_000);

app.listen(PORT, () => {
  console.log(`FlowGuard API listening on http://localhost:${PORT}`);
  console.log(`Docs: http://localhost:${PORT}/docs`);
  console.log(`USE_DATABASE=${process.env.USE_DATABASE ?? "false"}`);
  console.log(`AUTH=${AUTH_DISABLED ? "disabled (local)" : "enabled"}`);
  console.log(`USE_LOCAL_EXECUTION=${process.env.USE_LOCAL_EXECUTION ?? "true"}`);
});

export { app };
