import { IncomingMessage, ServerResponse } from "node:http";
import { getCounter, RedisStoreUnavailableError } from "../_lib/redisStore.js";

const KEEPALIVE_KEY = "meta:keepalive";

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: { message: "Method not allowed" } });
    return;
  }

  try {
    await getCounter(KEEPALIVE_KEY);
    sendJson(res, 200, {
      ok: true,
      touchedAt: new Date().toISOString()
    });
  } catch (error) {
    sendJson(res, 500, {
      error: {
        code: error instanceof RedisStoreUnavailableError ? error.code : "KEEPALIVE_FAILED",
        message: error instanceof Error ? error.message : "Upstash keepalive failed"
      }
    });
  }
}
