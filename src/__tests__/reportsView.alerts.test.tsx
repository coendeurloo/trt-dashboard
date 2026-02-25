/* @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
  sourceFileName: "demo.pdf",
  testDate: "2026-01-25",
  createdAt: "2026-01-25T08:00:00.000Z",
  markers: [],
  annotations: defaultAnnotations,
  extraction: {
    provider: "fallback",
    model: "demo-data",
    confidence: 1,
    needsReview: false
  },
  ...overrides
});

const buildProps = (report: LabReport) => {
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    language: "en"
  };
  const protocols: Protocol[] = [];
  const supplementTimeline: SupplementPeriod[] = [];
  return {
    reports: [report],
    protocols,
    supplementTimeline,
    settings,
    language: "en" as const,
    samplingControlsEnabled: false,
    isShareMode: false,
    onDeleteReport: vi.fn(),
    onDeleteReports: vi.fn(),
    onUpdateReportAnnotations: vi.fn(),
    onSetBaseline: vi.fn(),
    onRenameMarker: vi.fn(),
    onOpenProtocolTab: vi.fn()
  };
};

describe("ReportsView alert logic", () => {
  it("does not show report alert badge for markers that are in-range even if stored abnormal flags are stale", () => {
    const report = baseReport({
      markers: [
        {
          id: "m-1",
          marker: "Testosterone",
          canonicalMarker: "Testosterone",
          value: 20.7,
          unit: "nmol/L",
          referenceMin: 8,
          referenceMax: 29,
          abnormal: "high",
          confidence: 1
        },
        {
          id: "m-2",
          marker: "Estradiol",
          canonicalMarker: "Estradiol",
          value: 90,
          unit: "pmol/L",
          referenceMin: 40,
          referenceMax: 160,
          abnormal: "low",
          confidence: 1
        }
      ]
    });
    const props = buildProps(report);

    render(<ReportsView {...props} />);

    expect(screen.queryByLabelText("Out-of-range markers in this report")).toBeNull();
  });

  it("expands the report when clicking the alert badge", () => {
    const report = baseReport({
      markers: [
        {
          id: "m-1",
          marker: "Testosterone",
          canonicalMarker: "Testosterone",
          value: 35,
          unit: "nmol/L",
          referenceMin: 8,
          referenceMax: 29,
          abnormal: "normal",
          confidence: 1
        },
        {
          id: "m-2",
          marker: "Estradiol",
          canonicalMarker: "Estradiol",
          value: 90,
          unit: "pmol/L",
          referenceMin: 40,
          referenceMax: 160,
          abnormal: "normal",
          confidence: 1
        }
      ]
    });
    const props = buildProps(report);

    render(<ReportsView {...props} />);

    fireEvent.click(screen.getByLabelText("Out-of-range markers in this report"));
    expect(screen.getByRole("button", { name: "Edit details" })).toBeTruthy();
  });
});
