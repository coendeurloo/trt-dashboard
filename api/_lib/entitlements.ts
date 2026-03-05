import { IncomingMessage } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

export type AiEntitlementRequestType = "analysis" | "extraction";

type AiEntitlementErrorCode = "AI_ENTITLEMENT_REQUIRED" | "AI_PLAN_LIMIT" | "AI_ENTITLEMENT_MISCONFIGURED";

interface SignedEntitlementPayload {
  plan?: unknown;
  entitlements?: unknown;
  features?: unknown;
  exp?: unknown;
  sub?: unknown;
}

export interface AiEntitlementClaims {
  plan: string | null;
  entitlements: string[];
  subject: string | null;
  expiresAt: number | null;
}

export interface AiEntitlementGuardResult {
  allowed: boolean;
  claims?: AiEntitlementClaims;
  error?: {
    statusCode: number;
    code: AiEntitlementErrorCode;
    message: string;
  };
}

interface SignedTokenBuildOptions {
  plan?: string | null;
  entitlements?: string[];
  exp?: number | null;
  sub?: string | null;
}

const DEFAULT_COOKIE_NAME = "lt_ai_entitlement";
const DEFAULT_ALLOWED_PLANS = ["pro", "premium", "lifetime"];

const normalizeTokenPart = (value: string): string =>
  value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const encodeBase64Url = (value: string): string => normalizeTokenPart(Buffer.from(value, "utf8").toString("base64"));

const decodeBase64Url = (value: string): string | null => {
  if (!/^[A-Za-z0-9\-_]+$/.test(value)) {
    return null;
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }
};

const parseBooleanEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const parseCsvList = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized || null;
};

const normalizeFeatureList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => normalizeString(item)).filter((item): item is string => Boolean(item))));
  }
  if (typeof value === "string") {
    return Array.from(new Set(parseCsvList(value)));
  }
  return [];
};

const parseCookieHeader = (rawHeader: string): Record<string, string> => {
  const pairs = rawHeader.split(";").map((pair) => pair.trim());
  const result: Record<string, string> = {};
  pairs.forEach((pair) => {
    const separator = pair.indexOf("=");
    if (separator <= 0) {
      return;
    }
    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!key) {
      return;
    }
    result[key] = decodeURIComponent(value);
  });
  return result;
};

const readHeader = (req: IncomingMessage, name: string): string | null => {
  const raw = req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
};

const getSignedTokenSecret = (): string => String(process.env.AI_ENTITLEMENT_SECRET ?? "").trim();

const getCookieName = (): string => {
  const candidate = String(process.env.AI_ENTITLEMENT_COOKIE_NAME ?? "").trim();
  return candidate || DEFAULT_COOKIE_NAME;
};

const getAllowedPlans = (): Set<string> => {
  const fromEnv = parseCsvList(String(process.env.AI_ALLOWED_PAID_PLANS ?? ""));
  const plans = fromEnv.length > 0 ? fromEnv : DEFAULT_ALLOWED_PLANS;
  return new Set(plans.map((plan) => plan.toLowerCase()));
};

const buildSignature = (payloadPart: string, secret: string): string =>
  normalizeTokenPart(createHmac("sha256", secret).update(payloadPart).digest("base64"));

const signaturesMatch = (expected: string, actual: string): boolean => {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
};

