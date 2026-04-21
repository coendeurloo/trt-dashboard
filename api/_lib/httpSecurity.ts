import { IncomingMessage, ServerResponse } from "node:http";

interface ApplyApiSecurityHeadersOptions {
  csp?: string;
}

export interface SameOriginValidationResult {
  allowed: boolean;
  code?: "CSRF_CROSS_SITE_BLOCKED" | "CSRF_ORIGIN_MISMATCH" | "CSRF_REFERER_MISMATCH";
  message?: string;
}

const DEFAULT_API_CSP =
  "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

const normalizeOrigin = (value: string): string | null => {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
};

const readHeader = (req: IncomingMessage, name: string): string | null => {
  const headers = req.headers ?? {};
  const raw = headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const readForwardedToken = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  const first = value.split(",")[0]?.trim() ?? "";
  return first || null;
};

const resolveRequestOrigin = (req: IncomingMessage): string | null => {
  const host =
    readForwardedToken(readHeader(req, "x-forwarded-host")) ?? readForwardedToken(readHeader(req, "host"));
  if (!host) {
    return null;
  }

  const forwardedProto = readForwardedToken(readHeader(req, "x-forwarded-proto"))?.toLowerCase() ?? "";
  const protocol = forwardedProto || (host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https");
  return normalizeOrigin(`${protocol}://${host}`);
};

const resolveTrustedOrigins = (req: IncomingMessage): Set<string> => {
  const trustedOrigins = new Set<string>();
  const fromEnv = [
    process.env.APP_PUBLIC_ORIGIN,
    process.env.PUBLIC_APP_ORIGIN,
    process.env.NEXT_PUBLIC_APP_ORIGIN,
    process.env.VITE_APP_PUBLIC_ORIGIN
  ];
  fromEnv.forEach((candidate) => {
    if (!candidate) {
      return;
    }
    const normalized = normalizeOrigin(candidate);
    if (normalized) {
      trustedOrigins.add(normalized);
    }
  });

  const requestOrigin = resolveRequestOrigin(req);
  if (requestOrigin) {
    trustedOrigins.add(requestOrigin);
  }

  return trustedOrigins;
};

const readOriginHeader = (req: IncomingMessage): string | null => {
  const header = readHeader(req, "origin");
  if (!header || header.toLowerCase() === "null") {
    return null;
  }
  return normalizeOrigin(header);
};

const readRefererOrigin = (req: IncomingMessage): string | null => {
  const referer = readHeader(req, "referer");
  if (!referer) {
    return null;
  }
  return normalizeOrigin(referer);
};

const isCrossSiteFetch = (req: IncomingMessage): boolean =>
  String(readHeader(req, "sec-fetch-site") ?? "")
    .trim()
    .toLowerCase() === "cross-site";

export const isMutationMethod = (method: string | undefined): boolean => {
  const normalized = String(method ?? "").trim().toUpperCase();
  return normalized === "POST" || normalized === "PUT" || normalized === "PATCH" || normalized === "DELETE";
};

export const validateSameOriginRequest = (req: IncomingMessage): SameOriginValidationResult => {
  if (isCrossSiteFetch(req)) {
    return {
      allowed: false,
      code: "CSRF_CROSS_SITE_BLOCKED",
      message: "Cross-site requests are not allowed for this endpoint."
    };
  }

  const trustedOrigins = resolveTrustedOrigins(req);
  if (trustedOrigins.size === 0) {
    return { allowed: true };
  }

  const origin = readOriginHeader(req);
  if (origin && !trustedOrigins.has(origin)) {
    return {
      allowed: false,
      code: "CSRF_ORIGIN_MISMATCH",
      message: "Request origin is not allowed."
    };
  }

  const refererOrigin = readRefererOrigin(req);
  if (refererOrigin && !trustedOrigins.has(refererOrigin)) {
    return {
      allowed: false,
      code: "CSRF_REFERER_MISMATCH",
      message: "Request referer is not allowed."
    };
  }

  return { allowed: true };
};

export const applyApiSecurityHeaders = (
  res: ServerResponse,
  options?: ApplyApiSecurityHeadersOptions
): void => {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("cross-origin-resource-policy", "same-origin");
  res.setHeader("x-dns-prefetch-control", "off");
  res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
  res.setHeader("content-security-policy", options?.csp ?? DEFAULT_API_CSP);
};
