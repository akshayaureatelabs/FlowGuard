import { v4 as uuid } from "uuid";
import { computeNextRunIso } from "./schedule.js";
import type {
  Project,
  ProjectPatch,
  Environment,
  Test,
  TestRun,
  Step,
  Module,
  Schedule,
  TestSettings,
  Team,
  TeamMember,
  TeamRole,
  TeamInvite,
} from "@flowguard/shared";

const now = () => new Date().toISOString();

class MemoryStore {
  projects = new Map<string, Project>();
  environments = new Map<string, Environment>();
  tests = new Map<string, Test>();
  runs = new Map<string, TestRun>();
  modules = new Map<string, Module>();
  schedules = new Map<string, Schedule>();
  teams = new Map<string, Team>();
  teamMembers = new Map<string, TeamMember>();
  teamInvites = new Map<string, TeamInvite>();

  createProject(name: string, ownerId?: string): Project {
    const id = uuid();
    const project: Project = { id, name, ownerId, createdAt: now(), updatedAt: now() };
    this.projects.set(id, project);
    return project;
  }

  listProjects(): Project[] {
    return Array.from(this.projects.values());
  }

  getProject(id: string): Project | undefined {
    return this.projects.get(id);
  }

  updateProject(id: string, patch: ProjectPatch): Project | undefined {
    const project = this.projects.get(id);
    if (!project) return undefined;
    if (patch.name !== undefined) project.name = patch.name;
    if (patch.notifyEmail !== undefined) {
      project.notifyEmail = patch.notifyEmail || undefined;
    }
    if (patch.notifyWebhook !== undefined) {
      project.notifyWebhook = patch.notifyWebhook || undefined;
    }
    if (patch.teamId !== undefined) project.teamId = patch.teamId || undefined;
    project.updatedAt = now();
    this.projects.set(id, project);
    return project;
  }

  // Teams
  createTeam(name: string, ownerUserId: string): Team {
    const id = uuid();
    const team: Team = {
      id,
      name,
      createdBy: ownerUserId,
      createdAt: now(),
      updatedAt: now(),
    };
    this.teams.set(id, team);
    const memberId = uuid();
    this.teamMembers.set(memberId, {
      id: memberId,
      teamId: id,
      userId: ownerUserId,
      role: "owner",
      createdAt: now(),
    });
    return team;
  }

  listTeamsForUser(userId: string): { team: Team; role: TeamRole }[] {
    const roles = new Map<string, TeamRole>();
    for (const m of this.teamMembers.values()) {
      if (m.userId === userId) roles.set(m.teamId, m.role);
    }
    return Array.from(this.teams.values())
      .filter((t) => roles.has(t.id))
      .map((t) => ({ team: t, role: roles.get(t.id)! }));
  }

  listTeams(): Team[] {
    return Array.from(this.teams.values());
  }

  deleteTeam(id: string): boolean {
    if (!this.teams.has(id)) return false;
    this.teams.delete(id);
    for (const [mid, m] of this.teamMembers) {
      if (m.teamId === id) this.teamMembers.delete(mid);
    }
    for (const [iid, i] of this.teamInvites) {
      if (i.teamId === id) this.teamInvites.delete(iid);
    }
    for (const p of this.projects.values()) {
      if (p.teamId === id) p.teamId = undefined;
    }
    return true;
  }

  getTeam(id: string): Team | undefined {
    return this.teams.get(id);
  }

  listTeamMembers(teamId: string): TeamMember[] {
    return Array.from(this.teamMembers.values()).filter((m) => m.teamId === teamId);
  }

  getTeamMember(teamId: string, userId: string): TeamMember | undefined {
    return Array.from(this.teamMembers.values()).find(
      (m) => m.teamId === teamId && m.userId === userId
    );
  }

  async isTeamMember(teamId: string, userId: string): Promise<boolean> {
    return !!this.getTeamMember(teamId, userId);
  }

  addTeamMember(teamId: string, userId: string, role: TeamRole = "member"): TeamMember {
    const m: TeamMember = {
      id: uuid(),
      teamId,
      userId,
      role,
      createdAt: now(),
    };
    this.teamMembers.set(m.id, m);
    return m;
  }

  updateTeamMember(teamId: string, userId: string, role: TeamRole): TeamMember | undefined {
    const m = this.getTeamMember(teamId, userId);
    if (!m) return undefined;
    m.role = role;
    return m;
  }

