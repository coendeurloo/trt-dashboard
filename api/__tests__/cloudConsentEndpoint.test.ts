import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncomingMessage, ServerResponse } from "node:http";
import cloudHandler from "../cloud";

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

const createMockRequest = (
  method: "GET" | "POST",
  token?: string,
  body?: unknown
): IncomingMessage => {
  const rawBody = body ? JSON.stringify(body) : "";
  const req = {
    method,
    url: "/api/cloud?action=consent",
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

const ORIGINAL_ENV = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
};

describe("/api/cloud/consent", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env.SUPABASE_URL = ORIGINAL_ENV.SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = ORIGINAL_ENV.SUPABASE_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_ENV.SUPABASE_SERVICE_ROLE_KEY;
    vi.restoreAllMocks();
  });

  it("returns 401 for unauthorized requests", async () => {
    const req = createMockRequest("GET");
    const res = createMockResponse();
    await cloudHandler(req, res.res);
    expect(res.res.statusCode).toBe(401);
    const payload = JSON.parse(res.readBody()) as { error: { code: string } };
    expect(payload.error.code).toBe("AUTH_REQUIRED");
  });

  it("returns hasConsent=false when no consent row exists", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(mockFetchResponse(200, { id: "user-1" }))
      .mockResolvedValueOnce(mockFetchResponse(200, { id: "user-1" }))
      .mockResolvedValueOnce(mockFetchResponse(200, []));

    const req = createMockRequest("GET", "token-1");
    const res = createMockResponse();
    await cloudHandler(req, res.res);

    expect(res.res.statusCode).toBe(200);
    const payload = JSON.parse(res.readBody()) as { hasConsent: boolean };
    expect(payload.hasConsent).toBe(false);
  });

  it("saves consent on POST and returns normalized consent payload", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(mockFetchResponse(200, { id: "user-1" }))
      .mockResolvedValueOnce(mockFetchResponse(200, { id: "user-1" }))
      .mockResolvedValueOnce(
        mockFetchResponse(201, [
          {
            privacy_policy_accepted_at: "2026-03-09T12:00:00.000Z",
            health_data_consent_at: "2026-03-09T12:00:00.000Z",
            privacy_policy_version: "2026-03-09"
          }
        ])
      );

    const req = createMockRequest("POST", "token-1", {
      acceptPrivacyPolicy: true,
      acceptHealthDataConsent: true,
      privacyPolicyVersion: "2026-03-09"
    });
    const res = createMockResponse();
    await cloudHandler(req, res.res);

    expect(res.res.statusCode).toBe(200);
    const payload = JSON.parse(res.readBody()) as {
      ok: boolean;
      consent: { hasConsent: boolean; privacyPolicyVersion: string | null };
    };
    expect(payload.ok).toBe(true);
    expect(payload.consent.hasConsent).toBe(true);
    expect(payload.consent.privacyPolicyVersion).toBe("2026-03-09");
  });

  it("rejects POST when required consent flags are missing", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(mockFetchResponse(200, { id: "user-1" }))
      .mockResolvedValueOnce(mockFetchResponse(200, { id: "user-1" }));

    const req = createMockRequest("POST", "token-1", {
      acceptPrivacyPolicy: true,
      privacyPolicyVersion: "2026-03-09"
    });
    const res = createMockResponse();
    await cloudHandler(req, res.res);

    expect(res.res.statusCode).toBe(400);
    const payload = JSON.parse(res.readBody()) as { error: { code: string } };
    expect(payload.error.code).toBe("CONSENT_REQUIRED");
  });
});