const parseSignedToken = (token: string, secret: string): AiEntitlementClaims | null => {
  const separator = token.indexOf(".");
  if (separator <= 0 || separator >= token.length - 1) {
    return null;
  }
  const payloadPart = token.slice(0, separator);
  const signaturePart = token.slice(separator + 1);
  const expectedSignature = buildSignature(payloadPart, secret);
  if (!signaturesMatch(expectedSignature, signaturePart)) {
    return null;
  }

  const decodedPayload = decodeBase64Url(payloadPart);
  if (!decodedPayload) {
    return null;
  }

  let parsed: SignedEntitlementPayload;
  try {
    parsed = JSON.parse(decodedPayload) as SignedEntitlementPayload;
  } catch {
    return null;
  }

  const plan = normalizeString(parsed.plan);
  const entitlements = normalizeFeatureList(parsed.entitlements ?? parsed.features);
  const subject = normalizeString(parsed.sub);
  const expRaw = Number(parsed.exp);
  const expiresAt = Number.isFinite(expRaw) ? Math.max(0, Math.round(expRaw)) : null;

  if (expiresAt !== null && expiresAt <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return {
    plan,
    entitlements,
    subject,
    expiresAt
  };
};

const resolveSignedClaims = (
  req: IncomingMessage,
  secret: string
): { state: "missing" | "invalid" | "valid"; claims: AiEntitlementClaims | null } => {
  const headerToken = readHeader(req, "x-labtracker-entitlement-token");
  const cookieHeader = readHeader(req, "cookie");
  const cookieToken = cookieHeader ? parseCookieHeader(cookieHeader)[getCookieName()] ?? null : null;
  const token = headerToken ?? cookieToken;
  if (!token) {
    return { state: "missing", claims: null };
  }
  const parsed = parseSignedToken(token, secret);
  if (!parsed) {
    return { state: "invalid", claims: null };
  }
  return { state: "valid", claims: parsed };
};

const resolveUnsafeHeaderClaims = (req: IncomingMessage): AiEntitlementClaims | null => {
  if (!parseBooleanEnv(process.env.AI_ALLOW_UNSAFE_HEADER_ENTITLEMENT, false)) {
    return null;
  }
  const plan = normalizeString(readHeader(req, "x-labtracker-plan"));
  const entitlements = normalizeFeatureList(readHeader(req, "x-labtracker-entitlements"));
  if (!plan && entitlements.length === 0) {
    return null;
  }
  return {
    plan,
    entitlements,
    subject: null,
    expiresAt: null
  };
};

const isEntitledForRequest = (claims: AiEntitlementClaims, requestType: AiEntitlementRequestType): boolean => {
  const allowedPlans = getAllowedPlans();
  if (claims.plan && allowedPlans.has(claims.plan)) {
    return true;
  }

  const grants = new Set(claims.entitlements.map((item) => item.toLowerCase()));
  if (grants.has("all") || grants.has("ai")) {
    return true;
  }
  if (requestType === "analysis") {
    return grants.has("analysis") || grants.has("ai:analysis");
  }
  return (
    grants.has("extraction") ||
    grants.has("parser") ||
    grants.has("ai:extraction") ||
    grants.has("ai:parser")
  );
};

export const createSignedAiEntitlementToken = (claims: SignedTokenBuildOptions, secret: string): string => {
  const payload: Record<string, unknown> = {};
  if (claims.plan) {
    payload.plan = claims.plan;
  }
  if (claims.entitlements && claims.entitlements.length > 0) {
    payload.entitlements = claims.entitlements;
  }
  if (claims.sub) {
    payload.sub = claims.sub;
  }
  if (typeof claims.exp === "number" && Number.isFinite(claims.exp)) {
    payload.exp = Math.round(claims.exp);
  }
  const payloadPart = encodeBase64Url(JSON.stringify(payload));
  const signature = buildSignature(payloadPart, secret);
  return `${payloadPart}.${signature}`;
};

export const requireAiEntitlement = (
  req: IncomingMessage,
  requestType: AiEntitlementRequestType
): AiEntitlementGuardResult => {
  const entitlementRequired = parseBooleanEnv(process.env.AI_REQUIRE_ENTITLEMENT, false);
  if (!entitlementRequired) {
    return { allowed: true };
  }

  const secret = getSignedTokenSecret();
  const unsafeHeaderEnabled = parseBooleanEnv(process.env.AI_ALLOW_UNSAFE_HEADER_ENTITLEMENT, false);
  if (!secret && !unsafeHeaderEnabled) {
    return {
      allowed: false,
      error: {
        statusCode: 500,
        code: "AI_ENTITLEMENT_MISCONFIGURED",
        message: "AI entitlement guard misconfigured on server."
      }
    };
  }

  if (secret) {
    const signed = resolveSignedClaims(req, secret);
    if (signed.state === "invalid") {
      return {
        allowed: false,
        error: {
          statusCode: 403,
          code: "AI_ENTITLEMENT_REQUIRED",
          message: "Missing, invalid, or expired AI entitlement token."
        }
      };
    }
    if (signed.state === "valid" && signed.claims) {
      if (isEntitledForRequest(signed.claims, requestType)) {
        return { allowed: true, claims: signed.claims };
      }
      return {
        allowed: false,
        error: {
          statusCode: 403,
          code: "AI_PLAN_LIMIT",
          message: "Your current plan does not include this AI feature."
        }
      };
    }
  }

  const unsafeClaims = resolveUnsafeHeaderClaims(req);
  if (unsafeClaims) {
    if (isEntitledForRequest(unsafeClaims, requestType)) {
      return { allowed: true, claims: unsafeClaims };
    }
    return {
      allowed: false,
      error: {
        statusCode: 403,
        code: "AI_PLAN_LIMIT",
        message: "Your current plan does not include this AI feature."
      }
    };
  }

  return {
    allowed: false,
    error: {
      statusCode: 403,
      code: "AI_ENTITLEMENT_REQUIRED",
      message: "Paid AI entitlement required."
    }
  };
};
