import { describe, expect, it } from "vitest";
import { getMarkerDisplayName, getMarkerMeta } from "../i18n";

describe("i18n marker meta", () => {
  it("resolves IGF-1 tooltip content for canonical and somatomedine alias names", () => {
    const canonicalMeta = getMarkerMeta("IGF-1", "en");
    const aliasMeta = getMarkerMeta("IGF-1 (somatomedine C)", "en");

    expect(canonicalMeta.title).toBe("IGF-1");
    expect(canonicalMeta.what).toContain("Insulin-like Growth Factor 1");

    expect(aliasMeta.title).toBe("IGF-1");
    expect(aliasMeta.why).toContain("GH");
    expect(getMarkerDisplayName("IGF-1 (somatomedine C)", "nl")).toBe("IGF-1");
  });

  it("resolves IGF-1 SDS tooltip content", () => {
    const meta = getMarkerMeta("IGF-1 SDS", "nl");
    expect(meta.title).toBe("IGF-1 SDS");
    expect(meta.what.toLowerCase()).toContain("z-score");
  });

  it("resolves detailed tooltip content for Latvian report platelet and hormone markers", () => {
    const pdw = getMarkerMeta("PDW", "en");
    const plateletcrit = getMarkerMeta("PCT-plateletcrit", "en");
    const fsh = getMarkerMeta("FSH", "en");
    const lh = getMarkerMeta("LH", "en");
    const prolactin = getMarkerMeta("Prolactin", "en");
    const cortisol = getMarkerMeta("Cortisol", "en");

    expect(pdw.what).not.toContain("No detailed description");
    expect(pdw.why).toContain("platelet");
    expect(plateletcrit.what).toContain("platelet");
    expect(fsh.why).toContain("pituitary");
    expect(lh.why).toContain("FSH");
    expect(prolactin.what).toContain("Pituitary");
    expect(cortisol.what).toContain("stress hormone");
  });
});
