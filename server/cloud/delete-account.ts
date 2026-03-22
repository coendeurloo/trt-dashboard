import { IncomingMessage, ServerResponse } from "node:http";

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
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
    const errorPayload = payload as { message?: string; error?: string } | null;
    throw new Error(errorPayload?.message || errorPayload?.error || `HTTP_${response.status}`);
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

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`
      }
    });
    const userPayload = await parseJson<{ id: string }>(userResponse);

    const deleteResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userPayload.id}`, {
      method: "DELETE",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`
      }
    });

    if (!deleteResponse.ok) {
      let message = `HTTP_${deleteResponse.status}`;
      try {
        const payload = (await deleteResponse.json()) as { message?: string };
        message = payload.message || message;
      } catch {
        // Ignore parse errors.
      }
      sendJson(res, 500, {
        error: {
          code: "ACCOUNT_DELETE_FAILED",
          message
        }
      });
      return;
    }

    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 500, {
      error: {
        code: "ACCOUNT_DELETE_UNEXPECTED",
        message: error instanceof Error ? error.message : "Unexpected server error"
      }
    });
  }
}

