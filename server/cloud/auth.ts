import { IncomingMessage, ServerResponse } from "node:http";
import {
  buildPasswordResetRedirectUrl,
  buildVerifiedRedirectUrl,
  resolveAppPublicOrigin,
  sendCloudPasswordResetEmail,
  sendCloudVerificationEmail
} from "../../api/_lib/cloudAuthEmail.js";
import {
  consumeVerifiedSigninMarker,
  markVerificationCompleted,
  recordVerificationConfirmOpened,
  recordVerificationEmailSent,
  recordVerificationResendRequested,
  recordVerificationSignupStarted
} from "../../api/_lib/cloudVerificationFunnel.js";
import { getRuntimeConfigWithFallback } from "../../api/_lib/adminRuntimeConfig.js";
import { checkRateLimit } from "../../api/_lib/rateLimit.js";
import { RedisStoreUnavailableError } from "../../api/_lib/redisStore.js";
import {
  buildCloudAuthHeaders,
  clearPendingVerificationLink,
  clearCloudSessionCookies,
  clearFailedLoginAttempts,
  CloudSessionPayload,
  fetchSupabaseAuthUserByEmail,
  fetchSupabaseUser,
  getClientIp,
  hasCloudEnv,
  isAccountLocked,
  isEmailFormatValid,
  isPasswordFormatValid,
  isSupabaseAuthUserConfirmed,
  isTokenRevoked,
  parseJson,
  parseTokenResponse,
  readPendingVerificationLink,
  readCloudAccessToken,
  readCloudRefreshToken,
  recordFailedLoginAttempt,
  resolveCloudEnv,
  revokeToken,
  setCloudSessionCookies,
  storePendingVerificationLink,
  toCloudSessionPayload
} from "./authShared.js";
import { readJsonBodyWithLimit } from "./readJsonBody.js";

interface AuthCredentialsBody {
  email?: string;
  password?: string;
}

interface OAuthHashBody {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

interface VerificationEventBody {
  type?: string;
  accessToken?: string;
}

interface PasswordResetBody {
  email?: string;
}

interface PasswordUpdateBody {
  accessToken?: string;
  password?: string;
}

interface AdminGenerateLinkResponse {
  action_link?: string;
  email_otp?: string;
  hashed_token?: string;
  verification_type?: string;
  redirect_to?: string;
}

interface SupabaseUserUpdateResponse {
  id?: string;
  email?: string | null;
}

const ACCESS_TOKEN_FALLBACK_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_FALLBACK_TTL_SECONDS = 7 * 24 * 60 * 60;
const AUTH_REQUEST_MAX_JSON_BYTES = 64 * 1024;
const AUTH_REQUEST_TIMEOUT_MS = 10_000;
const VERIFICATION_REQUIRED_RESPONSE = {
  ok: true,
  requiresEmailVerification: true
};

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
};

const sendBodyReadError = (res: ServerResponse, error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  if (message === "Request body too large") {
    sendJson(res, 413, {
      error: {
        code: "AUTH_REQUEST_TOO_LARGE",
        message: "Request body too large."
      }
    });
    return;
  }
  if (message === "Request body timeout") {
    sendJson(res, 408, {
      error: {
        code: "AUTH_REQUEST_TIMEOUT",
        message: "Request body timeout."
      }
    });
    return;
  }
  sendJson(res, 400, {
    error: {
      code: "AUTH_INVALID_INPUT",
      message: "Invalid JSON body."
    }
  });
};

const readRequestBody = async <T>(req: IncomingMessage): Promise<T> => {
  return readJsonBodyWithLimit<T>(req, {
    maxBytes: AUTH_REQUEST_MAX_JSON_BYTES,
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS
  });
};

const normalizeEmail = (value: unknown): string => String(value ?? "").trim().toLowerCase();

