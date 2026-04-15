import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildAlerts,
  buildMarkerSeries,
  buildProtocolImpactDoseEvents,
  calculatePercentChange,
  deriveCalculatedMarkers,
  enrichReportWithCalculatedMarkers,
  getTargetZone
} from "../analytics";
import { __pdfParsingInternals } from "../pdfParsing";
import { LabReport, Protocol } from "../types";

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
    protocolId: dose > 0 ? `p-${dose}` : null,
    protocol: "2x/week",
    supplementOverrides: null,
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

const mkReportFromParsedDraft = (id: string, fileName: string, draft: ReturnType<typeof __pdfParsingInternals.fallbackExtract>): LabReport => ({
  id,
  sourceFileName: fileName,
  testDate: draft.testDate,
  createdAt: `${draft.testDate}T08:00:00.000Z`,
  markers: draft.markers.map((marker, index) => ({
    id: `${id}-${index}`,
    marker: marker.marker,
    rawMarker: marker.rawMarker,
    canonicalMarker: marker.canonicalMarker,
    value: marker.value,
    unit: marker.unit,
    referenceMin: marker.referenceMin,
    referenceMax: marker.referenceMax,
    abnormal: marker.abnormal,
    confidence: marker.confidence,
    source: "measured"
  })),
  annotations: {
    supplementOverrides: null,
    symptoms: "",
    notes: "",
    samplingTiming: "unknown"
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

  it("treats falling ApoB trend as positive (no action-needed alert)", () => {
    const reports = [
      mkReport("r1", "2025-01-01", 120, [{ marker: "Apolipoprotein B", value: 1.1, unit: "g/L" }]),
      mkReport("r2", "2025-02-01", 120, [{ marker: "Apolipoprotein B", value: 0.95, unit: "g/L" }]),
      mkReport("r3", "2025-03-01", 120, [{ marker: "Apolipoprotein B", value: 0.8, unit: "g/L" }])
    ];

    const alerts = buildAlerts(reports, ["Apolipoprotein B"], "eu", "en");
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.some((alert) => alert.marker === "Apolipoprotein B" && alert.actionNeeded)).toBe(false);
    expect(alerts.some((alert) => alert.marker === "Apolipoprotein B" && alert.tone === "positive")).toBe(true);
  });

  it("creates actionable ferritin threshold alert when ferritin is above 200", () => {
    const reports = [
      mkReport("r1", "2025-01-01", 120, [{ marker: "Ferritine", value: 180, unit: "ug/L" }]),
      mkReport("r2", "2025-02-01", 120, [{ marker: "Ferritine", value: 210, unit: "ug/L" }])
    ];

    const alerts = buildAlerts(reports, ["Ferritine"], "eu", "en");
    expect(
      alerts.some(
        (alert) => alert.marker === "Ferritine" && alert.type === "threshold" && alert.actionNeeded && alert.tone === "attention"
      )
    ).toBe(true);
  });

  it("uses marker-specific trend suggestion for ALAT rise instead of generic fallback text", () => {
    const reports = [
      mkReport("r1", "2025-01-01", 120, [{ marker: "ALAT (GPT)", value: 22, unit: "U/L" }]),
      mkReport("r2", "2025-02-01", 120, [{ marker: "ALAT (GPT)", value: 39, unit: "U/L" }]),
      mkReport("r3", "2025-03-01", 120, [{ marker: "ALAT (GPT)", value: 62, unit: "U/L" }])
    ];

    const alerts = buildAlerts(reports, ["ALAT (GPT)"], "eu", "en");
    const trendAlert = alerts.find((alert) => alert.marker === "ALAT (GPT)" && alert.type === "trend" && alert.actionNeeded);

    expect(trendAlert).toBeTruthy();
    expect(trendAlert?.suggestion.toLowerCase()).toContain("liver");
    expect(trendAlert?.suggestion).not.toContain(
      "Discuss whether sampling timing, protocol changes, or lifestyle explain this trend and whether extra monitoring is useful."
    );
  });

  it("uses marker-specific trend suggestion for falling PSA", () => {
    const reports = [
      mkReport("r1", "2025-01-01", 120, [{ marker: "PSA", value: 3.4, unit: "ug/L" }]),
      mkReport("r2", "2025-02-01", 120, [{ marker: "PSA", value: 2.7, unit: "ug/L" }]),
      mkReport("r3", "2025-03-01", 120, [{ marker: "PSA", value: 2.1, unit: "ug/L" }])
    ];

    const alerts = buildAlerts(reports, ["PSA"], "eu", "en");
    const trendAlert = alerts.find((alert) => alert.marker === "PSA" && alert.type === "trend");

    expect(trendAlert).toBeTruthy();
    expect(trendAlert?.suggestion.toLowerCase()).toContain("reassuring");
  });

  it("uses marker-specific abnormal suggestion for high total cholesterol", () => {
    const reports: LabReport[] = [
      {
        ...mkReport("r1", "2025-01-01", 120, [{ marker: "Cholesterol", value: 6.8, unit: "mmol/L" }]),
        markers: [
          {
            id: "r1-0",
            marker: "Cholesterol",
            canonicalMarker: "Cholesterol",
            value: 6.8,
            unit: "mmol/L",
            referenceMin: null,
            referenceMax: 5.0,
            abnormal: "high",
            confidence: 1,
            source: "measured"
          }
        ]
      }
    ];

    const alerts = buildAlerts(reports, ["Cholesterol"], "eu", "en");
    const thresholdAlert = alerts.find((alert) => alert.marker === "Cholesterol" && alert.type === "threshold");

    expect(thresholdAlert).toBeTruthy();
    expect(thresholdAlert?.suggestion).toContain("ApoB");
  });

  it("calculatePercentChange handles edge cases", () => {
    expect(calculatePercentChange(120, 100)).toBe(20);
    expect(calculatePercentChange(80, 100)).toBe(-20);
    expect(calculatePercentChange(10, 0)).toBeNull();
    expect(calculatePercentChange(-12, -10)).toBe(20);
  });

  it("resolves TRT zones for common hormone label variants", () => {
    const totalEu = getTargetZone("Testosterone, Total, Serum", "trt", "eu");
    expect(totalEu).not.toBeNull();
    expect(totalEu?.min).toBe(18);
    expect(totalEu?.max).toBe(35);

    const totalUs = getTargetZone("Testosterone, Total, Serum", "trt", "us");
    expect(totalUs).not.toBeNull();
    expect(totalUs?.min ?? 0).toBeCloseTo(519.12, 2);
    expect(totalUs?.max ?? 0).toBeCloseTo(1009.4, 2);

    const freeEu = getTargetZone("Testosterone, Free (Direct)", "trt", "eu");
    expect(freeEu).not.toBeNull();
    expect(freeEu?.min).toBe(0.3);
    expect(freeEu?.max).toBe(0.75);

    const estradiolLongevity = getTargetZone("Estradiol, Sensitive", "longevity", "eu");
    expect(estradiolLongevity).not.toBeNull();
    expect(estradiolLongevity?.min).toBe(60);
    expect(estradiolLongevity?.max).toBe(130);
  });

  it("adds fallback range to calculated T/E2 Ratio", () => {
    const report = mkReport("r-te2", "2025-03-01", 120, [
      { marker: "Testosterone", value: 25, unit: "nmol/L" },
      { marker: "Estradiol", value: 125, unit: "pmol/L" }
    ]);

    const derived = deriveCalculatedMarkers(report);
    const ratio = derived.find((marker) => marker.canonicalMarker === "T/E2 Ratio");

    expect(ratio).toBeDefined();
    expect(ratio?.unit).toBe("ratio");
    expect(ratio?.referenceMin).toBe(120);
    expect(ratio?.referenceMax).toBe(320);
    expect(ratio?.abnormal).toBe("normal");
  });

  it("derives August 12 2025 calculated Free Testosterone around 201 pg/mL in US units", () => {
    const input = fs.readFileSync(
      path.resolve(process.cwd(), "tests/parser-fixtures/drafts/B03/labrapport-latvia-250812/input.txt"),
      "utf8"
    );
    const draft = __pdfParsingInternals.fallbackExtract(input, "labrapport-250812-lab-latvia.pdf");
    const report = mkReportFromParsedDraft("r-aug-2025", "labrapport-250812-lab-latvia.pdf", draft);

    const derived = deriveCalculatedMarkers(report, { enableCalculatedFreeTestosterone: true });
    const freeT = derived.find((marker) => marker.canonicalMarker === "Free Testosterone");

    expect(freeT).toBeDefined();
    expect(freeT?.unit).toBe("nmol/L");
    expect(freeT?.value ?? 0).toBeCloseTo(0.697, 2);

    const enriched = enrichReportWithCalculatedMarkers(report, { enableCalculatedFreeTestosterone: true });
    const series = buildMarkerSeries([enriched], "Free Testosterone", "us");

    expect(series).toHaveLength(1);
    expect(series[0]?.unit).toBe("pg/mL");
    expect(series[0]?.value ?? 0).toBeCloseTo(201, 0);
  });

  it("prefers exact Testosterone over Bioavailable Testosterone or DHT when calculating Free Testosterone", () => {
    const report: LabReport = {
      ...mkReport("r-free-t-inputs", "2025-08-12", 120, []),
      markers: [
        {
          id: "dht",
          marker: "Dihydrotestosterone",
          canonicalMarker: "Dihydrotestosteron (DHT)",
          value: 0.1,
          unit: "nmol/L",
          referenceMin: 0.9,
          referenceMax: 3.4,
          abnormal: "low",
          confidence: 1,
          source: "measured"
        },
        {
          id: "bio",
          marker: "Bioavailable Testosterone",
          canonicalMarker: "Bioavailable Testosterone",
          value: 24.8,
          unit: "nmol/L",
          referenceMin: null,
          referenceMax: null,
          abnormal: "unknown",
          confidence: 0.99,
          source: "measured"
        },
        {
          id: "tt",
          marker: "Testosterone",
          canonicalMarker: "Testosterone",
          value: 8.51,
          unit: "ng/mL",
          referenceMin: 2.49,
          referenceMax: 8.36,
          abnormal: "high",
          confidence: 0.8,
          source: "measured"
        },
        {
          id: "shbg",
          marker: "SHBG",
          canonicalMarker: "SHBG",
          value: 29,
          unit: "nmol/L",
          referenceMin: 11.54,
          referenceMax: 54.49,
          abnormal: "normal",
          confidence: 1,
          source: "measured"
        },
        {
          id: "alb",
          marker: "Albumin",
          canonicalMarker: "Albumine",
          value: 44.8,
          unit: "g/L",
          referenceMin: 32,
          referenceMax: 48,
          abnormal: "normal",
          confidence: 1,
          source: "measured"
        }
      ]
    };

    const derived = deriveCalculatedMarkers(report, { enableCalculatedFreeTestosterone: true });
    const freeT = derived.find((marker) => marker.canonicalMarker === "Free Testosterone");

    expect(freeT).toBeDefined();
    expect(freeT?.value ?? 0).toBeCloseTo(0.697, 2);
  });

  it("repairs mislabeled calculated Free Testosterone points before US display conversion", () => {
    const report: LabReport = {
      ...mkReport("r-free-t-mislabeled", "2025-08-12", 120, []),
      markers: [
        {
          id: "ft-calc",
          marker: "Free Testosterone",
          canonicalMarker: "Free Testosterone",
          value: 0.577,
          unit: "pg/mL",
          referenceMin: null,
          referenceMax: null,
          abnormal: "unknown",
          confidence: 1,
          isCalculated: true,
          source: "calculated"
        }
      ]
    };

    const series = buildMarkerSeries([report], "Free Testosterone", "us");

    expect(series).toHaveLength(1);
    expect(series[0]?.unit).toBe("pg/mL");
    expect(series[0]?.value ?? 0).toBeCloseTo(166.4, 1);
  });

  it("detects compound change only when version effective date is reached", () => {
    const reports = [
      mkReport("r1", "2026-02-01", 120, [{ marker: "Testosterone", value: 18, unit: "nmol/L" }]),
      mkReport("r2", "2026-02-20", 120, [{ marker: "Testosterone", value: 19, unit: "nmol/L" }]),
      mkReport("r3", "2026-03-10", 120, [{ marker: "Testosterone", value: 21, unit: "nmol/L" }])
    ];
    reports.forEach((report) => {
      report.annotations.interventionId = "p-120";
      report.annotations.interventionLabel = "TRT";
      report.annotations.protocolId = "p-120";
      report.annotations.protocol = "TRT";
    });

    const protocols: Protocol[] = [
      {
        id: "p-120",
        name: "TRT",
        items: [{ name: "Testosterone Enanthate", dose: "120 mg/week", frequency: "2x_week", route: "SubQ" }],
        compounds: [{ name: "Testosterone Enanthate", dose: "120 mg/week", frequency: "2x_week", route: "SubQ" }],
        versions: [
          {
            id: "v1",
            name: "TRT",
            effectiveFrom: "2026-01-01",
            items: [{ name: "Testosterone Enanthate", dose: "120 mg/week", frequency: "2x_week", route: "SubQ" }],
            compounds: [{ name: "Testosterone Enanthate", dose: "120 mg/week", frequency: "2x_week", route: "SubQ" }],
            notes: "",
            createdAt: "2026-01-01T08:00:00.000Z"
          },
          {
            id: "v2",
            name: "TRT",
            effectiveFrom: "2026-03-01",
            items: [
              { name: "Testosterone Enanthate", dose: "120 mg/week", frequency: "2x_week", route: "SubQ" },
              { name: "Human Growth Hormone (HGH)", dose: "1 IU/day", frequency: "daily", route: "SubQ" }
            ],
            compounds: [
              { name: "Testosterone Enanthate", dose: "120 mg/week", frequency: "2x_week", route: "SubQ" },
              { name: "Human Growth Hormone (HGH)", dose: "1 IU/day", frequency: "daily", route: "SubQ" }
            ],
            notes: "",
            createdAt: "2026-03-01T08:00:00.000Z"
          }
        ],
        notes: "",
        createdAt: "2026-01-01T08:00:00.000Z",
        updatedAt: "2026-03-01T08:00:00.000Z"
      }
    ];

    const events = buildProtocolImpactDoseEvents(reports, "eu", 42, protocols, []);
    expect(events).toHaveLength(1);
    expect(events[0]?.changeDate).toBe("2026-03-10");
    expect(events[0]?.eventType).toBe("compound");
    expect(events[0]?.fromCompounds.some((item) => item.includes("HGH"))).toBe(false);
    expect(events[0]?.toCompounds.some((item) => item.includes("HGH"))).toBe(true);
  });
});
