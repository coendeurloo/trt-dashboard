import { Redis } from "@upstash/redis";

export class RedisStoreUnavailableError extends Error {
  code: string;

  constructor(message = "AI limits store unavailable") {
    super(message);
    this.name = "RedisStoreUnavailableError";
    this.code = "AI_LIMITS_UNAVAILABLE";
  }
}

let redisClient: Redis | null = null;

const getRedisClient = (): Redis => {
  if (redisClient) {
    return redisClient;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim() ?? "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ?? "";
  if (!url || !token) {
    throw new RedisStoreUnavailableError("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN");
  }

  redisClient = new Redis({
    url,
    token
  });
  return redisClient;
};

const parseNumber = (raw: unknown): number => {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
};

const wrapStoreError = (error: unknown): RedisStoreUnavailableError => {
  if (error instanceof RedisStoreUnavailableError) {
    return error;
  }
  const message = error instanceof Error ? error.message : "Redis request failed";
  return new RedisStoreUnavailableError(message);
};

export const incrementCounterWindow = async (
  key: string,
  windowSeconds: number,
  amount = 1
): Promise<{ count: number; ttlSeconds: number }> => {
  try {
    const redis = getRedisClient();
    const countRaw = amount === 1 ? await redis.incr(key) : await redis.incrby(key, amount);
    const count = parseNumber(countRaw);
    let ttl = parseNumber(await redis.ttl(key));
    if (ttl <= 0) {
      await redis.expire(key, Math.max(1, windowSeconds));
      ttl = parseNumber(await redis.ttl(key));
    }
    return {
      count,
      ttlSeconds: Math.max(1, Math.round(ttl))
    };
  } catch (error) {
    throw wrapStoreError(error);
  }
};

export const incrementFloatWindow = async (
  key: string,
  windowSeconds: number,
  amount: number
): Promise<{ value: number; ttlSeconds: number }> => {
  try {
    const redis = getRedisClient();
    const raw = await redis.incrbyfloat(key, amount);
    const value = parseNumber(raw);
    let ttl = parseNumber(await redis.ttl(key));
    if (ttl <= 0) {
      await redis.expire(key, Math.max(1, windowSeconds));
      ttl = parseNumber(await redis.ttl(key));
    }
    return {
      value,
      ttlSeconds: Math.max(1, Math.round(ttl))
    };
  } catch (error) {
    throw wrapStoreError(error);
  }
};

export const getCounter = async (key: string): Promise<number> => {
  try {
    const redis = getRedisClient();
    const raw = await redis.get(key);
    return parseNumber(raw);
  } catch (error) {
    throw wrapStoreError(error);
  }
};
