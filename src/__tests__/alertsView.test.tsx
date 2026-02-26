/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkerAlert, MarkerSeriesPoint } from "../analytics";
import { DEFAULT_SETTINGS } from "../constants";
import { AppSettings } from "../types";
import AlertsView from "../views/AlertsView";

vi.mock("../components/AlertTrendMiniChart", () => ({
  default: ({ marker }: { marker: string }) => <div data-testid={`alert-trend-${marker}`} />
}));

afterEach(() => {
  cleanup();
});

const makeAlert = (overrides: Partial<MarkerAlert> = {}): MarkerAlert => ({
  id: overrides.id ?? crypto.randomUUID(),
  marker: overrides.marker ?? "Hematocrit",
  type: overrides.type ?? "trend",
  severity: overrides.severity ?? "medium",
  tone: overrides.tone ?? "attention",
  actionNeeded: overrides.actionNeeded ?? true,
  message: overrides.message ?? "Marker trend needs attention.",
  suggestion: overrides.suggestion ?? "Discuss follow-up timing with your clinician.",
  date: overrides.date ?? "2026-02-01"
});

const makeSeriesPoint = (input: { id: string; date: string; value: number; unit: string }): MarkerSeriesPoint => ({
  key: input.id,
  date: input.date,
  reportId: `report-${input.id}`,
  createdAt: `${input.date}T08:00:00.000Z`,
  value: input.value,
  unit: input.unit,
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
});

const buildProps = (seriesByMarker: Record<string, MarkerSeriesPoint[]>) => {
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    language: "en"
  };

  return {
    alerts: [
      makeAlert({
        id: "a-action",
        marker: "Hematocrit",
        tone: "attention",
        actionNeeded: true
      }),
      makeAlert({
        id: "a-positive",
        marker: "HDL Cholesterol",
        tone: "positive",
        actionNeeded: false,
        severity: "low",
        message: "Trend is favorable.",
        suggestion: "Maintain current habits."
      })
    ],
    actionableAlerts: [
      makeAlert({
        id: "a-action",
        marker: "Hematocrit",
        tone: "attention",
        actionNeeded: true
      })
    ],
    positiveAlerts: [
      makeAlert({
        id: "a-positive",
        marker: "HDL Cholesterol",
        tone: "positive",
        actionNeeded: false,
        severity: "low",
        message: "Trend is favorable.",
        suggestion: "Maintain current habits."
      })
    ],
    alertSeriesByMarker: seriesByMarker,
    settings,
    language: "en" as const,
    samplingControlsEnabled: true,
    focusedMarker: null,
    onFocusedMarkerHandled: vi.fn()
  };
};

describe("AlertsView order", () => {
  it("shows predictive section before positive and actionable sections", () => {
    const props = buildProps({
      Hematocrit: [
        makeSeriesPoint({ id: "h1", date: "2025-12-01", value: 49, unit: "%" }),
        makeSeriesPoint({ id: "h2", date: "2026-01-01", value: 50, unit: "%" }),
        makeSeriesPoint({ id: "h3", date: "2026-02-01", value: 51, unit: "%" })
      ]
    });

    const { container } = render(<AlertsView {...props} />);

    const predictive = screen.getByRole("heading", { name: "Predictive" });
    const positive = screen.getByRole("heading", { name: "Positive signals" });
    const actionable = screen.getByRole("heading", { name: "Actionable alerts" });

    expect(Boolean(predictive.compareDocumentPosition(positive) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(Boolean(predictive.compareDocumentPosition(actionable) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(container.querySelector(".alerts-panel-predictive")).toBeTruthy();
    expect(container.querySelector(".alerts-panel-actionable")).toBeTruthy();
    expect(container.querySelector(".alerts-panel-positive")).toBeTruthy();
    expect(container.querySelector(".alerts-card-predictive")).toBeTruthy();
    expect(container.querySelector(".alerts-card-actionable")).toBeTruthy();
    expect(container.querySelector(".alerts-card-positive")).toBeTruthy();
  });

  it("hides predictive section when no predictive trends can be computed", () => {
    const props = buildProps({
      Hematocrit: [makeSeriesPoint({ id: "h1", date: "2026-02-01", value: 51, unit: "%" })]
    });

    render(<AlertsView {...props} />);

    expect(screen.queryByRole("heading", { name: "Predictive" })).toBeNull();
  });
});
