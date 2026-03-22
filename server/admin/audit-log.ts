import { IncomingMessage, ServerResponse } from "node:http";
import { listRuntimeConfigAuditLog } from "../../api/_lib/adminRuntimeConfig.js";
import { handleAdminError, requireAdminIdentity, sendJson } from "../../api/_lib/supabaseAdmin.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: { message: "Method not allowed" } });
      return;
    }

    const admin = await requireAdminIdentity(req);
    const entries = await listRuntimeConfigAuditLog(admin.env);

    sendJson(res, 200, {
      entries
    });
  } catch (error) {
    handleAdminError(res, error);
  }
}
