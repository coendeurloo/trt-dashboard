import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncomingMessage, ServerResponse } from "node:http";

const {
  requireAdminIdentity,
  fetchAllAuthUsers,
  fetchRestCount,
  fetchRestRows,
  escapeFilterValue
} = vi.hoisted(() => ({
  requireAdminIdentity: vi.fn(),
  fetchAllAuthUsers: vi.fn(),
  fetchRestCount: vi.fn(),
  fetchRestRows: vi.fn(),
  escapeFilterValue: vi.fn((value: string) => encodeURIComponent(value))
}));

vi.mock("../_lib/supabaseAdmin.js", async () => {
  const actual = await vi.importActual<typeof import("../_lib/supabaseAdmin.js")>("../_lib/supabaseAdmin.js");
  return {
    ...actual,
    requireAdminIdentity,
    fetchAllAuthUsers,
    fetchRestCount,
    fetchRestRows,
    escapeFilterValue
  };
});

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

const createRequest = (query: string): IncomingMessage => {
  return {
    method: "GET",
    url: `/api/admin?action=users&query=${encodeURIComponent(query)}`,
    headers: {
      authorization: "Bearer token-1"
    }
  } as unknown as IncomingMessage;
};

describe("/api/admin/users", () => {
  beforeEach(() => {
    requireAdminIdentity.mockResolvedValue({
      userId: "admin-user",
      email: "admin@example.com",
      accessToken: "token-1",
      env: {
        supabaseUrl: "https://example.supabase.co",
        anonKey: "anon",
        serviceRoleKey: "service"
      }
    });

    fetchAllAuthUsers.mockResolvedValue([
      {
        id: "user-1",
        email: "member@example.com",
        created_at: "2026-03-01T10:00:00.000Z",
        last_sign_in_at: "2026-03-20T10:00:00.000Z",
        app_metadata: {
          plan: "pro",
          entitlements: ["analysis", "share"]
        },
        user_metadata: {}
      }
    ]);

    fetchRestCount.mockImplementation(async (_env: unknown, table: string) => {
      if (table === "user_consents") {
        return 1;
      }
      if (table === "lab_reports") {
        return 4;
      }
      if (table === "check_ins") {
        return 3;
      }
      if (table === "protocols") {
        return 2;
      }
      return 0;
    });

    fetchRestRows.mockImplementation(async (_env: unknown, table: string) => {
      if (table === "sync_state") {
        return [
          {
            device_id: "device-1",
            last_revision: 12,
            last_synced_at: "2026-03-21T08:00:00.000Z"
          }
        ];
      }
      if (table === "profiles") {
        return [
          {
            settings: {
              settings: {
                subscriptionPlan: "pro"
              }
            }
          }
        ];
      }
      return [];
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns support summary and does not leak raw collections", async () => {
    const req = createRequest("member@example.com");
    const res = createMockResponse();

    await adminHandler(req, res.res);

    expect(res.res.statusCode).toBe(200);
    const payload = JSON.parse(res.readBody()) as {
      user: { id: string; email: string | null } | null;
      summary: { reportsCount: number; checkInsCount: number; protocolsCount: number; hasConsent: boolean };
      plan: { plan: string | null; entitlements: string[] } | null;
      reports?: unknown;
      checkIns?: unknown;
      markers?: unknown;
    };

    expect(payload.user?.id).toBe("user-1");
    expect(payload.summary.hasConsent).toBe(true);
    expect(payload.summary.reportsCount).toBe(4);
    expect(payload.summary.checkInsCount).toBe(3);
    expect(payload.summary.protocolsCount).toBe(2);
    expect(payload.plan?.plan).toBe("pro");
    expect(payload.reports).toBeUndefined();
    expect(payload.checkIns).toBeUndefined();
    expect(payload.markers).toBeUndefined();
  });

  it("returns user=null when no match exists", async () => {
    fetchAllAuthUsers.mockResolvedValueOnce([]);

    const req = createRequest("missing@example.com");
    const res = createMockResponse();
    await adminHandler(req, res.res);

    expect(res.res.statusCode).toBe(200);
    const payload = JSON.parse(res.readBody()) as { user: unknown };
    expect(payload.user).toBeNull();
  });
});
