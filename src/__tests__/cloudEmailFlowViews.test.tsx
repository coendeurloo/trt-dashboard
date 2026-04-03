/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CloudEmailConfirmView from "../views/CloudEmailConfirmView";
import CloudEmailVerifiedView from "../views/CloudEmailVerifiedView";

describe("cloud email flow views", () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true })
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the confirm view with a direct verification action", () => {
    render(
      <CloudEmailConfirmView
        language="en"
        theme="dark"
        confirmationUrl="https://example.supabase.co/auth/v1/verify?token=abc"
      />
    );

    const link = screen.getByRole("link", { name: "Verify email" });
    expect(link.getAttribute("href")).toBe("https://example.supabase.co/auth/v1/verify?token=abc");
    expect(screen.getByText("Cloud security")).toBeTruthy();
  });

  it("renders a helpful fallback when the confirmation link is missing", () => {
    render(
      <CloudEmailConfirmView
        language="en"
        theme="dark"
        confirmationUrl={null}
      />
    );

    expect(
      screen.getByText("This verification link is invalid or incomplete. Request a new verification email from the app.")
    ).toBeTruthy();
  });

  it("renders the verified view with a sign-in CTA", () => {
    render(
      <CloudEmailVerifiedView
        language="en"
        theme="dark"
        prefillEmail="verify@example.com"
      />
    );

    const link = screen.getByRole("link", { name: "Sign in to LabTracker Cloud" });
    expect(link.getAttribute("href")).toBe("/?cloudAuth=signin&cloudEmail=verify%40example.com");
    expect(screen.getByText("Email verified")).toBeTruthy();
    expect(screen.getByText("We will prefill verify@example.com for you as soon as the sign-in modal opens.")).toBeTruthy();
  });
});
