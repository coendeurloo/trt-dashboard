import { sortReportsChronological } from "./utils";
import { AIConsentDecision, AppLanguage, LabReport, Protocol, SupplementPeriod, UnitSystem } from "./types";
import { injectionFrequencyLabel } from "./protocolStandards";
import {
  getProtocolCompoundsText,
  getProtocolDoseMgPerWeek,
  getProtocolFrequencyPerWeek,
  getProtocolInjectionFrequency,
  getReportSupplementsText,
  getReportProtocol
} from "./protocolUtils";
import { convertBySystem } from "./unitConversion";
import {
  DosePrediction,
  MarkerAlert,
  MarkerTrendSummary,
  ProtocolImpactSummary,
  TrtStabilityResult
} from "./analytics";
import { getRelevantBenchmarks } from "./data/studyBenchmarks";
import { sanitizeAnalysisPayloadForAI } from "./privacy/sanitizeForAI";
import type { WellbeingSummary } from "./analysisScope";

interface ClaudeResponse {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  error?: {
    code?: string;
    message?: string;
  };
}

interface AnalyzeLabDataOptions {
  reports: LabReport[];
  protocols: Protocol[];
  supplementTimeline?: SupplementPeriod[];
  unitSystem: UnitSystem;
  language?: AppLanguage;
  analysisType?: "full" | "latestComparison";
  deepMode?: boolean;
  externalAiAllowed?: boolean;
  aiConsent?: Pick<AIConsentDecision, "includeSymptoms" | "includeNotes">;
  context?: {
    samplingFilter: "all" | "trough" | "peak";
    protocolImpact: ProtocolImpactSummary;
    alerts: MarkerAlert[];
    trendByMarker: Record<string, MarkerTrendSummary>;
    trtStability: TrtStabilityResult;
    dosePredictions: DosePrediction[];
    wellbeingSummary?: WellbeingSummary | null;
  };
}

interface AnalysisMarkerRow {
  m: string;
  v: number;
  u: string;
  ref: [number | null, number | null];
}

interface AnalysisReportRow {
  date: string;
  ann: {
    dose: number | null;
    compound: string;
    frequency: string;
    frequencyPerWeek: number | null;
    protocol: string;
    supps: string;
    symptoms: string;
    notes: string;
    timing: "unknown" | "trough" | "mid" | "peak";
  };
  markers: AnalysisMarkerRow[];
}

interface LatestComparisonRow {
  marker: string;
  unit: string;
  previousDate: string;
  latestDate: string;
  previousValue: number;
  latestValue: number;
  delta: number;
  percentChange: number | null;
  previousAbnormal: "low" | "high" | "normal" | "unknown";
  latestAbnormal: "low" | "high" | "normal" | "unknown";
}

const ANALYSIS_MODEL_CANDIDATES = [
  "claude-sonnet-4-20250514",
  "claude-3-7-sonnet-20250219",
  "claude-3-7-sonnet-latest",
  "claude-3-5-sonnet-latest"
] as const;

const BASE_ANALYSIS_MAX_TOKENS = 2400;
const BASE_DEEP_ANALYSIS_MAX_TOKENS = 3200;
const MAX_TRANSIENT_RETRIES_PER_MODEL = 2;
const TRANSIENT_RETRY_BASE_DELAY_MS = 700;
const TRANSIENT_RETRY_MAX_DELAY_MS = 4200;
const MAX_MARKER_TRENDS_IN_PROMPT = 56;
const MAX_PROTOCOL_CHANGES_IN_PROMPT = 12;
const MAX_ALERTS_IN_PROMPT = 12;
const MAX_DOSE_PREDICTIONS_IN_PROMPT = 10;
const parseMarkerCap = (): number => {
  const raw = Number(import.meta.env.VITE_AI_ANALYSIS_MARKER_CAP ?? 60);
  if (!Number.isFinite(raw)) {
    return 60;
  }
  return Math.min(200, Math.max(30, Math.round(raw)));
};
const MAX_MARKERS_PER_REPORT = parseMarkerCap();
export const AI_ANALYSIS_MARKER_CAP = MAX_MARKERS_PER_REPORT;
const MAX_CONTEXT_CHARS = 120;

