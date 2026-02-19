/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProtocolImpactDoseEvent, ProtocolImpactMarkerRow } from "../analytics";
import { DEFAULT_SETTINGS } from "../constants";
import ProtocolImpactView from "../views/ProtocolImpactView";

const row = (
  marker: string,
  impactScore: number,
  confidenceScore: number
): ProtocolImpactMarkerRow => ({
  marker,
  unit: "ng/dL",
  beforeAvg: 500,
  beforeSource: "window",
  comparisonBasis: "local_pre_post",
  baselineAgeDays: null,
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
    row("Testosterone", 94, 82),
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
    comparisonBasis: "local_pre_post",
    headlineNarrative: "Testosterone Enanthate dose change from 120 mg/week to 115 mg/week on 17 Jul 2024.",
    storyObserved: "Testosterone increased by +20%. Free Testosterone increased by +20%.",
    storyInterpretation: "Not shown in facts-only card.",
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

  it("renders minimal header copy", () => {
    render(<ProtocolImpactView {...baseProps} />);
    expect(screen.getByText("Protocol Impact")).toBeTruthy();
    expect(screen.getByText(/For each protocol change, you see what factually changed in your measurements./i)).toBeTruthy();
  });

  it("renders narrative event title", () => {
    render(<ProtocolImpactView {...baseProps} />);
    expect(screen.getByText("17 Jul 2024 · Protocol update")).toBeTruthy();
    expect(screen.getByText("Dose")).toBeTruthy();
    expect(screen.getByText("120 mg/week → 115 mg/week")).toBeTruthy();
  });

  it("does not show reliability low/high badge text", () => {
    render(<ProtocolImpactView {...baseProps} />);
    expect(screen.queryByText(/Reliability:/i)).toBeNull();
  });

  it("does not render signal status pill", () => {
    render(<ProtocolImpactView {...baseProps} />);
    expect(screen.queryByText(/Established pattern/)).toBeNull();
  });

  it("renders jump links to protocol changes", () => {
    render(<ProtocolImpactView {...baseProps} />);
    expect(screen.getByRole("link", { name: /17 Jul 2024/i })).toBeTruthy();
  });

  it("does not render overall conclusions block", () => {
    render(<ProtocolImpactView {...baseProps} />);
    expect(screen.queryByText("Overall conclusions")).toBeNull();
  });

  it("does not render filters block", () => {
    render(<ProtocolImpactView {...baseProps} />);
    expect(screen.queryByText("Filters")).toBeNull();
  });

  it("shows top-4 effects by default in the grid", () => {
    const { container } = render(<ProtocolImpactView {...baseProps} />);
    expect(screen.getByText("Biggest measured changes")).toBeTruthy();
    const cards = container.querySelectorAll(".protocol-impact-effects-grid li");
    expect(cards.length).toBe(4);
  });

  it("does not show context tooltip chip on marker row", () => {
    render(<ProtocolImpactView {...baseProps} />);
    expect(screen.queryByText("💡 Context")).toBeNull();
  });

  it("does not show interpretation row in event card", () => {
    render(<ProtocolImpactView {...baseProps} />);
    expect(screen.queryByText(/Interpretation/i)).toBeNull();
  });

  it("keeps all markers details collapsed by default", () => {
    render(<ProtocolImpactView {...baseProps} />);
    expect(screen.getByRole("button", { name: /All markers/i })).toBeTruthy();
    expect(screen.queryByText(/Δ%:/)).toBeNull();
  });

  it("renders medical note at the bottom, collapsed by default", () => {
    render(<ProtocolImpactView {...baseProps} />);
    const note = screen.getByText("Medical note").closest("details");
    expect(note).toBeTruthy();
    expect((note as HTMLDetailsElement).open).toBe(false);
  });
});
