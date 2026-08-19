import { authHeaders, clearSession } from "./auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const ADMIN_KEY_STORAGE = "fg_admin_key";

export function getAdminKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ADMIN_KEY_STORAGE);
}

export function setAdminKey(key: string): void {
  localStorage.setItem(ADMIN_KEY_STORAGE, key);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(options?.headers || {}),
    },
  });
  if (res.status === 401) {
    clearSession();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : body.error
        ? JSON.stringify(body.error)
        : res.statusText
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Resolve API-origin artifact paths (e.g. /artifacts/run/final.png) to an absolute URL. */
export function resolveArtifact(url?: string): string | undefined {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API}${url.startsWith("/") ? url : `/${url}`}`;
}

export const api = {
  register: (data: { email: string; password: string; name?: string }) =>
    request<any>("/api/auth/register", { method: "POST", body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    request<any>("/api/auth/login", { method: "POST", body: JSON.stringify(data) }),
  me: () => request<any>("/api/auth/me"),

  listProjects: () => request<any[]>("/api/projects"),
  createProject: (name: string) =>
    request<any>("/api/projects", { method: "POST", body: JSON.stringify({ name }) }),
  getProject: (id: string) => request<any>(`/api/projects/${id}`),
  updateProject: (id: string, data: { name?: string; notifyEmail?: string; notifyWebhook?: string; teamId?: string | null }) =>
    request<any>(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProject: (id: string) =>
    request<void>(`/api/projects/${id}`, { method: "DELETE" }),

  listEnvironments: (projectId: string) =>
    request<any[]>(`/api/projects/${projectId}/environments`),
  createEnvironment: (projectId: string, data: { name: string; baseUrl: string }) =>
    request<any>(`/api/projects/${projectId}/environments`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateEnvironment: (id: string, data: { name?: string; baseUrl?: string }) =>
    request<any>(`/api/environments/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteEnvironment: (id: string) =>
    request<void>(`/api/environments/${id}`, { method: "DELETE" }),

  listTests: (projectId: string) =>
    request<any[]>(`/api/projects/${projectId}/tests`),
  createTest: (projectId: string, name: string) =>
    request<any>(`/api/projects/${projectId}/tests`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  getTest: (id: string) => request<any>(`/api/tests/${id}`),
  updateTest: (id: string, name: string) =>
    request<any>(`/api/tests/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  updateTestSettings: (id: string, settings: any) =>
    request<any>(`/api/tests/${id}/settings`, {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
  deleteTest: (id: string) =>
    request<void>(`/api/tests/${id}`, { method: "DELETE" }),
  updateSteps: (testId: string, steps: any[]) =>
    request<any>(`/api/tests/${testId}/steps`, {
      method: "PUT",
      body: JSON.stringify({ steps }),
    }),
  appendSteps: (testId: string, steps: any[]) =>
    request<any>(`/api/tests/${testId}/steps`, {
      method: "POST",
      body: JSON.stringify({ steps }),
    }),

  createRun: (testId: string, environmentId: string) =>
    request<any>(`/api/tests/${testId}/runs`, {
      method: "POST",
      body: JSON.stringify({ environmentId }),
    }),
  getRun: (id: string) => request<any>(`/api/runs/${id}`),
  listRuns: (testId: string) => request<any[]>(`/api/tests/${testId}/runs`),

  listModules: (projectId: string) =>
    request<any[]>(`/api/projects/${projectId}/modules`),
  createModule: (projectId: string, name: string) =>
    request<any>(`/api/projects/${projectId}/modules`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  getModule: (id: string) => request<any>(`/api/modules/${id}`),
  updateModuleSteps: (id: string, steps: any[]) =>
    request<any>(`/api/modules/${id}/steps`, {
      method: "PUT",
      body: JSON.stringify({ steps }),
    }),
  deleteModule: (id: string) =>
    request<void>(`/api/modules/${id}`, { method: "DELETE" }),

  listSchedules: (testId?: string) =>
    request<any[]>(`/api/schedules${testId ? `?testId=${testId}` : ""}`),
  createSchedule: (data: {
    testId: string;
    environmentId: string;
    intervalMinutes?: number;
    cron?: string;
    notifyEmail?: string;
    notifyWebhook?: string;
    maxRetries?: number;
  }) =>
    request<any>("/api/schedules", { method: "POST", body: JSON.stringify(data) }),
  updateSchedule: (id: string, data: any) =>
    request<any>(`/api/schedules/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSchedule: (id: string) =>
    request<void>(`/api/schedules/${id}`, { method: "DELETE" }),

  listTeams: () => request<any[]>("/api/teams"),
  createTeam: (name: string) =>
    request<any>("/api/teams", { method: "POST", body: JSON.stringify({ name }) }),
  getTeam: (id: string) => request<any>(`/api/teams/${id}`),
  addTeamMember: (teamId: string, userId: string, role: string) =>
    request<any>(`/api/teams/${teamId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId, role }),
    }),
  updateTeamMember: (teamId: string, userId: string, role: string) =>
    request<any>(`/api/teams/${teamId}/members/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    }),
  removeTeamMember: (teamId: string, userId: string) =>
    request<void>(`/api/teams/${teamId}/members/${userId}`, { method: "DELETE" }),
  createTeamInvite: (teamId: string, email: string, role: string) =>
    request<any>(`/api/teams/${teamId}/invites`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),
  listTeamInvites: (teamId: string) =>
    request<any[]>(`/api/teams/${teamId}/invites`),
  revokeTeamInvite: (teamId: string, inviteId: string) =>
    request<void>(`/api/teams/${teamId}/invites/${inviteId}`, { method: "DELETE" }),
  acceptInvite: (token: string) =>
    request<any>(`/api/invites/${token}/accept`, { method: "POST" }),

  admin: {
    config: () => adminRequest<any>("/api/admin/config"),
    overview: () => adminRequest<any>("/api/admin/overview"),
    projects: (p?: AdminPage) => adminRequest<any>(`/api/admin/projects${adminPageQuery(p)}`),
    tests: (p?: AdminPage) => adminRequest<any>(`/api/admin/tests${adminPageQuery(p)}`),
    runs: (p?: AdminPage) => adminRequest<any>(`/api/admin/runs${adminPageQuery(p)}`),
    schedules: (p?: AdminPage) => adminRequest<any>(`/api/admin/schedules${adminPageQuery(p)}`),
    teams: (p?: AdminPage) => adminRequest<any>(`/api/admin/teams${adminPageQuery(p)}`),
    users: (p?: AdminPage) => adminRequest<any>(`/api/admin/users${adminPageQuery(p)}`),
    deleteProject: (id: string) =>
      adminRequest<void>(`/api/admin/projects/${id}`, { method: "DELETE" }),
    deleteTest: (id: string) =>
      adminRequest<void>(`/api/admin/tests/${id}`, { method: "DELETE" }),
    deleteRun: (id: string) =>
      adminRequest<void>(`/api/admin/runs/${id}`, { method: "DELETE" }),
    deleteSchedule: (id: string) =>
      adminRequest<void>(`/api/admin/schedules/${id}`, { method: "DELETE" }),
    deleteTeam: (id: string) =>
      adminRequest<void>(`/api/admin/teams/${id}`, { method: "DELETE" }),
    deleteUser: (id: string) =>
      adminRequest<void>(`/api/admin/users/${id}`, { method: "DELETE" }),
    runTest: (testId: string, environmentId: string) =>
      adminRequest<any>("/api/admin/run", {
        method: "POST",
        body: JSON.stringify({ testId, environmentId }),
      }),
  },
};

async function adminRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const key = getAdminKey() || "";
  return request<T>(path, {
    ...options,
    headers: { "x-admin-key": key, ...(options?.headers || {}) },
  });
}

export type AdminPage = { limit?: number; offset?: number };

function adminPageQuery(p?: AdminPage): string {
  if (!p) return "";
  const s = new URLSearchParams();
  if (p.limit != null) s.set("limit", String(p.limit));
  if (p.offset != null) s.set("offset", String(p.offset));
  const q = s.toString();
  return q ? `?${q}` : "";
}
