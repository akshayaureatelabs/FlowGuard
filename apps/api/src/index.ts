import "./env.js";
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
import { dbMode, useMongo, getMongo } from "./db.js";
import { repo } from "./repo.js";
import { runLocalTest, ARTIFACTS_DIR } from "./local-runner.js";
import {
  authMiddleware,
  registerUser,
  loginUser,
  AUTH_DISABLED,
} from "./auth.js";
import { openApiSpec } from "./openapi.js";
import {
  trackRequest,
  trackRunStarted,
  trackRunFinished,
  getMetrics,
} from "./metrics.js";
import { notifyForRun } from "./notify.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Cross-Origin-Resource-Policy disabled so the web app (different origin) can
// embed artifacts (screenshots/diffs) served from this API.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use((_req, _res, next) => {
  trackRequest();
  next();
});

app.use(
  "/api",
  rateLimit({
    windowMs: 60_000,
    max: Number(process.env.RATE_LIMIT_MAX) || 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Serve run artifacts (screenshots, diffs, videos) captured during test runs.
app.use("/artifacts", express.static(ARTIFACTS_DIR));

type AuthedRequest = { user?: { id: string; email?: string } };

function isLocalUser(user: AuthedRequest["user"] | undefined): boolean {
  return !user || user.id === "local";
}

function canAccessProject(user: AuthedRequest["user"] | undefined, project: any): boolean {
  if (!project) return false;
  if (!user || user.id === "local") return true;
  // Legacy projects without an owner stay visible to everyone; otherwise owner-only.
  return !project.ownerId || project.ownerId === user.id;
}

async function accessibleProject(req: any, projectId: string): Promise<any | null | false> {
  const project = await repo.getProject(projectId);
  if (!project) return null;
  return canAccessProject(req.user, project) ? project : false;
}

async function accessibleTest(req: any, testId: string): Promise<any | null | false> {
  const test = await repo.getTest(testId);
  if (!test) return null;
  const project = await repo.getProject(test.projectId);
  return canAccessProject(req.user, project) ? test : false;
}

app.get("/health", (_req, res) => {
  const m = getMetrics();
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    uptimeSec: m.uptimeSec,
    auth: AUTH_DISABLED ? "disabled" : "jwt+apiKey",
    database: dbMode,
    metrics: m,
  });
});

app.get("/metrics", (_req, res) => res.json(getMetrics()));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.get("/openapi.json", (_req, res) => res.json(openApiSpec));

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: "email and password required" });
    res.status(201).json(await registerUser(email, password, name));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: "email and password required" });
    res.json(await loginUser(email, password));
  } catch (e: any) {
    res.status(401).json({ error: e.message });
  }
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

app.use("/api", authMiddleware);

app.get("/api/projects", async (req, res) => {
  const projects = await repo.listProjects();
  res.json(projects.filter((p: any) => canAccessProject(req.user, p)));
});

app.post("/api/projects", async (req, res) => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(await repo.createProject(parsed.data.name, req.user?.id));
});

app.get("/api/projects/:id", async (req, res) => {
  const project = await repo.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (!canAccessProject(req.user, project))
    return res.status(403).json({ error: "Access denied" });
  res.json(project);
});

app.put("/api/projects/:id", async (req, res) => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const project = await repo.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (!canAccessProject(req.user, project))
    return res.status(403).json({ error: "Access denied" });
  const updated = await repo.updateProject(req.params.id, parsed.data.name);
  if (!updated) return res.status(404).json({ error: "Project not found" });
  res.json(updated);
});

app.delete("/api/projects/:id", async (req, res) => {
  const project = await repo.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (!canAccessProject(req.user, project))
    return res.status(403).json({ error: "Access denied" });
  if (!(await repo.deleteProject(req.params.id)))
    return res.status(404).json({ error: "Project not found" });
  res.status(204).send();
});

app.get("/api/projects/:projectId/environments", async (req, res) => {
  res.json(await repo.listEnvironments(req.params.projectId));
});

app.post("/api/projects/:projectId/environments", async (req, res) => {
  const gate = await accessibleProject(req, req.params.projectId);
  if (gate === null) return res.status(404).json({ error: "Project not found" });
  if (gate === false) return res.status(403).json({ error: "Access denied" });
  const parsed = CreateEnvironmentBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(
    await repo.createEnvironment(
      req.params.projectId,
      parsed.data.name,
      parsed.data.baseUrl,
      parsed.data.variables
    )
  );
});

app.put("/api/environments/:id", async (req, res) => {
  const current = await repo.getEnvironment(req.params.id);
  if (!current) return res.status(404).json({ error: "Environment not found" });
  const gate = await accessibleProject(req, current.projectId);
  if (gate === false) return res.status(403).json({ error: "Access denied" });
  const env = await repo.updateEnvironment(req.params.id, {
    name: req.body?.name,
    baseUrl: req.body?.baseUrl,
    variables: req.body?.variables,
  });
  if (!env) return res.status(404).json({ error: "Environment not found" });
  res.json(env);
});

