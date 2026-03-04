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
});
