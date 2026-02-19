import { PRIMARY_MARKERS, PROTOCOL_MARKER_CATEGORIES } from "./constants";
import { trLocale } from "./i18n";
import {
  AppLanguage,
  AppSettings,
  DoseBlendDiagnostics,
  DosePredictionSource,
  DosePrior,
  LabReport,
  MarkerValue,
  Protocol,
  SamplingTiming,
  SupplementPeriod
} from "./types";
import {
  getProtocolCompoundsText,
  getProtocolDoseMgPerWeek,
  getProtocolFrequencyPerWeek,
  getReportSupplementsText,
  getReportProtocol
} from "./protocolUtils";
import { buildSupplementStackKey, getEffectiveSupplements } from "./supplementUtils";
import { canonicalizeMarker, convertBySystem } from "./unitConversion";
import { clip, createId, deriveAbnormalFlag, formatDate as formatHumanDate, sortReportsChronological } from "./utils";

export interface MarkerSeriesPoint {
  key: string;
  date: string;
  reportId: string;
  createdAt: string;
  value: number;
  unit: string;
  referenceMin: number | null;
  referenceMax: number | null;
  abnormal: MarkerValue["abnormal"];
  context: {
    dosageMgPerWeek: number | null;
    compound: string;
    injectionFrequency: string;
    protocol: string;
    supplements: string;
    symptoms: string;
    notes: string;
    samplingTiming: SamplingTiming;
  };
  isCalculated: boolean;
}

export interface DosePhaseBlock {
  id: string;
  fromKey: string;
  toKey: string;
  dosageMgPerWeek: number | null;
  protocol: string;
}

export interface MarkerAlert {
  id: string;
  marker: string;
  type: "threshold" | "trend";
  severity: "high" | "medium" | "low";
  tone: "attention" | "positive";
  actionNeeded: boolean;
  message: string;
  suggestion: string;
  date: string;
}

export type TrendDirection = "rising" | "falling" | "stable" | "volatile";

export interface MarkerTrendSummary {
  marker: string;
  direction: TrendDirection;
  slope: number;
  stdDev: number;
  mean: number;
  explanation: string;
}

export interface ProtocolImpactInsight {
  marker: string;
  eventDate: string;
  trigger: string;
  fromValue: number;
  toValue: number;
  delta: number;
  percentChange: number | null;
  unit: string;
  confidence: "High" | "Medium" | "Low";
}

export interface ProtocolImpactSummary {
  events: Array<{
    date: string;
    doseFrom: number | null;
    doseTo: number | null;
    frequencyFrom: number | null;
    frequencyTo: number | null;
    protocolFrom: string;
    protocolTo: string;
    trigger: string;
  }>;
  insights: ProtocolImpactInsight[];
}

export type ProtocolImpactSignalStatus = "early_signal" | "building_signal" | "established_pattern";

export interface ProtocolImpactMarkerRow {
  marker: string;
  unit: string;
  beforeAvg: number | null;
  beforeSource: "window" | "none";
  comparisonBasis: "local_pre_post" | "event_reports" | "insufficient";
  baselineAgeDays: number | null;
  afterAvg: number | null;
  deltaAbs: number | null;
  deltaPct: number | null;
  trend: "up" | "down" | "flat" | "insufficient";
  confidence: "High" | "Medium" | "Low";
  confidenceReason: string;
  insufficientData: boolean;
  impactScore: number;
  confidenceScore: number;
  lagDays: number;
  nBefore: number;
  nAfter: number;
  readinessStatus: "ready" | "waiting_post" | "waiting_pre" | "waiting_both";
  recommendedNextTestDate: string | null;
  signalStatus: ProtocolImpactSignalStatus;
  deltaDirectionLabel: string;
  contextHint: string | null;
  narrativeShort: string;
  narrative: string;
}

export interface ProtocolImpactDoseEvent {
  id: string;
  fromDose: number | null;
  toDose: number | null;
  fromFrequency: number | null;
  toFrequency: number | null;
  fromCompounds: string[];
  toCompounds: string[];
  changeDate: string;
  beforeCount: number;
  afterCount: number;
  beforeWindow: {
    start: string;
    end: string;
  };
  afterWindow: {
    start: string;
    end: string;
  };
  eventType: "dose" | "frequency" | "compound" | "mixed";
  eventSubType: "start" | "adjustment";
  triggerStrength: number;
  eventConfidenceScore: number;
  eventConfidence: "High" | "Medium" | "Low";
  signalStatus: ProtocolImpactSignalStatus;
  signalStatusLabel: string;
  signalNextStep: string;
  comparisonBasis: "local_pre_post";
  headlineNarrative: string;
  storyObserved: string;
  storyInterpretation: string;
  storyContextHint: string | null;
  storyChange: string;
  storyEffect: string;
  storyReliability: string;
  storySummary: string;
  confounders: {
    samplingChanged: boolean;
    supplementsChanged: boolean;
    symptomsChanged: boolean;
  };
  lagDaysByMarker: Record<string, number>;
  rows: ProtocolImpactMarkerRow[];
  topImpacts: ProtocolImpactMarkerRow[];
}

export interface DoseCorrelationInsight {
  marker: string;
  r: number;
  n: number;
}

export interface TrtStabilityResult {
  score: number | null;
  components: Partial<Record<"Testosterone" | "Estradiol" | "Hematocrit" | "SHBG", number>>;
}

export interface TrtStabilityPoint {
  key: string;
  date: string;
  score: number;
}

export interface DosePrediction {
  marker: string;
  unit: string;
  slopePerMg: number;
  intercept: number;
  rSquared: number;
  correlationR: number | null;
  sampleCount: number;
  uniqueDoseLevels: number;
  allSampleCount: number;
  troughSampleCount: number;
  currentDose: number;
  suggestedDose: number;
  currentEstimate: number;
  suggestedEstimate: number;
  predictionSigma: number | null;
  predictedLow: number | null;
  predictedHigh: number | null;
  suggestedPercentChange: number | null;
  confidence: "High" | "Medium" | "Low";
  status: "clear" | "unclear" | "insufficient";
  statusReason: string;
  samplingMode: "trough" | "all";
  samplingWarning: string | null;
  usedReportDates: string[];
  excludedPoints: Array<{ date: string; reason: string }>;
  modelType: "linear" | "theil-sen" | "hybrid" | "prior";
  source: DosePredictionSource;
  relevanceScore: number;
  whyRelevant: string;
  isApiAssisted: boolean;
  blendDiagnostics: DoseBlendDiagnostics | null;
  scenarios: Array<{ dose: number; estimatedValue: number }>;
}

interface TargetZone {
  min: number;
  max: number;
  unit: string;
}

const ROUND_2 = (value: number): number => Number(value.toFixed(2));
const ROUND_3 = (value: number): number => Number(value.toFixed(3));
const DAY_MS = 24 * 60 * 60 * 1000;
const DOSE_EXPECTED_POSITIVE_MARKERS = new Set(["Testosterone", "Free Testosterone", "Free Androgen Index"]);
const DOSE_CLINICAL_WEIGHTS: Record<string, number> = {
  Testosterone: 98,
  "Free Testosterone": 92,
  Estradiol: 88,
  Hematocrit: 88,
  SHBG: 78,
  "Apolipoprotein B": 86,
  "LDL Cholesterol": 82,
  "Non-HDL Cholesterol": 78,
  Cholesterol: 70,
  Hemoglobin: 74
};
const DOSE_RELEVANCE_HINTS: Record<string, string> = {
  Testosterone: "Primary efficacy marker for testosterone dose exposure.",
  "Free Testosterone": "Reflects active androgen availability, often linked to symptom response.",
  Estradiol: "Commonly shifts with testosterone dose and aromatization load.",
  Hematocrit: "Safety marker that can rise with higher androgen exposure.",
  SHBG: "Modifies free hormone availability and can affect interpretation.",
  "Apolipoprotein B": "Cardiometabolic risk marker relevant for protocol safety.",
  "LDL Cholesterol": "Cardiometabolic marker that may shift with androgen protocols."
};
const PROTOCOL_IMPACT_CLINICAL_WEIGHTS: Record<string, number> = {
  Testosterone: 95,
  "Free Testosterone": 92,
  Estradiol: 88,
  Hematocrit: 90,
  Hemoglobin: 78,
  SHBG: 74,
  "LDL Cholesterol": 86,
  "Apolipoprotein B": 90,
  "Non-HDL Cholesterol": 82,
  Cholesterol: 72,
  Triglyceriden: 74,
  CRP: 80,
  Ferritine: 70
};
const PROTOCOL_IMPACT_DEFAULT_CLINICAL_WEIGHT = 55;
const PROTOCOL_IMPACT_EFFECT_CAP_PCT = 45;
const PROTOCOL_IMPACT_MARKER_LAG_DAYS = {
  hormones: 10,
  inflammation: 14,
  hematology: 21,
  lipids: 28,
  other: 21
} as const;
const HORMONE_MARKERS = new Set(PROTOCOL_MARKER_CATEGORIES.Hormones ?? []);
const LIPID_MARKERS = new Set(PROTOCOL_MARKER_CATEGORIES.Lipids ?? []);
const HEMATOLOGY_MARKERS = new Set(PROTOCOL_MARKER_CATEGORIES.Hematology ?? []);
const INFLAMMATION_MARKERS = new Set(PROTOCOL_MARKER_CATEGORIES.Inflammation ?? []);
const PROTOCOL_IMPACT_MAX_LAG_DAYS = Math.max(...Object.values(PROTOCOL_IMPACT_MARKER_LAG_DAYS));

const normalizeProtocolText = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, " ");

const parseDateSafe = (value: string): number => {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : 0;
};

const dateToIso = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 10);

const shiftDateByDays = (date: string, days: number): string => dateToIso(parseDateSafe(date) + days * DAY_MS);

const normalizeSetValue = (value: string): string => normalizeProtocolText(value);

const setsEqual = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
};