const resolveSignInErrorCode = (status: number, payload: unknown): string => {
  const candidate = payload as { code?: string; error?: string; error_description?: string; message?: string } | null;
  const code = String(candidate?.code || candidate?.error || "").trim().toLowerCase();
  const description = String(candidate?.error_description || candidate?.message || "").trim().toLowerCase();
  const combined = `${code} ${description}`;
  if (status === 429 || combined.includes("rate limit") || combined.includes("too many requests")) {
    return "AUTH_RATE_LIMITED";
  }
  if (combined.includes("email not confirmed") || code === "email_not_confirmed") {
    return "AUTH_EMAIL_NOT_CONFIRMED";
  }
  if (status === 400 || status === 401 || combined.includes("invalid login credentials")) {
    return "AUTH_INVALID_CREDENTIALS";
  }
  if (status >= 500) {
    return "AUTH_PROVIDER_UNAVAILABLE";
  }
  return "AUTH_SIGNIN_FAILED";
};

const parseResponsePayload = async (response: Response): Promise<unknown> => {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
};

const extractPayloadMessage = (payload: unknown): string => {
  const candidate = payload as {
    code?: string;
    error?: string;
    msg?: string;
    error_description?: string;
    message?: string;
    details?: string;
  } | null;
  return String(
    candidate?.error_description ||
      candidate?.message ||
      candidate?.msg ||
      candidate?.details ||
      candidate?.error ||
      candidate?.code ||
      ""
  )
    .trim()
    .toLowerCase();
};

const isAlreadyRegisteredPayload = (payload: unknown): boolean =>
  extractPayloadMessage(payload).includes("already registered");

const resolveSignUpErrorCode = (status: number, payload: unknown): string => {
  const message = extractPayloadMessage(payload);
  if (isAlreadyRegisteredPayload(payload)) {
    return "AUTH_USER_ALREADY_REGISTERED";
  }
  if (status === 429 || message.includes("rate limit") || message.includes("too many requests")) {
    return "AUTH_RATE_LIMITED";
  }
  if (message.includes("password should be at least") || message.includes("at least 6 characters")) {
    return "AUTH_WEAK_PASSWORD";
  }
  if (message.includes("invalid email") || message.includes("unable to validate email")) {
    return "AUTH_INVALID_EMAIL";
  }
  if (status >= 500) {
    return "AUTH_PROVIDER_UNAVAILABLE";
  }
  return "AUTH_BAD_REQUEST";
};

const resolvePasswordUpdateErrorCode = (status: number, payload: unknown): string => {
  const message = extractPayloadMessage(payload);
  if (message.includes("password should be at least") || message.includes("at least 6 characters")) {
    return "AUTH_WEAK_PASSWORD";
  }
  if (status === 401 || status === 403 || message.includes("jwt") || message.includes("token")) {
    return "AUTH_RESET_LINK_INVALID";
  }
  if (status >= 500) {
    return "AUTH_PROVIDER_UNAVAILABLE";
  }
  return "AUTH_BAD_REQUEST";
};

const sendVerificationRequiredResponse = (req: IncomingMessage, res: ServerResponse) => {
  clearCloudSessionCookies(req, res);
  sendJson(res, 200, VERIFICATION_REQUIRED_RESPONSE);
};

const buildServiceHeaders = (env: NonNullable<ReturnType<typeof ensureAuthEnv>>): HeadersInit => ({
  apikey: env.serviceRoleKey,
  Authorization: `Bearer ${env.serviceRoleKey}`,
  "Content-Type": "application/json"
});

const buildVerifiedRedirect = (req: IncomingMessage): string =>
  buildVerifiedRedirectUrl(resolveAppPublicOrigin(req));

const buildPasswordResetRedirect = (req: IncomingMessage): string =>
  buildPasswordResetRedirectUrl(resolveAppPublicOrigin(req));

const parseGeneratedActionLink = (payload: unknown): string | null => {
  const actionLink = String((payload as AdminGenerateLinkResponse | null)?.action_link ?? "").trim();
  return actionLink || null;
};

