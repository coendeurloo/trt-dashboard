import { IncomingMessage, ServerResponse } from "node:http";
import { checkRateLimit } from "../claude/rateLimit.js";

interface GeminiExtractRequestBody {
  fileName?: string;
  pdfText?: string;
  pdfBase64?: string | null;
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

const MAX_JSON_BYTES = 18 * 1024 * 1024;
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-2.0-flash"
] as const;

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

    const parts: Array<Record<string, unknown>> = [{ text: buildPrompt(fileName, pdfText) }];
    if (pdfBase64) {
      parts.push({
        inline_data: {
          mime_type: "application/pdf",
          data: pdfBase64
        }
      });
    }

    let responseText = "";
    let selectedModel = "";
    let lastErrorStatus = 500;
    let lastErrorText = "";
    for (const model of GEMINI_MODELS) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json"
            },
            contents: [
              {
                role: "user",
                parts
              }
            ]
          })
        }
      );

      responseText = await response.text();
      if (response.ok) {
        selectedModel = model;
        break;
      }

      lastErrorStatus = response.status;
      lastErrorText = responseText.slice(0, 800);
      if (response.status !== 404) {
        break;
      }
    }

    if (!selectedModel) {
      sendJson(res, lastErrorStatus, {
        error: { message: "Gemini extraction failed", detail: lastErrorText }
      });
      return;
    }

    let rawPayload: unknown = {};
    try {
      rawPayload = responseText ? (JSON.parse(responseText) as unknown) : {};
    } catch {
      rawPayload = {};
    }

    const candidateText =
      (rawPayload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0]?.content?.parts?.[0]?.text ??
      "";

    const jsonBlock = extractJsonBlock(candidateText);
    if (!jsonBlock) {
      sendJson(res, 502, { error: { message: "Gemini returned no JSON extraction payload" } });
      return;
    }

    let extraction: GeminiExtractionPayload;
    try {
      extraction = JSON.parse(jsonBlock) as GeminiExtractionPayload;
    } catch {
      sendJson(res, 502, { error: { message: "Gemini returned invalid JSON payload" } });
      return;
    }

    sendJson(res, 200, {
      model: selectedModel,
      testDate: extraction.testDate,
      markers: Array.isArray(extraction.markers) ? extraction.markers : []
    });
  } catch (error) {
    sendJson(res, 500, {
      error: { message: error instanceof Error ? error.message : "Unexpected server error" }
    });
  }
}
