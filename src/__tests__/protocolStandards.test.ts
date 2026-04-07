import { describe, expect, it } from "vitest";
import {
  compoundsForProtocolStorage,
  normalizeSupplementEntries,
  protocolDoseInputToCanonicalWeeklyDose,
  protocolDosePerAdministrationToWeeklyEquivalent,
  protocolWeeklyDoseToPerAdministrationDose,
  supplementEntriesToText
} from "../protocolStandards";

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

describe("protocolStandards protocol dose conversion", () => {
  it("calculates weekly equivalent from dose per administration and frequency", () => {
    expect(protocolDosePerAdministrationToWeeklyEquivalent("2 mg", "5x_week")).toBe("10 mg/week");
  });

  it("reverse-converts explicit weekly dose for editing when frequency is known", () => {
    expect(protocolWeeklyDoseToPerAdministrationDose("105 mg/week", "2x_week")).toBe("52.5 mg");
  });

  it("supports daily dose conversion to weekly canonical dose", () => {
    expect(protocolDoseInputToCanonicalWeeklyDose("1.5 IU/day", "unknown")).toBe("10.5 IU/week");
  });

  it("returns no helper equivalent when frequency is unknown", () => {
    expect(protocolDosePerAdministrationToWeeklyEquivalent("2 mg", "unknown")).toBeNull();
  });

  it("keeps raw input for unparseable doses during storage normalization", () => {
    const normalized = compoundsForProtocolStorage([
      {
        name: "GHK-CU",
        dose: "two mg",
        doseMg: "two mg",
        frequency: "5x_week",
        route: "SubQ"
      }
    ]);
    expect(normalized[0]).toMatchObject({
      dose: "two mg",
      doseMg: "two mg",
      frequency: "5x_week"
    });
  });
});
