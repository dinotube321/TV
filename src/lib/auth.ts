const TOKEN_KEY = "pulse.auth.token";
const USER_KEY = "pulse.auth.user";

export type AuthUser = {
  id: string;
  userId: string;
  createdAt: string;
  adsEnabled?: boolean;
};

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (!parsed?.id || !parsed?.userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setAuthSession(token: string, user: AuthUser) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new CustomEvent("pulse:auth", { detail: { user } }));
}

export function clearAuthSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new CustomEvent("pulse:auth", { detail: { user: null } }));
}

type AuthResponse = { token: string; user: AuthUser; error?: string };

async function authRequest(
  path: string,
  body: { userId: string; password: string },
): Promise<AuthResponse> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as AuthResponse & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

export async function signup(userId: string, password: string) {
  const data = await authRequest("/api/auth/signup", { userId, password });
  setAuthSession(data.token, data.user);
  return data.user;
}

export async function login(userId: string, password: string) {
  const data = await authRequest("/api/auth/login", { userId, password });
  setAuthSession(data.token, data.user);
  return data.user;
}

export async function fetchMe(): Promise<AuthUser | null> {
  const token = getAuthToken();
  if (!token) return null;
  const res = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    clearAuthSession();
    return null;
  }
  const data = (await res.json()) as { user: AuthUser };
  setAuthSession(token, data.user);
  return data.user;
}

export function logout() {
  clearAuthSession();
}
