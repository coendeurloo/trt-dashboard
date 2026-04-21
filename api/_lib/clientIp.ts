import { IncomingHttpHeaders, IncomingMessage } from "node:http";

const readHeader = (req: IncomingMessage, name: string): string | null => {
  const headers = (req.headers ?? {}) as IncomingHttpHeaders;
  const raw = headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeIpToken = (value: string): string | null => {
  const first = value.split(",")[0]?.trim() ?? "";
  if (!first) {
    return null;
  }

  const sanitized = first.replace(/[^a-zA-Z0-9:._-]/g, "");
  return sanitized.length > 0 ? sanitized : null;
};

const isRunningOnVercel = (): boolean =>
  Boolean(
    String(process.env.VERCEL ?? "").trim() ||
      String(process.env.VERCEL_URL ?? "").trim() ||
      String(process.env.VERCEL_ENV ?? "").trim()
  );

export const getTrustedClientIp = (req: IncomingMessage): string => {
  const vercelForwarded = normalizeIpToken(readHeader(req, "x-vercel-forwarded-for") ?? "");
  if (vercelForwarded) {
    return vercelForwarded;
  }

  const realIp = normalizeIpToken(readHeader(req, "x-real-ip") ?? "");
  if (realIp) {
    return realIp;
  }

  if (isRunningOnVercel()) {
    const forwarded = normalizeIpToken(readHeader(req, "x-forwarded-for") ?? "");
    if (forwarded) {
      return forwarded;
    }
  }

  const socketAddress = normalizeIpToken(req.socket?.remoteAddress ?? "");
  if (socketAddress) {
    return socketAddress;
  }

  return "unknown";
};
