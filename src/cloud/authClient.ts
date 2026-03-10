import {
  CLOUD_SESSION_STORAGE_KEY,
  getSupabaseAnonKey,
  getSupabaseUrl
} from "./constants";

export interface CloudUser {
  id: string;
  email: string | null;
}

export interface CloudSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: CloudUser;
}

type AuthTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: {
    id?: string;
    email?: string | null;
  };
  error?: string;
  error_description?: string;
};

type AuthErrorPayload = {
  code?: string;
  error?: string;
  error_description?: string;
  message?: string;
  msg?: string;
  details?: string;
};

const authHeaders = (accessToken?: string): HeadersInit => {
  const anonKey = getSupabaseAnonKey();
  return {
    apikey: anonKey,
    Authorization: accessToken ? `Bearer ${accessToken}` : `Bearer ${anonKey}`,
    "Content-Type": "application/json"
  };
};

const buildAuthUrl = (path: string): string => `${getSupabaseUrl()}/auth/v1${path}`;

const normalizeAuthError = (status: number, payload: unknown): string => {
  const authError = payload as AuthErrorPayload | null;
  const rawCode = String(authError?.code || authError?.error || "").trim().toLowerCase();
  const rawMessage = String(
    authError?.error_description ||
      authError?.message ||
      authError?.msg ||
      authError?.details ||
      ""
  ).trim();
  const combined = `${rawCode} ${rawMessage}`.toLowerCase();

  if (rawCode === "invalid_credentials" || combined.includes("invalid login credentials")) {
    return "AUTH_INVALID_CREDENTIALS";
  }
  if (rawCode === "email_not_confirmed" || combined.includes("email not confirmed")) {
    return "AUTH_EMAIL_NOT_CONFIRMED";
  }
  if (combined.includes("user already registered") || combined.includes("already registered")) {
    return "AUTH_USER_ALREADY_REGISTERED";
  }
  if (combined.includes("password should be at least") || combined.includes("at least 6 characters")) {
    return "AUTH_WEAK_PASSWORD";
  }
  if (combined.includes("unable to validate email") || combined.includes("invalid email")) {
    return "AUTH_INVALID_EMAIL";
  }
  if (status === 429 || combined.includes("rate limit") || combined.includes("too many requests")) {
    return "AUTH_RATE_LIMITED";
  }
  if (status === 401) {
    return "AUTH_UNAUTHORIZED";
  }
  if (status >= 500) {
    return "AUTH_PROVIDER_UNAVAILABLE";
  }
  if (status === 400) {
    return "AUTH_BAD_REQUEST";
  }
  if (status === 422) {
    return "AUTH_UNPROCESSABLE";
  }

  if (rawMessage) {
    return `AUTH_HTTP_${status}:${rawMessage}`;
  }
  return `AUTH_HTTP_${status}`;
};

const normalizeTokenResponse = (response: AuthTokenResponse): CloudSession => {
  const accessToken = response.access_token ?? "";
  const refreshToken = response.refresh_token ?? "";
  const expiresIn = Number(response.expires_in ?? 0);
  const userId = String(response.user?.id ?? "").trim();

  if (!accessToken || !refreshToken || !userId || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error("AUTH_SESSION_INCOMPLETE");
  }

  return {
    accessToken,
    refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
    user: {
      id: userId,
      email: response.user?.email ?? null
    }
  };
};

const parseJson = async <T>(res: Response): Promise<T> => {
  let payload: unknown = null;
  try {
    payload = (await res.json()) as unknown;
  } catch {
    payload = null;
  }
  if (!res.ok) {
    throw new Error(normalizeAuthError(res.status, payload));
  }
  return payload as T;
};

export const loadStoredSession = (): CloudSession | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(CLOUD_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as CloudSession;
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.user?.id) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const persistSession = (session: CloudSession | null): void => {
  if (typeof window === "undefined") {
    return;
  }
  if (!session) {
    window.localStorage.removeItem(CLOUD_SESSION_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(CLOUD_SESSION_STORAGE_KEY, JSON.stringify(session));
};

export const parseOAuthHashSession = async (
  hash: string
): Promise<CloudSession | null> => {
  const cleanHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!cleanHash) {
    return null;
  }
  const params = new URLSearchParams(cleanHash);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const expiresIn = Number(params.get("expires_in") ?? "0");
  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return null;
  }

  const userResponse = await fetch(buildAuthUrl("/user"), {
    method: "GET",
    headers: authHeaders(accessToken)
  });
  const userPayload = await parseJson<{ id: string; email?: string | null }>(userResponse);
  return {
    accessToken,
    refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
    user: {
      id: userPayload.id,
      email: userPayload.email ?? null
    }
  };
};

export const refreshSession = async (
  currentSession: CloudSession
): Promise<CloudSession> => {
  const response = await fetch(buildAuthUrl("/token?grant_type=refresh_token"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      refresh_token: currentSession.refreshToken
    })
  });
  const payload = await parseJson<AuthTokenResponse>(response);
  return normalizeTokenResponse(payload);
};

export const signInWithPassword = async (
  email: string,
  password: string
): Promise<CloudSession> => {
  const response = await fetch(buildAuthUrl("/token?grant_type=password"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email, password })
  });
  const payload = await parseJson<AuthTokenResponse>(response);
  return normalizeTokenResponse(payload);
};

export const signUpWithPassword = async (
  email: string,
  password: string
): Promise<CloudSession> => {
  const response = await fetch(buildAuthUrl("/signup"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email, password })
  });
  const payload = await parseJson<AuthTokenResponse>(response);
  return normalizeTokenResponse(payload);
};

export const signOutSession = async (accessToken: string): Promise<void> => {
  const response = await fetch(buildAuthUrl("/logout"), {
    method: "POST",
    headers: authHeaders(accessToken)
  });
  if (!response.ok && response.status !== 401) {
    throw new Error(`AUTH_SIGNOUT_FAILED_${response.status}`);
  }
};

export const buildGoogleOAuthUrl = (redirectTo: string): string => {
  const url = new URL(buildAuthUrl("/authorize"));
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", redirectTo);
  return url.toString();
};