  removeTeamMember(teamId: string, userId: string): boolean {
    const m = this.getTeamMember(teamId, userId);
    if (!m) return false;
    return this.teamMembers.delete(m.id);
  }

  createInvite(
    teamId: string,
    email: string,
    role: TeamRole,
    createdBy: string
  ): TeamInvite {
    const invite: TeamInvite = {
      id: uuid(),
      teamId,
      email,
      role,
      token: uuid().replace(/-/g, "").slice(0, 24),
      status: "pending",
      createdBy,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now(),
    };
    this.teamInvites.set(invite.id, invite);
    return invite;
  }

  listInvites(teamId: string): TeamInvite[] {
    return Array.from(this.teamInvites.values()).filter((i) => i.teamId === teamId);
  }

  getInviteByToken(token: string): TeamInvite | undefined {
    return Array.from(this.teamInvites.values()).find((i) => i.token === token);
  }

  acceptInvite(token: string, userId: string): TeamMember | undefined {
    const invite = this.getInviteByToken(token);
    if (!invite || invite.status !== "pending") return undefined;
    if (new Date(invite.expiresAt).getTime() < Date.now()) return undefined;
    invite.status = "accepted";
    const existing = this.getTeamMember(invite.teamId, userId);
    if (existing) return existing;
    return this.addTeamMember(invite.teamId, userId, invite.role);
  }

  revokeInvite(teamId: string, inviteId: string): boolean {
    const i = this.teamInvites.get(inviteId);
    if (!i || i.teamId !== teamId) return false;
    i.status = "revoked";
    return true;
  }

  deleteProject(id: string): boolean {
    if (!this.projects.has(id)) return false;
    this.projects.delete(id);
    for (const [eid, env] of this.environments) {
      if (env.projectId === id) this.environments.delete(eid);
    }
    for (const [tid, test] of this.tests) {
      if (test.projectId === id) {
        this.tests.delete(tid);
        for (const [rid, run] of this.runs) {
          if (run.testId === tid) this.runs.delete(rid);
        }
        for (const [sid, sch] of this.schedules) {
          if (sch.testId === tid) this.schedules.delete(sid);
        }
      }
    }
    for (const [mid, mod] of this.modules) {
      if (mod.projectId === id) this.modules.delete(mid);
    }
    return true;
  }

  createEnvironment(
    projectId: string,
    name: string,
    baseUrl: string,
    variables?: Record<string, string>
  ): Environment {
    const id = uuid();
    const env: Environment = {
      id,
      projectId,
      name,
      baseUrl,
      variables,
      createdAt: now(),
      updatedAt: now(),
    };
    this.environments.set(id, env);
    return env;
  }

  listEnvironments(projectId: string): Environment[] {
    return Array.from(this.environments.values()).filter(
      (e) => e.projectId === projectId
    );
  }

  getEnvironment(id: string): Environment | undefined {
    return this.environments.get(id);
  }

  updateEnvironment(
    id: string,
    data: { name?: string; baseUrl?: string; variables?: Record<string, string> }
  ): Environment | undefined {
    const env = this.environments.get(id);
    if (!env) return undefined;
    if (data.name !== undefined) env.name = data.name;
    if (data.baseUrl !== undefined) env.baseUrl = data.baseUrl;
    if (data.variables !== undefined) env.variables = data.variables;
    env.updatedAt = now();
    this.environments.set(id, env);
    return env;
  }

  deleteEnvironment(id: string): boolean {
    return this.environments.delete(id);
  }

  createTest(projectId: string, name: string): Test {
    const id = uuid();
    const test: Test = {
      id,
      projectId,
      name,
      steps: [],
      settings: { browser: "chrome", viewport: { width: 1280, height: 720 } },
      createdAt: now(),
      updatedAt: now(),
    };
    this.tests.set(id, test);
    return test;
  }

  listTests(projectId: string): Test[] {
    return Array.from(this.tests.values()).filter((t) => t.projectId === projectId);
  }

  getTest(id: string): Test | undefined {
    return this.tests.get(id);
  }

  updateTest(id: string, name: string): Test | undefined {
    const test = this.tests.get(id);
    if (!test) return undefined;
    test.name = name;
    test.updatedAt = now();
    this.tests.set(id, test);
    return test;
  }