const SIGNAL_MARKERS = [
  "Testosterone",
  "Free Testosterone",
  "Estradiol",
  "Hematocrit",
  "SHBG",
  "Apolipoprotein B",
  "LDL Cholesterol",
  "Non-HDL Cholesterol",
  "Cholesterol",
  "Triglyceriden",
  "Hemoglobin"
] as const;

const FORMAT_RULES = (outputLanguage: string): string[] => [
  "Format: headings, bullets, and short paragraphs only. No tables or HTML.",
  `Language: ${outputLanguage}.`
];

const ANALYSIS_RULES: string[] = [
  "Use only data from the JSON block.",
  "For key claims, cite date + marker + value + unit.",
  "Integrate timeline order, sampling timing, protocol, supplements, symptoms, and wellbeing together.",
  "State uncertainty and confounders clearly.",
  "Action-neutral: no diagnosis, prescriptions, or medical directives."
];

const SUPPLEMENT_SECTION_TEMPLATE: string[] = [
  "Required section: '## Supplement Advice (for doctor discussion)'.",
  "For each relevant item, use '### [Name]' and include: Current dose, Suggested change, Why, Expected effect, Evidence note (author/year/study type), Confidence, Doctor discussion point.",
  "If a marker is low/high and commonly correctable with supplementation, suggest practical options and what to monitor.",
  "If markers conflict or evidence is weak, state uncertainty clearly."
];

const SAFETY_NOTE = "End with a brief safety note: this is not a diagnosis or medical advice.";

const KEY_LEGEND =
  "Key legend: m=marker, v=value, u=unit, ref=[min,max], ann=annotations, dose=mg/week, compound=compound, frequency=injectionFrequency, frequencyPerWeek=doses/week, supps=supplements, timing=samplingTiming.";

const waitMs = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, delayMs));
  });

const parseRetryAfterSeconds = (value: string | null): number | null => {
  if (!value) {
    return null;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.ceil(numeric);
  }
  return null;
};

const shouldRetryTransientAnalysisError = (status: number, errorCode: string): boolean => {
  if (status === 529) {
    return true;
  }
  if (status >= 500 && status <= 599) {
    return !(status === 503 && errorCode === "AI_LIMITS_UNAVAILABLE");
  }
  return false;
};

const nextTransientRetryDelayMs = (attemptIndex: number, retryAfterSeconds: number | null): number => {
  if (typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(TRANSIENT_RETRY_MAX_DELAY_MS, retryAfterSeconds * 1000);
  }
  const exponential = Math.min(
    TRANSIENT_RETRY_MAX_DELAY_MS,
    TRANSIENT_RETRY_BASE_DELAY_MS * Math.pow(2, Math.max(0, attemptIndex))
  );
  const jitter = Math.floor(Math.random() * 260);
  return exponential + jitter;
};

const buildBenchmarkContext = (markerNames: string[]): string => {
  const relevant = getRelevantBenchmarks(markerNames);
  if (relevant.length === 0) {
    return "";
  }

  return [
    "",
    "## Reference data from published studies",
    "",
    "Use the following findings from peer-reviewed research to provide context where relevant.",
    "Reference the source naturally in your analysis (e.g. 'According to a 2021 study in the Journal of Urology...').",
    "Do NOT reproduce these as a list or bibliography; weave them into your narrative only where they add value.",
    "",
    ...relevant.map(
      (benchmark) =>
        `- ${benchmark.marker}: ${benchmark.finding} (${benchmark.source.authors}, ${benchmark.source.journal} ${benchmark.source.year})`
    ),
    ""
  ].join("\n");
};

const toRounded = (value: number): number => {
  if (Math.abs(value) >= 100) {
    return Number(value.toFixed(1));
  }
  if (Math.abs(value) >= 10) {
    return Number(value.toFixed(2));
  }
  return Number(value.toFixed(3));
};

const normalizeText = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, " ");

const toEpochDay = (isoDate: string): number | null => {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
};