const canonicalCompoundSet = (protocol: Protocol | null): string[] => {
  if (!protocol || protocol.compounds.length === 0) {
    return [];
  }
  return Array.from(new Set(protocol.compounds.map((entry) => normalizeSetValue(entry.name)).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
};

const displayCompoundSet = (protocol: Protocol | null): string[] => {
  if (!protocol || protocol.compounds.length === 0) {
    return [];
  }
  return Array.from(new Set(protocol.compounds.map((entry) => entry.name.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
};

const canonicalSupplementSet = (report: LabReport, supplementTimeline: SupplementPeriod[]): string[] =>
  buildSupplementStackKey(getEffectiveSupplements(report, supplementTimeline));

const markerLagDays = (marker: string): number => {
  if (HORMONE_MARKERS.has(marker)) {
    return PROTOCOL_IMPACT_MARKER_LAG_DAYS.hormones;
  }
  if (INFLAMMATION_MARKERS.has(marker)) {
    return PROTOCOL_IMPACT_MARKER_LAG_DAYS.inflammation;
  }
  if (HEMATOLOGY_MARKERS.has(marker)) {
    return PROTOCOL_IMPACT_MARKER_LAG_DAYS.hematology;
  }
  if (LIPID_MARKERS.has(marker)) {
    return PROTOCOL_IMPACT_MARKER_LAG_DAYS.lipids;
  }
  return PROTOCOL_IMPACT_MARKER_LAG_DAYS.other;
};

const confidenceLabelFromScore = (score: number): "High" | "Medium" | "Low" => {
  if (score >= 75) {
    return "High";
  }
  if (score >= 50) {
    return "Medium";
  }
  return "Low";
};

const signalStatusLabelFromStatus = (status: ProtocolImpactSignalStatus): string => {
  if (status === "established_pattern") {
    return "Established pattern";
  }
  if (status === "building_signal") {
    return "Building signal";
  }
  return "Early signal";
};

const dominantSamplingTiming = (items: LabReport[]): SamplingTiming | null => {
  if (items.length === 0) {
    return null;
  }
  const counts = items.reduce((acc, report) => {
    const key = report.annotations.samplingTiming;
    acc.set(key, (acc.get(key) ?? 0) + 1);
    return acc;
  }, new Map<SamplingTiming, number>());
  const ranked = Array.from(counts.entries()).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return left[0].localeCompare(right[0]);
  });
  return ranked[0]?.[0] ?? null;
};

const buildRegInput = (values: number[]): Array<{ x: number; y: number }> => values.map((value, index) => ({ x: index, y: value }));

const linearRegression = (
  samples: Array<{ x: number; y: number }>
): { slope: number; intercept: number; rSquared: number } | null => {
  if (samples.length < 2) {
    return null;
  }

  const n = samples.length;
  const sumX = samples.reduce((sum, item) => sum + item.x, 0);
  const sumY = samples.reduce((sum, item) => sum + item.y, 0);
  const sumXX = samples.reduce((sum, item) => sum + item.x * item.x, 0);
  const sumXY = samples.reduce((sum, item) => sum + item.x * item.y, 0);
  const denominator = n * sumXX - sumX * sumX;
  if (Math.abs(denominator) < 0.000001) {
    return null;
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  let ssRes = 0;
  let ssTot = 0;
  for (const sample of samples) {
    const predicted = intercept + slope * sample.x;
    ssRes += (sample.y - predicted) ** 2;
    ssTot += (sample.y - meanY) ** 2;
  }
  const rSquared = ssTot <= 0.000001 ? 0 : clip(1 - ssRes / ssTot, 0, 1);

  return { slope, intercept, rSquared };
};

const pearsonCorrelation = (points: Array<{ x: number; y: number }>): number | null => {
  if (points.length < 3) {
    return null;
  }
  const n = points.length;
  const sumX = points.reduce((sum, item) => sum + item.x, 0);
  const sumY = points.reduce((sum, item) => sum + item.y, 0);
  const sumXY = points.reduce((sum, item) => sum + item.x * item.y, 0);
  const sumXX = points.reduce((sum, item) => sum + item.x * item.x, 0);
  const sumYY = points.reduce((sum, item) => sum + item.y * item.y, 0);
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
  if (Math.abs(denominator) <= 0.000001) {
    return null;
  }
  return numerator / denominator;
};

const trendFromDelta = (delta: number | null): ProtocolImpactMarkerRow["trend"] => {
  if (delta === null) {
    return "insufficient";
  }
  if (Math.abs(delta) <= 0.000001) {
    return "flat";
  }
  return delta > 0 ? "up" : "down";
};

const protocolImpactEventType = (
  doseTriggered: boolean,
  frequencyTriggered: boolean,
  compoundChanged: boolean
): ProtocolImpactDoseEvent["eventType"] => {
  const active = [doseTriggered, frequencyTriggered, compoundChanged].filter(Boolean).length;
  if (active >= 2) {
    return "mixed";
  }
  if (doseTriggered) {
    return "dose";
  }
  if (frequencyTriggered) {
    return "frequency";
  }
  return "compound";
};

const protocolImpactEffectScore = (deltaPct: number | null): number => {
  if (deltaPct === null) {
    return 0;
  }
  return Math.round((clip(Math.abs(deltaPct), 0, PROTOCOL_IMPACT_EFFECT_CAP_PCT) / PROTOCOL_IMPACT_EFFECT_CAP_PCT) * 100);
};

const protocolImpactConsistencyScore = (
  baseline: number | null,
  afterValues: number[],
  deltaAbs: number | null
): number => {
  if (baseline === null || afterValues.length === 0 || deltaAbs === null) {
    return 0;
  }
  if (Math.abs(deltaAbs) <= 0.000001) {
    return 50;
  }
  const expectedSign = deltaAbs > 0 ? 1 : -1;
  const signs = afterValues
    .map((value) => value - baseline)
    .filter((value) => Math.abs(value) > 0.000001)
    .map((value) => (value > 0 ? 1 : -1));
  if (signs.length === 0) {
    return 50;
  }
  const consistentCount = signs.filter((value) => value === expectedSign).length;
  return Math.round((consistentCount / signs.length) * 100);
};

const protocolImpactSampleScore = (nBefore: number, nAfter: number): number => {
  const balanceScore = clip((Math.min(nBefore, nAfter) / 3) * 70, 0, 70);
  const totalScore = clip((Math.min(nBefore + nAfter, 8) / 8) * 30, 0, 30);
  return Math.round(balanceScore + totalScore);
};

const protocolImpactEffectClarityScore = (
  deltaPct: number | null,
  deltaAbs: number | null,
  beforeValues: number[],
  afterValues: number[]
): number => {
  if (deltaPct === null || deltaAbs === null) {
    return 25;
  }
  const baseScore = 25 + (clip(Math.abs(deltaPct), 0, PROTOCOL_IMPACT_EFFECT_CAP_PCT) / PROTOCOL_IMPACT_EFFECT_CAP_PCT) * 75;
  const preStd = beforeValues.length > 1 ? stdDev(beforeValues) : 0;
  const postStd = afterValues.length > 1 ? stdDev(afterValues) : 0;
  const noise = preStd + postStd;
  if (noise <= 0.000001) {
    return Math.round(clip(baseScore, 0, 100));
  }
  const signalToNoise = Math.abs(deltaAbs) / noise;
  const clarityPenalty = signalToNoise < 0.5 ? 20 : signalToNoise < 0.8 ? 10 : 0;
  return Math.round(clip(baseScore - clarityPenalty, 0, 100));
};

const protocolImpactConfidenceReason = (
  nBefore: number,
  nAfter: number,
  consistencyScore: number,
  triggerStrength: number,
  confounderPenalty: number,
  baselinePenalty: number
): string =>
  `${nBefore} pre / ${nAfter} post points; consistency ${consistencyScore}%; trigger ${triggerStrength}/100; confounder penalty ${confounderPenalty}; baseline penalty ${baselinePenalty}.`;

const protocolImpactReadinessStatus = (
  nBefore: number,
  nAfter: number
): ProtocolImpactMarkerRow["readinessStatus"] => {
  if (nBefore > 0 && nAfter > 0) {
    return "ready";
  }
  if (nBefore === 0 && nAfter === 0) {
    return "waiting_both";
  }
  if (nBefore === 0) {
    return "waiting_pre";
  }
  return "waiting_post";
};

const protocolImpactBaselinePenalty = (baselineAgeDays: number | null): number => {
  if (baselineAgeDays === null) {
    return 0;
  }
  if (baselineAgeDays > 240) {
    return 20;
  }
  if (baselineAgeDays > 120) {
    return 10;
  }
  return 0;
};

const protocolImpactMarkerSignalStatus = (
  insufficientData: boolean,
  nBefore: number,
  nAfter: number,
  confidenceScore: number,
  confounderPenalty: number
): ProtocolImpactSignalStatus => {
  if (insufficientData || nBefore === 0 || nAfter === 0) {
    return "early_signal";
  }
  if (confidenceScore >= 75 && nBefore >= 2 && nAfter >= 2 && confounderPenalty <= 10) {
    return "established_pattern";
  }
  if (confidenceScore >= 50 && nBefore >= 1 && nAfter >= 1) {
    return "building_signal";
  }
  return "early_signal";
};

const protocolImpactEventSignalStatus = (
  rows: ProtocolImpactMarkerRow[],
  eventConfidenceScore: number
): ProtocolImpactSignalStatus => {
  const ranked = rows.filter((row) => !row.insufficientData).slice(0, 4);
  if (ranked.length === 0) {
    return "early_signal";
  }
  const establishedCount = ranked.filter((row) => row.signalStatus === "established_pattern").length;
  if (
    establishedCount >= 2 ||
    (establishedCount >= 1 && eventConfidenceScore >= 68) ||
    (ranked.length >= 2 && eventConfidenceScore >= 60) ||
    eventConfidenceScore >= 78
  ) {
    return "established_pattern";
  }
  const buildingCount = ranked.filter((row) => row.signalStatus === "building_signal").length;
  if (buildingCount >= 1 || eventConfidenceScore >= 50) {
    return "building_signal";
  }
  return "early_signal";
};

const protocolImpactSignalNextStep = (
  signalStatus: ProtocolImpactSignalStatus,
  eventSubType: ProtocolImpactDoseEvent["eventSubType"],
  rows: ProtocolImpactMarkerRow[],
  confounders: ProtocolImpactDoseEvent["confounders"]
): string => {
  const nextDate = rows
    .filter((row) => row.recommendedNextTestDate)
    .map((row) => row.recommendedNextTestDate as string)
    .sort((left, right) => parseDateSafe(left) - parseDateSafe(right))[0];
  const confounderCount = [confounders.samplingChanged, confounders.supplementsChanged, confounders.symptomsChanged].filter(Boolean)
    .length;

  if (signalStatus === "established_pattern") {
    if (eventSubType === "start") {
      return confounderCount > 0
        ? "Your baseline-to-start comparison is now robust. Keep timing and protocol context consistent on follow-up labs."
        : "Your baseline-to-start comparison is now robust. Keep your regular monitoring cadence to confirm stability.";
    }
    return confounderCount > 0
      ? "Strong pattern detected. Keep sampling timing and protocol context consistent in follow-up checks."
      : "Strong pattern detected. Keep your regular monitoring cadence to confirm stability.";
  }

  if (signalStatus === "building_signal") {
    if (eventSubType === "start") {
      if (nextDate) {
        return `This start comparison is becoming clearer. One follow-up lab around ${formatHumanDate(nextDate)} will make it stronger.`;
      }
      return "This start comparison is becoming clearer. One additional follow-up lab will make it stronger.";
    }
    if (nextDate) {
      return `Good directional signal. A follow-up lab around ${formatHumanDate(nextDate)} will make this conclusion stronger.`;
    }
    return "Good directional signal. One additional follow-up lab will make this conclusion stronger.";
  }

  if (eventSubType === "start") {
    if (nextDate) {
      return `This is your first baseline-to-start comparison. Recheck around ${formatHumanDate(nextDate)} for a clearer start signal.`;
    }
    return "This is your first baseline-to-start comparison. Add one stable follow-up lab for a clearer start signal.";
  }

  if (nextDate) {
    return `Early signal only. The next useful recheck is around ${formatHumanDate(nextDate)} for clearer before/after comparison.`;
  }
  return "Early signal only. Capture at least one stable pre and one lag-adjusted post measurement for a clearer comparison.";
};

const protocolImpactDeltaDirectionLabel = (
  trend: ProtocolImpactMarkerRow["trend"]
): string => {
  if (trend === "up") {
    return "Increased";
  }
  if (trend === "down") {
    return "Decreased";
  }
  if (trend === "flat") {
    return "Stable";
  }
  return "Insufficient data";
};

const protocolImpactMarkerNarrative = (
  marker: string,
  deltaPct: number | null,
  trend: ProtocolImpactMarkerRow["trend"],
  confidence: "High" | "Medium" | "Low",
  insufficientData: boolean,
  nBefore: number,
  nAfter: number,
  beforeSource: ProtocolImpactMarkerRow["beforeSource"]
): string => {
  if (insufficientData) {
    if (nAfter === 0 && nBefore === 0) {
      return `We could not find measurements for ${marker} in either the before or after window.`;
    }
    if (nAfter === 0) {
      return `We need more ${marker} measurements in the post window to estimate this effect.`;
    }
    if (nBefore === 0) {
      return `We need at least one ${marker} value in the pre window to compare this change.`;
    }
    return `There are too few ${marker} measurements to estimate this effect reliably.`;
  }

  const direction =
    trend === "up" ? "rose" : trend === "down" ? "fell" : "stayed roughly stable";
  const pctPart = deltaPct === null ? "" : ` by about ${deltaPct > 0 ? "+" : ""}${ROUND_2(deltaPct)}%`;
  const localWindowContext = beforeSource === "window" ? " based on local pre/post windows" : "";
  return `${marker} ${direction}${pctPart} after this protocol change${localWindowContext} (${confidence} confidence).`;
};

const protocolImpactEventHeadline = (event: {
  eventType: ProtocolImpactDoseEvent["eventType"];
  eventSubType: ProtocolImpactDoseEvent["eventSubType"];
  changeDate: string;
  anchorCompound: string;
  fromDose: number | null;
  toDose: number | null;
  fromFrequency: number | null;
  toFrequency: number | null;
  fromCompounds: string[];
  toCompounds: string[];
}): string => {
  const doseFrom = event.fromDose === null ? "not set" : `${ROUND_2(event.fromDose)} mg/week`;
  const doseTo = event.toDose === null ? "not set" : `${ROUND_2(event.toDose)} mg/week`;
  const freqFrom = event.fromFrequency === null ? "not set" : `${ROUND_2(event.fromFrequency)}/week`;
  const freqTo = event.toFrequency === null ? "not set" : `${ROUND_2(event.toFrequency)}/week`;
  const compoundsFrom =
    event.fromCompounds.length > 0
      ? event.fromCompounds.join(" + ")
      : event.eventSubType === "start"
        ? "baseline"
        : "not set";
  const compoundsTo = event.toCompounds.length > 0 ? event.toCompounds.join(" + ") : "none";
  const dateLabel = formatHumanDate(event.changeDate);
  const anchor = event.anchorCompound || "Protocol";
  const normalizedSet = (items: string[]): string[] =>
    Array.from(new Set(items.map((item) => item.trim().toLowerCase()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const compoundsUnchanged = setsEqual(normalizedSet(event.fromCompounds), normalizedSet(event.toCompounds));

  if (event.eventType === "dose") {
    return `${anchor} dose change from ${doseFrom} to ${doseTo} on ${dateLabel}.`;
  }
  if (event.eventType === "frequency") {
    return `Injection frequency change from ${freqFrom} to ${freqTo} on ${dateLabel}.`;
  }
  if (event.eventType === "compound") {
    return `Compound change from ${compoundsFrom} to ${compoundsTo} on ${dateLabel}.`;
  }
  if (compoundsUnchanged && event.toCompounds.length > 0) {
    return `${event.toCompounds[0]} protocol change on ${dateLabel}: dose ${doseFrom} to ${doseTo}, frequency ${freqFrom} to ${freqTo}.`;
  }
  return `Protocol change on ${dateLabel}: dose ${doseFrom} to ${doseTo}, frequency ${freqFrom} to ${freqTo}, compounds ${compoundsFrom} to ${compoundsTo}.`;
};

const selectTopChangedMarkers = (
  rows: ProtocolImpactMarkerRow[]
): ProtocolImpactMarkerRow[] => {
  return rows
    .filter((row) => !row.insufficientData && row.deltaPct !== null)
    .sort((left, right) => {
      const leftDeltaPct = Math.abs(left.deltaPct ?? 0);
      const rightDeltaPct = Math.abs(right.deltaPct ?? 0);
      if (rightDeltaPct !== leftDeltaPct) {
        return rightDeltaPct - leftDeltaPct;
      }
      const leftSampleCount = left.nBefore + left.nAfter;
      const rightSampleCount = right.nBefore + right.nAfter;
      if (rightSampleCount !== leftSampleCount) {
        return rightSampleCount - leftSampleCount;
      }
      return Math.abs(right.deltaAbs ?? 0) - Math.abs(left.deltaAbs ?? 0);
    })
    .slice(0, 4);
};

const protocolImpactObservedNarrative = (rows: ProtocolImpactMarkerRow[]): string => {
  if (rows.length === 0) {
    return "There are not enough lag-adjusted marker measurements yet.";
  }
  const summary = rows.slice(0, 2).map((row) => row.narrativeShort).join(" ");
  return summary;
};

const protocolImpactMarkerNarrativeShort = (
  marker: string,
  deltaPct: number | null,
  trend: ProtocolImpactMarkerRow["trend"],
  insufficientData: boolean
): string => {
  if (insufficientData || deltaPct === null || trend === "insufficient") {
    return `${marker}: not enough measured data yet.`;
  }
  const direction = trend === "up" ? "increased" : trend === "down" ? "decreased" : "stayed stable";
  return `${marker} ${direction} by ${deltaPct > 0 ? "+" : ""}${ROUND_2(deltaPct)}%.`;
};

const protocolImpactEventConfidence = (
  rows: ProtocolImpactMarkerRow[]
): { score: number; label: "High" | "Medium" | "Low" } => {
  const ranked = rows.filter((row) => !row.insufficientData).slice(0, 4);
  const score = ranked.length === 0 ? 35 : Math.round(mean(ranked.map((row) => row.confidenceScore)));
  return { score, label: confidenceLabelFromScore(score) };
};

const protocolImpactInterpretationNarrative = (
  signalStatus: ProtocolImpactSignalStatus,
  _rows: ProtocolImpactMarkerRow[],
  _confounders: ProtocolImpactDoseEvent["confounders"]
): string => {
  return (
    signalStatus === "established_pattern"
      ? "This pattern is strongly consistent with the protocol change."
      : signalStatus === "building_signal"
        ? "This pattern appears related to the protocol change, but still needs one more confirmation point."
        : "This is an early signal and should be treated as provisional."
  );
};

const protocolImpactContextHint = (
  signalStatus: ProtocolImpactSignalStatus,
  confounders: ProtocolImpactDoseEvent["confounders"]
): string | null => {
  const factors: string[] = [];
  if (confounders.samplingChanged) {
    factors.push("sampling");
  }
  if (confounders.supplementsChanged) {
    factors.push("supplements");
  }
  if (confounders.symptomsChanged) {
    factors.push("symptoms");
  }
  if (factors.length === 0) {
    return signalStatus === "established_pattern" ? "No major extra factors detected in this event." : null;
  }
  return `Potential extra factors: ${factors.join(", ")}.`;
};

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

const stdDev = (values: number[]): number => {
  if (values.length <= 1) {
    return 0;
  }
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const findMarkerInReport = (
  report: LabReport,
  markerName: string,
  options?: { preferRaw?: boolean }
): MarkerValue | null => {
  const matches = report.markers.filter((marker) => marker.canonicalMarker === markerName);
  if (matches.length === 0) {
    return null;
  }

  const preferRaw = options?.preferRaw ?? true;
  const sorted = [...matches].sort((left, right) => {
    if (preferRaw && Boolean(left.isCalculated) !== Boolean(right.isCalculated)) {
      return left.isCalculated ? 1 : -1;
    }
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }
    return right.value - left.value;
  });
  return sorted[0] ?? null;
};

const getEuMeasurement = (report: LabReport, markerName: string): { value: number; unit: string } | null => {
  const marker = findMarkerInReport(report, markerName, { preferRaw: true });
  if (!marker) {
    return null;
  }
  const converted = convertBySystem(marker.canonicalMarker, marker.value, marker.unit, "eu");
  if (!Number.isFinite(converted.value)) {
    return null;
  }
  return {
    value: converted.value,
    unit: converted.unit
  };
};

const normalizeInsulinUnit = (unit: string): string => unit.trim().toLowerCase().replace(/\s+/g, "");

const toInsulinMicroUnitsPerMl = (value: number, unit: string): number | null => {
  const normalized = normalizeInsulinUnit(unit);
  if (["µu/ml", "uu/ml", "μu/ml", "miu/l", "mu/l", "mu/liter", "mu/litre", "muu/l"].includes(normalized)) {
    return value;
  }
  if (["pmol/l", "pmoll"].includes(normalized)) {
    // Approximation for fasting insulin context: 1 µU/mL ≈ 6 pmol/L.
    return value / 6;
  }
  return null;
};

const normalizeGlucoseToMmol = (value: number, unit: string): number | null => {
  const normalized = unit.trim().toLowerCase().replace(/\s+/g, "");
  if (["mmol/l", "mmoll"].includes(normalized)) {
    return value;
  }
  if (["mg/dl", "mgdl"].includes(normalized)) {
    return value * 0.0555;
  }
  return null;
};

const buildCalculatedMarker = (
  canonicalMarker: string,
  value: number,
  unit: string,
  referenceMin: number | null = null,
  referenceMax: number | null = null
): MarkerValue => {
  const rounded = Math.abs(value) >= 10 ? ROUND_2(value) : ROUND_3(value);
  return {
    id: createId(),
    marker: canonicalMarker,
    canonicalMarker,
    value: rounded,
    unit,
    referenceMin,
    referenceMax,
    abnormal: deriveAbnormalFlag(rounded, referenceMin, referenceMax),
    confidence: 1,
    isCalculated: true,
    source: "calculated"
  };
};

interface DerivedMarkerOptions {
  enableCalculatedFreeTestosterone?: boolean;
  logCalculatedFreeTestosteroneDebug?: boolean;
}

const normalizeAlbuminToGramsPerLiter = (value: number, unit: string): number | null => {
  const normalized = unit.trim().toLowerCase().replace(/\s+/g, "");
  const extracted =
    normalized.match(/g\/dl|gdl|g\/l|gl/)?.[0] ??
    normalized;
  const unitToken = extracted.replace(/\s+/g, "");
  if (["g/l", "gl"].includes(unitToken)) {
    return value;
  }
  if (["g/dl", "gdl"].includes(unitToken)) {
    return value * 10;
  }
  return null;
};

const normalizeLooseMarkerText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractCoreUnitToken = (unit: string): string => {
  const normalized = unit.trim().toLowerCase().replace(/\s+/g, "");
  const token =
    normalized.match(/ng\/ml|ngml|ng\/dl|ngdl|nmol\/l|nmoll|pmol\/l|pmoll|pg\/ml|pgml|g\/l|gl|g\/dl|gdl/)?.[0] ??
    normalized;
  if (["ngml", "ng/ml"].includes(token)) {
    return "ng/mL";
  }
  if (["ngdl", "ng/dl"].includes(token)) {
    return "ng/dL";
  }
  if (["nmoll", "nmol/l"].includes(token)) {
    return "nmol/L";
  }
  if (["pmoll", "pmol/l"].includes(token)) {
    return "pmol/L";
  }
  if (["pgml", "pg/ml"].includes(token)) {
    return "pg/mL";
  }
  if (["gl", "g/l"].includes(token)) {
    return "g/L";
  }
  if (["gdl", "g/dl"].includes(token)) {
    return "g/dL";
  }
  return unit;
};

const findRequiredInputMarker = (
  rawMarkers: MarkerValue[],
  matcher: (marker: MarkerValue, normalizedCanonical: string, normalizedLabel: string) => boolean
): MarkerValue | null => {
  const scored = rawMarkers
    .map((marker) => {
      const normalizedCanonical = normalizeLooseMarkerText(marker.canonicalMarker);
      const normalizedLabel = normalizeLooseMarkerText(marker.marker);
      const matches = matcher(marker, normalizedCanonical, normalizedLabel);
      if (!matches) {
        return null;
      }
      return {
        marker,
        score: marker.confidence
      };
    })
    .filter((item): item is { marker: MarkerValue; score: number } => item !== null)
    .sort((left, right) => right.score - left.score);

  return scored[0]?.marker ?? null;
};

const normalizeForCalc = (
  marker: MarkerValue,
  expectedCanonical: "Testosterone" | "SHBG"
): { value: number; unit: string } | null => {
  const coreUnit = extractCoreUnitToken(marker.unit);
  const converted = convertBySystem(expectedCanonical, marker.value, coreUnit, "eu");
  if (!Number.isFinite(converted.value)) {
    return null;
  }
  if (expectedCanonical === "Testosterone" && converted.unit !== "nmol/L") {
    return null;
  }
  if (expectedCanonical === "SHBG" && converted.unit !== "nmol/L") {
    return null;
  }
  return {
    value: converted.value,
    unit: converted.unit
  };
};

interface FreeTestosteroneCalcInput {
  totalT_nmolL: number;
  shbg_nmolL: number;
  albumin_gL: number;
}

/**
 * Calculated Free Testosterone using a deterministic mass-action model
 * (commonly referred to as Vermeulen/Sodergard approach).
 *
 * Reference note:
 * - Vermeulen et al. J Clin Endocrinol Metab. 1999;84(10):3666-3672.
 */
const calcFreeTestosterone = (input: FreeTestosteroneCalcInput): number | null => {
  const { totalT_nmolL, shbg_nmolL, albumin_gL } = input;
  if (
    !Number.isFinite(totalT_nmolL) ||
    !Number.isFinite(shbg_nmolL) ||
    !Number.isFinite(albumin_gL) ||
    totalT_nmolL <= 0 ||
    shbg_nmolL <= 0 ||
    albumin_gL <= 0
  ) {
    return null;
  }

  const totalT = totalT_nmolL * 1e-9; // mol/L
  const shbg = shbg_nmolL * 1e-9; // mol/L
  const albumin = albumin_gL / 66500; // mol/L, albumin MW ~66.5 kDa
  const K_ALB = 3.6e4; // L/mol (albumin-testosterone association constant)
  const K_SHBG = 1e9; // L/mol (SHBG-testosterone association constant)

  const nonSpecificBinding = 1 + K_ALB * albumin;
  const a = K_SHBG * nonSpecificBinding;
  const b = nonSpecificBinding + K_SHBG * shbg - K_SHBG * totalT;
  const c = -totalT;
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || Math.abs(a) <= 1e-20) {
    return null;
  }

  const discriminant = b * b - 4 * a * c;
  if (!Number.isFinite(discriminant) || discriminant < 0) {
    return null;
  }

  const sqrtTerm = Math.sqrt(discriminant);
  const rootOne = (-b + sqrtTerm) / (2 * a);
  const rootTwo = (-b - sqrtTerm) / (2 * a);
  const freeTmolL = [rootOne, rootTwo]
    .filter((candidate) => Number.isFinite(candidate) && candidate >= 0)
    .sort((left, right) => left - right)[0];
  if (freeTmolL === undefined || !Number.isFinite(freeTmolL)) {
    return null;
  }

  const freeTnmolL = freeTmolL * 1e9;
  if (!Number.isFinite(freeTnmolL) || freeTnmolL < 0) {
    return null;
  }
  return freeTnmolL;
};

const computeCalculatedFreeTestosteroneMarker = (
  report: LabReport,
  rawMarkers: MarkerValue[],
  shouldLogDebug: boolean
): MarkerValue | null => {
  const debugPrefix = `[Calculated Free T] ${report.testDate} (${report.sourceFileName})`;
  const logSkip = (reason: string): null => {
    if (shouldLogDebug) {
      console.debug(`${debugPrefix} skipped: ${reason}`);
    }
    return null;
  };

  const testosteroneMarker =
    findRequiredInputMarker(rawMarkers, (marker, canonical, label) => {
      if (canonical === "testosterone") {
        return true;
      }
      if (label.includes("testosterone") || label.includes("testosteron")) {
        return !label.includes("free") && !label.includes("vrij");
      }
      return false;
    }) ?? null;
  if (!testosteroneMarker) {
    return logSkip("missing Total Testosterone");
  }
  const testosterone = normalizeForCalc(testosteroneMarker, "Testosterone");
  if (!testosterone) {
    return logSkip(`unsupported Total Testosterone unit: ${testosteroneMarker.unit}`);
  }

  const shbgMarker =
    findRequiredInputMarker(rawMarkers, (_marker, canonical, label) => {
      return canonical === "shbg" || label.includes("shbg") || label.includes("sex hormone binding");
    }) ?? null;
  if (!shbgMarker) {
    return logSkip("missing SHBG");
  }
  const shbg = normalizeForCalc(shbgMarker, "SHBG");
  if (!shbg) {
    return logSkip(`unsupported SHBG unit: ${shbgMarker.unit}`);
  }

  const albuminMarker =
    findRequiredInputMarker(rawMarkers, (_marker, canonical, label) => {
      const hasAlbumin = canonical.includes("albumin") || label.includes("albumin") || label.includes("albumine");
      const urineContext = canonical.includes("urine") || label.includes("urine") || label.includes("acr");
      return hasAlbumin && !urineContext;
    }) ?? null;
  if (!albuminMarker) {
    return logSkip("missing Albumin");
  }
  const albuminCoreUnit = extractCoreUnitToken(albuminMarker.unit);
  const albuminGL = normalizeAlbuminToGramsPerLiter(albuminMarker.value, albuminCoreUnit);
  if (albuminGL === null) {
    return logSkip(`unsupported Albumin unit: ${albuminMarker.unit}`);
  }

  const calculated = calcFreeTestosterone({
    totalT_nmolL: testosterone.value,
    shbg_nmolL: shbg.value,
    albumin_gL: albuminGL
  });
  if (calculated === null) {
    return logSkip("numerical solver failed");
  }

  if (shouldLogDebug) {
    console.debug(
      `${debugPrefix} computed`,
      {
        totalT_nmolL: ROUND_3(testosterone.value),
        shbg_nmolL: ROUND_3(shbg.value),
        albumin_gL: ROUND_3(albuminGL),
        freeT_nmolL: ROUND_3(calculated)
      }
    );
  }

  // Integrate calculated values into the existing Free Testosterone series.
  // `addDerived` already prevents overwriting measured Free Testosterone in the same report.
  return buildCalculatedMarker("Free Testosterone", calculated, "nmol/L");
};

export const deriveCalculatedMarkers = (
  report: LabReport,
  options: DerivedMarkerOptions = {}
): MarkerValue[] => {
  const rawMarkers = report.markers.filter((marker) => !marker.isCalculated);
  const rawByCanonical = new Set(rawMarkers.map((marker) => marker.canonicalMarker));
  const derived: MarkerValue[] = [];

  const addDerived = (marker: MarkerValue | null) => {
    if (!marker) {
      return;
    }
    if (rawByCanonical.has(marker.canonicalMarker)) {
      return;
    }
    if (derived.some((item) => item.canonicalMarker === marker.canonicalMarker)) {
      return;
    }
    derived.push(marker);
  };

  const testosterone = getEuMeasurement({ ...report, markers: rawMarkers }, "Testosterone");
  const estradiol = getEuMeasurement({ ...report, markers: rawMarkers }, "Estradiol");
  if (testosterone && estradiol && estradiol.value > 0.000001) {
    addDerived(buildCalculatedMarker("T/E2 Ratio", (testosterone.value * 1000) / estradiol.value, "ratio"));
  }

  const ldl = getEuMeasurement({ ...report, markers: rawMarkers }, "LDL Cholesterol");
  const hdl = getEuMeasurement({ ...report, markers: rawMarkers }, "HDL Cholesterol");
  if (ldl && hdl && hdl.value > 0.000001) {
    addDerived(buildCalculatedMarker("LDL/HDL Ratio", ldl.value / hdl.value, "ratio"));
  }

  const totalCholesterol = getEuMeasurement({ ...report, markers: rawMarkers }, "Cholesterol");
  if (totalCholesterol && hdl && totalCholesterol.unit === hdl.unit) {
    addDerived(buildCalculatedMarker("Non-HDL Cholesterol", totalCholesterol.value - hdl.value, totalCholesterol.unit));
  }

  const glucoseMarker = findMarkerInReport({ ...report, markers: rawMarkers }, "Glucose Nuchter", { preferRaw: true });
  const insulinMarker = findMarkerInReport({ ...report, markers: rawMarkers }, "Insuline", { preferRaw: true });
  if (glucoseMarker && insulinMarker) {
    const glucoseMmol = normalizeGlucoseToMmol(glucoseMarker.value, glucoseMarker.unit);
    const insulinU = toInsulinMicroUnitsPerMl(insulinMarker.value, insulinMarker.unit);
    if (glucoseMmol !== null && insulinU !== null) {
      addDerived(buildCalculatedMarker("HOMA-IR", (glucoseMmol * insulinU) / 22.5, "index"));
    }
  }

  if (testosterone) {
    const shbg = getEuMeasurement({ ...report, markers: rawMarkers }, "SHBG");
    if (shbg && shbg.value > 0.000001) {
      addDerived(buildCalculatedMarker("Free Androgen Index", (100 * testosterone.value) / shbg.value, "index"));
    }
  }

  if (options.enableCalculatedFreeTestosterone) {
    const calculatedFreeT = computeCalculatedFreeTestosteroneMarker(
      report,
      rawMarkers,
      Boolean(options.logCalculatedFreeTestosteroneDebug)
    );
    if (calculatedFreeT) {
      addDerived(calculatedFreeT);
    }
  }

  return derived;
};

export const enrichReportWithCalculatedMarkers = (
  report: LabReport,
  options: DerivedMarkerOptions = {}
): LabReport => {
  const rawMarkers = report.markers.filter((marker) => !marker.isCalculated);
  const calculated = deriveCalculatedMarkers({ ...report, markers: rawMarkers }, options);
  return {
    ...report,
    markers: [...rawMarkers, ...calculated]
  };
};

export const enrichReportsWithCalculatedMarkers = (
  reports: LabReport[],
  options: DerivedMarkerOptions = {}
): LabReport[] => reports.map((report) => enrichReportWithCalculatedMarkers(report, options));

export const filterReportsBySampling = (
  reports: LabReport[],
  samplingFilter: AppSettings["samplingFilter"]
): LabReport[] => {
  if (samplingFilter === "all") {
    return reports;
  }
  return reports.filter((report) => report.annotations.samplingTiming === samplingFilter);
};

export const buildMarkerSeries = (
  reports: LabReport[],
  markerName: string,
  unitSystem: AppSettings["unitSystem"],
  protocols: Protocol[] = [],
  supplementTimeline: SupplementPeriod[] = []
): MarkerSeriesPoint[] => {
  return sortReportsChronological(reports)
    .map((report) => {
      const marker = findMarkerInReport(report, markerName, { preferRaw: true });
      if (!marker) {
        return null;
      }

      const converted = convertBySystem(marker.canonicalMarker, marker.value, marker.unit, unitSystem);
      const convertedMin =
        marker.referenceMin === null
          ? null
          : convertBySystem(marker.canonicalMarker, marker.referenceMin, marker.unit, unitSystem).value;
      const convertedMax =
        marker.referenceMax === null
          ? null
          : convertBySystem(marker.canonicalMarker, marker.referenceMax, marker.unit, unitSystem).value;

      const protocol = getReportProtocol(report, protocols);
      const primaryFrequency = protocol?.compounds[0]?.frequency ?? "unknown";
      return {
        key: `${report.testDate}__${report.id}`,
        date: report.testDate,
        reportId: report.id,
        createdAt: report.createdAt,
        value: ROUND_3(converted.value),
        unit: converted.unit,
        referenceMin: convertedMin === null ? null : ROUND_3(convertedMin),
        referenceMax: convertedMax === null ? null : ROUND_3(convertedMax),
        abnormal: marker.abnormal,
        context: {
          dosageMgPerWeek: getProtocolDoseMgPerWeek(protocol),
          compound: getProtocolCompoundsText(protocol),
          injectionFrequency: primaryFrequency,
          protocol: protocol?.name ?? report.annotations.protocol,
          supplements: getReportSupplementsText(report, supplementTimeline),
          symptoms: report.annotations.symptoms,
          notes: report.annotations.notes,
          samplingTiming: report.annotations.samplingTiming
        },
        isCalculated: Boolean(marker.isCalculated)
      } satisfies MarkerSeriesPoint;
    })
    .filter((point): point is MarkerSeriesPoint => point !== null)
    .sort((left, right) => {
      const byDate = parseDateSafe(left.date) - parseDateSafe(right.date);
      if (byDate !== 0) {
        return byDate;
      }
      return Date.parse(left.createdAt) - Date.parse(right.createdAt);
    });
};

export const classifyMarkerTrend = (series: MarkerSeriesPoint[], marker: string): MarkerTrendSummary => {
  const values = series.map((point) => point.value);
  if (values.length < 2) {
    return {
      marker,
      direction: "stable",
      slope: 0,
      stdDev: 0,
      mean: values[0] ?? 0,
      explanation: "Insufficient points for trend classification."
    };
  }

  const trimmedValues = values.slice(-Math.min(values.length, 6));
  const regression = linearRegression(buildRegInput(trimmedValues));
  const slope = regression?.slope ?? 0;
  const seriesMean = mean(trimmedValues);
  const seriesStdDev = stdDev(trimmedValues);
  const coefficientOfVariation = Math.abs(seriesMean) <= 0.000001 ? 0 : seriesStdDev / Math.abs(seriesMean);
  const slopeRelative = Math.abs(seriesMean) <= 0.000001 ? 0 : slope / Math.abs(seriesMean);

  if (trimmedValues.length >= 4 && coefficientOfVariation > 0.2) {
    return {
      marker,
      direction: "volatile",
      slope: ROUND_3(slope),
      stdDev: ROUND_3(seriesStdDev),
      mean: ROUND_3(seriesMean),
      explanation: `Volatile pattern: variability is high (std dev ${ROUND_3(seriesStdDev)}).`
    };
  }

  if (slopeRelative > 0.03) {
    return {
      marker,
      direction: "rising",
      slope: ROUND_3(slope),
      stdDev: ROUND_3(seriesStdDev),
      mean: ROUND_3(seriesMean),
      explanation: "Rising trend based on positive linear regression slope."
    };
  }

  if (slopeRelative < -0.03) {
    return {
      marker,
      direction: "falling",
      slope: ROUND_3(slope),
      stdDev: ROUND_3(seriesStdDev),
      mean: ROUND_3(seriesMean),
      explanation: "Falling trend based on negative linear regression slope."
    };
  }

  return {
    marker,
    direction: "stable",
    slope: ROUND_3(slope),
    stdDev: ROUND_3(seriesStdDev),
    mean: ROUND_3(seriesMean),
    explanation: "Stable trend: slope remains close to zero."
  };
};

export const buildTrendSummaries = (
  reports: LabReport[],
  markerNames: string[],
  unitSystem: AppSettings["unitSystem"]
): MarkerTrendSummary[] =>
  markerNames.map((marker) => classifyMarkerTrend(buildMarkerSeries(reports, marker, unitSystem), marker));

const severityWeight = (alert: MarkerAlert): number => {
  if (alert.tone === "positive") {
    return 0;
  }
  return alert.severity === "high" ? 3 : alert.severity === "medium" ? 2 : 1;
};

const trendSuggestionByMarker = (
  marker: string,
  direction: "up" | "down",
  language: AppLanguage
): string => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  if (marker === "Testosterone") {
    return direction === "up"
      ? tr(
          "Bespreek of dit past bij je klachtenprofiel en monitor gelijktijdig estradiol + hematocriet; check ook consistente trough/peak-timing.",
          "Discuss whether this matches your symptom profile and monitor estradiol + hematocrit alongside it; also check consistent trough/peak timing."
        )
      : tr(
          "Bespreek mogelijke onderdosering of timing-effect; leg dit naast vrij testosteron, SHBG en symptomen.",
          "Discuss possible underdosing or timing effects; compare this with free testosterone, SHBG, and symptoms."
        );
  }

  if (marker === "Free Testosterone") {
    return direction === "up"
      ? tr(
          "Vergelijk dit met SHBG en klachten (energie/libido/stemming) om te bepalen of de vrije fractie passend stijgt.",
          "Compare this with SHBG and symptoms (energy/libido/mood) to assess whether the free fraction is rising appropriately."
        )
      : tr(
          "Bespreek of injectiefrequentie, timing of SHBG-verandering de daling verklaart.",
          "Discuss whether injection frequency, timing, or SHBG changes explain the drop."
        );
  }

  if (marker === "Estradiol") {
    return direction === "up"
      ? tr(
          "Bespreek balans met testosteron en mogelijke estrogene klachten; overweeg trendcontrole na protocolstabilisatie.",
          "Discuss balance versus testosterone and possible estrogenic symptoms; consider trend recheck after protocol stabilization."
        )
      : tr(
          "Bespreek of lagere estradiol past bij klachten (gewrichten/stemming/libido) en of de daling gewenst is.",
          "Discuss whether lower estradiol aligns with symptoms (joints/mood/libido) and whether the decline is desirable."
        );
  }

  if (marker === "Hematocrit") {
    return direction === "up"
      ? tr(
          "Bespreek bloedviscositeitsrisico, hydratatie, slaapapneu-screening en of dosis/frequentie-aanpassing nodig is.",
          "Discuss blood-viscosity risk, hydration, sleep-apnea screening, and whether dose/frequency adjustment is needed."
        )
      : tr(
          "Dalende trend kan gunstig zijn; bewaak tegelijk hemoglobine en ferritine om overcorrectie te voorkomen.",
          "A declining trend can be favorable; monitor hemoglobin and ferritin to avoid overcorrection."
        );
  }

  if (marker === "Ferritine") {
    return direction === "up"
      ? tr(
          "Bespreek of stijging past bij herstel of eerder inflammatie/ijzerstapeling; combineer met transferrine-saturatie.",
          "Discuss whether the rise reflects recovery or rather inflammation/iron loading; combine with transferrin saturation."
        )
      : tr(
          "Bespreek mogelijke ijzerdepletie (bijv. door bloedafnames) en evalueer ferritine + transferrine-saturatie samen.",
          "Discuss possible iron depletion (e.g., from phlebotomy) and evaluate ferritin with transferrin saturation together."
        );
  }

  if (marker === "LDL Cholesterol" || marker === "Non-HDL Cholesterol" || marker === "Apolipoprotein B") {
    return direction === "up"
      ? tr(
          "Bespreek cardiovasculaire risicosturing (voeding, beweging, gewichtsfactoren) en follow-up van lipiden/ApoB.",
          "Discuss cardiovascular risk control (diet, exercise, weight factors) and follow-up of lipids/ApoB."
        )
      : tr(
          "Dalende trend is vaak gunstig; bespreek hoe je huidige aanpak behouden kan blijven.",
          "A declining trend is often favorable; discuss how to maintain your current approach."
        );
  }

  if (marker === "eGFR") {
    return direction === "down"
      ? tr(
          "Bespreek nierfunctietrend met creatinine, hydratatie en bloeddruk in samenhang, liefst met herhaalmeting.",
          "Discuss kidney-function trend alongside creatinine, hydration, and blood pressure, ideally with repeat testing."
        )
      : tr(
          "Stijgende trend is vaak geruststellend; bevestig stabiliteit met periodieke controle.",
          "An upward trend is often reassuring; confirm stability with periodic checks."
        );
  }

  return tr(
    "Bespreek of meettiming, protocolwijziging of leefstijl deze trend verklaart en of extra controle zinvol is.",
    "Discuss whether sampling timing, protocol changes, or lifestyle explain this trend and whether extra monitoring is useful."
  );
};

const isGenerallyPositiveTrend = (
  marker: string,
  direction: "up" | "down",
  latest: MarkerSeriesPoint,
  prev: MarkerSeriesPoint | null
): boolean => {
  if (marker === "Homocysteine") {
    return direction === "down";
  }

  if (marker === "Vitamine B12") {
    return direction === "up";
  }

  if (marker === "Ferritine") {
    if (direction === "up") {
      return latest.value <= 200;
    }
    return Boolean(prev && prev.value > 200 && latest.value < prev.value);
  }

  return false;
};

const positiveTrendSuggestionByMarker = (
  marker: string,
  direction: "up" | "down",
  language: AppLanguage
): string => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  if (marker === "Homocysteine" && direction === "down") {
    return tr(
      "Dalende homocysteïne is meestal gunstig; houd je huidige aanpak aan en bevestig de trend bij volgende controle.",
      "Lower homocysteine is usually favorable; keep your current approach and confirm this trend at the next check."
    );
  }

  if (marker === "Vitamine B12" && direction === "up") {
    return tr(
      "Stijgende B12 is vaak gunstig in herstelcontext; blijf monitoren in combinatie met klachten en andere B-vitamine markers.",
      "Rising B12 is often favorable in a recovery context; keep monitoring alongside symptoms and other B-vitamin markers."
    );
  }

  if (marker === "Ferritine" && direction === "up") {
    return tr(
      "Stijgende ferritine kan passen bij herstel van ijzervoorraden; volg de trend samen met transferrine-saturatie.",
      "Rising ferritin can fit iron-store recovery; follow the trend together with transferrin saturation."
    );
  }

  if (marker === "Ferritine" && direction === "down") {
    return tr(
      "Dalende ferritine vanaf een hoge waarde kan gunstig zijn; blijf monitoren om overcorrectie te voorkomen.",
      "Falling ferritin from a high level can be favorable; keep monitoring to avoid overcorrection."
    );
  }

  return tr(
    "Deze trend lijkt gunstig; blijf monitoren met consistente meettiming.",
    "This trend appears favorable; continue monitoring with consistent sampling timing."
  );
};

const abnormalSuggestionByMarker = (
  marker: string,
  abnormal: "high" | "low",
  language: AppLanguage
): string => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  if (marker === "Hematocrit") {
    return abnormal === "high"
      ? tr(
          "Bespreek dosis/frequentie en hematologische follow-up; combineer met hemoglobine en ferritine.",
          "Discuss dose/frequency and hematology follow-up; combine with hemoglobin and ferritin."
        )
      : tr(
          "Lage hematocriet kan op depletie of anemie wijzen; bespreek volledige bloedbeeldcontext met je arts.",
          "Low hematocrit may indicate depletion or anemia; discuss full blood-count context with your doctor."
        );
  }

  if (marker === "Ferritine") {
    return abnormal === "low"
      ? tr(
          "Bespreek ijzerinname/suppletie en monitor ferritine, transferrine-saturatie en hemoglobine.",
          "Discuss iron intake/supplementation and monitor ferritin, transferrin saturation, and hemoglobin."
        )
      : tr(
          "Bespreek oorzaken van hoge ferritine (inflammatie/lever/ijzerstapeling) en eventuele vervolgdiagnostiek.",
          "Discuss causes of high ferritin (inflammation/liver/iron loading) and potential follow-up diagnostics."
        );
  }

  if (marker === "Estradiol") {
    return abnormal === "high"
      ? tr(
          "Bespreek verhouding met testosteron en klachtenpatroon; herhaal bij vergelijkbare meettiming.",
          "Discuss ratio with testosterone and symptom pattern; repeat with consistent sampling timing."
        )
      : tr(
          "Bespreek mogelijke lage-E2-klachten en of protocolfactoren dit verklaren.",
          "Discuss possible low-E2 symptoms and whether protocol factors explain this."
        );
  }

  if (marker === "Testosterone" || marker === "Free Testosterone") {
    return abnormal === "high"
      ? tr(
          "Bespreek of hogere androgenen passen bij doelen en bijwerkingenprofiel; monitor estradiol en hematocriet mee.",
          "Discuss whether higher androgen levels align with goals and side-effect profile; monitor estradiol and hematocrit alongside."
        )
      : tr(
          "Bespreek mogelijk tekort/onderdosering in relatie tot symptomen en meettiming.",
          "Discuss possible deficiency/underdosing in relation to symptoms and sampling timing."
        );
  }

  if (marker === "LDL Cholesterol" || marker === "Non-HDL Cholesterol" || marker === "Apolipoprotein B") {
    return abnormal === "high"
      ? tr(
          "Bespreek lipidenmanagement (voeding, activiteit, metabole factoren) en opvolgpanel met je arts.",
          "Discuss lipid management (diet, activity, metabolic factors) and follow-up panel with your doctor."
        )
      : tr(
          "Lage waarden zijn vaak gunstig; bevestig dat dit past bij de totale context.",
          "Low values are often favorable; confirm this fits the broader context."
        );
  }

  return tr(
    "Plaats deze afwijking in context van trend, referentiebereik en klachten voordat je iets aanpast.",
    "Place this abnormality in trend, reference-range, and symptom context before adjusting anything."
  );
};

export const buildAlerts = (
  reports: LabReport[],
  markerNames: string[],
  unitSystem: AppSettings["unitSystem"],
  language: AppLanguage = "en"
): MarkerAlert[] => {
  const alerts: MarkerAlert[] = [];
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  for (const marker of markerNames) {
    const series = buildMarkerSeries(reports, marker, unitSystem);
    if (series.length === 0) {
      continue;
    }
    const latest = series[series.length - 1];
    const prev = series[series.length - 2] ?? null;
    const last3 = series.slice(-3).map((point) => point.value);

    if (marker === "Hematocrit" && latest.value > 52) {
      alerts.push({
        id: `${marker}-hct-threshold`,
        marker,
        type: "threshold",
        severity: "high",
        tone: "attention",
        actionNeeded: true,
        message: tr(`Hematocriet is ${ROUND_2(latest.value)}% (> 52%).`, `Hematocrit is ${ROUND_2(latest.value)}% (> 52%).`),
        suggestion: tr(
          "Bespreek dosis/frequentie, hydratatie en eventueel bloedafnamebeleid met je arts. Monitor hematocriet, hemoglobine en ferritine.",
          "Discuss dose/frequency, hydration, and possible phlebotomy approach with your doctor. Monitor hematocrit, hemoglobin, and ferritin."
        ),
        date: latest.date
      });
    } else if (marker === "Hematocrit" && latest.value >= 42 && latest.value <= 52) {
      alerts.push({
        id: `${marker}-hct-positive`,
        marker,
        type: "threshold",
        severity: "low",
        tone: "positive",
        actionNeeded: false,
        message: tr(`Hematocriet is ${ROUND_2(latest.value)}% en ligt binnen een werkbare zone.`, `Hematocrit is ${ROUND_2(latest.value)}% and in a workable zone.`),
        suggestion: tr("Geen directe aanpassing nodig; houd routinematige controles aan.", "No immediate change needed; keep routine monitoring."),
        date: latest.date
      });
    }

    if (marker === "LDL Cholesterol" && latest.value > 3.5) {
      alerts.push({
        id: `${marker}-ldl-threshold`,
        marker,
        type: "threshold",
        severity: "medium",
        tone: "attention",
        actionNeeded: true,
        message: tr(`LDL is ${ROUND_2(latest.value)} ${latest.unit} (> 3,5).`, `LDL is ${ROUND_2(latest.value)} ${latest.unit} (> 3.5).`),
        suggestion: tr(
          "Bespreek voeding, beweging, gewichtsdoelen en eventueel aanvullende cardiovasculaire markers met je arts.",
          "Discuss diet, exercise, weight targets, and optional cardiovascular marker follow-up with your doctor."
        ),
        date: latest.date
      });
    } else if (marker === "LDL Cholesterol" && latest.value <= 3) {
      alerts.push({
        id: `${marker}-ldl-positive`,
        marker,
        type: "threshold",
        severity: "low",
        tone: "positive",
        actionNeeded: false,
        message: tr(`LDL is ${ROUND_2(latest.value)} ${latest.unit}, over het algemeen gunstig.`, `LDL is ${ROUND_2(latest.value)} ${latest.unit}, generally favorable.`),
        suggestion: tr("Huidige aanpak lijkt werkbaar; periodiek blijven controleren.", "Current approach looks workable; continue periodic checks."),
        date: latest.date
      });
    }

    if (marker === "Ferritine" && (latest.value < 40 || latest.value > 200)) {
      const lowFerritin = latest.value < 40;
      alerts.push({
        id: `${marker}-ferritin-threshold`,
        marker,
        type: "threshold",
        severity: "medium",
        tone: "attention",
        actionNeeded: true,
        message: tr(`Ferritine is ${ROUND_2(latest.value)} ${latest.unit} (buiten 40-200).`, `Ferritine is ${ROUND_2(latest.value)} ${latest.unit} (outside 40-200).`),
        suggestion: lowFerritin
          ? tr(
              "Bespreek ijzerstatusherstel met je arts (voeding/suppletie) en monitor ferritine, transferrine-saturatie en hemoglobine.",
              "Discuss iron-status recovery with your doctor (nutrition/supplementation) and monitor ferritin, transferrin saturation, and hemoglobin."
            )
          : tr(
              "Bespreek mogelijke oorzaken van hoge ferritine (inflammatie, lever, ijzerstapeling) en vervolgtesten met je arts.",
              "Discuss possible causes of high ferritin (inflammation, liver, iron overload) and follow-up testing with your doctor."
            ),
        date: latest.date
      });
    } else if (marker === "Ferritine" && latest.value >= 40 && latest.value <= 200) {
      alerts.push({
        id: `${marker}-ferritin-positive`,
        marker,
        type: "threshold",
        severity: "low",
        tone: "positive",
        actionNeeded: false,
        message: tr(
          `Ferritine is ${ROUND_2(latest.value)} ${latest.unit} en ligt binnen het beoogde bereik.`,
          `Ferritin is ${ROUND_2(latest.value)} ${latest.unit} and within the target range.`
        ),
        suggestion: tr("Geen directe actie nodig; blijf periodiek monitoren.", "No immediate action needed; keep periodic monitoring."),
        date: latest.date
      });
    }

    if (marker === "eGFR") {
      const belowReference = latest.referenceMin !== null && latest.value < latest.referenceMin;
      const belowConservativeCutoff = latest.value < 60;
      if (belowReference || belowConservativeCutoff) {
        alerts.push({
          id: `${marker}-egfr-threshold`,
          marker,
          type: "threshold",
          severity: "high",
          tone: "attention",
          actionNeeded: true,
          message: tr(
            `eGFR is ${ROUND_2(latest.value)} ${latest.unit}, onder het doelbereik.`,
            `eGFR is ${ROUND_2(latest.value)} ${latest.unit}, below target range.`
          ),
          suggestion: tr(
            "Bespreek nierfunctie-opvolging met je arts en check trends samen met creatinine, bloeddruk en hydratatie.",
            "Discuss kidney-function follow-up with your doctor and review trends with creatinine, blood pressure, and hydration."
          ),
          date: latest.date
        });
      } else if (latest.value >= 90) {
        alerts.push({
          id: `${marker}-egfr-positive`,
          marker,
          type: "threshold",
          severity: "low",
          tone: "positive",
          actionNeeded: false,
          message: tr(`eGFR is ${ROUND_2(latest.value)} ${latest.unit}, over het algemeen gunstig.`, `eGFR is ${ROUND_2(latest.value)} ${latest.unit}, generally favorable.`),
          suggestion: tr("Huidige monitoring aanhouden.", "Keep current monitoring cadence."),
          date: latest.date
        });
      }
    }

    if (latest.abnormal === "high" || latest.abnormal === "low") {
      const abnormalLabel = latest.abnormal === "high" ? tr("hoog", "high") : tr("laag", "low");
      alerts.push({
        id: `${marker}-abnormal-latest`,
        marker,
        type: "threshold",
        severity: "low",
        tone: "attention",
        actionNeeded: true,
        message: tr(
          `Laatste meting van ${marker} is gemarkeerd als ${abnormalLabel}.`,
          `Latest ${marker} is flagged as ${abnormalLabel}.`
        ),
        suggestion: abnormalSuggestionByMarker(marker, latest.abnormal, language),
        date: latest.date
      });
    }

    if (last3.length === 3) {
      const increasing = last3[2] > last3[1] && last3[1] > last3[0];
      const decreasing = last3[2] < last3[1] && last3[1] < last3[0];
      if (increasing || decreasing) {
        const direction: "up" | "down" = increasing ? "up" : "down";
        const positiveTrend = isGenerallyPositiveTrend(marker, direction, latest, prev);
        alerts.push({
          id: `${marker}-trend-consecutive`,
          marker,
          type: "trend",
          severity: positiveTrend ? "low" : "medium",
          tone: positiveTrend ? "positive" : "attention",
          actionNeeded: !positiveTrend,
          message: tr(
            positiveTrend
              ? `${marker} laat een gunstige trend zien (${increasing ? "3 opeenvolgende stijgingen" : "3 opeenvolgende dalingen"}).`
              : `${marker} heeft ${increasing ? "3 opeenvolgende stijgingen" : "3 opeenvolgende dalingen"}.`,
            positiveTrend
              ? `${marker} shows a favorable trend (${increasing ? "3 consecutive increases" : "3 consecutive decreases"}).`
              : `${marker} has ${increasing ? "3 consecutive increases" : "3 consecutive decreases"}.`
          ),
          suggestion: positiveTrend
            ? positiveTrendSuggestionByMarker(marker, direction, language)
            : trendSuggestionByMarker(marker, direction, language),
          date: latest.date
        });
      }
    }

    if (prev && Math.abs(prev.value) > 0.000001) {
      const percent = ((latest.value - prev.value) / prev.value) * 100;
      if (Math.abs(percent) >= 20) {
        const direction = percent > 0 ? "up" : "down";
        const positiveTrend = isGenerallyPositiveTrend(marker, direction, latest, prev);
        alerts.push({
          id: `${marker}-trend-percent`,
          marker,
          type: "trend",
          severity: positiveTrend ? "low" : Math.abs(percent) >= 35 ? "high" : "medium",
          tone: positiveTrend ? "positive" : "attention",
          actionNeeded: !positiveTrend,
          message: positiveTrend
            ? tr(
                `${marker} veranderde ${percent > 0 ? "+" : ""}${ROUND_2(percent)}% in een gunstige richting.`,
                `${marker} changed ${percent > 0 ? "+" : ""}${ROUND_2(percent)}% in a favorable direction.`
              )
            : tr(
                `${marker} veranderde ${percent > 0 ? "+" : ""}${ROUND_2(percent)}% t.o.v. de vorige meting.`,
                `${marker} changed ${percent > 0 ? "+" : ""}${ROUND_2(percent)}% vs previous test.`
              ),
          suggestion: positiveTrend
            ? positiveTrendSuggestionByMarker(marker, direction, language)
            : trendSuggestionByMarker(marker, direction, language),
          date: latest.date
        });
      }
    }
  }

  return alerts.sort((left, right) => {
    const severityDiff = severityWeight(right) - severityWeight(left);
    if (severityDiff !== 0) {
      return severityDiff;
    }
    return parseDateSafe(right.date) - parseDateSafe(left.date);
  });
};

export const buildAlertsByMarker = (alerts: MarkerAlert[]): Record<string, MarkerAlert[]> => {
  return alerts.reduce(
    (acc, alert) => {
      if (!acc[alert.marker]) {
        acc[alert.marker] = [];
      }
      acc[alert.marker].push(alert);
      return acc;
    },
    {} as Record<string, MarkerAlert[]>
  );
};

const TRT_COMPONENT_MARKERS = ["Testosterone", "Estradiol", "Hematocrit", "SHBG"] as const;
const TRT_WEIGHTS: Record<(typeof TRT_COMPONENT_MARKERS)[number], number> = {
  Testosterone: 0.35,
  Estradiol: 0.25,
  Hematocrit: 0.25,
  SHBG: 0.15
};

export const computeTrtStabilityIndex = (
  reports: LabReport[],
  unitSystem: AppSettings["unitSystem"] = "eu"
): TrtStabilityResult => {
  const components: TrtStabilityResult["components"] = {};
  let weightedSum = 0;
  let weightTotal = 0;

  for (const marker of TRT_COMPONENT_MARKERS) {
    const series = buildMarkerSeries(reports, marker, unitSystem);
    if (series.length < 2) {
      continue;
    }
    const values = series.map((point) => point.value);
    const avg = mean(values);
    const variation = stdDev(values);
    const cv = Math.abs(avg) <= 0.000001 ? 0 : variation / Math.abs(avg);

    /**
     * TRT Stability formula:
     * 1) Compute coefficient of variation (CV = stddev / mean) per core marker.
     * 2) Convert to marker score with: score = clamp(100 - CV * 220, 0, 100).
     * 3) Composite score = weighted average:
     *    Testosterone 35%, Estradiol 25%, Hematocrit 25%, SHBG 15%.
     * Lower variance increases the final score.
     */
    const markerScore = clip(100 - cv * 220, 0, 100);
    components[marker] = ROUND_2(markerScore);
    weightedSum += markerScore * TRT_WEIGHTS[marker];
    weightTotal += TRT_WEIGHTS[marker];
  }

  if (weightTotal === 0) {
    return {
      score: null,
      components
    };
  }

  return {
    score: Math.round(weightedSum / weightTotal),
    components
  };
};

export const buildTrtStabilitySeries = (
  reports: LabReport[],
  unitSystem: AppSettings["unitSystem"] = "eu"
): TrtStabilityPoint[] => {
  const sorted = sortReportsChronological(reports);
  const points: TrtStabilityPoint[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const subset = sorted.slice(0, index + 1);
    const score = computeTrtStabilityIndex(subset, unitSystem).score;
    if (score === null) {
      continue;
    }
    const report = sorted[index];
    points.push({
      key: `${report.testDate}__${report.id}`,
      date: report.testDate,
      score
    });
  }
  return points;
};

export const extractProtocolFrequencyPerWeek = (protocol: Protocol | null): number | null => getProtocolFrequencyPerWeek(protocol);

const protocolConfidenceLabel = (pointsUsed: number, total: number): "High" | "Medium" | "Low" => {
  if (pointsUsed >= 4 && total >= 6) {
    return "High";
  }
  if (pointsUsed >= 3 && total >= 4) {
    return "Medium";
  }
  return "Low";
};

export const buildProtocolImpactSummary = (
  reports: LabReport[],
  unitSystem: AppSettings["unitSystem"],
  protocols: Protocol[] = [],
  supplementTimeline: SupplementPeriod[] = []
): ProtocolImpactSummary => {
  const sorted = sortReportsChronological(reports);
  const events: ProtocolImpactSummary["events"] = [];
  const insights: ProtocolImpactInsight[] = [];
  if (sorted.length < 3) {
    return { events, insights };
  }

  const candidateMarkers = Array.from(
    new Set([
      ...PRIMARY_MARKERS,
      "Apolipoprotein B",
      "LDL Cholesterol",
      "Ferritine",
      "Hemoglobin",
      "Non-HDL Cholesterol"
    ])
  );

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const previousProtocol = getReportProtocol(previous, protocols);
    const currentProtocol = getReportProtocol(current, protocols);

    const previousDose = getProtocolDoseMgPerWeek(previousProtocol);
    const currentDose = getProtocolDoseMgPerWeek(currentProtocol);
    const frequencyFrom = extractProtocolFrequencyPerWeek(previousProtocol);
    const frequencyTo = extractProtocolFrequencyPerWeek(currentProtocol);
    const compoundFrom = getProtocolCompoundsText(previousProtocol);
    const compoundTo = getProtocolCompoundsText(currentProtocol);
    const compoundChanged = normalizeProtocolText(compoundFrom) !== normalizeProtocolText(compoundTo);
    const protocolTextChanged =
      normalizeProtocolText(previousProtocol?.name ?? previous.annotations.protocol) !==
      normalizeProtocolText(currentProtocol?.name ?? current.annotations.protocol);
    const doseChanged = previousDose !== currentDose;
    const frequencyChanged = frequencyFrom !== null && frequencyTo !== null && Math.abs(frequencyFrom - frequencyTo) > 0.01;

    if (!doseChanged && !frequencyChanged && !compoundChanged && !protocolTextChanged) {
      continue;
    }

    const triggerParts: string[] = [];
    if (doseChanged) {
      triggerParts.push(`Dose ${previousDose ?? "unknown"} -> ${currentDose ?? "unknown"} mg/week`);
    }
    if (frequencyChanged) {
      triggerParts.push(`Frequency ${ROUND_2(frequencyFrom ?? 0)} -> ${ROUND_2(frequencyTo ?? 0)} /week`);
    }
    if (compoundChanged) {
      triggerParts.push(`Compound ${compoundFrom || "unknown"} -> ${compoundTo || "unknown"}`);
    }
    if (protocolTextChanged) {
      triggerParts.push("Protocol details changed");
    }
    const trigger = triggerParts.join("; ");

    events.push({
      date: current.testDate,
      doseFrom: previousDose,
      doseTo: currentDose,
      frequencyFrom,
      frequencyTo,
      protocolFrom: previousProtocol?.name ?? previous.annotations.protocol,
      protocolTo: currentProtocol?.name ?? current.annotations.protocol,
      trigger
    });

    for (const marker of candidateMarkers) {
      const markerSeries = buildMarkerSeries(sorted, marker, unitSystem, protocols, supplementTimeline);
      if (markerSeries.length < 3) {
        continue;
      }

      const previousPoint = markerSeries.find((point) => point.reportId === previous.id);
      const currentPoint = markerSeries.find((point) => point.reportId === current.id);
      if (!previousPoint || !currentPoint) {
        continue;
      }

      const preWindow = markerSeries.filter((point) => parseDateSafe(point.date) <= parseDateSafe(previous.testDate)).slice(-2);
      const postWindow = markerSeries.filter((point) => parseDateSafe(point.date) >= parseDateSafe(current.testDate)).slice(0, 2);
      if (preWindow.length === 0 || postWindow.length === 0) {
        continue;
      }

      const preAvg = mean(preWindow.map((point) => point.value));
      const postAvg = mean(postWindow.map((point) => point.value));
      const delta = postAvg - preAvg;
      const percent = Math.abs(preAvg) <= 0.000001 ? null : (delta / preAvg) * 100;
      const confidence = protocolConfidenceLabel(preWindow.length + postWindow.length, markerSeries.length);

      insights.push({
        marker,
        eventDate: current.testDate,
        trigger,
        fromValue: ROUND_2(preAvg),
        toValue: ROUND_2(postAvg),
        delta: ROUND_2(delta),
        percentChange: percent === null ? null : ROUND_2(percent),
        unit: currentPoint.unit,
        confidence
      });
    }
  }

  return {
    events,
    insights: insights.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
  };
};

export const buildProtocolImpactDoseEvents = (
  reports: LabReport[],
  unitSystem: AppSettings["unitSystem"],
  windowSize: number,
  protocols: Protocol[] = [],
  supplementTimeline: SupplementPeriod[] = []
): ProtocolImpactDoseEvent[] => {
  const sorted = sortReportsChronological(reports);
  if (sorted.length < 2) {
    return [];
  }

  const safeWindowDays = clip(Math.round(windowSize), 21, 90);
  const events: ProtocolImpactDoseEvent[] = [];

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const previousProtocol = getReportProtocol(previous, protocols);
    const currentProtocol = getReportProtocol(current, protocols);

    const previousDose = getProtocolDoseMgPerWeek(previousProtocol);
    const currentDose = getProtocolDoseMgPerWeek(currentProtocol);
    const previousFrequency = extractProtocolFrequencyPerWeek(previousProtocol);
    const currentFrequency = extractProtocolFrequencyPerWeek(currentProtocol);
    const previousCompoundCanonical = canonicalCompoundSet(previousProtocol);
    const currentCompoundCanonical = canonicalCompoundSet(currentProtocol);
    const previousCompounds = displayCompoundSet(previousProtocol);
    const currentCompounds = displayCompoundSet(currentProtocol);

    const doseDelta = previousDose === null || currentDose === null ? null : currentDose - previousDose;
    const frequencyDelta =
      previousFrequency === null || currentFrequency === null ? null : currentFrequency - previousFrequency;
    const doseTriggered = doseDelta !== null && Math.abs(doseDelta) >= 1;
    const frequencyTriggered = frequencyDelta !== null && Math.abs(frequencyDelta) >= 0.25;
    const compoundChanged = !setsEqual(previousCompoundCanonical, currentCompoundCanonical);

    if (!doseTriggered && !frequencyTriggered && !compoundChanged) {
      continue;
    }

    const hasPreviousProtocolSignal =
      previousCompounds.length > 0 || previousDose !== null || previousFrequency !== null;
    const hasCurrentProtocolSignal = currentCompounds.length > 0 || currentDose !== null || currentFrequency !== null;
    const eventSubType: ProtocolImpactDoseEvent["eventSubType"] =
      !hasPreviousProtocolSignal && hasCurrentProtocolSignal ? "start" : "adjustment";

    const eventType = protocolImpactEventType(doseTriggered, frequencyTriggered, compoundChanged);
    const dosePart = doseDelta === null ? 0 : Math.min(Math.abs(doseDelta) / 40, 1) * 40;
    const frequencyPart = frequencyDelta === null ? 0 : Math.min(Math.abs(frequencyDelta) / 2, 1) * 30;
    const compoundPart = compoundChanged ? 30 : 0;
    const triggerStrength = Math.round(dosePart + frequencyPart + compoundPart);

    const changeDateTs = parseDateSafe(current.testDate);
    const preStartTs = changeDateTs - safeWindowDays * DAY_MS;
    const preEndTs = changeDateTs - DAY_MS;
    const baselinePostStartTs = changeDateTs + PROTOCOL_IMPACT_MARKER_LAG_DAYS.hormones * DAY_MS;
    const baselinePostEndTs = baselinePostStartTs + safeWindowDays * DAY_MS;
    const beforeReports = sorted.filter((report) => {
      const reportTs = parseDateSafe(report.testDate);
      return reportTs >= preStartTs && reportTs <= preEndTs;
    });
    const baselineAfterReports = sorted.filter((report) => {
      const reportTs = parseDateSafe(report.testDate);
      return reportTs >= baselinePostStartTs && reportTs <= baselinePostEndTs;
    });

    const candidateRangeEndTs = changeDateTs + (safeWindowDays + PROTOCOL_IMPACT_MAX_LAG_DAYS) * DAY_MS;
    const candidateReports = sorted.filter((report) => {
      const reportTs = parseDateSafe(report.testDate);
      return reportTs >= preStartTs && reportTs <= candidateRangeEndTs;
    });

    const markerSet = new Set<string>();
    candidateReports.forEach((report) => {
      report.markers.forEach((marker) => {
        if (!marker.isCalculated) {
          markerSet.add(marker.canonicalMarker);
        }
      });
    });

    const preSampling = dominantSamplingTiming(beforeReports);
    const postSampling = dominantSamplingTiming(baselineAfterReports);
    const previousSupplements = canonicalSupplementSet(previous, supplementTimeline);
    const currentSupplements = canonicalSupplementSet(current, supplementTimeline);
    const previousSymptoms = normalizeProtocolText(previous.annotations.symptoms);
    const currentSymptoms = normalizeProtocolText(current.annotations.symptoms);

    const confounders: ProtocolImpactDoseEvent["confounders"] = {
      samplingChanged: preSampling !== null && postSampling !== null && preSampling !== postSampling,
      supplementsChanged: !setsEqual(previousSupplements, currentSupplements),
      symptomsChanged:
        previousSymptoms !== currentSymptoms && (previousSymptoms.length > 0 || currentSymptoms.length > 0)
    };
    const confounderPenalty =
      (confounders.samplingChanged ? 15 : 0) +
      (confounders.supplementsChanged ? 10 : 0) +
      (confounders.symptomsChanged ? 10 : 0);

    const rows: ProtocolImpactMarkerRow[] = Array.from(markerSet)
      .map((marker) => {
        const lagDays = markerLagDays(marker);
        const markerPostStartTs = changeDateTs + lagDays * DAY_MS;
        const markerPostEndTs = markerPostStartTs + safeWindowDays * DAY_MS;
        const markerSeries = buildMarkerSeries(sorted, marker, unitSystem, protocols, supplementTimeline);

        const beforeSeries = markerSeries.filter((point) => {
          const pointTs = parseDateSafe(point.date);
          return pointTs >= preStartTs && pointTs <= preEndTs;
        });
        const afterSeries = markerSeries.filter((point) => {
          const pointTs = parseDateSafe(point.date);
          return pointTs >= markerPostStartTs && pointTs <= markerPostEndTs;
        });

        const previousEventPoint = markerSeries.find((point) => point.reportId === previous.id) ?? null;
        const currentEventPoint = markerSeries.find((point) => point.reportId === current.id) ?? null;

        let beforeValues = beforeSeries.map((point) => point.value);
        const beforeSource: ProtocolImpactMarkerRow["beforeSource"] = beforeValues.length > 0 ? "window" : "none";
        if (beforeValues.length === 0 && previousEventPoint) {
          beforeValues = [previousEventPoint.value];
        }
        const baselineAgeDays: number | null = null;
        let afterValues = afterSeries.map((point) => point.value);
        if (afterValues.length === 0 && currentEventPoint) {
          afterValues = [currentEventPoint.value];
        }
        const nBefore = beforeValues.length;
        const nAfter = afterValues.length;
        const beforeAvg = beforeValues.length > 0 ? mean(beforeValues) : null;
        const afterAvg = afterValues.length > 0 ? mean(afterValues) : null;
        const deltaAbs = beforeAvg === null || afterAvg === null ? null : afterAvg - beforeAvg;
        const deltaPct = beforeAvg === null || afterAvg === null ? null : calculatePercentChange(afterAvg, beforeAvg);
        const trend = trendFromDelta(deltaAbs);
        const insufficientData = nBefore === 0 || nAfter === 0;
        const readinessStatus = protocolImpactReadinessStatus(nBefore, nAfter);
        const recommendedNextTestDate =
          nAfter === 0 ? dateToIso(changeDateTs + (lagDays + 14) * DAY_MS) : null;
        const consistencyScore = protocolImpactConsistencyScore(beforeAvg, afterValues, deltaAbs);
        const sampleScore = protocolImpactSampleScore(nBefore, nAfter);
        const effectScore = protocolImpactEffectScore(deltaPct);
        const clinicalWeight = PROTOCOL_IMPACT_CLINICAL_WEIGHTS[marker] ?? PROTOCOL_IMPACT_DEFAULT_CLINICAL_WEIGHT;
        const impactScore = Math.round(0.55 * effectScore + 0.45 * clinicalWeight);
        const effectClarityScore = protocolImpactEffectClarityScore(deltaPct, deltaAbs, beforeValues, afterValues);
        const baselinePenalty = 0;
        const totalPenalty = confounderPenalty;
        let confidenceScore = Math.round(
          clip(
            0.35 * sampleScore +
              0.25 * consistencyScore +
              0.2 * triggerStrength +
              0.2 * effectClarityScore -
              totalPenalty,
            0,
            100
          )
        );
        if (insufficientData) {
          confidenceScore = Math.min(confidenceScore, 40);
        }
        const confidence = confidenceLabelFromScore(confidenceScore);
        const confidenceReason =
          insufficientData && nAfter === 0
            ? "Too few measurements in the post window."
            : insufficientData && nBefore === 0
              ? "Too few measurements in the pre window."
              : protocolImpactConfidenceReason(nBefore, nAfter, consistencyScore, triggerStrength, confounderPenalty, baselinePenalty);
        const signalStatus = protocolImpactMarkerSignalStatus(
          insufficientData,
          nBefore,
          nAfter,
          confidenceScore,
          confounderPenalty
        );
        const deltaDirectionLabel = protocolImpactDeltaDirectionLabel(trend);
        const usedEventReportsFallback = (beforeSeries.length === 0 && beforeValues.length > 0) || (afterSeries.length === 0 && afterValues.length > 0);
        const contextHint = usedEventReportsFallback
          ? "Used nearest pre/post event measurements because lag-window data was missing."
          : insufficientData && nAfter === 0
            ? "Waiting for lag-adjusted post-change measurements."
            : insufficientData && nBefore === 0
              ? "Waiting for pre-window measurements."
              : null;
        const narrativeShort = protocolImpactMarkerNarrativeShort(
          marker,
          deltaPct,
          trend,
          insufficientData
        );
        const narrative = protocolImpactMarkerNarrative(
          marker,
          deltaPct,
          trend,
          confidence,
          insufficientData,
          nBefore,
          nAfter,
          beforeSource
        );
        const unit = afterSeries[0]?.unit ?? beforeSeries[0]?.unit ?? markerSeries[0]?.unit ?? "";

        return {
          marker,
          unit,
          beforeAvg: beforeAvg === null ? null : ROUND_2(beforeAvg),
          beforeSource,
          comparisonBasis: insufficientData ? "insufficient" : usedEventReportsFallback ? "event_reports" : "local_pre_post",
          baselineAgeDays,
          afterAvg: afterAvg === null ? null : ROUND_2(afterAvg),
          deltaAbs: deltaAbs === null ? null : ROUND_2(deltaAbs),
          deltaPct: deltaPct === null ? null : ROUND_2(deltaPct),
          trend,
          confidence,
          confidenceReason,
          insufficientData,
          impactScore,
          confidenceScore,
          lagDays,
          nBefore,
          nAfter,
          readinessStatus,
          recommendedNextTestDate,
          signalStatus,
          deltaDirectionLabel,
          contextHint,
          narrativeShort,
          narrative
        } satisfies ProtocolImpactMarkerRow;
      })
      .sort((left, right) => {
        if (left.insufficientData !== right.insufficientData) {
          return left.insufficientData ? 1 : -1;
        }
        if (right.impactScore !== left.impactScore) {
          return right.impactScore - left.impactScore;
        }
        const leftAbs = left.deltaPct === null ? -1 : Math.abs(left.deltaPct);
        const rightAbs = right.deltaPct === null ? -1 : Math.abs(right.deltaPct);
        return rightAbs - leftAbs;
      });

    const topImpacts = selectTopChangedMarkers(rows);
    const lagDaysByMarker = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.marker] = row.lagDays;
      return acc;
    }, {});
    const eventConfidence = protocolImpactEventConfidence(rows);
    const signalStatus = protocolImpactEventSignalStatus(rows, eventConfidence.score);
    const signalStatusLabel = signalStatusLabelFromStatus(signalStatus);
    const signalNextStep = protocolImpactSignalNextStep(signalStatus, eventSubType, rows, confounders);
    const anchorCompound = currentCompounds[0] ?? previousCompounds[0] ?? "Protocol";
    const headlineNarrative = protocolImpactEventHeadline({
      eventType,
      eventSubType,
      changeDate: current.testDate,
      anchorCompound,
      fromDose: previousDose,
      toDose: currentDose,
      fromFrequency: previousFrequency,
      toFrequency: currentFrequency,
      fromCompounds: previousCompounds,
      toCompounds: currentCompounds
    });
    const storyObserved = protocolImpactObservedNarrative(topImpacts);
    const storyInterpretation = protocolImpactInterpretationNarrative(signalStatus, rows, confounders);
    const storyContextHint = protocolImpactContextHint(signalStatus, confounders);

    const storyChange = protocolImpactEventHeadline({
      eventType,
      eventSubType,
      changeDate: current.testDate,
      anchorCompound,
      fromDose: previousDose,
      toDose: currentDose,
      fromFrequency: previousFrequency,
      toFrequency: currentFrequency,
      fromCompounds: previousCompounds,
      toCompounds: currentCompounds
    });
    const storyEffect = storyObserved;
    const storyReliability = storyInterpretation;
    const storySummary = `${storyChange} ${storyEffect} ${storyReliability}`;

    events.push({
      id: `${previous.id}-${current.id}`,
      fromDose: previousDose,
      toDose: currentDose,
      fromFrequency: previousFrequency,
      toFrequency: currentFrequency,
      fromCompounds: previousCompounds,
      toCompounds: currentCompounds,
      changeDate: current.testDate,
      beforeCount: beforeReports.length,
      afterCount: baselineAfterReports.length,
      beforeWindow: {
        start: dateToIso(preStartTs),
        end: dateToIso(preEndTs)
      },
      afterWindow: {
        start: dateToIso(baselinePostStartTs),
        end: dateToIso(baselinePostEndTs)
      },
      eventType,
      eventSubType,
      triggerStrength,
      eventConfidenceScore: eventConfidence.score,
      eventConfidence: eventConfidence.label,
      signalStatus,
      signalStatusLabel,
      signalNextStep,
      comparisonBasis: "local_pre_post",
      headlineNarrative,
      storyObserved,
      storyInterpretation,
      storyContextHint,
      storyChange,
      storyEffect,
      storyReliability,
      storySummary,
      confounders,
      lagDaysByMarker,
      rows,
      topImpacts
    });
  }

  return events.sort((left, right) => parseDateSafe(right.changeDate) - parseDateSafe(left.changeDate));
};

