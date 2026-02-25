import { config as loadDotenv } from "dotenv";
import { loadEnv } from "vite";

loadDotenv();

const MAX_JSON_BYTES = 18 * 1024 * 1024;
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-2.0-flash"];

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
};

const chunkToString = (chunk) => {
  if (typeof chunk === "string") {
    return chunk;
  }
  if (chunk instanceof Uint8Array) {
    return new TextDecoder().decode(chunk);
  }
  return String(chunk ?? "");
};

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = "";
    let total = 0;

    req.on("data", (chunk) => {
      const part = chunkToString(chunk);
      total += part.length;
      if (total > MAX_JSON_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      raw += part;
    });

    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", (error) => reject(error));
  });

const extractJsonBlock = (input) => {
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

const buildGeminiPrompt = (fileName, pdfText) =>
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

const buildGeminiAnalysisPayload = (body) => {
  const prompt = body?.payload?.messages?.[0]?.content;
  const userText = typeof prompt === "string" ? prompt : "";
  return {
    contents: [
      {
        role: "user",
        parts: [{ text: userText }]
      }
    ],
    generationConfig: {
      temperature: Number.isFinite(Number(body?.payload?.temperature)) ? Number(body.payload.temperature) : 0.3,
      maxOutputTokens: Number.isFinite(Number(body?.payload?.max_tokens)) ? Number(body.payload.max_tokens) : 2400
    }
  };
};

const claudeProxyPlugin = () => ({
  name: "local-claude-proxy",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const pathname = req.url?.split("?")[0] ?? "";
      if (pathname === "/api/health") {
        if (req.method !== "GET") {
          sendJson(res, 405, { error: { message: "Method not allowed" } });
          return;
        }
        sendJson(res, 200, { status: "ok" });
        return;
      }

      if (pathname === "/api/gemini/extract") {
        if (req.method !== "POST") {
          sendJson(res, 405, { error: { message: "Method not allowed" } });
          return;
        }

        const env = loadEnv(server.config.mode, server.config.root, "");
        const apiKey = (env.GEMINI_API_KEY ?? "").trim();
        if (!apiKey) {
          sendJson(res, 401, { error: { message: "Missing GEMINI_API_KEY on server" } });
          return;
        }

        let body;
        try {
          body = await readJsonBody(req);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid request body";
          sendJson(res, 400, { error: { message } });
          return;
        }

        const fileName = typeof body.fileName === "string" ? body.fileName : "unknown.pdf";
        const pdfText = typeof body.pdfText === "string" ? body.pdfText : "";
        const pdfBase64 = typeof body.pdfBase64 === "string" ? body.pdfBase64.trim() : "";
        if (!pdfText && !pdfBase64) {
          sendJson(res, 400, { error: { message: "Missing extraction input" } });
          return;
        }

        const parts = [{ text: buildGeminiPrompt(fileName, pdfText) }];
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
          try {
            const geminiResponse = await fetch(
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

            responseText = await geminiResponse.text();
            if (geminiResponse.ok) {
              selectedModel = model;
              break;
            }

            lastErrorStatus = geminiResponse.status;
            lastErrorText = responseText.slice(0, 800);
            if (geminiResponse.status !== 404) {
              break;
            }
          } catch (error) {
            lastErrorStatus = 502;
            lastErrorText = error instanceof Error ? error.message : "Gemini API unreachable";
            break;
          }
        }

        if (!selectedModel) {
          sendJson(res, lastErrorStatus, { error: { message: "Gemini extraction failed", detail: lastErrorText } });
          return;
        }

        let rawPayload = {};
        try {
          rawPayload = responseText ? JSON.parse(responseText) : {};
        } catch {
          rawPayload = {};
        }

        const candidateText = rawPayload?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        const jsonBlock = extractJsonBlock(candidateText);
        if (!jsonBlock) {
          sendJson(res, 502, { error: { message: "Gemini returned no JSON extraction payload" } });
          return;
        }

        let extraction = {};
        try {
          extraction = JSON.parse(jsonBlock);
        } catch {
          sendJson(res, 502, { error: { message: "Gemini returned invalid JSON payload" } });
          return;
        }

        sendJson(res, 200, {
          model: selectedModel,
          testDate: extraction.testDate,
          markers: Array.isArray(extraction.markers) ? extraction.markers : []
        });
        return;
      }

      if (pathname === "/api/gemini/analysis") {
        if (req.method !== "POST") {
          sendJson(res, 405, { error: { message: "Method not allowed" } });
          return;
        }

        const env = loadEnv(server.config.mode, server.config.root, "");
        const apiKey = (env.GEMINI_API_KEY ?? "").trim();
        if (!apiKey) {
          sendJson(res, 401, { error: { message: "Missing GEMINI_API_KEY on server" } });
          return;
        }

        let body;
        try {
          body = await readJsonBody(req);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid request body";
          sendJson(res, 400, { error: { message } });
          return;
        }

        const model = typeof body?.payload?.model === "string" ? body.payload.model : GEMINI_MODELS[0];
        try {
          const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(buildGeminiAnalysisPayload(body))
            }
          );
          const responseText = await geminiResponse.text();
          if (!geminiResponse.ok) {
            sendJson(res, geminiResponse.status, { error: { message: responseText.slice(0, 1200) } });
            return;
          }

          let parsed = {};
          try {
            parsed = responseText ? JSON.parse(responseText) : {};
          } catch {
            parsed = {};
          }
          const text = parsed?.candidates?.[0]?.content?.parts?.map((part) => part?.text ?? "").join("\n").trim() ?? "";
          const finishReason = parsed?.candidates?.[0]?.finishReason === "MAX_TOKENS" ? "max_tokens" : "end_turn";
          sendJson(res, 200, {
            content: [{ type: "text", text }],
            stop_reason: finishReason
          });
        } catch {
          sendJson(res, 502, { error: { message: "Gemini API unreachable" } });
        }
        return;
      }

      if (pathname !== "/api/claude/messages") {
        next();
        return;
      }

      if (req.method !== "POST") {
        sendJson(res, 405, { error: { message: "Method not allowed" } });
        return;
      }

      const env = loadEnv(server.config.mode, server.config.root, "");
      const apiKey = (env.CLAUDE_API_KEY ?? "").trim();
      if (!apiKey) {
        sendJson(res, 401, { error: { message: "Missing CLAUDE_API_KEY on server" } });
        return;
      }

      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid request body";
        sendJson(res, 400, { error: { message } });
        return;
      }

      if (!body?.payload || typeof body.payload !== "object") {
        sendJson(res, 400, { error: { message: "Missing payload" } });
        return;
      }

      try {
        const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify(body.payload)
        });
        const responseText = await anthropicResponse.text();
        res.statusCode = anthropicResponse.status;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.setHeader("cache-control", "no-store");
        res.end(responseText);
      } catch {
        sendJson(res, 502, { error: { message: "Anthropic API unreachable" } });
      }
    });
  }
});

export default claudeProxyPlugin;
