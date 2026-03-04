import { describe, expect, it } from "vitest";
import { enrichMarkerForReview } from "../utils/markerReview";

describe("markerReview", () => {
  it("uses parser canonical marker as smart fallback when raw marker is noisy", () => {
    const reviewed = enrichMarkerForReview({
      id: "m-1",
      marker: "sex horm bind gl",
      canonicalMarker: "SHBG",
      value: 36.6,
      unit: "nmol/L",
      referenceMin: 18.3,
      referenceMax: 54.1,
      abnormal: "normal",
      confidence: 0.8
    });

    expect(reviewed._matchResult?.canonical?.id).toBe("shbg");
    expect(["alias", "exact", "normalized", "token"]).toContain(reviewed._matchResult?.confidence);
    expect(reviewed._confidence?.overall).toBe("ok");
  });

  it("preserves raw marker label for traceability", () => {
    const reviewed = enrichMarkerForReview({
      id: "m-2",
      marker: "hematocriet",
      canonicalMarker: "Hematocrit",
      value: 50,
      unit: "%",
      referenceMin: 41,
      referenceMax: 52,
      abnormal: "normal",
      confidence: 0.8
    });

    expect(reviewed.rawMarker).toBe("hematocriet");
    expect(reviewed.marker).toBe("Hematocrit");
  });
});
