import { describe, expect, it } from "vitest";
import { mapCloudAuthErrorToMessage, mapCloudSyncErrorToMessage } from "../lib/cloudErrorMessages";

const tr = (_nl: string, en: string): string => en;

describe("cloud error message mapping", () => {
  it("maps generic auth http 400 to a user-friendly message", () => {
    const message = mapCloudAuthErrorToMessage("AUTH_HTTP_400", tr);
    expect(message).toBe("Cloud auth failed. Please try again or sign in again later.");
  });

  it("maps invalid credentials to a clear sign-in message", () => {
    const message = mapCloudAuthErrorToMessage("AUTH_INVALID_CREDENTIALS", tr);
    expect(message).toBe("Sign-in failed. This account doesn't exist or the password is incorrect.");
  });

  it("maps verification-required sign-up responses to a clear next step", () => {
    const message = mapCloudAuthErrorToMessage("AUTH_EMAIL_VERIFICATION_REQUIRED", tr);
    expect(message).toBe("Check your inbox and verify your email first. Then sign in.");
  });

  it("maps account lock responses to unlock guidance", () => {
    const message = mapCloudAuthErrorToMessage("AUTH_ACCOUNT_LOCKED", tr);
    expect(message).toBe("Too many failed attempts. Request an unlock email to regain access.");
  });

  it("maps sync conflicts to a conflict-specific message", () => {
    const message = mapCloudSyncErrorToMessage("REVISION_MISMATCH:revision mismatch", tr);
    expect(message).toBe(
      "A sync conflict was detected. First choose whether to keep the cloud or local version."
    );
  });

  it("maps raw JSON bad-request sync errors to a friendly message", () => {
    const message = mapCloudSyncErrorToMessage('{"detail":"Bad Request"}', tr);
    expect(message).toBe("Cloud sync could not process the request. Please try again.");
  });

  it("maps raw JSON bad-request auth errors to a friendly message", () => {
    const message = mapCloudAuthErrorToMessage('{"detail":"Bad Request"}', tr);
    expect(message).toBe("The request could not be processed. Check your details and try again.");
  });
});
