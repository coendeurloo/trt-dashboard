import { describe, expect, it } from "vitest";
import { detectMarkerMergeSuggestions } from "../hooks/useAppData";
import { canMergeMarkersBySpecimen, inferSpecimenFromCanonicalMarker } from "../markerSpecimen";

describe("marker specimen safety", () => {
  it("treats non-urine markers as blood by default", () => {
    expect(inferSpecimenFromCanonicalMarker("Albumine")).toBe("blood");
    expect(inferSpecimenFromCanonicalMarker("Creatinine")).toBe("blood");
  });

  it("detects urine markers from canonical name", () => {
    expect(inferSpecimenFromCanonicalMarker("Albumine Urine")).toBe("urine");
    expect(inferSpecimenFromCanonicalMarker("Creatinine Urine")).toBe("urine");
  });

  it("blocks cross-specimen merges", () => {
    expect(canMergeMarkersBySpecimen("Albumine Urine", "Albumine")).toBe(false);
    expect(canMergeMarkersBySpecimen("Creatinine", "Creatinine Urine")).toBe(false);
  });

  it("filters import merge suggestions across specimen types", () => {
    const suggestions = detectMarkerMergeSuggestions(["Albumine Urine"], ["Albumine"]);
    expect(suggestions).toEqual([]);
  });
});
