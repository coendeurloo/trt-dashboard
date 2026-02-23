import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class ShareCryptoConfigError extends Error {
  code: string;

  constructor(message = "Share link crypto misconfigured") {
    super(message);
    this.name = "ShareCryptoConfigError";
    this.code = "SHARE_CRYPTO_MISCONFIGURED";
  }
}

export interface EncryptedSharePayload {
  v: 1;
  iv: string;
  tag: string;
  data: string;
}

const AES_KEY_BYTES = 32;
const IV_BYTES = 12;
let cachedKey: Buffer | null = null;
let cachedRawKey = "";

const parseSecretKey = (): Buffer => {
  const raw = process.env.SHARE_LINK_SECRET_BASE64?.trim() ?? "";
  if (!raw) {
    throw new ShareCryptoConfigError("Missing SHARE_LINK_SECRET_BASE64");
  }

  if (cachedKey && cachedRawKey === raw) {
    return cachedKey;
  }

  let decoded: Buffer;
  try {
    decoded = Buffer.from(raw, "base64");
  } catch {
    throw new ShareCryptoConfigError("Invalid SHARE_LINK_SECRET_BASE64 encoding");
  }

  if (decoded.length !== AES_KEY_BYTES) {
    throw new ShareCryptoConfigError("SHARE_LINK_SECRET_BASE64 must decode to exactly 32 bytes");
  }

  cachedRawKey = raw;
  cachedKey = decoded;
  return decoded;
};

const toBase64 = (value: Buffer): string => value.toString("base64");
const fromBase64 = (value: string): Buffer => {
  try {
    return Buffer.from(value, "base64");
  } catch {
    throw new ShareCryptoConfigError("Invalid encrypted payload encoding");
  }
};

export const encryptShareToken = (token: string): EncryptedSharePayload => {
  const key = parseSecretKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    v: 1,
    iv: toBase64(iv),
    tag: toBase64(tag),
    data: toBase64(ciphertext)
  };
};

export const decryptShareToken = (payload: EncryptedSharePayload): string => {
  if (!payload || payload.v !== 1) {
    throw new ShareCryptoConfigError("Unsupported encrypted share payload version");
  }

  const key = parseSecretKey();
  const iv = fromBase64(payload.iv);
  const authTag = fromBase64(payload.tag);
  const data = fromBase64(payload.data);

  if (iv.length !== IV_BYTES) {
    throw new ShareCryptoConfigError("Invalid encrypted share payload IV");
  }

  if (authTag.length !== 16) {
    throw new ShareCryptoConfigError("Invalid encrypted share payload auth tag");
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    throw new ShareCryptoConfigError("Unable to decrypt share payload");
  }
};
