/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../constants";
import AnalysisView from "../views/AnalysisView";

describe("AnalysisView", () => {
  afterEach(() => {
    cleanup();
  });

  const baseProps = {
    isAnalyzingLabs: false,
    analysisError: "",
    analysisResult: "",
    analysisResultDisplay: "",
    analysisGeneratedAt: null,
    analysisCopied: false,
    analysisKind: null,
    analyzingKind: null,
    reportsInScope: 1,
    markersTracked: 35,
    activeProtocolLabel: "No protocol",
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
    onCopyAnalysis: vi.fn()
  };

  it("shows usage as used/limit counts", () => {
    render(<AnalysisView {...baseProps} />);
    expect(screen.getByText(/0\/5 used today/i)).toBeTruthy();
    expect(screen.getByText(/0\/25 used this month/i)).toBeTruthy();
  });

  it("renders scope card values", () => {
    render(<AnalysisView {...baseProps} />);
    expect(screen.getByText("Reports in scope")).toBeTruthy();
    expect(screen.getByText("Markers tracked")).toBeTruthy();
    expect(screen.getByText("Active protocol")).toBeTruthy();
    expect(screen.getByText("35")).toBeTruthy();
    expect(screen.getByText("No protocol")).toBeTruthy();
  });

  it("keeps copy button in output area only when a result exists", () => {
    const { rerender } = render(<AnalysisView {...baseProps} />);
    expect(screen.queryByRole("button", { name: /copy analysis/i })).toBeNull();

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

  it("disables latest-vs-previous action when there are fewer than 2 reports", () => {
    render(<AnalysisView {...baseProps} reportsInScope={1} />);
    const latestButton = screen.getByRole("button", { name: /compare latest report/i });
    expect(latestButton.getAttribute("disabled")).not.toBeNull();
  });
});
