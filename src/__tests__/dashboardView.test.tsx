/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrtStabilityResult } from "../analytics";
import { DEFAULT_SETTINGS } from "../constants";
import DashboardView from "../views/DashboardView";
import { AppSettings, LabReport, TimeRangeKey } from "../types";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== "undefined" && !("ResizeObserver" in window)) {
  // Recharts requires ResizeObserver in jsdom tests.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).ResizeObserver = ResizeObserverMock;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = ResizeObserverMock;
}

const report: LabReport = {
  id: "r-1",
  sourceFileName: "first.pdf",
  testDate: "2024-07-17",
  createdAt: "2024-07-17T10:00:00.000Z",
  markers: [],
  annotations: {
    protocolId: null,
    protocol: "",
    supplementOverrides: null,
    symptoms: "",
    notes: "",
    samplingTiming: "unknown"
  },
  extraction: {
    provider: "fallback",
    model: "test",
    confidence: 1,
    needsReview: false
  }
};

const trtStability: TrtStabilityResult = {
  score: null,
  components: {}
};

const buildProps = () => {
  const onUpdateSettings = vi.fn();
  const onUploadClick = vi.fn();
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    language: "en",
    enableSamplingControls: true,
    samplingFilter: "peak",
    timeRange: "12m"
  };
  const timeRangeOptions: Array<[TimeRangeKey, string]> = [
    ["3m", "3 months"],
    ["6m", "6 months"],
    ["12m", "12 months"],
    ["all", "All time"],
    ["custom", "Custom"]
  ];
  const samplingOptions: Array<[AppSettings["samplingFilter"], string]> = [
    ["all", "All timings"],
    ["trough", "Trough"],
    ["peak", "Peak"]
  ];

  return {
    props: {
      reports: [report],
      visibleReports: [],
      allMarkers: [],
      primaryMarkers: [],
      dosePhaseBlocks: [],
      trendByMarker: {},
      alertsByMarker: {},
      trtStability,
      outOfRangeCount: 0,
      settings,
      language: "en" as const,
      isShareMode: false,
      samplingControlsEnabled: true,
      dashboardView: "primary" as const,
      comparisonMode: false,
      leftCompareMarker: "Testosterone",
      rightCompareMarker: "Estradiol",
      timeRangeOptions,
      samplingOptions,
      onUpdateSettings,
      onDashboardViewChange: vi.fn(),
      onComparisonModeChange: vi.fn(),
      onLeftCompareMarkerChange: vi.fn(),
      onRightCompareMarkerChange: vi.fn(),
      onExpandMarker: vi.fn(),
      onRenameMarker: vi.fn(),
      chartPointsForMarker: vi.fn(() => []),
      markerPercentChange: vi.fn(() => null),
      markerBaselineDelta: vi.fn(() => null),
      onLoadDemo: vi.fn(),
      onUploadClick
    },
    onUpdateSettings,
    onUploadClick
  };
};

describe("DashboardView first-report UX", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows positive first-report empty state with both CTAs", () => {
    const { props, onUpdateSettings, onUploadClick } = buildProps();
    render(<DashboardView {...props} />);

    expect(screen.getByText("First report saved")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show all time" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upload second report" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show all time" }));
    expect(onUpdateSettings).toHaveBeenCalledWith({
      timeRange: "all",
      samplingFilter: "all",
      compareToBaseline: false
    });

    fireEvent.click(screen.getByRole("button", { name: "Upload second report" }));
    expect(onUploadClick).toHaveBeenCalledTimes(1);
  });

  it("shows first-report encouragement banner when one report is visible", () => {
    const { props } = buildProps();
    render(<DashboardView {...{ ...props, visibleReports: [report] }} />);

    expect(
      screen.getByText(
        /Great start: your first report is saved\. Add one more report to unlock trend charts and over-time comparisons\./i
      )
    ).toBeTruthy();
  });
});
