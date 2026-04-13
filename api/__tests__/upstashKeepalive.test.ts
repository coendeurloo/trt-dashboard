import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncomingMessage, ServerResponse } from "node:http";

const { getCounter } = vi.hoisted(() => ({
  getCounter: vi.fn(async () => 0)
}));
const { getRuntimeConfig, resolveSupabaseEnv } = vi.hoisted(() => ({
  getRuntimeConfig: vi.fn(async () => ({
    upstashKeepaliveEnabled: true,
    source: "database"
  })),
  resolveSupabaseEnv: vi.fn(() => ({
    supabaseUrl: "https://example.supabase.co",
    anonKey: "anon",
    serviceRoleKey: "service"
  }))
}));

vi.mock("../_lib/redisStore.js", () => ({
  getCounter,
  RedisStoreUnavailableError: class RedisStoreUnavailableError extends Error {
    code = "AI_LIMITS_UNAVAILABLE";
  }
}));
vi.mock("../_lib/adminRuntimeConfig.js", () => ({
  getRuntimeConfig
}));
vi.mock("../_lib/supabaseAdmin.js", () => ({
  resolveSupabaseEnv
}));

import keepaliveHandler from "../upstash/keepalive";

interface MockResponseResult {
  res: ServerResponse;
  readBody: () => string;
}

const createMockResponse = (): MockResponseResult => {
  let body = "";
  const res = {
    statusCode: 0,
    writableEnded: false,
    setHeader() {
      return this;
    },
    end(chunk?: unknown) {
      if (typeof chunk === "string") {
        body += chunk;
      } else if (Buffer.isBuffer(chunk)) {
        body += chunk.toString("utf8");
      }
      (this as { writableEnded: boolean }).writableEnded = true;
      return this;
    }
  } as unknown as ServerResponse;
  return { res, readBody: () => body };
};

describe("/api/upstash/keepalive", () => {
  beforeEach(() => {
    getCounter.mockClear();
    getRuntimeConfig.mockClear();
    resolveSupabaseEnv.mockClear();
    getRuntimeConfig.mockResolvedValue({
      upstashKeepaliveEnabled: true,
      source: "database"
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("touches redis and returns ok for GET", async () => {
    const req = {
      method: "GET"
    } as unknown as IncomingMessage;
    const res = createMockResponse();

    await keepaliveHandler(req, res.res);

    expect(getCounter).toHaveBeenCalledWith("meta:keepalive");
    expect(res.res.statusCode).toBe(200);
    const payload = JSON.parse(res.readBody()) as { ok: boolean; skipped: boolean; touchedAt: string };
    expect(payload.ok).toBe(true);
    expect(payload.skipped).toBe(false);
    expect(typeof payload.touchedAt).toBe("string");
  });

  it("skips redis probe when runtime keepalive is disabled", async () => {
    getRuntimeConfig.mockResolvedValueOnce({
      upstashKeepaliveEnabled: false,
      source: "database"
    });
    const req = {
      method: "GET"
    } as unknown as IncomingMessage;
    const res = createMockResponse();

    await keepaliveHandler(req, res.res);

    expect(res.res.statusCode).toBe(200);
    const payload = JSON.parse(res.readBody()) as {
      ok: boolean;
      skipped: boolean;
      reason: string;
    };
    expect(payload.ok).toBe(true);
    expect(payload.skipped).toBe(true);
    expect(payload.reason).toBe("KEEPALIVE_DISABLED_BY_RUNTIME_CONFIG");
    expect(getCounter).not.toHaveBeenCalled();
  });

  it("rejects non-GET requests", async () => {
    const req = {
      method: "POST"
    } as unknown as IncomingMessage;
    const res = createMockResponse();

    await keepaliveHandler(req, res.res);

    expect(res.res.statusCode).toBe(405);
    expect(getCounter).not.toHaveBeenCalled();
  });

  it("returns degraded-ok when redis probe fails", async () => {
    getCounter.mockRejectedValueOnce(new Error("redis timeout"));
    const req = {
      method: "GET"
    } as unknown as IncomingMessage;
    const res = createMockResponse();

    await keepaliveHandler(req, res.res);

    expect(res.res.statusCode).toBe(200);
    const payload = JSON.parse(res.readBody()) as {
      ok: boolean;
      skipped: boolean;
      reason: string;
      touchedAt: string | null;
    };
    expect(payload.ok).toBe(true);
    expect(payload.skipped).toBe(true);
    expect(payload.reason).toBe("KEEPALIVE_REDIS_PROBE_FAILED");
    expect(payload.touchedAt).toBeNull();
  });
});
