import { afterEach, describe, expect, it } from "vitest";
import { decryptShareToken, encryptShareToken, ShareCryptoConfigError } from "../_lib/shareCrypto";

const ORIGINAL_SECRET = process.env.SHARE_LINK_SECRET_BASE64;

describe("shareCrypto", () => {
  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.SHARE_LINK_SECRET_BASE64;
    } else {
      process.env.SHARE_LINK_SECRET_BASE64 = ORIGINAL_SECRET;
    }
  });

  it("encrypts and decrypts token payloads", () => {
    process.env.SHARE_LINK_SECRET_BASE64 = Buffer.alloc(32, 7).toString("base64");
    const token = "s2.some-token-value";

    const encrypted = encryptShareToken(token);
    const decrypted = decryptShareToken(encrypted);

    expect(decrypted).toBe(token);
    expect(encrypted.v).toBe(1);
    expect(encrypted.iv.length).toBeGreaterThan(0);
  });

  it("fails when SHARE_LINK_SECRET_BASE64 is invalid", () => {
    process.env.SHARE_LINK_SECRET_BASE64 = "invalid-key";

    expect(() => encryptShareToken("abc")).toThrow(ShareCryptoConfigError);
  });
});
