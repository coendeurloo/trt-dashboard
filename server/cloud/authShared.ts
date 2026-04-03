import { createHash } from "node:crypto";
import { IncomingMessage, ServerResponse } from "node:http";
import {
  deleteKey,
  getCounter,
  getString,
  incrementCounterWindow,
  setStringWindow
} from "../../api/_lib/redisStore.js";

export interface CloudEnv {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}

export interface CloudAuthContext {
  accessToken: string;
  userId: string;
  email: string | null;
  source: "header" | "cookie";
}

export interface CloudSessionPayload {
  accessToken: string;
  expiresAt: number;
  user: {
    id: string;
    email: string | null;
  };
}

export interface SupabaseAuthAdminUser {
  id: string;
  email: string | null;
  emailConfirmedAt: string | null;
  confirmedAt: string | null;
}

export interface PendingVerificationLinkRecord {
  confirmationUrl: string;
  kind: "signup" | "magiclink";
  createdAt: string;
}

interface TokenResponsePayload {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: {
    id?: string;
    email?: string | null;
  };
}

const ACCESS_COOKIE_NAME = "lt_cloud_access";
const REFRESH_COOKIE_NAME = "lt_cloud_refresh";
const ACCESS_TOKEN_MAX_AGE_SECONDS = 15 * 60;
const REFRESH_TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const LOGIN_FAILURE_WINDOW_SECONDS = 24 * 60 * 60;
const ACCOUNT_LOCK_WINDOW_SECONDS = 24 * 60 * 60;
const ACCOUNT_LOCK_THRESHOLD = 10;
const PENDING_VERIFICATION_LINK_TTL_SECONDS = 24 * 60 * 60;

const parseCookieHeader = (rawHeader: string): Record<string, string> => {
  const pairs = rawHeader.split(";").map((pair) => pair.trim());
  const result: Record<string, string> = {};
  pairs.forEach((pair) => {
    const separator = pair.indexOf("=");
    if (separator <= 0) {
      return;
    }
    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!key) {
      return;
    }
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  });
  return result;
};

const readHeader = (req: IncomingMessage, name: string): string | null => {
  const raw = req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
};

const parseBearerToken = (authorizationHeader: string | null): string | null => {
  if (!authorizationHeader) {
    return null;
  }
  const [type, token] = authorizationHeader.split(" ");
  if (type !== "Bearer" || !token) {
    return null;
  }
  return token.trim() || null;
};

const readCookieValue = (req: IncomingMessage, cookieName: string): string | null => {
  const cookieHeader = readHeader(req, "cookie");
  if (!cookieHeader) {
    return null;
  }
  const parsed = parseCookieHeader(cookieHeader);
  const value = parsed[cookieName];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
};

const appendSetCookie = (res: ServerResponse, cookie: string) => {
  const existing = res.getHeader("set-cookie");
  if (!existing) {
    res.setHeader("set-cookie", [cookie]);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader("set-cookie", [...existing, cookie]);
    return;
  }
  res.setHeader("set-cookie", [String(existing), cookie]);
};

const shouldUseSecureCookies = (req: IncomingMessage): boolean => {
  const host = readHeader(req, "host")?.toLowerCase() ?? "";
  const forwardedProto = readHeader(req, "x-forwarded-proto")?.toLowerCase() ?? "";
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    return false;
  }
  if (forwardedProto === "http") {
    return false;
  }
  if (process.env.NODE_ENV === "development") {
    return false;
  }
  return true;
};

