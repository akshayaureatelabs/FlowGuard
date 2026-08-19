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
  UpdateProjectBody,
  CreateTeamBody,
  AddTeamMemberBody,
  UpdateMemberRoleBody,
  CreateTeamInviteBody,
  type Schedule,
} from "@flowguard/shared";
import { dbMode, useMongo, getMongo } from "./db.js";
import { repo } from "./repo.js";
import { runLocalTest, ARTIFACTS_DIR } from "./local-runner.js";
import { computeNextRunIso } from "./schedule.js";
import {
  canAccessProject as decideAccess,
  canEditTeam,
  canAssignTeam,
  canMutateMemberRole,
} from "./teams-access.js";
import {
  authMiddleware,
  registerUser,
  loginUser,
  AUTH_DISABLED,
  assertAuthSafety,
} from "./auth.js";
import { openApiSpec } from "./openapi.js";
import { adminRouter, requireAdminKey, assertAdminKeyConfigured } from "./admin.js";
import {
  trackRequest,
  trackRunStarted,
  trackRunFinished,
  getMetrics,
} from "./metrics.js";
import { notifyForRun } from "./notify.js";
import { acquireSchedulerLock } from "./redis-lock.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Cross-Origin-Resource-Policy disabled so the web app (different origin) can
// embed artifacts (screenshots/diffs) served from this API.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: CORS_ORIGINS }));
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

async function canAccessProject(
  user: AuthedRequest["user"] | undefined,
  project: any
): Promise<boolean> {
  if (!project) return false;
  let teamMembership: any = null;
  if (project.teamId && !isLocalUser(user)) {
    teamMembership = await repo.getTeamMember(project.teamId, user?.id || "");
  }
  return decideAccess({
    project,
    isAuthDisabled: AUTH_DISABLED,
    authUserId: user?.id || "",
    teamMembership,
  });
}

/** Role lookup per request so nested checks don't hit the DB repeatedly. */
async function myTeamRole(
  user: AuthedRequest["user"] | undefined,
  teamId: string
): Promise<any> {
  const m = await repo.getTeamMember(teamId, user?.id || "");
  return m?.role;
}

async function accessibleProject(req: any, projectId: string): Promise<any | null | false> {
  const project = await repo.getProject(projectId);
  if (!project) return null;
  return (await canAccessProject(req.user, project)) ? project : false;
}

