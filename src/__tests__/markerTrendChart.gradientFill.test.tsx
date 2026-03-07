/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkerSeriesPoint } from "../analytics";
import { DEFAULT_SETTINGS } from "../constants";
import MarkerTrendChart from "../components/MarkerTrendChart";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  ComposedChart: ({ children }: { children: ReactNode }) => <svg data-testid="line-chart">{children}</svg>,
  CartesianGrid: () => <g />,
  XAxis: () => <g />,
  YAxis: () => <g />,
  Tooltip: () => null,
  ReferenceArea: () => <g />,
  ReferenceLine: () => <g />,
  Area: ({ fill, baseValue }: { fill?: string; baseValue?: number }) => (
    <g data-testid="series-area" data-fill={fill} data-base-value={baseValue ?? ""} />
  ),
  Line: ({ stroke }: { stroke?: string }) => <g data-testid="series-line" data-stroke={stroke} />
}));

const points: MarkerSeriesPoint[] = [
  {
    key: "2024-01-01__r1",
    reportId: "r1",
    date: "2024-01-01",
    createdAt: "2024-01-01T08:00:00.000Z",
    value: 10,
    unit: "ng/dL",
    referenceMin: null,
    referenceMax: null,
    abnormal: "normal",
    context: {
      dosageMgPerWeek: null,
      compound: "",
      injectionFrequency: "unknown",
      protocol: "",
      supplements: "",
      symptoms: "",
      notes: "",
      samplingTiming: "unknown"
    },
    isCalculated: false
  },
  {
    key: "2024-02-01__r2",
    reportId: "r2",
    date: "2024-02-01",
    createdAt: "2024-02-01T08:00:00.000Z",
    value: 15,
    unit: "ng/dL",
    referenceMin: null,
    referenceMax: null,
    abnormal: "normal",
    context: {
      dosageMgPerWeek: null,
      compound: "",
      injectionFrequency: "unknown",
      protocol: "",
      supplements: "",
      symptoms: "",
      notes: "",
      samplingTiming: "unknown"
    },
    isCalculated: false
  }
];

describe("MarkerTrendChart series gradient fill", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not render area fill by default", () => {
    const { container } = render(
      <MarkerTrendChart
        marker="Testosterone"
        points={points}
        colorIndex={0}
        settings={{ ...DEFAULT_SETTINGS, language: "en" }}
        language="en"
        phaseBlocks={[]}
        height={220}
      />
    );

    expect(screen.queryByTestId("series-area")).toBeNull();
    expect(container.querySelector("linearGradient[id^='marker-series-fill-']")).toBeNull();
  });

  it("renders gradient area fill when enabled", () => {
    const { container } = render(
      <MarkerTrendChart
        marker="Testosterone"
        points={points}
        colorIndex={0}
        settings={{ ...DEFAULT_SETTINGS, language: "en" }}
        language="en"
        phaseBlocks={[]}
        height={220}
        showSeriesGradientFill
      />
    );

    const area = screen.getByTestId("series-area");
    expect(area.getAttribute("data-fill")).toMatch(/^url\(#marker-series-fill-/);
    expect(area.getAttribute("data-base-value")).toBe("0");

    const gradient = container.querySelector("linearGradient[id^='marker-series-fill-']");
    expect(gradient).toBeTruthy();
    const stops = gradient?.querySelectorAll("stop");
    expect(stops?.[0]?.getAttribute("stop-opacity")).toBe("0.34");
    expect(stops?.[2]?.getAttribute("stop-opacity")).toBe("0");
  });
});
