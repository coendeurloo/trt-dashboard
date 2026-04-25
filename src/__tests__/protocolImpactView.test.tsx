/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProtocolImpactDoseEvent, ProtocolImpactMarkerRow } from "../analytics";
import { DEFAULT_SETTINGS } from "../constants";
import ProtocolImpactView from "../views/ProtocolImpactView";

const row = (
  marker: string,
  deltaPct: number,
  impactScore: number,
  confidenceScore: number
): ProtocolImpactMarkerRow => ({
  marker,
  unit: marker === "Hematocrit" ? "%" : "mg/dL",
  beforeAvg: 100,
  beforeSource: "window",
  comparisonBasis: "local_pre_post",
  baselineAgeDays: null,
  afterAvg: 100 + (deltaPct / 100) * 100,
  deltaAbs: (deltaPct / 100) * 100,
  deltaPct,
  trend: deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "flat",
  confidence: confidenceScore >= 75 ? "High" : confidenceScore >= 50 ? "Medium" : "Low",
  confidenceReason: "2 pre / 2 post",
  insufficientData: false,
  impactScore,
  confidenceScore,
  lagDays: 14,
  nBefore: 2,
  nAfter: 2,
  readinessStatus: "ready",
  recommendedNextTestDate: null,
  signalStatus: "established_pattern",
  deltaDirectionLabel: deltaPct > 0 ? "Increased" : "Decreased",
  contextHint: null,
  narrativeShort: `${marker} changed by ${deltaPct}%.`,
  narrative: `${marker} moved after this event.`
});

const makeEvent = (
  id: string,
  changeDate: string,
  fromDose: number,
  toDose: number,
  confidence: ProtocolImpactDoseEvent["eventConfidence"],
  markerRows: ProtocolImpactMarkerRow[],
  fromCompounds: string[],
  toCompounds: string[]
): ProtocolImpactDoseEvent => ({
  id,
  fromDose,
  toDose,
  fromFrequency: 2,
  toFrequency: 2,
  fromCompounds,
  toCompounds,
  changeDate,
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
  eventConfidenceScore: confidence === "High" ? 77 : confidence === "Medium" ? 58 : 32,
  eventConfidence: confidence,
  signalStatus: "established_pattern",
  signalStatusLabel: "Established pattern",
  signalNextStep: "Continue monitoring.",
  comparisonBasis: "local_pre_post",
  headlineNarrative: "Narrative",
  storyObserved: "Observed",
  storyInterpretation: "Interpretation",
  storyContextHint: "Context",
  storyChange: "Change",
  storyEffect: "Effect",
  storyReliability: "Reliability",
  storySummary: "Summary",
  confounders: {
    samplingChanged: true,
    supplementsChanged: false,
    symptomsChanged: false
  },
  lagDaysByMarker: {},
  rows: markerRows,
  topImpacts: markerRows.slice(0, 4)
});

