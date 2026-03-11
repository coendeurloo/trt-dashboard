import { describe, expect, it } from "vitest";
import {
  buildRememberedParserRescueConsent,
  isSevereParserExtraction,
  resolveParserRescueAction,
  resolveUploadTriggerAction,
  shouldPresentUploadAsNeedsReview,
  shouldOfferParserImprovementSubmission,
  shouldAutoApplyAiRescueResult
} from "../uploadFlow";
import { ExtractionDraft, ParserUncertaintyAssessment } from "../types";

const makeDraft = (params: {
  markerCount: number;
  confidence: number;
  criticalMarkers?: string[];
}): ExtractionDraft => {
  const criticalMarkers = params.criticalMarkers ?? [];
  const generatedMarkers = Array.from({ length: params.markerCount }, (_, index) => {
    const canonicalMarker = criticalMarkers[index] ?? `Marker ${index}`;
    return {
      id: `m-${index}`,
      marker: canonicalMarker,
      canonicalMarker,
      value: 10 + index,
      unit: "nmol/L",
      referenceMin: null,
      referenceMax: null,
      abnormal: "normal" as const,
      confidence: params.confidence
    };
  });

  return {
    sourceFileName: "unit-test.pdf",
    testDate: "2026-03-01",
    markers: generatedMarkers,
    extraction: {
      provider: "fallback",
      model: "fallback-test",
      confidence: params.confidence,
      needsReview: false
    }
  };
};

const makeAssessment = (input: Partial<ParserUncertaintyAssessment>): ParserUncertaintyAssessment => ({
  isUncertain: Boolean(input.isUncertain),
  reasons: input.reasons ?? [],
  markerCount: input.markerCount ?? 0,
  confidence: input.confidence ?? 0,
  unitCoverage: input.unitCoverage ?? 0,
  warnings: input.warnings ?? []
});

describe("uploadFlow.resolveUploadTriggerAction", () => {
  it("returns fallback picker action when no upload panel exists and app is idle", () => {
    const action = resolveUploadTriggerAction({
      isShareMode: false,
      hasUploadPanel: false,
      isProcessing: false
    });
    expect(action).toBe("open-hidden-picker");
  });

  it("returns scroll action when upload panel is present", () => {
    const action = resolveUploadTriggerAction({
      isShareMode: false,
      hasUploadPanel: true,
      isProcessing: false
    });
    expect(action).toBe("scroll-to-panel");
  });

  it("returns noop in share mode or while processing", () => {
    expect(
      resolveUploadTriggerAction({
        isShareMode: true,
        hasUploadPanel: false,
        isProcessing: false
      })
    ).toBe("noop");
    expect(
      resolveUploadTriggerAction({
        isShareMode: false,
        hasUploadPanel: false,
        isProcessing: true
      })
    ).toBe("noop");
  });
});

describe("uploadFlow severe trigger", () => {
  it("marks extraction as severe for required warning reasons", () => {
    const severe = isSevereParserExtraction(
      makeAssessment({
        markerCount: 8,
        confidence: 0.8,
        reasons: ["warning_text_layer_empty"],
        warnings: []
      })
    );

    expect(severe).toBe(true);
  });

  it("marks extraction as severe when warning code is present", () => {
    const severe = isSevereParserExtraction(
      makeAssessment({
        markerCount: 8,
        confidence: 0.8,
        warnings: ["PDF_TEXT_LAYER_EMPTY"]
      })
    );

    expect(severe).toBe(true);
  });

  it("marks extraction as severe for low marker count or very low confidence", () => {
    expect(
      isSevereParserExtraction(
        makeAssessment({
          markerCount: 3,
          confidence: 0.9,
          warnings: []
        })
      )
    ).toBe(true);

    expect(
      isSevereParserExtraction(
        makeAssessment({
          markerCount: 10,
          confidence: 0.54,
          warnings: []
        })
      )
    ).toBe(true);
  });

  it("does not mark mild uncertainty as severe", () => {
    const severe = isSevereParserExtraction(
      makeAssessment({
        markerCount: 8,
        confidence: 0.7,
        reasons: ["confidence_and_unit_coverage_low"],
        warnings: ["PDF_LOW_CONFIDENCE_LOCAL"]
      })
    );

    expect(severe).toBe(false);
  });

  it("reuses the severe trigger for parser-improvement submissions", () => {
    const assessment = makeAssessment({
      markerCount: 3,
      confidence: 0.9,
      warnings: []
    });

    expect(shouldOfferParserImprovementSubmission(assessment)).toBe(true);
    expect(shouldOfferParserImprovementSubmission(assessment)).toBe(isSevereParserExtraction(assessment));
  });

  it("presents sparse uncertain uploads as needs review even above the raw confidence threshold", () => {
    const draft = makeDraft({
      markerCount: 2,
      confidence: 0.76
    });
    const assessment = makeAssessment({
      isUncertain: true,
      markerCount: 2,
      confidence: 0.76,
      reasons: ["marker_count_low"],
      warnings: []
    });

    expect(
      shouldPresentUploadAsNeedsReview({
        draft,
        assessment
      })
    ).toBe(true);
  });
});

