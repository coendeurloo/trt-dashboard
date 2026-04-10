/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../constants";
import { LabReport } from "../types";
import AnalysisView from "../views/AnalysisView";

const sampleReport: LabReport = {
  id: "r1",
  sourceFileName: "report.pdf",
  testDate: "2026-01-21",
  createdAt: "2026-01-21T10:00:00.000Z",
  markers: [
    {
      id: "m1",
      marker: "Testosterone",
      canonicalMarker: "Testosterone",
      value: 20.7,
      unit: "nmol/L",
      referenceMin: 8,
      referenceMax: 29,
      abnormal: "normal",
      confidence: 1
    }
  ],
  annotations: {
    protocolId: null,
    protocol: "",
    supplementOverrides: null,
    symptoms: "",
    notes: "",
    samplingTiming: "trough"
  },
  extraction: {
    provider: "fallback",
    model: "fallback",
    confidence: 0.9,
    needsReview: false
  }
};

describe("AnalysisView", () => {
  const scrollIntoViewMock = vi.fn();

  afterEach(() => {
    cleanup();
    scrollIntoViewMock.mockReset();
  });

  beforeEach(() => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      value: scrollIntoViewMock,
      writable: true,
      configurable: true
    });
  });

  const baseProps = {
    isAnalyzingLabs: false,
    analysisRequestState: "idle" as const,
    analysisError: "",
    analysisResult: "",
    analysisResultDisplay: "",
    analysisGeneratedAt: null,
    analysisQuestion: null,
    analysisCopied: false,
    analysisModelInfo: null,
    analysisKind: null,
    analyzingKind: null,
    analysisScopeNotice: null,
    reports: [sampleReport],
    trendByMarker: {},
    reportsInScope: 1,
    markersTracked: 35,
    analysisMarkerNames: ["Testosterone", "Estradiol", "Hematocrit"],
    activeProtocolLabel: "No protocol",
    hasActiveProtocol: false,
    hasDemoData: false,
    isDemoMode: false,
    memory: null,
    betaUsage: {
      dailyCount: 0,
      monthlyCount: 0
    },
    betaLimits: {
      maxAnalysesPerDay: 5,
      maxAnalysesPerMonth: 25
    },
    settings: DEFAULT_SETTINGS,
    language: "en" as const,
    onRunAnalysis: vi.fn(),
    onAskQuestion: vi.fn(),
    onCopyAnalysis: vi.fn()
  };

  it("shows usage as used/limit counts", () => {
    render(<AnalysisView {...baseProps} />);
    expect(screen.getAllByText(/0\/5 today/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/0\/25 month/i).length).toBeGreaterThan(0);
  });

  it("renders compact scope hint", () => {
    render(<AnalysisView {...baseProps} />);
    expect(screen.getByText(/1 reports in scope/i)).toBeTruthy();
    expect(screen.getByText(/35 biomarkers/i)).toBeTruthy();
  });

  it("keeps copy button in output area only when a result exists", () => {
    const { rerender } = render(<AnalysisView {...baseProps} />);
    expect(screen.queryByRole("button", { name: /copy analysis/i })).toBeNull();
    expect(screen.queryByText(/run an analysis or ask a question to get started/i)).toBeNull();

    rerender(
      <AnalysisView
        {...baseProps}
        analysisResult="## Result"
        analysisResultDisplay="Result"
        analysisKind="full"
      />
    );

    expect(screen.getByRole("button", { name: /copy analysis/i })).toBeTruthy();
  });

  it("disables latest comparison action when there are fewer than 2 reports", () => {
    render(<AnalysisView {...baseProps} reportsInScope={1} />);
    const latestButton = screen.getByRole("button", { name: /compare latest vs previous/i });
    expect(latestButton.getAttribute("disabled")).not.toBeNull();
  });

  it("shows scope notice when available", () => {
    render(
      <AnalysisView
        {...baseProps}
        analysisResult="Scoped result"
        analysisResultDisplay="Scoped result"
        analysisKind="full"
        analysisScopeNotice={{
          usedReports: 10,
          totalReports: 27,
          lookbackApplied: false,
          capApplied: true,
          reason: "timeline_sampled"
        }}
      />
    );

    expect(screen.getByText(/AI uses 10 of 27 reports for this run/i)).toBeTruthy();
  });

  it("fills the question input when clicking a suggestion chip", () => {
    render(
      <AnalysisView
        {...baseProps}
        reports={[
          {
            ...sampleReport,
            markers: [
              {
                ...sampleReport.markers[0],
                canonicalMarker: "Hematocrit",
                marker: "Hematocrit",
                value: 55,
                referenceMin: 40,
                referenceMax: 52,
                abnormal: "high",
                unit: "%"
              }
            ]
          }
        ]}
        analysisMarkerNames={["Hematocrit"]}
      />
    );

    const suggestionChip = screen.getByRole("button", { name: /why is my hematocrit/i });
    fireEvent.click(suggestionChip);

    const input = screen.getByLabelText(/your question/i) as HTMLTextAreaElement;
    expect(input.value).toMatch(/hematocrit/i);
  });

  it("renders normally when analyst memory data is present", () => {
    render(
      <AnalysisView
        {...baseProps}
        memory={{
          version: 1,
          lastUpdated: "2026-03-01",
          analysisCount: 4,
          responderProfile: {
            testosteroneResponse: "moderate",
            aromatizationTendency: "unknown",
            hematocritSensitivity: "unknown",
            notes: ""
          },
          personalBaselines: {},
          supplementHistory: [],
          protocolHistory: [],
          watchList: [],
          analystNotes: ""
        }}
      />
    );

    expect(screen.getByRole("heading", { name: /ask ai/i })).toBeTruthy();
    expect(screen.queryByText(/Analyst memory active/i)).toBeNull();
  });

  it("scrolls to the output panel when streaming output appears", () => {
    const { rerender } = render(<AnalysisView {...baseProps} />);

    rerender(
      <AnalysisView
        {...baseProps}
        analysisRequestState="streaming"
        analysisResult="## Live output"
        analysisResultDisplay="## Live output"
        analysisKind="question"
      />
    );

    return waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });

  it("does not render the output panel before the first run", () => {
    render(<AnalysisView {...baseProps} />);

    expect(screen.queryByRole("heading", { name: /analysis output/i })).toBeNull();
    expect(screen.queryByText(/run an analysis or ask a question to get started/i)).toBeNull();
  });
});
