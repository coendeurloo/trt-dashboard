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
      />
    );

    expect(screen.getByText("Sign in for cloud sync")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
  });

  it("requires consent before enabling signup actions", async () => {
    const onSignUpEmail = vi.fn(async () => undefined);
    const onSignInGoogle = vi.fn(async () => undefined);

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
        onSignInGoogle={onSignInGoogle}
        onSignInEmail={vi.fn(async () => undefined)}
        onSignUpEmail={onSignUpEmail}
        onCompleteConsent={vi.fn(async () => undefined)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(
      screen.getByText("Start here: check both consent boxes first to continue.")
    ).toBeTruthy();
    expect(onSignInGoogle).not.toHaveBeenCalled();
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
      />
    );

    const link = screen.getByRole("link", { name: "privacy policy" });
    expect(link.getAttribute("href")).toBe("/privacy-policy.html");
    expect(link.getAttribute("target")).toBe("_blank");
  });
});
