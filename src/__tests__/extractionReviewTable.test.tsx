/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExtractionReviewTable, { type ExtractionReviewTableProps } from "../components/ExtractionReviewTable";
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

const markerBase = draft.markers[0];

const renderTable = (
  overrideDraft?: Partial<ExtractionDraft>,
  overrideProps?: Partial<ExtractionReviewTableProps>
) =>
  render(
    <ExtractionReviewTable
      draft={{ ...draft, ...overrideDraft }}
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
      {...overrideProps}
    />
  );

describe("ExtractionReviewTable", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not expose parser provider text and keeps review metadata compact", () => {
    renderTable();

    expect(screen.getByText(/Sep blood work clean\.pdf \| 1 markers/i)).toBeTruthy();
    expect(screen.queryByText(/confidence 90%/i)).toBeNull();
    expect(screen.queryByText(/\b90%\b/)).toBeNull();
    expect(screen.queryByText(/GEMINI|FALLBACK|CLAUDE/i)).toBeNull();
  });

  it("shows supplements, symptoms and notes without an expand toggle", () => {
    renderTable();

    expect(screen.getByText("Supplements at time of test")).toBeTruthy();
    expect(screen.getByText("Symptoms")).toBeTruthy();
    expect(screen.getByText("Notes")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /show extra context/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /hide extra context/i })).toBeNull();
  });

  it("renders a second save button at the bottom", () => {
    renderTable();

    expect(screen.getAllByRole("button", { name: /save report/i }).length).toBeGreaterThanOrEqual(2);
  });

  it("renders specific message for AI text-only insufficient warning", () => {
    renderTable({
      extraction: {
        ...draft.extraction,
        warningCode: "PDF_AI_TEXT_ONLY_INSUFFICIENT",
        warnings: ["PDF_AI_TEXT_ONLY_INSUFFICIENT"]
      }
    });

    const checklistButton = screen.getByRole("button", { name: /show details/i });
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

    expect(screen.getByText(/Local result/i)).toBeTruthy();
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

    expect(screen.getByText(/AI applied/i)).toBeTruthy();
    expect(screen.getByText(/used: text \+ AI/i)).toBeTruthy();
  });

  it("shows a compact low-quality review banner with parser improvement action", () => {
    const onOpenParserImprovement = vi.fn();

    renderTable(undefined, {
      showLowQualityReviewBanner: true,
      onOpenParserImprovement
    });

    expect(screen.getByText(/Review this report carefully/i)).toBeTruthy();
    expect(screen.getByText(/Only 1 marker was extracted from this report/i)).toBeTruthy();
    expect(screen.queryByText(/Parser warnings \(1\)/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Send PDF to improve parser/i }));
    expect(onOpenParserImprovement).toHaveBeenCalledTimes(1);
  });

  it("hides auto-fix for ok markers that only have deterministic standardization", () => {
    renderTable({
      markers: [
        {
          ...markerBase,
          marker: "Leukocytes",
          rawMarker: "leucocyten",
          _confidence: {
            name: "high",
            unit: "high",
            value: "high",
            range: "high",
            overall: "ok",
            issues: ["Unit normalized from '/nl' to '/nL'."],
            autoFixable: true,
            autoFix: { unit: "/nL" }
          },
          _matchResult: {
            canonical: { canonicalName: "Leukocytes" }
          }
        } as any
      ]
    });

    expect(screen.queryByRole("button", { name: "Auto-fix" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Auto-fix 1 markers" })).toBeNull();
  });

  it("shows auto-fix for review markers and uses human-friendly source labels", () => {
    renderTable({
      markers: [
        {
          ...markerBase,
          marker: "Leukocytes",
          rawMarker: "leucocyten",
          _confidence: {
            name: "medium",
            unit: "high",
            value: "high",
            range: "high",
            overall: "review",
            issues: ["Marker name matched approximately. Please verify."],
            autoFixable: true,
            autoFix: { name: "Leukocytes" }
          },
          _matchResult: {
            canonical: { canonicalName: "Leukocytes" }
          }
        } as any
      ]
    });

    expect(screen.getByRole("button", { name: "Auto-fix 1 markers" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Auto-fix" })).toBeTruthy();
    expect(screen.getByText("In report: leucocyten")).toBeTruthy();
    expect(screen.getByText("Recognized as: Leukocytes")).toBeTruthy();
    expect(screen.queryByText(/PDF:/i)).toBeNull();
    expect(screen.queryByText(/Canonical:/i)).toBeNull();
  });

  it("lets users click marker name to edit and shows review reason tooltip", () => {
    renderTable({
      markers: [
        {
          ...markerBase,
          marker: "Leukocytes",
          rawMarker: "leucocyten",
          _confidence: {
            name: "medium",
            unit: "high",
            value: "high",
            range: "high",
            overall: "review",
            issues: ["Marker name matched approximately. Please verify."],
            autoFixable: true,
            autoFix: { name: "Leukocytes" }
          },
          _matchResult: {
            canonical: { canonicalName: "Leukocytes" }
          }
        } as any
      ]
    });

    const reviewBadge = screen.getByText("Check");
    expect(reviewBadge.closest("span")?.getAttribute("title")).toBeNull();
    expect(screen.getByRole("tooltip").textContent ?? "").toMatch(/approximately/i);

    fireEvent.click(screen.getByRole("button", { name: "Edit marker name" }));
    const markerInput = screen.getByDisplayValue("Leukocytes");
    expect(markerInput).toBeTruthy();

    fireEvent.blur(markerInput);

    expect(screen.getByText("Recognized as: Leukocytes")).toBeTruthy();
    expect(screen.queryByText("Recognized as: unknown")).toBeNull();
  });

  it("shows rescue button progress state while AI rescue is running", () => {
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
        isImprovingWithAi
        onEnableAiRescue={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const rescueButton = screen.getByRole("button", { name: /AI rescue in progress/i }) as HTMLButtonElement;
    expect(rescueButton.disabled).toBe(true);
  });

  it("shows unknown-layout recovery actions and points users to the share button", () => {
    const onRetryWithOcr = vi.fn();
    const onStartManualEntry = vi.fn();

    render(
      <ExtractionReviewTable
        draft={{
          ...draft,
          extraction: {
            ...draft.extraction,
            warnings: ["PDF_UNKNOWN_LAYOUT"],
            warningCode: "PDF_UNKNOWN_LAYOUT",
            confidence: 0.58
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
        onRetryWithOcr={onRetryWithOcr}
        onStartManualEntry={onStartManualEntry}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText(/Next step for unknown format/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Retry OCR/i }));
    expect(onRetryWithOcr).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Enter manually/i }));
    expect(onStartManualEntry).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Use the button to explicitly share the original PDF/i)).toBeTruthy();
  });

  it("hides the parser improvement button after a successful submission", () => {
    renderTable(undefined, {
      showLowQualityReviewBanner: true,
      parserImprovementSubmitted: true
    });

    expect(screen.getByText(/Review this report carefully/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Send PDF to improve parser/i })).toBeNull();
  });
});