const buildCookie = (
  req: IncomingMessage,
  name: string,
  value: string,
  maxAgeSeconds: number
): string => {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.max(0, Math.round(maxAgeSeconds))}`
  ];
  if (shouldUseSecureCookies(req)) {
    attributes.push("Secure");
  }
  return attributes.join("; ");
};

const tokenHash = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const revokedTokenKey = (token: string): string => `cloud:auth:revoked:${tokenHash(token)}`;
const failedLoginKey = (email: string): string => `cloud:auth:failed:${email}`;
const accountLockKey = (email: string): string => `cloud:auth:locked:${email}`;
const pendingVerificationLinkKey = (email: string): string =>
  `cloud:auth:verify-link:${tokenHash(normalizeEmail(email))}`;

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const parseJwtExpiry = (token: string): number | null => {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }
  const payload = parts[1];
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as { exp?: unknown };
    const exp = Number(parsed.exp);
    if (!Number.isFinite(exp) || exp <= 0) {
      return null;
    }
    return Math.max(1, Math.round(exp - Date.now() / 1000));
  } catch {
    return null;
  }
};

export const getClientIp = (req: IncomingMessage): string => {
  const forwarded = req.headers["x-forwarded-for"];
  const candidate = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof candidate === "string" && candidate.trim()) {
    const first = candidate.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return req.socket.remoteAddress ?? "unknown";
};

export const readCloudAccessToken = (
  req: IncomingMessage
): { token: string | null; source: "header" | "cookie" | null } => {
  const bearer = parseBearerToken(readHeader(req, "authorization"));
  if (bearer) {
    return { token: bearer, source: "header" };
  }
  const fromCookie = readCookieValue(req, ACCESS_COOKIE_NAME);
  if (fromCookie) {
    return { token: fromCookie, source: "cookie" };
  }
  return { token: null, source: null };
};

export const readCloudRefreshToken = (req: IncomingMessage): string | null =>
  readCookieValue(req, REFRESH_COOKIE_NAME);

export const setCloudSessionCookies = (
  req: IncomingMessage,
  res: ServerResponse,
  accessToken: string,
  refreshToken: string,
  accessExpiresInSeconds?: number | null
) => {
  const accessMaxAge = Number.isFinite(Number(accessExpiresInSeconds))
    ? Math.max(1, Math.round(Number(accessExpiresInSeconds)))
    : ACCESS_TOKEN_MAX_AGE_SECONDS;
  appendSetCookie(res, buildCookie(req, ACCESS_COOKIE_NAME, accessToken, accessMaxAge));
  appendSetCookie(
    res,
    buildCookie(req, REFRESH_COOKIE_NAME, refreshToken, REFRESH_TOKEN_MAX_AGE_SECONDS)
  );
};

export const clearCloudSessionCookies = (req: IncomingMessage, res: ServerResponse) => {
  appendSetCookie(res, buildCookie(req, ACCESS_COOKIE_NAME, "", 0));
  appendSetCookie(res, buildCookie(req, REFRESH_COOKIE_NAME, "", 0));
};

export const resolveCloudEnv = (): CloudEnv => ({
  supabaseUrl:
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "",
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  anonKey:
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ""
});

export const hasCloudEnv = (env: CloudEnv): boolean =>
  Boolean(env.supabaseUrl && env.serviceRoleKey && env.anonKey);

export const parseJson = async <T>(response: Response): Promise<T> => {
  let payload: unknown = null;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const errorPayload = payload as { code?: string; message?: string; details?: string } | null;
    const code = String(errorPayload?.code ?? "").trim();
    const message =
      errorPayload?.message || errorPayload?.details || code || `HTTP_${response.status}`;
    throw new Error(message);
  }
  return payload as T;
};

export const fetchSupabaseUser = async (
  env: CloudEnv,
  accessToken: string
): Promise<{ id: string; email: string | null } | null> => {
  const response = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok) {
    return null;
  }
  const payload = await parseJson<{ id: string; email?: string | null }>(response);
  if (!payload?.id) {
    return null;
  }
  return {
    id: payload.id,
    email: payload.email ?? null
  };
};

export const isTokenRevoked = async (token: string): Promise<boolean> => {
  try {
    return (await getCounter(revokedTokenKey(token))) > 0;
  } catch {
    return false;
  }
};

export const revokeToken = async (
  token: string,
  fallbackTtlSeconds: number
): Promise<void> => {
  if (!token) {
    return;
  }
  const tokenTtl = parseJwtExpiry(token);
  const ttl = Math.max(60, tokenTtl ?? fallbackTtlSeconds);
  try {
    await incrementCounterWindow(revokedTokenKey(token), ttl, 1);
  } catch {
    // Best effort: failing to blacklist should not break logout.
  }
};

export const resolveCloudAuthContext = async (
  req: IncomingMessage,
  env: CloudEnv
): Promise<CloudAuthContext | null> => {
  const access = readCloudAccessToken(req);
  if (!access.token || !access.source) {
    return null;
  }
  if (await isTokenRevoked(access.token)) {
    return null;
  }
  const user = await fetchSupabaseUser(env, access.token);
  if (!user) {
    return null;
  }
  return {
    accessToken: access.token,
    userId: user.id,
    email: user.email,
    source: access.source
  };
};

export const parseTokenResponse = (
  payload: TokenResponsePayload
): {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
  userEmail: string | null;
} | null => {
  const accessToken = String(payload.access_token ?? "").trim();
  const refreshToken = String(payload.refresh_token ?? "").trim();
  const expiresIn = Number(payload.expires_in ?? 0);
  const userId = String(payload.user?.id ?? "").trim();
  if (!accessToken || !refreshToken || !userId || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return null;
  }
  return {
    accessToken,
    refreshToken,
    expiresIn,
    userId,
    userEmail: payload.user?.email ?? null
  };
};

export const toCloudSessionPayload = (
  parsed: ReturnType<typeof parseTokenResponse>
): CloudSessionPayload | null => {
  if (!parsed) {
    return null;
  }
  return {
    accessToken: parsed.accessToken,
    expiresAt: Math.floor(Date.now() / 1000) + parsed.expiresIn,
    user: {
      id: parsed.userId,
      email: parsed.userEmail
    }
  };
};

export const isEmailFormatValid = (value: string): boolean => {
  const email = normalizeEmail(value);
  if (email.length < 3 || email.length > 254) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const isPasswordFormatValid = (value: string): boolean =>
  typeof value === "string" && value.trim().length >= 6 && value.length <= 256;

export const isAccountLocked = async (email: string): Promise<boolean> => {
  try {
    return (await getCounter(accountLockKey(normalizeEmail(email)))) > 0;
  } catch {
    return false;
  }
};

export const recordFailedLoginAttempt = async (email: string): Promise<number> => {
  const normalized = normalizeEmail(email);
  try {
    const failure = await incrementCounterWindow(
      failedLoginKey(normalized),
      LOGIN_FAILURE_WINDOW_SECONDS,
      1
    );
    if (failure.count >= ACCOUNT_LOCK_THRESHOLD) {
      await incrementCounterWindow(accountLockKey(normalized), ACCOUNT_LOCK_WINDOW_SECONDS, 1);
    }
    return failure.count;
  } catch {
    return 0;
  }
};

export const clearFailedLoginAttempts = async (email: string): Promise<void> => {
  const normalized = normalizeEmail(email);
  try {
    await deleteKey(failedLoginKey(normalized));
    await deleteKey(accountLockKey(normalized));
  } catch {
    // Best effort.
  }
};

export const storePendingVerificationLink = async (
  email: string,
  record: PendingVerificationLinkRecord
): Promise<void> => {
  await setStringWindow(
    pendingVerificationLinkKey(email),
    JSON.stringify(record),
    PENDING_VERIFICATION_LINK_TTL_SECONDS
  );
};

export const readPendingVerificationLink = async (
  email: string
): Promise<PendingVerificationLinkRecord | null> => {
  const raw = await getString(pendingVerificationLinkKey(email));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as PendingVerificationLinkRecord;
    if (
      typeof parsed?.confirmationUrl === "string" &&
      (parsed.kind === "signup" || parsed.kind === "magiclink") &&
      typeof parsed.createdAt === "string"
    ) {
      return parsed;
    }
  } catch {
    // Ignore malformed cache entries.
  }
  return null;
};

export const clearPendingVerificationLink = async (email: string): Promise<void> => {
  try {
    await deleteKey(pendingVerificationLinkKey(email));
  } catch {
    // Best effort.
  }
};

export const buildCloudAuthHeaders = (
  env: CloudEnv,
  accessToken?: string
): HeadersInit => ({
  apikey: env.anonKey,
  Authorization: accessToken ? `Bearer ${accessToken}` : `Bearer ${env.anonKey}`,
  "Content-Type": "application/json"
});

const buildCloudServiceHeaders = (env: CloudEnv): HeadersInit => ({
  apikey: env.serviceRoleKey,
  Authorization: `Bearer ${env.serviceRoleKey}`,
  "Content-Type": "application/json"
});

const normalizeAuthAdminUser = (value: unknown): SupabaseAuthAdminUser | null => {
  const candidate = value as {
    id?: unknown;
    email?: unknown;
    email_confirmed_at?: unknown;
    confirmed_at?: unknown;
  } | null;
  const id = String(candidate?.id ?? "").trim();
  if (!id) {
    return null;
  }
  const emailRaw = candidate?.email;
  const email =
    typeof emailRaw === "string" && emailRaw.trim().length > 0 ? emailRaw.trim().toLowerCase() : null;
  const emailConfirmedAt =
    typeof candidate?.email_confirmed_at === "string" && candidate.email_confirmed_at.trim().length > 0
      ? candidate.email_confirmed_at.trim()
      : null;
  const confirmedAt =
    typeof candidate?.confirmed_at === "string" && candidate.confirmed_at.trim().length > 0
      ? candidate.confirmed_at.trim()
      : null;
  return {
    id,
    email,
    emailConfirmedAt,
    confirmedAt
  };
};

export const isSupabaseAuthUserConfirmed = (user: SupabaseAuthAdminUser | null): boolean =>
  Boolean(user?.emailConfirmedAt || user?.confirmedAt);

export const fetchSupabaseAuthUserByEmail = async (
  env: CloudEnv,
  email: string
): Promise<SupabaseAuthAdminUser | null> => {
  const normalizedTarget = normalizeEmail(email);
  let page = 1;
  const perPage = 200;
  const maxPages = 50;

  while (page <= maxPages) {
    const response = await fetch(
      `${env.supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
      {
        method: "GET",
        headers: buildCloudServiceHeaders(env)
      }
    );
    const payload = await parseJson<{ users?: unknown[]; next_page?: number | null } | unknown[]>(response);
    const users = Array.isArray(payload)
      ? payload.map(normalizeAuthAdminUser).filter((user): user is SupabaseAuthAdminUser => Boolean(user))
      : Array.isArray(payload.users)
        ? payload.users
            .map(normalizeAuthAdminUser)
            .filter((user): user is SupabaseAuthAdminUser => Boolean(user))
        : [];

    const match = users.find((user) => user.email === normalizedTarget);
    if (match) {
      return match;
    }

    if (users.length === 0) {
      return null;
    }

    const nextPage =
      !Array.isArray(payload) && typeof payload.next_page === "number" && payload.next_page > page
        ? payload.next_page
        : page + 1;
    if (nextPage <= page) {
      break;
    }
    page = nextPage;
  }

  return null;
};

export const getCloudCookieNames = () => ({
  access: ACCESS_COOKIE_NAME,
  refresh: REFRESH_COOKIE_NAME
});