export const buildDoseCorrelationInsights = (
  reports: LabReport[],
  markerNames: string[],
  unitSystem: AppSettings["unitSystem"],
  protocols: Protocol[] = [],
  supplementTimeline: SupplementPeriod[] = []
): DoseCorrelationInsight[] => {
  const sorted = sortReportsChronological(reports);
  return markerNames
    .map((marker) => {
      const points = sorted
        .map((report) => {
          const dose = getProtocolDoseMgPerWeek(getReportProtocol(report, protocols));
          if (dose === null || !Number.isFinite(dose)) {
            return null;
          }
          const value = buildMarkerSeries([report], marker, unitSystem, protocols, supplementTimeline)[0]?.value;
          if (value === undefined || !Number.isFinite(value)) {
            return null;
          }
          return { x: dose, y: value };
        })
        .filter((item): item is { x: number; y: number } => item !== null);
      const r = pearsonCorrelation(points);
      if (r === null) {
        return null;
      }
      return {
        marker,
        r: ROUND_3(r),
        n: points.length
      } satisfies DoseCorrelationInsight;
    })
    .filter((item): item is DoseCorrelationInsight => item !== null)
    .sort((left, right) => Math.abs(right.r) - Math.abs(left.r))
    .slice(0, 6);
};

export const buildDosePhaseBlocks = (reports: LabReport[], protocols: Protocol[] = []): DosePhaseBlock[] => {
  const sorted = sortReportsChronological(reports);
  if (sorted.length < 2) {
    return [];
  }

  const blocks: DosePhaseBlock[] = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    const protocol = getReportProtocol(current, protocols);
    blocks.push({
      id: `${current.id}-${next.id}`,
      fromKey: `${current.testDate}__${current.id}`,
      toKey: `${next.testDate}__${next.id}`,
      dosageMgPerWeek: getProtocolDoseMgPerWeek(protocol),
      protocol: protocol?.name ?? current.annotations.protocol
    });
  }
  return blocks;
};

