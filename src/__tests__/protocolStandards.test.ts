import { describe, expect, it } from "vitest";
import { normalizeSupplementEntries, supplementEntriesToText } from "../protocolStandards";

describe("protocolStandards supplement frequency", () => {
  it("normalizes supplement frequency from entry objects", () => {
    const normalized = normalizeSupplementEntries(
      [
        { name: "Vitamin D", dose: "4000 IU", frequency: "daily" },
        { name: "Omega-3", dose: "2 g", frequency: "2x per day" }
      ],
      ""
    );

    expect(normalized).toEqual([
      { name: "Vitamin D3", dose: "4000 IU", frequency: "daily" },
      { name: "Omega-3", dose: "2 g", frequency: "twice_daily" }
    ]);
  });

  it("parses frequency from fallback text and keeps unknown when missing", () => {
    const parsed = normalizeSupplementEntries(undefined, "Vitamin D3 4000 IU @ daily, Magnesium Glycinate 400 mg");
    expect(parsed).toEqual([
      { name: "Vitamin D3", dose: "4000 IU", frequency: "daily" },
      { name: "Magnesium Glycinate", dose: "400 mg", frequency: "unknown" }
    ]);
  });

  it("serializes supplements with frequency for analysis context", () => {
    const text = supplementEntriesToText([
      { name: "Vitamin D3", dose: "4000 IU", frequency: "daily" },
      { name: "Magnesium Glycinate", dose: "400 mg", frequency: "before_bed" },
      { name: "NAC", dose: "600 mg", frequency: "unknown" }
    ]);

    expect(text).toBe("Vitamin D3 4000 IU @ Daily, Magnesium Glycinate 400 mg @ Before bed, NAC 600 mg");
  });
});
