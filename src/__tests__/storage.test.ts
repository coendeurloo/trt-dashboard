import { describe, expect, it } from "vitest";
import { coerceStoredAppData } from "../storage";

describe("storage.coerceStoredAppData", () => {
  it("returns defaults for null/malformed input", () => {
    expect(coerceStoredAppData(null)).toMatchObject({ schemaVersion: expect.any(Number), reports: [] });
    expect(coerceStoredAppData(undefined)).toMatchObject({ schemaVersion: expect.any(Number), reports: [] });
    expect(coerceStoredAppData({})).toMatchObject({ schemaVersion: expect.any(Number), reports: [] });
  });

  it("normalizes reports, deduplicates markers, and keeps multiple baselines when marker sets do not overlap", () => {
    const coerced = coerceStoredAppData({
      reports: [
        {
          id: "a",
          sourceFileName: "a.pdf",
          testDate: "2025-01-01",
          createdAt: "2025-01-01T10:00:00.000Z",
          isBaseline: true,
          annotations: {
            protocolId: null,
            protocol: "",
            supplementOverrides: null,
            symptoms: "",
            notes: "",
            samplingTiming: "unknown"
          },
          markers: [
            {
              id: "m1",
              marker: "Hematocriet",
              canonicalMarker: "Hematocrit",
              value: 0.52,
              unit: "l/l",
              referenceMin: 0.4,
              referenceMax: 0.52,
              abnormal: "unknown",
              confidence: 0.7
            },
            {
              id: "m1-dup",
              marker: "Hematocriet",
              canonicalMarker: "Hematocrit",
              value: 0.52,
              unit: "l/l",
              referenceMin: 0.4,
              referenceMax: 0.52,
              abnormal: "unknown",
              confidence: 0.9
            }
          ],
          extraction: { provider: "fallback", model: "x", confidence: 1, needsReview: false }
        },
        {
          id: "b",
          sourceFileName: "b.pdf",
          testDate: "2025-02-01",
          createdAt: "2025-02-01T10:00:00.000Z",
          isBaseline: true,
          annotations: {
            protocolId: null,
            protocol: "",
            supplementOverrides: null,
            symptoms: "",
            notes: "",
            samplingTiming: "unknown"
          },
          markers: [
            {
              id: "m2",
              marker: "Testosterone",
              canonicalMarker: "Testosterone",
              value: 25,
              unit: "nmol/L",
              referenceMin: null,
              referenceMax: null,
              abnormal: "unknown",
              confidence: 1
            }
          ],
          extraction: { provider: "claude", model: "x", confidence: 1, needsReview: false }
        }
      ]
    });

    expect(coerced.reports).toHaveLength(2);
    const baselineCount = coerced.reports.filter((report) => report.isBaseline).length;
    expect(baselineCount).toBe(2);

    const firstMarkers = coerced.reports[0]?.markers ?? [];
    expect(firstMarkers).toHaveLength(1);
    expect(firstMarkers[0]?.canonicalMarker).toBe("Hematocrit");
    expect(firstMarkers[0]?.value).toBe(52);
    expect(firstMarkers[0]?.unit).toBe("%");
  });

  it("removes overlapping baseline flags so each marker has at most one baseline report", () => {
    const coerced = coerceStoredAppData({
      reports: [
        {
          id: "a",
          sourceFileName: "a.pdf",
          testDate: "2025-01-01",
          createdAt: "2025-01-01T10:00:00.000Z",
          isBaseline: true,
          annotations: {
            protocolId: null,
            protocol: "",
            supplementOverrides: null,
            symptoms: "",
            notes: "",
            samplingTiming: "unknown"
          },
          markers: [
            {
              id: "m1",
              marker: "Testosterone",
              canonicalMarker: "Testosterone",
              value: 20,
              unit: "nmol/L",
              referenceMin: null,
              referenceMax: null,
              abnormal: "unknown",
              confidence: 0.9
            }
          ],
          extraction: { provider: "fallback", model: "x", confidence: 1, needsReview: false }
        },
        {
          id: "b",
          sourceFileName: "b.pdf",
          testDate: "2025-02-01",
          createdAt: "2025-02-01T10:00:00.000Z",
          isBaseline: true,
          annotations: {
            protocolId: null,
            protocol: "",
            supplementOverrides: null,
            symptoms: "",
            notes: "",
            samplingTiming: "unknown"
          },
          markers: [
            {
              id: "m2",
              marker: "Testosterone",
              canonicalMarker: "Testosterone",
              value: 22,
              unit: "nmol/L",
              referenceMin: null,
              referenceMax: null,
              abnormal: "unknown",
              confidence: 0.9
            }
          ],
          extraction: { provider: "fallback", model: "x", confidence: 1, needsReview: false }
        }
      ]
    });

    expect(coerced.reports.find((report) => report.id === "a")?.isBaseline).toBe(true);
    expect(coerced.reports.find((report) => report.id === "b")?.isBaseline).toBe(false);
  });
});
it("normalizes parser rescue consent settings with safe defaults", () => {
  const coerced = coerceStoredAppData({
    settings: {
      aiExternalConsent: true
    }
  } as unknown as Parameters<typeof coerceStoredAppData>[0]);

  expect(coerced.settings.parserRescueConsentState).toBe("unset");
  expect(coerced.settings.parserRescueAllowPdfAttachment).toBe(false);
});

it("preserves parser rescue consent settings when valid", () => {
  const coerced = coerceStoredAppData({
    settings: {
      parserRescueConsentState: "allowed",
      parserRescueAllowPdfAttachment: true
    }
  } as unknown as Parameters<typeof coerceStoredAppData>[0]);

  expect(coerced.settings.parserRescueConsentState).toBe("allowed");
  expect(coerced.settings.parserRescueAllowPdfAttachment).toBe(true);
});

