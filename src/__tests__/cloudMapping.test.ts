import { describe, expect, it } from "vitest";
import { coerceStoredAppData } from "../storage";
import {
  buildIncrementalPatch,
  fromCloudSyncPayload,
  hasIncrementalPatchOperations,
  toCloudSyncPayload
} from "../cloud/mapping";

const makeSampleData = () =>
  coerceStoredAppData({
    reports: [
      {
        id: "report-1",
        sourceFileName: "lab-jan.pdf",
        testDate: "2026-01-11",
        createdAt: "2026-01-11T10:00:00.000Z",
        markers: [
          {
            id: "marker-1",
            marker: "Testosterone",
            canonicalMarker: "Testosterone",
            value: 18.5,
            unit: "nmol/L",
            referenceMin: 8,
            referenceMax: 29,
            abnormal: "normal",
            confidence: 0.95
          }
        ],
        annotations: {
          interventionId: "protocol-1",
          interventionLabel: "TRT",
          interventionVersionId: "protocol-1-v1",
          interventionSnapshot: {
            interventionId: "protocol-1",
            versionId: "protocol-1-v1",
            name: "TRT",
            items: [{ name: "Test C", dose: "120mg", frequency: "weekly", route: "IM" }],
            compounds: [{ name: "Test C", dose: "120mg", frequency: "weekly", route: "IM" }],
            notes: "baseline protocol",
            effectiveFrom: "2025-12-30"
          },
          protocolId: "protocol-1",
          protocolVersionId: "protocol-1-v1",
          protocol: "TRT",
          supplementAnchorState: "inherit",
          supplementOverrides: null,
          symptoms: "Stable",
          notes: "Morning draw",
          samplingTiming: "trough"
        },
        isBaseline: true,
        extraction: {
          provider: "fallback",
          model: "unit-test",
          confidence: 0.8,
          needsReview: false
        }
      }
    ],
    interventions: [
      {
        id: "protocol-1",
        name: "TRT",
        items: [{ name: "Test C", dose: "120mg", frequency: "weekly", route: "IM" }],
        compounds: [{ name: "Test C", dose: "120mg", frequency: "weekly", route: "IM" }],
        versions: [
          {
            id: "protocol-1-v1",
            name: "TRT",
            effectiveFrom: "2025-12-30",
            items: [{ name: "Test C", dose: "120mg", frequency: "weekly", route: "IM" }],
            compounds: [{ name: "Test C", dose: "120mg", frequency: "weekly", route: "IM" }],
            notes: "baseline protocol",
            createdAt: "2025-12-30T10:00:00.000Z"
          }
        ],
        notes: "baseline protocol",
        createdAt: "2025-12-30T10:00:00.000Z",
        updatedAt: "2026-01-10T10:00:00.000Z"
      }
    ],
    supplementTimeline: [
      {
        id: "supp-1",
        name: "Vitamin D3",
        dose: "2000 IU",
        frequency: "daily",
        startDate: "2026-01-01",
        endDate: null
      }
    ],
    wellbeingEntries: [
      {
        id: "checkin-1",
        date: "2026-01-12",
        profileAtEntry: "trt",
        values: { energy: 7, sleep: 8 },
        notes: "Good recovery"
      }
    ],
    markerAliasOverrides: {
      testo: "Testosterone"
    },
    settings: {
      theme: "dark",
      interfaceDensity: "comfortable",
      sidebarCollapsedDesktop: false,
      unitSystem: "eu",
      language: "en",
      userProfile: "trt",
      tooltipDetailMode: "full",
      enableSamplingControls: true,
      enableCalculatedFreeTestosterone: true,
      showReferenceRanges: true,
      showAbnormalHighlights: true,
      showAnnotations: true,
      showCheckInOverlay: true,
      showTrtTargetZone: true,
      showLongevityTargetZone: false,
      yAxisMode: "data",
      samplingFilter: "all",
      compareToBaseline: false,
      comparisonScale: "absolute",
      dashboardChartPreset: "clinical",
      timeRange: "12m",
      customRangeStart: "",
      customRangeEnd: "",
      aiExternalConsent: false,
      aiCoachConsentAsked: false,
      parserRescueConsentState: "unset",
      parserRescueAllowPdfAttachment: false,
      aiAnalysisProvider: "auto",
      aiCostMode: "balanced",
      aiAutoImproveEnabled: false,
      parserDebugMode: "text_ocr_ai",
      primaryMarkersSelection: ["Testosterone"],
      onboardingCompleted: false
    },
    personalInfo: {
      name: "Coen",
      dateOfBirth: "1983-06-02",
      biologicalSex: "male",
      heightCm: 177,
      weightKg: 90
    }
  });

