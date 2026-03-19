/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  (window as any).ResizeObserver = ResizeObserverMock;
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
      dashboardMode: "cards" as const,
      leftCompareMarker: "Testosterone",
      rightCompareMarker: "Estradiol",
      timeRangeOptions,
      samplingOptions,
      onUpdateSettings,
      onDashboardViewChange: vi.fn(),
      onDashboardModeChange: vi.fn(),
      onLeftCompareMarkerChange: vi.fn(),
      onRightCompareMarkerChange: vi.fn(),
      onExpandMarker: vi.fn(),
      onOpenMarkerAlerts: vi.fn(),
      chartPointsForMarker: vi.fn(() => []),
      markerPercentChange: vi.fn(() => null),
      markerBaselineDelta: vi.fn(() => null),
      cloudConfigured: true,
      onLoadDemo: vi.fn(),
      onUploadClick,
      onOpenCloudAuth: vi.fn(),
      isProcessing: false,
      checkIns: [],
      onNavigateToCheckIns: vi.fn(),
      personalInfo: { name: "", dateOfBirth: "", biologicalSex: "prefer_not_to_say" as const, heightCm: null, weightKg: null }
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

describe("DashboardView first-visit hero", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the richer onboarding hero with screenshot, trust cards, and balanced CTAs", () => {
    const { props } = buildProps();
    render(<DashboardView {...{ ...props, reports: [], visibleReports: [] }} />);

    expect(screen.getByText("Your data stays on your device. AI only if you want it.")).toBeTruthy();
    expect(screen.getByRole("img", { name: "LabTracker dashboard preview" })).toBeTruthy();

    const demoButton = screen.getByRole("button", { name: "See a live demo" });
    const uploadButton = screen.getByRole("button", { name: "Upload your own PDF" });
    expect(demoButton.className).toContain("border-cyan-400/55");
    expect(uploadButton.className).toContain("border-cyan-400/55");
    expect(demoButton.className).toContain("bg-cyan-500/15");
    expect(uploadButton.className).toContain("bg-cyan-500/15");

    expect(screen.getByText("How it works")).toBeTruthy();
    expect(screen.getByText("Upload your lab PDF")).toBeTruthy();
    expect(screen.getByText("See your trends")).toBeTruthy();
    expect(screen.getByText("Optimize your protocol")).toBeTruthy();
    expect(screen.queryByText("Sync & backup")).toBeNull();
    expect(screen.getByText("Local processing by default")).toBeTruthy();
    expect(screen.getByText("Works with many lab formats")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create a free account ->" })).toBeTruthy();
  });
});

describe("DashboardView chart controls", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders stability index details and no changed badge in the dashboard content", () => {
    const { props } = buildProps();
    const stabilityWithScore: TrtStabilityResult = {
      score: 66,
      components: {}
    };

    render(
      <DashboardView
        {...{
          ...props,
          visibleReports: [report],
          allMarkers: ["Testosterone"],
          primaryMarkers: ["Testosterone"],
          trtStability: stabilityWithScore,
          outOfRangeCount: 0
        }}
      />
    );

    expect(screen.getByText("Hormone stability")).toBeTruthy();
    expect(screen.queryByText("Changed")).toBeNull();
    const stabilitySection = screen.getByText("Hormone stability").closest("#dashboard-stability-index");
    expect(stabilitySection).toBeTruthy();
    expect(within(stabilitySection as HTMLElement).getAllByText("66").length).toBeGreaterThan(0);
  });

  it("shows Compare 2 markers and Chart settings controls", () => {
    const { props } = buildProps();
    render(<DashboardView {...{ ...props, visibleReports: [report], allMarkers: ["Testosterone", "Estradiol"] }} />);

    expect(screen.getByRole("button", { name: "Chart settings" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Chart settings" }));
    expect(screen.getByRole("button", { name: "Compare 2 markers" })).toBeTruthy();
  });

  it("keeps time range and marker scope filters visually separated with aligned active styling", () => {
    const { props } = buildProps();
    render(<DashboardView {...{ ...props, visibleReports: [report], allMarkers: ["Testosterone", "Estradiol"] }} />);

    expect(screen.getByTestId("time-range-filter-group")).toBeTruthy();
    expect(screen.getByTestId("marker-scope-filter-group")).toBeTruthy();
    expect(screen.getByTestId("dashboard-filter-divider")).toBeTruthy();

    const months12 = screen.getByRole("button", { name: "12 months" });
    const primaryMarkers = screen.getByRole("button", { name: "Primary" });
    expect(months12.className).toContain("dashboard-filter-chip-active");
    expect(primaryMarkers.className).toContain("dashboard-filter-chip-active");
  });

  it("hides card-only layer controls in compare mode", () => {
    const { props } = buildProps();
    render(
      <DashboardView
        {...{
          ...props,
          dashboardMode: "compare2",
          visibleReports: [report],
          allMarkers: ["Testosterone", "Estradiol"]
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Chart settings" }));

    expect(screen.getByText("Data & scale")).toBeTruthy();
    expect(screen.getByText("Comparison scale")).toBeTruthy();
    expect(screen.queryByText("Reference range")).toBeNull();
    expect(screen.queryByText("TRT target zone")).toBeNull();
    expect(screen.queryByText("Protocol phase overlay")).toBeNull();
    expect(screen.queryByText("Highlight out-of-range values")).toBeNull();
  });

  it("applies protocol preset values", () => {
    const { props, onUpdateSettings } = buildProps();
    render(<DashboardView {...{ ...props, visibleReports: [report], allMarkers: ["Testosterone", "Estradiol"] }} />);

    fireEvent.click(screen.getByRole("button", { name: "Chart settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Protocol" }));

    expect(onUpdateSettings).toHaveBeenCalledWith({
      showReferenceRanges: false,
      showAbnormalHighlights: true,
      showAnnotations: true,
      showTrtTargetZone: false,
      showLongevityTargetZone: false,
      yAxisMode: "data",
      dashboardChartPreset: "protocol"
    });
  });

  it("marks preset as custom after manual visual change", () => {
    const { props, onUpdateSettings } = buildProps();
    render(<DashboardView {...{ ...props, visibleReports: [report], allMarkers: ["Testosterone", "Estradiol"] }} />);

    fireEvent.click(screen.getByRole("button", { name: "Chart settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Reference range" }));

    expect(onUpdateSettings).toHaveBeenCalledWith({
      showReferenceRanges: false,
      dashboardChartPreset: "custom"
    });
  });

  it("opens marker alerts when alert badge is clicked", () => {
    const { props } = buildProps();
    const onOpenMarkerAlerts = vi.fn();
    render(
      <DashboardView
        {...{
          ...props,
          visibleReports: [report],
          allMarkers: ["Apolipoprotein B"],
          primaryMarkers: ["Apolipoprotein B"],
          alertsByMarker: { "Apolipoprotein B": [{ id: "a-1" } as never] },
          onOpenMarkerAlerts
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /open alerts for apolipoprotein b/i }));
    expect(onOpenMarkerAlerts).toHaveBeenCalledWith("Apolipoprotein B");
  });

  it("allows editing primary markers from chart settings", () => {
    const { props, onUpdateSettings } = buildProps();
    render(
      <DashboardView
        {...{
          ...props,
          visibleReports: [report],
          allMarkers: ["Testosterone", "Estradiol", "Ferritine"],
          primaryMarkers: ["Testosterone", "Estradiol"]
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Chart settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByLabelText(/ferrit/i));

    expect(onUpdateSettings).toHaveBeenCalledWith({
      primaryMarkersSelection: ["Testosterone", "Estradiol", "Ferritine"]
    });
  });

});
