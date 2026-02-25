import { describe, expect, it } from "vitest";
import { buildWellbeingSummary, selectReportsForAnalysis } from "../analysisScope";
import { LabReport, SymptomCheckIn } from "../types";

const makeReport = (id: number, testDate: string): LabReport => ({
  id: `r-${id}`,
  sourceFileName: `report-${id}.pdf`,
  testDate,
  createdAt: `${testDate}T10:00:00.000Z`,
  markers: [
    {
      id: `m-${id}`,
      marker: "Testosterone",
      canonicalMarker: "Testosterone",
      value: 20,
      unit: "nmol/L",
      referenceMin: 8,
      referenceMax: 29,
      abnormal: "normal",
      confidence: 1
    }
  ],
  annotations: {
    protocolId: null,
    protocol: "",
    supplementOverrides: null,
    symptoms: "",
    notes: "",
    samplingTiming: "trough"
  },
  extraction: {
    provider: "fallback",
    model: "fallback",
    confidence: 1,
    needsReview: false
  }
});

describe("selectReportsForAnalysis", () => {
  it("keeps all reports when count is within cap", () => {
    const reports = Array.from({ length: 5 }, (_, index) => makeReport(index + 1, `2025-0${index + 1}-01`));
    const result = selectReportsForAnalysis({
      reports,
      analysisType: "full",
      now: "2026-02-25"
    });

    expect(result.selectedReports).toHaveLength(5);
    expect(result.notice).toBeNull();
  });

  it("applies lookback and cap when many reports exist within last 24 months", () => {
    const reports = Array.from({ length: 12 }, (_, index) => {
      const month = String(index + 1).padStart(2, "0");
      return makeReport(index + 1, `2025-${month}-15`);
    });
    const result = selectReportsForAnalysis({
      reports,
      analysisType: "full",
      now: "2026-02-25"
    });

    expect(result.selectedReports).toHaveLength(10);
    expect(result.notice).toEqual({
      usedReports: 10,
      totalReports: 12,
      lookbackApplied: true,
      capApplied: true,
      reason: "lookback_and_cap"
    });
  });

  it("falls back to most recent cap when no report is inside lookback window", () => {
    const reports = Array.from({ length: 12 }, (_, index) => {
      const month = String((index % 12) + 1).padStart(2, "0");
      return makeReport(index + 1, `2021-${month}-10`);
    });
    const result = selectReportsForAnalysis({
      reports,
      analysisType: "full",
      now: "2026-02-25"
    });

    expect(result.selectedReports).toHaveLength(10);
    expect(result.notice).toEqual({
      usedReports: 10,
      totalReports: 12,
      lookbackApplied: true,
      capApplied: true,
      reason: "recent_cap_fallback"
    });
  });
});

describe("buildWellbeingSummary", () => {
  const checkIns: SymptomCheckIn[] = [
    { id: "c-1", date: "2026-01-10", energy: 4, mood: 5, sleep: 6, libido: 4, motivation: 5, notes: "n1" },
    { id: "c-2", date: "2026-01-20", energy: 5, mood: 6, sleep: 6, libido: 5, motivation: 6, notes: "n2" },
    { id: "c-3", date: "2026-02-05", energy: 6, mood: 6, sleep: 7, libido: 5, motivation: 7, notes: "n3" },
    { id: "c-4", date: "2025-06-01", energy: 3, mood: 3, sleep: 3, libido: 3, motivation: 3, notes: "outside" }
  ];

  it("builds structured wellbeing summary for selected report window", () => {
    const reports = [makeReport(1, "2026-01-01"), makeReport(2, "2026-02-28")];
    const summary = buildWellbeingSummary({ reports, checkIns });

    expect(summary).not.toBeNull();
    expect(summary?.count).toBe(3);
    expect(summary?.windowStart).toBe("2026-01-01");
    expect(summary?.windowEnd).toBe("2026-02-28");
    expect(summary?.latestDate).toBe("2026-02-05");
    expect(summary?.metricAverages.energy).toBe(5);
    expect(summary?.metricTrends.energy).toBe("rising");
    expect(summary?.recentPoints).toHaveLength(3);
  });

  it("returns empty metrics with insufficient trends when no check-ins are inside window", () => {
    const reports = [makeReport(1, "2026-03-01"), makeReport(2, "2026-03-31")];
    const summary = buildWellbeingSummary({ reports, checkIns });

    expect(summary).not.toBeNull();
    expect(summary?.count).toBe(0);
    expect(summary?.latestDate).toBeNull();
    expect(summary?.latestAverage).toBeNull();
    expect(summary?.metricTrends.energy).toBe("insufficient");
  });
});
