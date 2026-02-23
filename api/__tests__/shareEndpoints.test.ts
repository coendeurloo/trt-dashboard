import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncomingMessage, ServerResponse } from "node:http";

const store = new Map<string, Record<string, unknown>>();

vi.mock("../_lib/shareStore.js", () => ({
  saveShareRecord: vi.fn(async (code: string, record: Record<string, unknown>) => {
    store.set(code, record);
  }),
  loadShareRecord: vi.fn(async (code: string) => store.get(code) ?? null),
  ShareStoreUnavailableError: class ShareStoreUnavailableError extends Error {
    code = "SHARE_STORE_UNAVAILABLE";
  }
}));

import shortenHandler from "../share/shorten";
import resolveHandler from "../share/resolve";

interface MockResponseResult {
  res: ServerResponse;
  headers: Record<string, string>;
  readBody: () => string;
}

const createMockResponse = (): MockResponseResult => {
  const headers: Record<string, string> = {};
  let body = "";
  const res = {
    statusCode: 0,
    writableEnded: false,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
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

  return {
    res,
    headers,
    readBody: () => body
  };
};

const ORIGINAL_SECRET = process.env.SHARE_LINK_SECRET_BASE64;
const ORIGINAL_ORIGIN = process.env.SHARE_PUBLIC_ORIGIN;

describe("share endpoints", () => {
  beforeEach(() => {
    store.clear();
    process.env.SHARE_LINK_SECRET_BASE64 = Buffer.alloc(32, 9).toString("base64");
    process.env.SHARE_PUBLIC_ORIGIN = "https://labtracker.app";
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.SHARE_LINK_SECRET_BASE64;
    } else {
      process.env.SHARE_LINK_SECRET_BASE64 = ORIGINAL_SECRET;
    }
    if (ORIGINAL_ORIGIN === undefined) {
      delete process.env.SHARE_PUBLIC_ORIGIN;
    } else {
      process.env.SHARE_PUBLIC_ORIGIN = ORIGINAL_ORIGIN;
    }
  });

  it("roundtrips shorten -> resolve", async () => {
    const shortenReq = {
      method: "POST",
      body: {
        token: "s2.mock-token"
      }
    } as unknown as IncomingMessage;
    const shortenRes = createMockResponse();

    await shortenHandler(shortenReq, shortenRes.res);

    expect(shortenRes.res.statusCode).toBe(200);
    const shortenPayload = JSON.parse(shortenRes.readBody()) as { code: string; shareUrl: string };
    expect(shortenPayload.code).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(shortenPayload.shareUrl).toBe(`https://labtracker.app/s/${shortenPayload.code}`);

    const resolveReq = {
      method: "GET",
      url: `/api/share/resolve?code=${shortenPayload.code}`
    } as unknown as IncomingMessage;
    const resolveRes = createMockResponse();

    await resolveHandler(resolveReq, resolveRes.res);

    expect(resolveRes.res.statusCode).toBe(200);
    const resolvePayload = JSON.parse(resolveRes.readBody()) as { token: string };
    expect(resolvePayload.token).toBe("s2.mock-token");
  });

  it("returns 413 when token exceeds max size", async () => {
    const req = {
      method: "POST",
      body: {
        token: "a".repeat(220_001)
      }
    } as unknown as IncomingMessage;
    const res = createMockResponse();

    await shortenHandler(req, res.res);

    expect(res.res.statusCode).toBe(413);
    const payload = JSON.parse(res.readBody()) as { error: { code: string } };
    expect(payload.error.code).toBe("SHARE_SNAPSHOT_TOO_LARGE");
  });
});
