import { createElement } from "react";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { ReportAnnotations, AppLanguage, MarkerValue, AppSettings, ExtractionDraft, LabReport } from "./types";
import { createId, deriveAbnormalFlag, sortReportsChronological } from "./utils";
import { canonicalizeMarker, normalizeMarkerMeasurement } from "./unitConversion";
import { MarkerTrendSummary } from "./analytics";

export const markerColor = (index: number): string => {
  const palette = ["#22d3ee", "#f472b6", "#a78bfa", "#34d399", "#f59e0b", "#60a5fa", "#fb7185", "#2dd4bf"];
  return palette[index % palette.length] ?? "#22d3ee";
};

export const formatAxisTick = (value: number): string => {
  const abs = Math.abs(value);
  let decimals = 2;
  if (abs >= 100) {
    decimals = 0;
  } else if (abs >= 10) {
    decimals = 1;
  } else if (abs < 1) {
    decimals = 3;
  }
  return Number(value.toFixed(decimals)).toString();
};

export const buildYAxisDomain = (
  values: number[],
  mode: AppSettings["yAxisMode"]
): [number, number] | undefined => {
  if (values.length === 0) {
    return undefined;
  }

  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) {
    return undefined;
  }

  const span = Math.abs(dataMax - dataMin);
  const padding = span === 0 ? Math.max(Math.abs(dataMax) * 0.08, 1) : span * 0.08;

  if (mode === "data") {
    const min = dataMin - padding;
    const max = dataMax + padding;
    return max > min ? [min, max] : [dataMin - 1, dataMax + 1];
  }

  const min = dataMin < 0 ? dataMin - padding : 0;
  const max = dataMax + padding;
  return max > min ? [min, max] : [min, min + 1];
};

export const blankAnnotations = (): ReportAnnotations => ({
  dosageMgPerWeek: null,
  compound: "",
  injectionFrequency: "unknown",
  protocol: "",
  supplements: "",
  symptoms: "",
  notes: "",
  samplingTiming: "trough"
});

