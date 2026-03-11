/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ParserUploadSummaryModal, {
  type ParserUploadSummaryModalData
} from "../components/ParserUploadSummaryModal";

describe("ParserUploadSummaryModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a marker-first low-quality upload summary without confidence", () => {
    const summary: ParserUploadSummaryModalData = {
      kind: "upload",
      fileName: "poor-scan.pdf",
      markerCount: 2,
      warnings: 2,
      routeLabel: "OCR fallback",
      needsReview: true,
      canSendPdf: true
    };
    const onContinue = vi.fn();
    const onOpenParserImprovement = vi.fn();

    render(
      <ParserUploadSummaryModal
        open
        language="en"
        summary={summary}
        onContinue={onContinue}
        onOpenParserImprovement={onOpenParserImprovement}
      />
    );

    expect(screen.getByText("2 markers found")).toBeTruthy();
    expect(screen.getByText(/needs review before saving/i)).toBeTruthy();
    expect(screen.queryByText(/confidence/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Send PDF to improve parser" }));
    expect(onOpenParserImprovement).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Review markers" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("lets the close button behave like review markers", () => {
    const summary: ParserUploadSummaryModalData = {
      kind: "upload",
      fileName: "scan.pdf",
      markerCount: 1,
      warnings: 1,
      routeLabel: "Text layer only",
      needsReview: false,
      canSendPdf: false
    };
    const onContinue = vi.fn();

    render(
      <ParserUploadSummaryModal
        open
        language="en"
        summary={summary}
        onContinue={onContinue}
        onOpenParserImprovement={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("renders AI rescue summary without confidence", () => {
    const summary: ParserUploadSummaryModalData = {
      kind: "ai_rescue",
      fileName: "scan.pdf",
      baselineMarkerCount: 2,
      baselineRouteLabel: "OCR fallback",
      finalMarkerCount: 5,
      finalRouteLabel: "AI PDF rescue",
      warnings: 1,
      aiApplied: true
    };

    render(
      <ParserUploadSummaryModal
        open
        language="en"
        summary={summary}
        onContinue={vi.fn()}
        onOpenParserImprovement={vi.fn()}
      />
    );

    expect(screen.getByText(/AI rescue completed/i)).toBeTruthy();
    expect(screen.getByText(/OCR fallback -> AI PDF rescue/i)).toBeTruthy();
    expect(screen.queryByText(/confidence/i)).toBeNull();
  });

  it("does not claim only a few markers when many markers were extracted", () => {
    const summary: ParserUploadSummaryModalData = {
      kind: "upload",
      fileName: "tb5of6 blood work.pdf",
      markerCount: 33,
      warnings: 0,
      routeLabel: "Text layer only",
      needsReview: true,
      canSendPdf: true
    };

    render(
      <ParserUploadSummaryModal
        open
        language="en"
        summary={summary}
        onContinue={vi.fn()}
        onOpenParserImprovement={vi.fn()}
      />
    );

    expect(screen.queryByText(/Only a few markers were found/i)).toBeNull();
    expect(
      screen.getByText(/Parser quality signals indicate this report needs extra review before saving/i)
    ).toBeTruthy();
  });
});