describe("ProtocolImpactView", () => {
  afterEach(() => {
    cleanup();
  });

  const firstRows = [
    row("Testosterone", 20, 94, 82),
    row("Creatinine", -15, 90, 78),
    row("LDL Cholesterol", 15, 86, 74),
    row("Hematocrit", 2, 80, 66),
    row("Triglycerides", -5, 72, 61)
  ];
  const secondRows = [
    row("Estradiol", 10, 91, 77),
    row("PSA", 18, 88, 74),
    row("LDL Cholesterol", 4, 70, 62)
  ];

  const firstEvent = makeEvent(
    "event-1",
    "2024-07-17",
    120,
    115,
    "High",
    firstRows,
    ["Testosterone Enanthate"],
    ["Testosterone Cypionate", "hCG"]
  );
  const secondEvent = makeEvent(
    "event-2",
    "2024-10-01",
    115,
    105,
    "Medium",
    secondRows,
    ["Testosterone Cypionate", "hCG"],
    ["Testosterone Cypionate"]
  );

  const baseProps = {
    protocolDoseEvents: [firstEvent, secondEvent],
    settings: {
      ...DEFAULT_SETTINGS,
      language: "en" as const
    },
    language: "en" as const
  };

  it("renders title, subtitle and selector", () => {
    render(<ProtocolImpactView {...baseProps} />);
    expect(screen.getByText("Change Impact")).toBeTruthy();
    expect(screen.getByText(/See which protocol change likely moved your biomarkers/i)).toBeTruthy();
    expect(screen.getByLabelText("Protocol change")).toBeTruthy();
  });

  it("shows the outcome hero as the primary insight", () => {
    render(<ProtocolImpactView {...baseProps} />);
    expect(screen.getByText("What changed after this update")).toBeTruthy();
    expect(screen.getAllByText(/Testosterone/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/↑ 20%/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Outcome$/i)).toBeNull();
    expect(screen.queryByText(/Largest shifts:/i)).toBeNull();
  });

  it("updates visible change details when a different event is selected", () => {
    render(<ProtocolImpactView {...baseProps} />);
    const changesSection = screen.getByTestId("protocol-impact-protocol-changes");
    expect(within(changesSection).getByText(/120 mg\/week -> 115 mg\/week/i)).toBeTruthy();

    fireEvent.click(screen.getByTestId("protocol-impact-event-selector-trigger"));
    const listbox = screen.getByRole("listbox");
    fireEvent.click(within(listbox).getByText(/01 Oct 2024/i));
    expect(within(changesSection).getByText(/115 mg\/week -> 105 mg\/week/i)).toBeTruthy();
    expect(screen.getAllByText("Early signal").length).toBeGreaterThan(0);
  });

  it("shows three simplified marker cards for the same top three changes", () => {
    render(<ProtocolImpactView {...baseProps} />);
    const cards = screen.getAllByTestId("protocol-impact-key-marker-card");
    expect(cards).toHaveLength(3);

    const firstCard = cards[0] as HTMLElement;
    expect(within(firstCard).queryByText(/Before/i)).toBeNull();
    expect(within(firstCard).queryByText(/After/i)).toBeNull();
    expect(within(firstCard).getByText(/->/)).toBeTruthy();
  });

  it("renders compact metadata line with improved/worsened and confidence", () => {
    render(<ProtocolImpactView {...baseProps} />);
    expect(screen.getByText(/2 improved/i)).toBeTruthy();
    expect(screen.getByText(/1 worsened/i)).toBeTruthy();
    expect(screen.getAllByText("Strong signal").length).toBeGreaterThan(0);
  });

  it("shows protocol changes as a secondary compact section", () => {
    render(<ProtocolImpactView {...baseProps} />);
    const changesSection = screen.getByTestId("protocol-impact-protocol-changes");
    expect(within(changesSection).getByText("Protocol changes")).toBeTruthy();
    expect(within(changesSection).getByText("Added:")).toBeTruthy();
    expect(within(changesSection).getByText("Removed:")).toBeTruthy();
    expect(within(changesSection).queryByText(/^Kept:/i)).toBeNull();
  });

  it("keeps all disclosure sections collapsed by default", () => {
    render(<ProtocolImpactView {...baseProps} />);
    const showAll = screen.getByText(/Show all biomarkers/i).closest("details") as HTMLDetailsElement;
    const confidence = screen.getByText(/Why confidence is limited/i).closest("details") as HTMLDetailsElement;
    const factors = screen.getByText(/Other factors changed/i).closest("details") as HTMLDetailsElement;
    const protocol = screen.getByText(/Full protocol details/i).closest("details") as HTMLDetailsElement;
    const timeline = screen.getByText(/Timeline history/i).closest("details") as HTMLDetailsElement;

    expect(showAll.open).toBe(false);
    expect(confidence.open).toBe(false);
    expect(factors.open).toBe(false);
    expect(protocol.open).toBe(false);
    expect(timeline.open).toBe(false);
  });

  it("renders clean empty state when no events are available", () => {
    render(
      <ProtocolImpactView
        protocolDoseEvents={[]}
        settings={{
          ...DEFAULT_SETTINGS,
          language: "en"
        }}
        language="en"
      />
    );
    expect(screen.getByText(/No protocol-change events with usable before\/after data were found./i)).toBeTruthy();
  });
});
