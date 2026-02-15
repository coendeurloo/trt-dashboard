export type ThemeMode = "light" | "dark";
export type UnitSystem = "eu" | "us";
export type AppLanguage = "nl" | "en";
export type TabKey =
  | "dashboard"
  | "protocolImpact"
  | "doseResponse"
  | "protocolDose"
  | "alerts"
  | "reports"
  | "settings"
  | "analysis";
export type TimeRangeKey = "3m" | "6m" | "12m" | "all" | "custom";
export type SamplingTiming = "unknown" | "trough" | "mid" | "peak";

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
  dosageMgPerWeek: number | null;
  protocol: string;
  supplements: string;
  symptoms: string;
  notes: string;
  samplingTiming: SamplingTiming;
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
  };
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
  claudeApiKey: string;
}

export interface StoredAppData {
  schemaVersion: number;
  reports: LabReport[];
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
  };
}