const TRT_TARGET_ZONES_EU: Record<string, TargetZone> = {
  Testosterone: { min: 18, max: 35, unit: "nmol/L" },
  "Free Testosterone": { min: 0.3, max: 0.75, unit: "nmol/L" },
  Estradiol: { min: 70, max: 150, unit: "pmol/L" },
  Hematocrit: { min: 42, max: 50, unit: "%" },
  SHBG: { min: 15, max: 40, unit: "nmol/L" },
  Albumine: { min: 40, max: 50, unit: "g/L" },
  "Dihydrotestosteron (DHT)": { min: 1.0, max: 3.5, unit: "nmol/L" },
  "Vitamin D (D3+D2) OH": { min: 75, max: 125, unit: "nmol/L" },
  "Red Blood Cells": { min: 4.2, max: 5.9, unit: "10^12/L" },
  eGFR: { min: 90, max: 120, unit: "mL/min/1.73m²" },
  TSH: { min: 0.4, max: 4.0, unit: "mIU/L" },
  "Free T4": { min: 11, max: 22, unit: "pmol/L" },
  "Free T3": { min: 3.5, max: 6.5, unit: "pmol/L" },
  Creatinine: { min: 65, max: 110, unit: "umol/L" },
  CRP: { min: 0, max: 5, unit: "mg/L" },
  Cholesterol: { min: 3.6, max: 5.2, unit: "mmol/L" },
  "Cholesterol/HDL Ratio": { min: 2.5, max: 4.5, unit: "ratio" },
  "T/E2 Ratio": { min: 120, max: 260, unit: "ratio" },
  "LDL/HDL Ratio": { min: 1.2, max: 3.0, unit: "ratio" },
  "Non-HDL Cholesterol": { min: 1.8, max: 3.4, unit: "mmol/L" },
  Triglyceriden: { min: 0.5, max: 1.7, unit: "mmol/L" },
  "Vitamine B12": { min: 250, max: 700, unit: "pmol/L" },
  Foliumzuur: { min: 10, max: 35, unit: "nmol/L" },
  "Glucose Nuchter": { min: 4.0, max: 5.6, unit: "mmol/L" },
  MCV: { min: 82, max: 98, unit: "fL" },
  Transferrine: { min: 2.0, max: 3.6, unit: "g/L" },
  "Transferrine Saturatie": { min: 20, max: 45, unit: "%" },
  Homocysteine: { min: 5, max: 12, unit: "umol/L" },
  Ureum: { min: 2.5, max: 7.8, unit: "mmol/L" },
  Ferritine: { min: 40, max: 200, unit: "ug/L" },
  PSA: { min: 0, max: 3.0, unit: "ug/L" },
  "Albumine Urine": { min: 0, max: 20, unit: "mg/L" },
  "Urine ACR": { min: 0, max: 3.0, unit: "mg/mmol" },
  "Creatinine Urine": { min: 4, max: 22, unit: "mmol/L" },
  Hemoglobin: { min: 8.5, max: 11.0, unit: "mmol/L" },
  MCH: { min: 1.65, max: 2.05, unit: "fmol" },
  MCHC: { min: 19.5, max: 22.5, unit: "mmol/L" },
  "RDW-CV": { min: 11.5, max: 14.5, unit: "%" },
  Platelets: { min: 150, max: 400, unit: "10^9/L" },
  "Monocytes Abs.": { min: 0.2, max: 0.8, unit: "10^9/L" },
  "Basophils Abs.": { min: 0.0, max: 0.1, unit: "10^9/L" },
  "Lymphocytes Abs.": { min: 1.0, max: 3.5, unit: "10^9/L" },
  "Eosinophils Abs.": { min: 0.0, max: 0.5, unit: "10^9/L" },
  "Neutrophils Abs.": { min: 1.8, max: 7.5, unit: "10^9/L" },
  "Free Androgen Index": { min: 30, max: 120, unit: "index" },
  Leukocyten: { min: 4.0, max: 10.0, unit: "10^9/L" },
  "HDL Cholesterol": { min: 1.0, max: 2.2, unit: "mmol/L" },
  "LDL Cholesterol": { min: 1.6, max: 2.8, unit: "mmol/L" },
  "Apolipoprotein B": { min: 0.5, max: 0.9, unit: "g/L" },
  Insuline: { min: 2, max: 15, unit: "mIU/L" },
  "HOMA-IR": { min: 0.5, max: 2.5, unit: "index" }
};

