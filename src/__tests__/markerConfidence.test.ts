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
});
