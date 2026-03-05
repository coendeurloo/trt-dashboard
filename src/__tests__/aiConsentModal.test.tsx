/* @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AIConsentModal from "../components/AIConsentModal";

describe("AIConsentModal", () => {
  it("shows always-allow option for parser rescue", () => {
    render(
      <AIConsentModal
        open
        action="parser_rescue"
        language="en"
        onClose={vi.fn()}
        onDecide={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /Always allow parser rescue/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Only this time/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Do not allow/i })).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: /Send full PDF for parser rescue/i }) as HTMLInputElement).checked).toBe(true);
  });

  it("keeps always-allow option for analysis", () => {
    render(
      <AIConsentModal
        open
        action="analysis"
        language="en"
        onClose={vi.fn()}
        onDecide={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /^Always allow$/i })).toBeTruthy();
  });
});