const generateAdminActionLink = async (
  env: NonNullable<ReturnType<typeof ensureAuthEnv>>,
  options: {
    type: "signup" | "magiclink" | "recovery";
    email: string;
    password?: string;
    redirectTo: string;
  }
): Promise<string> => {
  const body: Record<string, string> = {
    type: options.type,
    email: options.email,
    redirect_to: options.redirectTo
  };
  if (options.password) {
    body.password = options.password;
  }

  const response = await fetch(`${env.supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: buildServiceHeaders(env),
    body: JSON.stringify(body)
  });
  const payload = await parseResponsePayload(response);
  if (!response.ok) {
    const code = resolveSignUpErrorCode(response.status, payload);
    throw new Error(`${code}:${extractPayloadMessage(payload) || `http_${response.status}`}`);
  }
  const actionLink = parseGeneratedActionLink(payload);
  if (!actionLink) {
    throw new Error("AUTH_SESSION_INCOMPLETE:missing_action_link");
  }
  return actionLink;
};

const storePendingVerificationLinkSafe = async (
  email: string,
  confirmationUrl: string,
  kind: "signup" | "magiclink"
) => {
  try {
    await storePendingVerificationLink(email, {
      confirmationUrl,
      kind,
      createdAt: new Date().toISOString()
    });
  } catch {
    // Best effort. Email delivery is more important than cache persistence.
  }
};

const sendPasswordResetEmail = async (
  req: IncomingMessage,
  email: string,
  recoveryUrl: string
): Promise<void> => {
  try {
    await sendCloudPasswordResetEmail({
      to: email,
      recoveryUrl,
      req
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "password_reset_delivery_failed";
    throw new Error(`AUTH_EMAIL_DELIVERY_FAILED:${detail}`);
  }
};

const sendVerificationEmailBestEffort = async (
  req: IncomingMessage,
  email: string,
  confirmationUrl: string,
  kind: "signup" | "magiclink"
): Promise<boolean> => {
  await storePendingVerificationLinkSafe(email, confirmationUrl, kind);
  try {
    await sendCloudVerificationEmail({
      to: email,
      confirmationUrl,
      req
    });
    return true;
  } catch {
    // Keep signup and resend responses generic. Users can request another email later.
    return false;
  }
};

const resolveExistingVerificationLink = async (
  req: IncomingMessage,
  env: NonNullable<ReturnType<typeof ensureAuthEnv>>,
  email: string
): Promise<{ confirmationUrl: string; kind: "signup" | "magiclink" } | null> => {
  try {
    const cached = await readPendingVerificationLink(email);
    if (cached) {
      return {
        confirmationUrl: cached.confirmationUrl,
        kind: cached.kind
      };
    }
  } catch {
    // Ignore cache lookup failures and continue with provider lookup.
  }

  try {
    const existingUser = await fetchSupabaseAuthUserByEmail(env, email);
    if (!existingUser || isSupabaseAuthUserConfirmed(existingUser)) {
      return null;
    }
    const confirmationUrl = await generateAdminActionLink(env, {
      type: "magiclink",
      email,
      redirectTo: buildVerifiedRedirect(req)
    });
    return {
      confirmationUrl,
      kind: "magiclink"
    };
  } catch {
    return null;
  }
};

const sendRateLimitError = (
  res: ServerResponse,
  remaining: number,
  resetAt: number
) => {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  res.setHeader("x-ratelimit-remaining", String(remaining));
  res.setHeader("x-ratelimit-reset", String(resetAt));
  sendJson(res, 429, {
    error: {
      code: "AUTH_RATE_LIMITED",
      message: "Too many attempts. Please wait and try again."
    },
    retryAfter,
    remaining
  });
};

const ensureAuthEnv = (res: ServerResponse) => {
  const env = resolveCloudEnv();
  if (!hasCloudEnv(env)) {
    sendJson(res, 500, {
      error: {
        code: "SUPABASE_ENV_MISSING",
        message: "Supabase environment is not configured."
      }
    });
    return null;
  }
  return env;
};

const buildSessionResponse = (session: CloudSessionPayload | null) => ({
  session
});

const sendInvalidCredentials = (res: ServerResponse) => {
  sendJson(res, 401, {
    error: {
      code: "AUTH_INVALID_CREDENTIALS",
      message: "Invalid credentials."
    }
  });
};

export const signInHandler = async (req: IncomingMessage, res: ServerResponse) => {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
      return;
    }

    const env = ensureAuthEnv(res);
    if (!env) {
      return;
    }

    let body: AuthCredentialsBody = {};
    try {
      body = await readRequestBody<AuthCredentialsBody>(req);
    } catch (error) {
      sendBodyReadError(res, error);
      return;
    }

    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");
    if (!isEmailFormatValid(email) || !isPasswordFormatValid(password)) {
      sendJson(res, 400, {
        error: {
          code: "AUTH_INVALID_INPUT",
          message: "Valid email and password are required."
        }
      });
      return;
    }

    const ip = getClientIp(req);
    try {
      const limit = await checkRateLimit(ip, "auth_login");
      if (!limit.allowed) {
        sendRateLimitError(res, limit.remaining, limit.resetAt);
        return;
      }
    } catch (error) {
      if (error instanceof RedisStoreUnavailableError) {
        sendJson(res, 503, {
          error: {
            code: "AUTH_LIMITS_UNAVAILABLE",
            message: "Authentication rate limiting is temporarily unavailable."
          }
        });
        return;
      }
      throw error;
    }

    if (await isAccountLocked(email)) {
      sendJson(res, 423, {
        error: {
          code: "AUTH_ACCOUNT_LOCKED",
          message: "Account temporarily locked. Request a password reset email to continue."
        }
      });
      return;
    }

    const response = await fetch(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: buildCloudAuthHeaders(env),
      body: JSON.stringify({ email, password })
    });

    const payload = await parseResponsePayload(response);
    if (!response.ok) {
      const code = resolveSignInErrorCode(response.status, payload);
      if (code === "AUTH_INVALID_CREDENTIALS") {
        await recordFailedLoginAttempt(email);
        sendInvalidCredentials(res);
        return;
      }
      if (code === "AUTH_EMAIL_NOT_CONFIRMED") {
        sendJson(res, 401, {
          error: {
            code: "AUTH_EMAIL_NOT_CONFIRMED",
            message: "Email is not confirmed."
          }
        });
        return;
      }
      if (code === "AUTH_RATE_LIMITED") {
        sendJson(res, 429, {
          error: {
            code,
            message: "Too many attempts. Please wait and try again."
          }
        });
        return;
      }
      sendJson(res, response.status >= 500 ? 503 : 401, {
        error: {
          code,
          message: "Cloud auth failed."
        }
      });
      return;
    }

    const parsed = parseTokenResponse(payload as Record<string, unknown>);
    if (!parsed) {
      sendJson(res, 502, {
        error: {
          code: "AUTH_SESSION_INCOMPLETE",
          message: "Auth provider returned an incomplete session."
        }
      });
      return;
    }

    await clearFailedLoginAttempts(email);
    await clearPendingVerificationLink(email);
    await consumeVerifiedSigninMarker(email);
    setCloudSessionCookies(req, res, parsed.accessToken, parsed.refreshToken, parsed.expiresIn);
    sendJson(res, 200, buildSessionResponse(toCloudSessionPayload(parsed)));
  } catch (error) {
    sendJson(res, 500, {
      error: {
        code: "AUTH_SIGNIN_UNEXPECTED",
        message: error instanceof Error ? error.message : "Unexpected sign-in error."
      }
    });
  }
};

export const signUpHandler = async (req: IncomingMessage, res: ServerResponse) => {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
      return;
    }

    const env = ensureAuthEnv(res);
    if (!env) {
      return;
    }

    const runtimeConfig = await getRuntimeConfigWithFallback();
    if (!runtimeConfig.cloudSignupEnabled) {
      sendJson(res, 403, {
        error: {
          code: "AUTH_SIGNUP_DISABLED",
          message: "Cloud sign-up is currently disabled."
        }
      });
      return;
    }

    let body: AuthCredentialsBody = {};
    try {
      body = await readRequestBody<AuthCredentialsBody>(req);
    } catch (error) {
      sendBodyReadError(res, error);
      return;
    }

    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");
    if (!isEmailFormatValid(email) || !isPasswordFormatValid(password)) {
      sendJson(res, 400, {
        error: {
          code: "AUTH_INVALID_INPUT",
          message: "Valid email and password are required."
        }
      });
      return;
    }

    const ip = getClientIp(req);
    try {
      const limit = await checkRateLimit(ip, "auth_register");
      if (!limit.allowed) {
        sendRateLimitError(res, limit.remaining, limit.resetAt);
        return;
      }
    } catch (error) {
      if (error instanceof RedisStoreUnavailableError) {
        sendJson(res, 503, {
          error: {
            code: "AUTH_LIMITS_UNAVAILABLE",
            message: "Authentication rate limiting is temporarily unavailable."
          }
        });
        return;
      }
      throw error;
    }

    await recordVerificationSignupStarted();

    const existingUser = await fetchSupabaseAuthUserByEmail(env, email);
    if (existingUser) {
      if (isSupabaseAuthUserConfirmed(existingUser)) {
        sendJson(res, 409, {
          error: {
            code: "AUTH_USER_ALREADY_REGISTERED",
            message: "An account with this email already exists."
          }
        });
        return;
      }

      const pendingLink = await resolveExistingVerificationLink(req, env, email);
      if (pendingLink) {
        const delivered = await sendVerificationEmailBestEffort(
          req,
          email,
          pendingLink.confirmationUrl,
          pendingLink.kind
        );
        if (delivered) {
          await recordVerificationEmailSent();
        }
      }
      sendVerificationRequiredResponse(req, res);
      return;
    }

    try {
      const confirmationUrl = await generateAdminActionLink(env, {
        type: "signup",
        email,
        password,
        redirectTo: buildVerifiedRedirect(req)
      });
      await storePendingVerificationLinkSafe(email, confirmationUrl, "signup");
      try {
        await sendCloudVerificationEmail({
          to: email,
          confirmationUrl,
          req
        });
      } catch {
        sendJson(res, 502, {
          error: {
            code: "AUTH_EMAIL_DELIVERY_FAILED",
            message: "Verification email could not be sent."
          }
        });
        return;
      }
      await recordVerificationEmailSent();
      sendVerificationRequiredResponse(req, res);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const code = message.split(":")[0]?.trim() ?? "";

      if (code === "AUTH_RATE_LIMITED") {
        sendJson(res, 429, {
          error: {
            code,
            message: "Too many attempts. Please wait and try again."
          }
        });
        return;
      }

      if (code === "AUTH_WEAK_PASSWORD" || code === "AUTH_INVALID_EMAIL") {
        sendJson(res, 400, {
          error: {
            code,
            message: "Cloud signup failed."
          }
        });
        return;
      }

      sendJson(res, code === "AUTH_PROVIDER_UNAVAILABLE" ? 503 : 500, {
        error: {
          code: code || "AUTH_PROVIDER_UNAVAILABLE",
          message: "Cloud signup failed."
        }
      });
        return;
    }
  } catch (error) {
    sendJson(res, 500, {
      error: {
        code: "AUTH_SIGNUP_UNEXPECTED",
        message: error instanceof Error ? error.message : "Unexpected signup error."
      }
    });
  }
};

export const resendVerificationHandler = async (req: IncomingMessage, res: ServerResponse) => {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
      return;
    }

    const env = ensureAuthEnv(res);
    if (!env) {
      return;
    }

    let body: { email?: string } = {};
    try {
      body = await readRequestBody<{ email?: string }>(req);
    } catch (error) {
      sendBodyReadError(res, error);
      return;
    }

    const email = normalizeEmail(body.email);
    if (!isEmailFormatValid(email)) {
      sendJson(res, 400, {
        error: {
          code: "AUTH_INVALID_INPUT",
          message: "Valid email is required."
        }
      });
      return;
    }

    const ip = getClientIp(req);
    try {
      const limit = await checkRateLimit(ip, "auth_resend_verification");
      if (!limit.allowed) {
        sendRateLimitError(res, limit.remaining, limit.resetAt);
        return;
      }
    } catch (error) {
      if (error instanceof RedisStoreUnavailableError) {
        sendJson(res, 503, {
          error: {
            code: "AUTH_LIMITS_UNAVAILABLE",
            message: "Authentication rate limiting is temporarily unavailable."
          }
        });
        return;
      }
      throw error;
    }

    await recordVerificationResendRequested();

    const pendingLink = await resolveExistingVerificationLink(req, env, email);
    if (pendingLink) {
      await sendVerificationEmailBestEffort(req, email, pendingLink.confirmationUrl, pendingLink.kind);
    }

    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 500, {
      error: {
        code: "AUTH_RESEND_VERIFICATION_UNEXPECTED",
        message: error instanceof Error ? error.message : "Unexpected verification resend error."
      }
    });
  }
};

export const verificationEventHandler = async (req: IncomingMessage, res: ServerResponse) => {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
      return;
    }

    let body: VerificationEventBody = {};
    try {
      body = await readRequestBody<VerificationEventBody>(req);
    } catch (error) {
      sendBodyReadError(res, error);
      return;
    }

    const type = String(body.type ?? "").trim().toLowerCase();
    if (type === "confirm_opened") {
      await recordVerificationConfirmOpened();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (type === "verified_opened") {
      const accessToken = String(body.accessToken ?? "").trim();
      if (!accessToken) {
        sendJson(res, 200, { ok: true, email: null });
        return;
      }

      const env = ensureAuthEnv(res);
      if (!env) {
        return;
      }

      const user = await fetchSupabaseUser(env, accessToken);
      const normalizedEmail = normalizeEmail(user?.email);
      if (normalizedEmail) {
        await markVerificationCompleted(normalizedEmail);
      }
      sendJson(res, 200, { ok: true, email: normalizedEmail || null });
      return;
    }

    sendJson(res, 400, {
      error: {
        code: "AUTH_INVALID_EVENT",
        message: "Unknown verification event."
      }
    });
  } catch (error) {
    sendJson(res, 500, {
      error: {
        code: "AUTH_VERIFICATION_EVENT_UNEXPECTED",
        message: error instanceof Error ? error.message : "Unexpected verification event error."
      }
    });
  }
};

const refreshSession = async (
  req: IncomingMessage,
  res: ServerResponse
): Promise<CloudSessionPayload | null> => {
  const env = ensureAuthEnv(res);
  if (!env) {
    return null;
  }
  const refreshToken = readCloudRefreshToken(req);
  if (!refreshToken) {
    return null;
  }
  if (await isTokenRevoked(refreshToken)) {
    return null;
  }

  const response = await fetch(`${env.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: buildCloudAuthHeaders(env),
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  if (!response.ok) {
    return null;
  }
  const payload = await parseJson<Record<string, unknown>>(response);
  const parsed = parseTokenResponse(payload);
  if (!parsed) {
    return null;
  }
  await revokeToken(refreshToken, REFRESH_TOKEN_FALLBACK_TTL_SECONDS);
  setCloudSessionCookies(req, res, parsed.accessToken, parsed.refreshToken, parsed.expiresIn);
  return toCloudSessionPayload(parsed);
};

export const sessionHandler = async (req: IncomingMessage, res: ServerResponse) => {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
      return;
    }

    const env = ensureAuthEnv(res);
    if (!env) {
      return;
    }

    const access = readCloudAccessToken(req);
    if (access.token && !(await isTokenRevoked(access.token))) {
      const user = await fetchSupabaseUser(env, access.token);
      if (user) {
        sendJson(res, 200, buildSessionResponse({
          accessToken: access.token,
          expiresAt: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_FALLBACK_TTL_SECONDS,
          user
        }));
        return;
      }
    }

    const refreshed = await refreshSession(req, res);
    if (refreshed) {
      sendJson(res, 200, buildSessionResponse(refreshed));
      return;
    }

    clearCloudSessionCookies(req, res);
    sendJson(res, 401, {
      error: {
        code: "AUTH_UNAUTHORIZED",
        message: "No active session."
      }
    });
  } catch (error) {
    sendJson(res, 500, {
      error: {
        code: "AUTH_SESSION_UNEXPECTED",
        message: error instanceof Error ? error.message : "Unexpected session error."
      }
    });
  }
};

