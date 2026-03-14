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
});
