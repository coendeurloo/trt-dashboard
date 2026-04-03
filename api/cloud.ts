import { IncomingMessage, ServerResponse } from "node:http";
import {
  logoutHandler,
  oauthHashHandler,
  passwordResetEmailHandler,
  resendVerificationHandler,
  resetPasswordHandler,
  sessionHandler,
  signInHandler,
  signUpHandler,
  unlockEmailHandler,
  verificationEventHandler
} from "../server/cloud/auth.js";
import consentHandler from "../server/cloud/consent.js";
import deleteAccountHandler from "../server/cloud/delete-account.js";
import incrementalHandler from "../server/cloud/incremental.js";
import { hasCloudEnv, resolveCloudAuthContext, resolveCloudEnv } from "../server/cloud/authShared.js";
import replaceHandler from "../server/cloud/replace.js";

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
};

const resolveCloudAction = (req: IncomingMessage): string => {
  const parsed = new URL(req.url ?? "", "http://localhost");
  const fromQuery = String(parsed.searchParams.get("action") ?? "").trim().toLowerCase();
  if (fromQuery) {
    return fromQuery;
  }

  const pathMatch = parsed.pathname.match(/^\/api\/cloud\/([^/?#]+)$/i);
  if (pathMatch?.[1]) {
    return pathMatch[1].trim().toLowerCase();
  }

  return "";
};

const PROTECTED_ACTIONS = new Set([
  "consent",
  "replace",
  "incremental",
  "delete-account"
]);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const action = resolveCloudAction(req);
  if (PROTECTED_ACTIONS.has(action)) {
    const env = resolveCloudEnv();
    if (!hasCloudEnv(env)) {
      sendJson(res, 500, {
        error: {
          code: "SUPABASE_ENV_MISSING",
          message: "Supabase environment is not configured."
        }
      });
      return;
    }

    const context = await resolveCloudAuthContext(req, env);
    if (!context) {
      sendJson(res, 401, {
        error: {
          code: "AUTH_REQUIRED",
          message: "Authentication required."
        }
      });
      return;
    }

    // Keep legacy handlers working by injecting a bearer header when auth came from cookies.
    if (context.source === "cookie" && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${context.accessToken}`;
    }
  }

  if (action === "consent") {
    await consentHandler(req, res);
    return;
  }
  if (action === "replace") {
    await replaceHandler(req, res);
    return;
  }
  if (action === "incremental") {
    await incrementalHandler(req, res);
    return;
  }
  if (action === "delete-account") {
    await deleteAccountHandler(req, res);
    return;
  }
  if (action === "auth-signin") {
    await signInHandler(req, res);
    return;
  }
  if (action === "auth-signup") {
    await signUpHandler(req, res);
    return;
  }
  if (action === "auth-resend-verification") {
    await resendVerificationHandler(req, res);
    return;
  }
  if (action === "auth-me") {
    await sessionHandler(req, res);
    return;
  }
  if (action === "auth-logout") {
    await logoutHandler(req, res);
    return;
  }
  if (action === "auth-oauth-hash") {
    await oauthHashHandler(req, res);
    return;
  }
  if (action === "auth-unlock-email") {
    await unlockEmailHandler(req, res);
    return;
  }
  if (action === "auth-password-reset-email") {
    await passwordResetEmailHandler(req, res);
    return;
  }
  if (action === "auth-reset-password") {
    await resetPasswordHandler(req, res);
    return;
  }
  if (action === "auth-verification-event") {
    await verificationEventHandler(req, res);
    return;
  }

  sendJson(res, 404, {
    error: {
      code: "CLOUD_ACTION_NOT_FOUND",
      message: "Unknown cloud action"
    }
  });
}
