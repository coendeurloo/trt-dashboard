/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExtractionReviewTable from "../components/ExtractionReviewTable";
import { ExtractionDraft, ReportAnnotations } from "../types";

const draft: ExtractionDraft = {
  sourceFileName: "Sep blood work clean.pdf",
  testDate: "2026-02-19",
  markers: [
    {
      id: "m-1",
      marker: "Testosterone",
      canonicalMarker: "Testosterone",
      value: 20.7,
      unit: "nmol/L",
      referenceMin: 8.4,
      referenceMax: 28.8,
      abnormal: "normal",
      confidence: 0.95
    }
  ],
  extraction: {
    provider: "gemini",
    model: "gemini-2.0-flash",
    confidence: 0.9,
    needsReview: true,
    warnings: ["PDF_LOW_CONFIDENCE_LOCAL"]
  }
};

const annotations: ReportAnnotations = {
  protocolId: null,
  protocol: "",
  supplementOverrides: null,
  symptoms: "",
  notes: "",
  samplingTiming: "unknown"
};

describe("ExtractionReviewTable", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not expose parser provider text and keeps confidence subtitle", () => {
    render(
      <ExtractionReviewTable
        draft={draft}
        annotations={annotations}
        protocols={[]}
        supplementTimeline={[]}
        inheritedSupplementsPreview={[]}
        inheritedSupplementsSourceLabel="current active stack"
        selectedProtocolId={null}
        language="en"
        onDraftChange={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onSelectedProtocolIdChange={vi.fn()}
        onProtocolCreate={vi.fn()}
        onAddSupplementPeriod={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText(/confidence/i)).toBeTruthy();
    expect(screen.getByText(/90%/)).toBeTruthy();
    expect(screen.queryByText(/GEMINI|FALLBACK|CLAUDE/i)).toBeNull();
  });

  it("shows supplements, symptoms and notes without an expand toggle", () => {
    render(
      <ExtractionReviewTable
        draft={draft}
        annotations={annotations}
        protocols={[]}
        supplementTimeline={[]}
        inheritedSupplementsPreview={[]}
        inheritedSupplementsSourceLabel="current active stack"
        selectedProtocolId={null}
        language="en"
        onDraftChange={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onSelectedProtocolIdChange={vi.fn()}
        onProtocolCreate={vi.fn()}
        onAddSupplementPeriod={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText("Supplements at time of test")).toBeTruthy();
    expect(screen.getByText("Symptoms")).toBeTruthy();
    expect(screen.getByText("Notes")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /show extra context/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /hide extra context/i })).toBeNull();
  });

  it("renders a second save button at the bottom", () => {
    render(
      <ExtractionReviewTable
        draft={draft}
        annotations={annotations}
        protocols={[]}
        supplementTimeline={[]}
        inheritedSupplementsPreview={[]}
        inheritedSupplementsSourceLabel="current active stack"
        selectedProtocolId={null}
        language="en"
        onDraftChange={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onSelectedProtocolIdChange={vi.fn()}
        onProtocolCreate={vi.fn()}
        onAddSupplementPeriod={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getAllByRole("button", { name: /save report/i }).length).toBeGreaterThanOrEqual(2);
  });

  it("renders specific message for AI text-only insufficient warning", () => {
    render(
      <ExtractionReviewTable
        draft={{
          ...draft,
          extraction: {
            ...draft.extraction,
            warningCode: "PDF_AI_TEXT_ONLY_INSUFFICIENT",
            warnings: ["PDF_AI_TEXT_ONLY_INSUFFICIENT"]
          }
        }}
        annotations={annotations}
        protocols={[]}
        supplementTimeline={[]}
        inheritedSupplementsPreview={[]}
        inheritedSupplementsSourceLabel="current active stack"
        selectedProtocolId={null}
        language="en"
        onDraftChange={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onSelectedProtocolIdChange={vi.fn()}
        onProtocolCreate={vi.fn()}
        onAddSupplementPeriod={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const checklistButton = screen.getByRole("button", { name: /show checklist/i });
    fireEvent.click(checklistButton);
    expect(screen.getByText(/AI text-only extraction found too few marker rows/i)).toBeTruthy();
  });

  it("shows local vs AI-applied origin labels", () => {
    const { rerender } = render(
      <ExtractionReviewTable
        draft={{
          ...draft,
          extraction: {
            ...draft.extraction,
            aiUsed: false
          }
        }}
        annotations={annotations}
        protocols={[]}
        supplementTimeline={[]}
        inheritedSupplementsPreview={[]}
        inheritedSupplementsSourceLabel="current active stack"
        selectedProtocolId={null}
        language="en"
        onDraftChange={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onSelectedProtocolIdChange={vi.fn()}
        onProtocolCreate={vi.fn()}
        onAddSupplementPeriod={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText(/You are viewing: local result/i)).toBeTruthy();
    expect(screen.getByText(/used: text layer only/i)).toBeTruthy();

    rerender(
      <ExtractionReviewTable
        draft={{
          ...draft,
          extraction: {
            ...draft.extraction,
            aiUsed: true
          }
        }}
        annotations={annotations}
        protocols={[]}
        supplementTimeline={[]}
        inheritedSupplementsPreview={[]}
        inheritedSupplementsSourceLabel="current active stack"
        selectedProtocolId={null}
        language="en"
        onDraftChange={vi.fn()}
        onAnnotationsChange={vi.fn()}
        onSelectedProtocolIdChange={vi.fn()}
        onProtocolCreate={vi.fn()}
        onAddSupplementPeriod={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText(/You are viewing: AI result/i)).toBeTruthy();
    expect(screen.getByText(/used: text \+ AI/i)).toBeTruthy();
  });
});
