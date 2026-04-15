/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminView from "../views/AdminView";

const baseProps = {
  language: "en" as const,
  theme: "dark" as const,
  authStatus: "unauthenticated" as const,
  authError: null as string | null,
  accessToken: null as string | null,
  sessionEmail: null as string | null,
  onOpenCloudAuth: vi.fn(),
  onSignOut: vi.fn(async () => undefined)
};

const mockFetchResponse = (status: number, payload: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => payload)
  }) as unknown as Response;

describe("AdminView route guard", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("blocks unauthenticated users", () => {
    render(<AdminView {...baseProps} />);

    expect(screen.getByText("Admin Ops Cockpit")).toBeTruthy();
    expect(screen.getByText("Sign in with your cloud account to open the admin area.")).toBeTruthy();
  });

  it("shows no-access state for signed-in non-admin users", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(403, {
        error: {
          code: "ADMIN_FORBIDDEN",
          message: "forbidden"
        }
      })
    );

    render(
      <AdminView
        {...baseProps}
        authStatus="authenticated"
        accessToken="token-1"
        sessionEmail="member@example.com"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("No admin access")).toBeTruthy();
    });
  });

  it("allows signed-in admin users", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        mockFetchResponse(200, {
          userId: "admin-1",
          email: "admin@example.com",
          isAdmin: true
        })
      )
      .mockResolvedValueOnce(
        mockFetchResponse(200, {
          totals: {
            totalAccounts: 3,
            recentSignups7d: 1,
            recentSignups30d: 2,
            usersWithConsent: 2,
            usersWithSyncedData: 2,
            totalReports: 12,
            totalCheckIns: 5,
            totalProtocols: 4
          },
          activity: {
            latestSignupAt: "2026-03-20T10:00:00.000Z",
            lastSyncAt: "2026-03-21T10:00:00.000Z"
          },
          recentUsers: [],
          verificationFunnel: {
            storeAvailable: true,
            last7d: {
              signupStarted: 1,
              verificationEmailsSent: 1,
              verificationResends: 0,
              confirmPageViews: 1,
              verifiedCompletions: 1,
              firstVerifiedSignIns: 1
            },
            last30d: {
              signupStarted: 3,
              verificationEmailsSent: 3,
              verificationResends: 1,
              confirmPageViews: 2,
              verifiedCompletions: 2,
              firstVerifiedSignIns: 1
            }
          }
        })
      )
      .mockResolvedValueOnce(
        mockFetchResponse(200, {
          checkedAt: "2026-03-22T09:00:00.000Z",
          runtimeConfig: {
            upstashKeepaliveEnabled: true,
            cloudSignupEnabled: true,
            shareLinksEnabled: true,
            parserImprovementEnabled: true,
            aiAnalysisEnabled: true,
            updatedAt: null,
            updatedByUserId: null,
            updatedByEmail: null,
            source: "database"
          },
          services: [],
          keepalive: {
            enabled: true,
            effective: true,
            reason: "ok"
          },
          envDiagnostics: {
            entries: [],
            warnings: []
          }
        })
      )
      .mockResolvedValueOnce(
        mockFetchResponse(200, {
          config: {
            upstashKeepaliveEnabled: true,
            cloudSignupEnabled: true,
            shareLinksEnabled: true,
            parserImprovementEnabled: true,
            aiAnalysisEnabled: true,
            updatedAt: null,
            updatedByUserId: null,
            updatedByEmail: null,
            source: "database"
          }
        })
      )
      .mockResolvedValueOnce(mockFetchResponse(200, { entries: [] }))
      .mockResolvedValueOnce(
        mockFetchResponse(200, {
          query: "",
          totalUsers: 3,
          returnedUsers: 3,
          limit: 250,
          users: [
            {
              id: "admin-1",
              email: "admin@example.com",
              createdAt: "2026-03-20T10:00:00.000Z",
              lastSignInAt: "2026-03-22T09:00:00.000Z"
            }
          ]
        })
      );

    render(
      <AdminView
        {...baseProps}
        authStatus="authenticated"
        accessToken="token-1"
        sessionEmail="admin@example.com"
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText("Admin Ops Cockpit").length).toBeGreaterThan(0);
      expect(screen.getByText("Accounts")).toBeTruthy();
      expect(screen.getAllByText("All users").length).toBeGreaterThan(0);
      expect(screen.getByText("Runtime controls")).toBeTruthy();
      expect(screen.getByText("Verification funnel")).toBeTruthy();
    });
  });
});
