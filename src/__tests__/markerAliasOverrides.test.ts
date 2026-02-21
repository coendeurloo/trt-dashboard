import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setMarkerAliasOverrides } from "../markerNormalization";
import { coerceStoredAppData } from "../storage";

const buildRawReport = (markerName: string) => ({
  id: "r1",
  sourceFileName: "report.pdf",
  testDate: "2025-01-01",
  createdAt: "2025-01-01T10:00:00.000Z",
  isBaseline: false,
  annotations: {
    protocolId: null,
    protocol: "",
    supplementOverrides: null,
    symptoms: "",
    notes: "",
    samplingTiming: "unknown" as const
  },
  markers: [
    {
      id: "m1",
      marker: markerName,
      canonicalMarker: "Unknown Marker",
      value: 12,
      unit: "nmol/L",
      referenceMin: 5,
      referenceMax: 35,
      abnormal: "unknown" as const,
      confidence: 0.8
    }
  ],
  extraction: {
    provider: "fallback" as const,
    model: "fallback",
    confidence: 0.8,
    needsReview: false
  }
});

describe("storage markerAliasOverrides", () => {
  beforeEach(() => {
    setMarkerAliasOverrides({});
  });

  afterEach(() => {
    setMarkerAliasOverrides({});
  });

  it("keeps legacy data compatible when markerAliasOverrides is missing", () => {
    const coerced = coerceStoredAppData({
      reports: [buildRawReport("Sex Hormone Binding Globulin")]
    });

    expect(coerced.markerAliasOverrides).toEqual({});
    expect(coerced.reports[0]?.markers[0]?.canonicalMarker).toBe("SHBG");
  });

  it("normalizes and persists alias overrides", () => {
    const coerced = coerceStoredAppData({
      markerAliasOverrides: {
        "  My Lab Total T  ": "testosterone"
      },
      reports: [buildRawReport("My Lab Total T")]
    });

    expect(coerced.markerAliasOverrides).toEqual({
      "my lab total t": "Testosterone"
    });
    expect(coerced.reports[0]?.markers[0]?.canonicalMarker).toBe("Testosterone");
  });

  it("ignores invalid override targets", () => {
    const coerced = coerceStoredAppData({
      markerAliasOverrides: {
        "My Weird Marker": "Unknown Marker"
      },
      reports: [buildRawReport("My Weird Marker")]
    });

    expect(coerced.markerAliasOverrides).toEqual({});
    expect(coerced.reports[0]?.markers[0]?.canonicalMarker).toBe("My Weird Marker");
  });
});
