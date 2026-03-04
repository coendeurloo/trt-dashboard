import { describe, expect, it } from "vitest";
import { matchMarker } from "../utils/markerMatcher";

describe("markerMatcher", () => {
  it("matches exact canonical names first", () => {
    const result = matchMarker("TSH");
    expect(result.confidence).toBe("exact");
    expect(result.canonical?.id).toBe("tsh");
    expect(result.score).toBe(1);
  });

  it("matches aliases and token overlap", () => {
    const aliasResult = matchMarker("thyroid stimulating hormone");
    expect(aliasResult.confidence).toBe("alias");
    expect(aliasResult.canonical?.id).toBe("tsh");

    const tokenResult = matchMarker("absolute eosinophils count");
    expect(["token", "normalized", "alias"]).toContain(tokenResult.confidence);
    expect(tokenResult.canonical?.id).toBe("eosinophils-abs");
  });

  it("falls back to fuzzy when typo is close enough", () => {
    const result = matchMarker("ferritne");
    expect(["fuzzy", "alias", "normalized"]).toContain(result.confidence);
    expect(result.canonical?.id).toBe("ferritin");
  });

  it("returns unmatched when no candidate passes thresholds", () => {
    const result = matchMarker("completely made up marker name");
    expect(result.confidence).toBe("unmatched");
    expect(result.canonical).toBeNull();
    expect(result.score).toBe(0);
  });
});
