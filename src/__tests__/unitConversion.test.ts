import { describe, expect, it } from "vitest";
import { canonicalizeMarker, convertBySystem, normalizeMarkerMeasurement } from "../unitConversion";

describe("unitConversion", () => {
  it("canonicalizeMarker resolves NL/EN aliases", () => {
    expect(canonicalizeMarker("hematocriet")).toBe("Hematocrit");
    expect(canonicalizeMarker("Hemoglobin")).toBe("Hemoglobin");
    expect(canonicalizeMarker("glucose nuchter")).toBe("Glucose Nuchter");
    expect(canonicalizeMarker("testosteron, vrij (volgens ISSAM)")).toBe("Free Testosterone");
    expect(canonicalizeMarker("Testosterone, Free+Total LC/MS")).toBe("Testosterone");
    expect(canonicalizeMarker("Testosterone (Direct)")).toBe("Free Testosterone");
    expect(canonicalizeMarker("Sex Horm Binding Glob, Serum")).toBe("SHBG");
    expect(canonicalizeMarker("Bioavailable Testosterone")).toBe("Bioavailable Testosterone");
    expect(canonicalizeMarker("Cortisol (AM)")).toBe("Cortisol");
  });

  it("convertBySystem converts key markers EU<->US", () => {
    const tUs = convertBySystem("Testosterone", 30, "nmol/L", "us");
    expect(tUs.unit).toBe("ng/dL");
    expect(tUs.value).toBeCloseTo(865.2, 1);

    const e2Us = convertBySystem("Estradiol", 100, "pmol/L", "us");
    expect(e2Us.unit).toBe("pg/mL");
    expect(e2Us.value).toBeCloseTo(27.24, 2);

    const glucoseEu = convertBySystem("Glucose", 90, "mg/dL", "eu");
    expect(glucoseEu.value).toBe(90);
    expect(glucoseEu.unit).toBe("mg/dL");
  });

  it("normalizeMarkerMeasurement handles hematocrit ratio and testosterone ng/mL", () => {
    const hct = normalizeMarkerMeasurement({
      canonicalMarker: "Hematocrit",
      value: 0.52,
      unit: "l/l",
      referenceMin: 0.4,
      referenceMax: 0.52
    });

    expect(hct.value).toBe(52);
    expect(hct.unit).toBe("%");
    expect(hct.referenceMin).toBe(40);
    expect(hct.referenceMax).toBe(52);

    const totalT = normalizeMarkerMeasurement({
      canonicalMarker: "Testosterone",
      value: 9,
      unit: "ng/mL",
      referenceMin: 3,
      referenceMax: 10
    });

    expect(totalT.unit).toBe("nmol/L");
    expect(totalT.value).toBeCloseTo(31.2, 1);
  });

  it("rounds normalized values and references to max 3 decimals for storage", () => {
    const rounded = normalizeMarkerMeasurement({
      canonicalMarker: "Free Testosterone",
      value: 0.41200000000000003,
      unit: "nmol/L",
      referenceMin: 0.11500000000000002,
      referenceMax: 0.5770000000000001
    });

    expect(rounded.value).toBe(0.412);
    expect(rounded.referenceMin).toBe(0.115);
    expect(rounded.referenceMax).toBe(0.577);
  });
});
