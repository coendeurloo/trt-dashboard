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
        onClose={vi.fn()}
        onSignInGoogle={vi.fn()}
        onSignInEmail={vi.fn(async () => undefined)}
        onSignUpEmail={vi.fn(async () => undefined)}
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
        onClose={vi.fn()}
        onSignInGoogle={vi.fn()}
        onSignInEmail={vi.fn(async () => undefined)}
        onSignUpEmail={onSignUpEmail}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret12" } });
    const createButtons = screen.getAllByRole("button", { name: "Create account" });
    fireEvent.click(createButtons[createButtons.length - 1] as HTMLButtonElement);

    expect(onSignUpEmail).toHaveBeenCalledWith("test@example.com", "secret12");
  });
});
