import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getMarkerAliasOverrides,
  normalizeMarkerAliasOverrides,
  resolveCanonicalMarker,
  setMarkerAliasOverrides
} from "../markerNormalization";

describe("markerNormalization", () => {
  beforeEach(() => {
    setMarkerAliasOverrides({});
  });

  afterEach(() => {
    setMarkerAliasOverrides({});
  });

  it("maps key marker variants to the same canonical marker", () => {
    expect(resolveCanonicalMarker({ rawName: "Sex Hormone Binding Globulin" }).canonicalMarker).toBe("SHBG");
    expect(resolveCanonicalMarker({ rawName: "Sex Hormone Binding Glob, Serum" }).canonicalMarker).toBe("SHBG");
    expect(resolveCanonicalMarker({ rawName: "Cortisol AM Cortisol" }).canonicalMarker).toBe("Cortisol");
    expect(resolveCanonicalMarker({ rawName: "Testosterone, Free and Total" }).canonicalMarker).toBe("Testosterone");
    expect(resolveCanonicalMarker({ rawName: "free testosterone calculated" }).canonicalMarker).toBe("Free Testosterone");
  });

  it("rejects narrative noise as Unknown Marker", () => {
    const narrative = resolveCanonicalMarker({ rawName: "for intermediate and high risk individuals is" });
    const crpGuidance = resolveCanonicalMarker({ rawName: "CRP method is sensitive to" });

    expect(narrative.canonicalMarker).toBe("Unknown Marker");
    expect(narrative.method).toBe("unknown");
    expect(crpGuidance.canonicalMarker).toBe("Unknown Marker");
    expect(crpGuidance.method).toBe("unknown");
  });

  it("prioritizes local overrides over alias matching", () => {
    setMarkerAliasOverrides({
      "sex hormone binding globulin": "testosterone"
    });

    const resolved = resolveCanonicalMarker({ rawName: "Sex Hormone Binding Globulin" });

    expect(getMarkerAliasOverrides()).toEqual({
      "sex hormone binding globulin": "Testosterone"
    });
    expect(resolved.canonicalMarker).toBe("Testosterone");
    expect(resolved.method).toBe("override");
    expect(resolved.confidence).toBe(1);
  });

  it("normalizes override payload keys and values", () => {
    const normalized = normalizeMarkerAliasOverrides({
      "  My Lab Total T  ": "testosterone",
      broken: "Unknown Marker",
      "": "Free Testosterone"
    });

    expect(normalized).toEqual({
      "my lab total t": "Testosterone"
    });
  });
});
