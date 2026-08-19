import { v4 as uuid } from "uuid";
import { getMongo } from "./db.js";
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

async function col(name: string) {
  const db = await getMongo();
  if (!db) throw new Error("MongoDB not enabled (USE_DATABASE=mongo)");
  return db.collection(name);
}

function now() {
  return new Date().toISOString();
}

export class MongoStore {
  async createProject(name: string): Promise<Project> {
    const p: Project = {
      id: uuid(),
      name,
      createdAt: now(),
      updatedAt: now(),
    };
    await (await col("projects")).insertOne({ ...p });
    return p;
  }
  async listProjects(): Promise<Project[]> {
    return (await (await col("projects")).find({}).sort({ createdAt: -1 }).toArray()).map(
      stripId
    ) as Project[];
  }
  async getProject(id: string): Promise<Project | undefined> {
    const p = await (await col("projects")).findOne({ id });
    return p ? (stripId(p) as Project) : undefined;
  }
  async updateProject(id: string, name: string): Promise<Project | undefined> {
    const r = await (await col("projects")).findOneAndUpdate(
      { id },
      { $set: { name, updatedAt: now() } },
      { returnDocument: "after" }
    );
    return r ? (stripId(r) as Project) : undefined;
  }
  async deleteProject(id: string): Promise<boolean> {
    await (await col("environments")).deleteMany({ projectId: id });
    await (await col("tests")).deleteMany({ projectId: id });
    await (await col("modules")).deleteMany({ projectId: id });
    const r = await (await col("projects")).deleteOne({ id });
    return r.deletedCount > 0;
  }

  async createEnvironment(
    projectId: string,
    name: string,
    baseUrl: string,
    variables?: Record<string, string>
  ): Promise<Environment> {
    const e: Environment = {
      id: uuid(),
      projectId,
      name,
      baseUrl,
      variables,
      createdAt: now(),
      updatedAt: now(),
    };
    await (await col("environments")).insertOne({ ...e });
    return e;
  }
  async listEnvironments(projectId: string): Promise<Environment[]> {
    return (
      await (await col("environments")).find({ projectId }).toArray()
    ).map(stripId) as Environment[];
  }
  async getEnvironment(id: string): Promise<Environment | undefined> {
    const e = await (await col("environments")).findOne({ id });
    return e ? (stripId(e) as Environment) : undefined;
  }
  async updateEnvironment(
    id: string,
    data: { name?: string; baseUrl?: string; variables?: Record<string, string> }
  ): Promise<Environment | undefined> {
    const r = await (await col("environments")).findOneAndUpdate(
      { id },
      { $set: { ...data, updatedAt: now() } },
      { returnDocument: "after" }
    );
    return r ? (stripId(r) as Environment) : undefined;
  }
  async deleteEnvironment(id: string): Promise<boolean> {
    const r = await (await col("environments")).deleteOne({ id });
    return r.deletedCount > 0;
  }

  async createTest(projectId: string, name: string): Promise<Test> {
    const t: Test = {
      id: uuid(),
      projectId,
      name,
      steps: [],
      settings: { browser: "chrome", viewport: { width: 1280, height: 720 } },
      createdAt: now(),
      updatedAt: now(),
    };
    await (await col("tests")).insertOne({ ...t });
    return t;
  }
  async listTests(projectId: string): Promise<Test[]> {
    return (await (await col("tests")).find({ projectId }).toArray()).map(stripId) as Test[];
  }
  async getTest(id: string): Promise<Test | undefined> {
    const t = await (await col("tests")).findOne({ id });
    return t ? (stripId(t) as Test) : undefined;
  }
  async updateTest(id: string, name: string): Promise<Test | undefined> {
    const r = await (await col("tests")).findOneAndUpdate(
      { id },
      { $set: { name, updatedAt: now() } },
      { returnDocument: "after" }
    );
    return r ? (stripId(r) as Test) : undefined;
  }
  async updateTestSettings(id: string, settings: TestSettings): Promise<Test | undefined> {
    const existing = await this.getTest(id);
    if (!existing) return undefined;
    const merged = { ...(existing.settings || {}), ...settings };
    const r = await (await col("tests")).findOneAndUpdate(
      { id },
      { $set: { settings: merged, updatedAt: now() } },
      { returnDocument: "after" }
    );
    return r ? (stripId(r) as Test) : undefined;
  }
  async deleteTest(id: string): Promise<boolean> {
    await (await col("runs")).deleteMany({ testId: id });
    await (await col("schedules")).deleteMany({ testId: id });
    const r = await (await col("tests")).deleteOne({ id });
    return r.deletedCount > 0;
  }
  async updateSteps(testId: string, steps: Step[]): Promise<Test | undefined> {
    const r = await (await col("tests")).findOneAndUpdate(
      { id: testId },
      { $set: { steps, updatedAt: now() } },
      { returnDocument: "after" }
    );
    return r ? (stripId(r) as Test) : undefined;
  }

