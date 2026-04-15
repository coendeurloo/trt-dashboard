import { IncomingMessage, ServerResponse } from "node:http";
import {
  fetchAllAuthUsers,
  handleAdminError,
  requireAdminIdentity,
  sendJson
} from "../../api/_lib/supabaseAdmin.js";

const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 1000;

const parseLimit = (req: IncomingMessage): number => {
  const url = new URL(req.url ?? "", "http://localhost");
  const raw = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(MAX_LIMIT, Math.floor(raw));
};

const parseQuery = (req: IncomingMessage): string => {
  const url = new URL(req.url ?? "", "http://localhost");
  return String(url.searchParams.get("query") ?? "").trim().toLowerCase();
};

const toTimestamp = (value: string | null | undefined): number => {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: { message: "Method not allowed" } });
      return;
    }

    const admin = await requireAdminIdentity(req);
    const limit = parseLimit(req);
    const query = parseQuery(req);
    const authUsers = await fetchAllAuthUsers(admin.env, {
      pageSize: 200,
      maxPages: 100
    });

    const filtered = query
      ? authUsers.filter((user) => {
          const email = String(user.email ?? "").trim().toLowerCase();
          return email.includes(query);
        })
      : authUsers;

    const users = [...filtered]
      .sort((left, right) => toTimestamp(right.created_at) - toTimestamp(left.created_at))
      .slice(0, limit)
      .map((user) => ({
        id: user.id,
        email: user.email ?? null,
        createdAt: user.created_at ?? null,
        lastSignInAt: user.last_sign_in_at ?? null
      }));

    sendJson(res, 200, {
      query,
      totalUsers: authUsers.length,
      returnedUsers: users.length,
      limit,
      users
    });
  } catch (error) {
    handleAdminError(res, error);
  }
}

