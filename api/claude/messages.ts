import { IncomingMessage, ServerResponse } from "node:http";
import { getRuntimeConfigWithFallback } from "../_lib/adminRuntimeConfig.js";
import { checkRateLimit } from "../_lib/rateLimit.js";
import { RedisStoreUnavailableError } from "../_lib/redisStore.js";
import { requireAiEntitlement } from "../_lib/entitlements.js";
import { captureServerException, initServerSentry, withServerMonitoringSpan } from "../_lib/sentry.js";

interface ClaudeMessagePayload {
  model: string;
  max_tokens: number;
  temperature?: number;
  stream?: boolean;
  system?:
    | string
    | Array<{
        type: "text";
        text: string;
        cache_control?: { type: "ephemeral" };
      }>;
  messages: Array<{
    role: string;
    content:
      | string
      | Array<
          | { type: "text"; text: string; cache_control?: { type: "ephemeral" } }
          | {
              type: "document";
              source: {
                type: "base64";
                media_type: "application/pdf";
                data: string;
              };
            }
        >;
  }>;
}

interface ProxyRequestBody {
  payload?: ClaudeMessagePayload;
  requestType?: "extraction" | "analysis";
}

const MAX_JSON_BYTES = 8 * 1024 * 1024;

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

const pipeWebResponseStream = async (upstream: Response, res: ServerResponse): Promise<void> => {
  if (!upstream.body) {
    res.statusCode = 502;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: { message: "Anthropic stream body missing" } }));
    return;
  }

  res.statusCode = upstream.status;
  res.setHeader("content-type", "text/event-stream; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("connection", "keep-alive");
  res.setHeader("x-accel-buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value || value.length === 0) {
        continue;
      }
      res.write(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  res.end();
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

const readParsedBody = (req: IncomingMessage): ProxyRequestBody | null => {
  const possibleBody = (req as IncomingMessage & { body?: unknown }).body;
  if (possibleBody === undefined || possibleBody === null) {
    return null;
  }
  if (typeof possibleBody === "string") {
    try {
      return JSON.parse(possibleBody) as ProxyRequestBody;
    } catch {
      return null;
    }
  }
  if (Buffer.isBuffer(possibleBody)) {
    try {
      return JSON.parse(possibleBody.toString("utf8")) as ProxyRequestBody;
    } catch {
      return null;
    }
  }
  if (typeof possibleBody === "object") {
    return possibleBody as ProxyRequestBody;
  }
  return null;
};

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

const inferRequestType = (body: ProxyRequestBody): "analysis" | "extraction" => {
  if (body.requestType === "analysis" || body.requestType === "extraction") {
    return body.requestType;
  }
  const firstMessage = body.payload?.messages?.[0];
  const prompt =
    typeof firstMessage?.content === "string"
      ? firstMessage.content
      : Array.isArray(firstMessage?.content)
        ? firstMessage.content
            .filter((block): block is { type: "text"; text: string } => block?.type === "text" && typeof block.text === "string")
            .map((block) => block.text)
            .join("\n")
        : "";
  if (/LAB TEXT START|Extract blood lab data/i.test(prompt)) {
    return "extraction";
  }
  return "analysis";
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  initServerSentry();

  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: { message: "Method not allowed" } });
      return;
    }

    const apiKey = process.env.CLAUDE_API_KEY?.trim() ?? "";
    if (!apiKey) {
      sendJson(res, 401, { error: { message: "Missing CLAUDE_API_KEY on server" } });
      return;
    }

    let body: ProxyRequestBody;
    const preParsedBody = readParsedBody(req);
    if (preParsedBody) {
      body = preParsedBody;
    } else {
      try {
        body = await readJsonBody(req);
      } catch (error) {
        sendJson(res, 400, { error: { message: error instanceof Error ? error.message : "Invalid request body" } });
        return;
      }
    }

    if (!body.payload || typeof body.payload !== "object") {
      sendJson(res, 400, { error: { message: "Missing payload" } });
      return;
    }

    const requestType = inferRequestType(body);
    const runtimeConfig = await getRuntimeConfigWithFallback();
    if (requestType === "analysis" && !runtimeConfig.aiAnalysisEnabled) {
      sendJson(res, 403, {
        error: {
          code: "AI_ANALYSIS_DISABLED",
          message: "AI analysis is disabled by admin runtime config."
        }
      });
      return;
    }

    const entitlement = requireAiEntitlement(req, requestType);
    if (!entitlement.allowed && entitlement.error) {
      sendJson(res, entitlement.error.statusCode, {
        error: {
          code: entitlement.error.code,
          message: entitlement.error.message
        }
      });
      return;
    }

    if (!aiLimitsDisabled()) {
      const ip = getClientIp(req);
      let limit: Awaited<ReturnType<typeof checkRateLimit>>;
      try {
        limit = await checkRateLimit(ip, requestType);
      } catch (error) {
        if (error instanceof RedisStoreUnavailableError || (typeof error === "object" && error !== null && (error as { code?: string }).code === "AI_LIMITS_UNAVAILABLE")) {
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

    const upstreamAbort = new AbortController();
    const onClientClose = () => upstreamAbort.abort();
    req.on("close", onClientClose);
    try {
      const anthropicResponse = await withServerMonitoringSpan(
        {
          name: "api.claude.proxy_request",
          op: "labtracker.api",
          attributes: {
            route: "/api/claude/messages",
            request_type: requestType,
            stream: body.payload.stream === true,
            model: body.payload.model
          }
        },
        () =>
          fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01"
            },
            signal: upstreamAbort.signal,
            body: JSON.stringify(body.payload)
          })
      );

      const requestedStreaming = body.payload.stream === true;
      const upstreamContentType = anthropicResponse.headers.get("content-type") ?? "";
      const isStreamResponse = anthropicResponse.ok && requestedStreaming && upstreamContentType.includes("text/event-stream");

      if (isStreamResponse) {
        await pipeWebResponseStream(anthropicResponse, res);
        return;
      }

      const responseText = await anthropicResponse.text();
      if (anthropicResponse.ok) {
        try {
          const parsed = JSON.parse(responseText) as {
            model?: string;
            usage?: {
              input_tokens?: number;
              output_tokens?: number;
              cache_creation_input_tokens?: number;
              cache_read_input_tokens?: number;
            };
          };
          const usage = parsed?.usage ?? {};
          await withServerMonitoringSpan(
            {
              name: "api.claude.proxy_usage",
              op: "labtracker.api",
              attributes: {
                route: "/api/claude/messages",
                request_type: requestType,
                stream: false,
                model: parsed?.model ?? body.payload.model,
                input_tokens: usage.input_tokens,
                output_tokens: usage.output_tokens,
                cache_creation_input_tokens: usage.cache_creation_input_tokens,
                cache_read_input_tokens: usage.cache_read_input_tokens
              }
            },
            async () => undefined
          );
        } catch {
          // Keep response path untouched when JSON parsing fails.
        }
      }
      res.statusCode = anthropicResponse.status;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(responseText);
    } catch (error) {
      if (typeof error === "object" && error !== null && "name" in error && (error as { name?: string }).name === "AbortError") {
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }
      await captureServerException(error, {
        tags: {
          route: "/api/claude/messages",
          flow: "claude_proxy",
          request_type: requestType
        },
        extra: {
          stream: body.payload.stream === true
        },
        fingerprint: ["api-claude-proxy-unreachable", requestType]
      });
      sendJson(res, 502, { error: { message: "Anthropic API unreachable" } });
    } finally {
      req.off("close", onClientClose);
    }
  } catch (error) {
    await captureServerException(error, {
      tags: {
        route: "/api/claude/messages",
        flow: "claude_proxy"
      },
      extra: {
        method: req.method ?? "unknown"
      },
      fingerprint: ["api-claude-unexpected-error"]
    });
    if (!res.writableEnded) {
      sendJson(res, 500, {
        error: {
          message: error instanceof Error ? error.message : "Unexpected server error"
        }
      });
    }
  }
}
