import { IncomingMessage, ServerResponse } from "node:http";
import {
  applyApiSecurityHeaders,
  isMutationMethod,
  validateSameOriginRequest
} from "./_lib/httpSecurity.js";
import analysisHandler from "../server/gemini/analysis.js";
import extractHandler from "../server/gemini/extract.js";

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  applyApiSecurityHeaders(res);
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
};

const resolveGeminiAction = (req: IncomingMessage): string => {
  const parsed = new URL(req.url ?? "", "http://localhost");
  const fromQuery = String(parsed.searchParams.get("action") ?? "").trim().toLowerCase();
  if (fromQuery) {
    return fromQuery;
  }

  const pathMatch = parsed.pathname.match(/^\/api\/gemini\/([^/?#]+)$/i);
  if (pathMatch?.[1]) {
    return pathMatch[1].trim().toLowerCase();
  }

  return "";
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  applyApiSecurityHeaders(res);
  const action = resolveGeminiAction(req);

  if (action === "analysis" || action === "extract") {
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
  }

  if (action === "analysis") {
    await analysisHandler(req, res);
    return;
  }
  if (action === "extract") {
    await extractHandler(req, res);
    return;
  }

  sendJson(res, 404, {
    error: {
      code: "GEMINI_ACTION_NOT_FOUND",
      message: "Unknown gemini action"
    }
  });
}
