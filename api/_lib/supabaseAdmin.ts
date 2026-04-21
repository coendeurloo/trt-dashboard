import { IncomingMessage, ServerResponse } from "node:http";
import { applyApiSecurityHeaders } from "./httpSecurity.js";

export interface SupabaseServerEnv {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}

export interface AdminIdentity {
  userId: string;
  email: string;
  accessToken: string;
  env: SupabaseServerEnv;
}

export interface SupabaseAuthUser {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}

export class AdminApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "AdminApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

const parseJsonPayload = async (response: Response): Promise<unknown> => {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
};

export const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  applyApiSecurityHeaders(res);
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
};

export const readJsonBody = async <T>(req: IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {} as T;
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw) as T;
};

export const getBearerToken = (req: IncomingMessage): string | null => {
  const header = req.headers.authorization;
  if (!header) {
    return null;
  }
  const [type, token] = header.split(" ");
  if (type !== "Bearer" || !token) {
    return null;
  }
  return token;
};

export const resolveSupabaseEnv = (): SupabaseServerEnv => {
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "";
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new AdminApiError(500, "SUPABASE_ENV_MISSING", "Supabase environment is not configured.");
  }

  return {
    supabaseUrl,
    anonKey,
    serviceRoleKey
  };
};

const parseAdminAllowlist = (): Set<string> => {
  const raw =
    process.env.LABTRACKER_ADMIN_EMAILS ||
    process.env.LABTRACKTER_ADMIN_EMAILS ||
    "";
  const entries = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return new Set(entries);
};

export const parseResponseJsonOrThrow = async <T>(
  response: Response,
  fallbackCode: string,
  fallbackMessage: string
): Promise<T> => {
  const payload = await parseJsonPayload(response);
  if (!response.ok) {
    const errorPayload = payload as { code?: string; message?: string; details?: string; error?: string } | null;
    const code =
      String(errorPayload?.code || errorPayload?.error || "").trim() ||
      `${fallbackCode}_${response.status}`;
    const message =
      String(errorPayload?.message || errorPayload?.details || "").trim() ||
      fallbackMessage;
    throw new AdminApiError(response.status, code, message);
  }
  return payload as T;
};

const mergeHeaders = (base: HeadersInit, extra?: HeadersInit): HeadersInit => {
  if (!extra) {
    return base;
  }
  return {
    ...(base as Record<string, string>),
    ...(extra as Record<string, string>)
  };
};

