import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { config } from "dotenv";

config();

const args = process.argv.slice(2);
const portArgIndex = args.findIndex((arg) => arg === "--port");
const rootArgIndex = args.findIndex((arg) => arg === "--root");

const port = portArgIndex >= 0 ? Number(args[portArgIndex + 1]) : 4173;
const distRoot = rootArgIndex >= 0 ? path.resolve(args[rootArgIndex + 1]) : path.resolve(process.cwd(), "dist");

if (!Number.isFinite(port) || port <= 0) {
  console.error("Invalid port");
  process.exit(1);
}

if (!fs.existsSync(distRoot)) {
  console.error(`Dist folder not found: ${distRoot}`);
  process.exit(1);
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};
const MAX_JSON_BYTES = 18 * 1024 * 1024;
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-2.0-flash"];

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
};

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

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_JSON_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", (error) => reject(error));
  });

const safeJoin = (base, target) => {
  const normalized = path.posix.normalize(target || "/").replace(/^\/+/, "");
  return path.resolve(base, normalized);
};

const sendFile = (res, filePath, statusCode = 200) => {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] ?? "application/octet-stream";

    res.writeHead(statusCode, {
      "Content-Type": contentType,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600"
    });

    const stream = fs.createReadStream(filePath);
    stream.on("error", () => {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal server error");
    });
    stream.pipe(res);
  });
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url ?? "/");
  const pathname = decodeURIComponent(parsedUrl.pathname || "/");

  if (pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }

  if (pathname === "/api/claude/messages") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: { message: "Method not allowed" } });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const apiKey = process.env.CLAUDE_API_KEY?.trim() ?? "";
      const payload = body.payload;

      if (!apiKey) {
        sendJson(res, 401, { error: { message: "Missing CLAUDE_API_KEY on server" } });
        return;
      }
      if (!payload || typeof payload !== "object") {
        sendJson(res, 400, { error: { message: "Missing payload" } });
        return;
      }
      if (typeof fetch !== "function") {
        sendJson(res, 500, { error: { message: "Fetch API is unavailable in this Node runtime" } });
        return;
      }

      const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(payload)
      });
      const responseText = await anthropicResponse.text();

      res.writeHead(anthropicResponse.status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      });
      res.end(responseText);
    } catch (error) {
      sendJson(res, 502, {
        error: {
          message: error instanceof Error ? error.message : "Proxy request failed"
        }
      });
    }
    return;
  }

  if (pathname === "/api/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (pathname === "/api/gemini/extract") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: { message: "Method not allowed" } });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
      const fileName = typeof body.fileName === "string" ? body.fileName : "unknown.pdf";
      const pdfText = typeof body.pdfText === "string" ? body.pdfText : "";
      const pdfBase64 = typeof body.pdfBase64 === "string" ? body.pdfBase64.trim() : "";

      if (!apiKey) {
        sendJson(res, 401, { error: { message: "Missing GEMINI_API_KEY on server" } });
        return;
      }
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

      let selectedModel = "";
      let responseText = "";
      let lastErrorStatus = 500;
      let lastErrorText = "";

      for (const model of GEMINI_MODELS) {
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
    } catch (error) {
      sendJson(res, 502, {
        error: {
          message: error instanceof Error ? error.message : "Gemini proxy request failed"
        }
      });
    }
    return;
  }

  if (pathname === "/api/gemini/analysis") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: { message: "Method not allowed" } });
      return;
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
      if (!apiKey) {
        sendJson(res, 401, { error: { message: "Missing GEMINI_API_KEY on server" } });
        return;
      }

      const body = await readJsonBody(req);
      const model = typeof body?.payload?.model === "string" ? body.payload.model : GEMINI_MODELS[0];

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
    } catch (error) {
      sendJson(res, 502, {
        error: {
          message: error instanceof Error ? error.message : "Gemini proxy request failed"
        }
      });
    }
    return;
  }

  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = safeJoin(distRoot, requestedPath);

  if (!filePath.startsWith(distRoot)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) {
      sendFile(res, filePath);
      return;
    }

    // SPA fallback
    sendFile(res, path.join(distRoot, "index.html"), 200);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Static server ready on http://127.0.0.1:${port}`);
  console.log(`Serving: ${distRoot}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