async function accessibleTest(req: any, testId: string): Promise<any | null | false> {
  const test = await repo.getTest(testId);
  if (!test) return null;
  const project = await repo.getProject(test.projectId);
  return (await canAccessProject(req.user, project)) ? test : false;
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

// ---- Admin panel (guarded by X-Admin-Key header) ----
app.use("/api/admin", requireAdminKey, adminRouter);

app.use("/api", authMiddleware);

// ---- Teams / organization ----
app.get("/api/teams", async (req, res) => {
  res.json(await repo.listTeamsForUser(req.user?.id || ""));
});

app.post("/api/teams", async (req, res) => {
  const parsed = CreateTeamBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(await repo.createTeam(parsed.data.name, req.user?.id || ""));
});

app.get("/api/teams/:id", async (req, res) => {
  const team = await repo.getTeam(req.params.id);
  if (!team) return res.status(404).json({ error: "Team not found" });
  const role = await myTeamRole(req.user, team.id);
  if (!role) return res.status(403).json({ error: "Access denied" });
  res.json({
    team,
    role,
    members: await repo.listTeamMembers(team.id),
    invites: canEditTeam(role) ? await repo.listInvites(team.id) : undefined,
  });
});

app.post("/api/teams/:id/members", async (req, res) => {
  const parsed = AddTeamMemberBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const role = await myTeamRole(req.user, req.params.id);
  if (!canEditTeam(role)) return res.status(403).json({ error: "Requires team admin/owner" });
  const member = await repo.addTeamMember(req.params.id, parsed.data.userId, parsed.data.role);
  res.status(201).json(member);
});

app.put("/api/teams/:id/members/:userId", async (req, res) => {
  const parsed = UpdateMemberRoleBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const myRole = await myTeamRole(req.user, req.params.id);
  const target = await repo.getTeamMember(req.params.id, req.params.userId);
  if (!canEditTeam(myRole)) return res.status(403).json({ error: "Requires team admin/owner" });
  if (!target) return res.status(404).json({ error: "Member not found" });
  if (!canMutateMemberRole(myRole, target.role, req.params.userId === req.user?.id))
    return res.status(403).json({ error: "Not allowed" });
  const updated = await repo.updateTeamMember(req.params.id, req.params.userId, parsed.data.role);
  res.json(updated);
});

app.delete("/api/teams/:id/members/:userId", async (req, res) => {
  const myRole = await myTeamRole(req.user, req.params.id);
  if (!canEditTeam(myRole)) return res.status(403).json({ error: "Requires team admin/owner" });
  if (req.params.userId === req.user?.id)
    return res.status(400).json({ error: "Cannot remove yourself" });
  if (!(await repo.removeTeamMember(req.params.id, req.params.userId)))
    return res.status(404).json({ error: "Member not found" });
  res.status(204).send();
});

app.post("/api/teams/:id/invites", async (req, res) => {
  const parsed = CreateTeamInviteBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const role = await myTeamRole(req.user, req.params.id);
  if (!canEditTeam(role)) return res.status(403).json({ error: "Requires team admin/owner" });
  const invite = await repo.createInvite(
    req.params.id,
    parsed.data.email,
    parsed.data.role,
    req.user?.id || ""
  );
  res.status(201).json(invite);
});

app.get("/api/teams/:id/invites", async (req, res) => {
  const role = await myTeamRole(req.user, req.params.id);
  if (!canEditTeam(role)) return res.status(403).json({ error: "Requires team admin/owner" });
  res.json(await repo.listInvites(req.params.id));
});

app.delete("/api/teams/:id/invites/:inviteId", async (req, res) => {
  const role = await myTeamRole(req.user, req.params.id);
  if (!canEditTeam(role)) return res.status(403).json({ error: "Requires team admin/owner" });
  if (!(await repo.revokeInvite(req.params.id, req.params.inviteId)))
    return res.status(404).json({ error: "Invite not found" });
  res.status(204).send();
});

app.post("/api/invites/:token/accept", async (req, res) => {
  const member = await repo.acceptInvite(req.params.token, req.user?.id || "");
  if (!member) return res.status(400).json({ error: "Invite invalid, expired, or already used" });
  res.status(201).json(member);
});

app.delete("/api/teams/:id", async (req, res) => {
  const myRole = await myTeamRole(req.user, req.params.id);
  if (myRole !== "owner") return res.status(403).json({ error: "Requires team owner" });
  if (!(await repo.deleteTeam(req.params.id)))
    return res.status(404).json({ error: "Team not found" });
  res.status(204).send();
});

app.get("/api/projects", async (req, res) => {
  const projects = await repo.listProjects();
  const visible: any[] = [];
  for (const p of projects) {
    if (await canAccessProject(req.user, p)) visible.push(p);
  }
  res.json(visible);
});

app.post("/api/projects", async (req, res) => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.teamId) {
    const role = await myTeamRole(req.user, parsed.data.teamId);
    if (!canAssignTeam(role)) {
      return res.status(403).json({ error: "Only team admins/owners can create team projects" });
    }
  }
  const project = await repo.createProject(parsed.data.name, req.user?.id);
  if (parsed.data.teamId) await repo.updateProject(project.id, { teamId: parsed.data.teamId });
  res.status(201).json(await repo.getProject(project.id));
});

app.get("/api/projects/:id", async (req, res) => {
  const project = await repo.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (!(await canAccessProject(req.user, project)))
    return res.status(403).json({ error: "Access denied" });
  res.json(project);
});

