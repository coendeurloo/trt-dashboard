import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncomingMessage, ServerResponse } from "node:http";

import adminHandler from "../admin";

interface MockResponseResult {
  res: ServerResponse;
  readBody: () => string;
}

interface RequestOptions {
  method: "GET" | "POST";
  url: string;
  token?: string;
  body?: unknown;
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
  return {
    res,
    readBody: () => body
  };
};

const createMockRequest = ({ method, url, token, body }: RequestOptions): IncomingMessage => {
  const rawBody = body ? JSON.stringify(body) : "";
  const req = {
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    async *[Symbol.asyncIterator]() {
      if (rawBody) {
        yield Buffer.from(rawBody, "utf8");
      }
    }
  } as unknown as IncomingMessage;
  return req;
};

const mockFetchResponse = (status: number, payload: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => payload)
  }) as unknown as Response;

const ENDPOINTS = [
  { name: "me", method: "GET" as const, url: "/api/admin?action=me" },
  { name: "overview", method: "GET" as const, url: "/api/admin?action=overview" },
  { name: "system-status", method: "GET" as const, url: "/api/admin?action=system-status" },
  { name: "users", method: "GET" as const, url: "/api/admin?action=users&query=test@example.com" },
  { name: "users-directory", method: "GET" as const, url: "/api/admin?action=users-directory&limit=50" },
  { name: "runtime-config", method: "GET" as const, url: "/api/admin?action=runtime-config" },
  { name: "audit-log", method: "GET" as const, url: "/api/admin?action=audit-log" }
];

const ORIGINAL_ENV = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  LABTRACKER_ADMIN_EMAILS: process.env.LABTRACKER_ADMIN_EMAILS
};

describe("/api/admin/* guards", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    process.env.LABTRACKER_ADMIN_EMAILS = "admin@example.com";
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env.SUPABASE_URL = ORIGINAL_ENV.SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = ORIGINAL_ENV.SUPABASE_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_ENV.SUPABASE_SERVICE_ROLE_KEY;
    process.env.LABTRACKER_ADMIN_EMAILS = ORIGINAL_ENV.LABTRACKER_ADMIN_EMAILS;
    vi.restoreAllMocks();
  });

  ENDPOINTS.forEach(({ name, method, url }) => {
    it(`returns 401 without session for ${name}`, async () => {
      const req = createMockRequest({ method, url });
      const res = createMockResponse();
      await adminHandler(req, res.res);

      expect(res.res.statusCode).toBe(401);
      const payload = JSON.parse(res.readBody()) as { error: { code: string } };
      expect(payload.error.code).toBe("AUTH_REQUIRED");
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it(`returns 403 for non-admin session on ${name}`, async () => {
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(200, {
          id: "user-1",
          email: "member@example.com"
        })
      );

      const req = createMockRequest({ method, url, token: "token-1" });
      const res = createMockResponse();
      await adminHandler(req, res.res);

      expect(res.res.statusCode).toBe(403);
      const payload = JSON.parse(res.readBody()) as { error: { code: string } };
      expect(payload.error.code).toBe("ADMIN_FORBIDDEN");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
