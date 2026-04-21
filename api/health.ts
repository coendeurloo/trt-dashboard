import { IncomingMessage, ServerResponse } from "node:http";
import { applyApiSecurityHeaders } from "./_lib/httpSecurity.js";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  applyApiSecurityHeaders(res);
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: { message: "Method not allowed" } }));
    return;
  }

  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ status: "ok" }));
}