app.delete("/api/environments/:id", async (req, res) => {
  const current = await repo.getEnvironment(req.params.id);
  if (!current) return res.status(404).json({ error: "Environment not found" });
  const gate = await accessibleProject(req, current.projectId);
  if (gate === false) return res.status(403).json({ error: "Access denied" });
  if (!(await repo.deleteEnvironment(req.params.id)))
    return res.status(404).json({ error: "Environment not found" });
  res.status(204).send();
});

app.get("/api/projects/:projectId/tests", async (req, res) => {
  res.json(await repo.listTests(req.params.projectId));
});

app.post("/api/projects/:projectId/tests", async (req, res) => {
  const gate = await accessibleProject(req, req.params.projectId);
  if (gate === null) return res.status(404).json({ error: "Project not found" });
  if (gate === false) return res.status(403).json({ error: "Access denied" });
  const parsed = CreateTestBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(await repo.createTest(req.params.projectId, parsed.data.name));
});

app.get("/api/tests/:id", async (req, res) => {
  const gate = await accessibleTest(req, req.params.id);
  if (gate === null) return res.status(404).json({ error: "Test not found" });
  if (gate === false) return res.status(403).json({ error: "Access denied" });
  res.json(gate);
});

app.put("/api/tests/:id", async (req, res) => {
  const parsed = CreateTestBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const gate = await accessibleTest(req, req.params.id);
  if (gate === null) return res.status(404).json({ error: "Test not found" });
  if (gate === false) return res.status(403).json({ error: "Access denied" });
  const test = await repo.updateTest(req.params.id, parsed.data.name);
  if (!test) return res.status(404).json({ error: "Test not found" });
  res.json(test);
});

app.put("/api/tests/:id/settings", async (req, res) => {
  const parsed = UpdateTestSettingsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const gate = await accessibleTest(req, req.params.id);
  if (gate === null) return res.status(404).json({ error: "Test not found" });
  if (gate === false) return res.status(403).json({ error: "Access denied" });
  const test = await repo.updateTestSettings(req.params.id, parsed.data);
  if (!test) return res.status(404).json({ error: "Test not found" });
  res.json(test);
});

app.delete("/api/tests/:id", async (req, res) => {
  const gate = await accessibleTest(req, req.params.id);
  if (gate === null) return res.status(404).json({ error: "Test not found" });
  if (gate === false) return res.status(403).json({ error: "Access denied" });
  if (!(await repo.deleteTest(req.params.id)))
    return res.status(404).json({ error: "Test not found" });
  res.status(204).send();
});

app.put("/api/tests/:id/steps", async (req, res) => {
  const parsed = UpdateStepsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const gate = await accessibleTest(req, req.params.id);
  if (gate === null) return res.status(404).json({ error: "Test not found" });
  if (gate === false) return res.status(403).json({ error: "Access denied" });
  const steps = parsed.data.steps.map((s) => ({ ...s, id: s.id || uuid() }));
  const test = await repo.updateSteps(req.params.id, steps);
  if (!test) return res.status(404).json({ error: "Test not found" });
  res.json(test);
});

// Append steps — used by the browser recorder to push recorded actions.
app.post("/api/tests/:id/steps", async (req, res) => {
  const gate = await accessibleTest(req, req.params.id);
  if (gate === null) return res.status(404).json({ error: "Test not found" });
  if (gate === false) return res.status(403).json({ error: "Access denied" });
  const parsed = UpdateStepsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const incoming = parsed.data.steps.map((s) => ({ ...s, id: s.id || uuid() }));
  const test = await repo.updateSteps(req.params.id, [...(gate.steps || []), ...incoming]);
  res.status(201).json({ ...test, appended: incoming.length });
});

