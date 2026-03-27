import { ProtocolImpactDoseEvent, ProtocolImpactMarkerRow } from "../analytics";
import { getMarkerDisplayName } from "../i18n";
import { AppLanguage } from "../types";
import { formatAxisTick } from "../chartHelpers";

const HORMONE_MARKERS = ["Testosterone", "Free Testosterone"];
const LIPID_IMPROVEMENT_MARKERS = ["LDL Cholesterol", "LDL", "Triglycerides", "Total Cholesterol"];

const normalizeMarkerName = (value: string): string => value.trim().toLowerCase();

const markerMatches = (marker: string, candidates: string[]): boolean => {
  const normalizedMarker = normalizeMarkerName(marker);
  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeMarkerName(candidate);
    return normalizedMarker === normalizedCandidate || normalizedMarker.includes(normalizedCandidate);
  });
};

const doseWasIncreased = (event: ProtocolImpactDoseEvent): boolean => {
  if (event.fromDose === null || event.toDose === null) {
    return false;
  }
  return event.toDose > event.fromDose;
};

const classifyChangeContext = (
  marker: string,
  percentChange: number | null,
  event: ProtocolImpactDoseEvent
): "expected" | "monitor" | "improvement" | "watch" | "neutral" => {
  if (percentChange === null || !Number.isFinite(percentChange)) {
    return "neutral";
  }

  if (markerMatches(marker, HORMONE_MARKERS) && doseWasIncreased(event) && percentChange > 0) {
    return "expected";
  }
  if (markerMatches(marker, LIPID_IMPROVEMENT_MARKERS) && percentChange < -5) {
    return "improvement";
  }
  if (markerMatches(marker, ["eGFR"]) && percentChange > 5) {
    return "improvement";
  }
  if (markerMatches(marker, ["Creatinine"]) && percentChange < -5) {
    return "improvement";
  }
  if (markerMatches(marker, ["Estradiol"]) && percentChange > 15) {
    return "monitor";
  }
  if (markerMatches(marker, ["Hematocrit"]) && percentChange > 3) {
    return "monitor";
  }
  if (markerMatches(marker, ["LDL Cholesterol", "LDL"]) && percentChange > 10) {
    return "watch";
  }
  if (markerMatches(marker, ["PSA"]) && percentChange > 15) {
    return "watch";
  }
  return "neutral";
};

const classifyMarkerSentiment = (
  row: ProtocolImpactMarkerRow,
  event: ProtocolImpactDoseEvent
): "favorable" | "unfavorable" | "neutral" => {
  if (row.insufficientData || row.deltaPct === null || !Number.isFinite(row.deltaPct)) {
    return "neutral";
  }

  const context = classifyChangeContext(row.marker, row.deltaPct, event);
  if (context === "improvement" || context === "expected") {
    return "favorable";
  }
  if (context === "monitor" || context === "watch") {
    return "unfavorable";
  }

  if (markerMatches(row.marker, [...LIPID_IMPROVEMENT_MARKERS, "Creatinine"])) {
    return row.deltaPct < 0 ? "favorable" : "unfavorable";
  }

  if (markerMatches(row.marker, ["eGFR"])) {
    return row.deltaPct > 0 ? "favorable" : "unfavorable";
  }

  return "neutral";
};

const hasMeasuredDelta = (row: ProtocolImpactMarkerRow): boolean =>
  !row.insufficientData &&
  row.beforeAvg !== null &&
  row.afterAvg !== null &&
  row.deltaPct !== null &&
  Number.isFinite(row.deltaPct);

const uniqueValues = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const normalized = value.trim();
    if (!normalized) {
      return;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(normalized);
  });
  return result;
};

