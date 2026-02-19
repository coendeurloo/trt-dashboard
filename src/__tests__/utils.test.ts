import { describe, expect, it } from "vitest";
import { deriveAbnormalFlag, safeNumber, sortReportsChronological } from "../utils";
import { LabReport } from "../types";

const mkReport = (id: string, date: string): LabReport => ({
  id,
  sourceFileName: `${id}.pdf`,
  testDate: date,
  createdAt: `${date}T08:00:00.000Z`,
  markers: [
    {
      id: `${id}-m1`,
      marker: "Testosterone",
      canonicalMarker: "Testosterone",
      value: 20,
      unit: "nmol/L",
      referenceMin: 10,
      referenceMax: 30,
      abnormal: "normal",
      confidence: 1,
      source: "measured"
    }
  ],
  annotations: {
    protocolId: null,
    protocol: "2x/week",
    supplementOverrides: null,
    symptoms: "",
    notes: "",
    samplingTiming: "trough"
  },
  extraction: {
    provider: "fallback",
    model: "unit-test",
    confidence: 1,
    needsReview: false
  }
});

describe("utils", () => {
  it("deriveAbnormalFlag handles low/high/normal/unknown", () => {
    expect(deriveAbnormalFlag(9, 10, 30)).toBe("low");
    expect(deriveAbnormalFlag(31, 10, 30)).toBe("high");
    expect(deriveAbnormalFlag(20, 10, 30)).toBe("normal");
    expect(deriveAbnormalFlag(20, null, null)).toBe("unknown");
  });

  it("safeNumber parses and rejects invalid values", () => {
    expect(safeNumber("13,8")).toBe(13.8);
    expect(safeNumber("  -42.5 mg/dL ")).toBe(-42.5);
    expect(safeNumber("abc")).toBeNull();
    expect(safeNumber(undefined)).toBeNull();
  });

  it("sortReportsChronological sorts reports by testDate ascending", () => {
    const sorted = sortReportsChronological([
      mkReport("r3", "2025-12-01"),
      mkReport("r1", "2024-03-19"),
      mkReport("r2", "2025-01-31")
    ]);
    expect(sorted.map((report) => report.id)).toEqual(["r1", "r2", "r3"]);
  });
});