app.post("/api/tests/:id/runs", async (req, res) => {
  const gate = await accessibleTest(req, req.params.id);
  if (gate === null) return res.status(404).json({ error: "Test not found" });
  if (gate === false) return res.status(403).json({ error: "Access denied" });
  const test = gate;
  const parsed = CreateRunBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const env = await repo.getEnvironment(parsed.data.environmentId);
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
        console.error("Local run failed:", err);
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

app.get("/api/runs/:id", async (req, res) => {
  const run = await repo.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  const gate = await accessibleTest(req, run.testId);
  if (gate === false) return res.status(403).json({ error: "Access denied" });
  res.json(run);
});

app.get("/api/tests/:id/runs", async (req, res) => {
  const gate = await accessibleTest(req, req.params.id);
  if (gate === null) return res.status(404).json({ error: "Test not found" });
  if (gate === false) return res.status(403).json({ error: "Access denied" });
  res.json(await repo.listRuns(req.params.id));
});

app.get("/api/projects/:projectId/modules", async (req, res) => {
  const gate = await accessibleProject(req, req.params.projectId);
  if (gate === null) return res.status(404).json({ error: "Project not found" });
  if (gate === false) return res.status(403).json({ error: "Access denied" });
  res.json(await repo.listModules(req.params.projectId));
});

app.post("/api/projects/:projectId/modules", async (req, res) => {
  const gate = await accessibleProject(req, req.params.projectId);
  if (gate === null) return res.status(404).json({ error: "Project not found" });
  if (gate === false) return res.status(403).json({ error: "Access denied" });
  const parsed = CreateModuleBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(await repo.createModule(req.params.projectId, parsed.data.name));
});

app.get("/api/modules/:id", async (req, res) => {
  const mod = await repo.getModule(req.params.id);
  if (!mod) return res.status(404).json({ error: "Module not found" });
  const gate = await accessibleProject(req, mod.projectId);
  if (gate === false) return res.status(403).json({ error: "Access denied" });
  res.json(mod);
});

app.put("/api/modules/:id/steps", async (req, res) => {
  const parsed = UpdateStepsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const mod = await repo.getModule(req.params.id);
  if (!mod) return res.status(404).json({ error: "Module not found" });
  const gate = await accessibleProject(req, mod.projectId);
  if (gate === false) return res.status(403).json({ error: "Access denied" });
  const steps = parsed.data.steps.map((s) => ({ ...s, id: s.id || uuid() }));
  const updated = await repo.updateModuleSteps(req.params.id, steps);
  if (!updated) return res.status(404).json({ error: "Module not found" });
  res.json(updated);
});

app.delete("/api/modules/:id", async (req, res) => {
  const mod = await repo.getModule(req.params.id);
  if (!mod) return res.status(404).json({ error: "Module not found" });
  const gate = await accessibleProject(req, mod.projectId);
  if (gate === false) return res.status(403).json({ error: "Access denied" });
  if (!(await repo.deleteModule(req.params.id)))
    return res.status(404).json({ error: "Module not found" });
  res.status(204).send();
});

app.get("/api/schedules", async (req, res) => {
  const schedules = await repo.listSchedules(req.query.testId as string | undefined);
  const accessible = [];
  for (const sch of schedules) {
    const gate = await accessibleTest(req, sch.testId);
    if (gate) accessible.push(sch);
  }
  res.json(accessible);
});

app.post("/api/schedules", async (req, res) => {
  const parsed = CreateScheduleBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const gate = await accessibleTest(req, parsed.data.testId);
  if (gate === null) return res.status(404).json({ error: "Test not found" });
  if (gate === false) return res.status(403).json({ error: "Access denied" });
  if (!(await repo.getEnvironment(parsed.data.environmentId)))
    return res.status(404).json({ error: "Environment not found" });
  res.status(201).json(await repo.createSchedule(parsed.data));
});

app.put("/api/schedules/:id", async (req, res) => {
  const sch = await repo.getSchedule(req.params.id);
  if (!sch) return res.status(404).json({ error: "Schedule not found" });
  const gate = await accessibleTest(req, sch.testId);
  if (gate === false) return res.status(403).json({ error: "Access denied" });
  const updated = await repo.updateSchedule(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: "Schedule not found" });
  res.json(updated);
});

app.delete("/api/schedules/:id", async (req, res) => {
  const sch = await repo.getSchedule(req.params.id);
  if (!sch) return res.status(404).json({ error: "Schedule not found" });
  const gate = await accessibleTest(req, sch.testId);
  if (gate === false) return res.status(403).json({ error: "Access denied" });
  if (!(await repo.deleteSchedule(req.params.id)))
    return res.status(404).json({ error: "Schedule not found" });
  res.status(204).send();
});

setInterval(async () => {
  try {
    const due = await repo.dueSchedules();
    for (const sch of due) {
      const test = await repo.getTest(sch.testId);
      const env = await repo.getEnvironment(sch.environmentId);
      if (!test || !env) continue;
      const run = await repo.createRun(test.id, env.id);
      trackRunStarted();
      const interval = sch.intervalMinutes || 60;
      await repo.updateSchedule(sch.id, {
        lastRunAt: new Date().toISOString(),
        nextRunAt: new Date(Date.now() + interval * 60_000).toISOString(),
      });
      runLocalTest(run.id, test, env)
        .then(() => notifyForRun(run.id))
        .catch(async (err) => {
          console.error("Scheduled run failed:", err);
          trackRunFinished();
          await repo.updateRun(run.id, {
            status: "error",
            error: String(err),
            finishedAt: new Date().toISOString(),
          });
          await notifyForRun(run.id);
        });
      console.log(`[scheduler] triggered schedule ${sch.id} → run ${run.id}`);
    }
  } catch (err) {
    console.error("[scheduler] tick error", err);
  }
}, 30_000);

async function start() {
  if (useMongo) {
    try {
      await getMongo();
    } catch (err) {
      console.error(
        "[db] MongoDB connection failed. Install MongoDB locally or set MONGODB_URL (Atlas).",
        err
      );
      process.exit(1);
    }
  }
  app.listen(PORT, () => {
    console.log(`FlowGuard API listening on http://localhost:${PORT}`);
    console.log(`Docs: http://localhost:${PORT}/docs`);
    console.log(`database=${dbMode}`);
    console.log(`AUTH=${AUTH_DISABLED ? "disabled" : "enabled"}`);
    console.log(`USE_LOCAL_EXECUTION=${process.env.USE_LOCAL_EXECUTION ?? "true"}`);
  });
}

start();

export { app };
