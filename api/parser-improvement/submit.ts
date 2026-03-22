import { IncomingMessage, ServerResponse } from "node:http";
import { getRuntimeConfigWithFallback } from "../_lib/adminRuntimeConfig.js";
import { checkRateLimit } from "../_lib/rateLimit.js";
import { RedisStoreUnavailableError } from "../_lib/redisStore.js";
import {
  getClientIp,
  getRouteErrorDetails,
  parseParserImprovementSubmission,
  sendJson
} from "../_lib/parserImprovement.js";
import { sendParserImprovementEmail } from "../_lib/parserImprovementEmail.js";

const FALLBACK_WINDOW_MS = 60 * 60 * 1000;
const FALLBACK_MAX_REQUESTS = 5;
const fallbackRateLimitStore = new Map<string, { count: number; resetAt: number }>();

const checkFallbackRateLimit = (ip: string): { allowed: boolean; remaining: number } => {
  const now = Date.now();
  const current = fallbackRateLimitStore.get(ip);
  if (!current || current.resetAt <= now) {
    fallbackRateLimitStore.set(ip, { count: 1, resetAt: now + FALLBACK_WINDOW_MS });
    return {
      allowed: true,
      remaining: FALLBACK_MAX_REQUESTS - 1
    };
  }

  current.count += 1;
  fallbackRateLimitStore.set(ip, current);
  return {
    allowed: current.count <= FALLBACK_MAX_REQUESTS,
    remaining: Math.max(0, FALLBACK_MAX_REQUESTS - current.count)
  };
};

const logFailure = (params: { code: string; message: string; fileName?: string; fileSize?: number }) => {
  console.error("[parser-improvement] request failed", {
    code: params.code,
    message: params.message,
    fileName: params.fileName,
    fileSize: params.fileSize
  });
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
    return;
  }

  const runtimeConfig = await getRuntimeConfigWithFallback();
  if (!runtimeConfig.parserImprovementEnabled) {
    sendJson(res, 403, {
      error: {
        code: "PARSER_IMPROVEMENT_DISABLED",
        message: "Parser improvement submissions are disabled by admin runtime config."
      }
    });
    return;
  }

  const ip = getClientIp(req);
  try {
    try {
      const limit = await checkRateLimit(ip, "parser_improvement");
      res.setHeader("x-ratelimit-remaining", String(limit.remaining));
      res.setHeader("x-ratelimit-reset", String(limit.resetAt));
      if (!limit.allowed) {
        sendJson(res, 429, { error: { code: "RATE_LIMITED", message: "Too many parser-improvement submissions. Try again later." } });
        return;
      }
    } catch (error) {
      if (!(error instanceof RedisStoreUnavailableError)) {
        throw error;
      }

      const fallbackLimit = checkFallbackRateLimit(ip);
      if (!fallbackLimit.allowed) {
        sendJson(res, 429, { error: { code: "RATE_LIMITED", message: "Too many parser-improvement submissions. Try again later." } });
        return;
      }
      // TODO: remove this fallback once parser-improvement submissions have a dedicated shared limiter.
    }

    const submission = await parseParserImprovementSubmission(req);
    await sendParserImprovementEmail(submission);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    const details = getRouteErrorDetails(error);
    logFailure({
      code: details.code,
      message: details.message,
      fileName:
        error && typeof error === "object" && "fileName" in error ? String((error as { fileName?: unknown }).fileName ?? "") : undefined,
      fileSize:
        error && typeof error === "object" && "fileSize" in error
          ? Number((error as { fileSize?: unknown }).fileSize ?? 0)
          : undefined
    });
    sendJson(res, details.statusCode, {
      error: {
        code: details.code,
        message: details.message
      }
    });
  }
}
