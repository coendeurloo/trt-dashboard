import { IncomingMessage, ServerResponse } from "node:http";
import {
  getRuntimeConfig,
  sanitizeRuntimeConfigPatch,
  updateRuntimeConfig
} from "../../api/_lib/adminRuntimeConfig.js";
import {
  AdminApiError,
  handleAdminError,
  readJsonBody,
  requireAdminIdentity,
  sendJson
} from "../../api/_lib/supabaseAdmin.js";

interface RuntimeConfigRequestBody {
  patch?: unknown;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      sendJson(res, 405, { error: { message: "Method not allowed" } });
      return;
    }

    const admin = await requireAdminIdentity(req);

    if (req.method === "GET") {
      const config = await getRuntimeConfig(admin.env);
      sendJson(res, 200, {
        config,
        editableFlags: [
          "upstashKeepaliveEnabled",
          "cloudSignupEnabled",
          "shareLinksEnabled",
          "parserImprovementEnabled",
          "aiAnalysisEnabled"
        ]
      });
      return;
    }

    const body = await readJsonBody<RuntimeConfigRequestBody>(req);
    const patch = sanitizeRuntimeConfigPatch(body.patch);
    if (Object.keys(patch).length === 0) {
      throw new AdminApiError(400, "ADMIN_RUNTIME_CONFIG_PATCH_EMPTY", "Provide at least one boolean flag in patch.");
    }

    const config = await updateRuntimeConfig(admin, patch);
    sendJson(res, 200, {
      ok: true,
      config
    });
  } catch (error) {
    handleAdminError(res, error);
  }
}
