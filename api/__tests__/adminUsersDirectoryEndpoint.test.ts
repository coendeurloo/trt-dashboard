import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncomingMessage, ServerResponse } from "node:http";

const {
  requireAdminIdentity,
  fetchAllAuthUsers
} = vi.hoisted(() => ({
  requireAdminIdentity: vi.fn(),
  fetchAllAuthUsers: vi.fn()
}));

vi.mock("../_lib/supabaseAdmin.js", async () => {
  const actual = await vi.importActual<typeof import("../_lib/supabaseAdmin.js")>("../_lib/supabaseAdmin.js");
  return {
    ...actual,
    requireAdminIdentity,
    fetchAllAuthUsers
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

const createRequest = (search = ""): IncomingMessage => {
  return {
    method: "GET",
    url: `/api/admin?action=users-directory${search}`,
    headers: {
      authorization: "Bearer token-1"
    }
  } as unknown as IncomingMessage;
};

describe("/api/admin/users-directory", () => {
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
        id: "user-2",
        email: "bravo@example.com",
        created_at: "2026-03-01T10:00:00.000Z",
        last_sign_in_at: "2026-04-12T10:00:00.000Z"
      },
      {
        id: "user-1",
        email: "alpha@example.com",
        created_at: "2026-04-01T10:00:00.000Z",
        last_sign_in_at: "2026-04-14T10:00:00.000Z"
      }
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns total users and a sorted directory payload", async () => {
    const req = createRequest("&limit=10");
    const res = createMockResponse();
    await adminHandler(req, res.res);

    expect(res.res.statusCode).toBe(200);
    const payload = JSON.parse(res.readBody()) as {
      totalUsers: number;
      returnedUsers: number;
      users: Array<{ id: string; email: string | null }>;
    };

    expect(payload.totalUsers).toBe(2);
    expect(payload.returnedUsers).toBe(2);
    expect(payload.users[0]?.id).toBe("user-1");
    expect(payload.users[0]?.email).toBe("alpha@example.com");
  });

  it("filters users by email query", async () => {
    const req = createRequest("&query=bravo");
    const res = createMockResponse();
    await adminHandler(req, res.res);

    expect(res.res.statusCode).toBe(200);
    const payload = JSON.parse(res.readBody()) as {
      query: string;
      returnedUsers: number;
      users: Array<{ email: string | null }>;
    };

    expect(payload.query).toBe("bravo");
    expect(payload.returnedUsers).toBe(1);
    expect(payload.users[0]?.email).toBe("bravo@example.com");
  });
});