const computeStdDev = (values: number[]): number => {
  if (values.length <= 1) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const deriveAbnormalFromReference = (
  value: number,
  ref: [number | null, number | null]
): "low" | "high" | "normal" | "unknown" => {
  const [min, max] = ref;
  if (min !== null && value < min) {
    return "low";
  }
  if (max !== null && value > max) {
    return "high";
  }
  if (min === null && max === null) {
    return "unknown";
  }
  return "normal";
};

const truncateContextText = (value: string, maxChars = MAX_CONTEXT_CHARS): string => {
  const compact = value.trim().replace(/\s+/g, " ");
  if (compact.length <= maxChars) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
};

const markerDeviationFromRange = (marker: AnalysisMarkerRow): number => {
  const [min, max] = marker.ref;
  if (min !== null && marker.v < min) {
    return Math.abs(min - marker.v) / Math.max(1, Math.abs(min));
  }
  if (max !== null && marker.v > max) {
    return Math.abs(marker.v - max) / Math.max(1, Math.abs(max));
  }
  if (min !== null && max !== null && max > min) {
    const center = (min + max) / 2;
    return Math.abs(marker.v - center) / Math.max(1, Math.abs(center));
  }
  return 0;
};

const markerTrendPromptPriorityScore = (trend: {
  marker: string;
  measurements: number;
  outOfRangeCount: number;
  percentChange: number | null;
}): number => {
  let score = SIGNAL_MARKER_SET.has(trend.marker) ? 100 : 0;
  score += Math.min(48, trend.outOfRangeCount * 12);
  score += Math.min(28, Math.abs(trend.percentChange ?? 0) / 4);
  score += Math.min(20, trend.measurements * 2);
  return score;
};

const compactDosePredictionsForPrompt = (predictions: DosePrediction[] | undefined) => {
  if (!predictions || predictions.length === 0) {
    return [];
  }

  return [...predictions]
    .sort((left, right) => (right.relevanceScore ?? 0) - (left.relevanceScore ?? 0))
    .slice(0, MAX_DOSE_PREDICTIONS_IN_PROMPT)
    .map((prediction) => ({
      marker: prediction.marker,
      unit: prediction.unit,
      currentDose: prediction.currentDose,
      suggestedDose: prediction.suggestedDose,
      currentEstimate: toRounded(prediction.currentEstimate),
      suggestedEstimate: toRounded(prediction.suggestedEstimate),
      predictedLow: prediction.predictedLow === null ? null : toRounded(prediction.predictedLow),
      predictedHigh: prediction.predictedHigh === null ? null : toRounded(prediction.predictedHigh),
      suggestedPercentChange:
        prediction.suggestedPercentChange === null ? null : toRounded(prediction.suggestedPercentChange),
      confidence: prediction.confidence,
      status: prediction.status,
      statusReason: truncateContextText(prediction.statusReason, 140),
      samplingMode: prediction.samplingMode,
      source: prediction.source
    }));
};

const SIGNAL_MARKER_SET = new Set<string>(SIGNAL_MARKERS);
const MUST_INCLUDE_MARKERS = new Set<string>([
  "Testosterone",
  "Free Testosterone",
  "Estradiol",
  "Hematocrit",
  "SHBG",
  "Apolipoprotein B",
  "LDL Cholesterol",
  "HDL Cholesterol",
  "Triglyceriden",
  "Cholesterol",
  "TSH",
  "Free T4",
  "DHEA Sulfate",
  "Prolactin",
  "PSA"
]);

const markerPromptPriorityScore = (marker: AnalysisMarkerRow): number => {
  let score = SIGNAL_MARKER_SET.has(marker.m) ? 100 : 0;
  const abnormal = deriveAbnormalFromReference(marker.v, marker.ref);
  if (abnormal === "high" || abnormal === "low") {
    score += 45;
  } else if (abnormal === "unknown") {
    score -= 5;
  } else {
    score += 5;
  }
  if (marker.ref[0] !== null || marker.ref[1] !== null) {
    score += 10;
  }
  score += Math.min(25, markerDeviationFromRange(marker) * 25);
  return score;
};

const selectPromptMarkers = (markers: AnalysisMarkerRow[]): AnalysisMarkerRow[] => {
  if (markers.length <= MAX_MARKERS_PER_REPORT) {
    return markers;
  }

  const sorted = [...markers].sort((left, right) => {
    const scoreDelta = markerPromptPriorityScore(right) - markerPromptPriorityScore(left);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return left.m.localeCompare(right.m);
  });

  const includedKeys = new Set<string>();
  const mustIncludeRows: AnalysisMarkerRow[] = [];
  const optionalRows: AnalysisMarkerRow[] = [];

  for (const marker of sorted) {
    const key = normalizeText(marker.m);
    if (includedKeys.has(key)) {
      continue;
    }
    includedKeys.add(key);
    if (MUST_INCLUDE_MARKERS.has(marker.m)) {
      mustIncludeRows.push(marker);
    } else {
      optionalRows.push(marker);
    }
  }

  if (mustIncludeRows.length >= MAX_MARKERS_PER_REPORT) {
    return mustIncludeRows.slice(0, MAX_MARKERS_PER_REPORT);
  }
  return [...mustIncludeRows, ...optionalRows].slice(0, MAX_MARKERS_PER_REPORT);
};

const buildPayload = (
  reports: LabReport[],
  protocols: Protocol[],
  supplementTimeline: SupplementPeriod[],
  unitSystem: UnitSystem
): AnalysisReportRow[] => {
  const sorted = sortReportsChronological(reports);
  return sorted.map((report) => ({
    ...(() => {
      const protocol = getReportProtocol(report, protocols);
      const injectionFrequency = getProtocolInjectionFrequency(protocol);
      return {
        date: report.testDate,
        ann: {
          dose: getProtocolDoseMgPerWeek(protocol),
          compound: getProtocolCompoundsText(protocol),
          frequency: injectionFrequencyLabel(injectionFrequency, "en"),
          frequencyPerWeek: getProtocolFrequencyPerWeek(protocol),
          protocol: protocol?.name ?? "",
          supps: truncateContextText(getReportSupplementsText(report, supplementTimeline), 150),
          symptoms: truncateContextText(report.annotations.symptoms),
          notes: truncateContextText(report.annotations.notes),
          timing: report.annotations.samplingTiming
        }
      };
    })(),
    markers: selectPromptMarkers(report.markers.map((marker) => {
      const converted = convertBySystem(marker.canonicalMarker, marker.value, marker.unit, unitSystem);
      const convertedMin =
        marker.referenceMin === null
          ? null
          : convertBySystem(marker.canonicalMarker, marker.referenceMin, marker.unit, unitSystem).value;
      const convertedMax =
        marker.referenceMax === null
          ? null
          : convertBySystem(marker.canonicalMarker, marker.referenceMax, marker.unit, unitSystem).value;

      return {
        m: marker.canonicalMarker,
        v: toRounded(converted.value),
        u: converted.unit,
        ref: [
          convertedMin === null ? null : toRounded(convertedMin),
          convertedMax === null ? null : toRounded(convertedMax)
        ]
      };
    }))
  }));
};

const isMarkdownTableLine = (line: string): boolean => /^\s*\|.*\|\s*$/.test(line);

const isMarkdownTableSeparator = (line: string): boolean =>
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

const splitTableCells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

const stripComplexFormatting = (input: string): string => {
  const lines = input.split(/\r?\n/);
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!isMarkdownTableLine(line)) {
      output.push(line);
      index += 1;
      continue;
    }

    const tableLines: string[] = [];
    while (index < lines.length && isMarkdownTableLine(lines[index])) {
      tableLines.push(lines[index]);
      index += 1;
    }

    if (tableLines.length === 0) {
      continue;
    }

    const header = splitTableCells(tableLines[0]);
    const dataLines = tableLines.slice(tableLines.length > 1 && isMarkdownTableSeparator(tableLines[1]) ? 2 : 1);
    if (dataLines.length === 0) {
      continue;
    }

    output.push("Omgezet overzicht:");
    dataLines.forEach((dataLine, rowIndex) => {
      const cells = splitTableCells(dataLine);
      const pairs: string[] = [];
      const pairCount = Math.min(header.length, cells.length);
      for (let cellIndex = 0; cellIndex < pairCount; cellIndex += 1) {
        const key = header[cellIndex];
        const value = cells[cellIndex];
        if (!key || !value) {
          continue;
        }
        pairs.push(`${key}: ${value}`);
      }
      if (pairs.length === 0) {
        pairs.push(cells.filter(Boolean).join("; "));
      }
      output.push(`${rowIndex + 1}. ${pairs.join("; ")}`);
    });
    output.push("");
  }

  return output
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const buildLatestVsPrevious = (reports: AnalysisReportRow[]) => {
  if (reports.length < 2) {
    return null;
  }

  const latest = reports[reports.length - 1];
  const previous = reports[reports.length - 2];
  const previousByMarker = new Map(previous.markers.map((marker) => [marker.m, marker] as const));
  const latestByMarker = new Map(latest.markers.map((marker) => [marker.m, marker] as const));

  const overlapping: LatestComparisonRow[] = latest.markers
    .map((latestMarker) => {
      const previousMarker = previousByMarker.get(latestMarker.m);
      if (!previousMarker) {
        return null;
      }
      const delta = latestMarker.v - previousMarker.v;
      const percentChange = Math.abs(previousMarker.v) < 0.000001 ? null : ((latestMarker.v - previousMarker.v) / previousMarker.v) * 100;

      return {
        marker: latestMarker.m,
        unit: latestMarker.u,
        previousDate: previous.date,
        latestDate: latest.date,
        previousValue: toRounded(previousMarker.v),
        latestValue: toRounded(latestMarker.v),
        delta: toRounded(delta),
        percentChange: percentChange === null ? null : toRounded(percentChange),
        previousAbnormal: deriveAbnormalFromReference(previousMarker.v, previousMarker.ref),
        latestAbnormal: deriveAbnormalFromReference(latestMarker.v, latestMarker.ref)
      };
    })
    .filter((row): row is LatestComparisonRow => row !== null)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const newInLatest = latest.markers
    .filter((marker) => !previousByMarker.has(marker.m))
    .map((marker) => ({
      marker: marker.m,
      value: marker.v,
      unit: marker.u,
      abnormal: deriveAbnormalFromReference(marker.v, marker.ref)
    }));

  const missingInLatest = previous.markers
    .filter((marker) => !latestByMarker.has(marker.m))
    .map((marker) => ({
      marker: marker.m,
      value: marker.v,
      unit: marker.u,
      abnormal: deriveAbnormalFromReference(marker.v, marker.ref)
    }));

  return {
    previousDate: previous.date,
    latestDate: latest.date,
    previousAnnotations: previous.ann,
    latestAnnotations: latest.ann,
    overlapping,
    newInLatest,
    missingInLatest
  };
};

