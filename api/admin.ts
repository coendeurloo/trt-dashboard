import { IncomingMessage, ServerResponse } from "node:http";
import { applyApiSecurityHeaders } from "./_lib/httpSecurity.js";
import auditLogHandler from "../server/admin/audit-log.js";
import meHandler from "../server/admin/me.js";
import overviewHandler from "../server/admin/overview.js";
import runtimeConfigHandler from "../server/admin/runtime-config.js";
import systemStatusHandler from "../server/admin/system-status.js";
import usersHandler from "../server/admin/users.js";
import usersDirectoryHandler from "../server/admin/users-directory.js";

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  applyApiSecurityHeaders(res);
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
};

const resolveAdminAction = (req: IncomingMessage): string => {
  const parsed = new URL(req.url ?? "", "http://localhost");
  const fromQuery = String(parsed.searchParams.get("action") ?? "").trim().toLowerCase();
  if (fromQuery) {
    return fromQuery;
  }

  const pathMatch = parsed.pathname.match(/^\/api\/admin\/([^/?#]+)$/i);
  if (pathMatch?.[1]) {
    return pathMatch[1].trim().toLowerCase();
  }

  return "";
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  applyApiSecurityHeaders(res);
  const action = resolveAdminAction(req);

  if (action === "me") {
    await meHandler(req, res);
    return;
  }
  if (action === "overview") {
    await overviewHandler(req, res);
    return;
  }
  if (action === "system-status") {
    await systemStatusHandler(req, res);
    return;
  }
  if (action === "users") {
    await usersHandler(req, res);
    return;
  }
  if (action === "users-directory") {
    await usersDirectoryHandler(req, res);
    return;
  }
  if (action === "runtime-config") {
    await runtimeConfigHandler(req, res);
    return;
  }
  if (action === "audit-log") {
    await auditLogHandler(req, res);
    return;
  }

  sendJson(res, 404, {
    error: {
      code: "ADMIN_ACTION_NOT_FOUND",
      message: "Unknown admin action"
    }
  });
}
