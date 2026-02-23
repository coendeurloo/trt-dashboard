import { describe, expect, it } from "vitest";
import { buildExtractionDiffSummary } from "../extractionDiff";
import { ExtractionDraft } from "../types";

const makeDraft = (params: {
  testDate: string;
  confidence: number;
  markers: Array<{
    marker: string;
    canonicalMarker: string;
    value: number;
    unit: string;
    referenceMin: number | null;
    referenceMax: number | null;
    confidence: number;
  }>;
}): ExtractionDraft => ({
  sourceFileName: "report.pdf",
  testDate: params.testDate,
  markers: params.markers.map((marker, index) => ({
    id: `m-${index}`,
    marker: marker.marker,
    canonicalMarker: marker.canonicalMarker,
    value: marker.value,
    unit: marker.unit,
    referenceMin: marker.referenceMin,
    referenceMax: marker.referenceMax,
    abnormal: "unknown",
    confidence: marker.confidence
  })),
  extraction: {
    provider: "fallback",
    model: "fallback",
    confidence: params.confidence,
    needsReview: false
  }
});

describe("buildExtractionDiffSummary", () => {
  it("detects added, removed and changed markers", () => {
    const localDraft = makeDraft({
      testDate: "2026-02-19",
      confidence: 0.6,
      markers: [
        {
          marker: "Testosterone",
          canonicalMarker: "Testosterone",
          value: 18,
          unit: "nmol/L",
          referenceMin: 8,
          referenceMax: 30,
          confidence: 0.7
        },
        {
          marker: "Ferritin",
          canonicalMarker: "Ferritin",
          value: 120,
          unit: "ug/L",
          referenceMin: 20,
          referenceMax: 300,
          confidence: 0.66
        }
      ]
    });

    const aiDraft = makeDraft({
      testDate: "2026-02-20",
      confidence: 0.78,
      markers: [
        {
          marker: "Testosterone",
          canonicalMarker: "Testosterone",
          value: 21,
          unit: "nmol/L",
          referenceMin: 8,
          referenceMax: 29,
          confidence: 0.91
        },
        {
          marker: "SHBG",
          canonicalMarker: "SHBG",
          value: 33,
          unit: "nmol/L",
          referenceMin: 10,
          referenceMax: 70,
          confidence: 0.88
        }
      ]
    });

    const diff = buildExtractionDiffSummary(localDraft, aiDraft);

    expect(diff.testDateChanged).toBe(true);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]?.canonicalMarker).toBe("SHBG");
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0]?.canonicalMarker).toBe("Ferritin");
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0]?.canonicalMarker).toBe("Testosterone");
    expect(diff.changed[0]?.changedFields).toContain("value");
    expect(diff.hasChanges).toBe(true);
  });
});
