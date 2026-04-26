import { canonicalizeMarker } from "./unitConversion";
import type {
  AiCoachMarkerRow,
  AiCoachReportRow,
  AiCoachSignals,
  AiCoachSummary
} from "./aiCoachSummary";

type QuestionIntent = "marker" | "latest_change" | "protocol" | "supplement" | "wellbeing" | "broad" | "unknown";
type ContextSelectionMode = "focused" | "broad_safety";

export interface AiCoachQuestionContext {
  fullPictureSummary: AiCoachSummary;
  focusedEvidence: {
    selectionMode: ContextSelectionMode;
    intent: QuestionIntent;
    matchedMarkers: string[];
    relatedMarkers: string[];
    reports: AiCoachReportRow[];
    markerSeries: Array<{
      marker: string;
      unit: string;
      points: Array<{
        date: string;
        value: number;
        abnormal: "low" | "high" | "normal" | "unknown";
      }>;
    }>;
    latestComparison: {
      previousDate: string;
      latestDate: string;
      rows: Array<{
        marker: string;
        unit: string;
        previousValue: number;
        latestValue: number;
        delta: number;
        percentChange: number | null;
      }>;
    } | null;
    focusedSignals: {
      alerts: AiCoachSignals["alerts"];
      markerTrends: AiCoachSignals["markerTrends"];
      protocolChanges: AiCoachSignals["protocolChanges"];
      dosePredictions: unknown[];
      wellbeing: AiCoachSignals["wellbeing"];
    };
    contextNote: string;
  };
}

interface BuildAiCoachQuestionContextOptions {
  question: string;
  reports: AiCoachReportRow[];
  summary: AiCoachSummary;
  signals: AiCoachSignals;
}

const MAX_FOCUSED_REPORTS = 8;
const MAX_BROAD_REPORTS = 5;
const MAX_FOCUSED_MARKERS = 10;
const MAX_BROAD_MARKERS = 14;
const MAX_SERIES_POINTS = 8;
const MAX_COMPARISON_ROWS = 10;

const RELATED_MARKERS: Record<string, string[]> = {
  Hematocrit: ["Hemoglobin", "Red Blood Cells", "RBC", "Ferritin", "Platelets"],
  Hemoglobin: ["Hematocrit", "Red Blood Cells", "RBC", "Ferritin"],
  "Red Blood Cells": ["Hematocrit", "Hemoglobin"],
  Testosterone: ["Free Testosterone", "SHBG", "Estradiol", "Dihydrotestosteron (DHT)", "PSA", "Hematocrit"],
  "Free Testosterone": ["Testosterone", "SHBG", "Estradiol"],
  Estradiol: ["Testosterone", "Free Testosterone", "SHBG", "Prolactin"],
  SHBG: ["Testosterone", "Free Testosterone", "Estradiol"],
  "LDL Cholesterol": ["Apolipoprotein B", "Non-HDL Cholesterol", "HDL Cholesterol", "Triglyceriden", "Cholesterol"],
  "Apolipoprotein B": ["LDL Cholesterol", "Non-HDL Cholesterol", "HDL Cholesterol", "Triglyceriden"],
  "HDL Cholesterol": ["LDL Cholesterol", "Apolipoprotein B", "Triglyceriden", "Cholesterol"],
  Triglyceriden: ["HDL Cholesterol", "LDL Cholesterol", "Apolipoprotein B", "Glucose", "HbA1c"],
  ALT: ["AST", "GGT", "Bilirubin"],
  AST: ["ALT", "GGT", "Creatine Kinase"],
  GGT: ["ALT", "AST", "Bilirubin"],
  Creatinine: ["eGFR", "Urea", "Cystatin C"],
  eGFR: ["Creatinine", "Urea", "Cystatin C"],
  Glucose: ["HbA1c", "Insulin", "Triglyceriden"],
  HbA1c: ["Glucose", "Insulin", "Triglyceriden"],
  TSH: ["Free T4", "Free T3", "Thyroid Peroxidase Antibodies"],
  "Free T4": ["TSH", "Free T3"],
  Ferritin: ["Hemoglobin", "Hematocrit", "CRP"],
  CRP: ["Leukocyten", "Ferritin"]
};

