export type ThemeMode = "light" | "dark";
export type UnitSystem = "eu" | "us";
export type AppLanguage = "en" | "es" | "pt" | "de" | "nl" | "ru" | "zh";
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
  | "analysis";
export type TimeRangeKey = "3m" | "6m" | "12m" | "all" | "custom";
export type SamplingTiming = "unknown" | "trough" | "mid" | "peak";

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
  abnormal: "low" | "high" | "normal" | "unknown";
  confidence: number;
  isCalculated?: boolean;
  source?: "measured" | "calculated";
}

export interface ReportAnnotations {
  protocolId: string | null;
  protocol: string;
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
    provider: "claude" | "fallback";
    model: string;
    confidence: number;
    needsReview: boolean;
    warningCode?: ExtractionWarningCode;
    warnings?: string[];
    debug?: ExtractionDebugInfo;
  };
}

export type ExtractionWarningCode =
  | "PDF_TEXT_LAYER_EMPTY"
  | "PDF_TEXT_EXTRACTION_FAILED"
  | "PDF_OCR_INIT_FAILED"
  | "PDF_OCR_PARTIAL"
  | "PDF_LOW_CONFIDENCE_LOCAL";

export interface ExtractionDebugInfo {
  textItems: number;
  ocrUsed: boolean;
  ocrPages: number;
  keptRows: number;
  rejectedRows: number;
  topRejectReasons: Record<string, number>;
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
  showTrtTargetZone: boolean;
  showLongevityTargetZone: boolean;
  yAxisMode: "zero" | "data";
  samplingFilter: "all" | "trough" | "peak";
  compareToBaseline: boolean;
  comparisonScale: "absolute" | "normalized";
  timeRange: TimeRangeKey;
  customRangeStart: string;
  customRangeEnd: string;
}

export interface StoredAppData {
  schemaVersion: number;
  reports: LabReport[];
  protocols: Protocol[];
  supplementTimeline: SupplementPeriod[];
  checkIns: SymptomCheckIn[];
  settings: AppSettings;
}

export interface ExtractionDraft {
  sourceFileName: string;
  testDate: string;
  markers: MarkerValue[];
  extraction: {
    provider: "claude" | "fallback";
    model: string;
    confidence: number;
    needsReview: boolean;
    warningCode?: ExtractionWarningCode;
    warnings?: string[];
    debug?: ExtractionDebugInfo;
  };
}
