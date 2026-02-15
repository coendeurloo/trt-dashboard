import { config as loadDotenv } from "dotenv";
import { loadEnv } from "vite";

loadDotenv();

const MAX_JSON_BYTES = 8 * 1024 * 1024;

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
