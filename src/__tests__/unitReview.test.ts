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

  it("suggests mmol/L for hemoglobin values in mmol-style ranges", () => {
    const marker = baseMarker({
      marker: "Hemoglobin",
      canonicalMarker: "Hemoglobin",
      value: 10.9,
      referenceMin: 8.5,
      referenceMax: 11
    });

    const review = buildMarkerUnitReview(marker, matchMarker(marker.marker));

    expect(review.suggestion?.unit).toBe("mmol/L");
    expect(review.options[0]).toBe("mmol/L");
  });

  it("suggests umol/L for homocysteine values with a matching range", () => {
    const marker = baseMarker({
      marker: "Homocysteine",
      canonicalMarker: "Homocysteine",
      value: 9.9,
      referenceMin: 5,
      referenceMax: 15
    });

    const review = buildMarkerUnitReview(marker, matchMarker(marker.marker));

    expect(review.suggestion?.unit).toBe("umol/L");
    expect(review.options[0]).toBe("umol/L");
  });

  it("suggests percent for transferrin saturation", () => {
    const marker = baseMarker({
      marker: "Transferrin Saturation",
      canonicalMarker: "Transferrin Saturation",
      value: 13,
      referenceMin: 20,
      referenceMax: 50
    });

    const review = buildMarkerUnitReview(marker, matchMarker(marker.marker));

    expect(review.suggestion?.unit).toBe("%");
    expect(review.options[0]).toBe("%");
  });

  it("suggests ug/L for ferritin despite equivalent ng/mL alternate units", () => {
    const marker = baseMarker({
      marker: "Ferritin",
      canonicalMarker: "Ferritin",
      value: 65,
      referenceMin: 30,
      referenceMax: 400
    });

    const review = buildMarkerUnitReview(marker, matchMarker(marker.marker));

    expect(review.suggestion?.unit).toBe("ug/L");
    expect(review.options[0]).toBe("ug/L");
  });

  it("suggests pmol/L for vitamin B12 values in common EU-style ranges", () => {
    const marker = baseMarker({
      marker: "Vitamin B12",
      canonicalMarker: "Vitamin B12",
      value: 430,
      referenceMin: 148,
      referenceMax: 584
    });

    const review = buildMarkerUnitReview(marker, matchMarker(marker.marker));

    expect(review.suggestion?.unit).toBe("pmol/L");
    expect(review.options[0]).toBe("pmol/L");
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

  it("suggests g/dL when albumin has a likely wrong unit based on value", () => {
    const marker = baseMarker({
      marker: "Albumin",
      canonicalMarker: "Albumin",
      value: 3,
      unit: "mg/L",
      referenceMin: null,
      referenceMax: null
    });

    const review = buildMarkerUnitReview(marker, matchMarker(marker.marker));

    expect(review.issueKind).toBe("inferred-mismatch");
    expect(review.hasUnitIssue).toBe(true);
    expect(review.suggestion?.unit).toBe("g/dL");
    expect(review.options[0]).toBe("g/dL");
  });

  it("prefers the visible normalized value over stale raw values for high-confidence suggestions", () => {
    const marker = baseMarker({
      marker: "Albumin",
      canonicalMarker: "Albumin",
      value: 3,
      rawValue: 45,
      unit: "mg/L",
      referenceMin: null,
      referenceMax: null,
      rawReferenceMin: 35,
      rawReferenceMax: 52
    });

    const review = buildMarkerUnitReview(marker, matchMarker(marker.marker));

    expect(review.issueKind).toBe("inferred-mismatch");
    expect(review.suggestion?.unit).toBe("g/dL");
    expect(review.options[0]).toBe("g/dL");
  });

  it("still suggests from value when only one stale reference bound conflicts", () => {
    const marker = baseMarker({
      marker: "Albumin",
      canonicalMarker: "Albumin",
      value: 3,
      unit: "mg/L",
      referenceMin: 35,
      referenceMax: null
    });

    const review = buildMarkerUnitReview(marker, matchMarker(marker.marker));

    expect(review.issueKind).toBe("inferred-mismatch");
    expect(review.suggestion?.unit).toBe("g/dL");
    expect(review.options[0]).toBe("g/dL");
  });

  it("does not suggest a replacement when the current unit already matches", () => {
    const marker = baseMarker({
      marker: "Albumin",
      canonicalMarker: "Albumin",
      value: 3,
      unit: "g/dL",
      referenceMin: null,
      referenceMax: null
    });

    const review = buildMarkerUnitReview(marker, matchMarker(marker.marker));

    expect(review.issueKind).toBe("none");
    expect(review.hasUnitIssue).toBe(false);
    expect(review.suggestion).toBeNull();
  });
});
