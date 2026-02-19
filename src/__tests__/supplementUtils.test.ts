import { describe, expect, it } from "vitest";
import { LabReport, SupplementPeriod } from "../types";
import { getActiveSupplementsAtDate, getEffectiveSupplements, supplementPeriodsToText } from "../supplementUtils";

const timeline: SupplementPeriod[] = [
  {
    id: "s1",
    name: "Vitamin D3",
    dose: "4000 IU",
    frequency: "daily",
    startDate: "2025-01-01",
    endDate: null
  },
  {
    id: "s2",
    name: "Zinc",
    dose: "25 mg",
    frequency: "daily",
    startDate: "2025-01-15",
    endDate: "2025-03-01"
  }
];

const mkReport = (date: string, overrides: SupplementPeriod[] | null = null): LabReport => ({
  id: `r-${date}`,
  sourceFileName: "test.pdf",
  testDate: date,
  createdAt: `${date}T08:00:00.000Z`,
  markers: [],
  annotations: {
    protocolId: null,
    protocol: "",
    supplementOverrides: overrides,
    symptoms: "",
    notes: "",
    samplingTiming: "unknown"
  },
  extraction: {
    provider: "fallback",
    model: "unit-test",
    confidence: 1,
    needsReview: false
  }
});

describe("supplement utils", () => {
  it("matches active supplements on date boundaries", () => {
    expect(getActiveSupplementsAtDate(timeline, "2025-01-01").map((item) => item.name)).toEqual(["Vitamin D3"]);
    expect(getActiveSupplementsAtDate(timeline, "2025-02-01").map((item) => item.name)).toEqual(["Vitamin D3", "Zinc"]);
    expect(getActiveSupplementsAtDate(timeline, "2025-03-02").map((item) => item.name)).toEqual(["Vitamin D3"]);
  });

  it("uses report overrides over timeline auto-match", () => {
    const override: SupplementPeriod[] = [
      {
        id: "o1",
        name: "NAC",
        dose: "600 mg",
        frequency: "daily",
        startDate: "2025-02-01",
        endDate: "2025-02-01"
      }
    ];
    const report = mkReport("2025-02-10", override);
    expect(getEffectiveSupplements(report, timeline).map((item) => item.name)).toEqual(["NAC"]);
  });

  it("formats supplement text as readable stack string", () => {
    const report = mkReport("2025-02-10");
    const text = supplementPeriodsToText(getEffectiveSupplements(report, timeline));
    expect(text).toContain("Vitamin D3");
    expect(text).toContain("Zinc");
  });
});
