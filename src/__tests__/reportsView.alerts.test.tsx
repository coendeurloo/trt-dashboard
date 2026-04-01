/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
    onUpdateReportMarkerUnit: vi.fn(),
    onSetBaseline: vi.fn(),
    onRenameMarker: vi.fn(),
    onOpenProtocolTab: vi.fn()
  };
};

describe("ReportsView alert logic", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

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

    expect(screen.queryByLabelText("Out-of-range biomarkers in this report")).toBeNull();
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

    fireEvent.click(screen.getByLabelText("Out-of-range biomarkers in this report"));
    expect(screen.getByRole("button", { name: "Edit details" })).toBeTruthy();
  });

  it("renders a clean collapsed header with alert count only and no out-of-range marker pills", () => {
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
    expect(screen.queryByTitle("Hematocrit")).toBeNull();
    expect(screen.queryByTitle("Estradiol")).toBeNull();
    expect(screen.getAllByText("6 biomarkers").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Expand" }).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Out-of-range biomarkers in this report").length).toBeGreaterThan(0);
  });

  it("selects a report from collapsed row without expanding it", () => {
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
          abnormal: "high",
          confidence: 1
        }
      ]
    });
    const onDeleteReports = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ReportsView {...{ ...buildProps(report), onDeleteReports }} />);

    fireEvent.click(screen.getByRole("button", { name: "Select report" }));

    expect(screen.queryByRole("button", { name: "Edit details" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
    expect(onDeleteReports).toHaveBeenCalledWith([report.id]);
    confirmSpy.mockRestore();
  });

  it("opens missing-unit review and confirms the suggested unit for a stored report marker", () => {
    const report = baseReport({
      markers: [
        {
          id: "m-1",
          marker: "Fasting Glucose",
          canonicalMarker: "Glucose",
          value: 4.6,
          unit: "",
          referenceMin: 4,
          referenceMax: 6,
          abnormal: "normal",
          confidence: 1
        }
      ]
    });
    const onUpdateReportMarkerUnit = vi.fn();

    render(<ReportsView {...{ ...buildProps(report), onUpdateReportMarkerUnit }} />);

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    fireEvent.click(screen.getByRole("button", { name: "Review missing unit" }));

    const dialog = screen.getByRole("dialog", { name: "Review unit" });
    expect(dialog).toBeTruthy();
    expect((within(dialog).getByRole("combobox") as HTMLSelectElement).value).toBe("mmol/L");

    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));

    expect(onUpdateReportMarkerUnit).toHaveBeenCalledWith(report.id, "m-1", "mmol/L");
  });

  it("opens unit review for a likely wrong unit and preselects the high-confidence suggestion", () => {
    const report = baseReport({
      markers: [
        {
          id: "m-1",
          marker: "Albumin",
          canonicalMarker: "Albumin",
          value: 3,
          unit: "mg/L",
          referenceMin: null,
          referenceMax: null,
          abnormal: "normal",
          confidence: 1
        }
      ]
    });
    const onUpdateReportMarkerUnit = vi.fn();

    render(<ReportsView {...{ ...buildProps(report), onUpdateReportMarkerUnit }} />);

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    fireEvent.click(screen.getByRole("button", { name: "Review unit" }));

    const dialog = screen.getByRole("dialog", { name: "Review unit" });
    const unitSelect = within(dialog).getByRole("combobox") as HTMLSelectElement;
    expect(unitSelect.value).toBe("g/dL");

    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));

    expect(onUpdateReportMarkerUnit).toHaveBeenCalledWith(report.id, "m-1", "g/dL");
  });

  it("keeps missing-unit review read-only in share mode", () => {
    const report = baseReport({
      markers: [
        {
          id: "m-1",
          marker: "Fasting Glucose",
          canonicalMarker: "Glucose",
          value: 4.6,
          unit: "",
          referenceMin: 4,
          referenceMax: 6,
          abnormal: "normal",
          confidence: 1
        }
      ]
    });

    render(<ReportsView {...{ ...buildProps(report), isShareMode: true }} />);

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));

    expect(screen.queryByRole("button", { name: "Review missing unit" })).toBeNull();
  });
});

describe("ReportsView delete confirmations", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("asks for confirmation before deleting a single report", () => {
    const report = baseReport();
    const onDeleteReport = vi.fn();
    const props = {
      ...buildProps(report),
      onDeleteReport
    };
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<ReportsView {...props} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Expand" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onDeleteReport).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDeleteReport).toHaveBeenCalledWith(report.id);
    confirmSpy.mockRestore();
  });

  it("asks for confirmation before deleting selected reports", () => {
    const report = baseReport();
    const onDeleteReports = vi.fn();
    const props = {
      ...buildProps(report),
      onDeleteReports
    };
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<ReportsView {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onDeleteReports).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
    expect(onDeleteReports).toHaveBeenCalledWith([report.id]);
    confirmSpy.mockRestore();
  });
});