const QUESTION_ALIAS_MARKERS: Record<string, string[]> = {
  hematocrit: ["Hematocrit"],
  hematocriet: ["Hematocrit"],
  hct: ["Hematocrit"],
  hemoglobin: ["Hemoglobin"],
  haemoglobin: ["Hemoglobin"],
  hb: ["Hemoglobin"],
  rbc: ["Red Blood Cells"],
  erythrocytes: ["Red Blood Cells"],
  testosterone: ["Testosterone"],
  testosteron: ["Testosterone"],
  "free testosterone": ["Free Testosterone"],
  "vrije testosteron": ["Free Testosterone"],
  estradiol: ["Estradiol"],
  oestradiol: ["Estradiol"],
  e2: ["Estradiol"],
  shbg: ["SHBG"],
  ldl: ["LDL Cholesterol"],
  hdl: ["HDL Cholesterol"],
  apob: ["Apolipoprotein B"],
  "apo b": ["Apolipoprotein B"],
  triglycerides: ["Triglyceriden"],
  triglyceriden: ["Triglyceriden"],
  creatinine: ["Creatinine"],
  creatininewaarde: ["Creatinine"],
  egfr: ["eGFR"],
  alt: ["ALT"],
  ast: ["AST"],
  ggt: ["GGT"],
  glucose: ["Glucose"],
  hba1c: ["HbA1c"],
  tsh: ["TSH"],
  ferritin: ["Ferritin"],
  ferritine: ["Ferritin"],
  crp: ["CRP"],
  psa: ["PSA"],
  prolactin: ["Prolactin"],
  prolactine: ["Prolactin"],
  "vitamin d": ["Vitamin D", "Vitamin D (D3+D2) OH"],
  "vitamine d": ["Vitamin D", "Vitamin D (D3+D2) OH"],
  b12: ["Vitamin B12"]
};

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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
  return min === null && max === null ? "unknown" : "normal";
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

const getAllMarkerNames = (reports: AiCoachReportRow[]): string[] =>
  Array.from(new Set(reports.flatMap((report) => report.markers.map((marker) => marker.m)))).sort((left, right) =>
    left.localeCompare(right)
  );

const markerMatchesQuestion = (questionKey: string, markerName: string): boolean => {
  const markerKey = normalize(markerName);
  if (markerKey.length >= 3 && questionKey.includes(markerKey)) {
    return true;
  }
  const compactMarkerKey = markerKey.replace(/\s+/g, "");
  const compactQuestion = questionKey.replace(/\s+/g, "");
  if (compactMarkerKey.length >= 4 && compactQuestion.includes(compactMarkerKey)) {
    return true;
  }
  return false;
};

const detectIntent = (questionKey: string, matchedMarkers: string[]): QuestionIntent => {
  if (/\b(protocol|dose|dosage|inject|injection|frequency|compound|trt|kuur|schema|dosering)\b/.test(questionKey)) {
    return "protocol";
  }
  if (/\b(supplement|supplements|vitamin|vitamine|mineral|creatine|omega|fish oil|magnesium)\b/.test(questionKey)) {
    return "supplement";
  }
  if (/\b(energy|mood|sleep|libido|motivation|recovery|stress|focus|wellbeing|check in|checkin|slaap|energie|stemming)\b/.test(questionKey)) {
    return "wellbeing";
  }
  if (/\b(changed|change|verschil|changed since|since last|latest|previous|laatste|vorige|moved|delta)\b/.test(questionKey)) {
    return "latest_change";
  }
  if (matchedMarkers.length > 0) {
    return "marker";
  }
  if (/\b(priority|prioritize|focus|stand out|watch|retest|what should|waarop|opvallen|aandacht|monitor)\b/.test(questionKey)) {
    return "broad";
  }
  return "unknown";
};

const findMatchedMarkers = (question: string, reports: AiCoachReportRow[]): string[] => {
  const questionKey = normalize(question);
  const found = new Set<string>();

  Object.entries(QUESTION_ALIAS_MARKERS).forEach(([alias, markers]) => {
    if (questionKey.includes(normalize(alias))) {
      markers.forEach((marker) => found.add(marker));
    }
  });

  getAllMarkerNames(reports).forEach((markerName) => {
    if (markerMatchesQuestion(questionKey, markerName)) {
      found.add(markerName);
      return;
    }
    const canonical = canonicalizeMarker(markerName, { mode: "balanced" });
    if (canonical && canonical !== markerName && markerMatchesQuestion(questionKey, canonical)) {
      found.add(markerName);
      found.add(canonical);
    }
  });

  return Array.from(found).slice(0, MAX_FOCUSED_MARKERS);
};

const hasMarkerInReports = (reports: AiCoachReportRow[], markerName: string): boolean => {
  const target = normalize(markerName);
  return reports.some((report) => report.markers.some((marker) => normalize(marker.m) === target));
};

const expandRelatedMarkers = (matchedMarkers: string[], reports: AiCoachReportRow[]): string[] => {
  const expanded = new Set<string>(matchedMarkers);
  matchedMarkers.forEach((marker) => {
    const related = RELATED_MARKERS[marker] ?? RELATED_MARKERS[canonicalizeMarker(marker, { mode: "balanced" })] ?? [];
    related.forEach((candidate) => {
      if (hasMarkerInReports(reports, candidate)) {
        expanded.add(candidate);
      }
    });
  });
  return Array.from(expanded).slice(0, MAX_FOCUSED_MARKERS);
};

