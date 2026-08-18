const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export const api = {
  listProjects: () => request<any[]>("/api/projects"),
  createProject: (name: string) =>
    request<any>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  getProject: (id: string) => request<any>(`/api/projects/${id}`),

  listEnvironments: (projectId: string) =>
    request<any[]>(`/api/projects/${projectId}/environments`),
  createEnvironment: (
    projectId: string,
    data: { name: string; baseUrl: string }
  ) =>
    request<any>(`/api/projects/${projectId}/environments`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  listTests: (projectId: string) =>
    request<any[]>(`/api/projects/${projectId}/tests`),
  createTest: (projectId: string, name: string) =>
    request<any>(`/api/projects/${projectId}/tests`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  getTest: (id: string) => request<any>(`/api/tests/${id}`),
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
};
