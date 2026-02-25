import { IncomingMessage, ServerResponse } from "node:http";
import { checkRateLimit } from "../claude/rateLimit.js";
import { RedisStoreUnavailableError } from "../_lib/redisStore.js";

interface GeminiAnalysisPayload {
  model: string;
  max_tokens: number;
  temperature?: number;
  messages?: Array<{
    role: string;
    content: string;
  }>;
}

interface ProxyRequestBody {
  payload?: GeminiAnalysisPayload;
  requestType?: "analysis" | "extraction";
}

const MAX_JSON_BYTES = 4 * 1024 * 1024;

const aiLimitsDisabled = (): boolean => {
  const raw = String(process.env.AI_LIMITS_DISABLED ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
};

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
};

const readJsonBody = async (req: IncomingMessage): Promise<ProxyRequestBody> =>
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
        resolve(JSON.parse(raw) as ProxyRequestBody);
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", (error) => {
      cleanup();
      reject(error);
    });
  });

const getClientIp = (req: IncomingMessage): string => {
  const forwarded = req.headers["x-forwarded-for"];
  const candidate = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (candidate && typeof candidate === "string") {
    const first = candidate.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return req.socket.remoteAddress ?? "unknown";
};

const extractText = (body: ProxyRequestBody): string => {
  const content = body.payload?.messages?.[0]?.content;
  return typeof content === "string" ? content : "";
};

const toGeminiPayload = (body: ProxyRequestBody) => {
  const prompt = extractText(body);
  return {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: body.payload?.temperature ?? 0.3,
      maxOutputTokens: body.payload?.max_tokens ?? 2400
    }
  };
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: { message: "Method not allowed" } });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
    if (!apiKey) {
      sendJson(res, 401, { error: { message: "Missing GEMINI_API_KEY on server" } });
      return;
    }

    let body: ProxyRequestBody;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      sendJson(res, 400, { error: { message: error instanceof Error ? error.message : "Invalid request body" } });
      return;
    }

    if (!body.payload || typeof body.payload !== "object") {
      sendJson(res, 400, { error: { message: "Missing payload" } });
      return;
    }

    if (!aiLimitsDisabled()) {
      const ip = getClientIp(req);
      let limit: Awaited<ReturnType<typeof checkRateLimit>>;
      try {
        limit = await checkRateLimit(ip, "analysis");
      } catch (error) {
        if (
          error instanceof RedisStoreUnavailableError ||
          (typeof error === "object" && error !== null && (error as { code?: string }).code === "AI_LIMITS_UNAVAILABLE")
        ) {
          sendJson(res, 503, {
            error: {
              code: "AI_LIMITS_UNAVAILABLE",
              message: "AI limits store unavailable. Try again later."
            }
          });
          return;
        }
        throw error;
      }
      const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
      res.setHeader("x-ratelimit-remaining", String(limit.remaining));
      res.setHeader("x-ratelimit-reset", String(limit.resetAt));
      if (!limit.allowed) {
        sendJson(res, 429, {
          error: {
            code: "AI_RATE_LIMIT",
            message: "Rate limit exceeded"
          },
          retryAfter,
          remaining: limit.remaining
        });
        return;
      }
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          body.payload.model
        )}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(toGeminiPayload(body))
        }
      );

      const responseText = await response.text();
      if (!response.ok) {
        let detail = responseText;
        try {
          const parsed = JSON.parse(responseText) as { error?: { message?: string; status?: string } };
          detail = parsed.error?.message ?? parsed.error?.status ?? responseText;
        } catch {
          // keep raw text
        }
        sendJson(res, response.status, { error: { message: detail } });
        return;
      }

      let text = "";
      try {
        const parsed = JSON.parse(responseText) as {
          candidates?: Array<{
            content?: {
              parts?: Array<{ text?: string }>;
            };
            finishReason?: string;
          }>;
        };
        text = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim() ?? "";
        const finishReason = parsed.candidates?.[0]?.finishReason === "MAX_TOKENS" ? "max_tokens" : "end_turn";
        sendJson(res, 200, {
          content: [{ type: "text", text }],
          stop_reason: finishReason
        });
      } catch {
        sendJson(res, 502, { error: { message: "Gemini API response parse failed" } });
      }
    } catch {
      sendJson(res, 502, { error: { message: "Gemini API unreachable" } });
    }
  } catch (error) {
    if (!res.writableEnded) {
      sendJson(res, 500, {
        error: {
          message: error instanceof Error ? error.message : "Unexpected server error"
        }
      });
    }
  }
}
