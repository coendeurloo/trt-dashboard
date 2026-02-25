export type ThemeMode = "light" | "dark";
export type UnitSystem = "eu" | "us";
export type AppLanguage = "en" | "es" | "pt" | "de" | "nl" | "ru" | "zh";
export type AICostMode = "balanced" | "ultra_low_cost" | "max_accuracy";
export type ParserDebugMode = "text_only" | "text_ocr" | "text_ocr_ai";
export type AIConsentAction = "analysis" | "parser_rescue";
export type AIConsentScope = "once" | "always";
export type ParserStage =
  | "reading_text_layer"
  | "running_ocr"
  | "running_ai_text"
  | "running_ai_pdf_rescue"
  | "done"
  | "failed";
export type TabKey =
  | "dashboard"
  | "protocol"
  | "supplements"
  | "protocolImpact"
  | "doseResponse"
  | "protocolDose"
  | "alerts"
  | "reports"
  | "settings"
  | "analysis"
  | "checkIns";
export type TimeRangeKey = "3m" | "6m" | "12m" | "all" | "custom";
export type SamplingTiming = "unknown" | "trough" | "mid" | "peak";
export type SupplementAnchorState = "inherit" | "anchor" | "none" | "unknown";
export type DashboardChartPreset = "clinical" | "protocol" | "minimal" | "custom";
export type DashboardViewMode = "cards" | "compare2";

export type DosePredictionSource = "personal" | "hybrid" | "study_prior";

export interface SupplementEntry {
  name: string;
  dose: string;
  frequency: string;
}

export interface SupplementPeriod {
  id: string;
  name: string;
  dose: string;
  frequency: string;
  startDate: string;
  endDate: string | null;
}

export interface CompoundEntry {
  name: string;
  doseMg: string;
  frequency: string;
  route: string;
}

export interface DosePriorEvidence {
  citation: string;
  studyType: string;
  relevance: string;
  quality: "high" | "medium" | "low";
}

export interface DosePrior {
  marker: string;
  unitSystem: UnitSystem;
  unit: string;
  slopePerMg: number;
  sigma: number;
  doseRange: {
    min: number;
    max: number;
  };
  evidence: DosePriorEvidence[];
}

export interface DoseBlendDiagnostics {
  wPersonal: number;
  sigmaPersonal: number;
  sigmaPrior: number;
  sigmaResidual: number;
  offlinePriorFallback: boolean;
}

export interface MarkerValue {
  id: string;
  marker: string;
  canonicalMarker: string;
  value: number;
  unit: string;
  referenceMin: number | null;
  referenceMax: number | null;
  rawValue?: number;
  rawUnit?: string;
  rawReferenceMin?: number | null;
  rawReferenceMax?: number | null;
  abnormal: "low" | "high" | "normal" | "unknown";
  confidence: number;
  isCalculated?: boolean;
  source?: "measured" | "calculated";
}

export interface ReportAnnotations {
  protocolId: string | null;
  protocol: string;
  supplementAnchorState?: SupplementAnchorState;
  supplementOverrides: SupplementPeriod[] | null;
  symptoms: string;
  notes: string;
  samplingTiming: SamplingTiming;
}

