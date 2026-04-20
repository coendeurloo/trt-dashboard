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
    betaUsage: {
      dailyCount: 0,
      monthlyCount: 1
    },
    betaLimits: {
      maxAnalysesPerDay: 5,
      maxAnalysesPerMonth: 25
    },
    settings: DEFAULT_SETTINGS,
    language: "en" as const,
    aiAnalyses: [],
    recentStatus: "ready" as const,
    onAskQuestion: vi.fn(),
    onCopyAnalysis: vi.fn(),
    onOpenHistoryList: vi.fn(),
    onOpenHistoryDetail: vi.fn(),
    onRetryRecent: vi.fn(),
    onDeleteAnalysis: vi.fn()
  };

  it("renders the explicit meter counts", () => {
    render(<AnalysisView {...baseProps} />);
    expect(screen.getByText(/0/i)).toBeTruthy();
    expect(screen.getByText(/of 5/i)).toBeTruthy();
    expect(screen.getByText(/of 25/i)).toBeTruthy();
  });

  it("renders the new question heading and removes old scope line", () => {
    render(<AnalysisView {...baseProps} />);
    expect(screen.getByRole("heading", { name: /your question/i })).toBeTruthy();
    expect(screen.queryByText(/reports in scope/i)).toBeNull();
    expect(screen.queryByText(/biomarkers/i)).toBeNull();
  });

  it("prefills the textarea when a suggestion is clicked", () => {
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

    const input = screen.getByPlaceholderText(/why is my hematocrit rising/i) as HTMLTextAreaElement;
    expect(input.value).toMatch(/hematocrit/i);
  });

  it("prefills a preset without auto-submit", () => {
    const onAskQuestion = vi.fn();
    render(<AnalysisView {...baseProps} onAskQuestion={onAskQuestion} />);

    fireEvent.click(screen.getByRole("button", { name: /full analysis of latest report/i }));
    const input = screen.getByPlaceholderText(/why is my hematocrit rising/i) as HTMLTextAreaElement;
    expect(input.value.toLowerCase()).toContain("full analysis");
    expect(onAskQuestion).not.toHaveBeenCalled();
  });

  it("hides recent section when there are no analyses", () => {
    render(<AnalysisView {...baseProps} aiAnalyses={[]} recentStatus="ready" />);
    expect(screen.queryByRole("heading", { name: /recent/i })).toBeNull();
  });

  it("shows recent cards when analyses exist", () => {
    render(
      <AnalysisView
        {...baseProps}
        aiAnalyses={[
          {
            id: "a1",
            createdAt: "2026-04-14T09:00:00.000Z",
            prompt: "Compare latest vs previous",
            title: "Compared latest vs previous",
            answer: "Testosterone up 18% vs last draw.",
            scopeSnapshot: {
              reportCount: 4,
              biomarkerCount: 28,
              units: "Conventional",
              activeProtocol: "Test E 105mg"
            }
          }
        ]}
      />
    );
    expect(screen.getByRole("heading", { name: /recent/i })).toBeTruthy();
    expect(screen.getByText(/compared latest vs previous/i)).toBeTruthy();
  });

  it("deletes a recent analysis from the saved list", () => {
    const onDeleteAnalysis = vi.fn();
    render(
      <AnalysisView
        {...baseProps}
        onDeleteAnalysis={onDeleteAnalysis}
        aiAnalyses={[
          {
            id: "a1",
            createdAt: "2026-04-14T09:00:00.000Z",
            prompt: "Compare latest vs previous",
            title: "Compared latest vs previous",
            answer: "## Direct answer **LDL** should be your top priority.",
            scopeSnapshot: {
              reportCount: 4,
              biomarkerCount: 28,
              units: "Conventional",
              activeProtocol: "Test E 105mg"
            }
          }
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDeleteAnalysis).toHaveBeenCalledWith("a1");
  });

  it("renders loading skeleton placeholders for recent", () => {
    const { container } = render(<AnalysisView {...baseProps} recentStatus="loading" />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("scrolls to output panel when streaming starts", async () => {
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

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });
});