app.put("/api/projects/:id", async (req, res) => {
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const project = await repo.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (!(await canAccessProject(req.user, project)))
    return res.status(403).json({ error: "Access denied" });
  if (parsed.data.teamId !== undefined) {
    if (parsed.data.teamId) {
      const role = await myTeamRole(req.user, parsed.data.teamId);
      if (!canAssignTeam(role, project.ownerId === req.user?.id))
        return res.status(403).json({ error: "Not allowed to assign this team" });
    }
  }
  const updated = await repo.updateProject(req.params.id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Project not found" });
  res.json(updated);
});

app.delete("/api/projects/:id", async (req, res) => {
  const project = await repo.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (!(await canAccessProject(req.user, project)))
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
  const patch: Record<string, unknown> = { ...(req.body || {}) };
  if (
    req.body?.cron !== undefined ||
    req.body?.intervalMinutes !== undefined
  ) {
    patch.nextRunAt = computeNextRunIso(
      (req.body.cron as string) ?? sch.cron,
      (req.body.intervalMinutes as number) ?? sch.intervalMinutes
    );
  }
  const updated = await repo.updateSchedule(req.params.id, patch);
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

// Overlap guard: a schedule that is still running won't be re-triggered.
const runningSchedules = new Set<string>();

async function triggerSchedule(sch: Schedule): Promise<void> {
  if (runningSchedules.has(sch.id)) return;
  const test = await repo.getTest(sch.testId);
  const env = await repo.getEnvironment(sch.environmentId);
  if (!test || !env) return;

  const run = await repo.createRun(test.id, env.id);
  trackRunStarted();
  runningSchedules.add(sch.id);
  console.log(`[scheduler] triggered schedule ${sch.id} → run ${run.id}`);

  await repo.updateSchedule(sch.id, {
    lastRunAt: new Date().toISOString(),
    runsCount: (sch.runsCount ?? 0) + 1,
  });

  runLocalTest(run.id, test, env)
    .then(() => notifyForRun(run.id))
    .catch(async (err: unknown) => {
      console.error("Scheduled run failed:", err);
      trackRunFinished();
      await repo.updateRun(run.id, {
        status: "error",
        error: String(err),
        finishedAt: new Date().toISOString(),
      });
      await notifyForRun(run.id);
    })
    .finally(async () => {
      runningSchedules.delete(sch.id);
      const finished = await repo.getRun(run.id);
      const status: "passed" | "failed" | "error" =
        finished?.status === "passed"
          ? "passed"
          : finished?.status === "error"
            ? "error"
            : "failed";
      const failedStep = (finished?.stepsResults || []).find(
        (r: { status: string }) => r.status === "failed"
      );
      const lastError =
        finished?.error ||
        failedStep?.error ||
        (status !== "passed" ? "Run finished with status " + status : undefined);
      const maxRetries = sch.maxRetries ?? 1;
      const retryCount = sch.retryCount ?? 0;
      if (status !== "passed" && retryCount < maxRetries) {
        // Automatic retry on next tick.
        await repo.updateSchedule(sch.id, {
          retryCount: retryCount + 1,
          lastRunStatus: status,
          lastError,
          nextRunAt: new Date().toISOString(),
        });
        console.log(
          `[scheduler] schedule ${sch.id} failed (${status}), retrying ${retryCount + 1}/${maxRetries}`
        );
      } else {
        await repo.updateSchedule(sch.id, {
          retryCount: 0,
          lastRunStatus: status,
          lastError: status !== "passed" ? lastError : undefined,
          nextRunAt: computeNextRunIso(sch.cron, sch.intervalMinutes),
        });
        console.log(`[scheduler] schedule ${sch.id} finished ${status}`);
      }
    });
}

setInterval(async () => {
  try {
    if (!(await acquireSchedulerLock())) return;
    const due = await repo.dueSchedules();
    for (const sch of due) {
      await triggerSchedule(sch);
    }
  } catch (err: unknown) {
    console.error("[scheduler] tick error", err);
  }
}, 30_000);

async function start() {
  if (useMongo) {
    try {
      await getMongo();
} catch (err: unknown) {
      console.error(
        "[db] MongoDB connection failed. Install MongoDB locally or set MONGODB_URL (Atlas).",
        err
      );
      process.exit(1);
    }
  }
  try {
    assertAdminKeyConfigured();
    assertAuthSafety();
  } catch (err: any) {
    console.error(err?.message || err);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`FlowGuard API listening on http://localhost:${PORT}`);
    console.log(`Docs: http://localhost:${PORT}/docs`);
    console.log(`database=${dbMode}`);
    console.log(`AUTH=${AUTH_DISABLED ? "disabled" : "enabled"}`);
    console.log(`USE_LOCAL_EXECUTION=${process.env.USE_LOCAL_EXECUTION ?? "true"}`);
    if (!process.env.ADMIN_KEY) {
      console.warn(
        "[admin] ADMIN_KEY not set — using default 'flowguard-admin' (dev only). Set ADMIN_KEY in production."
      );
    }
  });
}

start();

export { app };
