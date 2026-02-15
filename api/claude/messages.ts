import { IncomingMessage, ServerResponse } from "node:http";

interface ClaudeMessagePayload {
  model: string;
  max_tokens: number;
  temperature?: number;
  messages: Array<{ role: string; content: string }>;
}

interface ProxyRequestBody {
  payload?: ClaudeMessagePayload;
  requestType?: "extraction" | "analysis";
}

const MAX_JSON_BYTES = 8 * 1024 * 1024;

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
};

const readJsonBody = async (req: IncomingMessage): Promise<ProxyRequestBody> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_JSON_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
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

    req.on("error", (error) => reject(error));
  });

export default async function handler(req: IncomingMessage, res: ServerResponse) {
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
}
