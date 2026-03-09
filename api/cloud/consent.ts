import { IncomingMessage, ServerResponse } from "node:http";

type ConsentBody = {
  acceptPrivacyPolicy?: boolean;
  acceptHealthDataConsent?: boolean;
  privacyPolicyVersion?: string;
  acceptedAt?: string;
};

type ConsentRow = {
  privacy_policy_accepted_at?: string | null;
  health_data_consent_at?: string | null;
  privacy_policy_version?: string | null;
};

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
};

const readRequestBody = async (req: IncomingMessage): Promise<ConsentBody> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw) as ConsentBody;
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

const normalizeConsentResponse = (row: ConsentRow | null) => {
  const privacyPolicyAcceptedAt = row?.privacy_policy_accepted_at ?? null;
  const healthDataConsentAt = row?.health_data_consent_at ?? null;
  const privacyPolicyVersion = row?.privacy_policy_version ?? null;
  const hasConsent = Boolean(privacyPolicyAcceptedAt && healthDataConsentAt);
  return {
    hasConsent,
    privacyPolicyAcceptedAt,
    healthDataConsentAt,
    privacyPolicyVersion
  };
};

const fetchUserId = async (
  supabaseUrl: string,
  anonKey: string,
  accessToken: string
): Promise<string> => {
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });
  const userPayload = await parseJson<{ id: string }>(userResponse);
  return userPayload.id;
};

const fetchConsentRow = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
): Promise<ConsentRow | null> => {
  const query =
    "select=privacy_policy_accepted_at,health_data_consent_at,privacy_policy_version&limit=1&user_id=eq." +
    encodeURIComponent(userId);
  const consentResponse = await fetch(`${supabaseUrl}/rest/v1/user_consents?${query}`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`
    }
  });
  const rows = await parseJson<ConsentRow[]>(consentResponse);
  return rows[0] ?? null;
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
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

    const userId = await fetchUserId(supabaseUrl, anonKey, accessToken);

    if (req.method === "GET") {
      const row = await fetchConsentRow(supabaseUrl, serviceRoleKey, userId);
      sendJson(res, 200, normalizeConsentResponse(row));
      return;
    }

    const body = await readRequestBody(req);
    const acceptPrivacyPolicy = body.acceptPrivacyPolicy === true;
    const acceptHealthDataConsent = body.acceptHealthDataConsent === true;
    const privacyPolicyVersion = String(body.privacyPolicyVersion ?? "").trim();
    if (!acceptPrivacyPolicy || !acceptHealthDataConsent || !privacyPolicyVersion) {
      sendJson(res, 400, {
        error: {
          code: "CONSENT_REQUIRED",
          message: "Both consent flags and a privacy policy version are required."
        }
      });
      return;
    }

    const acceptedAtCandidate = typeof body.acceptedAt === "string" ? Date.parse(body.acceptedAt) : NaN;
    const acceptedAt = Number.isFinite(acceptedAtCandidate)
      ? new Date(acceptedAtCandidate).toISOString()
      : new Date().toISOString();

    const upsertResponse = await fetch(
      `${supabaseUrl}/rest/v1/user_consents?on_conflict=user_id`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation"
        },
        body: JSON.stringify([
          {
            user_id: userId,
            privacy_policy_accepted_at: acceptedAt,
            health_data_consent_at: acceptedAt,
            privacy_policy_version: privacyPolicyVersion,
            updated_at: acceptedAt
          }
        ])
      }
    );
    const rows = await parseJson<ConsentRow[]>(upsertResponse);
    sendJson(res, 200, { ok: true, consent: normalizeConsentResponse(rows[0] ?? null) });
  } catch (error) {
    sendJson(res, 500, {
      error: {
        code: "CLOUD_CONSENT_UNEXPECTED",
        message: error instanceof Error ? error.message : "Unexpected server error"
      }
    });
  }
}
