import { IncomingMessage, ServerResponse } from "node:http";

type ReplaceBody = {
  deviceId?: string;
  expectedRevision?: number | null;
  payload?: unknown;
};

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
};

const readRequestBody = async (req: IncomingMessage): Promise<ReplaceBody> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw) as ReplaceBody;
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
    const message =
      errorPayload?.message || errorPayload?.details || `HTTP_${response.status}`;
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

    const body = await readRequestBody(req);
    const deviceId = String(body.deviceId ?? "").trim();
    if (!deviceId) {
      sendJson(res, 400, {
        error: { code: "DEVICE_ID_REQUIRED", message: "deviceId is required." }
      });
      return;
    }
    if (!body.payload || typeof body.payload !== "object") {
      sendJson(res, 400, {
        error: { code: "PAYLOAD_REQUIRED", message: "payload is required." }
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

    const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/cloud_replace_user_data`, {
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
        p_payload: body.payload
      })
    });

    let rpcPayload: unknown = null;
    try {
      rpcPayload = (await rpcResponse.json()) as unknown;
    } catch {
      rpcPayload = null;
    }

    if (!rpcResponse.ok) {
      const errorPayload = rpcPayload as {
        code?: string;
        message?: string;
        details?: string;
      } | null;
      const message = errorPayload?.message || errorPayload?.details || "Cloud replace failed";
      const isRevisionConflict = /REVISION_MISMATCH/i.test(message);
      sendJson(res, isRevisionConflict ? 409 : 500, {
        error: {
          code: isRevisionConflict ? "REVISION_MISMATCH" : "CLOUD_REPLACE_FAILED",
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
        code: "CLOUD_REPLACE_UNEXPECTED",
        message: error instanceof Error ? error.message : "Unexpected server error"
      }
    });
  }
}

