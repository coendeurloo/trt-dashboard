/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProtocolImpactDoseEvent, ProtocolImpactMarkerRow } from "../analytics";
import { DEFAULT_SETTINGS } from "../constants";
import ProtocolImpactView from "../views/ProtocolImpactView";

const row = (
  marker: string,
  impactScore: number,
  confidenceScore: number,
  beforeSource: "window" | "baseline" | "none" = "window"
): ProtocolImpactMarkerRow => ({
  marker,
  unit: "ng/dL",
  beforeAvg: 500,
  beforeSource,
  baselineAgeDays: beforeSource === "baseline" ? 40 : null,
  afterAvg: 600,
  deltaAbs: 100,
  deltaPct: 20,
  trend: "up",
  confidence: confidenceScore >= 75 ? "High" : confidenceScore >= 50 ? "Medium" : "Low",
  confidenceReason: "2 pre / 2 post",
  insufficientData: false,
  impactScore,
  confidenceScore,
  lagDays: marker === "LDL Cholesterol" ? 28 : 10,
  nBefore: 2,
  nAfter: 2,
  readinessStatus: "ready",
  recommendedNextTestDate: null,
  signalStatus: "established_pattern",
  deltaDirectionLabel: "Increased",
  contextHint: null,
  narrativeShort: `${marker} increased by +20%.`,
  narrative: `${marker} moved after this event.`
});

const makeEvent = (): ProtocolImpactDoseEvent => {
  const rows = [
    row("Testosterone", 94, 82, "baseline"),
    row("Free Testosterone", 89, 78),
    row("Estradiol", 85, 74),
    row("Hematocrit", 80, 66),
    row("LDL Cholesterol", 72, 61)
  ];

  return {
    id: "event-1",
    fromDose: 120,
    toDose: 115,
    fromFrequency: 2,
    toFrequency: 2,
    fromCompounds: ["Testosterone Enanthate"],
    toCompounds: ["Testosterone Enanthate"],
    changeDate: "2024-07-17",
    beforeCount: 2,
    afterCount: 2,
    beforeWindow: {
      start: "2024-06-01",
      end: "2024-07-16"
    },
    afterWindow: {
      start: "2024-07-27",
      end: "2024-09-10"
    },
    eventType: "dose",
    eventSubType: "adjustment",
    triggerStrength: 30,
    eventConfidenceScore: 77,
    eventConfidence: "High",
    signalStatus: "established_pattern",
    signalStatusLabel: "Established pattern",
    signalNextStep: "Strong pattern detected. Keep your regular monitoring cadence to confirm stability.",
    headlineNarrative: "Testosterone Enanthate dose change from 120 mg/week to 115 mg/week on 17 Jul 2024.",
    storyObserved: "Testosterone increased by +20%. Free Testosterone increased by +20%.",
    storyInterpretation: "This pattern is strongly consistent with the protocol change.",
    storyContextHint: "No major extra factors detected in this event.",
    storyChange: "Testosterone Enanthate dose change from 120 mg/week to 115 mg/week on 17 Jul 2024.",
    storyEffect: "Testosterone increased by +20%. Free Testosterone increased by +20%.",
    storyReliability: "This pattern is strongly consistent with the protocol change.",
    storySummary: "Story summary",
    confounders: {
      samplingChanged: true,
      supplementsChanged: true,
      symptomsChanged: false
    },
    lagDaysByMarker: {
      Testosterone: 10,
      "Free Testosterone": 10,
      Estradiol: 10,
      Hematocrit: 21,
      "LDL Cholesterol": 28
    },
    rows,
    topImpacts: rows.slice(0, 4)
  };
};

describe("ProtocolImpactView", () => {
  afterEach(() => {
    cleanup();
  });

  const baseProps = {
    protocolDoseOverview: [
      { marker: "Estradiol", r: 0.88, n: 7 },
      { marker: "Testosterone", r: 0.86, n: 7 }
    ],
    protocolDoseEvents: [makeEvent()],
    protocolWindowSize: 45,
    protocolMarkerSearch: "",
    protocolCategoryFilter: "all" as const,
    settings: {
      ...DEFAULT_SETTINGS,
      language: "en" as const
    },
    language: "en" as const,
    onProtocolWindowSizeChange: vi.fn(),
    onProtocolMarkerSearchChange: vi.fn(),
    onProtocolCategoryFilterChange: vi.fn()
  };

  it("renders disclaimer under title", () => {
    render(<ProtocolImpactView {...baseProps} />);
    expect(screen.getByText(/These insights use real measurements from your lab reports/i)).toBeTruthy();
    expect(screen.getByText(/How to read this/i)).toBeTruthy();
  });

  it("renders narrative event title", () => {
    render(<ProtocolImpactView {...baseProps} />);
    expect(screen.getByText("Testosterone Enanthate dose change from 120 mg/week to 115 mg/week on 17 Jul 2024.")).toBeTruthy();
  });

  it("does not show reliability low/high badge text", () => {
    render(<ProtocolImpactView {...baseProps} />);
    expect(screen.queryByText(/Reliability:/i)).toBeNull();
  });

  it("renders status pill", () => {
    render(<ProtocolImpactView {...baseProps} />);
    expect(screen.getByText(/Established pattern/)).toBeTruthy();
  });

  it("shows top-4 effects by default in the grid", () => {
    render(<ProtocolImpactView {...baseProps} />);

    expect(screen.getByText("Estradiol increased by +20%.")).toBeTruthy();
    expect(screen.getByText("Hematocrit increased by +20%.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show more effects" })).toBeNull();
  });

  it("shows context tooltip chip on marker row", () => {
    render(<ProtocolImpactView {...baseProps} />);
    expect(screen.getAllByText("💡 Context").length).toBeGreaterThan(0);
  });

  it("keeps technical details collapsed by default", () => {
    render(<ProtocolImpactView {...baseProps} />);
    const details = screen.getByText("Technical details").closest("details");
    expect(details).toBeTruthy();
    expect((details as HTMLDetailsElement).open).toBe(false);
  });
});
