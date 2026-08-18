const TOKEN_KEY = "fg_token";
const API_KEY = "fg_api_key";
const USER_KEY = "fg_user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(API_KEY);
}

export function getUser(): { id: string; email: string; name?: string } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSession(data: {
  token?: string;
  apiKey?: string;
  user?: { id: string; email: string; name?: string };
}) {
  if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
  if (data.apiKey) localStorage.setItem(API_KEY, data.apiKey);
  if (data.user) localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(API_KEY);
  localStorage.removeItem(USER_KEY);
}

export function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const token = getToken();
  const apiKey = getApiKey();
  if (token) h.Authorization = `Bearer ${token}`;
  if (apiKey) h["X-API-Key"] = apiKey;
  return h;
}
