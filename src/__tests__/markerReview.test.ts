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
    expect(reviewed.marker).toBe("hematocriet");
  });

  it("treats app canonical vitamin D names as strong review matches", () => {
    const reviewed = enrichMarkerForReview({
      id: "m-3",
      marker: "Vitamin D (D3+D2) OH",
      canonicalMarker: "Vitamin D (D3+D2) OH",
      value: 60.1,
      unit: "ng/mL",
      referenceMin: 30,
      referenceMax: 100,
      abnormal: "normal",
      confidence: 0.84
    });

    expect(reviewed._matchResult?.canonical?.canonicalName).toBe("Vitamin D");
    expect(["alias", "exact", "normalized"]).toContain(reviewed._matchResult?.confidence);
    expect(reviewed._confidence?.issues.some((issue) => /matched approximately/i.test(issue))).toBe(false);
  });

  it("uses PDW when the parser already supplies that canonical marker", () => {
    const reviewed = enrichMarkerForReview({
      id: "m-4",
      marker: "Platelets",
      canonicalMarker: "PDW",
      value: 11.3,
      unit: "fL",
      referenceMin: 9.3,
      referenceMax: 16.7,
      abnormal: "normal",
      confidence: 0.7
    });

    expect(reviewed._matchResult?.canonical?.canonicalName).toBe("PDW");
    expect(reviewed._confidence?.unit).toBe("high");
    expect(reviewed._confidence?.issues.some((issue) => /not recognized/i.test(issue))).toBe(false);
  });
});