const latestAbnormalMarkers = (reports: AiCoachReportRow[]): string[] => {
  const latest = reports[reports.length - 1];
  if (!latest) {
    return [];
  }
  return latest.markers
    .filter((marker) => {
      const abnormal = deriveAbnormalFromReference(marker.v, marker.ref);
      return abnormal === "high" || abnormal === "low";
    })
    .map((marker) => marker.m);
};

const buildBroadSafetyMarkers = (summary: AiCoachSummary, signals: AiCoachSignals, reports: AiCoachReportRow[]): string[] => {
  const markers = new Set<string>();
  summary.topAlerts.forEach((alert) => markers.add(alert.marker));
  summary.topTrends
    .filter((trend) => trend.relevanceTag !== "background" || trend.outOfRangeFlag)
    .forEach((trend) => markers.add(trend.marker));
  latestAbnormalMarkers(reports).forEach((marker) => markers.add(marker));
  signals.markerTrends
    .filter((trend) => trend.directionTag === "worsening" && trend.relevanceTag !== "background")
    .slice(0, 4)
    .forEach((trend) => markers.add(trend.marker));
  summary.latestReport.notableMarkers.slice(0, 6).forEach((marker) => markers.add(marker.marker));
  return Array.from(markers).filter((marker) => hasMarkerInReports(reports, marker)).slice(0, MAX_BROAD_MARKERS);
};

const markerSet = (markers: string[]): Set<string> => new Set(markers.map((marker) => normalize(marker)));

const filterReportMarkers = (report: AiCoachReportRow, markers: Set<string>): AiCoachMarkerRow[] =>
  report.markers.filter((marker) => markers.has(normalize(marker.m)));

const sampleReports = (reports: AiCoachReportRow[], cap: number): AiCoachReportRow[] => {
  if (reports.length <= cap) {
    return reports;
  }
  const latestCount = Math.min(4, cap - 1);
  const selected = new Set<number>([0]);
  for (let index = Math.max(1, reports.length - latestCount); index < reports.length; index += 1) {
    selected.add(index);
  }
  for (let index = reports.length - latestCount - 1; index > 0 && selected.size < cap; index -= 1) {
    selected.add(index);
  }
  return Array.from(selected)
    .sort((left, right) => left - right)
    .map((index) => reports[index]);
};

const buildFocusedReports = (
  reports: AiCoachReportRow[],
  markers: string[],
  selectionMode: ContextSelectionMode
): AiCoachReportRow[] => {
  const selectedMarkerSet = markerSet(markers);
  const withRelevantMarkers = reports
    .map((report) => ({
      ...report,
      markers: filterReportMarkers(report, selectedMarkerSet)
    }))
    .filter((report) => report.markers.length > 0);
  const sampled = sampleReports(withRelevantMarkers, selectionMode === "focused" ? MAX_FOCUSED_REPORTS : MAX_BROAD_REPORTS);
  return sampled.map((report) => ({
    ...report,
    markers: report.markers.slice(0, selectionMode === "focused" ? MAX_FOCUSED_MARKERS : MAX_BROAD_MARKERS),
    ann: {
      ...report.ann,
      symptoms: "",
      notes: ""
    }
  }));
};

const buildMarkerSeries = (reports: AiCoachReportRow[], markers: string[]): AiCoachQuestionContext["focusedEvidence"]["markerSeries"] => {
  const selectedMarkerSet = markerSet(markers);
  return markers
    .map((markerName) => {
      const points = reports
        .flatMap((report) =>
          report.markers
            .filter((marker) => selectedMarkerSet.has(normalize(marker.m)) && normalize(marker.m) === normalize(markerName))
            .map((marker) => ({
              date: report.date,
              value: marker.v,
              abnormal: deriveAbnormalFromReference(marker.v, marker.ref),
              unit: marker.u
            }))
        )
        .sort((left, right) => left.date.localeCompare(right.date));
      if (points.length === 0) {
        return null;
      }
      const sampledPoints = sampleReports(
        points.map((point) => ({
          date: point.date,
          ann: {
            dose: null,
            compound: "",
            frequency: "",
            frequencyPerWeek: null,
            protocol: "",
            supps: "",
            symptoms: "",
            notes: "",
            timing: "unknown" as const
          },
          markers: [{ m: markerName, v: point.value, u: point.unit, ref: [null, null] as [null, null] }]
        })),
        MAX_SERIES_POINTS
      ).map((report) => {
        const marker = report.markers[0];
        return {
          date: report.date,
          value: marker.v,
          abnormal: points.find((point) => point.date === report.date)?.abnormal ?? "unknown"
        };
      });
      return {
        marker: markerName,
        unit: points[points.length - 1]?.unit ?? "",
        points: sampledPoints
      };
    })
    .filter((entry): entry is AiCoachQuestionContext["focusedEvidence"]["markerSeries"][number] => entry !== null);
};

