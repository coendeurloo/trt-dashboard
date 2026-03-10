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

  it("maps sync conflicts to a conflict-specific message", () => {
    const message = mapCloudSyncErrorToMessage("REVISION_MISMATCH:revision mismatch", tr);
    expect(message).toBe(
      "A sync conflict was detected. First choose whether to keep the cloud or local version."
    );
  });
});