export const summarizeCompounds = (
  fromCompounds: string[],
  toCompounds: string[]
): { added: string[]; removed: string[]; kept: string[] } => {
  const fromList = uniqueValues(fromCompounds);
  const toList = uniqueValues(toCompounds);
  const fromSet = new Set(fromList.map((value) => value.toLowerCase()));
  const toSet = new Set(toList.map((value) => value.toLowerCase()));

  const kept = toList.filter((value) => fromSet.has(value.toLowerCase()));
  const added = toList.filter((value) => !fromSet.has(value.toLowerCase()));
  const removed = fromList.filter((value) => !toSet.has(value.toLowerCase()));

  return { added, removed, kept };
};

export const getEventOutcomeSummary = (
  rows: ProtocolImpactMarkerRow[],
  event: ProtocolImpactDoseEvent
): { improved: number; worsened: number; unchanged: number; measuredRows: ProtocolImpactMarkerRow[] } => {
  const measuredRows = rows.filter(hasMeasuredDelta);
  let improved = 0;
  let worsened = 0;
  let unchanged = 0;

  measuredRows.forEach((row) => {
    const sentiment = classifyMarkerSentiment(row, event);
    if (sentiment === "favorable") {
      improved += 1;
      return;
    }
    if (sentiment === "unfavorable") {
      worsened += 1;
      return;
    }
    unchanged += 1;
  });

  return { improved, worsened, unchanged, measuredRows };
};

export const getLargestShiftRows = (
  rows: ProtocolImpactMarkerRow[],
  limit = 3
): ProtocolImpactMarkerRow[] =>
  rows
    .filter(hasMeasuredDelta)
    .sort((left, right) => Math.abs((right.deltaPct ?? 0) - 0) - Math.abs((left.deltaPct ?? 0) - 0))
    .slice(0, limit);

export const selectTopMeaningfulMarkers = (
  event: ProtocolImpactDoseEvent,
  rows: ProtocolImpactMarkerRow[],
  limit = 3
): ProtocolImpactMarkerRow[] => {
  const measuredByMarker = new Map(
    rows.filter(hasMeasuredDelta).map((row) => [normalizeMarkerName(row.marker), row])
  );
  const picked: ProtocolImpactMarkerRow[] = [];
  const seen = new Set<string>();

  event.topImpacts.forEach((topRow) => {
    if (picked.length >= limit) {
      return;
    }
    const key = normalizeMarkerName(topRow.marker);
    if (seen.has(key)) {
      return;
    }
    const measuredRow = measuredByMarker.get(key);
    if (!measuredRow) {
      return;
    }
    seen.add(key);
    picked.push(measuredRow);
  });

  if (picked.length < limit) {
    rows
      .filter(hasMeasuredDelta)
      .sort((left, right) => {
        const deltaDiff = Math.abs(right.deltaPct ?? 0) - Math.abs(left.deltaPct ?? 0);
        if (deltaDiff !== 0) {
          return deltaDiff;
        }
        return right.impactScore - left.impactScore;
      })
      .forEach((row) => {
        if (picked.length >= limit) {
          return;
        }
        const key = normalizeMarkerName(row.marker);
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        picked.push(row);
      });
  }

  return picked;
};

export const getMarkerStatus = (
  row: ProtocolImpactMarkerRow,
  event: ProtocolImpactDoseEvent,
  tr: (nl: string, en: string) => string
): { label: string; toneClass: string } => {
  if (!hasMeasuredDelta(row)) {
    return {
      label: tr("Geen duidelijke verandering", "No clear change"),
      toneClass: "border-slate-600/70 bg-slate-800/70 text-slate-200"
    };
  }

  const sentiment = classifyMarkerSentiment(row, event);
  if (sentiment === "favorable") {
    return {
      label: tr("Verbeterd", "Improved"),
      toneClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
    };
  }
  if (sentiment === "unfavorable") {
    return {
      label: tr("Bewaken", "Watch"),
      toneClass: "border-rose-500/30 bg-rose-500/10 text-rose-200"
    };
  }
  return {
    label: tr("Geen duidelijke verandering", "No clear change"),
    toneClass: "border-slate-600/70 bg-slate-800/70 text-slate-200"
  };
};

