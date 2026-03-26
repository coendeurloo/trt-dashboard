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

  it("suggests umol/L for bilirubin-like values with a matching range", () => {
    const marker = baseMarker({
      marker: "Bilirubin",
      canonicalMarker: "Total Bilirubin",
      value: 14,
      referenceMin: 3,
      referenceMax: 21
    });

    const review = buildMarkerUnitReview(marker, matchMarker(marker.marker));

    expect(review.suggestion?.unit).toBe("umol/L");
    expect(review.options.slice(0, 2)).toEqual(["umol/L", "mg/dL"]);
  });

  it("suggests pmol/L for free t4 values with a matching range", () => {
    const marker = baseMarker({
      marker: "Free T4",
      canonicalMarker: "Free T4",
      value: 16.2,
      referenceMin: 12,
      referenceMax: 22
    });

    const review = buildMarkerUnitReview(marker, matchMarker(marker.marker));

    expect(review.suggestion?.unit).toBe("pmol/L");
    expect(review.options.slice(0, 2)).toEqual(["pmol/L", "ng/dL"]);
  });

  it("suggests g/L for ApoB values with a matching max range", () => {
    const marker = baseMarker({
      marker: "Apo B",
      canonicalMarker: "Apolipoprotein B",
      value: 0.82,
      referenceMin: null,
      referenceMax: 1
    });

    const review = buildMarkerUnitReview(marker, matchMarker(marker.marker));

    expect(review.suggestion?.unit).toBe("g/L");
    expect(review.options.slice(0, 2)).toEqual(["g/L", "mg/dL"]);
  });

  it("suggests mmol/L for urea with a matching range", () => {
    const marker = baseMarker({
      marker: "Urea",
      canonicalMarker: "Urea",
      value: 5.8,
      referenceMin: 2.5,
      referenceMax: 7.5
    });

    const review = buildMarkerUnitReview(marker, matchMarker(marker.marker));

    expect(review.suggestion?.unit).toBe("mmol/L");
    expect(review.options.slice(0, 2)).toEqual(["mmol/L", "mg/dL"]);
  });

  it("does not auto-suggest urea without a reference range", () => {
    const marker = baseMarker({
      marker: "Urea",
      canonicalMarker: "Urea",
      value: 5.8,
      referenceMin: null,
      referenceMax: null
    });

    const review = buildMarkerUnitReview(marker, matchMarker(marker.marker));

    expect(review.suggestion).toBeNull();
  });

  it("suggests ng/dL for bioavailable testosterone with a matching range", () => {
    const marker = baseMarker({
      marker: "Bioavailable Testosterone",
      canonicalMarker: "Bioavailable Testosterone",
      value: 260,
      referenceMin: 90,
      referenceMax: 430
    });

    const review = buildMarkerUnitReview(marker, matchMarker(marker.marker));

    expect(review.suggestion?.unit).toBe("ng/dL");
    expect(review.options.slice(0, 2)).toEqual(["ng/dL", "nmol/L"]);
  });

  it("suggests mg/L FEU for d-dimer with a matching max range", () => {
    const marker = baseMarker({
      marker: "D-Dimer",
      canonicalMarker: "D-Dimer",
      value: 0.32,
      referenceMin: null,
      referenceMax: 0.5
    });

    const review = buildMarkerUnitReview(marker, matchMarker(marker.marker));

    expect(review.suggestion?.unit).toBe("mg/L FEU");
    expect(review.options.slice(0, 2)).toEqual(["mg/L FEU", "ng/mL FEU"]);
  });
});
