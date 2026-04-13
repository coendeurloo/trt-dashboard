import { describe, expect, it } from "vitest";
import { scoreMarkerConfidence } from "../utils/markerConfidence";
import { matchMarker } from "../utils/markerMatcher";

describe("markerConfidence", () => {
  it("normalizes unit and proposes deterministic autofixes", () => {
    const matchResult = matchMarker("Leukocytes");
    const confidence = scoreMarkerConfidence(
      {
        name: "Leukocytes",
        value: 6.2,
        unit: "10^9/l",
        referenceMin: null,
        referenceMax: null
      },
      matchResult
    );

    expect(confidence.name).toBe("high");
    expect(confidence.unit).toBe("high");
    expect(confidence.range).toBe("low");
    expect(confidence.autoFix?.unit).toBe("x10^9/L");
    expect(confidence.autoFix?.range).toEqual({ min: 4, max: 10 });
    expect(confidence.autoFixable).toBe(true);
  });

  it("marks parse failures as error", () => {
    const matchResult = matchMarker("Totally Unknown Marker");
    const confidence = scoreMarkerConfidence(
      {
        name: "Totally Unknown Marker",
        value: "not-a-number",
        unit: "mystery",
        referenceMin: null,
        referenceMax: null
      },
      matchResult
    );

    expect(confidence.name).toBe("missing");
    expect(confidence.value).toBe("missing");
    expect(confidence.overall).toBe("error");
    expect(confidence.autoFixable).toBe(false);
  });

  it("treats m2 and m² unit variants as equivalent for eGFR", () => {
    const matchResult = matchMarker("eGFR");
    const confidence = scoreMarkerConfidence(
      {
        name: "eGFR",
        value: 78.4,
        unit: "mL/min/1.73m\u00B2",
        referenceMin: 60,
        referenceMax: null
      },
      matchResult
    );

    expect(confidence.name).toBe("high");
    expect(confidence.unit).toBe("high");
    expect(confidence.overall).toBe("ok");
  });

  it("does not flag cosmetic unit casing normalization like /nl to /nL", () => {
    const matchResult = matchMarker("Leukocytes");
    const confidence = scoreMarkerConfidence(
      {
        name: "Leukocytes",
        value: 6.7,
        unit: "/nl",
        referenceMin: 4.2,
        referenceMax: 9.1
      },
      matchResult
    );

    expect(confidence.autoFix?.unit).toBe("/nL");
    expect(confidence.issues.some((issue) => /Unit normalized from/i.test(issue))).toBe(false);
  });

  it("treats /nL and /pL as valid count-unit equivalents for blood cell markers", () => {
    const leukocyteMatch = matchMarker("Leukocytes");
    const leukocyteConfidence = scoreMarkerConfidence(
      {
        name: "Leukocytes",
        value: 6.7,
        unit: "/nL",
        referenceMin: 4.2,
        referenceMax: 9.1
      },
      leukocyteMatch
    );

    const erythrocyteMatch = matchMarker("Erythrocytes");
    const erythrocyteConfidence = scoreMarkerConfidence(
      {
        name: "Erythrocytes",
        value: 5.8,
        unit: "/pL",
        referenceMin: 4.6,
        referenceMax: 6.1
      },
      erythrocyteMatch
    );

    expect(leukocyteConfidence.unit).toBe("high");
    expect(leukocyteConfidence.issues.some((issue) => /not recognized/i.test(issue))).toBe(false);
    expect(erythrocyteConfidence.unit).toBe("high");
    expect(erythrocyteConfidence.issues.some((issue) => /not recognized/i.test(issue))).toBe(false);
  });

  it("recognizes common unit variants like μg/dL and eGFR shorthand denominator", () => {
    const dheaMatch = matchMarker("DHEA-S");
    const dheaConfidence = scoreMarkerConfidence(
      {
        name: "DHEA-S",
        value: 340.1,
        unit: "\u03BCg/dL",
        referenceMin: 34.5,
        referenceMax: 568.9
      },
      dheaMatch
    );

    const egfrMatch = matchMarker("eGFR");
    const egfrConfidence = scoreMarkerConfidence(
      {
        name: "eGFR",
        value: 83,
        unit: "ml/min/1.73",
        referenceMin: 60,
        referenceMax: null
      },
      egfrMatch
    );

    expect(dheaConfidence.unit).toBe("medium");
    expect(dheaConfidence.issues.some((issue) => /not recognized|unknown/i.test(issue))).toBe(false);
    expect(egfrConfidence.unit).toBe("high");
    expect(egfrConfidence.issues.some((issue) => /not recognized|unknown/i.test(issue))).toBe(false);
  });

  it("accepts mEq/L as a known alternative for electrolyte markers", () => {
    const sodiumConfidence = scoreMarkerConfidence(
      {
        name: "Sodium",
        value: 140,
        unit: "mEq/L",
        referenceMin: 135,
        referenceMax: 148
      },
      matchMarker("Sodium")
    );

    expect(sodiumConfidence.unit).toBe("medium");
    expect(sodiumConfidence.issues.some((issue) => /unknown|not recognized/i.test(issue))).toBe(false);
    expect(sodiumConfidence.issues.some((issue) => /valid but not preferred/i.test(issue))).toBe(true);
  });

  it("recognizes Thousand/uL and Million/uL style CBC units", () => {
    const leukocyteConfidence = scoreMarkerConfidence(
      {
        name: "Leukocytes",
        value: 7.8,
        unit: "Thousand/uL",
        referenceMin: 3.8,
        referenceMax: 10.8
      },
      matchMarker("Leukocytes")
    );

    const erythrocyteConfidence = scoreMarkerConfidence(
      {
        name: "Erythrocytes",
        value: 5.6,
        unit: "Million/uL",
        referenceMin: 4.2,
        referenceMax: 5.8
      },
      matchMarker("Erythrocytes")
    );

    expect(leukocyteConfidence.unit).toBe("high");
    expect(leukocyteConfidence.issues.some((issue) => /not recognized|unknown/i.test(issue))).toBe(false);
    expect(erythrocyteConfidence.unit).toBe("high");
    expect(erythrocyteConfidence.issues.some((issue) => /not recognized|unknown/i.test(issue))).toBe(false);
  });

  it("recognizes K/uL and M/uL aliases for CBC units", () => {
    const plateletConfidence = scoreMarkerConfidence(
      {
        name: "Platelets",
        value: 259,
        unit: "K/uL",
        referenceMin: 140,
        referenceMax: 400
      },
      matchMarker("Platelets")
    );

    const erythrocyteConfidence = scoreMarkerConfidence(
      {
        name: "Erythrocytes",
        value: 5.3,
        unit: "M/uL",
        referenceMin: 4.2,
        referenceMax: 5.8
      },
      matchMarker("Erythrocytes")
    );

    expect(plateletConfidence.unit).toBe("high");
    expect(erythrocyteConfidence.unit).toBe("high");
  });

  it("accepts cells/uL for absolute differential markers", () => {
    const confidence = scoreMarkerConfidence(
      {
        name: "Lymphocytes Abs.",
        value: 3097,
        unit: "cells/uL",
        referenceMin: 850,
        referenceMax: 3900
      },
      matchMarker("Lymphocytes Abs.")
    );

    expect(confidence.unit).toBe("medium");
    expect(confidence.issues.some((issue) => /not recognized|unknown/i.test(issue))).toBe(false);
    expect(confidence.issues.some((issue) => /valid but not preferred/i.test(issue))).toBe(true);
  });

  it("treats 'index' and 'ratio' as equivalent dimensionless units for index markers", () => {
    const faiConfidence = scoreMarkerConfidence(
      {
        name: "Free Androgen Index",
        value: 61.42,
        unit: "index",
        referenceMin: null,
        referenceMax: null
      },
      matchMarker("Free Androgen Index")
    );

    const homaConfidence = scoreMarkerConfidence(
      {
        name: "HOMA-IR",
        value: 1.45,
        unit: "ratio",
        referenceMin: null,
        referenceMax: null
      },
      matchMarker("HOMA-IR")
    );

    expect(faiConfidence.unit).toBe("high");
    expect(homaConfidence.unit).toBe("high");
    expect(faiConfidence.issues.some((issue) => /not recognized/i.test(issue))).toBe(false);
    expect(homaConfidence.issues.some((issue) => /not recognized/i.test(issue))).toBe(false);
  });

  it("allows missing unit for dimensionless score markers like IGF-1 SDS", () => {
    const confidence = scoreMarkerConfidence(
      {
        name: "IGF-1 SDS",
        value: 0.7,
        unit: "",
        referenceMin: null,
        referenceMax: null
      },
      matchMarker("IGF-1 SDS")
    );

    expect(confidence.unit).toBe("high");
    expect(confidence.range).toBe("low");
    expect(confidence.issues.some((issue) => /unit is missing/i.test(issue))).toBe(false);
    expect(confidence.overall).toBe("ok");
  });

  it("accepts mU/L for insulin without a not-recognized warning", () => {
    const confidence = scoreMarkerConfidence(
      {
        name: "Insulin",
        value: 7,
        unit: "mU/L",
        referenceMin: 3,
        referenceMax: 25
      },
      matchMarker("Insulin")
    );

    expect(confidence.unit).toBe("medium");
    expect(confidence.issues.some((issue) => /not recognized|unknown/i.test(issue))).toBe(false);
  });

  it("accepts U/L for FSH and LH without a not-recognized warning", () => {
    const fshConfidence = scoreMarkerConfidence(
      {
        name: "FSH",
        value: 0.3,
        unit: "U/L",
        referenceMin: 1.4,
        referenceMax: 18.1
      },
      matchMarker("FSH")
    );
    const lhConfidence = scoreMarkerConfidence(
      {
        name: "LH",
        value: 0.1,
        unit: "U/L",
        referenceMin: 1.0,
        referenceMax: 9.0
      },
      matchMarker("LH")
    );

    expect(fshConfidence.unit).toBe("medium");
    expect(lhConfidence.unit).toBe("medium");
    expect(fshConfidence.issues.some((issue) => /not recognized|unknown/i.test(issue))).toBe(false);
    expect(lhConfidence.issues.some((issue) => /not recognized|unknown/i.test(issue))).toBe(false);
  });

  it("accepts ng/mL for Vitamin D aliases without approximate-name or unit errors", () => {
    const confidence = scoreMarkerConfidence(
      {
        name: "Vitamin D (D3+D2) OH",
        value: 60.1,
        unit: "ng/mL",
        referenceMin: 30,
        referenceMax: 100
      },
      matchMarker("Vitamin D (D3+D2) OH")
    );

    expect(confidence.name).toBe("high");
    expect(confidence.issues.some((issue) => /matched approximately/i.test(issue))).toBe(false);
    expect(confidence.issues.some((issue) => /not recognized|unknown/i.test(issue))).toBe(false);
  });

  it("keeps platelet count with fL under review instead of accepting it", () => {
    const confidence = scoreMarkerConfidence(
      {
        name: "Platelets",
        value: 11.3,
        unit: "fL",
        referenceMin: 9.3,
        referenceMax: 16.7
      },
      matchMarker("Platelets")
    );

    expect(confidence.unit).toBe("low");
    expect(confidence.issues.some((issue) => /not recognized/i.test(issue))).toBe(true);
  });
});
