import { getPrisma } from "./db.js";
import type {
  Project,
  Environment,
  Test,
  TestRun,
  Step,
  Module,
  Schedule,
  TestSettings,
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
      createdAt: toIso(p.createdAt),
      updatedAt: toIso(p.updatedAt),
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
  async updateProject(id: string, name: string): Promise<Project | undefined> {
    try {
      return mapProject(await prisma().project.update({ where: { id }, data: { name } }));
    } catch {
      return undefined;
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
          nextRunAt: new Date(Date.now() + interval * 60_000),
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