describe("uploadFlow parser rescue routing", () => {
  it("routes good local extraction to local-only", () => {
    const action = resolveParserRescueAction({
      isSevere: false,
      consentState: "unset"
    });

    expect(action).toBe("local_only");
  });

  it("routes severe extraction with unset consent to consent prompt", () => {
    const action = resolveParserRescueAction({
      isSevere: true,
      consentState: "unset"
    });

    expect(action).toBe("prompt_consent");
  });

  it("routes severe extraction with allowed consent to AI run", () => {
    const action = resolveParserRescueAction({
      isSevere: true,
      consentState: "allowed"
    });

    expect(action).toBe("run_ai");
  });

  it("routes severe extraction with denied consent to local keep", () => {
    const action = resolveParserRescueAction({
      isSevere: true,
      consentState: "denied"
    });

    expect(action).toBe("keep_local_denied");
  });

  it("builds remembered consent with PDF attachment policy", () => {
    const consent = buildRememberedParserRescueConsent(true);

    expect(consent.allowExternalAi).toBe(true);
    expect(consent.parserRescueEnabled).toBe(true);
    expect(consent.allowPdfAttachment).toBe(true);
    expect(consent.scope).toBe("always");
  });
});

describe("uploadFlow auto-apply comparator", () => {
  it("applies AI when critical marker coverage increases", () => {
    const localDraft = makeDraft({
      markerCount: 4,
      confidence: 0.58,
      criticalMarkers: ["Testosterone"]
    });
    const aiDraft = makeDraft({
      markerCount: 5,
      confidence: 0.6,
      criticalMarkers: ["Testosterone", "Estradiol"]
    });

    const decision = shouldAutoApplyAiRescueResult(localDraft, aiDraft);

    expect(decision.shouldApplyAi).toBe(true);
    expect(decision.reason).toBe("critical_coverage_up");
  });

  it("applies AI when marker count increases by at least two without clear confidence loss", () => {
    const localDraft = makeDraft({ markerCount: 5, confidence: 0.66 });
    const aiDraft = makeDraft({ markerCount: 7, confidence: 0.63 });

    const decision = shouldAutoApplyAiRescueResult(localDraft, aiDraft);

    expect(decision.shouldApplyAi).toBe(true);
    expect(decision.reason).toBe("marker_count_up");
  });

  it("applies AI when confidence improves by at least 0.08 with no marker loss", () => {
    const localDraft = makeDraft({ markerCount: 6, confidence: 0.5 });
    const aiDraft = makeDraft({ markerCount: 6, confidence: 0.6 });

    const decision = shouldAutoApplyAiRescueResult(localDraft, aiDraft);

    expect(decision.shouldApplyAi).toBe(true);
    expect(decision.reason).toBe("confidence_up");
  });

  it("keeps local result when marker gain comes with clear confidence drop", () => {
    const localDraft = makeDraft({ markerCount: 5, confidence: 0.72 });
    const aiDraft = makeDraft({ markerCount: 7, confidence: 0.6 });

    const decision = shouldAutoApplyAiRescueResult(localDraft, aiDraft);

    expect(decision.shouldApplyAi).toBe(false);
    expect(decision.reason).toBe("not_better");
  });

  it("keeps local result when AI is not clearly better", () => {
    const localDraft = makeDraft({ markerCount: 8, confidence: 0.68 });
    const aiDraft = makeDraft({ markerCount: 8, confidence: 0.69 });

    const decision = shouldAutoApplyAiRescueResult(localDraft, aiDraft);

    expect(decision.shouldApplyAi).toBe(false);
    expect(decision.reason).toBe("not_better");
  });
});
