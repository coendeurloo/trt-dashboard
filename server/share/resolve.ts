import { IncomingMessage, ServerResponse } from "node:http";
import { getTrustedClientIp } from "../../api/_lib/clientIp.js";
import { checkRateLimit } from "../../api/_lib/rateLimit.js";
import { RedisStoreUnavailableError } from "../../api/_lib/redisStore.js";
import { decryptShareToken, ShareCryptoConfigError } from "../../api/_lib/shareCrypto.js";
import { loadShareRecord, ShareStoreUnavailableError } from "../../api/_lib/shareStore.js";

const SHARE_CODE_PATTERN = /^[A-Za-z0-9]{8,24}$/;

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
};

const readCode = (req: IncomingMessage): string => {
  const requestUrl = req.url ?? "";
  const parsed = new URL(requestUrl, "http://localhost");
  return (parsed.searchParams.get("code") ?? "").trim();
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: { message: "Method not allowed" } });
      return;
    }

    const ip = getTrustedClientIp(req);
    try {
      const limit = await checkRateLimit(ip, "share_resolve");
      const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
      res.setHeader("x-ratelimit-remaining", String(limit.remaining));
      res.setHeader("x-ratelimit-reset", String(limit.resetAt));
      if (!limit.allowed) {
        sendJson(res, 429, {
          error: {
            code: "SHARE_RATE_LIMIT",
            message: "Too many share-link lookups. Try again later."
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
      // Best effort limiter for resolve path.
    }

    const code = readCode(req);
    if (!SHARE_CODE_PATTERN.test(code)) {
      sendJson(res, 400, {
        error: {
          code: "SHARE_CODE_INVALID",
          message: "Invalid share code"
        }
      });
      return;
    }

    const stored = await loadShareRecord(code);
    if (!stored) {
      sendJson(res, 404, {
        error: {
          code: "SHARE_LINK_NOT_FOUND",
          message: "Share link not found or expired"
        }
      });
      return;
    }

    const token = decryptShareToken({
      v: stored.v,
      iv: stored.iv,
      tag: stored.tag,
      data: stored.data
    });

    sendJson(res, 200, {
      token,
      expiresAt: stored.expiresAt
    });
  } catch (error) {
    if (error instanceof ShareStoreUnavailableError || error instanceof ShareCryptoConfigError) {
      sendJson(res, 503, {
        error: {
          code: error.code,
          message: error.message
        }
      });
      return;
    }

    sendJson(res, 500, {
      error: {
        code: "SHARE_RESOLVE_FAILED",
        message: error instanceof Error ? error.message : "Unexpected server error"
      }
    });
  }
}
