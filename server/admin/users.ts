import { IncomingMessage, ServerResponse } from "node:http";
import {
  AdminApiError,
  escapeFilterValue,
  fetchAllAuthUsers,
  fetchRestCount,
  fetchRestRows,
  handleAdminError,
  requireAdminIdentity,
  sendJson
} from "../../api/_lib/supabaseAdmin.js";

interface SyncSummaryRow {
  device_id: string | null;
  last_revision: number | null;
  last_synced_at: string | null;
}

const extractPlanSummary = (
  authUser: {
    app_metadata?: Record<string, unknown> | null;
    user_metadata?: Record<string, unknown> | null;
  },
  profileSettings: Record<string, unknown> | null
): { plan: string | null; entitlements: string[] } | null => {
  const readPlan = (...values: unknown[]): string | null => {
    for (const value of values) {
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
    return null;
  };

  const readEntitlements = (...values: unknown[]): string[] => {
    for (const value of values) {
      if (Array.isArray(value)) {
        const normalized = value
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter((item) => item.length > 0);
        if (normalized.length > 0) {
          return Array.from(new Set(normalized));
        }
      }
      if (typeof value === "string") {
        const normalized = value
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
        if (normalized.length > 0) {
          return Array.from(new Set(normalized));
        }
      }
    }
    return [];
  };

  const appMetadata = authUser.app_metadata ?? {};
  const userMetadata = authUser.user_metadata ?? {};
  const plan = readPlan(
    appMetadata.plan,
    appMetadata.subscription_plan,
    userMetadata.plan,
    userMetadata.subscription_plan,
    profileSettings?.plan,
    profileSettings?.subscriptionPlan
  );
  const entitlements = readEntitlements(
    appMetadata.entitlements,
    userMetadata.entitlements,
    profileSettings?.entitlements
  );

  if (!plan && entitlements.length === 0) {
    return null;
  }

  return {
    plan,
    entitlements
  };
};

const readQuery = (req: IncomingMessage): string => {
  const url = new URL(req.url ?? "", "http://localhost");
  return String(url.searchParams.get("query") ?? "").trim();
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: { message: "Method not allowed" } });
      return;
    }

    const admin = await requireAdminIdentity(req);
    const query = readQuery(req);
    if (query.length < 2) {
      throw new AdminApiError(400, "ADMIN_USER_QUERY_REQUIRED", "Provide at least 2 characters for query.");
    }

    const authUsers = await fetchAllAuthUsers(admin.env, {
      pageSize: 200,
      maxPages: 100
    });

    const queryLower = query.toLowerCase();
    const exactMatch = authUsers.find(
      (user) => typeof user.email === "string" && user.email.trim().toLowerCase() === queryLower
    );
    const fallbackMatch = authUsers.find(
      (user) => typeof user.email === "string" && user.email.trim().toLowerCase().includes(queryLower)
    );
    const matchedUser = exactMatch ?? fallbackMatch;

    if (!matchedUser) {
      sendJson(res, 200, {
        query,
        user: null
      });
      return;
    }

    const userIdFilter = `user_id=eq.${escapeFilterValue(matchedUser.id)}`;

    const [consentCount, reportsCount, checkInsCount, protocolsCount] = await Promise.all([
      fetchRestCount(
        admin.env,
        "user_consents",
        `${userIdFilter}&privacy_policy_accepted_at=not.is.null&health_data_consent_at=not.is.null`
      ),
      fetchRestCount(admin.env, "lab_reports", userIdFilter),
      fetchRestCount(admin.env, "check_ins", userIdFilter),
      fetchRestCount(admin.env, "protocols", userIdFilter)
    ]);

    const [syncRows, profileRows] = await Promise.all([
      fetchRestRows<SyncSummaryRow>(
        admin.env,
        "sync_state",
        `select=device_id,last_revision,last_synced_at&${userIdFilter}&order=last_synced_at.desc.nullslast&limit=1`
      ),
      fetchRestRows<{ settings: Record<string, unknown> | null }>(
        admin.env,
        "profiles",
        `select=settings&id=eq.${escapeFilterValue(matchedUser.id)}&limit=1`
      )
    ]);

    const sync = syncRows[0] ?? null;
    const profileSettingsWrapper = profileRows[0]?.settings ?? null;
    const profileSettings =
      profileSettingsWrapper && typeof profileSettingsWrapper === "object" && "settings" in profileSettingsWrapper
        ? ((profileSettingsWrapper as { settings?: Record<string, unknown> }).settings ?? null)
        : profileSettingsWrapper;

    sendJson(res, 200, {
      query,
      user: {
        id: matchedUser.id,
        email: matchedUser.email ?? null,
        createdAt: matchedUser.created_at ?? null,
        lastSignInAt: matchedUser.last_sign_in_at ?? null
      },
      summary: {
        hasConsent: consentCount > 0,
        reportsCount,
        checkInsCount,
        protocolsCount,
        latestSyncRevision:
          typeof sync?.last_revision === "number" && Number.isFinite(sync.last_revision)
            ? sync.last_revision
            : null,
        latestSyncAt: sync?.last_synced_at ?? null
      },
      plan: extractPlanSummary(matchedUser, profileSettings as Record<string, unknown> | null)
    });
  } catch (error) {
    handleAdminError(res, error);
  }
}
