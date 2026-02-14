import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

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
const MAX_JSON_BYTES = 8 * 1024 * 1024;

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
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
      const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
      const payload = body.payload;

      if (!apiKey) {
        sendJson(res, 400, { error: { message: "Missing apiKey" } });
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
