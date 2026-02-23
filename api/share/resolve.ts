import { IncomingMessage, ServerResponse } from "node:http";
import { decryptShareToken, ShareCryptoConfigError } from "../_lib/shareCrypto.js";
import { loadShareRecord, ShareStoreUnavailableError } from "../_lib/shareStore.js";

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
