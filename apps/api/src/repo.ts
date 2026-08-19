import { createRequire } from "module";
import { useMongo, usePostgres } from "./db.js";
import { store as memoryStore } from "./store.js";
import type {
  Project,
  ProjectPatch,
  TestRun,
  Step,
  Schedule,
  TestSettings,
} from "@flowguard/shared";

const nodeRequire = createRequire(__filename);

/** Unified async data access — mongo | postgres | memory. */
class MemoryAsync {
  createProject(name: string, ownerId?: string) {
    return Promise.resolve(memoryStore.createProject(name, ownerId));
  }
  listProjects(): Promise<Project[]> {
    return Promise.resolve(memoryStore.listProjects());
  }
  getProject(id: string) {
    return Promise.resolve(memoryStore.getProject(id));
  }
  updateProject(id: string, patch: ProjectPatch) {
    return Promise.resolve(memoryStore.updateProject(id, patch));
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
  deleteRun(id: string) {
    return Promise.resolve(memoryStore.deleteRun(id));
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
    maxRetries?: number;
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
  createTeam(name: string, ownerUserId: string) {
    return Promise.resolve(memoryStore.createTeam(name, ownerUserId));
  }
  listTeamsForUser(userId: string) {
    return Promise.resolve(memoryStore.listTeamsForUser(userId));
  }
  listTeams() {
    return Promise.resolve(memoryStore.listTeams());
  }
  getTeam(id: string) {
    return Promise.resolve(memoryStore.getTeam(id));
  }
  deleteTeam(id: string) {
    return Promise.resolve(memoryStore.deleteTeam(id));
  }
  listTeamMembers(teamId: string) {
    return Promise.resolve(memoryStore.listTeamMembers(teamId));
  }
  getTeamMember(teamId: string, userId: string) {
    return Promise.resolve(memoryStore.getTeamMember(teamId, userId));
  }
  isTeamMember(teamId: string, userId: string) {
    return Promise.resolve(memoryStore.isTeamMember(teamId, userId));
  }
  addTeamMember(teamId: string, userId: string, role: import("@flowguard/shared").TeamRole) {
    return Promise.resolve(memoryStore.addTeamMember(teamId, userId, role));
  }
  updateTeamMember(teamId: string, userId: string, role: import("@flowguard/shared").TeamRole) {
    return Promise.resolve(memoryStore.updateTeamMember(teamId, userId, role));
  }
  removeTeamMember(teamId: string, userId: string) {
    return Promise.resolve(memoryStore.removeTeamMember(teamId, userId));
  }
  createInvite(
    teamId: string,
    email: string,
    role: import("@flowguard/shared").TeamRole,
    createdBy: string
  ) {
    return Promise.resolve(memoryStore.createInvite(teamId, email, role, createdBy));
  }
  listInvites(teamId: string) {
    return Promise.resolve(memoryStore.listInvites(teamId));
  }
  getInviteByToken(token: string) {
    return Promise.resolve(memoryStore.getInviteByToken(token));
  }
  acceptInvite(token: string, userId: string) {
    return Promise.resolve(memoryStore.acceptInvite(token, userId));
  }
  revokeInvite(teamId: string, inviteId: string) {
    return Promise.resolve(memoryStore.revokeInvite(teamId, inviteId));
  }
}

function createRepo() {
  if (useMongo) {
    const { MongoStore } = nodeRequire("./mongo-store.js");
    return new MongoStore();
  }
  if (usePostgres) {
    const { PrismaStore } = nodeRequire("./prisma-store.js");
    return new PrismaStore();
  }
  return new MemoryAsync();
}

export const repo = createRepo();
