import { IncomingMessage, ServerResponse } from "node:http";
import { getRuntimeConfig } from "../_lib/adminRuntimeConfig.js";
import { getCounter, RedisStoreUnavailableError } from "../_lib/redisStore.js";
import { resolveSupabaseEnv } from "../_lib/supabaseAdmin.js";

const KEEPALIVE_KEY = "meta:keepalive";

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
};

const resolveKeepaliveFlag = async (): Promise<{
  enabled: boolean;
  source: "database" | "defaults" | "fallback";
}> => {
  try {
    const env = resolveSupabaseEnv();
    const runtimeConfig = await getRuntimeConfig(env);
    return {
      enabled: runtimeConfig.upstashKeepaliveEnabled,
      source: runtimeConfig.source
    };
  } catch {
    return {
      enabled: true,
      source: "fallback"
    };
  }
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: { message: "Method not allowed" } });
    return;
  }

  try {
    const keepalive = await resolveKeepaliveFlag();
    if (!keepalive.enabled) {
      sendJson(res, 200, {
        ok: true,
        skipped: true,
        reason: "KEEPALIVE_DISABLED_BY_RUNTIME_CONFIG",
        source: keepalive.source,
        touchedAt: null
      });
      return;
    }

    await getCounter(KEEPALIVE_KEY);
    sendJson(res, 200, {
      ok: true,
      skipped: false,
      source: keepalive.source,
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
