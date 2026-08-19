import { getPrisma } from "./db.js";
import { computeNextRun } from "./schedule.js";
import { v4 as uuid } from "uuid";
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

function prisma() {
  const p = getPrisma();
  if (!p) throw new Error("USE_DATABASE is not true");
  return p;
}

function toIso(d: Date | string) {
  return typeof d === "string" ? d : d.toISOString();
}

  function mapProject(p: any): Project {
    return {
      id: p.id,
      name: p.name,
      ...(p.ownerId ? { ownerId: p.ownerId } : {}),
      ...(p.teamId ? { teamId: p.teamId } : {}),
      createdAt: toIso(p.createdAt),
      updatedAt: toIso(p.updatedAt),
    };
  }

function mapTeam(t: any): Team {
  return {
    id: t.id,
    name: t.name,
    createdBy: t.createdBy,
    createdAt: toIso(t.createdAt),
    updatedAt: toIso(t.updatedAt),
  };
}

function mapMember(m: any): TeamMember {
  return {
    id: m.id,
    teamId: m.teamId,
    userId: m.userId,
    role: m.role,
    createdAt: toIso(m.createdAt),
  };
}

function mapInvite(i: any): TeamInvite {
  return {
    id: i.id,
    teamId: i.teamId,
    email: i.email,
    role: i.role,
    token: i.token,
    status: i.status,
    createdBy: i.createdBy,
    expiresAt: toIso(i.expiresAt),
    createdAt: toIso(i.createdAt),
  };
}

function mapEnv(e: any): Environment {
  return {
    id: e.id,
    projectId: e.projectId,
    name: e.name,
    baseUrl: e.baseUrl,
    variables: (e.variables as Record<string, string>) || undefined,
    createdAt: toIso(e.createdAt),
    updatedAt: toIso(e.updatedAt),
  };
}

function mapTest(t: any): Test {
  return {
    id: t.id,
    projectId: t.projectId,
    name: t.name,
    steps: (t.steps as Step[]) || [],
    settings: (t.settings as TestSettings) || undefined,
    createdAt: toIso(t.createdAt),
    updatedAt: toIso(t.updatedAt),
  };
}

function mapModule(m: any): Module {
  return {
    id: m.id,
    projectId: m.projectId,
    name: m.name,
    steps: (m.steps as Step[]) || [],
    createdAt: toIso(m.createdAt),
    updatedAt: toIso(m.updatedAt),
  };
}

function mapRun(r: any): TestRun {
  return {
    id: r.id,
    testId: r.testId,
    environmentId: r.environmentId,
    status: r.status,
    startedAt: r.startedAt ? toIso(r.startedAt) : undefined,
    finishedAt: r.finishedAt ? toIso(r.finishedAt) : undefined,
    stepsResults: (r.stepsResults as any[]) || [],
    artifacts: (r.artifacts as any) || undefined,
    error: r.error || undefined,
    createdAt: toIso(r.createdAt),
  };
}

function mapSchedule(s: any): Schedule {
  return {
    id: s.id,
    testId: s.testId,
    environmentId: s.environmentId,
    enabled: s.enabled,
    intervalMinutes: s.intervalMinutes ?? undefined,
    cron: s.cron ?? undefined,
    notifyEmail: s.notifyEmail ?? undefined,
    notifyWebhook: s.notifyWebhook ?? undefined,
    maxRetries: s.maxRetries ?? 1,
    retryCount: s.retryCount ?? 0,
    lastRunStatus: s.lastRunStatus ?? undefined,
    lastError: s.lastError ?? undefined,
    runsCount: s.runsCount ?? 0,
    lastRunAt: s.lastRunAt ? toIso(s.lastRunAt) : undefined,
    nextRunAt: s.nextRunAt ? toIso(s.nextRunAt) : undefined,
    createdAt: toIso(s.createdAt),
    updatedAt: toIso(s.updatedAt),
  };
}

