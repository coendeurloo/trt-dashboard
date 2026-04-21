import { IncomingMessage, ServerResponse } from "node:http";
import {
  applyApiSecurityHeaders,
  isMutationMethod,
  validateSameOriginRequest
} from "./_lib/httpSecurity.js";
import resolveHandler from "../server/share/resolve.js";
import shortenHandler from "../server/share/shorten.js";

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  applyApiSecurityHeaders(res);
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
};

const resolveShareAction = (req: IncomingMessage): string => {
  const parsed = new URL(req.url ?? "", "http://localhost");
  const fromQuery = String(parsed.searchParams.get("action") ?? "").trim().toLowerCase();
  if (fromQuery) {
    return fromQuery;
  }

  const pathMatch = parsed.pathname.match(/^\/api\/share\/([^/?#]+)$/i);
  if (pathMatch?.[1]) {
    return pathMatch[1].trim().toLowerCase();
  }

  return "";
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  applyApiSecurityHeaders(res);
  const action = resolveShareAction(req);

  if (action === "shorten") {
    if (isMutationMethod(req.method)) {
      const sameOrigin = validateSameOriginRequest(req);
      if (!sameOrigin.allowed) {
        sendJson(res, 403, {
          error: {
            code: sameOrigin.code ?? "CSRF_ORIGIN_MISMATCH",
            message: sameOrigin.message ?? "Cross-site request blocked."
          }
        });
        return;
      }
    }
    await shortenHandler(req, res);
    return;
  }
  if (action === "resolve") {
    await resolveHandler(req, res);
    return;
  }

  sendJson(res, 404, {
    error: {
      code: "SHARE_ACTION_NOT_FOUND",
      message: "Unknown share action"
    }
  });
}
