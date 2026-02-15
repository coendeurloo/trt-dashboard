export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

type RequestType = "extraction" | "analysis";

interface CounterEntry {
  count: number;
  windowStart: number;
}

const counters = new Map<string, CounterEntry>();

const RATE_LIMITS: Record<RequestType, RateLimitConfig> = {
  extraction: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 60
  },
  analysis: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 10
  }
};

export const checkRateLimit = (ip: string, requestType: RequestType): RateLimitResult => {
  const config = RATE_LIMITS[requestType];
  const now = Date.now();
  const key = `${ip}:${requestType}`;
  const entry = counters.get(key);

  if (!entry || now - entry.windowStart >= config.windowMs) {
    counters.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: Math.max(0, config.maxRequests - 1),
      resetAt: now + config.windowMs
    };
  }

  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.windowStart + config.windowMs
    };
  }

  entry.count += 1;
  counters.set(key, entry);

  return {
    allowed: true,
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetAt: entry.windowStart + config.windowMs
  };
};

export type { RequestType };
