import { IncomingMessage, ServerResponse } from "node:http";
import { getTrustedClientIp } from "../../api/_lib/clientIp.js";
import { checkRateLimit } from "../../api/_lib/rateLimit.js";
import { RedisStoreUnavailableError } from "../../api/_lib/redisStore.js";
import { readJsonBodyWithLimit } from "./readJsonBody.js";

type IncrementalBody = {
  deviceId?: string;
  expectedRevision?: number | null;
  patch?: unknown;
};

const INCREMENTAL_MAX_JSON_BYTES = 5 * 1024 * 1024;
const INCREMENTAL_TIMEOUT_MS = 12_000;

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
};

const readRequestBody = async (req: IncomingMessage): Promise<IncrementalBody> => {
  return readJsonBodyWithLimit<IncrementalBody>(req, {
    maxBytes: INCREMENTAL_MAX_JSON_BYTES,
    timeoutMs: INCREMENTAL_TIMEOUT_MS
  });
};

const getBearerToken = (req: IncomingMessage): string | null => {
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

const parseJson = async <T>(response: Response): Promise<T> => {
  let payload: unknown = null;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const errorPayload = payload as { code?: string; message?: string; details?: string } | null;
    const message = errorPayload?.message || errorPayload?.details || `HTTP_${response.status}`;
    throw new Error(message);
  }
  return payload as T;
};

const resolveEnv = () => {
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const anonKey =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  return { supabaseUrl, serviceRoleKey, anonKey };
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: { message: "Method not allowed" } });
      return;
    }

    const { supabaseUrl, serviceRoleKey, anonKey } = resolveEnv();
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      sendJson(res, 500, {
        error: { code: "SUPABASE_ENV_MISSING", message: "Supabase environment is not configured." }
      });
      return;
    }

    const accessToken = getBearerToken(req);
    if (!accessToken) {
      sendJson(res, 401, { error: { code: "AUTH_REQUIRED", message: "Missing bearer token." } });
      return;
    }

    const ip = getTrustedClientIp(req);
    try {
      const limit = await checkRateLimit(ip, "cloud_sync_write");
      const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
      res.setHeader("x-ratelimit-remaining", String(limit.remaining));
      res.setHeader("x-ratelimit-reset", String(limit.resetAt));
      if (!limit.allowed) {
        sendJson(res, 429, {
          error: {
            code: "CLOUD_RATE_LIMITED",
            message: "Too many sync writes. Try again later."
          },
          retryAfter,
          remaining: limit.remaining
        });
        return;
      }
    } catch (error) {
      if (!(error instanceof RedisStoreUnavailableError)) {
        throw error;
      }
      // Best effort: keep sync route available when shared limiter storage is degraded.
    }

    let body: IncrementalBody;
    try {
      body = await readRequestBody(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "Request body too large") {
        sendJson(res, 413, {
          error: { code: "REQUEST_TOO_LARGE", message: "Request body too large." }
        });
        return;
      }
      if (message === "Request body timeout") {
        sendJson(res, 408, {
          error: { code: "REQUEST_TIMEOUT", message: "Request body timeout." }
        });
        return;
      }
      sendJson(res, 400, {
        error: { code: "INVALID_JSON_BODY", message: "Invalid JSON body." }
      });
      return;
    }
    const deviceId = String(body.deviceId ?? "").trim();
    if (!deviceId) {
      sendJson(res, 400, {
        error: { code: "DEVICE_ID_REQUIRED", message: "deviceId is required." }
      });
      return;
    }
    if (!body.patch || typeof body.patch !== "object") {
      sendJson(res, 400, {
        error: { code: "PATCH_REQUIRED", message: "patch is required." }
      });
      return;
    }

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`
      }
    });
    const userPayload = await parseJson<{ id: string }>(userResponse);
    const userId = userPayload.id;

    const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/cloud_apply_incremental_patch`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_device_id: deviceId,
        p_expected_revision:
          typeof body.expectedRevision === "number" ? body.expectedRevision : null,
        p_patch: body.patch
      })
    });

    let rpcPayload: unknown = null;
    try {
      rpcPayload = (await rpcResponse.json()) as unknown;
    } catch {
      rpcPayload = null;
    }

    if (!rpcResponse.ok) {
      const errorPayload = rpcPayload as { message?: string; details?: string } | null;
      const message = errorPayload?.message || errorPayload?.details || "Cloud incremental patch failed";
      const isRevisionConflict = /REVISION_MISMATCH/i.test(message);
      sendJson(res, isRevisionConflict ? 409 : 500, {
        error: {
          code: isRevisionConflict ? "REVISION_MISMATCH" : "CLOUD_PATCH_FAILED",
          message
        }
      });
      return;
    }

    const row = Array.isArray(rpcPayload)
      ? (rpcPayload[0] as { new_revision?: number; last_synced_at?: string | null } | undefined)
      : (rpcPayload as { new_revision?: number; last_synced_at?: string | null } | null);

    sendJson(res, 200, {
      revision: Number(row?.new_revision ?? 0) || 0,
      lastSyncedAt: row?.last_synced_at ?? null
    });
  } catch (error) {
    sendJson(res, 500, {
      error: {
        code: "CLOUD_PATCH_UNEXPECTED",
        message: error instanceof Error ? error.message : "Unexpected server error"
      }
    });
  }
}