export class PrismaStore {
  async createProject(name: string, ownerId?: string): Promise<Project> {
    return mapProject(
      await prisma().project.create({ data: { name, ...(ownerId ? { ownerId } : {}) } })
    );
  }
  async listProjects(): Promise<Project[]> {
    return (await prisma().project.findMany({ orderBy: { createdAt: "desc" } })).map(mapProject);
  }
  async getProject(id: string): Promise<Project | undefined> {
    const p = await prisma().project.findUnique({ where: { id } });
    return p ? mapProject(p) : undefined;
  }
  async updateProject(id: string, patch: ProjectPatch): Promise<Project | undefined> {
    try {
      const data: Record<string, unknown> = {};
      if (patch.name !== undefined) data.name = patch.name;
      if (patch.notifyEmail !== undefined) data.notifyEmail = patch.notifyEmail || null;
      if (patch.notifyWebhook !== undefined) data.notifyWebhook = patch.notifyWebhook || null;
      if (patch.teamId !== undefined) data.teamId = patch.teamId || null;
      return mapProject(await prisma().project.update({ where: { id }, data }));
    } catch {
      return undefined;
    }
  }

  // Teams
  async createTeam(name: string, ownerUserId: string): Promise<Team> {
    const team = await prisma().team.create({
      data: {
        name,
        createdBy: ownerUserId,
        members: { create: { userId: ownerUserId, role: "owner" } },
      },
    });
    return mapTeam(team);
  }
  async listTeamsForUser(userId: string): Promise<{ team: Team; role: TeamRole }[]> {
    const rows = await prisma().team.findMany({
      where: { members: { some: { userId } } },
      include: { members: { where: { userId } } },
    });
    return rows.map((t: any) => ({
      team: mapTeam(t),
      role: (t.members?.[0]?.role as TeamRole) ?? "member",
    }));
  }
  async listTeams(): Promise<Team[]> {
    return (await prisma().team.findMany({ orderBy: { createdAt: "desc" } })).map(mapTeam);
  }
  async getTeam(id: string): Promise<Team | undefined> {
    const t = await prisma().team.findUnique({ where: { id } });
    return t ? mapTeam(t) : undefined;
  }
  async deleteTeam(id: string): Promise<boolean> {
    try {
      await prisma().team.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }
  async listTeamMembers(teamId: string): Promise<TeamMember[]> {
    return (await prisma().teamMember.findMany({ where: { teamId } })).map(mapMember);
  }
  async getTeamMember(teamId: string, userId: string): Promise<TeamMember | undefined> {
    const m = await prisma().teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    return m ? mapMember(m) : undefined;
  }
  async isTeamMember(teamId: string, userId: string): Promise<boolean> {
    return !!(await this.getTeamMember(teamId, userId));
  }
  async addTeamMember(
    teamId: string,
    userId: string,
    role: TeamRole = "member"
  ): Promise<TeamMember> {
    return mapMember(
      await prisma().teamMember.create({ data: { teamId, userId, role } })
    );
  }
  async updateTeamMember(
    teamId: string,
    userId: string,
    role: TeamRole
  ): Promise<TeamMember | undefined> {
    try {
      return mapMember(
        await prisma().teamMember.update({
          where: { teamId_userId: { teamId, userId } },
          data: { role },
        })
      );
    } catch {
      return undefined;
    }
  }
  async removeTeamMember(teamId: string, userId: string): Promise<boolean> {
    try {
      await prisma().teamMember.delete({
        where: { teamId_userId: { teamId, userId } },
      });
      return true;
    } catch {
      return false;
    }
  }
  async createInvite(
    teamId: string,
    email: string,
    role: TeamRole,
    createdBy: string
  ): Promise<TeamInvite> {
    const invite = await prisma().invite.create({
      data: {
        teamId,
        email,
        role,
        token: uuid().replace(/-/g, "").slice(0, 24),
        createdBy,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: "pending",
      },
    });
    return mapInvite(invite);
  }
  async listInvites(teamId: string): Promise<TeamInvite[]> {
    return (
      await prisma().invite.findMany({ where: { teamId }, orderBy: { createdAt: "desc" } })
    ).map(mapInvite);
  }
  async getInviteByToken(token: string): Promise<TeamInvite | undefined> {
    const i = await prisma().invite.findUnique({ where: { token } });
    return i ? mapInvite(i) : undefined;
  }
  async acceptInvite(token: string, userId: string): Promise<TeamMember | undefined> {
    const invite = await prisma().invite.findUnique({ where: { token } });
    if (!invite || invite.status !== "pending") return undefined;
    if (new Date(invite.expiresAt).getTime() < Date.now()) return undefined;
    const updated = await prisma().invite.update({
      where: { id: invite.id },
      data: { status: "accepted" },
    });
    void updated;
    const existing = await this.getTeamMember(invite.teamId, userId);
    if (existing) return existing;
    return mapMember(
      await prisma().teamMember.create({
        data: { teamId: invite.teamId, userId, role: invite.role },
      })
    );
  }
  async revokeInvite(teamId: string, inviteId: string): Promise<boolean> {
    try {
      await prisma().invite.update({
        where: { id: inviteId, teamId },
        data: { status: "revoked" },
      });
      return true;
    } catch {
      return false;
    }
  }
  async deleteProject(id: string): Promise<boolean> {
    try {
      await prisma().project.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async createEnvironment(
    projectId: string,
    name: string,
    baseUrl: string,
    variables?: Record<string, string>
  ): Promise<Environment> {
    return mapEnv(
      await prisma().environment.create({
        data: { projectId, name, baseUrl, variables: variables || {} },
      })
    );
  }
  async listEnvironments(projectId: string): Promise<Environment[]> {
    return (await prisma().environment.findMany({ where: { projectId } })).map(mapEnv);
  }
  async getEnvironment(id: string): Promise<Environment | undefined> {
    const e = await prisma().environment.findUnique({ where: { id } });
    return e ? mapEnv(e) : undefined;
  }
  async updateEnvironment(
    id: string,
    data: { name?: string; baseUrl?: string; variables?: Record<string, string> }
  ): Promise<Environment | undefined> {
    try {
      return mapEnv(await prisma().environment.update({ where: { id }, data }));
    } catch {
      return undefined;
    }
  }
  async deleteEnvironment(id: string): Promise<boolean> {
    try {
      await prisma().environment.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async createTest(projectId: string, name: string): Promise<Test> {
    return mapTest(
      await prisma().test.create({
        data: {
          projectId,
          name,
          steps: [],
          settings: { browser: "chrome", viewport: { width: 1280, height: 720 } },
        },
      })
    );
  }
  async listTests(projectId: string): Promise<Test[]> {
    return (await prisma().test.findMany({ where: { projectId } })).map(mapTest);
  }
  async getTest(id: string): Promise<Test | undefined> {
    const t = await prisma().test.findUnique({ where: { id } });
    return t ? mapTest(t) : undefined;
  }
  async updateTest(id: string, name: string): Promise<Test | undefined> {
    try {
      return mapTest(await prisma().test.update({ where: { id }, data: { name } }));
    } catch {
      return undefined;
    }
  }
  async updateTestSettings(id: string, settings: TestSettings): Promise<Test | undefined> {
    try {
      const existing = await prisma().test.findUnique({ where: { id } });
      if (!existing) return undefined;
      const merged = { ...((existing.settings as object) || {}), ...settings };
      return mapTest(
        await prisma().test.update({ where: { id }, data: { settings: merged } })
      );
    } catch {
      return undefined;
    }
  }
  async deleteTest(id: string): Promise<boolean> {
    try {
      await prisma().test.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }
  async updateSteps(testId: string, steps: Step[]): Promise<Test | undefined> {
    try {
      return mapTest(
        await prisma().test.update({ where: { id: testId }, data: { steps: steps as any } })
      );
    } catch {
      return undefined;
    }
  }

  async createRun(testId: string, environmentId: string): Promise<TestRun> {
    return mapRun(
      await prisma().testRun.create({
        data: { testId, environmentId, status: "queued", stepsResults: [] },
      })
    );
  }
  async getRun(id: string): Promise<TestRun | undefined> {
    const r = await prisma().testRun.findUnique({ where: { id } });
    return r ? mapRun(r) : undefined;
  }
  async updateRun(id: string, patch: Partial<TestRun>): Promise<TestRun | undefined> {
    try {
      const data: any = {};
      if (patch.status !== undefined) data.status = patch.status;
      if (patch.startedAt !== undefined) data.startedAt = new Date(patch.startedAt);
      if (patch.finishedAt !== undefined) data.finishedAt = new Date(patch.finishedAt);
      if (patch.stepsResults !== undefined) data.stepsResults = patch.stepsResults;
      if (patch.artifacts !== undefined) data.artifacts = patch.artifacts;
      if (patch.error !== undefined) data.error = patch.error;
      return mapRun(await prisma().testRun.update({ where: { id }, data }));
    } catch {
      return undefined;
    }
  }
  async listRuns(testId?: string): Promise<TestRun[]> {
    const rows = await prisma().testRun.findMany({
      where: testId ? { testId } : undefined,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapRun);
  }
  async deleteRun(id: string): Promise<boolean> {
    try {
      await prisma().testRun.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async createModule(projectId: string, name: string): Promise<Module> {
    return mapModule(
      await prisma().module.create({ data: { projectId, name, steps: [] } })
    );
  }
  async listModules(projectId: string): Promise<Module[]> {
    return (await prisma().module.findMany({ where: { projectId } })).map(mapModule);
  }
  async getModule(id: string): Promise<Module | undefined> {
    const m = await prisma().module.findUnique({ where: { id } });
    return m ? mapModule(m) : undefined;
  }
  async updateModuleSteps(id: string, steps: Step[]): Promise<Module | undefined> {
    try {
      return mapModule(
        await prisma().module.update({ where: { id }, data: { steps: steps as any } })
      );
    } catch {
      return undefined;
    }
  }
  async deleteModule(id: string): Promise<boolean> {
    try {
      await prisma().module.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async createSchedule(data: {
    testId: string;
    environmentId: string;
    intervalMinutes?: number;
    cron?: string;
    notifyEmail?: string;
    notifyWebhook?: string;
    enabled?: boolean;
    maxRetries?: number;
  }): Promise<Schedule> {
    const interval = data.intervalMinutes || 60;
    return mapSchedule(
      await prisma().schedule.create({
        data: {
          testId: data.testId,
          environmentId: data.environmentId,
          enabled: data.enabled ?? true,
          intervalMinutes: interval,
          cron: data.cron,
          notifyEmail: data.notifyEmail,
          notifyWebhook: data.notifyWebhook,
          maxRetries: data.maxRetries ?? 1,
          nextRunAt: computeNextRun(data.cron, interval),
        },
      })
    );
  }
  async listSchedules(testId?: string): Promise<Schedule[]> {
    const rows = await prisma().schedule.findMany({
      where: testId ? { testId } : undefined,
    });
    return rows.map(mapSchedule);
  }
  async getSchedule(id: string): Promise<Schedule | undefined> {
    const s = await prisma().schedule.findUnique({ where: { id } });
    return s ? mapSchedule(s) : undefined;
  }
  async updateSchedule(id: string, patch: Partial<Schedule>): Promise<Schedule | undefined> {
    try {
      const data: any = { ...patch };
      if (patch.lastRunAt) data.lastRunAt = new Date(patch.lastRunAt);
      if (patch.nextRunAt) data.nextRunAt = new Date(patch.nextRunAt);
      delete data.id;
      delete data.createdAt;
      delete data.updatedAt;
      return mapSchedule(await prisma().schedule.update({ where: { id }, data }));
    } catch {
      return undefined;
    }
  }
  async deleteSchedule(id: string): Promise<boolean> {
    try {
      await prisma().schedule.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }
  async dueSchedules(): Promise<Schedule[]> {
    const rows = await prisma().schedule.findMany({
      where: { enabled: true, nextRunAt: { lte: new Date() } },
    });
    return rows.map(mapSchedule);
  }
}
