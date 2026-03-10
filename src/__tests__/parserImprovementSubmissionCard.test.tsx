/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ParserImprovementSubmissionCard from "../components/ParserImprovementSubmissionCard";
import { ExtractionDraft, ParserUncertaintyAssessment } from "../types";

const draft: ExtractionDraft = {
  sourceFileName: "poor-scan.pdf",
  testDate: "2026-03-01",
  markers: [],
  extraction: {
    provider: "fallback",
    model: "fallback",
    confidence: 0.42,
    needsReview: true
  }
};

const assessment: ParserUncertaintyAssessment = {
  isUncertain: true,
  reasons: ["warning_unknown_layout", "confidence_very_low"],
  markerCount: 2,
  confidence: 0.42,
  unitCoverage: 0.1,
  warnings: ["PDF_UNKNOWN_LAYOUT"]
};

describe("ParserImprovementSubmissionCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("requires explicit consent before submitting", async () => {
    const onSubmit = vi.fn(async () => undefined);

    render(
      <ParserImprovementSubmissionCard
        language="en"
        draft={draft}
        assessment={assessment}
        status="idle"
        errorMessage=""
        onSubmit={onSubmit}
        onDismiss={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Send PDF to improve parser" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent ?? "").toMatch(/confirm consent/i);
  });

  it("submits form values after consent is checked", async () => {
    const onSubmit = vi.fn(async () => undefined);

    render(
      <ParserImprovementSubmissionCard
        language="en"
        draft={draft}
        assessment={assessment}
        status="idle"
        errorMessage=""
        onSubmit={onSubmit}
        onDismiss={vi.fn()}
      />
    );

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /i consent to sending this original pdf/i
      })
    );
    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "Netherlands" } });
    fireEvent.change(screen.getByLabelText("Lab / provider"), { target: { value: "Example Lab" } });
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "Dutch" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Parser missed most rows." } });
    fireEvent.click(screen.getByRole("button", { name: "Send PDF to improve parser" }));

    expect(onSubmit).toHaveBeenCalledWith({
      consent: true,
      note: "Parser missed most rows.",
      country: "Netherlands",
      labProvider: "Example Lab",
      language: "Dutch"
    });
  });

  it("shows loading and success states", () => {
    const { rerender } = render(
      <ParserImprovementSubmissionCard
        language="en"
        draft={draft}
        assessment={assessment}
        status="submitting"
        errorMessage=""
        onSubmit={vi.fn(async () => undefined)}
        onDismiss={vi.fn()}
      />
    );

    const loadingButton = screen.getByRole("button", { name: /sending pdf/i }) as HTMLButtonElement;
    expect(loadingButton.disabled).toBe(true);

    rerender(
      <ParserImprovementSubmissionCard
        language="en"
        draft={draft}
        assessment={assessment}
        status="success"
        errorMessage=""
        onSubmit={vi.fn(async () => undefined)}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText(/PDF sent for parser improvement/i)).toBeTruthy();
  });

  it("calls dismiss without blocking review flow", () => {
    const onDismiss = vi.fn();

    render(
      <ParserImprovementSubmissionCard
        language="en"
        draft={draft}
        assessment={assessment}
        status="idle"
        errorMessage=""
        onSubmit={vi.fn(async () => undefined)}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