const LONGEVITY_TARGET_ZONES_EU: Record<string, TargetZone> = {
  Testosterone: { min: 14, max: 28, unit: "nmol/L" },
  "Free Testosterone": { min: 0.25, max: 0.6, unit: "nmol/L" },
  Estradiol: { min: 60, max: 130, unit: "pmol/L" },
  Hematocrit: { min: 40, max: 48, unit: "%" },
  SHBG: { min: 20, max: 45, unit: "nmol/L" },
  Albumine: { min: 43, max: 49, unit: "g/L" },
  "Dihydrotestosteron (DHT)": { min: 1.2, max: 2.8, unit: "nmol/L" },
  "Vitamin D (D3+D2) OH": { min: 75, max: 125, unit: "nmol/L" },
  "Red Blood Cells": { min: 4.4, max: 5.6, unit: "10^12/L" },
  eGFR: { min: 90, max: 120, unit: "mL/min/1.73m²" },
  TSH: { min: 0.5, max: 2.5, unit: "mIU/L" },
  "Free T4": { min: 13, max: 19, unit: "pmol/L" },
  "Free T3": { min: 4.2, max: 6.2, unit: "pmol/L" },
  Creatinine: { min: 70, max: 105, unit: "umol/L" },
  CRP: { min: 0.2, max: 1.5, unit: "mg/L" },
  Cholesterol: { min: 3.6, max: 4.9, unit: "mmol/L" },
  "Cholesterol/HDL Ratio": { min: 2.0, max: 3.8, unit: "ratio" },
  "T/E2 Ratio": { min: 140, max: 320, unit: "ratio" },
  "LDL/HDL Ratio": { min: 1.1, max: 2.5, unit: "ratio" },
  "Non-HDL Cholesterol": { min: 1.8, max: 2.8, unit: "mmol/L" },
  Triglyceriden: { min: 0.5, max: 1.2, unit: "mmol/L" },
  "Vitamine B12": { min: 300, max: 700, unit: "pmol/L" },
  Foliumzuur: { min: 12, max: 35, unit: "nmol/L" },
  "Glucose Nuchter": { min: 4.2, max: 5.2, unit: "mmol/L" },
  MCV: { min: 84, max: 96, unit: "fL" },
  Transferrine: { min: 2.2, max: 3.4, unit: "g/L" },
  "Transferrine Saturatie": { min: 25, max: 40, unit: "%" },
  Homocysteine: { min: 6, max: 10, unit: "umol/L" },
  Ureum: { min: 3.0, max: 7.0, unit: "mmol/L" },
  Ferritine: { min: 50, max: 150, unit: "ug/L" },
  PSA: { min: 0, max: 2.0, unit: "ug/L" },
  "Albumine Urine": { min: 0, max: 15, unit: "mg/L" },
  "Urine ACR": { min: 0, max: 2.5, unit: "mg/mmol" },
  "Creatinine Urine": { min: 5, max: 20, unit: "mmol/L" },
  Hemoglobin: { min: 8.7, max: 10.5, unit: "mmol/L" },
  MCH: { min: 1.7, max: 2.0, unit: "fmol" },
  MCHC: { min: 20.0, max: 22.0, unit: "mmol/L" },
  "RDW-CV": { min: 11.8, max: 13.8, unit: "%" },
  Platelets: { min: 170, max: 350, unit: "10^9/L" },
  "Monocytes Abs.": { min: 0.2, max: 0.7, unit: "10^9/L" },
  "Basophils Abs.": { min: 0.0, max: 0.08, unit: "10^9/L" },
  "Lymphocytes Abs.": { min: 1.2, max: 3.2, unit: "10^9/L" },
  "Eosinophils Abs.": { min: 0.0, max: 0.4, unit: "10^9/L" },
  "Neutrophils Abs.": { min: 2.0, max: 6.5, unit: "10^9/L" },
  "Free Androgen Index": { min: 40, max: 90, unit: "index" },
  Leukocyten: { min: 4.5, max: 9.0, unit: "10^9/L" },
  "HDL Cholesterol": { min: 1.2, max: 2.2, unit: "mmol/L" },
  "LDL Cholesterol": { min: 1.4, max: 2.4, unit: "mmol/L" },
  "Apolipoprotein B": { min: 0.5, max: 0.8, unit: "g/L" },
  Insuline: { min: 2, max: 8, unit: "mIU/L" },
  "HOMA-IR": { min: 0.5, max: 1.5, unit: "index" }
};

const normalizeZoneMarkerKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenizeZoneMarkerKey = (value: string): string[] => {
  const normalized = normalizeZoneMarkerKey(value);
  return normalized ? normalized.split(" ") : [];
};

const resolveZoneKeyByTokens = (source: Record<string, TargetZone>, candidates: string[]): string | null => {
  const tokenSets = candidates
    .map((candidate) => new Set(tokenizeZoneMarkerKey(candidate)))
    .filter((tokens) => tokens.size > 0);
  if (tokenSets.length === 0) {
    return null;
  }

  const sourceKeysBySpecificity = Object.keys(source).sort(
    (left, right) => tokenizeZoneMarkerKey(right).length - tokenizeZoneMarkerKey(left).length
  );

  return (
    sourceKeysBySpecificity.find((sourceKey) => {
      const sourceTokens = tokenizeZoneMarkerKey(sourceKey);
      if (sourceTokens.length === 0) {
        return false;
      }
      return tokenSets.some((candidateTokens) => sourceTokens.every((token) => candidateTokens.has(token)));
    }) ?? null
  );
};

const TARGET_ZONE_ALIAS_LOOKUP: Record<string, string> = {
  testosterone: "Testosterone",
  "total testosterone": "Testosterone",
  "testosterone total": "Testosterone",
  "free testosterone": "Free Testosterone",
  "testosterone free": "Free Testosterone",
  estradiol: "Estradiol",
  e2: "Estradiol",
  shbg: "SHBG",
  "sex hormone binding globulin": "SHBG",
  "sex hormone binding glob": "SHBG",
  albumin: "Albumine",
  "serum albumin": "Albumine",
  dht: "Dihydrotestosteron (DHT)",
  "dihydrotestosterone dht": "Dihydrotestosteron (DHT)",
  "vitamin d": "Vitamin D (D3+D2) OH",
  ferritin: "Ferritine",
  "vitamin b12": "Vitamine B12",
  "vitamine b12": "Vitamine B12",
  "vit b12": "Vitamine B12",
  folate: "Foliumzuur",
  "folic acid": "Foliumzuur",
  "red blood cells": "Red Blood Cells",
  rbc: "Red Blood Cells",
  creatinine: "Creatinine",
  "serum creatinine": "Creatinine",
  crp: "CRP",
  "c reactive protein": "CRP",
  "cholesterol hdl ratio": "Cholesterol/HDL Ratio",
  "cholesterol hdl": "Cholesterol/HDL Ratio",
  "t e2 ratio": "T/E2 Ratio",
  "testosterone e2 ratio": "T/E2 Ratio",
  "testosteron e2 ratio": "T/E2 Ratio",
  "testosterone estradiol ratio": "T/E2 Ratio",
  "testosteron estradiol ratio": "T/E2 Ratio",
  "ldl hdl ratio": "LDL/HDL Ratio",
  "ldl hdl cholesterol ratio": "LDL/HDL Ratio",
  transferrin: "Transferrine",
  triglycerides: "Triglyceriden",
  triglyceriden: "Triglyceriden",
  "homocysteine": "Homocysteine",
  urea: "Ureum",
  ureum: "Ureum",
  leukocyten: "Leukocyten",
  leucocyten: "Leukocyten",
  leukocytes: "Leukocyten",
  leucocytes: "Leukocyten",
  wbc: "Leukocyten",
  psa: "PSA",
  "urine albumin": "Albumine Urine",
  "albumin urine": "Albumine Urine",
  "urine acr": "Urine ACR",
  "albumin creatinine ratio": "Urine ACR",
  "urine creatinine": "Creatinine Urine",
  "creatinine urine": "Creatinine Urine",
  hemoglobin: "Hemoglobin",
  platelet: "Platelets",
  platelets: "Platelets",
  "monocytes abs": "Monocytes Abs.",
  "basophils abs": "Basophils Abs.",
  "lymphocytes abs": "Lymphocytes Abs.",
  "eosinophils abs": "Eosinophils Abs.",
  "neutrophils abs": "Neutrophils Abs.",
  fai: "Free Androgen Index",
  "free androgen index": "Free Androgen Index",
  homa: "HOMA-IR",
  "homa ir": "HOMA-IR",
  "rdw cv": "RDW-CV",
  rdw: "RDW-CV",
  apob: "Apolipoprotein B",
  "apo b": "Apolipoprotein B",
  "apo b100": "Apolipoprotein B",
  "non hdl": "Non-HDL Cholesterol",
  "non hdl cholesterol": "Non-HDL Cholesterol",
  "fasting glucose": "Glucose Nuchter",
  "glucose fasting": "Glucose Nuchter",
  "glucose plasma": "Glucose Nuchter",
  insulin: "Insuline",
  "free t4": "Free T4",
  ft4: "Free T4",
  "vrij t4": "Free T4",
  "free t3": "Free T3",
  ft3: "Free T3",
  "vrij t3": "Free T3",
  tsh: "TSH",
  thyrotropin: "TSH",
  "thyroid stimulating hormone": "TSH"
};

