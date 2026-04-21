import { incrementCounterWindow } from "./redisStore.js";

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export type RequestType =
  | "extraction"
  | "analysis"
  | "parser_improvement"
  | "auth_login"
  | "auth_register"
  | "auth_resend_verification"
  | "auth_unlock"
  | "cloud_sync_write"
  | "cloud_consent_write"
  | "cloud_delete_account"
  | "share_shorten"
  | "share_resolve";

const RATE_LIMITS: Record<RequestType, RateLimitConfig> = {
  extraction: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 60
  },
  analysis: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 10
  },
  parser_improvement: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 5
  },
  auth_login: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 5
  },
  auth_register: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 5
  },
  auth_resend_verification: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 5
  },
  auth_unlock: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 5
  },
  cloud_sync_write: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 120
  },
  cloud_consent_write: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 30
  },
  cloud_delete_account: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 5
  },
  share_shorten: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 30
  },
  share_resolve: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 240
  }
};

export const checkRateLimit = async (ip: string, requestType: RequestType): Promise<RateLimitResult> => {
  const config = RATE_LIMITS[requestType];
  const windowSeconds = Math.max(1, Math.ceil(config.windowMs / 1000));
  const key = `ai:rate:${requestType}:${ip}`;
  const result = await incrementCounterWindow(key, windowSeconds, 1);

  return {
    allowed: result.count <= config.maxRequests,
    remaining: Math.max(0, config.maxRequests - result.count),
    resetAt: Date.now() + result.ttlSeconds * 1000
  };
};
