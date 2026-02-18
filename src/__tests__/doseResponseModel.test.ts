import { describe, expect, it } from "vitest";
import { DosePrediction, applyDosePriorsToPredictions } from "../analytics";
import { getLocalDosePrior } from "../data/dosePriors";
import { buildDosePriorRequestPayload } from "../doseResponsePriors";

const basePrediction = (overrides: Partial<DosePrediction>): DosePrediction => ({
  marker: "Estradiol",
  unit: "pmol/L",
  slopePerMg: 0.8,
  intercept: 20,
  rSquared: 0.46,
  correlationR: 0.52,
  sampleCount: 5,
  uniqueDoseLevels: 3,
  allSampleCount: 5,
  troughSampleCount: 4,
  currentDose: 120,
  suggestedDose: 100,
  currentEstimate: 135,
  suggestedEstimate: 119,
  predictionSigma: 24,
  predictedLow: 95,
  predictedHigh: 143,
  suggestedPercentChange: -11.9,
  confidence: "Medium",
  status: "clear",
  statusReason: "Clear dose-response relation.",
  samplingMode: "trough",
  samplingWarning: null,
  usedReportDates: ["2025-04-01", "2025-06-01", "2025-08-01"],
  excludedPoints: [],
  modelType: "linear",
  source: "personal",
  relevanceScore: 0,
  whyRelevant: "",
  isApiAssisted: false,
  blendDiagnostics: null,
  scenarios: [
    { dose: 100, estimatedValue: 119 },
    { dose: 120, estimatedValue: 135 }
  ],
  ...overrides
});

describe("dose-response prior blending", () => {
  it("keeps strong personal models as personal", () => {
    const prior = getLocalDosePrior("Estradiol", "eu", "pmol/L");
    expect(prior).not.toBeNull();

    const output = applyDosePriorsToPredictions([basePrediction({})], prior ? [prior] : []);
    expect(output[0]?.source).toBe("personal");
    expect(output[0]?.modelType).toBe("linear");
    expect(output[0]?.isApiAssisted).toBe(false);
  });

  it("blends into hybrid when personal data is weaker but still usable", () => {
    const prior = getLocalDosePrior("Estradiol", "eu", "pmol/L");
    expect(prior).not.toBeNull();
    const weaker = basePrediction({
      sampleCount: 3,
      uniqueDoseLevels: 2,
      correlationR: 0.24,
      status: "unclear",
      statusReason: "Weak relation"
    });

    const output = applyDosePriorsToPredictions([weaker], prior ? [prior] : [], {
      apiAssistedMarkers: new Set(["Estradiol"])
    });
    expect(output[0]?.source).toBe("hybrid");
    expect(output[0]?.modelType).toBe("hybrid");
    expect(output[0]?.predictionSigma).not.toBeNull();
    expect(output[0]?.predictedLow).not.toBeNull();
    expect(output[0]?.predictedHigh).not.toBeNull();
    expect(output[0]?.isApiAssisted).toBe(true);
  });

  it("falls back to study prior when personal signal is insufficient", () => {
    const prior = getLocalDosePrior("Estradiol", "eu", "pmol/L");
    expect(prior).not.toBeNull();
    const sparse = basePrediction({
      sampleCount: 1,
      uniqueDoseLevels: 1,
      correlationR: null,
      status: "insufficient",
      confidence: "Low",
      predictionSigma: null
    });

    const output = applyDosePriorsToPredictions([sparse], prior ? [prior] : []);
    expect(output[0]?.source).toBe("study_prior");
    expect(output[0]?.modelType).toBe("prior");
    expect(output[0]?.confidence).toBe("Low");
    expect((output[0]?.relevanceScore ?? 0) > 0).toBe(true);
  });
});

describe("dose prior request payload", () => {
  it("includes only anonymized modeling context fields", () => {
    const payload = buildDosePriorRequestPayload([basePrediction({})], "eu", ["Estradiol"]);
    expect(payload).toEqual({
      unitSystem: "eu",
      markers: ["Estradiol"],
      context: [
        {
          marker: "Estradiol",
          currentDose: 120,
          sampleCount: 5,
          uniqueDoseLevels: 3,
          correlationR: 0.52,
          samplingModeDistribution: {
            trough: 4,
            mixed: 1
          }
        }
      ]
    });
  });
});
