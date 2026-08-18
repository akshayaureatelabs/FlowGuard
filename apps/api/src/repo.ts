import { createRequire } from "module";
import { useDatabase } from "./db.js";
import { store as memoryStore } from "./store.js";
import type {
  TestRun,
  Step,
  Schedule,
  TestSettings,
} from "@flowguard/shared";

const require = createRequire(import.meta.url);

/** Unified async data access — Prisma when USE_DATABASE=true, else memory. */
class MemoryAsync {
  createProject(name: string) {
    return Promise.resolve(memoryStore.createProject(name));
  }
  listProjects() {
    return Promise.resolve(memoryStore.listProjects());
  }
  getProject(id: string) {
    return Promise.resolve(memoryStore.getProject(id));
  }
  updateProject(id: string, name: string) {
    return Promise.resolve(memoryStore.updateProject(id, name));
  }
  deleteProject(id: string) {
    return Promise.resolve(memoryStore.deleteProject(id));
  }
  createEnvironment(
    projectId: string,
    name: string,
    baseUrl: string,
    variables?: Record<string, string>
  ) {
    return Promise.resolve(
      memoryStore.createEnvironment(projectId, name, baseUrl, variables)
    );
  }
  listEnvironments(projectId: string) {
    return Promise.resolve(memoryStore.listEnvironments(projectId));
  }
  getEnvironment(id: string) {
    return Promise.resolve(memoryStore.getEnvironment(id));
  }
  updateEnvironment(
    id: string,
    data: { name?: string; baseUrl?: string; variables?: Record<string, string> }
  ) {
    return Promise.resolve(memoryStore.updateEnvironment(id, data));
  }
  deleteEnvironment(id: string) {
    return Promise.resolve(memoryStore.deleteEnvironment(id));
  }
  createTest(projectId: string, name: string) {
    return Promise.resolve(memoryStore.createTest(projectId, name));
  }
  listTests(projectId: string) {
    return Promise.resolve(memoryStore.listTests(projectId));
  }
  getTest(id: string) {
    return Promise.resolve(memoryStore.getTest(id));
  }
  updateTest(id: string, name: string) {
    return Promise.resolve(memoryStore.updateTest(id, name));
  }
  updateTestSettings(id: string, settings: TestSettings) {
    return Promise.resolve(memoryStore.updateTestSettings(id, settings));
  }
  deleteTest(id: string) {
    return Promise.resolve(memoryStore.deleteTest(id));
  }
  updateSteps(testId: string, steps: Step[]) {
    return Promise.resolve(memoryStore.updateSteps(testId, steps));
  }
  createRun(testId: string, environmentId: string) {
    return Promise.resolve(memoryStore.createRun(testId, environmentId));
  }
  getRun(id: string) {
    return Promise.resolve(memoryStore.getRun(id));
  }
  updateRun(id: string, patch: Partial<TestRun>) {
    return Promise.resolve(memoryStore.updateRun(id, patch));
  }
  listRuns(testId?: string) {
    return Promise.resolve(memoryStore.listRuns(testId));
  }
  createModule(projectId: string, name: string) {
    return Promise.resolve(memoryStore.createModule(projectId, name));
  }
  listModules(projectId: string) {
    return Promise.resolve(memoryStore.listModules(projectId));
  }
  getModule(id: string) {
    return Promise.resolve(memoryStore.getModule(id));
  }
  updateModuleSteps(id: string, steps: Step[]) {
    return Promise.resolve(memoryStore.updateModuleSteps(id, steps));
  }
  deleteModule(id: string) {
    return Promise.resolve(memoryStore.deleteModule(id));
  }
  createSchedule(data: {
    testId: string;
    environmentId: string;
    intervalMinutes?: number;
    cron?: string;
    notifyEmail?: string;
    notifyWebhook?: string;
    enabled?: boolean;
  }) {
    return Promise.resolve(memoryStore.createSchedule(data));
  }
  listSchedules(testId?: string) {
    return Promise.resolve(memoryStore.listSchedules(testId));
  }
  getSchedule(id: string) {
    return Promise.resolve(memoryStore.getSchedule(id));
  }
  updateSchedule(id: string, patch: Partial<Schedule>) {
    return Promise.resolve(memoryStore.updateSchedule(id, patch));
  }
  deleteSchedule(id: string) {
    return Promise.resolve(memoryStore.deleteSchedule(id));
  }
  dueSchedules() {
    return Promise.resolve(memoryStore.dueSchedules());
  }
}

function createRepo() {
  if (useDatabase) {
    const { PrismaStore } = require("./prisma-store.js");
    return new PrismaStore();
  }
  return new MemoryAsync();
}

export const repo = createRepo();
