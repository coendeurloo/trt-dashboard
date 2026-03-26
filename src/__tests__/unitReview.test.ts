import { describe, expect, it } from "vitest";
import { MarkerValue } from "../types";
import { matchMarker } from "../utils/markerMatcher";
import { buildMarkerUnitReview } from "../utils/unitReview";

const baseMarker = (overrides: Partial<MarkerValue>): MarkerValue => ({
  id: "m-1",
  marker: "Marker",
  canonicalMarker: "Unknown Marker",
  value: 1,
  unit: "",
  referenceMin: null,
  referenceMax: null,
  abnormal: "normal",
  confidence: 0.8,
  ...overrides
});

describe("unitReview", () => {
  it("suggests mmol/L for glucose-like values with a matching reference range", () => {
    const marker = baseMarker({
      marker: "Fasting Glucose",
      canonicalMarker: "Glucose",
      value: 4.6,
      referenceMin: 4,
      referenceMax: 6
    });

    const review = buildMarkerUnitReview(marker, matchMarker(marker.marker));

    expect(review.suggestion?.unit).toBe("mmol/L");
    expect(review.options.slice(0, 2)).toEqual(["mmol/L", "mg/dL"]);
  });

  it("does not auto-suggest when the marker has no explicit inference profile", () => {
    const marker = baseMarker({
      marker: "Leukocytes",
      canonicalMarker: "Leukocytes",
      value: 6.4,
      referenceMin: 4,
      referenceMax: 10
    });

    const review = buildMarkerUnitReview(marker, matchMarker(marker.marker));

    expect(review.suggestion).toBeNull();
    expect(review.options[0]).toBe("x10^9/L");
  });

  it("falls back to generic common units when the marker is unknown", () => {
    const marker = baseMarker({
      marker: "Mystery Marker",
      canonicalMarker: "Unknown Marker",
      value: 12
    });

    const review = buildMarkerUnitReview(marker, matchMarker(marker.marker));

    expect(review.options.slice(0, 4)).toEqual(["mmol/L", "mg/dL", "umol/L", "ng/mL"]);
  });
});
