import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncomingMessage, ServerResponse } from "node:http";

const { getCounter } = vi.hoisted(() => ({
  getCounter: vi.fn(async () => 0)
}));

vi.mock("../_lib/redisStore.js", () => ({
  getCounter,
  RedisStoreUnavailableError: class RedisStoreUnavailableError extends Error {
    code = "AI_LIMITS_UNAVAILABLE";
  }
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
    const payload = JSON.parse(res.readBody()) as { ok: boolean; touchedAt: string };
    expect(payload.ok).toBe(true);
    expect(typeof payload.touchedAt).toBe("string");
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
});