const buildDerivedSignals = (reports: AnalysisReportRow[]) => {
  const markerSeries = new Map<
    string,
    Array<{ date: string; value: number; abnormal: "low" | "high" | "normal" | "unknown"; unit: string }>
  >();

  for (const report of reports) {
    for (const marker of report.markers) {
      const points = markerSeries.get(marker.m) ?? [];
      points.push({
        date: report.date,
        value: marker.v,
        abnormal: deriveAbnormalFromReference(marker.v, marker.ref),
        unit: marker.u
      });
      markerSeries.set(marker.m, points);
    }
  }

  const markerSummaries = Array.from(markerSeries.entries())
    .map(([marker, rawPoints]) => {
      const points = [...rawPoints].sort((a, b) => {
        const left = toEpochDay(a.date) ?? 0;
        const right = toEpochDay(b.date) ?? 0;
        return left - right;
      });
      const first = points[0];
      const last = points[points.length - 1];
      const values = points.map((point) => point.value);
      const delta = last.value - first.value;
      const percentChange = Math.abs(first.value) < 0.000001 ? null : (delta / first.value) * 100;
      const firstDay = toEpochDay(first.date);
      const lastDay = toEpochDay(last.date);
      const daysSpan = firstDay !== null && lastDay !== null ? Math.max(1, (lastDay - firstDay) / (24 * 60 * 60 * 1000)) : 1;
      const slopePer30Days = (delta / daysSpan) * 30;
      const outOfRangeCount = points.filter((point) => point.abnormal === "high" || point.abnormal === "low").length;

      return {
        marker,
        unit: last.unit,
        measurements: points.length,
        firstDate: first.date,
        lastDate: last.date,
        firstValue: toRounded(first.value),
        lastValue: toRounded(last.value),
        delta: toRounded(delta),
        percentChange: percentChange === null ? null : toRounded(percentChange),
        slopePer30Days: toRounded(slopePer30Days),
        minValue: toRounded(Math.min(...values)),
        maxValue: toRounded(Math.max(...values)),
        volatility: toRounded(computeStdDev(values)),
        outOfRangeCount,
        latestAbnormalFlag: last.abnormal
      };
    })
    .sort((a, b) => a.marker.localeCompare(b.marker));

  const protocolTimeline = reports.map((report) => ({
    date: report.date,
    dosageMgPerWeek: report.ann.dose,
    compound: report.ann.compound,
    injectionFrequency: report.ann.frequency,
    protocol: report.ann.protocol,
    supplements: report.ann.supps,
    symptoms: report.ann.symptoms,
    notes: report.ann.notes
  }));

  const protocolChangeEvents: Array<{
    date: string;
    changes: string[];
    context: {
      dosageMgPerWeek: number | null;
      compound: string;
      injectionFrequency: string;
      protocol: string;
      supplements: string;
      symptoms: string;
      notes: string;
    };
  }> = [];

  for (let index = 0; index < protocolTimeline.length; index += 1) {
    const current = protocolTimeline[index];
    if (index === 0) {
      protocolChangeEvents.push({
        date: current.date,
        changes: ["Baseline context"],
        context: {
          dosageMgPerWeek: current.dosageMgPerWeek,
          compound: current.compound,
          injectionFrequency: current.injectionFrequency,
          protocol: current.protocol,
          supplements: current.supplements,
          symptoms: current.symptoms,
          notes: current.notes
        }
      });
      continue;
    }

    const previous = protocolTimeline[index - 1];
    const changes: string[] = [];

    if (current.dosageMgPerWeek !== previous.dosageMgPerWeek) {
      changes.push(`Dosage: ${previous.dosageMgPerWeek ?? "none"} -> ${current.dosageMgPerWeek ?? "none"} mg/week`);
    }
    if (normalizeText(current.compound) !== normalizeText(previous.compound)) {
      changes.push("Compound changed");
    }
    if (normalizeText(current.injectionFrequency) !== normalizeText(previous.injectionFrequency)) {
      changes.push("Injection frequency changed");
    }
    if (normalizeText(current.protocol) !== normalizeText(previous.protocol)) {
      changes.push("Protocol details changed");
    }
    if (normalizeText(current.supplements) !== normalizeText(previous.supplements)) {
      changes.push("Supplements changed");
    }
    if (normalizeText(current.symptoms) !== normalizeText(previous.symptoms)) {
      changes.push("Symptoms changed");
    }

    if (changes.length > 0) {
      protocolChangeEvents.push({
        date: current.date,
        changes,
        context: {
          dosageMgPerWeek: current.dosageMgPerWeek,
          compound: current.compound,
          injectionFrequency: current.injectionFrequency,
          protocol: current.protocol,
          supplements: current.supplements,
          symptoms: current.symptoms,
          notes: current.notes
        }
      });
    }
  }

  const markersPresent = new Set(markerSummaries.map((summary) => summary.marker));
  const sparseMarkers = markerSummaries.filter((summary) => summary.measurements < 2).map((summary) => summary.marker);
  const missingSignalMarkers = SIGNAL_MARKERS.filter((marker) => !markersPresent.has(marker));
  const reportsWithNotes = reports.filter((report) => report.ann.notes.trim().length > 0).length;
  const reportsWithSymptoms = reports.filter((report) => report.ann.symptoms.trim().length > 0).length;

  return {
    period: {
      reportCount: reports.length,
      firstDate: reports[0]?.date ?? null,
      lastDate: reports[reports.length - 1]?.date ?? null
    },
    markerSummaries,
    protocolChangeEvents,
    contextCompleteness: {
      reportsWithNotes,
      reportsWithSymptoms,
      sparseMarkers,
      missingSignalMarkers
    }
  };
};