export const getConfidenceLabel = (
  confidence: ProtocolImpactDoseEvent["eventConfidence"],
  tr: (nl: string, en: string) => string
): { label: string; toneClass: string } => {
  if (confidence === "High") {
    return {
      label: tr("Hoge betrouwbaarheid", "High confidence"),
      toneClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
    };
  }
  if (confidence === "Medium") {
    return {
      label: tr("Beperkte data", "Limited data"),
      toneClass: "border-amber-500/30 bg-amber-500/10 text-amber-200"
    };
  }
  return {
    label: tr("Lage betrouwbaarheid", "Low confidence"),
    toneClass: "border-rose-500/30 bg-rose-500/10 text-rose-200"
  };
};

export const getLargestShiftsLabel = (
  rows: ProtocolImpactMarkerRow[],
  language: AppLanguage,
  tr: (nl: string, en: string) => string
): string => {
  const topRows = getLargestShiftRows(rows, 3);
  if (topRows.length === 0) {
    return tr("Nog geen duidelijke verschuivingen.", "No clear shifts yet.");
  }

  const parts = topRows.map((row) => {
    const delta = row.deltaPct ?? 0;
    const direction = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
    const markerLabel = getMarkerDisplayName(row.marker, language);
    return `${markerLabel} ${direction} ${Math.abs(Number(formatAxisTick(delta)))}%`;
  });
  return parts.join(", ");
};

export const getEventSelectorLabel = (
  event: ProtocolImpactDoseEvent,
  tr: (nl: string, en: string) => string,
  formatDate: (value: string) => string
): string => {
  const compactCompoundLabel = (values: string[]): string => {
    const cleaned = values.map((value) => value.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      return "";
    }
    if (cleaned.length === 1) {
      return cleaned[0] ?? "";
    }
    return `${cleaned[0]} +${cleaned.length - 1}`;
  };

  const compoundLabel = compactCompoundLabel(event.toCompounds) || compactCompoundLabel(event.fromCompounds);
  const dateLabel = formatDate(event.changeDate);
  const hasDose = event.fromDose !== event.toDose;
  const hasFrequency = event.fromFrequency !== event.toFrequency;

  if (hasDose) {
    const fromLabel = event.fromDose === null ? "?" : `${formatAxisTick(event.fromDose)} mg/wk`;
    const toLabel = event.toDose === null ? "?" : `${formatAxisTick(event.toDose)} mg/wk`;
    return compoundLabel
      ? `${dateLabel} · ${fromLabel} -> ${toLabel} · ${compoundLabel}`
      : `${dateLabel} · ${fromLabel} -> ${toLabel}`;
  }
  if (hasFrequency) {
    const fromLabel = event.fromFrequency === null ? "?" : `${formatAxisTick(event.fromFrequency)}/wk`;
    const toLabel = event.toFrequency === null ? "?" : `${formatAxisTick(event.toFrequency)}/wk`;
    return compoundLabel
      ? `${dateLabel} · ${fromLabel} -> ${toLabel} · ${compoundLabel}`
      : `${dateLabel} · ${fromLabel} -> ${toLabel}`;
  }
  if (event.eventType === "compound") {
    const fromCompound = compactCompoundLabel(event.fromCompounds);
    const toCompound = compactCompoundLabel(event.toCompounds);
    if (fromCompound || toCompound) {
      return `${dateLabel} · ${fromCompound || "?"} -> ${toCompound || "?"}`;
    }
    return `${dateLabel} · ${tr("Compoundwijziging", "Compound update")}`;
  }
  if (compoundLabel) {
    return `${dateLabel} · ${tr("Protocolwijziging", "Protocol update")} · ${compoundLabel}`;
  }
  return `${dateLabel} · ${tr("Protocolwijziging", "Protocol update")}`;
};
