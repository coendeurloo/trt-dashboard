import { describe, expect, it } from "vitest";
import {
  buildVerifiedRedirectUrl,
  buildWrappedVerificationUrl,
  resolveAppPublicOrigin
} from "./cloudAuthEmail";

describe("cloud auth email helpers", () => {
  it("builds a branded wrapped verification URL", () => {
    const wrappedUrl = buildWrappedVerificationUrl(
      "https://labtracker.app",
      "https://project.supabase.co/auth/v1/verify?token=abc&type=signup"
    );

    expect(wrappedUrl).toBe(
      "https://labtracker.app/auth/confirm?confirmation_url=https%3A%2F%2Fproject.supabase.co%2Fauth%2Fv1%2Fverify%3Ftoken%3Dabc%26type%3Dsignup"
    );
  });

  it("builds the verified redirect URL from the public origin", () => {
    expect(buildVerifiedRedirectUrl("https://labtracker.app")).toBe("https://labtracker.app/auth/verified");
  });

  it("prefers APP_PUBLIC_ORIGIN when resolving the public origin", () => {
    const previous = process.env.APP_PUBLIC_ORIGIN;
    process.env.APP_PUBLIC_ORIGIN = "https://labtracker.app";

    expect(resolveAppPublicOrigin()).toBe("https://labtracker.app");

    if (previous) {
      process.env.APP_PUBLIC_ORIGIN = previous;
    } else {
      delete process.env.APP_PUBLIC_ORIGIN;
    }
  });
});
