/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CloudAuthModal from "../components/CloudAuthModal";

describe("CloudAuthModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows Google as the primary action and keeps email auth in tabs", () => {
    render(
      <CloudAuthModal
        open
        language="en"
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

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.getByText("or continue with email")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create account" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Sign in" }).length).toBeGreaterThan(0);
  });

  it("submits the signup tab through the email form", async () => {
    const onSignUpEmail = vi.fn(async () => undefined);

    render(
      <CloudAuthModal
        open
        language="en"
        configured
        initialView="signin"
        authStatus="unauthenticated"
        authError={null}
        consentRequired={false}
        privacyPolicyVersion="2026-03-09"
        onClose={vi.fn()}
        onSignInGoogle={vi.fn(async () => undefined)}
        onSignInEmail={vi.fn(async () => undefined)}
        onSignUpEmail={onSignUpEmail}
        onCompleteConsent={vi.fn(async () => undefined)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    const privacyCheckbox = screen.getByLabelText(/i agree to the privacy policy/i);
    const healthCheckbox = screen.getByLabelText(/i explicitly consent to processing health data/i);
    fireEvent.click(privacyCheckbox);
    fireEvent.click(healthCheckbox);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret12" } });
    const createButtons = screen.getAllByRole("button", { name: "Create account" });
    fireEvent.click(createButtons[createButtons.length - 1] as HTMLButtonElement);

    expect(onSignUpEmail).toHaveBeenCalledWith("test@example.com", "secret12", {
      acceptPrivacyPolicy: true,
      acceptHealthDataConsent: true,
      privacyPolicyVersion: "2026-03-09"
    });
  });

  it("shows an explicit step hint when signup consent is still missing", () => {
    render(
      <CloudAuthModal
        open
        language="en"
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

    expect(screen.getByText("Step 1 of 2")).toBeTruthy();
    expect(
      screen.getByText("One more step: confirm both checkboxes. Then choose Google or email.")
    ).toBeTruthy();
  });

  it("links to privacy policy in a new tab from signup", () => {
    render(
      <CloudAuthModal
        open
        language="en"
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