it("preserves AI consent flag and still forces legacy sampling toggles on during normalization", () => {
  const coerced = coerceStoredAppData({
    settings: {
      aiExternalConsent: false,
      enableSamplingControls: false,
      enableCalculatedFreeTestosterone: false
    }
  } as unknown as Parameters<typeof coerceStoredAppData>[0]);

  expect(coerced.settings.aiExternalConsent).toBe(false);
  expect(coerced.settings.aiCoachConsentAsked).toBe(true);
  expect(coerced.settings.enableSamplingControls).toBe(true);
  expect(coerced.settings.enableCalculatedFreeTestosterone).toBe(true);
});

it("preserves parser debug page count when present", () => {
  const coerced = coerceStoredAppData({
    reports: [
      {
        id: "report-1",
        sourceFileName: "poor-scan.pdf",
        testDate: "2026-03-01",
        createdAt: "2026-03-01T10:00:00.000Z",
        annotations: {
          protocolId: null,
          protocol: "",
          supplementOverrides: null,
          symptoms: "",
          notes: "",
          samplingTiming: "unknown"
        },
        markers: [
          {
            id: "marker-1",
            marker: "Testosterone",
            canonicalMarker: "Testosterone",
            value: 22,
            unit: "nmol/L",
            referenceMin: null,
            referenceMax: null,
            abnormal: "normal",
            confidence: 0.7
          }
        ],
        extraction: {
          provider: "fallback",
          model: "fallback",
          confidence: 0.4,
          needsReview: true,
          debug: {
            pageCount: 3,
            textItems: 0,
            ocrUsed: true,
            ocrPages: 2,
            keptRows: 1,
            rejectedRows: 9,
            topRejectReasons: {}
          }
        }
      }
    ]
  } as unknown as Parameters<typeof coerceStoredAppData>[0]);

  expect(coerced.reports[0]?.extraction.debug?.pageCount).toBe(3);
});

it("backfills raw marker and remaps legacy bicarbonate canonical markers", () => {
  const coerced = coerceStoredAppData({
    reports: [
      {
        id: "report-co2",
        sourceFileName: "chemistry.pdf",
        testDate: "2026-03-10",
        createdAt: "2026-03-10T08:00:00.000Z",
        annotations: {
          protocolId: null,
          protocol: "",
          supplementOverrides: null,
          symptoms: "",
          notes: "",
          samplingTiming: "unknown"
        },
        markers: [
          {
            id: "co2-1",
            marker: "Carbon Dioxide",
            canonicalMarker: "Bicarbonate",
            value: 26,
            unit: "mmol/L",
            referenceMin: 22,
            referenceMax: 29,
            abnormal: "normal",
            confidence: 0.8
          },
          {
            id: "co2-2",
            marker: "Bicarbonate",
            canonicalMarker: "Bicarbonate",
            value: 24,
            unit: "mmol/L",
            referenceMin: 22,
            referenceMax: 29,
            abnormal: "normal",
            confidence: 0.8
          }
        ],
        extraction: { provider: "fallback", model: "x", confidence: 0.8, needsReview: false }
      }
    ]
  } as unknown as Parameters<typeof coerceStoredAppData>[0]);

  expect(coerced.reports[0]?.markers[0]?.rawMarker).toBe("Carbon Dioxide");
  expect(coerced.reports[0]?.markers[0]?.canonicalMarker).toBe("Carbon Dioxide");
  expect(coerced.reports[0]?.markers[1]?.canonicalMarker).toBe("Carbon Dioxide");
});

it("backfills legacy protocols to one version and preserves report intervention snapshot", () => {
  const coerced = coerceStoredAppData({
    interventions: [
      {
        id: "protocol-1",
        name: "TRT Base",
        items: [{ name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" }],
        compounds: [{ name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" }],
        notes: "legacy protocol",
        createdAt: "2025-01-01T08:00:00.000Z",
        updatedAt: "2025-01-01T08:00:00.000Z"
      }
    ],
    reports: [
      {
        id: "report-1",
        sourceFileName: "lab.pdf",
        testDate: "2025-02-01",
        createdAt: "2025-02-01T08:00:00.000Z",
        annotations: {
          interventionId: "protocol-1",
          interventionVersionId: "protocol-1-v1",
          interventionSnapshot: {
            interventionId: "protocol-1",
            versionId: "protocol-1-v1",
            name: "TRT Base",
            items: [{ name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" }],
            compounds: [{ name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" }],
            notes: "legacy protocol",
            effectiveFrom: "2025-01-01"
          },
          supplementOverrides: null,
          symptoms: "",
          notes: "",
          samplingTiming: "trough"
        },
        markers: [
          {
            id: "marker-1",
            marker: "Testosterone",
            canonicalMarker: "Testosterone",
            value: 20,
            unit: "nmol/L",
            referenceMin: null,
            referenceMax: null,
            abnormal: "normal",
            confidence: 1
          }
        ],
        extraction: { provider: "fallback", model: "unit-test", confidence: 1, needsReview: false }
      }
    ]
  } as unknown as Parameters<typeof coerceStoredAppData>[0]);

  expect(coerced.protocols[0]?.versions).toHaveLength(1);
  expect(coerced.protocols[0]?.versions?.[0]?.effectiveFrom).toBe("2025-01-01");
  expect(coerced.reports[0]?.annotations.interventionSnapshot?.versionId).toBe("protocol-1-v1");
});
