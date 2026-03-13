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

  it("renders compact collapsed header with filename and marker cells while preserving expand controls", () => {
    const report = baseReport({
      sourceFileName: "labrapport-compact.pdf",
      markers: [
        {
          id: "m-1",
          marker: "TSH",
          canonicalMarker: "TSH",
          value: 1.7,
          unit: "mIU/L",
          referenceMin: 0.5,
          referenceMax: 4.5,
          abnormal: "normal",
          confidence: 1
        },
        {
          id: "m-2",
          marker: "Hematocrit",
          canonicalMarker: "Hematocrit",
          value: 53.1,
          unit: "%",
          referenceMin: 40,
          referenceMax: 52,
          abnormal: "high",
          confidence: 1
        },
        {
          id: "m-3",
          marker: "Free Testosterone",
          canonicalMarker: "Free Testosterone",
          value: 61,
          unit: "pg/mL",
          referenceMin: 20,
          referenceMax: 80,
          abnormal: "normal",
          confidence: 1
        },
        {
          id: "m-4",
          marker: "PSA",
          canonicalMarker: "PSA",
          value: 1.1,
          unit: "ng/mL",
          referenceMin: 0,
          referenceMax: 4,
          abnormal: "normal",
          confidence: 1
        },
        {
          id: "m-5",
          marker: "Estradiol",
          canonicalMarker: "Estradiol",
          value: 66,
          unit: "pg/mL",
          referenceMin: 10,
          referenceMax: 40,
          abnormal: "high",
          confidence: 1
        },
        {
          id: "m-6",
          marker: "Albumin",
          canonicalMarker: "Albumin",
          value: 44,
          unit: "g/L",
          referenceMin: 35,
          referenceMax: 50,
          abnormal: "normal",
          confidence: 1
        }
      ]
    });

    render(<ReportsView {...buildProps(report)} />);

    expect(screen.getByText("labrapport-compact.pdf")).toBeTruthy();
    expect(screen.getAllByText("Hematocrit").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Estradiol").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Free Testosterone").length).toBeGreaterThan(0);
    expect(screen.getAllByText("PSA").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Albumin").length).toBeGreaterThan(0);
    expect(screen.getAllByText("6 markers").length).toBeGreaterThan(0);
    expect(screen.queryByText("Inherited")).toBeNull();
    expect(screen.queryByText("Anchored")).toBeNull();
    expect(screen.queryByText("No supps")).toBeNull();
    expect(screen.queryByText("6 m")).toBeNull();
    expect(screen.queryByText("TSH")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Expand" }).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Out-of-range markers in this report").length).toBeGreaterThan(0);
  });
});