export const logoutHandler = async (req: IncomingMessage, res: ServerResponse) => {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
      return;
    }

    const env = ensureAuthEnv(res);
    if (!env) {
      return;
    }

    const access = readCloudAccessToken(req).token;
    const refresh = readCloudRefreshToken(req);

    if (access) {
      try {
        await fetch(`${env.supabaseUrl}/auth/v1/logout`, {
          method: "POST",
          headers: buildCloudAuthHeaders(env, access)
        });
      } catch {
        // Ignore provider logout failures and continue with local revocation.
      }
    }

    if (access) {
      await revokeToken(access, ACCESS_TOKEN_FALLBACK_TTL_SECONDS);
    }
    if (refresh) {
      await revokeToken(refresh, REFRESH_TOKEN_FALLBACK_TTL_SECONDS);
    }

    clearCloudSessionCookies(req, res);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 500, {
      error: {
        code: "AUTH_LOGOUT_UNEXPECTED",
        message: error instanceof Error ? error.message : "Unexpected logout error."
      }
    });
  }
};

export const oauthHashHandler = async (req: IncomingMessage, res: ServerResponse) => {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
      return;
    }
    const env = ensureAuthEnv(res);
    if (!env) {
      return;
    }

    let body: OAuthHashBody = {};
    try {
      body = await readRequestBody<OAuthHashBody>(req);
    } catch (error) {
      sendBodyReadError(res, error);
      return;
    }

    const accessToken = String(body.accessToken ?? "").trim();
    const refreshToken = String(body.refreshToken ?? "").trim();
    const expiresIn = Number(body.expiresIn ?? 0);
    if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      sendJson(res, 400, {
        error: {
          code: "AUTH_INVALID_INPUT",
          message: "Missing OAuth token payload."
        }
      });
      return;
    }

    const user = await fetchSupabaseUser(env, accessToken);
    if (!user) {
      sendJson(res, 401, {
        error: {
          code: "AUTH_UNAUTHORIZED",
          message: "OAuth session could not be verified."
        }
      });
      return;
    }

    setCloudSessionCookies(req, res, accessToken, refreshToken, expiresIn);
    sendJson(res, 200, buildSessionResponse({
      accessToken,
      expiresAt: Math.floor(Date.now() / 1000) + Math.max(1, Math.round(expiresIn)),
      user
    }));
  } catch (error) {
    sendJson(res, 500, {
      error: {
        code: "AUTH_OAUTH_UNEXPECTED",
        message: error instanceof Error ? error.message : "Unexpected OAuth processing error."
      }
    });
  }
};

