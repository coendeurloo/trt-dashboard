import {
  AdminAuditLogEntry,
  AdminUserDirectoryResult,
  AdminMe,
  AdminOverview,
  AdminRuntimeConfig,
  AdminSystemStatus,
  AdminUserLookupResult
} from "./types";

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
  };
}

const parseJson = async <T>(response: Response): Promise<T> => {
  let payload: unknown = null;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = payload as ErrorEnvelope | null;
    const code = String(error?.error?.code ?? "").trim();
    const message = String(error?.error?.message ?? "").trim();
    throw new Error(code || message || `ADMIN_HTTP_${response.status}`);
  }

  return payload as T;
};

const authHeaders = (accessToken: string): HeadersInit => ({
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json"
});

export const fetchAdminMe = async (accessToken: string): Promise<AdminMe> => {
  const response = await fetch("/api/admin/me", {
    method: "GET",
    headers: authHeaders(accessToken)
  });
  return parseJson<AdminMe>(response);
};

export const fetchAdminOverview = async (accessToken: string): Promise<AdminOverview> => {
  const response = await fetch("/api/admin/overview", {
    method: "GET",
    headers: authHeaders(accessToken)
  });
  return parseJson<AdminOverview>(response);
};

export const fetchAdminSystemStatus = async (accessToken: string): Promise<AdminSystemStatus> => {
  const response = await fetch("/api/admin/system-status", {
    method: "GET",
    headers: authHeaders(accessToken)
  });
  return parseJson<AdminSystemStatus>(response);
};

export const fetchAdminRuntimeConfig = async (accessToken: string): Promise<AdminRuntimeConfig> => {
  const response = await fetch("/api/admin/runtime-config", {
    method: "GET",
    headers: authHeaders(accessToken)
  });
  const payload = await parseJson<{ config: AdminRuntimeConfig }>(response);
  return payload.config;
};

export const updateAdminRuntimeConfig = async (
  accessToken: string,
  patch: Partial<AdminRuntimeConfig>
): Promise<AdminRuntimeConfig> => {
  const response = await fetch("/api/admin/runtime-config", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ patch })
  });
  const payload = await parseJson<{ config: AdminRuntimeConfig }>(response);
  return payload.config;
};

export const fetchAdminUserLookup = async (
  accessToken: string,
  query: string
): Promise<AdminUserLookupResult> => {
  const response = await fetch(`/api/admin/users?query=${encodeURIComponent(query)}`, {
    method: "GET",
    headers: authHeaders(accessToken)
  });
  return parseJson<AdminUserLookupResult>(response);
};

export const fetchAdminUserDirectory = async (
  accessToken: string,
  options?: { query?: string; limit?: number }
): Promise<AdminUserDirectoryResult> => {
  const queryValue = String(options?.query ?? "").trim();
  const limitValue =
    typeof options?.limit === "number" && Number.isFinite(options.limit)
      ? Math.max(1, Math.floor(options.limit))
      : 250;
  const query = new URLSearchParams();
  query.set("limit", String(limitValue));
  if (queryValue) {
    query.set("query", queryValue);
  }

  const response = await fetch(`/api/admin/users-directory?${query.toString()}`, {
    method: "GET",
    headers: authHeaders(accessToken)
  });
  return parseJson<AdminUserDirectoryResult>(response);
};

export const fetchAdminAuditLog = async (accessToken: string): Promise<AdminAuditLogEntry[]> => {
  const response = await fetch("/api/admin/audit-log", {
    method: "GET",
    headers: authHeaders(accessToken)
  });
  const payload = await parseJson<{ entries: AdminAuditLogEntry[] }>(response);
  return payload.entries;
};
