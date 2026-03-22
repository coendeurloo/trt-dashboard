import { IncomingMessage, ServerResponse } from "node:http";
import { handleAdminError, requireAdminIdentity, sendJson } from "../../api/_lib/supabaseAdmin.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: { message: "Method not allowed" } });
      return;
    }

    const admin = await requireAdminIdentity(req);
    sendJson(res, 200, {
      userId: admin.userId,
      email: admin.email,
      isAdmin: true
    });
  } catch (error) {
    handleAdminError(res, error);
  }
}