export const passwordResetEmailHandler = async (req: IncomingMessage, res: ServerResponse) => {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
      return;
    }
    const env = ensureAuthEnv(res);
    if (!env) {
      return;
    }

    let body: PasswordResetBody = {};
    try {
      body = await readRequestBody<PasswordResetBody>(req);
    } catch (error) {
      sendBodyReadError(res, error);
      return;
    }

    const email = normalizeEmail(body.email);
    if (!isEmailFormatValid(email)) {
      sendJson(res, 400, {
        error: {
          code: "AUTH_INVALID_INPUT",
          message: "Valid email is required."
        }
      });
      return;
    }

    const ip = getClientIp(req);
    try {
      const limit = await checkRateLimit(ip, "auth_unlock");
      if (!limit.allowed) {
        sendRateLimitError(res, limit.remaining, limit.resetAt);
        return;
      }
    } catch (error) {
      if (error instanceof RedisStoreUnavailableError) {
        sendJson(res, 503, {
          error: {
            code: "AUTH_LIMITS_UNAVAILABLE",
            message: "Authentication rate limiting is temporarily unavailable."
          }
        });
        return;
      }
      throw error;
    }

    const existingUser = await fetchSupabaseAuthUserByEmail(env, email);
    if (!existingUser) {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (!isSupabaseAuthUserConfirmed(existingUser)) {
      const pendingLink = await resolveExistingVerificationLink(req, env, email);
      if (pendingLink) {
        const delivered = await sendVerificationEmailBestEffort(
          req,
          email,
          pendingLink.confirmationUrl,
          pendingLink.kind
        );
        if (!delivered) {
          sendJson(res, 502, {
            error: {
              code: "AUTH_EMAIL_DELIVERY_FAILED",
              message: "Verification email could not be sent."
            }
          });
          return;
        }
        await recordVerificationEmailSent();
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    const recoveryUrl = await generateAdminActionLink(env, {
      type: "recovery",
      email,
      redirectTo: buildPasswordResetRedirect(req)
    });
    await sendPasswordResetEmail(req, email, recoveryUrl);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = message.split(":")[0]?.trim() ?? "";
    if (code === "AUTH_PROVIDER_UNAVAILABLE") {
      sendJson(res, 503, {
        error: {
          code,
          message: "Cloud auth service is temporarily unavailable."
        }
      });
      return;
    }
    if (code === "AUTH_EMAIL_DELIVERY_FAILED") {
      sendJson(res, 502, {
        error: {
          code,
          message: "Password reset email could not be sent."
        }
      });
      return;
    }
    sendJson(res, 500, {
      error: {
        code: "AUTH_PASSWORD_RESET_EMAIL_UNEXPECTED",
        message: error instanceof Error ? error.message : "Unexpected password reset email error."
      }
    });
  }
};

export const resetPasswordHandler = async (req: IncomingMessage, res: ServerResponse) => {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
      return;
    }

    const env = ensureAuthEnv(res);
    if (!env) {
      return;
    }

    let body: PasswordUpdateBody = {};
    try {
      body = await readRequestBody<PasswordUpdateBody>(req);
    } catch (error) {
      sendBodyReadError(res, error);
      return;
    }

    const accessToken = String(body.accessToken ?? "").trim();
    const password = String(body.password ?? "");
    if (!accessToken || !isPasswordFormatValid(password)) {
      sendJson(res, 400, {
        error: {
          code: "AUTH_INVALID_INPUT",
          message: "Recovery token and a valid password are required."
        }
      });
      return;
    }

    const response = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: env.anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ password })
    });
    const payload = await parseResponsePayload(response);
    if (!response.ok) {
      const code = resolvePasswordUpdateErrorCode(response.status, payload);
      sendJson(res, code === "AUTH_PROVIDER_UNAVAILABLE" ? 503 : 400, {
        error: {
          code,
          message:
            code === "AUTH_RESET_LINK_INVALID"
              ? "Password reset link is invalid or expired."
              : "Password reset failed."
        }
      });
      return;
    }

    const user = payload as SupabaseUserUpdateResponse | null;
    const normalizedEmail = normalizeEmail(user?.email);
    if (normalizedEmail) {
      await clearFailedLoginAttempts(normalizedEmail);
      await clearPendingVerificationLink(normalizedEmail);
    }

    clearCloudSessionCookies(req, res);
    sendJson(res, 200, {
      ok: true,
      email: normalizedEmail || null
    });
  } catch (error) {
    sendJson(res, 500, {
      error: {
        code: "AUTH_RESET_PASSWORD_UNEXPECTED",
        message: error instanceof Error ? error.message : "Unexpected password reset error."
      }
    });
  }
};

export const unlockEmailHandler = passwordResetEmailHandler;