export const getTargetZone = (
  marker: string,
  zoneType: "trt" | "longevity",
  unitSystem: AppSettings["unitSystem"]
): { min: number; max: number } | null => {
  const source = zoneType === "trt" ? TRT_TARGET_ZONES_EU : LONGEVITY_TARGET_ZONES_EU;
  const normalized = normalizeZoneMarkerKey(marker);
  const canonicalResolved = canonicalizeMarker(marker);
  const canonicalNormalized = normalizeZoneMarkerKey(canonicalResolved);
  const aliasResolved = TARGET_ZONE_ALIAS_LOOKUP[normalized];
  const canonicalAliasResolved = TARGET_ZONE_ALIAS_LOOKUP[canonicalNormalized];
  const includesResolved = Object.entries(TARGET_ZONE_ALIAS_LOOKUP).find(([alias]) => normalized.includes(alias))?.[1];
  const canonicalIncludesResolved = Object.entries(TARGET_ZONE_ALIAS_LOOKUP).find(([alias]) =>
    canonicalNormalized.includes(alias)
  )?.[1];
  const tokenResolved = resolveZoneKeyByTokens(source, [marker, canonicalResolved, normalized, canonicalNormalized]);
  const directResolved =
    aliasResolved ??
    canonicalAliasResolved ??
    includesResolved ??
    canonicalIncludesResolved ??
    tokenResolved ??
    (Object.prototype.hasOwnProperty.call(source, canonicalResolved) ? canonicalResolved : null) ??
    Object.keys(source).find((key) => normalizeZoneMarkerKey(key) === normalized) ??
    Object.keys(source).find((key) => normalizeZoneMarkerKey(key) === canonicalNormalized);
  if (!directResolved) {
    return null;
  }
  const zone = source[directResolved];
  if (!zone) {
    return null;
  }

  const conversionMarker = canonicalizeMarker(directResolved);
  const markerForConversion = conversionMarker === "Unknown Marker" ? directResolved : conversionMarker;
  const minConverted = convertBySystem(markerForConversion, zone.min, zone.unit, unitSystem).value;
  const maxConverted = convertBySystem(markerForConversion, zone.max, zone.unit, unitSystem).value;
  return {
    min: ROUND_3(minConverted),
    max: ROUND_3(maxConverted)
  };
};

export const calculatePercentChange = (current: number, previous: number): number | null => {
  if (Math.abs(previous) <= 0.000001) {
    return null;
  }
  return ROUND_2(((current - previous) / previous) * 100);
};

export const calculatePercentVsBaseline = (current: number, baseline: number): number | null => {
  if (Math.abs(baseline) <= 0.000001) {
    return null;
  }
  return ROUND_2(((current - baseline) / baseline) * 100);
};

interface DoseModel {
  estimateAtDose: (dose: number) => number;
  slopePerMg: number;
  intercept: number;
  rSquared: number;
}

interface DoseSample {
  reportId: string;
  date: string;
  dose: number;
  value: number;
  unit: string;
  samplingTiming: SamplingTiming;
}

const calculateRSquared = (actual: number[], predicted: number[]): number => {
  if (actual.length === 0 || predicted.length !== actual.length) {
    return 0;
  }
  const avg = mean(actual);
  const ssTotal = actual.reduce((sum, value) => sum + (value - avg) ** 2, 0);
  if (Math.abs(ssTotal) <= 0.000001) {
    return 1;
  }
  const ssResidual = actual.reduce((sum, value, index) => sum + (value - (predicted[index] ?? value)) ** 2, 0);
  return clip(1 - ssResidual / ssTotal, 0, 1);
};

const median = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const uniqueDoseCount = (samples: Array<{ dose: number }>): number => new Set(samples.map((sample) => ROUND_2(sample.dose))).size;

const filterOutliersByMad = (
  samples: DoseSample[]
): { kept: DoseSample[]; excluded: DoseSample[]; threshold: number | null } => {
  if (samples.length < 4) {
    return { kept: samples, excluded: [], threshold: null };
  }
  const values = samples.map((sample) => sample.value);
  const sampleMedian = median(values);
  const deviations = values.map((value) => Math.abs(value - sampleMedian));
  const mad = median(deviations);
  if (mad <= 0.000001) {
    return { kept: samples, excluded: [], threshold: null };
  }

  // 1.4826 scales MAD to a normal-distribution sigma estimate.
  const robustSigma = 1.4826 * mad;
  const threshold = 3 * robustSigma;
  const excluded = samples.filter((sample) => Math.abs(sample.value - sampleMedian) > threshold);
  const kept = samples.filter((sample) => Math.abs(sample.value - sampleMedian) <= threshold);

  if (excluded.length === 0 || kept.length < 3 || uniqueDoseCount(kept) < 2) {
    return { kept: samples, excluded: [], threshold };
  }
  return { kept, excluded, threshold };
};

const buildLinearDoseModel = (samples: Array<{ dose: number; value: number }>): DoseModel | null => {
  const regression = linearRegression(samples.map((sample) => ({ x: sample.dose, y: sample.value })));
  if (!regression) {
    return null;
  }
  return {
    estimateAtDose: (dose: number) => regression.intercept + regression.slope * dose,
    slopePerMg: regression.slope,
    intercept: regression.intercept,
    rSquared: regression.rSquared
  };
};

const buildTheilSenDoseModel = (samples: Array<{ dose: number; value: number }>): DoseModel | null => {
  if (samples.length < 2) {
    return null;
  }

  const slopes: number[] = [];
  for (let left = 0; left < samples.length - 1; left += 1) {
    for (let right = left + 1; right < samples.length; right += 1) {
      const deltaDose = samples[right].dose - samples[left].dose;
      if (Math.abs(deltaDose) <= 0.000001) {
        continue;
      }
      slopes.push((samples[right].value - samples[left].value) / deltaDose);
    }
  }
  if (slopes.length === 0) {
    return null;
  }

  const slopePerMg = median(slopes);
  const intercept = median(samples.map((sample) => sample.value - slopePerMg * sample.dose));
  const estimateAtDose = (dose: number) => intercept + slopePerMg * dose;
  const predicted = samples.map((sample) => estimateAtDose(sample.dose));
  const rSquared = calculateRSquared(
    samples.map((sample) => sample.value),
    predicted
  );

  return {
    estimateAtDose,
    slopePerMg,
    intercept,
    rSquared
  };
};

const confidenceFromDoseStats = (sampleCount: number, correlationR: number | null): DosePrediction["confidence"] => {
  const absR = Math.abs(correlationR ?? 0);
  if (sampleCount >= 6 && absR >= 0.6) {
    return "High";
  }
  if (sampleCount >= 4 && absR >= 0.35) {
    return "Medium";
  }
  return "Low";
};

const evaluateDoseRelationship = (
  marker: string,
  samples: DoseSample[],
  slopePerMg: number,
  correlationR: number | null
): { status: DosePrediction["status"]; reason: string } => {
  if (samples.length < 4) {
    return {
      status: "insufficient",
      reason: `We need at least 4 results with a recorded weekly dose. Right now there are ${samples.length}.`
    };
  }
  if (uniqueDoseCount(samples) < 2) {
    return {
      status: "insufficient",
      reason: "We only have one dose level so far, so we cannot estimate dose-response yet."
    };
  }
  if (correlationR === null) {
    return {
      status: "insufficient",
      reason: "There is not enough consistent data yet to calculate a reliable relationship."
    };
  }

  const doses = samples.map((sample) => sample.dose);
  const values = samples.map((sample) => sample.value);
  const doseSpan = Math.max(...doses) - Math.min(...doses);
  const meanAbsValue = Math.max(Math.abs(mean(values)), 0.000001);
  const relativeEffectAcrossRange = (Math.abs(slopePerMg) * Math.max(doseSpan, 1)) / meanAbsValue;
  const absR = Math.abs(correlationR);

  if (DOSE_EXPECTED_POSITIVE_MARKERS.has(marker) && slopePerMg < -0.000001) {
    return {
      status: "unclear",
      reason: `The current pattern moves in the opposite direction than expected for this marker (${ROUND_3(slopePerMg)} per mg/week), so the estimate is marked as unclear.`
    };
  }

  if (absR < 0.2 || relativeEffectAcrossRange < 0.03) {
    return {
      status: "unclear",
      reason: `The link between dose and this marker is weak right now (r=${ROUND_3(absR)}), so this estimate is uncertain.`
    };
  }

  return {
    status: "clear",
    reason: `A usable dose-response pattern was found from ${samples.length} data points (r=${ROUND_3(correlationR)}).`
  };
};

const defaultDoseWhyRelevant = (marker: string): string =>
  DOSE_RELEVANCE_HINTS[marker] ?? "Potentially dose-sensitive marker based on available personal trend data.";

const predictionQualityScore = (prediction: DosePrediction): number => {
  const sampleScore = clip(prediction.sampleCount / 6, 0, 1);
  const doseLevelScore = clip(prediction.uniqueDoseLevels / 3, 0, 1);
  const correlationScore = clip(Math.abs(prediction.correlationR ?? 0) / 0.7, 0, 1);
  const samplingScore = prediction.samplingMode === "trough" ? 1 : 0.72;

  let quality = (sampleScore * 0.4 + doseLevelScore * 0.25 + correlationScore * 0.25 + samplingScore * 0.1) * 100;
  if (prediction.source === "study_prior") {
    quality *= 0.42;
  } else if (prediction.source === "hybrid") {
    quality *= 0.72;
  }
  return ROUND_2(quality);
};

const predictionEffectPotentialScore = (prediction: DosePrediction): number => {
  const doseStep = Math.max(prediction.currentDose * 0.1, 5);
  const expectedDelta = Math.abs(prediction.slopePerMg) * doseStep;
  const scale = Math.max(Math.abs(prediction.currentEstimate) * 0.15, 0.3);
  return ROUND_2(clip(expectedDelta / scale, 0, 1) * 100);
};

const clinicalWeightScore = (marker: string): number => DOSE_CLINICAL_WEIGHTS[marker] ?? 48;

const assignPredictionRelevance = (prediction: DosePrediction): DosePrediction => {
  const clinicalWeight = clinicalWeightScore(prediction.marker);
  const dataQuality = predictionQualityScore(prediction);
  const effectPotential = predictionEffectPotentialScore(prediction);
  const relevanceScore = ROUND_2(clinicalWeight * 0.45 + dataQuality * 0.35 + effectPotential * 0.2);
  return {
    ...prediction,
    relevanceScore,
    whyRelevant: defaultDoseWhyRelevant(prediction.marker)
  };
};

export const isPersonalDosePredictionEligible = (prediction: DosePrediction): boolean => {
  const absR = Math.abs(prediction.correlationR ?? 0);
  const directionConflict = DOSE_EXPECTED_POSITIVE_MARKERS.has(prediction.marker) && prediction.slopePerMg < -0.000001;
  return prediction.sampleCount >= 4 && prediction.uniqueDoseLevels >= 2 && absR >= 0.35 && !directionConflict;
};

export const projectDosePredictionAt = (
  prediction: DosePrediction,
  targetDose: number
): { estimate: number; low: number | null; high: number | null } => {
  const estimate = Math.max(0, prediction.intercept + prediction.slopePerMg * targetDose);
  const sigma = prediction.predictionSigma;
  if (sigma === null || !Number.isFinite(sigma) || sigma <= 0) {
    return {
      estimate: ROUND_2(estimate),
      low: null,
      high: null
    };
  }
  return {
    estimate: ROUND_2(estimate),
    low: ROUND_2(Math.max(0, estimate - sigma)),
    high: ROUND_2(Math.max(0, estimate + sigma))
  };
};

interface ApplyDosePriorsOptions {
  apiAssistedMarkers?: Set<string>;
  offlinePriorFallback?: boolean;
}

