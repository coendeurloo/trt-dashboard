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
        unit: "mL/min/1.73m²",
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
});
