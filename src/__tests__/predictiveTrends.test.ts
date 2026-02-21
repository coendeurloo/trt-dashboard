import { describe, expect, it } from "vitest";
import { MarkerSeriesPoint } from "../analytics";
import { buildPredictiveAlerts } from "../predictiveTrends";

const makePoint = (
  marker: string,
  date: string,
  value: number,
  unit: string
): MarkerSeriesPoint => ({
  key: `${marker}-${date}`,
  date,
  reportId: `report-${date}`,
  createdAt: `${date}T00:00:00Z`,
  value,
  unit,
  referenceMin: null,
  referenceMax: null,
  abnormal: "normal",
  context: {
    dosageMgPerWeek: null,
    compound: "",
    injectionFrequency: "",
    protocol: "",
    supplements: "",
    symptoms: "",
    notes: "",
    samplingTiming: "unknown"
  },
  isCalculated: false
});

describe("buildPredictiveAlerts", () => {
  it("returns empty array when fewer than 2 points exist", () => {
    const alerts = buildPredictiveAlerts(
      {
        Hematocrit: [makePoint("Hematocrit", "2025-01-01", 47, "%")]
      },
      "eu"
    );
    expect(alerts).toEqual([]);
  });

  it("returns a rising alert when hematocrit trends toward 52%", () => {
    const alerts = buildPredictiveAlerts(
      {
        Hematocrit: [
          makePoint("Hematocrit", "2025-01-01", 45, "%"),
          makePoint("Hematocrit", "2025-03-01", 47, "%"),
          makePoint("Hematocrit", "2025-05-01", 49, "%")
        ]
      },
      "eu"
    );
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].marker).toBe("Hematocrit");
    expect(alerts[0].direction).toBe("rising");
    expect(alerts[0].threshold).toBe(52);
  });

  it("returns no alert when trend moves away from threshold", () => {
    const alerts = buildPredictiveAlerts(
      {
        Hematocrit: [
          makePoint("Hematocrit", "2025-01-01", 51, "%"),
          makePoint("Hematocrit", "2025-03-01", 49, "%"),
          makePoint("Hematocrit", "2025-05-01", 47, "%")
        ]
      },
      "eu"
    );
    expect(alerts).toEqual([]);
  });

  it("returns no alert when current value already exceeds threshold", () => {
    const alerts = buildPredictiveAlerts(
      {
        Hematocrit: [
          makePoint("Hematocrit", "2025-01-01", 54.2, "%"),
          makePoint("Hematocrit", "2025-03-01", 55.1, "%")
        ]
      },
      "eu"
    );
    expect(alerts).toEqual([]);
  });

  it("returns no alert when projected crossing is beyond 2 years", () => {
    const alerts = buildPredictiveAlerts(
      {
        Hematocrit: [
          makePoint("Hematocrit", "2023-01-01", 40, "%"),
          makePoint("Hematocrit", "2024-01-01", 40.5, "%")
        ]
      },
      "eu"
    );
    expect(alerts).toEqual([]);
  });

  it("sorts by urgency and deduplicates by marker", () => {
    const alerts = buildPredictiveAlerts(
      {
        ALT: [
          makePoint("ALT", "2025-01-01", 30, "U/L"),
          makePoint("ALT", "2025-03-01", 42, "U/L")
        ],
        Hematocrit: [
          makePoint("Hematocrit", "2025-01-01", 45, "%"),
          makePoint("Hematocrit", "2025-03-01", 47, "%"),
          makePoint("Hematocrit", "2025-05-01", 49, "%")
        ]
      },
      "eu"
    );

    expect(alerts.some((alert) => alert.marker === "ALT")).toBe(true);
    expect(alerts.some((alert) => alert.marker === "Hematocrit")).toBe(true);
    expect(alerts.filter((alert) => alert.marker === "Hematocrit")).toHaveLength(1);
    expect(alerts[0].marker).toBe("ALT");
    expect(alerts[0].daysUntil).toBeLessThan(alerts[1].daysUntil);
  });

  it("uses EU and US thresholds by unit system", () => {
    const euAlerts = buildPredictiveAlerts(
      {
        "LDL Cholesterol": [
          makePoint("LDL Cholesterol", "2025-01-01", 3.4, "mmol/L"),
          makePoint("LDL Cholesterol", "2025-03-01", 3.8, "mmol/L")
        ]
      },
      "eu"
    );
    const usAlerts = buildPredictiveAlerts(
      {
        "LDL Cholesterol": [
          makePoint("LDL Cholesterol", "2025-01-01", 138, "mg/dL"),
          makePoint("LDL Cholesterol", "2025-03-01", 150, "mg/dL")
        ]
      },
      "us"
    );

    expect(euAlerts[0]?.threshold).toBe(4);
    expect(usAlerts[0]?.threshold).toBe(155);
  });
});