  updateTestSettings(id: string, settings: TestSettings): Test | undefined {
    const test = this.tests.get(id);
    if (!test) return undefined;
    test.settings = { ...(test.settings || {}), ...settings };
    test.updatedAt = now();
    this.tests.set(id, test);
    return test;
  }

  deleteTest(id: string): boolean {
    if (!this.tests.has(id)) return false;
    this.tests.delete(id);
    for (const [rid, run] of this.runs) {
      if (run.testId === id) this.runs.delete(rid);
    }
    for (const [sid, sch] of this.schedules) {
      if (sch.testId === id) this.schedules.delete(sid);
    }
    return true;
  }

  updateSteps(testId: string, steps: Step[]): Test | undefined {
    const test = this.tests.get(testId);
    if (!test) return undefined;
    test.steps = steps;
    test.updatedAt = now();
    this.tests.set(testId, test);
    return test;
  }

  createRun(testId: string, environmentId: string): TestRun {
    const id = uuid();
    const run: TestRun = {
      id,
      testId,
      environmentId,
      status: "queued",
      stepsResults: [],
      createdAt: now(),
    };
    this.runs.set(id, run);
    return run;
  }

  getRun(id: string): TestRun | undefined {
    return this.runs.get(id);
  }

  updateRun(id: string, patch: Partial<TestRun>): TestRun | undefined {
    const run = this.runs.get(id);
    if (!run) return undefined;
    Object.assign(run, patch);
    this.runs.set(id, run);
    return run;
  }

  listRuns(testId?: string): TestRun[] {
    const all = Array.from(this.runs.values());
    return testId ? all.filter((r) => r.testId === testId) : all;
  }

  deleteRun(id: string): boolean {
    return this.runs.delete(id);
  }

  // Modules
  createModule(projectId: string, name: string): Module {
    const id = uuid();
    const mod: Module = {
      id,
      projectId,
      name,
      steps: [],
      createdAt: now(),
      updatedAt: now(),
    };
    this.modules.set(id, mod);
    return mod;
  }

  listModules(projectId: string): Module[] {
    return Array.from(this.modules.values()).filter((m) => m.projectId === projectId);
  }

  getModule(id: string): Module | undefined {
    return this.modules.get(id);
  }

  updateModuleSteps(id: string, steps: Step[]): Module | undefined {
    const mod = this.modules.get(id);
    if (!mod) return undefined;
    mod.steps = steps;
    mod.updatedAt = now();
    this.modules.set(id, mod);
    return mod;
  }

  deleteModule(id: string): boolean {
    return this.modules.delete(id);
  }

  // Schedules
  createSchedule(data: {
    testId: string;
    environmentId: string;
    intervalMinutes?: number;
    cron?: string;
    notifyEmail?: string;
    notifyWebhook?: string;
    enabled?: boolean;
    maxRetries?: number;
  }): Schedule {
    const id = uuid();
    const interval = data.intervalMinutes || 60;
    const sch: Schedule = {
      id,
      testId: data.testId,
      environmentId: data.environmentId,
      enabled: data.enabled ?? true,
      intervalMinutes: interval,
      cron: data.cron,
      notifyEmail: data.notifyEmail,
      notifyWebhook: data.notifyWebhook,
      maxRetries: data.maxRetries ?? 1,
      retryCount: 0,
      runsCount: 0,
      nextRunAt: computeNextRunIso(data.cron, interval),
      createdAt: now(),
      updatedAt: now(),
    };
    this.schedules.set(id, sch);
    return sch;
  }

  listSchedules(testId?: string): Schedule[] {
    const all = Array.from(this.schedules.values());
    return testId ? all.filter((s) => s.testId === testId) : all;
  }

  getSchedule(id: string): Schedule | undefined {
    return this.schedules.get(id);
  }

  updateSchedule(id: string, patch: Partial<Schedule>): Schedule | undefined {
    const sch = this.schedules.get(id);
    if (!sch) return undefined;
    Object.assign(sch, patch, { updatedAt: now() });
    this.schedules.set(id, sch);
    return sch;
  }

  deleteSchedule(id: string): boolean {
    return this.schedules.delete(id);
  }

  dueSchedules(): Schedule[] {
    const t = Date.now();
    return Array.from(this.schedules.values()).filter(
      (s) =>
        s.enabled &&
        s.nextRunAt &&
        new Date(s.nextRunAt).getTime() <= t
    );
  }
}

export const store = new MemoryStore();
