import { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { encryptShareToken, ShareCryptoConfigError } from "../_lib/shareCrypto.js";
import { saveShareRecord, ShareStoreUnavailableError } from "../_lib/shareStore.js";

interface ShortenRequestBody {
  token?: string;
}

const MAX_JSON_BYTES = 280 * 1024;
const MAX_TOKEN_CHARS = 220_000;
const SHARE_CODE_LENGTH = 12;
const SHARE_TTL_SECONDS = 30 * 24 * 60 * 60;
const ALLOWED_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
};

const readParsedBody = (req: IncomingMessage): ShortenRequestBody | null => {
  const possibleBody = (req as IncomingMessage & { body?: unknown }).body;
  if (possibleBody === undefined || possibleBody === null) {
    return null;
  }
  if (typeof possibleBody === "string") {
    try {
      return JSON.parse(possibleBody) as ShortenRequestBody;
    } catch {
      return null;
    }
  }
  if (Buffer.isBuffer(possibleBody)) {
    try {
      return JSON.parse(possibleBody.toString("utf8")) as ShortenRequestBody;
    } catch {
      return null;
    }
  }
  if (typeof possibleBody === "object") {
    return possibleBody as ShortenRequestBody;
  }
  return null;
};

const readJsonBody = async (req: IncomingMessage): Promise<ShortenRequestBody> =>
  new Promise((resolve, reject) => {
    if (req.readableEnded) {
      resolve({});
      return;
    }

    const chunks: Buffer[] = [];
    let total = 0;
    const timeout = setTimeout(() => reject(new Error("Request body timeout")), 12000);

    const cleanup = () => clearTimeout(timeout);

    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_JSON_BYTES) {
        cleanup();
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      cleanup();
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as ShortenRequestBody);
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", (error) => {
      cleanup();
      reject(error);
    });
  });

const normalizePublicOrigin = (): string => {
  const raw = process.env.SHARE_PUBLIC_ORIGIN?.trim() || "https://labtracker.app";
  return raw.replace(/\/+$/, "");
};

const generateShareCode = (length: number): string => {
  let code = "";
  const bytes = randomBytes(length);
  for (let index = 0; index < length; index += 1) {
    const byte = bytes[index] ?? 0;
    code += ALLOWED_CODE_CHARS[byte % ALLOWED_CODE_CHARS.length];
  }
  return code;
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: { message: "Method not allowed" } });
      return;
    }

    let body: ShortenRequestBody;
    const preParsedBody = readParsedBody(req);
    if (preParsedBody) {
      body = preParsedBody;
    } else {
      try {
        body = await readJsonBody(req);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body";
        const status = message === "Request body too large" ? 413 : 400;
        sendJson(res, status, { error: { message } });
        return;
      }
    }

    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      sendJson(res, 400, { error: { code: "SHARE_TOKEN_REQUIRED", message: "Missing token" } });
      return;
    }

    if (token.length > MAX_TOKEN_CHARS) {
      sendJson(res, 413, {
        error: {
          code: "SHARE_SNAPSHOT_TOO_LARGE",
          message: "Snapshot payload too large for short sharing"
        }
      });
      return;
    }

    const encrypted = encryptShareToken(token);
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + SHARE_TTL_SECONDS * 1000);
    const code = generateShareCode(SHARE_CODE_LENGTH);

    await saveShareRecord(
      code,
      {
        v: 1,
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        iv: encrypted.iv,
        tag: encrypted.tag,
        data: encrypted.data
      },
      SHARE_TTL_SECONDS
    );

    const shareUrl = `${normalizePublicOrigin()}/s/${code}`;
    sendJson(res, 200, {
      code,
      shareUrl,
      expiresAt: expiresAt.toISOString()
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
        code: "SHARE_SHORTEN_FAILED",
        message: error instanceof Error ? error.message : "Unexpected server error"
      }
    });
  }
}