const resolveLatestPair = (reports: AiCoachReportRow[]): { previous: AiCoachReportRow; latest: AiCoachReportRow } | null => {
  if (reports.length < 2) {
    return null;
  }
  return {
    previous: reports[reports.length - 2],
    latest: reports[reports.length - 1]
  };
};

const buildLatestComparison = (
  focusedReports: AiCoachReportRow[]
): AiCoachQuestionContext["focusedEvidence"]["latestComparison"] => {
  const pair = resolveLatestPair(focusedReports);
  if (!pair) {
    return null;
  }
  const previousByMarker = new Map(pair.previous.markers.map((marker) => [normalize(marker.m), marker] as const));
  const rows = pair.latest.markers
    .map((latestMarker) => {
      const previous = previousByMarker.get(normalize(latestMarker.m));
      if (!previous) {
        return null;
      }
      const delta = latestMarker.v - previous.v;
      const percentChange = Math.abs(previous.v) < 0.000001 ? null : (delta / previous.v) * 100;
      return {
        marker: latestMarker.m,
        unit: latestMarker.u,
        previousValue: toRounded(previous.v),
        latestValue: toRounded(latestMarker.v),
        delta: toRounded(delta),
        percentChange: percentChange === null ? null : toRounded(percentChange)
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
    .slice(0, MAX_COMPARISON_ROWS);
  return {
    previousDate: pair.previous.date,
    latestDate: pair.latest.date,
    rows
  };
};

const filterSignals = (
  signals: AiCoachSignals,
  markers: string[],
  intent: QuestionIntent,
  selectionMode: ContextSelectionMode
): AiCoachQuestionContext["focusedEvidence"]["focusedSignals"] => {
  const selected = markerSet(markers);
  const broad = selectionMode === "broad_safety";
  const protocolChanges =
    intent === "protocol" || intent === "latest_change" || broad
      ? signals.protocolChanges.slice(-5)
      : signals.protocolChanges.slice(-3);
  return {
    alerts: signals.alerts
      .filter((alert) => broad || selected.has(normalize(alert.marker)))
      .slice(0, broad ? 8 : 5),
    markerTrends: signals.markerTrends
      .filter((trend) => broad || selected.has(normalize(trend.marker)))
      .slice(0, broad ? 10 : 6),
    protocolChanges: protocolChanges.map((event) => ({
      ...event,
      context: {
        ...event.context,
        symptoms: "",
        notes: ""
      }
    })),
    dosePredictions: signals.dosePredictions,
    wellbeing: intent === "wellbeing" || broad ? signals.wellbeing : null
  };
};

export const buildAiCoachQuestionContext = ({
  question,
  reports,
  summary,
  signals
}: BuildAiCoachQuestionContextOptions): AiCoachQuestionContext => {
  const questionKey = normalize(question);
  const matchedMarkers = findMatchedMarkers(question, reports);
  const intent = detectIntent(questionKey, matchedMarkers);
  const shouldUseBroadSafety =
    intent === "broad" ||
    intent === "unknown" ||
    (matchedMarkers.length === 0 && (intent === "latest_change" || intent === "protocol" || intent === "supplement" || intent === "wellbeing"));
  const selectionMode: ContextSelectionMode = shouldUseBroadSafety ? "broad_safety" : "focused";
  const relatedMarkers = selectionMode === "focused"
    ? expandRelatedMarkers(matchedMarkers, reports)
    : buildBroadSafetyMarkers(summary, signals, reports);
  const markersForEvidence = relatedMarkers.length > 0 ? relatedMarkers : buildBroadSafetyMarkers(summary, signals, reports);
  const focusedReports = buildFocusedReports(reports, markersForEvidence, selectionMode);
  const focusedSignals = filterSignals(signals, markersForEvidence, intent, selectionMode);

  return {
    fullPictureSummary: summary,
    focusedEvidence: {
      selectionMode,
      intent,
      matchedMarkers,
      relatedMarkers: markersForEvidence,
      reports: focusedReports,
      markerSeries: buildMarkerSeries(reports, markersForEvidence),
      latestComparison: buildLatestComparison(focusedReports),
      focusedSignals,
      contextNote:
        selectionMode === "focused"
          ? "Focused evidence selected from the question, with related markers added for safety."
          : "Broad safety context selected because the question was broad or ambiguous."
    }
  };
};
