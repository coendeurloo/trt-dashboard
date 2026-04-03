/* @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CloudEmailConfirmView from "../views/CloudEmailConfirmView";
import CloudEmailVerifiedView from "../views/CloudEmailVerifiedView";

describe("cloud email flow views", () => {
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
      />
    );

    const link = screen.getByRole("link", { name: "Sign in to LabTracker Cloud" });
    expect(link.getAttribute("href")).toBe("/?cloudAuth=signin");
    expect(screen.getByText("Email verified")).toBeTruthy();
  });
});
