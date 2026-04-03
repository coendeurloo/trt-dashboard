import { getSupabaseAnonKey, getSupabaseUrl } from "./constants";

export interface CloudUser {
  id: string;
  email: string | null;
}

export interface CloudSession {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: number;
  user: CloudUser;
}

type AuthErrorPayload = {
  code?: string;
  error?: string;
  error_description?: string;
  message?: string;
  msg?: string;
  details?: string;
};

type AuthSessionPayload = {
  accessToken?: string;
  expiresAt?: number;
  user?: {
    id?: string;
    email?: string | null;
  };
};

type SessionEnvelope = {
  session?: AuthSessionPayload | null;
  requiresEmailVerification?: boolean;
};

type VerificationEventEnvelope = {
  ok?: boolean;
  email?: string | null;
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

const normalizeEmail = (value: unknown): string | null => {
  const candidate = String(value ?? "").trim().toLowerCase();
  if (!candidate) {
    return null;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
};

const normalizeAuthError = (status: number, payload: unknown): string => {
  const authError = payload as AuthErrorPayload | null;
  const rawCode = String(authError?.code || authError?.error || "").trim();
  const normalizedCode = rawCode.toLowerCase();
  const rawMessage = String(
    authError?.error_description ||
      authError?.message ||
      authError?.msg ||
      authError?.details ||
      ""
  ).trim();
  const combined = `${normalizedCode} ${rawMessage.toLowerCase()}`;

  if (rawCode.startsWith("AUTH_")) {
    return rawCode;
  }
  if (normalizedCode === "invalid_credentials" || combined.includes("invalid login credentials")) {
    return "AUTH_INVALID_CREDENTIALS";
  }
  if (normalizedCode === "email_not_confirmed" || combined.includes("email not confirmed")) {
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
  if (status === 423 || combined.includes("account locked")) {
    return "AUTH_ACCOUNT_LOCKED";
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

const normalizeSession = (response: AuthSessionPayload | null | undefined): CloudSession => {
  const accessToken = String(response?.accessToken ?? "").trim();
  const expiresAt = Number(response?.expiresAt ?? 0);
  const userId = String(response?.user?.id ?? "").trim();
  if (!accessToken || !Number.isFinite(expiresAt) || expiresAt <= 0 || !userId) {
    throw new Error("AUTH_SESSION_INCOMPLETE");
  }
  return {
    accessToken,
    expiresAt,
    user: {
      id: userId,
      email: response?.user?.email ?? null
    }
  };
};

export const fetchCurrentSession = async (): Promise<CloudSession | null> => {
  const response = await fetch("/api/cloud/auth-me", {
    method: "GET",
    headers: authHeaders()
  });
  if (response.status === 401) {
    return null;
  }
  const payload = await parseJson<SessionEnvelope>(response);
  if (!payload.session) {
    return null;
  }
  return normalizeSession(payload.session);
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

  const response = await fetch("/api/cloud/auth-oauth-hash", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      accessToken,
      refreshToken,
      expiresIn
    })
  });
  const payload = await parseJson<SessionEnvelope>(response);
  return payload.session ? normalizeSession(payload.session) : null;
};

export const signInWithPassword = async (
  email: string,
  password: string
): Promise<CloudSession> => {
  const response = await fetch("/api/cloud/auth-signin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  const payload = await parseJson<SessionEnvelope>(response);
  return normalizeSession(payload.session);
};

export const signUpWithPassword = async (
  email: string,
  password: string
): Promise<void> => {
  const response = await fetch("/api/cloud/auth-signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  const payload = await parseJson<SessionEnvelope>(response);
  if (payload.requiresEmailVerification === true) {
    throw new Error("AUTH_EMAIL_VERIFICATION_REQUIRED");
  }
};

export const signOutSession = async (): Promise<void> => {
  const response = await fetch("/api/cloud/auth-logout", {
    method: "POST"
  });
  if (!response.ok && response.status !== 401) {
    throw new Error(`AUTH_SIGNOUT_FAILED_${response.status}`);
  }
};

export const requestUnlockEmail = async (email: string): Promise<void> => {
  const response = await fetch("/api/cloud/auth-unlock-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email })
  });
  await parseJson<{ ok: true }>(response);
};

export const requestPasswordResetEmail = async (email: string): Promise<void> => {
  const response = await fetch("/api/cloud/auth-password-reset-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email })
  });
  await parseJson<{ ok: true }>(response);
};

export const requestVerificationEmail = async (email: string): Promise<void> => {
  const response = await fetch("/api/cloud/auth-resend-verification", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email })
  });
  await parseJson<{ ok: true }>(response);
};

export const resetPasswordWithRecovery = async (
  accessToken: string,
  password: string
): Promise<string | null> => {
  const response = await fetch("/api/cloud/auth-reset-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ accessToken, password })
  });
  const payload = await parseJson<{ ok?: boolean; email?: string | null }>(response);
  return normalizeEmail(payload.email);
};

export const readAccessTokenFromHash = (hash: string): string | null => {
  const cleanHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!cleanHash) {
    return null;
  }
  const params = new URLSearchParams(cleanHash);
  const accessToken = String(params.get("access_token") ?? "").trim();
  return accessToken || null;
};

export const readEmailFromAccessToken = (accessToken: string | null | undefined): string | null => {
  const token = String(accessToken ?? "").trim();
  if (!token) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = JSON.parse(atob(padded)) as { email?: unknown };
    return normalizeEmail(decoded.email);
  } catch {
    return null;
  }
};

export const trackVerificationEvent = async (
  type: "confirm_opened" | "verified_opened",
  accessToken?: string | null
): Promise<{ email: string | null }> => {
  if (typeof window === "undefined" || typeof fetch !== "function") {
    return { email: null };
  }

  try {
    const response = await fetch("/api/cloud/auth-verification-event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      keepalive: true,
      body: JSON.stringify({
        type,
        accessToken: accessToken ?? null
      })
    });

    let payload: VerificationEventEnvelope | null = null;
    try {
      payload = (await response.json()) as VerificationEventEnvelope;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      return { email: null };
    }

    return {
      email: normalizeEmail(payload?.email)
    };
  } catch {
    return { email: null };
  }
};

export const buildGoogleOAuthUrl = (redirectTo: string): string => {
  const url = new URL(buildAuthUrl("/authorize"));
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", redirectTo);
  return url.toString();
};
