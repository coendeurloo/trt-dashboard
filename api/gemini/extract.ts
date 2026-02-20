import { IncomingMessage, ServerResponse } from "node:http";
import { checkRateLimit } from "../claude/rateLimit.js";

interface GeminiExtractRequestBody {
  fileName?: string;
  pdfText?: string;
  pdfBase64?: string | null;
  mode?: "text_only" | "pdf_rescue";
  traceId?: string;
  fileHash?: string;
}

interface GeminiMarker {
  marker: string;
  value: number | string;
  unit?: string;
  referenceMin?: number | string | null;
  referenceMax?: number | string | null;
  confidence?: number;
}

interface GeminiExtractionPayload {
  testDate?: string;
  markers?: GeminiMarker[];
}

interface GeminiUsage {
  inputTokens: number;
  outputTokens: number;
}

interface CachedEntry {
  expiresAt: number;
  payload: {
    model: string;
    testDate?: string;
    markers: GeminiMarker[];
    usage: GeminiUsage;
  };
}

const MAX_JSON_BYTES = 18 * 1024 * 1024;
const PRIMARY_MODEL = "gemini-2.5-flash-lite";
const TECHNICAL_FALLBACK_MODEL = "gemini-2.0-flash";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

const responseCache = new Map<string, CachedEntry>();
const dailySpendEur = new Map<string, number>();
const monthlySpendEur = new Map<string, number>();
const dailyUserCalls = new Map<string, number>();

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
};

