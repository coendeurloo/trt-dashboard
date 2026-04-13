import { IncomingMessage, ServerResponse } from "node:http";
import { getRuntimeConfig } from "../_lib/adminRuntimeConfig.js";
import { getCounter, RedisStoreUnavailableError } from "../_lib/redisStore.js";
import { resolveSupabaseEnv } from "../_lib/supabaseAdmin.js";
import { captureServerException, initServerSentry, withServerMonitor } from "../_lib/sentry.js";

const KEEPALIVE_KEY = "meta:keepalive";
const KEEPALIVE_RUNTIME_CONFIG_TIMEOUT_MS = 2500;
const KEEPALIVE_REDIS_PROBE_TIMEOUT_MS = 3000;

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, timeoutCode: string): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(timeoutCode)), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const resolveKeepaliveFlag = async (): Promise<{
  enabled: boolean;
  source: "database" | "defaults" | "fallback";
}> => {
  try {
    const env = resolveSupabaseEnv();
    const runtimeConfig = await withTimeout(
      getRuntimeConfig(env),
      KEEPALIVE_RUNTIME_CONFIG_TIMEOUT_MS,
      "KEEPALIVE_RUNTIME_CONFIG_TIMEOUT"
    );
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
  initServerSentry();

  if (req.method !== "GET") {
    sendJson(res, 405, { error: { message: "Method not allowed" } });
    return;
  }

  try {
    await withServerMonitor(
      "upstash-keepalive",
      async () => {
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

        try {
          await withTimeout(
            getCounter(KEEPALIVE_KEY),
            KEEPALIVE_REDIS_PROBE_TIMEOUT_MS,
            "KEEPALIVE_REDIS_PROBE_TIMEOUT"
          );
        } catch (probeError) {
          await captureServerException(probeError, {
            tags: {
              route: "/api/upstash/keepalive",
              flow: "upstash_keepalive",
              severity: "degraded"
            },
            fingerprint: ["upstash-keepalive-degraded"]
          });
          sendJson(res, 200, {
            ok: true,
            skipped: true,
            reason: "KEEPALIVE_REDIS_PROBE_FAILED",
            source: keepalive.source,
            touchedAt: null
          });
          return;
        }

        sendJson(res, 200, {
          ok: true,
          skipped: false,
          source: keepalive.source,
          touchedAt: new Date().toISOString()
        });
      },
      {
        schedule: {
          type: "crontab",
          value: "0 3 * * *"
        },
        checkinMargin: 10,
        maxRuntime: 5,
        // Vercel cron schedules run in UTC, so the Sentry monitor must use UTC too.
        timezone: "UTC"
      }
    );
  } catch (error) {
    await captureServerException(error, {
      tags: {
        route: "/api/upstash/keepalive",
        flow: "upstash_keepalive"
      },
      fingerprint: ["upstash-keepalive-failure"]
    });
    sendJson(res, 500, {
      error: {
        code: error instanceof RedisStoreUnavailableError ? error.code : "KEEPALIVE_FAILED",
        message: error instanceof Error ? error.message : "Upstash keepalive failed"
      }
    });
  }
}
