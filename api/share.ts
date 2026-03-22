import { IncomingMessage, ServerResponse } from "node:http";
import resolveHandler from "../server/share/resolve.js";
import shortenHandler from "../server/share/shorten.js";

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
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
  const action = resolveShareAction(req);

  if (action === "shorten") {
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
