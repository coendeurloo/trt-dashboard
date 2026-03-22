import { describe, expect, it } from "vitest";
import { enforceSingleClinicalLayer } from "../chartHelpers";

describe("enforceSingleClinicalLayer", () => {
  it("keeps only the preferred clinical layer when multiple are enabled", () => {
    const normalized = enforceSingleClinicalLayer(
      {
        showReferenceRanges: true,
        showTrtTargetZone: true,
        showLongevityTargetZone: false
      },
      "showTrtTargetZone"
    );

    expect(normalized).toEqual({
      showReferenceRanges: false,
      showTrtTargetZone: true,
      showLongevityTargetZone: false
    });
  });

  it("keeps existing values when zero or one clinical layers are enabled", () => {
    const unchanged = enforceSingleClinicalLayer({
      showReferenceRanges: false,
      showTrtTargetZone: true,
      showLongevityTargetZone: false
    });

    expect(unchanged).toEqual({
      showReferenceRanges: false,
      showTrtTargetZone: true,
      showLongevityTargetZone: false
    });
  });
});
