import { v4 as uuid } from "uuid";
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

const now = () => new Date().toISOString();

class MemoryStore {
  projects = new Map<string, Project>();
  environments = new Map<string, Environment>();
  tests = new Map<string, Test>();
  runs = new Map<string, TestRun>();
  modules = new Map<string, Module>();
  schedules = new Map<string, Schedule>();

  createProject(name: string): Project {
    const id = uuid();
    const project: Project = { id, name, createdAt: now(), updatedAt: now() };
    this.projects.set(id, project);
    return project;
  }

  listProjects(): Project[] {
    return Array.from(this.projects.values());
  }

  getProject(id: string): Project | undefined {
    return this.projects.get(id);
  }

  updateProject(id: string, name: string): Project | undefined {
    const project = this.projects.get(id);
    if (!project) return undefined;
    project.name = name;
    project.updatedAt = now();
    this.projects.set(id, project);
    return project;
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
      nextRunAt: new Date(Date.now() + interval * 60_000).toISOString(),
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
