import { describe, expect, it } from "vitest";
import { getSuggestedAiQuestions } from "../analysisSuggestions";
import { LabReport } from "../types";

const buildReport = ({
  id,
  date,
  hematocrit
}: {
  id: string;
  date: string;
  hematocrit: number;
}): LabReport => ({
  id,
  sourceFileName: `${id}.pdf`,
  testDate: date,
  createdAt: `${date}T10:00:00.000Z`,
  markers: [
    {
      id: `${id}-hct`,
      marker: "Hematocrit",
      canonicalMarker: "Hematocrit",
      value: hematocrit,
      unit: "%",
      referenceMin: 40,
      referenceMax: 52,
      abnormal: hematocrit > 52 ? "high" : "normal",
      confidence: 1
    },
    {
      id: `${id}-t`,
      marker: "Testosterone",
      canonicalMarker: "Testosterone",
      value: 20,
      unit: "nmol/L",
      referenceMin: 8,
      referenceMax: 29,
      abnormal: "normal",
      confidence: 1
    }
  ],
  annotations: {
    protocolId: null,
    protocol: "",
    supplementOverrides: null,
    symptoms: "",
    notes: "",
    samplingTiming: "trough"
  },
  extraction: {
    provider: "fallback",
    model: "fallback",
    confidence: 1,
    needsReview: false
  }
});

describe("getSuggestedAiQuestions", () => {
  it("returns 3-5 deterministic questions with category variety", () => {
    const suggestions = getSuggestedAiQuestions({
      reports: [
        buildReport({ id: "r1", date: "2026-01-01", hematocrit: 48 }),
        buildReport({ id: "r2", date: "2026-02-01", hematocrit: 51 }),
        buildReport({ id: "r3", date: "2026-03-01", hematocrit: 55 })
      ],
      trendByMarker: {
        Hematocrit: {
          marker: "Hematocrit",
          direction: "rising",
          slope: 2,
          stdDev: 1,
          mean: 51,
          explanation: "Rising"
        }
      },
      language: "en",
      userProfile: "trt",
      hasActiveProtocol: true
    });

    expect(suggestions.length).toBeGreaterThanOrEqual(3);
    expect(suggestions.length).toBeLessThanOrEqual(5);
    expect(suggestions.some((item) => item.category === "generic")).toBe(true);
    expect(suggestions.some((item) => item.category === "abnormal")).toBe(true);
    expect(suggestions.some((item) => item.category === "trend")).toBe(true);
    expect(suggestions.some((item) => item.category === "protocol")).toBe(true);
  });

  it("falls back to generic prompts when no clinical signals are present", () => {
    const suggestions = getSuggestedAiQuestions({
      reports: [],
      trendByMarker: {},
      language: "en",
      userProfile: "health",
      hasActiveProtocol: false
    });

    expect(suggestions.length).toBeGreaterThanOrEqual(3);
    expect(suggestions.every((item) => typeof item.question === "string" && item.question.length > 0)).toBe(true);
    expect(suggestions.some((item) => item.category === "generic")).toBe(true);
  });
});