export const adminServiceFetch = async (
  env: SupabaseServerEnv,
  path: string,
  init?: RequestInit
): Promise<Response> => {
  const headers = mergeHeaders(
    {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`
    },
    init?.headers
  );

  return fetch(`${env.supabaseUrl}${path}`, {
    ...init,
    headers
  });
};

export const adminAnonFetch = async (
  env: SupabaseServerEnv,
  path: string,
  accessToken: string,
  init?: RequestInit
): Promise<Response> => {
  const headers = mergeHeaders(
    {
      apikey: env.anonKey,
      Authorization: `Bearer ${accessToken}`
    },
    init?.headers
  );

  return fetch(`${env.supabaseUrl}${path}`, {
    ...init,
    headers
  });
};

export const escapeFilterValue = (value: string): string => encodeURIComponent(value);

export const fetchRestRows = async <T>(
  env: SupabaseServerEnv,
  table: string,
  query: string
): Promise<T[]> => {
  const response = await adminServiceFetch(env, `/rest/v1/${table}?${query}`, {
    method: "GET"
  });
  return parseResponseJsonOrThrow<T[]>(
    response,
    "SUPABASE_REST_FAILED",
    `Supabase REST query failed for table ${table}.`
  );
};

export const fetchRestCount = async (
  env: SupabaseServerEnv,
  table: string,
  query: string
): Promise<number> => {
  const joinedQuery = ["select=user_id", query, "limit=1"]
    .filter((part) => part.trim().length > 0)
    .join("&");

  const response = await adminServiceFetch(env, `/rest/v1/${table}?${joinedQuery}`, {
    method: "GET",
    headers: {
      Prefer: "count=exact"
    }
  });

  const rows = await parseResponseJsonOrThrow<unknown[]>(
    response,
    "SUPABASE_COUNT_FAILED",
    `Supabase count query failed for table ${table}.`
  );
  const contentRange = response.headers.get("content-range") || "";
  const totalPart = contentRange.split("/")[1] || "";
  const parsed = Number(totalPart);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.floor(parsed);
  }
  return Array.isArray(rows) ? rows.length : 0;
};

const fetchSessionUser = async (
  env: SupabaseServerEnv,
  accessToken: string
): Promise<{ id: string; email: string | null }> => {
  const response = await adminAnonFetch(env, "/auth/v1/user", accessToken, {
    method: "GET"
  });

  if (response.status === 401 || response.status === 403) {
    throw new AdminApiError(401, "AUTH_REQUIRED", "Missing or invalid bearer token.");
  }

  const payload = await parseResponseJsonOrThrow<{ id: string; email?: string | null }>(
    response,
    "AUTH_USER_FETCH_FAILED",
    "Could not load authenticated user."
  );

  return {
    id: payload.id,
    email: payload.email ?? null
  };
};

export const requireAdminIdentity = async (req: IncomingMessage): Promise<AdminIdentity> => {
  const env = resolveSupabaseEnv();
  const accessToken = getBearerToken(req);
  if (!accessToken) {
    throw new AdminApiError(401, "AUTH_REQUIRED", "Missing bearer token.");
  }

  const sessionUser = await fetchSessionUser(env, accessToken);
  const normalizedEmail = String(sessionUser.email ?? "").trim().toLowerCase();
  if (!normalizedEmail) {
    throw new AdminApiError(403, "ADMIN_EMAIL_REQUIRED", "Authenticated account has no email.");
  }

  const allowlist = parseAdminAllowlist();
  if (allowlist.size === 0) {
    throw new AdminApiError(
      500,
      "ADMIN_ALLOWLIST_MISSING",
      "LABTRACKER_ADMIN_EMAILS is not configured on the server."
    );
  }

  if (!allowlist.has(normalizedEmail)) {
    throw new AdminApiError(403, "ADMIN_FORBIDDEN", "You are not allowed to access admin endpoints.");
  }

  return {
    userId: sessionUser.id,
    email: normalizedEmail,
    accessToken,
    env
  };
};

export const fetchAuthAdminUsersPage = async (
  env: SupabaseServerEnv,
  page: number,
  perPage: number
): Promise<{ users: SupabaseAuthUser[]; nextPage: number | null }> => {
  const response = await adminServiceFetch(
    env,
    `/auth/v1/admin/users?page=${Math.max(1, page)}&per_page=${Math.max(1, perPage)}`,
    {
      method: "GET"
    }
  );

  const payload = await parseResponseJsonOrThrow<{
    users?: SupabaseAuthUser[];
    next_page?: number | null;
  } | SupabaseAuthUser[]>(
    response,
    "SUPABASE_AUTH_ADMIN_USERS_FAILED",
    "Could not read auth users from Supabase admin API."
  );

  if (Array.isArray(payload)) {
    return {
      users: payload,
      nextPage: payload.length >= perPage ? page + 1 : null
    };
  }

  const users = Array.isArray(payload.users) ? payload.users : [];
  const nextPage =
    typeof payload.next_page === "number" && Number.isFinite(payload.next_page)
      ? payload.next_page
      : users.length >= perPage
        ? page + 1
        : null;

  return {
    users,
    nextPage
  };
};

export const fetchAllAuthUsers = async (
  env: SupabaseServerEnv,
  options?: { pageSize?: number; maxPages?: number }
): Promise<SupabaseAuthUser[]> => {
  const pageSize = Math.max(1, options?.pageSize ?? 200);
  const maxPages = Math.max(1, options?.maxPages ?? 50);
  let page = 1;
  let traversed = 0;
  const byId = new Map<string, SupabaseAuthUser>();

  while (traversed < maxPages) {
    traversed += 1;
    const { users, nextPage } = await fetchAuthAdminUsersPage(env, page, pageSize);
    users.forEach((user) => {
      if (user?.id) {
        byId.set(user.id, user);
      }
    });
    if (!nextPage || users.length === 0) {
      break;
    }
    if (nextPage <= page) {
      page += 1;
    } else {
      page = nextPage;
    }
  }

  return Array.from(byId.values());
};

export const handleAdminError = (res: ServerResponse, error: unknown) => {
  if (error instanceof AdminApiError) {
    sendJson(res, error.statusCode, {
      error: {
        code: error.code,
        message: error.message
      }
    });
    return;
  }

  sendJson(res, 500, {
    error: {
      code: "ADMIN_UNEXPECTED",
      message: error instanceof Error ? error.message : "Unexpected server error"
    }
  });
};
