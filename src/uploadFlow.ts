import {
  AIConsentDecision,
  ExtractionDraft,
  ParserRescueConsentState,
  ParserUncertaintyAssessment
} from "./types";

export type UploadTriggerAction = "scroll-to-panel" | "open-hidden-picker" | "noop";
export type ParserRescueAction = "local_only" | "prompt_consent" | "run_ai" | "keep_local_denied";

interface ResolveUploadTriggerActionInput {
  isShareMode: boolean;
  hasUploadPanel: boolean;
  isProcessing: boolean;
}

interface ResolveParserRescueActionInput {
  isSevere: boolean;
  consentState: ParserRescueConsentState;
}

interface AutoApplyAiRescueDecision {
  shouldApplyAi: boolean;
  reason: "critical_coverage_up" | "marker_count_up" | "confidence_up" | "not_better";
}

interface UploadReviewPresentationInput {
  draft: ExtractionDraft;
  assessment: ParserUncertaintyAssessment | null;
}

const SEVERE_WARNING_CODES: ReadonlySet<string> = new Set([
  "PDF_TEXT_EXTRACTION_FAILED",
  "PDF_TEXT_LAYER_EMPTY",
  "PDF_OCR_INIT_FAILED",
  "PDF_UNKNOWN_LAYOUT"
] as const);

const SEVERE_UNCERTAINTY_REASONS: ReadonlySet<string> = new Set([
  "warning_text_extraction_failed",
  "warning_text_layer_empty",
  "warning_ocr_init_failed",
  "warning_unknown_layout"
] as const);

const CRITICAL_MARKERS = new Set([
  "Testosterone",
  "Free Testosterone",
  "Estradiol",
  "SHBG",
  "Hematocrit"
]);

const countCriticalCoverage = (draft: ExtractionDraft): number =>
  new Set(
    draft.markers
      .map((marker) => marker.canonicalMarker)
      .filter((canonical) => CRITICAL_MARKERS.has(canonical))
  ).size;

export const resolveUploadTriggerAction = ({
  isShareMode,
  hasUploadPanel,
  isProcessing
}: ResolveUploadTriggerActionInput): UploadTriggerAction => {
  if (isShareMode) {
    return "noop";
  }
  if (hasUploadPanel) {
    return "scroll-to-panel";
  }
  if (isProcessing) {
    return "noop";
  }
  return "open-hidden-picker";
};

export const isSevereParserExtraction = (assessment: ParserUncertaintyAssessment): boolean => {
  if (assessment.markerCount < 4 || assessment.confidence < 0.55) {
    return true;
  }

  if (assessment.reasons.some((reason) => SEVERE_UNCERTAINTY_REASONS.has(reason))) {
    return true;
  }

  return assessment.warnings.some((warning) => SEVERE_WARNING_CODES.has(warning));
};

export const shouldOfferParserImprovementSubmission = (assessment: ParserUncertaintyAssessment): boolean =>
  isSevereParserExtraction(assessment);

export const shouldPresentUploadAsNeedsReview = ({
  draft,
  assessment
}: UploadReviewPresentationInput): boolean =>
  draft.extraction.needsReview || Boolean(assessment?.isUncertain) || draft.markers.length < 4;

export const resolveParserRescueAction = ({
  isSevere,
  consentState
}: ResolveParserRescueActionInput): ParserRescueAction => {
  if (!isSevere) {
    return "local_only";
  }
  if (consentState === "allowed") {
    return "run_ai";
  }
  if (consentState === "denied") {
    return "keep_local_denied";
  }
  return "prompt_consent";
};

export const buildRememberedParserRescueConsent = (allowPdfAttachment: boolean): AIConsentDecision => ({
  action: "parser_rescue",
  scope: "always",
  allowExternalAi: true,
  parserRescueEnabled: true,
  includeSymptoms: false,
  includeNotes: false,
  allowPdfAttachment
});

export const shouldAutoApplyAiRescueResult = (
  localDraft: ExtractionDraft,
  aiDraft: ExtractionDraft
): AutoApplyAiRescueDecision => {
  const localCriticalCoverage = countCriticalCoverage(localDraft);
  const aiCriticalCoverage = countCriticalCoverage(aiDraft);

  if (aiCriticalCoverage > localCriticalCoverage) {
    return {
      shouldApplyAi: true,
      reason: "critical_coverage_up"
    };
  }

  const markerDelta = aiDraft.markers.length - localDraft.markers.length;
  const confidenceDelta = aiDraft.extraction.confidence - localDraft.extraction.confidence;

  if (markerDelta >= 2 && confidenceDelta >= -0.04) {
    return {
      shouldApplyAi: true,
      reason: "marker_count_up"
    };
  }

  if (confidenceDelta >= 0.08 && aiDraft.markers.length >= localDraft.markers.length) {
    return {
      shouldApplyAi: true,
      reason: "confidence_up"
    };
  }

  return {
    shouldApplyAi: false,
    reason: "not_better"
  };
};
