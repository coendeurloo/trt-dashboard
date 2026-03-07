/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../constants";
import { MarkerSeriesPoint } from "../analytics";
import MarkerChartCard from "../components/MarkerChartCard";

vi.mock("../components/MarkerTrendChart", () => ({
  default: () => <div data-testid="trend-chart" />
}));

vi.mock("../components/MarkerInfoBadge", () => ({
  default: () => <span data-testid="marker-info-badge" />
}));

const points: MarkerSeriesPoint[] = [
  {
    key: "p-1",
    reportId: "r-1",
    date: "2024-06-10",
    createdAt: "2024-06-10T00:00:00.000Z",
    value: 5.2,
    unit: "mmol/L",
    referenceMin: 3.5,
    referenceMax: 5.6,
    abnormal: "normal",
    isCalculated: false,
    context: {
      dosageMgPerWeek: null,
      compound: "Unknown",
      injectionFrequency: "Unknown",
      protocol: "",
      supplements: "",
      symptoms: "",
      notes: "",
      samplingTiming: "unknown"
    }
  }
];

const baseProps = {
  marker: "Apolipoprotein B",
  points,
  colorIndex: 0,
  settings: { ...DEFAULT_SETTINGS, language: "en" as const },
  language: "en" as const,
  phaseBlocks: [],
  trendSummary: null,
  percentChange: -1.9,
  baselineDelta: -4.55,
  isCalculatedMarker: false,
  onOpenLarge: vi.fn(),
  onOpenAlerts: vi.fn()
};

describe("MarkerChartCard visual states", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders neutral negative deltas when there are no alerts", () => {
    render(<MarkerChartCard {...baseProps} alertCount={0} settings={{ ...baseProps.settings, compareToBaseline: true }} />);

    expect(screen.getByText("-1.9%").className).toContain("marker-delta-neutral");
    expect(screen.getByText("-4.55%").className).toContain("marker-delta-neutral");
  });

  it("renders an alert shell and alert-tone deltas when marker has alerts", () => {
    render(<MarkerChartCard {...baseProps} alertCount={1} />);

    const card = screen.getByTestId("marker-card-Apolipoprotein B");
    expect(card.className).toContain("marker-card-alert");
    expect(screen.getByText("-1.9%").className).toContain("marker-delta-alert");
  });
});