const buildSignals = (
  derivedSignals: ReturnType<typeof buildDerivedSignals>,
  context: AnalyzeLabDataOptions["context"]
) => ({
  period: derivedSignals.period,
  markerTrends: [...derivedSignals.markerSummaries]
    .sort((left, right) => {
      const scoreDelta = markerTrendPromptPriorityScore(right) - markerTrendPromptPriorityScore(left);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      if (right.measurements !== left.measurements) {
        return right.measurements - left.measurements;
      }
      return left.marker.localeCompare(right.marker);
    })
    .slice(0, MAX_MARKER_TRENDS_IN_PROMPT),
  protocolChanges: derivedSignals.protocolChangeEvents.slice(-MAX_PROTOCOL_CHANGES_IN_PROMPT),
  stability: context?.trtStability ?? null,
  alerts:
    context?.alerts
      ?.filter((alert) => alert.severity === "high" || alert.severity === "medium")
      ?.sort((left, right) => {
        const severityRank = (value: MarkerAlert["severity"]): number => (value === "high" ? 2 : value === "medium" ? 1 : 0);
        const bySeverity = severityRank(right.severity) - severityRank(left.severity);
        if (bySeverity !== 0) {
          return bySeverity;
        }
        return right.date.localeCompare(left.date);
      })
      ?.slice(0, MAX_ALERTS_IN_PROMPT)
      ?.map((alert) => ({
        marker: alert.marker,
        type: alert.type,
        severity: alert.severity,
        message: alert.message
      })) ?? [],
  dosePredictions: compactDosePredictionsForPrompt(context?.dosePredictions),
  wellbeing: context?.wellbeingSummary ?? null,
  gaps: derivedSignals.contextCompleteness,
  samplingFilter: context?.samplingFilter ?? "all"
});