export interface Protocol {
  id: string;
  name: string;
  compounds: CompoundEntry[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SymptomCheckIn {
  id: string;
  date: string;
  energy: number | null;
  libido: number | null;
  mood: number | null;
  sleep: number | null;
  motivation: number | null;
  notes: string;
}

export interface LabReport {
  id: string;
  sourceFileName: string;
  testDate: string;
  createdAt: string;
  markers: MarkerValue[];
  annotations: ReportAnnotations;
  isBaseline?: boolean;
  extraction: {
    provider: "claude" | "gemini" | "fallback";
    model: string;
    confidence: number;
    needsReview: boolean;
    warningCode?: ExtractionWarningCode;
    warnings?: string[];
    debug?: ExtractionDebugInfo;
    costMode?: AICostMode;
    aiUsed?: boolean;
    aiReason?: ExtractionAIReason;
  };
}

export type ExtractionWarningCode =
  | "PDF_TEXT_LAYER_EMPTY"
  | "PDF_TEXT_EXTRACTION_FAILED"
  | "PDF_OCR_INIT_FAILED"
  | "PDF_OCR_PARTIAL"
  | "PDF_LOW_CONFIDENCE_LOCAL"
  | "PDF_UNKNOWN_LAYOUT"
  | "PDF_AI_TEXT_ONLY_INSUFFICIENT"
  | "PDF_AI_PDF_RESCUE_SKIPPED_COST_MODE"
  | "PDF_AI_PDF_RESCUE_SKIPPED_SIZE"
  | "PDF_AI_PDF_RESCUE_FAILED"
  | "PDF_AI_SKIPPED_COST_MODE"
  | "PDF_AI_SKIPPED_BUDGET"
  | "PDF_AI_SKIPPED_RATE_LIMIT"
  | "PDF_AI_LIMITS_UNAVAILABLE"
  | "PDF_AI_CONSENT_REQUIRED"
  | "PDF_AI_DISABLED_BY_PARSER_MODE";

export type ParserUncertaintyReason =
  | "warning_unknown_layout"
  | "warning_text_extraction_failed"
  | "warning_ocr_init_failed"
  | "warning_text_layer_empty"
  | "marker_count_low"
  | "confidence_very_low"
  | "confidence_and_unit_coverage_low";

export interface ParserUncertaintyAssessment {
  isUncertain: boolean;
  reasons: ParserUncertaintyReason[];
  markerCount: number;
  confidence: number;
  unitCoverage: number;
  warnings: ExtractionWarningCode[];
}

export interface ExtractionDiffRowSnapshot {
  marker: string;
  canonicalMarker: string;
  value: number;
  unit: string;
  referenceMin: number | null;
  referenceMax: number | null;
  confidence: number;
}

export interface ExtractionDiffRowChange {
  canonicalMarker: string;
  marker: string;
  local?: ExtractionDiffRowSnapshot;
  ai?: ExtractionDiffRowSnapshot;
  changedFields?: Array<"marker" | "value" | "unit" | "referenceMin" | "referenceMax" | "confidence">;
}

export interface ExtractionDiffSummary {
  local: {
    markerCount: number;
    confidence: number;
    warnings: ExtractionWarningCode[];
  };
  ai: {
    markerCount: number;
    confidence: number;
    warnings: ExtractionWarningCode[];
  };
  localTestDate: string;
  aiTestDate: string;
  testDateChanged: boolean;
  added: ExtractionDiffRowChange[];
  removed: ExtractionDiffRowChange[];
  changed: ExtractionDiffRowChange[];
  hasChanges: boolean;
}

export type ExtractionAIReason =
  | "auto_low_quality"
  | "manual_improve"
  | "disabled_by_budget"
  | "cache_hit"
  | "local_high_quality"
  | "disabled_by_cost_mode"
  | "disabled_by_consent";

export type ExtractionRoute =
  | "local-text"
  | "local-ocr"
  | "local-text-ocr-merged"
  | "gemini-with-text"
  | "gemini-with-ocr"
  | "gemini-vision-only"
  | "empty";

export interface AIConsentDecision {
  action: AIConsentAction;
  scope: AIConsentScope;
  allowExternalAi: boolean;
  parserRescueEnabled: boolean;
  includeSymptoms: boolean;
  includeNotes: boolean;
  allowPdfAttachment: boolean;
}

export interface ExtractionDebugInfo {
  textItems: number;
  ocrUsed: boolean;
  ocrPages: number;
  keptRows: number;
  rejectedRows: number;
  topRejectReasons: Record<string, number>;
  normalizationSummary?: {
    overridesHit: number;
    unknownCount: number;
    lowConfidenceCount: number;
  };
  aiInputTokens?: number;
  aiOutputTokens?: number;
  aiCacheHit?: boolean;
  aiAttemptedModes?: string[];
  aiRescueTriggered?: boolean;
  aiRescueReason?: string;
  extractionRoute?: ExtractionRoute;
}

export interface AppSettings {
  theme: ThemeMode;
  unitSystem: UnitSystem;
  language: AppLanguage;
  tooltipDetailMode: "compact" | "full";
  enableSamplingControls: boolean;
  enableCalculatedFreeTestosterone: boolean;
  showReferenceRanges: boolean;
  showAbnormalHighlights: boolean;
  showAnnotations: boolean;
  showCheckInOverlay: boolean;
  showTrtTargetZone: boolean;
  showLongevityTargetZone: boolean;
  yAxisMode: "zero" | "data";
  samplingFilter: "all" | "trough" | "peak";
  compareToBaseline: boolean;
  comparisonScale: "absolute" | "normalized";
  dashboardChartPreset: DashboardChartPreset;
  timeRange: TimeRangeKey;
  customRangeStart: string;
  customRangeEnd: string;
  aiExternalConsent: boolean;
  aiCostMode: AICostMode;
  aiAutoImproveEnabled: boolean;
  parserDebugMode: ParserDebugMode;
}

export interface StoredAppData {
  schemaVersion: number;
  reports: LabReport[];
  protocols: Protocol[];
  supplementTimeline: SupplementPeriod[];
  checkIns: SymptomCheckIn[];
  markerAliasOverrides: Record<string, string>;
  settings: AppSettings;
}

export interface ExtractionDraft {
  sourceFileName: string;
  testDate: string;
  markers: MarkerValue[];
  extraction: {
    provider: "claude" | "gemini" | "fallback";
    model: string;
    confidence: number;
    needsReview: boolean;
    warningCode?: ExtractionWarningCode;
    warnings?: string[];
    debug?: ExtractionDebugInfo;
    costMode?: AICostMode;
    aiUsed?: boolean;
    aiReason?: ExtractionAIReason;
  };
}
