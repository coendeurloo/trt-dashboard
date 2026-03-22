/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../constants";
import ReportsView from "../views/ReportsView";
import { AppSettings, LabReport, Protocol, ReportAnnotations, SupplementPeriod } from "../types";

const defaultAnnotations: ReportAnnotations = {
  protocolId: null,
  protocol: "",
  supplementOverrides: null,
  symptoms: "",
  notes: "",
  samplingTiming: "unknown"
};

const baseReport = (overrides: Partial<LabReport> = {}): LabReport => ({
  id: "r-1",
  sourceFileName: "labrapport-summary.pdf",
  testDate: "2026-02-18",
  createdAt: "2026-02-18T08:00:00.000Z",
  markers: [],
  annotations: defaultAnnotations,
  extraction: {
    provider: "fallback",
    model: "manual",
    confidence: 1,
    needsReview: false
  },
  ...overrides
});

const renderReportsView = (report: LabReport, supplementTimeline: SupplementPeriod[]) => {
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    language: "en"
  };
  const protocols: Protocol[] = [];
  render(
    <ReportsView
      reports={[report]}
      protocols={protocols}
      supplementTimeline={supplementTimeline}
      settings={settings}
      language="en"
      samplingControlsEnabled={false}
      isShareMode={false}
      onDeleteReport={vi.fn()}
      onDeleteReports={vi.fn()}
      onUpdateReportAnnotations={vi.fn()}
      onSetBaseline={vi.fn()}
      onRenameMarker={vi.fn()}
      onOpenProtocolTab={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Expand" }));
};

describe("ReportsView compact summary", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("hides empty symptoms and notes and shows supplement pills with +N more toggle", () => {
    const report = baseReport();
    const supplementTimeline: SupplementPeriod[] = [
      { id: "s-1", name: "Alpha Stack", dose: "1", frequency: "daily", startDate: "2026-01-01", endDate: null },
      { id: "s-2", name: "Beta Stack", dose: "2", frequency: "daily", startDate: "2026-01-01", endDate: null },
      { id: "s-3", name: "Delta Stack", dose: "3", frequency: "daily", startDate: "2026-01-01", endDate: null },
      { id: "s-4", name: "Epsilon Stack", dose: "4", frequency: "daily", startDate: "2026-01-01", endDate: null },
      { id: "s-5", name: "Gamma Stack", dose: "5", frequency: "daily", startDate: "2026-01-01", endDate: null },
      { id: "s-6", name: "Zeta Stack", dose: "6", frequency: "daily", startDate: "2026-01-01", endDate: null }
    ];

    renderReportsView(report, supplementTimeline);

    expect(screen.queryByText("Symptoms")).toBeNull();
    expect(screen.queryByText("Notes")).toBeNull();
    expect(screen.getByText("Supplements")).toBeTruthy();
    expect(screen.getByRole("button", { name: "+2 more" })).toBeTruthy();
    expect(screen.queryByText(/Gamma Stack/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "+2 more" }));
    expect(screen.getByRole("button", { name: "Show less" })).toBeTruthy();
    expect(screen.getByText(/Gamma Stack/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.getByRole("button", { name: "+2 more" })).toBeTruthy();
    expect(screen.queryByText(/Gamma Stack/i)).toBeNull();
  });

  it("shows unknown supplement state as compact status", () => {
    const report = baseReport({
      annotations: {
        ...defaultAnnotations,
        supplementAnchorState: "unknown"
      }
    });

    renderReportsView(report, []);

    expect(screen.getByText("Unknown at test date")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /\+\d+ more/i })).toBeNull();
  });

  it("shows no supplements state as compact status", () => {
    const report = baseReport({
      annotations: {
        ...defaultAnnotations,
        supplementAnchorState: "none",
        supplementOverrides: []
      }
    });

    renderReportsView(report, []);

    expect(screen.getByText("No supplements")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /\+\d+ more/i })).toBeNull();
  });
});