export const analyzeLabDataWithClaude = async ({
  reports,
  protocols,
  supplementTimeline = [],
  unitSystem,
  language = "nl",
  analysisType = "full",
  deepMode = false,
  externalAiAllowed = false,
  aiConsent,
  context
}: AnalyzeLabDataOptions): Promise<string> => {
  if (reports.length === 0) {
    throw new Error("Er zijn nog geen rapporten om te analyseren.");
  }
  if (!externalAiAllowed) {
    throw new Error("AI_CONSENT_REQUIRED");
  }
  if (analysisType === "latestComparison" && reports.length < 2) {
    throw new Error("Voor 'laatste vs vorige' zijn minimaal 2 rapporten nodig.");
  }

  const today = new Date().toISOString().slice(0, 10);
  const rawPayload = buildPayload(reports, protocols, supplementTimeline, unitSystem);
  const payload = sanitizeAnalysisPayloadForAI(rawPayload, {
    includeSymptoms: aiConsent?.includeSymptoms ?? false,
    includeNotes: aiConsent?.includeNotes ?? false
  });
  const derivedSignals = buildDerivedSignals(payload);
  const signals = buildSignals(derivedSignals, context);
  const latestComparison = buildLatestVsPrevious(payload);
  const trackedMarkerNames = Array.from(new Set(payload.flatMap((report) => report.markers.map((marker) => marker.m))));
  const benchmarkSection = buildBenchmarkContext(trackedMarkerNames);
  const preferredOutputLanguage = "English";
  const maxTokens = deepMode ? BASE_DEEP_ANALYSIS_MAX_TOKENS : BASE_ANALYSIS_MAX_TOKENS;

  const fullPrompt = [
    `You are a senior clinical data analyst for TRT monitoring. Today: ${today}.`,
    "Goal: pattern recognition, protocol correlations, and discussion options for doctor/patient.",
    ...FORMAT_RULES(preferredOutputLanguage),
    ...ANALYSIS_RULES,
    "The 'reports' array contains all selected reports for this run. Use these together with the compact signals.",
    "Use a natural structure with headings. No fixed section order or required bullet counts.",
    ...SUPPLEMENT_SECTION_TEMPLATE,
    SAFETY_NOTE,
    KEY_LEGEND,
    benchmarkSection,
    "DATA START",
      JSON.stringify({
        type: analysisType,
        units: unitSystem,
        reports: payload,
        signals
      }),
    "DATA END"
  ].join("\n");

  const latestComparisonPrompt = (() => {
    const relevantPayload = payload.slice(-2);
    const relevantComparison = buildLatestVsPrevious(relevantPayload);
    const relevantMarkers = new Set(relevantPayload.flatMap((report) => report.markers.map((marker) => marker.m)));
    const relevantBenchmarkSection = buildBenchmarkContext(Array.from(relevantMarkers));
    const startDate = relevantPayload[0]?.date ?? null;
    const endDate = relevantPayload[1]?.date ?? null;

    const comparisonSignals = {
      ...signals,
      markerTrends: signals.markerTrends.filter((trend) => relevantMarkers.has(trend.marker)),
      protocolChanges:
        startDate && endDate
          ? signals.protocolChanges.filter((event) => event.date >= startDate && event.date <= endDate)
          : signals.protocolChanges
    };

    return [
      `You are a senior clinical data analyst for TRT monitoring. Today: ${today}.`,
      "Analyze only the latest report versus the immediately previous report.",
      ...FORMAT_RULES(preferredOutputLanguage),
      ...ANALYSIS_RULES,
      "Focus on concrete differences between latest and previous report.",
      ...SUPPLEMENT_SECTION_TEMPLATE,
      SAFETY_NOTE,
      KEY_LEGEND,
      relevantBenchmarkSection,
      "DATA START",
      JSON.stringify({
        type: "latestComparison",
        units: unitSystem,
        latestComparison: relevantComparison ?? latestComparison,
        reports: relevantPayload,
        signals: comparisonSignals
      }),
      "DATA END"
    ].join("\n");
  })();

  const prompt = analysisType === "latestComparison" ? latestComparisonPrompt : fullPrompt;

  const tryModel = async (
    model: string
  ): Promise<{ status: number; body: ClaudeResponse; retryAfterSeconds: number | null }> => {
    let response: Response;
    try {
      response = await fetch("/api/claude/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          requestType: "analysis",
          payload: {
            model,
            max_tokens: maxTokens,
            temperature: 0.3,
            messages: [{ role: "user", content: prompt }]
          }
        })
      });
    } catch {
      throw new Error("PROXY_UNREACHABLE");
    }

    const text = await response.text();
    let body: ClaudeResponse = {};
    try {
      body = text ? (JSON.parse(text) as ClaudeResponse) : {};
    } catch {
      body = text
        ? {
            error: {
              message: text.slice(0, 280)
            }
          }
        : {};
    }
    return {
      status: response.status,
      body,
      retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("retry-after"))
    };
  };

  let lastStatus = 0;
  let lastErrorMessage = "";

  modelLoop: for (const model of ANALYSIS_MODEL_CANDIDATES) {
    for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES_PER_MODEL; attempt += 1) {
      let result: { status: number; body: ClaudeResponse; retryAfterSeconds: number | null };
      try {
        result = await tryModel(model);
      } catch (error) {
        if (error instanceof Error && error.message === "PROXY_UNREACHABLE") {
          throw new Error("AI_PROXY_UNREACHABLE");
        }
        throw error;
      }
      lastStatus = result.status;

      if (result.status >= 200 && result.status < 300) {
        const text = result.body.content?.find((item) => item.type === "text")?.text?.trim();
        if (!text) {
          throw new Error("AI_EMPTY_RESPONSE");
        }
        const maybeTruncated =
          result.body.stop_reason === "max_tokens"
            ? `${text}\n\n_Note: output may be incomplete due to output token limit._`
            : text;
        return stripComplexFormatting(maybeTruncated);
      }

      const errorMeta = (result.body as { error?: { code?: string; detail?: string; message?: string } }).error;
      const errorMessage = errorMeta?.message ?? errorMeta?.detail ?? "";
      const errorCode = errorMeta?.code ?? "";

      if (result.status === 429) {
        const retryAfterRaw = (result.body as { retryAfter?: number })?.retryAfter;
        const retryAfter =
          typeof retryAfterRaw === "number" && Number.isFinite(retryAfterRaw) ? Math.max(1, Math.round(retryAfterRaw)) : 0;
        throw new Error(`AI_RATE_LIMITED:${retryAfter}`);
      }
      if (result.status === 503 && errorCode === "AI_LIMITS_UNAVAILABLE") {
        throw new Error("AI_LIMITS_UNAVAILABLE");
      }

      const missingModel = result.status === 404 || (result.status === 400 && /model/i.test(errorMessage));
      if (missingModel) {
        continue modelLoop;
      }

      const transientError = shouldRetryTransientAnalysisError(result.status, errorCode);
      lastErrorMessage = errorMessage;
      if (transientError) {
        if (attempt < MAX_TRANSIENT_RETRIES_PER_MODEL) {
          await waitMs(nextTransientRetryDelayMs(attempt, result.retryAfterSeconds));
          continue;
        }
        continue modelLoop;
      }

      break modelLoop;
    }
  }

  throw new Error(`AI_REQUEST_FAILED:${lastStatus || "unknown"}:${lastErrorMessage || ""}`);
};
