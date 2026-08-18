import { authHeaders, clearSession } from "./auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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
  updateProject: (id: string, name: string) =>
    request<any>(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
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
    notifyEmail?: string;
    notifyWebhook?: string;
  }) =>
    request<any>("/api/schedules", { method: "POST", body: JSON.stringify(data) }),
  updateSchedule: (id: string, data: any) =>
    request<any>(`/api/schedules/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSchedule: (id: string) =>
    request<void>(`/api/schedules/${id}`, { method: "DELETE" }),
};