export const applyDosePriorsToPredictions = (
  predictions: DosePrediction[],
  priors: DosePrior[],
  options: ApplyDosePriorsOptions = {}
): DosePrediction[] => {
  const priorMap = priors.reduce((map, prior) => {
    map.set(canonicalizeMarker(prior.marker), prior);
    return map;
  }, new Map<string, DosePrior>());

  const statusOrder: Record<DosePrediction["status"], number> = {
    clear: 0,
    unclear: 1,
    insufficient: 2
  };

  return predictions
    .map((original) => {
      const markerKey = canonicalizeMarker(original.marker);
      const prior = priorMap.get(markerKey) ?? null;
      const personalEligible = isPersonalDosePredictionEligible(original);

      if (!prior || personalEligible) {
        const base = {
          ...original,
          source: "personal" as const,
          isApiAssisted: false,
          blendDiagnostics: null
        };
        return assignPredictionRelevance(base);
      }

      const absR = Math.abs(original.correlationR ?? 0);
      const hasSomePersonalSignal = original.sampleCount >= 2 && original.uniqueDoseLevels >= 2 && original.correlationR !== null;
      const hasApiAssistedMarker = options.apiAssistedMarkers?.has(original.marker) ?? false;
      const sigmaPersonal = Math.max(original.predictionSigma ?? 0, Math.abs(original.currentEstimate) * 0.04, 0.2);
      const sigmaPrior = Math.max(prior.sigma, 0.1);
      const sigmaResidual = Math.max(sigmaPersonal * 0.5, 0.1);

      if (!hasSomePersonalSignal) {
        const slopePerMg = prior.slopePerMg;
        const intercept = original.currentEstimate - slopePerMg * original.currentDose;
        const suggestedEstimate = Math.max(0, intercept + slopePerMg * original.suggestedDose);
        const predictionSigma = sigmaPrior;
        const projectedLow = Math.max(0, suggestedEstimate - predictionSigma);
        const projectedHigh = Math.max(0, suggestedEstimate + predictionSigma);
        const priorOnly: DosePrediction = {
          ...original,
          slopePerMg: ROUND_3(slopePerMg),
          intercept: ROUND_3(intercept),
          suggestedEstimate: ROUND_2(suggestedEstimate),
          suggestedPercentChange: calculatePercentChange(suggestedEstimate, original.currentEstimate),
          predictionSigma: ROUND_2(predictionSigma),
          predictedLow: ROUND_2(projectedLow),
          predictedHigh: ROUND_2(projectedHigh),
          source: "study_prior",
          confidence: "Low",
          status: "unclear",
          statusReason: "Personal dose-linked data is too limited, so this estimate uses a study-based prior.",
          modelType: "prior",
          isApiAssisted: hasApiAssistedMarker,
          blendDiagnostics: {
            wPersonal: 0,
            sigmaPersonal: ROUND_2(sigmaPersonal),
            sigmaPrior: ROUND_2(sigmaPrior),
            sigmaResidual: ROUND_2(sigmaResidual),
            offlinePriorFallback: options.offlinePriorFallback ?? false
          }
        };
        return assignPredictionRelevance(priorOnly);
      }

      const wPersonal = clip((original.sampleCount - 2) / 6, 0, 1) * clip(absR / 0.6, 0, 1);
      const slopePerMg = wPersonal * original.slopePerMg + (1 - wPersonal) * prior.slopePerMg;
      const intercept = original.currentEstimate - slopePerMg * original.currentDose;
      const suggestedEstimate = Math.max(0, intercept + slopePerMg * original.suggestedDose);
      const predictionSigma = Math.sqrt(
        (wPersonal * sigmaPersonal) ** 2 + ((1 - wPersonal) * sigmaPrior) ** 2 + sigmaResidual ** 2
      );
      const projectedLow = Math.max(0, suggestedEstimate - predictionSigma);
      const projectedHigh = Math.max(0, suggestedEstimate + predictionSigma);

      const blended: DosePrediction = {
        ...original,
        slopePerMg: ROUND_3(slopePerMg),
        intercept: ROUND_3(intercept),
        suggestedEstimate: ROUND_2(suggestedEstimate),
        suggestedPercentChange: calculatePercentChange(suggestedEstimate, original.currentEstimate),
        predictionSigma: ROUND_2(predictionSigma),
        predictedLow: ROUND_2(projectedLow),
        predictedHigh: ROUND_2(projectedHigh),
        source: "hybrid",
        confidence: original.confidence === "Low" ? "Low" : "Medium",
        status: original.status === "insufficient" ? "unclear" : original.status,
        statusReason: `${original.statusReason} Study prior blended in because personal signal is limited.`,
        modelType: "hybrid",
        isApiAssisted: hasApiAssistedMarker,
        blendDiagnostics: {
          wPersonal: ROUND_2(wPersonal),
          sigmaPersonal: ROUND_2(sigmaPersonal),
          sigmaPrior: ROUND_2(sigmaPrior),
          sigmaResidual: ROUND_2(sigmaResidual),
          offlinePriorFallback: options.offlinePriorFallback ?? false
        }
      };
      return assignPredictionRelevance(blended);
    })
    .sort((left, right) => {
      const byStatus = statusOrder[left.status] - statusOrder[right.status];
      if (byStatus !== 0) {
        return byStatus;
      }
      return right.relevanceScore - left.relevanceScore;
    });
};

export const estimateDoseResponse = (
  reports: LabReport[],
  markerNames: string[],
  unitSystem: AppSettings["unitSystem"],
  protocols: Protocol[] = [],
  supplementTimeline: SupplementPeriod[] = []
): DosePrediction[] => {
  const predictions: DosePrediction[] = [];
  const sorted = sortReportsChronological(reports);

  const pushInsufficientPrediction = (
    marker: string,
    samples: DoseSample[],
    excludedPoints: Array<{ date: string; reason: string }>,
    reason: string,
    unitFallback?: string
  ) => {
    if (samples.length === 0) {
      return;
    }
    const ordered = [...samples].sort((left, right) => parseDateSafe(left.date) - parseDateSafe(right.date));
    const latest = ordered[ordered.length - 1];
    if (!latest) {
      return;
    }
    const uniqueDoseLevels = uniqueDoseCount(ordered);
    const troughSampleCount = ordered.filter((sample) => sample.samplingTiming === "trough").length;
    predictions.push({
      marker,
      unit: unitFallback ?? latest.unit,
      slopePerMg: 0,
      intercept: latest.value,
      rSquared: 0,
      correlationR: null,
      sampleCount: ordered.length,
      uniqueDoseLevels,
      allSampleCount: ordered.length,
      troughSampleCount,
      currentDose: ROUND_2(latest.dose),
      suggestedDose: ROUND_2(latest.dose),
      currentEstimate: ROUND_2(latest.value),
      suggestedEstimate: ROUND_2(latest.value),
      predictionSigma: null,
      predictedLow: null,
      predictedHigh: null,
      suggestedPercentChange: null,
      confidence: "Low",
      status: "insufficient",
      statusReason: reason,
      samplingMode: "all",
      samplingWarning: "Estimate hidden until we have enough dose-linked results.",
      usedReportDates: ordered.map((sample) => sample.date),
      excludedPoints,
      modelType: "linear",
      source: "personal",
      relevanceScore: 0,
      whyRelevant: defaultDoseWhyRelevant(marker),
      isApiAssisted: false,
      blendDiagnostics: null,
      scenarios: []
    });
  };

  for (const marker of markerNames) {
    const pointByReportId = new Map(
      buildMarkerSeries(sorted, marker, unitSystem, protocols, supplementTimeline).map((point) => [point.reportId, point])
    );
    const rawSamples = sorted
      .map((report) => {
        const dose = getProtocolDoseMgPerWeek(getReportProtocol(report, protocols));
        if (dose === null || !Number.isFinite(dose)) {
          return null;
        }
        const point = pointByReportId.get(report.id);
        if (!point || !Number.isFinite(point.value)) {
          return null;
        }
        return {
          reportId: report.id,
          date: report.testDate,
          dose,
          value: point.value,
          unit: point.unit,
          samplingTiming: report.annotations.samplingTiming
        } satisfies DoseSample;
      })
      .filter((item): item is DoseSample => item !== null);

    if (rawSamples.length === 0) {
      continue;
    }

    const excludedPoints: Array<{ date: string; reason: string }> = [];
    const unitCounts = rawSamples.reduce((map, sample) => {
      map.set(sample.unit, (map.get(sample.unit) ?? 0) + 1);
      return map;
    }, new Map<string, number>());
    const latestUnit = rawSamples[rawSamples.length - 1]?.unit ?? rawSamples[0].unit;
    const preferredUnit = Array.from(unitCounts.entries()).sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      if (left[0] === latestUnit) {
        return -1;
      }
      if (right[0] === latestUnit) {
        return 1;
      }
      return left[0].localeCompare(right[0]);
    })[0]?.[0];
    if (!preferredUnit) {
      pushInsufficientPrediction(
        marker,
        rawSamples,
        excludedPoints,
        "We need more dose-linked results before we can estimate this marker."
      );
      continue;
    }

    const unitFiltered = rawSamples.filter((sample) => sample.unit === preferredUnit);
    rawSamples
      .filter((sample) => sample.unit !== preferredUnit)
      .forEach((sample) => {
        excludedPoints.push({
          date: sample.date,
          reason: `Excluded due to unit mismatch (${sample.unit} vs ${preferredUnit}).`
        });
      });
    if (unitFiltered.length < 2) {
      pushInsufficientPrediction(
        marker,
        unitFiltered.length > 0 ? unitFiltered : rawSamples,
        excludedPoints,
        `Not enough usable results yet (${unitFiltered.length}). Add more reports with recorded weekly dose.`,
        preferredUnit
      );
      continue;
    }
    if (uniqueDoseCount(unitFiltered) < 2) {
      pushInsufficientPrediction(
        marker,
        unitFiltered,
        excludedPoints,
        "We only have one dose level so far, so dose-response cannot be estimated yet.",
        preferredUnit
      );
      continue;
    }

    const troughSamples = unitFiltered.filter((sample) => sample.samplingTiming === "trough");
    const useTrough = troughSamples.length >= 3 && uniqueDoseCount(troughSamples) >= 2;
    const samplingMode: DosePrediction["samplingMode"] = useTrough ? "trough" : "all";
    const samplingWarning =
      useTrough
        ? null
        : troughSamples.length > 0
          ? "There were too few trough-only points, so this estimate uses all sampling timings."
          : unitFiltered.some((sample) => sample.samplingTiming !== "unknown")
            ? "Sampling times are mixed, so interpret this estimate with extra caution."
            : "Sampling timing is mostly unknown, so this estimate may be less reliable.";

    const samplingFiltered = useTrough ? troughSamples : unitFiltered;
    const outlierResult = filterOutliersByMad(samplingFiltered);
    outlierResult.excluded.forEach((sample) => {
      excludedPoints.push({
        date: sample.date,
        reason:
          outlierResult.threshold === null
            ? "Excluded as outlier."
            : `Excluded as outlier (>3 MAD; threshold=${ROUND_3(outlierResult.threshold)} ${preferredUnit}).`
      });
    });

    const modelSamples = [...outlierResult.kept].sort((left, right) => parseDateSafe(left.date) - parseDateSafe(right.date));
    if (modelSamples.length < 2 || uniqueDoseCount(modelSamples) < 2) {
      pushInsufficientPrediction(
        marker,
        modelSamples.length > 0 ? modelSamples : unitFiltered,
        excludedPoints,
        "After data-quality checks, too few valid points remain to estimate dose-response.",
        preferredUnit
      );
      continue;
    }

    const linearModel = buildLinearDoseModel(modelSamples);
    if (!linearModel) {
      pushInsufficientPrediction(
        marker,
        modelSamples,
        excludedPoints,
        "The current data does not fit a stable model yet. Add a few more measurements.",
        preferredUnit
      );
      continue;
    }
    const robustModel = buildTheilSenDoseModel(modelSamples);
    let model = linearModel;
    let modelType: DosePrediction["modelType"] = "linear";
    let modelNote = "";
    if (robustModel) {
      const linearSign = Math.sign(linearModel.slopePerMg);
      const robustSign = Math.sign(robustModel.slopePerMg);
      if (linearSign !== 0 && robustSign !== 0 && linearSign !== robustSign) {
        model = robustModel;
        modelType = "theil-sen";
        modelNote = " Used robust Theil-Sen fallback because linear slope direction conflicted.";
      }
    }

    const orderedSampling = [...samplingFiltered].sort((left, right) => parseDateSafe(left.date) - parseDateSafe(right.date));
    const latestDoseSample = orderedSampling[orderedSampling.length - 1];
    if (!latestDoseSample) {
      continue;
    }

    const correlationR = pearsonCorrelation(modelSamples.map((sample) => ({ x: sample.dose, y: sample.value })));
    const relationship = evaluateDoseRelationship(marker, modelSamples, model.slopePerMg, correlationR);
    const confidence = confidenceFromDoseStats(modelSamples.length, correlationR);

    const observedDoseMin = Math.min(...modelSamples.map((sample) => sample.dose));
    const observedDoseMax = Math.max(...modelSamples.map((sample) => sample.dose));
    const currentDose = latestDoseSample.dose;
    const suggestedDose = clip(currentDose - 20, Math.max(40, observedDoseMin - 20), observedDoseMax + 20);
    const predictAtDose = (dose: number): number => Math.max(0, model.estimateAtDose(dose));
    const currentEstimate = predictAtDose(currentDose);
    const rawSuggestedEstimate = predictAtDose(suggestedDose);
    const residuals = modelSamples.map((sample) => sample.value - predictAtDose(sample.dose));
    const residualSigma = Math.max(stdDev(residuals), Math.abs(currentEstimate) * 0.02, 0.1);

    let suggestedEstimate = rawSuggestedEstimate;
    if (relationship.status !== "clear") {
      // Do not surface a directional numeric claim when the relationship is unclear.
      suggestedEstimate = currentEstimate;
    }

    const scenarioCandidates =
      relationship.status === "clear"
        ? [80, 100, 120, 140, 160, 180]
            .filter((dose) => dose >= observedDoseMin - 20 && dose <= observedDoseMax + 30)
            .map((dose) => ({
              dose,
              estimatedValue: ROUND_2(predictAtDose(dose))
            }))
        : [];

    if (
      relationship.status === "clear" &&
      !scenarioCandidates.some((scenario) => scenario.dose === ROUND_2(suggestedDose))
    ) {
      scenarioCandidates.push({
        dose: ROUND_2(suggestedDose),
        estimatedValue: ROUND_2(suggestedEstimate)
      });
    }

    const predictedLow = relationship.status === "clear" ? ROUND_2(Math.max(0, suggestedEstimate - residualSigma)) : null;
    const predictedHigh = relationship.status === "clear" ? ROUND_2(Math.max(0, suggestedEstimate + residualSigma)) : null;

    predictions.push({
      marker,
      unit: preferredUnit,
      slopePerMg: model.slopePerMg,
      intercept: model.intercept,
      rSquared: model.rSquared,
      correlationR,
      sampleCount: modelSamples.length,
      uniqueDoseLevels: uniqueDoseCount(modelSamples),
      allSampleCount: samplingFiltered.length,
      troughSampleCount: troughSamples.length,
      currentDose: ROUND_2(currentDose),
      suggestedDose: ROUND_2(suggestedDose),
      currentEstimate: ROUND_2(currentEstimate),
      suggestedEstimate: ROUND_2(suggestedEstimate),
      predictionSigma: ROUND_2(residualSigma),
      predictedLow,
      predictedHigh,
      suggestedPercentChange: relationship.status === "clear" ? calculatePercentChange(suggestedEstimate, currentEstimate) : null,
      confidence,
      status: relationship.status,
      statusReason: `${relationship.reason}${modelNote}`,
      samplingMode,
      samplingWarning,
      usedReportDates: modelSamples.map((sample) => sample.date),
      excludedPoints,
      modelType,
      source: "personal",
      relevanceScore: 0,
      whyRelevant: defaultDoseWhyRelevant(marker),
      isApiAssisted: false,
      blendDiagnostics: null,
      scenarios: scenarioCandidates.sort((left, right) => left.dose - right.dose)
    });
  }

  const statusOrder: Record<DosePrediction["status"], number> = {
    clear: 0,
    unclear: 1,
    insufficient: 2
  };
  const confidenceOrder: Record<DosePrediction["confidence"], number> = {
    High: 0,
    Medium: 1,
    Low: 2
  };

  return predictions
    .map((prediction) => assignPredictionRelevance(prediction))
    .sort((left, right) => {
      const byStatus = statusOrder[left.status] - statusOrder[right.status];
      if (byStatus !== 0) {
        return byStatus;
      }
      const byConfidence = confidenceOrder[left.confidence] - confidenceOrder[right.confidence];
      if (byConfidence !== 0) {
        return byConfidence;
      }
      return right.relevanceScore - left.relevanceScore;
    });
};
