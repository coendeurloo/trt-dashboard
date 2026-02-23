import { Redis } from "@upstash/redis";

export class ShareStoreUnavailableError extends Error {
  code: string;

  constructor(message = "Share link store unavailable") {
    super(message);
    this.name = "ShareStoreUnavailableError";
    this.code = "SHARE_STORE_UNAVAILABLE";
  }
}

interface ShareStoreRecord {
  v: 1;
  createdAt: string;
  expiresAt: string;
  iv: string;
  tag: string;
  data: string;
}

let redisClient: Redis | null = null;

const getRedisClient = (): Redis => {
  if (redisClient) {
    return redisClient;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim() ?? "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ?? "";
  if (!url || !token) {
    throw new ShareStoreUnavailableError("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN");
  }

  redisClient = new Redis({
    url,
    token
  });
  return redisClient;
};

const wrapStoreError = (error: unknown): ShareStoreUnavailableError => {
  if (error instanceof ShareStoreUnavailableError) {
    return error;
  }
  const message = error instanceof Error ? error.message : "Redis request failed";
  return new ShareStoreUnavailableError(message);
};

const buildStoreKey = (code: string): string => `share:link:${code}`;

export const saveShareRecord = async (code: string, record: ShareStoreRecord, ttlSeconds: number): Promise<void> => {
  try {
    const redis = getRedisClient();
    await redis.set(buildStoreKey(code), record, {
      ex: Math.max(1, Math.round(ttlSeconds))
    });
  } catch (error) {
    throw wrapStoreError(error);
  }
};

export const loadShareRecord = async (code: string): Promise<ShareStoreRecord | null> => {
  try {
    const redis = getRedisClient();
    const record = await redis.get<ShareStoreRecord>(buildStoreKey(code));
    if (!record || typeof record !== "object") {
      return null;
    }
    return record;
  } catch (error) {
    throw wrapStoreError(error);
  }
};
