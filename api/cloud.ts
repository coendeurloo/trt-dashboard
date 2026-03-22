import { IncomingMessage, ServerResponse } from "node:http";
import consentHandler from "../server/cloud/consent.js";
import deleteAccountHandler from "../server/cloud/delete-account.js";
import incrementalHandler from "../server/cloud/incremental.js";
import replaceHandler from "../server/cloud/replace.js";

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
};

const resolveCloudAction = (req: IncomingMessage): string => {
  const parsed = new URL(req.url ?? "", "http://localhost");
  const fromQuery = String(parsed.searchParams.get("action") ?? "").trim().toLowerCase();
  if (fromQuery) {
    return fromQuery;
  }

  const pathMatch = parsed.pathname.match(/^\/api\/cloud\/([^/?#]+)$/i);
  if (pathMatch?.[1]) {
    return pathMatch[1].trim().toLowerCase();
  }

  return "";
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const action = resolveCloudAction(req);

  if (action === "consent") {
    await consentHandler(req, res);
    return;
  }
  if (action === "replace") {
    await replaceHandler(req, res);
    return;
  }
  if (action === "incremental") {
    await incrementalHandler(req, res);
    return;
  }
  if (action === "delete-account") {
    await deleteAccountHandler(req, res);
    return;
  }

  sendJson(res, 404, {
    error: {
      code: "CLOUD_ACTION_NOT_FOUND",
      message: "Unknown cloud action"
    }
  });
}
