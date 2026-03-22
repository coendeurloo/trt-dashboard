import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncomingMessage, ServerResponse } from "node:http";

const {
  requireAdminIdentity,
  fetchAllAuthUsers,
  fetchRestCount,
  fetchRestRows
} = vi.hoisted(() => ({
  requireAdminIdentity: vi.fn(),
  fetchAllAuthUsers: vi.fn(),
  fetchRestCount: vi.fn(),
  fetchRestRows: vi.fn()
}));

vi.mock("../_lib/supabaseAdmin.js", async () => {
  const actual = await vi.importActual<typeof import("../_lib/supabaseAdmin.js")>("../_lib/supabaseAdmin.js");
  return {
    ...actual,
    requireAdminIdentity,
    fetchAllAuthUsers,
    fetchRestCount,
    fetchRestRows
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

const createMockRequest = (): IncomingMessage => {
  return {
    method: "GET",
    url: "/api/admin?action=overview",
    headers: {
      authorization: "Bearer token-1"
    }
  } as unknown as IncomingMessage;
};

describe("/api/admin/overview", () => {
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
        id: "u1",
        email: "one@example.com",
        created_at: "2026-03-20T10:00:00.000Z"
      },
      {
        id: "u2",
        email: "two@example.com",
        created_at: "2026-01-10T10:00:00.000Z"
      }
    ]);

    fetchRestCount.mockImplementation(async (_env: unknown, table: string) => {
      if (table === "user_consents") {
        return 1;
      }
      if (table === "lab_reports") {
        return 10;
      }
      if (table === "check_ins") {
        return 6;
      }
      if (table === "protocols") {
        return 4;
      }
      return 0;
    });

    fetchRestRows.mockImplementation(async (_env: unknown, table: string) => {
      if (table === "sync_state") {
        return [{ last_synced_at: "2026-03-21T09:00:00.000Z" }];
      }
      if (table === "lab_reports") {
        return [{ user_id: "u1" }];
      }
      if (table === "check_ins") {
        return [{ user_id: "u1" }, { user_id: "u2" }];
      }
      if (table === "protocols") {
        return [{ user_id: "u2" }];
      }
      if (table === "supplement_timeline") {
        return [];
      }
      return [];
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps overview totals from source queries", async () => {
    const req = createMockRequest();
    const res = createMockResponse();

    await adminHandler(req, res.res);

    expect(res.res.statusCode).toBe(200);
    const payload = JSON.parse(res.readBody()) as {
      totals: {
        totalAccounts: number;
        usersWithConsent: number;
        usersWithSyncedData: number;
        totalReports: number;
        totalCheckIns: number;
        totalProtocols: number;
      };
      activity: { lastSyncAt: string | null };
    };

    expect(payload.totals.totalAccounts).toBe(2);
    expect(payload.totals.usersWithConsent).toBe(1);
    expect(payload.totals.usersWithSyncedData).toBe(2);
    expect(payload.totals.totalReports).toBe(10);
    expect(payload.totals.totalCheckIns).toBe(6);
    expect(payload.totals.totalProtocols).toBe(4);
    expect(payload.activity.lastSyncAt).toBe("2026-03-21T09:00:00.000Z");
  });
});