const readJsonBody = async (req: IncomingMessage): Promise<GeminiExtractRequestBody> =>
  new Promise((resolve, reject) => {
    if (req.readableEnded) {
      resolve({});
      return;
    }

    const chunks: Buffer[] = [];
    let total = 0;
    const timeout = setTimeout(() => reject(new Error("Request body timeout")), 15000);
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
        resolve(JSON.parse(raw) as GeminiExtractRequestBody);
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

const extractJsonBlock = (input: string): string | null => {
  const fenced = input.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = input.indexOf("{");
  const end = input.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return input.slice(start, end + 1);
};

const parseNumericEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const DAILY_BUDGET_EUR = parseNumericEnv("AI_DAILY_BUDGET_EUR", 0);
const MONTHLY_BUDGET_EUR = parseNumericEnv("AI_MONTHLY_BUDGET_EUR", 0);
const MAX_CALLS_PER_USER_PER_DAY = Math.max(1, Math.round(parseNumericEnv("AI_PARSER_MAX_CALLS_PER_USER_PER_DAY", 20)));
const INPUT_COST_PER_MTOK_EUR = parseNumericEnv("AI_INPUT_COST_PER_MTOK_EUR", 0.08);
const OUTPUT_COST_PER_MTOK_EUR = parseNumericEnv("AI_OUTPUT_COST_PER_MTOK_EUR", 0.3);

const getDayKey = () => new Date().toISOString().slice(0, 10);
const getMonthKey = () => getDayKey().slice(0, 7);

const estimateCostEur = (usage: GeminiUsage): number => {
  const input = (usage.inputTokens / 1_000_000) * INPUT_COST_PER_MTOK_EUR;
  const output = (usage.outputTokens / 1_000_000) * OUTPUT_COST_PER_MTOK_EUR;
  return input + output;
};

const getCurrentSpend = () => {
  const day = getDayKey();
  const month = getMonthKey();
  return {
    day,
    month,
    daily: dailySpendEur.get(day) ?? 0,
    monthly: monthlySpendEur.get(month) ?? 0
  };
};

const canSpend = (): { allowed: boolean; reason?: "daily" | "monthly" } => {
  const spend = getCurrentSpend();
  if (DAILY_BUDGET_EUR > 0 && spend.daily >= DAILY_BUDGET_EUR) {
    return { allowed: false, reason: "daily" };
  }
  if (MONTHLY_BUDGET_EUR > 0 && spend.monthly >= MONTHLY_BUDGET_EUR) {
    return { allowed: false, reason: "monthly" };
  }
  return { allowed: true };
};

const recordSpend = (usage: GeminiUsage) => {
  const spend = getCurrentSpend();
  const cost = estimateCostEur(usage);
  dailySpendEur.set(spend.day, (dailySpendEur.get(spend.day) ?? 0) + cost);
  monthlySpendEur.set(spend.month, (monthlySpendEur.get(spend.month) ?? 0) + cost);
};

const pruneCache = () => {
  const now = Date.now();
  for (const [key, value] of responseCache.entries()) {
    if (value.expiresAt <= now) {
      responseCache.delete(key);
    }
  }
  while (responseCache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    responseCache.delete(oldestKey);
  }
};

const makeCacheKey = (body: GeminiExtractRequestBody, mode: "text_only" | "pdf_rescue"): string => {
  const hashSeed = String(body.fileHash ?? "").trim();
  if (hashSeed) {
    return `${hashSeed}:${mode}`;
  }
  const text = String(body.pdfText ?? "");
  const pdfHead = String(body.pdfBase64 ?? "").slice(0, 120);
  return `${mode}:${text.length}:${text.slice(0, 120)}:${pdfHead}`;
};

const toUsage = (rawPayload: unknown): GeminiUsage => {
  const usageRaw = (rawPayload as { usageMetadata?: Record<string, unknown> })?.usageMetadata ?? {};
  const inputTokens = Number(usageRaw.promptTokenCount ?? usageRaw.inputTokenCount ?? 0);
  const outputTokens = Number(usageRaw.candidatesTokenCount ?? usageRaw.outputTokenCount ?? 0);
  return {
    inputTokens: Number.isFinite(inputTokens) ? Math.max(0, Math.round(inputTokens)) : 0,
    outputTokens: Number.isFinite(outputTokens) ? Math.max(0, Math.round(outputTokens)) : 0
  };
};

const buildPrompt = (fileName: string, pdfText: string): string =>
  [
    "Extract blood lab markers from this report.",
    "Return ONLY valid JSON with this exact shape:",
    '{"testDate":"YYYY-MM-DD","markers":[{"marker":"string","value":0,"unit":"string","referenceMin":null,"referenceMax":null,"confidence":0.0}]}',
    "Rules:",
    "- Include only real marker rows with a measured value.",
    "- Ignore commentary, interpretation, guidance paragraphs, and risk narrative text.",
    "- Never output fragments like: is, sensitive to, high risk individuals, low risk individuals.",
    "- Keep numeric values numeric (no <=, >=, arrows, or percent text in value).",
    "- Use null for missing references.",
    "- confidence must be 0.0-1.0.",
    `Source filename: ${fileName}`,
    "TEXT LAYER START",
    pdfText,
    "TEXT LAYER END"
  ].join("\n");

const isTechnicalStatus = (status: number): boolean => status === 429 || status >= 500;

const callGeminiModel = async (params: {
  model: string;
  apiKey: string;
  parts: Array<Record<string, unknown>>;
}): Promise<
  | { ok: true; extraction: GeminiExtractionPayload; usage: GeminiUsage }
  | { ok: false; status: number; detail: string; technical: boolean; emptyMarkers?: boolean }
> => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${encodeURIComponent(params.apiKey)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 900,
          responseMimeType: "application/json"
        },
        contents: [
          {
            role: "user",
            parts: params.parts
          }
        ]
      })
    }
  );

  const responseText = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      detail: responseText.slice(0, 800),
      technical: isTechnicalStatus(response.status)
    };
  }

  let rawPayload: unknown = {};
  try {
    rawPayload = responseText ? (JSON.parse(responseText) as unknown) : {};
  } catch {
    return {
      ok: false,
      status: 502,
      detail: "Gemini returned invalid JSON envelope",
      technical: false
    };
  }

  const candidateText =
    (rawPayload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  const jsonBlock = extractJsonBlock(candidateText);
  if (!jsonBlock) {
    return {
      ok: false,
      status: 502,
      detail: "Gemini returned no JSON extraction payload",
      technical: false
    };
  }

  let extraction: GeminiExtractionPayload;
  try {
    extraction = JSON.parse(jsonBlock) as GeminiExtractionPayload;
  } catch {
    return {
      ok: false,
      status: 502,
      detail: "Gemini returned invalid JSON payload",
      technical: false
    };
  }

  const markers = Array.isArray(extraction.markers) ? extraction.markers : [];
  if (markers.length === 0) {
    return {
      ok: false,
      status: 422,
      detail: "Gemini returned an empty marker list",
      technical: false,
      emptyMarkers: true
    };
  }

  return {
    ok: true,
    extraction,
    usage: toUsage(rawPayload)
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

    let body: GeminiExtractRequestBody;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      sendJson(res, 400, { error: { message: error instanceof Error ? error.message : "Invalid request body" } });
      return;
    }

    const fileName = typeof body.fileName === "string" ? body.fileName : "unknown.pdf";
    const pdfText = typeof body.pdfText === "string" ? body.pdfText : "";
    const pdfBase64 = typeof body.pdfBase64 === "string" ? body.pdfBase64.trim() : "";
    const mode: "text_only" | "pdf_rescue" = body.mode === "pdf_rescue" ? "pdf_rescue" : "text_only";
    const traceId = typeof body.traceId === "string" ? body.traceId : "no-trace";

    if (!pdfText && !pdfBase64) {
      sendJson(res, 400, { error: { message: "Missing extraction input" } });
      return;
    }

    const ip = getClientIp(req);
    const limit = checkRateLimit(ip, "extraction");
    const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
    res.setHeader("x-ratelimit-remaining", String(limit.remaining));
    res.setHeader("x-ratelimit-reset", String(limit.resetAt));
    if (!limit.allowed) {
      sendJson(res, 429, { error: "Rate limit exceeded", retryAfter, remaining: limit.remaining });
      return;
    }

    const today = getDayKey();
    const userKey = `${ip}:${today}`;
    const usedCallsToday = dailyUserCalls.get(userKey) ?? 0;
    if (usedCallsToday >= MAX_CALLS_PER_USER_PER_DAY) {
      console.info(
        `[gemini-extract] trace=${traceId} mode=${mode} reason=user_daily_limit ip=${ip} used=${usedCallsToday} limit=${MAX_CALLS_PER_USER_PER_DAY}`
      );
      sendJson(res, 429, {
        error: {
          code: "AI_DAILY_USER_LIMIT",
          message: `Daily parser AI limit reached (${MAX_CALLS_PER_USER_PER_DAY}/${MAX_CALLS_PER_USER_PER_DAY}).`
        }
      });
      return;
    }

    pruneCache();
    const cacheKey = makeCacheKey(body, mode);
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      console.info(
        `[gemini-extract] trace=${traceId} mode=${mode} model=${cached.payload.model} promptChars=${pdfText.length} markers=${cached.payload.markers.length} inputTokens=${cached.payload.usage.inputTokens} outputTokens=${cached.payload.usage.outputTokens} cacheHit=true`
      );
      sendJson(res, 200, {
        ...cached.payload,
        cacheHit: true
      });
      return;
    }

    const spendCheck = canSpend();
    if (!spendCheck.allowed) {
      console.info(
        `[gemini-extract] trace=${traceId} mode=${mode} reason=budget_blocked scope=${spendCheck.reason ?? "unknown"} promptChars=${pdfText.length}`
      );
      sendJson(res, 429, {
        error: {
          code: "AI_BUDGET_EXCEEDED",
          message:
            spendCheck.reason === "daily"
              ? "Daily AI budget reached. Falling back to local parser."
              : "Monthly AI budget reached. Falling back to local parser."
        }
      });
      return;
    }

    const parts: Array<Record<string, unknown>> = [{ text: buildPrompt(fileName, pdfText) }];
    if (pdfBase64) {
      parts.push({
        inline_data: {
          mime_type: "application/pdf",
          data: pdfBase64
        }
      });
    }

    let selectedModel = "";
    let extraction: GeminiExtractionPayload | null = null;
    let usage: GeminiUsage = { inputTokens: 0, outputTokens: 0 };

    const primaryResult = await callGeminiModel({ model: PRIMARY_MODEL, apiKey, parts });
    if (primaryResult.ok) {
      selectedModel = PRIMARY_MODEL;
      extraction = primaryResult.extraction;
      usage = primaryResult.usage;
    } else {
      if (primaryResult.emptyMarkers) {
        sendJson(res, 422, {
          error: {
            code: "AI_EMPTY_MARKERS",
            message: primaryResult.detail
          }
        });
        return;
      }
      if (!primaryResult.technical) {
        sendJson(res, primaryResult.status || 500, {
          error: { message: "Gemini extraction failed", detail: primaryResult.detail }
        });
        return;
      }

      const fallbackResult = await callGeminiModel({ model: TECHNICAL_FALLBACK_MODEL, apiKey, parts });
      if (!fallbackResult.ok) {
        sendJson(res, fallbackResult.status || primaryResult.status || 500, {
          error: { message: "Gemini extraction failed", detail: fallbackResult.detail || primaryResult.detail }
        });
        return;
      }
      selectedModel = TECHNICAL_FALLBACK_MODEL;
      extraction = fallbackResult.extraction;
      usage = fallbackResult.usage;
    }

    dailyUserCalls.set(userKey, usedCallsToday + 1);
    recordSpend(usage);

    const markers = Array.isArray(extraction?.markers) ? extraction.markers : [];
    const payload = {
      model: selectedModel,
      testDate: extraction?.testDate,
      markers,
      usage
    };

    responseCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      payload
    });
    pruneCache();

    const spend = getCurrentSpend();
    console.info(
      `[gemini-extract] trace=${traceId} mode=${mode} model=${selectedModel} promptChars=${pdfText.length} markers=${markers.length} inputTokens=${usage.inputTokens} outputTokens=${usage.outputTokens} dailySpendEur=${spend.daily.toFixed(4)} monthlySpendEur=${spend.monthly.toFixed(4)} cacheHit=false`
    );

    sendJson(res, 200, {
      ...payload,
      cacheHit: false
    });
  } catch (error) {
    sendJson(res, 500, {
      error: { message: error instanceof Error ? error.message : "Unexpected server error" }
    });
  }
}
