import { describe, expect, it } from "vitest";
import { buildAlerts, buildMarkerSeries, calculatePercentChange } from "../analytics";
import { LabReport } from "../types";

const mkReport = (id: string, date: string, dose: number, markers: Array<{ marker: string; value: number; unit: string }>): LabReport => ({
  id,
  sourceFileName: `${id}.pdf`,
  testDate: date,
  createdAt: `${date}T08:00:00.000Z`,
  markers: markers.map((item, idx) => ({
    id: `${id}-${idx}`,
    marker: item.marker,
    canonicalMarker: item.marker,
    value: item.value,
    unit: item.unit,
    referenceMin: null,
    referenceMax: null,
    abnormal: "unknown",
    confidence: 1,
    source: "measured"
  })),
  annotations: {
    dosageMgPerWeek: dose,
    compounds: ["Testosterone Enanthate"],
    compound: "Testosterone Enanthate",
    injectionFrequency: "2x_week",
    protocol: "2x/week",
    supplementEntries: [],
    supplements: "",
    symptoms: "",
    notes: "",
    samplingTiming: "trough"
  },
  extraction: {
    provider: "fallback",
    model: "unit-test",
    confidence: 1,
    needsReview: false
  }
});

describe("analytics", () => {
  it("buildMarkerSeries returns chronological points", () => {
    const reports = [
      mkReport("r2", "2025-01-31", 120, [{ marker: "Testosterone", value: 30, unit: "nmol/L" }]),
      mkReport("r1", "2024-03-19", 120, [{ marker: "Testosterone", value: 15, unit: "nmol/L" }])
    ];

    const series = buildMarkerSeries(reports, "Testosterone", "eu");
    expect(series).toHaveLength(2);
    expect(series[0]?.date).toBe("2024-03-19");
    expect(series[1]?.value).toBe(30);
  });

  it("buildAlerts returns expected threshold alerts", () => {
    const reports = [
      mkReport("r1", "2025-01-01", 120, [
        { marker: "Hematocrit", value: 49, unit: "%" },
        { marker: "LDL Cholesterol", value: 3.2, unit: "mmol/L" }
      ]),
      mkReport("r2", "2025-02-01", 120, [
        { marker: "Hematocrit", value: 53, unit: "%" },
        { marker: "LDL Cholesterol", value: 3.9, unit: "mmol/L" }
      ])
    ];

    const alerts = buildAlerts(reports, ["Hematocrit", "LDL Cholesterol"], "eu", "en");
    expect(alerts.some((alert) => alert.marker === "Hematocrit" && alert.type === "threshold")).toBe(true);
    expect(alerts.some((alert) => alert.marker === "LDL Cholesterol" && alert.type === "threshold")).toBe(true);
  });

  it("calculatePercentChange handles edge cases", () => {
    expect(calculatePercentChange(120, 100)).toBe(20);
    expect(calculatePercentChange(80, 100)).toBe(-20);
    expect(calculatePercentChange(10, 0)).toBeNull();
    expect(calculatePercentChange(-12, -10)).toBe(20);
  });
});