  async createRun(testId: string, environmentId: string): Promise<TestRun> {
    const run: TestRun = {
      id: uuid(),
      testId,
      environmentId,
      status: "queued",
      stepsResults: [],
      createdAt: now(),
    };
    await (await col("runs")).insertOne({ ...run });
    return run;
  }
  async getRun(id: string): Promise<TestRun | undefined> {
    const r = await (await col("runs")).findOne({ id });
    return r ? (stripId(r) as TestRun) : undefined;
  }
  async updateRun(id: string, patch: Partial<TestRun>): Promise<TestRun | undefined> {
    const r = await (await col("runs")).findOneAndUpdate(
      { id },
      { $set: { ...patch } },
      { returnDocument: "after" }
    );
    return r ? (stripId(r) as TestRun) : undefined;
  }
  async listRuns(testId?: string): Promise<TestRun[]> {
    const q = testId ? { testId } : {};
    return (
      await (await col("runs")).find(q).sort({ createdAt: -1 }).toArray()
    ).map(stripId) as TestRun[];
  }

  async createModule(projectId: string, name: string): Promise<Module> {
    const m: Module = {
      id: uuid(),
      projectId,
      name,
      steps: [],
      createdAt: now(),
      updatedAt: now(),
    };
    await (await col("modules")).insertOne({ ...m });
    return m;
  }
  async listModules(projectId: string): Promise<Module[]> {
    return (
      await (await col("modules")).find({ projectId }).toArray()
    ).map(stripId) as Module[];
  }
  async getModule(id: string): Promise<Module | undefined> {
    const m = await (await col("modules")).findOne({ id });
    return m ? (stripId(m) as Module) : undefined;
  }
  async updateModuleSteps(id: string, steps: Step[]): Promise<Module | undefined> {
    const r = await (await col("modules")).findOneAndUpdate(
      { id },
      { $set: { steps, updatedAt: now() } },
      { returnDocument: "after" }
    );
    return r ? (stripId(r) as Module) : undefined;
  }
  async deleteModule(id: string): Promise<boolean> {
    const r = await (await col("modules")).deleteOne({ id });
    return r.deletedCount > 0;
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
    const s: Schedule = {
      id: uuid(),
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
    await (await col("schedules")).insertOne({ ...s });
    return s;
  }
  async listSchedules(testId?: string): Promise<Schedule[]> {
    const q = testId ? { testId } : {};
    return (await (await col("schedules")).find(q).toArray()).map(stripId) as Schedule[];
  }
  async getSchedule(id: string): Promise<Schedule | undefined> {
    const s = await (await col("schedules")).findOne({ id });
    return s ? (stripId(s) as Schedule) : undefined;
  }
  async updateSchedule(id: string, patch: Partial<Schedule>): Promise<Schedule | undefined> {
    const { id: _i, createdAt: _c, ...rest } = patch as any;
    const r = await (await col("schedules")).findOneAndUpdate(
      { id },
      { $set: { ...rest, updatedAt: now() } },
      { returnDocument: "after" }
    );
    return r ? (stripId(r) as Schedule) : undefined;
  }
  async deleteSchedule(id: string): Promise<boolean> {
    const r = await (await col("schedules")).deleteOne({ id });
    return r.deletedCount > 0;
  }
  async dueSchedules(): Promise<Schedule[]> {
    const nowIso = now();
    return (
      await (await col("schedules"))
        .find({ enabled: true, nextRunAt: { $lte: nowIso } })
        .toArray()
    ).map(stripId) as Schedule[];
  }
}

function stripId(doc: any) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}