export const normalizeAnalysisTextForDisplay = (raw: string): string => {
  if (!raw.trim()) {
    return "";
  }

  return raw
    .replace(/\r\n/g, "\n")
    .replace(
      /([^\n])\s+(?=(Supplement:|Advies:|Huidige status|Optie:|Waarom nu|Verwachte impact:|Mogelijke nadelen:|Mogelijke nadelen\/barrières:|Praktische dosering|Praktische uitvoering|Wat monitoren|Evidentie uit betrouwbare studies:|Evidentie \(auteur\/jaar\/studietype\):|Leefstijlactie:|Confidence:))/g,
      "$1\n"
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const compactTooltipText = (value: string, maxLength = 64): string => {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "-";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(1, maxLength - 1))}\u2026`;
};

export const clampNumber = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export const stabilityColor = (score: number | null): string => {
  if (score === null) {
    return "#64748b";
  }
  if (score >= 80) {
    return "#22c55e";
  }
  if (score >= 60) {
    return "#f59e0b";
  }
  return "#fb7185";
};

export const normalizeMarkerKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const markerSimilarity = (left: string, right: string): number => {
  const a = normalizeMarkerKey(left);
  const b = normalizeMarkerKey(right);
  if (!a || !b) {
    return 0;
  }
  if (a === b) {
    return 1;
  }
  if (a.includes(b) || b.includes(a)) {
    return 0.9;
  }

  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  const sharedTokens = Array.from(aTokens).filter((token) => bTokens.has(token)).length;
  const tokenScore = (2 * sharedTokens) / (aTokens.size + bTokens.size);

  const aBigrams = new Set(Array.from({ length: Math.max(0, a.length - 1) }, (_, i) => a.slice(i, i + 2)));
  const bBigrams = new Set(Array.from({ length: Math.max(0, b.length - 1) }, (_, i) => b.slice(i, i + 2)));
  const sharedBigrams = Array.from(aBigrams).filter((token) => bBigrams.has(token)).length;
  const bigramScore = aBigrams.size === 0 || bBigrams.size === 0 ? 0 : (2 * sharedBigrams) / (aBigrams.size + bBigrams.size);

  return tokenScore * 0.65 + bigramScore * 0.35;
};

export const dedupeMarkersInReport = (markers: MarkerValue[]): MarkerValue[] =>
  Array.from(
    markers
      .reduce((map, marker) => {
        const key = `${marker.canonicalMarker}|${marker.value}|${marker.unit}|${marker.referenceMin ?? ""}|${marker.referenceMax ?? ""}|${marker.isCalculated ? "calc" : "raw"}`;
        const existing = map.get(key);
        if (!existing || marker.confidence > existing.confidence) {
          map.set(key, marker);
        }
        return map;
      }, new Map<string, MarkerValue>())
      .values()
  );

export const trendVisual = (direction: MarkerTrendSummary["direction"] | null): { icon: JSX.Element; text: string } => {
  if (direction === "rising") {
    return { icon: createElement(ArrowUp, { className: "h-3.5 w-3.5 text-emerald-300" }), text: "Rising" };
  }
  if (direction === "falling") {
    return { icon: createElement(ArrowDown, { className: "h-3.5 w-3.5 text-amber-300" }), text: "Falling" };
  }
  if (direction === "volatile") {
    return { icon: createElement(AlertTriangle, { className: "h-3.5 w-3.5 text-rose-300" }), text: "Volatile" };
  }
  return { icon: createElement(ArrowRight, { className: "h-3.5 w-3.5 text-slate-300" }), text: "Stable" };
};

export const markerCardAccentClass = (alertCount: number, latestAbnormal: MarkerValue["abnormal"] | null): string => {
  if (alertCount > 0 || latestAbnormal === "high") {
    return "border-l-4 border-l-rose-400";
  }
  if (latestAbnormal === "low") {
    return "border-l-4 border-l-amber-400";
  }
  return "border-l-4 border-l-emerald-400";
};

export const phaseColor = (dose: number | null, index: number): string => {
  if (dose !== null && dose >= 160) {
    return "#f59e0b";
  }
  if (dose !== null && dose >= 120) {
    return "#22d3ee";
  }
  if (dose !== null && dose < 120) {
    return "#34d399";
  }
  return index % 2 === 0 ? "#334155" : "#1e293b";
};

export const abnormalStatusLabel = (value: MarkerValue["abnormal"], language: AppLanguage): string => {
  if (value === "high") {
    return language === "nl" ? "Hoog" : "High";
  }
  if (value === "low") {
    return language === "nl" ? "Laag" : "Low";
  }
  if (value === "normal") {
    return language === "nl" ? "Normaal" : "Normal";
  }
  return language === "nl" ? "Onbekend" : "Unknown";
};

export const normalizeDraftMarker = (row: MarkerValue): MarkerValue => {
  const normalized = normalizeMarkerMeasurement({
    canonicalMarker: row.canonicalMarker,
    value: row.value,
    unit: row.unit,
    referenceMin: row.referenceMin,
    referenceMax: row.referenceMax
  });

  return {
    ...row,
    value: normalized.value,
    unit: normalized.unit,
    referenceMin: normalized.referenceMin,
    referenceMax: normalized.referenceMax,
    abnormal: deriveAbnormalFlag(normalized.value, normalized.referenceMin, normalized.referenceMax)
  };
};

export const buildEmptyDraftMarker = (): MarkerValue => ({
  id: createId(),
  marker: "",
  canonicalMarker: "Unknown Marker",
  value: 0,
  unit: "",
  referenceMin: null,
  referenceMax: null,
  abnormal: "unknown",
  confidence: 0.4
});

export const normalizeImportedReportMarkers = (report: LabReport): LabReport => ({
  ...report,
  markers: dedupeMarkersInReport(report.markers)
});

export const normalizeDraftCanonicalMarker = (markerLabel: string): string => canonicalizeMarker(markerLabel);

export const sortReports = (reports: LabReport[]): LabReport[] => sortReportsChronological(reports);

export type ExtractionReviewDraft = ExtractionDraft;
