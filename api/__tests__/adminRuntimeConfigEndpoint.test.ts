import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncomingMessage, ServerResponse } from "node:http";
import adminHandler from "../admin";

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
  return {
    res,
    readBody: () => body
  };
};

const createMockRequest = (
  method: "GET" | "POST",
  token: string,
  body?: unknown
): IncomingMessage => {
  const rawBody = body ? JSON.stringify(body) : "";
  const req = {
    method,
    url: "/api/admin?action=runtime-config",
    headers: {
      authorization: `Bearer ${token}`
    },
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
    json: vi.fn(async () => payload),
    headers: {
      get: vi.fn(() => null)
    }
  }) as unknown as Response;

const ORIGINAL_ENV = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  LABTRACKER_ADMIN_EMAILS: process.env.LABTRACKER_ADMIN_EMAILS
};

describe("/api/admin/runtime-config", () => {
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

  it("reads runtime flags from database on GET", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(mockFetchResponse(200, { id: "admin-user", email: "admin@example.com" }))
      .mockResolvedValueOnce(
        mockFetchResponse(200, [
          {
            id: 1,
            upstash_keepalive_enabled: true,
            cloud_signup_enabled: true,
            share_links_enabled: true,
            parser_improvement_enabled: true,
            ai_analysis_enabled: true,
            updated_at: "2026-03-22T08:00:00.000Z",
            updated_by_user_id: null,
            updated_by_email: null
          }
        ])
      );

    const req = createMockRequest("GET", "token-1");
    const res = createMockResponse();
    await adminHandler(req, res.res);

    expect(res.res.statusCode).toBe(200);
    const payload = JSON.parse(res.readBody()) as {
      config: { upstashKeepaliveEnabled: boolean; source: string };
    };
    expect(payload.config.upstashKeepaliveEnabled).toBe(true);
    expect(payload.config.source).toBe("database");
  });

  it("writes audit log row when runtime flag changes", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(mockFetchResponse(200, { id: "admin-user", email: "admin@example.com" }))
      .mockResolvedValueOnce(
        mockFetchResponse(200, [
          {
            id: 1,
            upstash_keepalive_enabled: true,
            cloud_signup_enabled: true,
            share_links_enabled: true,
            parser_improvement_enabled: true,
            ai_analysis_enabled: true,
            updated_at: "2026-03-22T08:00:00.000Z",
            updated_by_user_id: null,
            updated_by_email: null
          }
        ])
      )
      .mockResolvedValueOnce(
        mockFetchResponse(201, [
          {
            id: 1,
            upstash_keepalive_enabled: false,
            cloud_signup_enabled: true,
            share_links_enabled: true,
            parser_improvement_enabled: true,
            ai_analysis_enabled: true,
            updated_at: "2026-03-22T09:00:00.000Z",
            updated_by_user_id: "admin-user",
            updated_by_email: "admin@example.com"
          }
        ])
      )
      .mockResolvedValueOnce(mockFetchResponse(201, [{ id: 10 }]));

    const req = createMockRequest("POST", "token-1", {
      patch: {
        upstashKeepaliveEnabled: false
      }
    });
    const res = createMockResponse();
    await adminHandler(req, res.res);

    expect(res.res.statusCode).toBe(200);
    const payload = JSON.parse(res.readBody()) as {
      config: { upstashKeepaliveEnabled: boolean };
    };
    expect(payload.config.upstashKeepaliveEnabled).toBe(false);

    const auditCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/rest/v1/admin_audit_log")
    );
    expect(auditCall).toBeTruthy();

    const auditRequest = (auditCall?.[1] ?? {}) as { body?: string };
    const auditBody = JSON.parse(String(auditRequest.body ?? "[]")) as Array<{
      changes: Record<string, { from: boolean; to: boolean }>;
    }>;

    expect(auditBody[0]?.changes?.upstashKeepaliveEnabled?.from).toBe(true);
    expect(auditBody[0]?.changes?.upstashKeepaliveEnabled?.to).toBe(false);
  });
});
