import { IncomingMessage, ServerResponse } from "node:http";
import { getVerificationFunnelSnapshot } from "../../api/_lib/cloudVerificationFunnel.js";
import {
  fetchAllAuthUsers,
  fetchRestCount,
  fetchRestRows,
  handleAdminError,
  requireAdminIdentity,
  sendJson
} from "../../api/_lib/supabaseAdmin.js";

const LOOKBACK_7_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const LOOKBACK_30_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const collectDistinctUserIdsFromTable = async (
  env: Parameters<typeof fetchRestRows>[0],
  table: string
): Promise<Set<string>> => {
  const pageSize = 1000;
  let offset = 0;
  const userIds = new Set<string>();

  while (offset < 50_000) {
    const rows = await fetchRestRows<{ user_id: string | null }>(
      env,
      table,
      `select=user_id&user_id=not.is.null&limit=${pageSize}&offset=${offset}`
    );
    rows.forEach((row) => {
      if (typeof row.user_id === "string" && row.user_id.trim().length > 0) {
        userIds.add(row.user_id);
      }
    });

    if (rows.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return userIds;
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: { message: "Method not allowed" } });
      return;
    }

    const admin = await requireAdminIdentity(req);
    const { env } = admin;

    const authUsers = await fetchAllAuthUsers(env, {
      pageSize: 200,
      maxPages: 100
    });

    const now = Date.now();
    const recentSignup7d = authUsers.filter((user) => {
      const createdAt = Date.parse(String(user.created_at ?? ""));
      return Number.isFinite(createdAt) && now - createdAt <= LOOKBACK_7_DAYS_MS;
    }).length;
    const recentSignup30d = authUsers.filter((user) => {
      const createdAt = Date.parse(String(user.created_at ?? ""));
      return Number.isFinite(createdAt) && now - createdAt <= LOOKBACK_30_DAYS_MS;
    }).length;

    const latestSignup = authUsers
      .map((user) => String(user.created_at ?? "").trim())
      .filter((value) => value.length > 0)
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

    const usersWithConsent = await fetchRestCount(
      env,
      "user_consents",
      "privacy_policy_accepted_at=not.is.null&health_data_consent_at=not.is.null"
    );

    const totalReports = await fetchRestCount(env, "lab_reports", "");
    const totalCheckIns = await fetchRestCount(env, "check_ins", "");
    const totalProtocols = await fetchRestCount(env, "protocols", "");

    const syncRow = await fetchRestRows<{ last_synced_at: string | null }>(
      env,
      "sync_state",
      "select=last_synced_at&last_synced_at=not.is.null&order=last_synced_at.desc.nullslast&limit=1"
    );

    const syncedSets = await Promise.all([
      collectDistinctUserIdsFromTable(env, "lab_reports"),
      collectDistinctUserIdsFromTable(env, "check_ins"),
      collectDistinctUserIdsFromTable(env, "protocols"),
      collectDistinctUserIdsFromTable(env, "supplement_timeline")
    ]);
    const syncedUsers = new Set<string>();
    syncedSets.forEach((set) => {
      set.forEach((userId) => syncedUsers.add(userId));
    });

    const recentUsers = authUsers
      .filter((user) => typeof user.email === "string" && user.email.trim().length > 0)
      .sort((a, b) => Date.parse(String(b.created_at ?? "")) - Date.parse(String(a.created_at ?? "")))
      .slice(0, 5)
      .map((user) => ({
        id: user.id,
        email: String(user.email ?? ""),
        createdAt: user.created_at ?? null
      }));

    const verificationFunnel = await getVerificationFunnelSnapshot();

    sendJson(res, 200, {
      totals: {
        totalAccounts: authUsers.length,
        recentSignups7d: recentSignup7d,
        recentSignups30d: recentSignup30d,
        usersWithConsent,
        usersWithSyncedData: syncedUsers.size,
        totalReports,
        totalCheckIns,
        totalProtocols
      },
      activity: {
        latestSignupAt: latestSignup,
        lastSyncAt: syncRow[0]?.last_synced_at ?? null
      },
      recentUsers,
      verificationFunnel
    });
  } catch (error) {
    handleAdminError(res, error);
  }
}
