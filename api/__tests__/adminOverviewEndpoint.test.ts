import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncomingMessage, ServerResponse } from "node:http";

const {
  requireAdminIdentity,
  fetchAllAuthUsers,
  fetchRestCount,
  fetchRestRows,
  getVerificationFunnelSnapshot
} = vi.hoisted(() => ({
  requireAdminIdentity: vi.fn(),
  fetchAllAuthUsers: vi.fn(),
  fetchRestCount: vi.fn(),
  fetchRestRows: vi.fn(),
  getVerificationFunnelSnapshot: vi.fn()
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

vi.mock("../_lib/cloudVerificationFunnel.js", () => ({
  getVerificationFunnelSnapshot
}));

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

    getVerificationFunnelSnapshot.mockResolvedValue({
      storeAvailable: true,
      last7d: {
        signupStarted: 2,
        verificationEmailsSent: 2,
        verificationResends: 1,
        confirmPageViews: 1,
        verifiedCompletions: 1,
        firstVerifiedSignIns: 1
      },
      last30d: {
        signupStarted: 4,
        verificationEmailsSent: 4,
        verificationResends: 2,
        confirmPageViews: 3,
        verifiedCompletions: 2,
        firstVerifiedSignIns: 1
      }
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
      verificationFunnel: {
        storeAvailable: boolean;
        last30d: { verificationResends: number };
      };
    };

    expect(payload.totals.totalAccounts).toBe(2);
    expect(payload.totals.usersWithConsent).toBe(1);
    expect(payload.totals.usersWithSyncedData).toBe(2);
    expect(payload.totals.totalReports).toBe(10);
    expect(payload.totals.totalCheckIns).toBe(6);
    expect(payload.totals.totalProtocols).toBe(4);
    expect(payload.activity.lastSyncAt).toBe("2026-03-21T09:00:00.000Z");
    expect(payload.verificationFunnel.storeAvailable).toBe(true);
    expect(payload.verificationFunnel.last30d.verificationResends).toBe(2);
  });
});
