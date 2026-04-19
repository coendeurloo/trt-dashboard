/* @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../constants";
import useAnalysis from "../hooks/useAnalysis";
import { LabReport } from "../types";

const analyzeLabDataWithClaudeMock = vi.fn();

vi.mock("../aiAnalysis", () => ({
  analyzeLabDataWithClaude: analyzeLabDataWithClaudeMock,
  generateAnalystMemory: vi.fn(async () => null)
}));

vi.mock("../betaLimits", () => ({
  BETA_LIMITS: { maxAnalysesPerDay: 5, maxAnalysesPerMonth: 25 },
  checkBetaLimit: vi.fn(() => ({ allowed: true })),
  getRemainingAnalyses: vi.fn(() => 5),
  getUsage: vi.fn(() => ({ dailyCount: 0, monthlyCount: 0 })),
  recordAnalysisUsage: vi.fn(),
  betaLimitsDisabled: vi.fn(() => false)
}));

const sampleReport: LabReport = {
  id: "r1",
  sourceFileName: "report.pdf",
  testDate: "2026-01-21",
  createdAt: "2026-01-21T10:00:00.000Z",
  markers: [
    {
      id: "m1",
      marker: "Testosterone",
      canonicalMarker: "Testosterone",
      value: 20.7,
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
    confidence: 0.9,
    needsReview: false
  }
};

describe("useAnalysis personal context forwarding", () => {
  beforeEach(() => {
    analyzeLabDataWithClaudeMock.mockReset();
  });

  it("passes personalInfo into analyzeLabDataWithClaude for AI calls", async () => {
    analyzeLabDataWithClaudeMock.mockResolvedValue({
      text: "ok",
      provider: "claude",
      model: "claude-sonnet-4-20250514",
      fallbackUsed: false,
      actionsNeeded: false,
      actionReasons: [],
      actionConfidence: "low",
      supplementActionsNeeded: false,
      supplementAdviceIncluded: false,
      qualityGuardApplied: false,
      qualityIssues: []
    });

    const personalInfo = {
      name: "Coen",
      dateOfBirth: "1990-05-10",
      biologicalSex: "male" as const,
      heightCm: 183,
      weightKg: 82
    };

    const { result } = renderHook(() =>
      useAnalysis({
        settings: { ...DEFAULT_SETTINGS, aiExternalConsent: true },
        language: "en",
        allReports: [sampleReport],
        visibleReports: [sampleReport],
        personalInfo,
        checkIns: [],
        protocols: [],
        supplementTimeline: [],
        samplingControlsEnabled: true,
        protocolImpactSummary: { events: [], insights: [] },
        alerts: [],
        trendByMarker: {},
        trtStability: { score: null, components: {} },
        dosePredictions: [],
        mapErrorToMessage: () => "error",
        tr: (_nl: string, en: string) => en
      })
    );

    await act(async () => {
      await result.current.runAiAnalysis("full");
    });

    expect(analyzeLabDataWithClaudeMock).toHaveBeenCalledTimes(1);
    expect(analyzeLabDataWithClaudeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        personalInfo: expect.objectContaining({
          dateOfBirth: "1990-05-10",
          heightCm: 183,
          weightKg: 82
        })
      })
    );
  });

  it("forwards explicit consent fields for external AI and context sharing", async () => {
    analyzeLabDataWithClaudeMock.mockResolvedValue({
      text: "ok",
      provider: "claude",
      model: "claude-sonnet-4-20250514",
      fallbackUsed: false,
      actionsNeeded: false,
      actionReasons: [],
      actionConfidence: "low",
      supplementActionsNeeded: false,
      supplementAdviceIncluded: false,
      qualityGuardApplied: false,
      qualityIssues: []
    });

    const { result } = renderHook(() =>
      useAnalysis({
        settings: { ...DEFAULT_SETTINGS, aiExternalConsent: false },
        language: "en",
        allReports: [sampleReport],
        visibleReports: [sampleReport],
        personalInfo: {
          name: "",
          dateOfBirth: "",
          biologicalSex: "prefer_not_to_say",
          heightCm: null,
          weightKg: null
        },
        checkIns: [],
        protocols: [],
        supplementTimeline: [],
        samplingControlsEnabled: true,
        protocolImpactSummary: { events: [], insights: [] },
        alerts: [],
        trendByMarker: {},
        trtStability: { score: null, components: {} },
        dosePredictions: [],
        mapErrorToMessage: () => "error",
        tr: (_nl: string, en: string) => en
      })
    );

    await act(async () => {
      await result.current.runAiQuestion("What stands out?", {
        action: "analysis",
        scope: "once",
        allowExternalAi: true,
        parserRescueEnabled: false,
        includeSymptoms: true,
        includeNotes: true,
        allowPdfAttachment: false
      });
    });

    expect(analyzeLabDataWithClaudeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        externalAiAllowed: true,
        aiConsent: expect.objectContaining({
          includeSymptoms: true,
          includeNotes: true
        })
      })
    );
  });
});
