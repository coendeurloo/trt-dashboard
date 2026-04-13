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
        open
        language="en"
        draft={draft}
        assessment={assessment}
        prefillEmail={null}
        status="idle"
        errorMessage=""
        onSubmit={onSubmit}
        onClose={vi.fn()}
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
        open
        language="en"
        draft={draft}
        assessment={assessment}
        prefillEmail={null}
        status="idle"
        errorMessage=""
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /i consent to sending this original pdf/i
      })
    );
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "Netherlands" } });
    fireEvent.change(screen.getByLabelText("Lab / provider"), { target: { value: "Example Lab" } });
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "Dutch" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Parser missed most rows." } });
    fireEvent.click(screen.getByRole("button", { name: "Send PDF to improve parser" }));

    expect(onSubmit).toHaveBeenCalledWith({
      consent: true,
      email: "user@example.com",
      note: "Parser missed most rows.",
      country: "Netherlands",
      labProvider: "Example Lab",
      language: "Dutch"
    });
  });

  it("requires a valid email before submitting", async () => {
    const onSubmit = vi.fn(async () => undefined);

    render(
      <ParserImprovementSubmissionCard
        open
        language="en"
        draft={draft}
        assessment={assessment}
        prefillEmail={null}
        status="idle"
        errorMessage=""
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /i consent to sending this original pdf/i
      })
    );
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Send PDF to improve parser" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent ?? "").toMatch(/valid email/i);
  });

  it("shows loading state and stays hidden when closed", () => {
    const { rerender } = render(
      <ParserImprovementSubmissionCard
        open
        language="en"
        draft={draft}
        assessment={assessment}
        prefillEmail={null}
        status="submitting"
        errorMessage=""
        onSubmit={vi.fn(async () => undefined)}
        onClose={vi.fn()}
      />
    );

    const loadingButton = screen.getByRole("button", { name: /sending pdf/i }) as HTMLButtonElement;
    expect(loadingButton.disabled).toBe(true);
    expect(screen.queryByText(/confidence/i)).toBeNull();

    rerender(
      <ParserImprovementSubmissionCard
        open={false}
        language="en"
        draft={draft}
        assessment={assessment}
        prefillEmail={null}
        status="idle"
        errorMessage=""
        onSubmit={vi.fn(async () => undefined)}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("calls close without blocking review flow", () => {
    const onClose = vi.fn();

    render(
      <ParserImprovementSubmissionCard
        open
        language="en"
        draft={draft}
        assessment={assessment}
        prefillEmail={null}
        status="idle"
        errorMessage=""
        onSubmit={vi.fn(async () => undefined)}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