describe("cloud mapping", () => {
  it("roundtrips StoredAppData through cloud payload without losing core entities", () => {
    const sample = makeSampleData();
    const payload = toCloudSyncPayload(sample);
    const roundtrip = fromCloudSyncPayload(payload);

    expect(roundtrip.reports).toHaveLength(1);
    expect(roundtrip.protocols).toHaveLength(1);
    expect(roundtrip.protocols[0]?.versions?.length ?? 0).toBeGreaterThan(0);
    expect(roundtrip.supplementTimeline).toHaveLength(1);
    expect(roundtrip.checkIns).toHaveLength(1);
    expect(roundtrip.reports[0].markers[0].canonicalMarker).toBe("Testosterone");
    expect(roundtrip.reports[0].isBaseline).toBe(true);
    expect(roundtrip.reports[0].annotations.interventionVersionId).toBe("protocol-1-v1");
    expect(roundtrip.reports[0].annotations.interventionSnapshot?.versionId).toBe("protocol-1-v1");
    expect(roundtrip.markerAliasOverrides.testo).toBe("Testosterone");
    expect(roundtrip.personalInfo).toEqual({
      name: "Coen",
      dateOfBirth: "1983-06-02",
      biologicalSex: "male",
      heightCm: 177,
      weightKg: 90
    });
  });

  it("is idempotent across two consecutive payload conversions", () => {
    const sample = makeSampleData();
    const payloadA = toCloudSyncPayload(sample);
    const dataB = fromCloudSyncPayload(payloadA);
    const payloadB = toCloudSyncPayload(dataB);

    expect(payloadB.reports.map((row) => row.local_id)).toEqual(
      payloadA.reports.map((row) => row.local_id)
    );
    expect(payloadB.markers.map((row) => row.local_id)).toEqual(
      payloadA.markers.map((row) => row.local_id)
    );
    expect(payloadB.protocols.map((row) => row.local_id)).toEqual(
      payloadA.protocols.map((row) => row.local_id)
    );
  });

  it("builds an empty incremental patch when nothing changed", () => {
    const sample = makeSampleData();
    const payload = toCloudSyncPayload(sample);
    const patch = buildIncrementalPatch(payload, payload);

    expect(hasIncrementalPatchOperations(patch)).toBe(false);
    expect(patch.reports.upserts).toHaveLength(0);
    expect(patch.markers.deleteLocalIds).toHaveLength(0);
  });

  it("builds upserts and deletes for changed entities", () => {
    const sample = makeSampleData();
    const payloadA = toCloudSyncPayload(sample);
    const next = makeSampleData();
    next.reports[0].markers[0].value = 20.1;
    next.supplementTimeline = [];
    const payloadB = toCloudSyncPayload(next);

    const patch = buildIncrementalPatch(payloadA, payloadB);
    expect(hasIncrementalPatchOperations(patch)).toBe(true);
    expect(patch.markers.upserts).toHaveLength(1);
    expect(patch.supplements.deleteLocalIds).toEqual(["supp-1"]);
  });

  it("marks settingsChanged when only personal info changed", () => {
    const sample = makeSampleData();
    const payloadA = toCloudSyncPayload(sample);
    const next = makeSampleData();
    next.personalInfo.name = "Cornelis";
    const payloadB = toCloudSyncPayload(next);

    const patch = buildIncrementalPatch(payloadA, payloadB);
    expect(hasIncrementalPatchOperations(patch)).toBe(true);
    expect(patch.settingsChanged).toBe(true);
    expect(patch.personalInfo.name).toBe("Cornelis");
    expect(patch.reports.upserts).toHaveLength(0);
    expect(patch.markers.upserts).toHaveLength(0);
  });
});
