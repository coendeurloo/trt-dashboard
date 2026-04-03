/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CloudAuthModal from "../components/CloudAuthModal";

describe("CloudAuthModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a dedicated sign-in view without a mode switch", () => {
    render(
      <CloudAuthModal
        open
        language="en"
        theme="dark"
        configured
        initialView="signin"
        authStatus="unauthenticated"
        authError={null}
        consentRequired={false}
        privacyPolicyVersion="2026-03-09"
        onClose={vi.fn()}
        onSignInGoogle={vi.fn(async () => undefined)}
        onSignInEmail={vi.fn(async () => undefined)}
        onSignUpEmail={vi.fn(async () => undefined)}
        onCompleteConsent={vi.fn(async () => undefined)}
        onRequestVerificationEmail={vi.fn(async () => undefined)}
        onRequestPasswordResetEmail={vi.fn(async () => undefined)}
        onOpenView={vi.fn()}
      />
    );

    expect(screen.getByText("Sign in for cloud sync")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
  });

  it("prefills the sign-in email when one is provided", () => {
    render(
      <CloudAuthModal
        open
        language="en"
        theme="dark"
        configured
        initialView="signin"
        initialEmail="prefill@example.com"
        authStatus="unauthenticated"
        authError={null}
        consentRequired={false}
        privacyPolicyVersion="2026-03-09"
        onClose={vi.fn()}
        onSignInGoogle={vi.fn(async () => undefined)}
        onSignInEmail={vi.fn(async () => undefined)}
        onSignUpEmail={vi.fn(async () => undefined)}
        onCompleteConsent={vi.fn(async () => undefined)}
        onRequestVerificationEmail={vi.fn(async () => undefined)}
        onRequestPasswordResetEmail={vi.fn(async () => undefined)}
        onOpenView={vi.fn()}
      />
    );

    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("prefill@example.com");
  });

  it("requires consent before enabling signup actions", async () => {
    const onSignUpEmail = vi.fn(async () => undefined);
    const onSignInGoogle = vi.fn(async () => undefined);
    const onClose = vi.fn();

    render(
      <CloudAuthModal
        open
        language="en"
        theme="dark"
        configured
        initialView="signup"
        authStatus="unauthenticated"
        authError={null}
        consentRequired={false}
        privacyPolicyVersion="2026-03-09"
        onClose={onClose}
        onSignInGoogle={onSignInGoogle}
        onSignInEmail={vi.fn(async () => undefined)}
        onSignUpEmail={onSignUpEmail}
        onCompleteConsent={vi.fn(async () => undefined)}
        onRequestVerificationEmail={vi.fn(async () => undefined)}
        onRequestPasswordResetEmail={vi.fn(async () => undefined)}
        onOpenView={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(
      screen.getByText("Start here: check both consent boxes first to continue.")
    ).toBeTruthy();
    expect(onSignInGoogle).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => {
      expect((screen.getByRole("button", { name: "Create account" }) as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.focus(screen.getByLabelText("Email"));
    expect(
      screen.getByText("Start here: check both consent boxes first to continue.")
    ).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/i agree to the privacy policy/i));
    fireEvent.click(screen.getByLabelText(/i explicitly consent to processing health data/i));

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret12" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(onSignUpEmail).toHaveBeenCalledWith("test@example.com", "secret12", {
        acceptPrivacyPolicy: true,
        acceptHealthDataConsent: true,
        privacyPolicyVersion: "2026-03-09"
      });
    });
  });

  it("does not close the modal immediately on Google sign-in click", async () => {
    const onClose = vi.fn();
    const onSignInGoogle = vi.fn(async () => undefined);

    render(
      <CloudAuthModal
        open
        language="en"
        theme="dark"
        configured
        initialView="signin"
        authStatus="unauthenticated"
        authError={null}
        consentRequired={false}
        privacyPolicyVersion="2026-03-09"
        onClose={onClose}
        onSignInGoogle={onSignInGoogle}
        onSignInEmail={vi.fn(async () => undefined)}
        onSignUpEmail={vi.fn(async () => undefined)}
        onCompleteConsent={vi.fn(async () => undefined)}
        onRequestVerificationEmail={vi.fn(async () => undefined)}
        onRequestPasswordResetEmail={vi.fn(async () => undefined)}
        onOpenView={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(onSignInGoogle).toHaveBeenCalledWith("signin", undefined);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("links to privacy policy in a new tab from signup", () => {
    render(
      <CloudAuthModal
        open
        language="en"
        theme="dark"
        configured
        initialView="signup"
        authStatus="unauthenticated"
        authError={null}
        consentRequired={false}
        privacyPolicyVersion="2026-03-09"
        onClose={vi.fn()}
        onSignInGoogle={vi.fn(async () => undefined)}
        onSignInEmail={vi.fn(async () => undefined)}
        onSignUpEmail={vi.fn(async () => undefined)}
        onCompleteConsent={vi.fn(async () => undefined)}
        onRequestVerificationEmail={vi.fn(async () => undefined)}
        onRequestPasswordResetEmail={vi.fn(async () => undefined)}
        onOpenView={vi.fn()}
      />
    );

    const link = screen.getByRole("link", { name: "privacy policy" });
    expect(link.getAttribute("href")).toBe("/privacy-policy.html");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("renders a friendly error message for invalid credentials", () => {
    render(
      <CloudAuthModal
        open
        language="en"
        theme="dark"
        configured
        initialView="signin"
        authStatus="unauthenticated"
        authError="AUTH_INVALID_CREDENTIALS"
        consentRequired={false}
        privacyPolicyVersion="2026-03-09"
        onClose={vi.fn()}
        onSignInGoogle={vi.fn(async () => undefined)}
        onSignInEmail={vi.fn(async () => undefined)}
        onSignUpEmail={vi.fn(async () => undefined)}
        onCompleteConsent={vi.fn(async () => undefined)}
        onRequestVerificationEmail={vi.fn(async () => undefined)}
        onRequestPasswordResetEmail={vi.fn(async () => undefined)}
        onOpenView={vi.fn()}
      />
    );

    expect(screen.getByText("Sign-in failed. This account doesn't exist or the password is incorrect.")).toBeTruthy();
    expect(screen.queryByText("AUTH_INVALID_CREDENTIALS")).toBeNull();
  });

  it("shows a resend verification action when email confirmation is still pending", async () => {
    const onRequestVerificationEmail = vi.fn(async () => undefined);

    render(
      <CloudAuthModal
        open
        language="en"
        theme="dark"
        configured
        initialView="signin"
        authStatus="unauthenticated"
        authError="AUTH_EMAIL_NOT_CONFIRMED"
        consentRequired={false}
        privacyPolicyVersion="2026-03-09"
        onClose={vi.fn()}
        onSignInGoogle={vi.fn(async () => undefined)}
        onSignInEmail={vi.fn(async () => undefined)}
        onSignUpEmail={vi.fn(async () => undefined)}
        onCompleteConsent={vi.fn(async () => undefined)}
        onRequestVerificationEmail={onRequestVerificationEmail}
        onRequestPasswordResetEmail={vi.fn(async () => undefined)}
        onOpenView={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "verify@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Resend verification email" }));

    await waitFor(() => {
      expect(onRequestVerificationEmail).toHaveBeenCalledWith("verify@example.com");
    });
    expect(screen.getByText("Verification email sent. Check your inbox and click the confirmation link.")).toBeTruthy();
  });

  it("offers forgot password from the sign-in view", async () => {
    const onRequestPasswordResetEmail = vi.fn(async () => undefined);

    render(
      <CloudAuthModal
        open
        language="en"
        theme="dark"
        configured
        initialView="signin"
        authStatus="unauthenticated"
        authError={null}
        consentRequired={false}
        privacyPolicyVersion="2026-03-09"
        onClose={vi.fn()}
        onSignInGoogle={vi.fn(async () => undefined)}
        onSignInEmail={vi.fn(async () => undefined)}
        onSignUpEmail={vi.fn(async () => undefined)}
        onCompleteConsent={vi.fn(async () => undefined)}
        onRequestVerificationEmail={vi.fn(async () => undefined)}
        onRequestPasswordResetEmail={onRequestPasswordResetEmail}
        onOpenView={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "reset@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));

    await waitFor(() => {
      expect(onRequestPasswordResetEmail).toHaveBeenCalledWith("reset@example.com");
    });
    expect(
      screen.getByText("If this email belongs to an account, we sent a reset email. Also check spam, junk, or promotions.")
    ).toBeTruthy();
  });

  it("shows sign-in and reset actions when signup uses an existing email", async () => {
    const onOpenView = vi.fn();
    const onRequestPasswordResetEmail = vi.fn(async () => undefined);

    render(
      <CloudAuthModal
        open
        language="en"
        theme="dark"
        configured
        initialView="signup"
        authStatus="unauthenticated"
        authError="AUTH_USER_ALREADY_REGISTERED"
        consentRequired={false}
        privacyPolicyVersion="2026-03-09"
        onClose={vi.fn()}
        onSignInGoogle={vi.fn(async () => undefined)}
        onSignInEmail={vi.fn(async () => undefined)}
        onSignUpEmail={vi.fn(async () => undefined)}
        onCompleteConsent={vi.fn(async () => undefined)}
        onRequestVerificationEmail={vi.fn(async () => undefined)}
        onRequestPasswordResetEmail={onRequestPasswordResetEmail}
        onOpenView={onOpenView}
      />
    );

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "coen@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Open sign in" }));
    expect(onOpenView).toHaveBeenCalledWith("signin", "coen@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    await waitFor(() => {
      expect(onRequestPasswordResetEmail).toHaveBeenCalledWith("coen@example.com");
    });
  });
});
