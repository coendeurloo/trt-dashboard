import { SymptomCheckIn, LabReport, WellbeingMetricId } from "./types";
import { sortReportsChronological } from "./utils";
import { getCheckInMetricValue, getCheckInValues } from "./wellbeingMetrics";

export const AI_ANALYSIS_REPORT_CAP = 10;
export const WELLBEING_RECENT_POINTS_CAP = 8;
const WELLBEING_TREND_DELTA_THRESHOLD = 0.6;

export type AnalysisScopeReason = "timeline_sampled";

export interface AnalysisScopeNotice {
  usedReports: number;
  totalReports: number;
  lookbackApplied: boolean;
  capApplied: boolean;
  reason: AnalysisScopeReason;
}

export interface AnalysisScopeSelection {
  selectedReports: LabReport[];
  notice: AnalysisScopeNotice | null;
}

export type WellbeingMetricKey = WellbeingMetricId;
export type WellbeingTrendDirection = "rising" | "falling" | "stable" | "insufficient";

export interface WellbeingSummary {
  windowStart: string | null;
  windowEnd: string | null;
  count: number;
  latestDate: string | null;
  latestAverage: number | null;
  metricAverages: Partial<Record<WellbeingMetricKey, number | null>>;
  metricTrends: Partial<Record<WellbeingMetricKey, WellbeingTrendDirection>>;
  recentPoints: Array<{
    date: string;
    profileAtEntry?: string;
    values?: Partial<Record<WellbeingMetricKey, number>>;
    energy?: number | null;
    mood?: number | null;
    sleep?: number | null;
    libido?: number | null;
    motivation?: number | null;
  }>;
}

interface SelectReportsForAnalysisOptions {
  reports: LabReport[];
  analysisType: "full" | "latestComparison";
}

interface BuildWellbeingSummaryOptions {
  reports: LabReport[];
  checkIns: SymptomCheckIn[];
}

const WELLBEING_METRIC_KEYS: WellbeingMetricKey[] = ["energy", "mood", "sleep", "libido", "motivation", "recovery", "stress", "focus"];

const round2 = (value: number): number => Number(value.toFixed(2));

const averageNumbers = (values: Array<number | null>): number | null => {
  const numeric = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numeric.length === 0) {
    return null;
  }
  const total = numeric.reduce((sum, value) => sum + value, 0);
  return round2(total / numeric.length);
};

const emptyWellbeingMetrics = <T>(value: T): Record<WellbeingMetricKey, T> => ({
  energy: value,
  mood: value,
  sleep: value,
  libido: value,
  motivation: value,
  recovery: value,
  stress: value,
  focus: value
});

const trendFromSeries = (values: number[]): WellbeingTrendDirection => {
  if (values.length < 2) {
    return "insufficient";
  }
  const delta = values[values.length - 1] - values[0];
  if (delta >= WELLBEING_TREND_DELTA_THRESHOLD) {
    return "rising";
  }
  if (delta <= -WELLBEING_TREND_DELTA_THRESHOLD) {
    return "falling";
  }
  return "stable";
};

const markerKey = (value: string): string => value.trim().toLowerCase();

const markerOverlapCount = (left: LabReport, right: LabReport): number => {
  const leftMarkers = new Set(left.markers.map((marker) => markerKey(marker.canonicalMarker || marker.marker)));
  if (leftMarkers.size === 0) {
    return 0;
  }
  return right.markers.reduce((count, marker) => {
    const key = markerKey(marker.canonicalMarker || marker.marker);
    return leftMarkers.has(key) ? count + 1 : count;
  }, 0);
};

const selectLatestComparisonPair = (chronological: LabReport[]): LabReport[] => {
  if (chronological.length <= 2) {
    return chronological.slice(-2);
  }

  const latest = chronological[chronological.length - 1];
  const immediatePrevious = chronological[chronological.length - 2];

  let bestIndex = chronological.length - 2;
  let bestOverlap = markerOverlapCount(latest, immediatePrevious);

  for (let index = 0; index < chronological.length - 1; index += 1) {
    const candidate = chronological[index];
    const overlap = markerOverlapCount(latest, candidate);
    if (overlap > bestOverlap || (overlap === bestOverlap && index > bestIndex)) {
      bestIndex = index;
      bestOverlap = overlap;
    }
  }

  if (bestOverlap <= 0) {
    return [immediatePrevious, latest];
  }
  return [chronological[bestIndex], latest];
};

const selectTimelineSample = (chronological: LabReport[], cap: number): LabReport[] => {
  if (chronological.length <= cap) {
    return chronological;
  }

  const total = chronological.length;
  const recentCount = Math.min(4, cap - 2);
  const recentStart = Math.max(1, total - recentCount);
  const anchorPool = Array.from({ length: Math.max(0, recentStart - 1) }, (_, index) => index + 1);
  const anchorSlots = Math.max(0, cap - 1 - recentCount);
  const selectedIndexSet = new Set<number>([0]);

  if (anchorPool.length > 0 && anchorSlots > 0) {
    const targetCount = Math.min(anchorSlots, anchorPool.length);
    for (let slot = 0; slot < targetCount; slot += 1) {
      const fractional = (slot + 0.5) * (anchorPool.length / targetCount);
      const poolIndex = Math.min(anchorPool.length - 1, Math.floor(fractional));
      selectedIndexSet.add(anchorPool[poolIndex]);
    }
    if (selectedIndexSet.size < 1 + targetCount) {
      for (let poolIndex = anchorPool.length - 1; poolIndex >= 0 && selectedIndexSet.size < 1 + targetCount; poolIndex -= 1) {
        selectedIndexSet.add(anchorPool[poolIndex]);
      }
    }
  }

  for (let index = recentStart; index < total; index += 1) {
    selectedIndexSet.add(index);
  }

  return Array.from(selectedIndexSet)
    .sort((left, right) => left - right)
    .slice(-cap)
    .map((index) => chronological[index]);
};

export const selectReportsForAnalysis = ({
  reports,
  analysisType
}: SelectReportsForAnalysisOptions): AnalysisScopeSelection => {
  const chronological = sortReportsChronological(reports);

  if (analysisType === "latestComparison") {
    return {
      selectedReports: selectLatestComparisonPair(chronological),
      notice: null
    };
  }

  if (chronological.length <= AI_ANALYSIS_REPORT_CAP) {
    return {
      selectedReports: chronological,
      notice: null
    };
  }

  const selectedReports = selectTimelineSample(chronological, AI_ANALYSIS_REPORT_CAP);

  return {
    selectedReports,
    notice: {
      usedReports: selectedReports.length,
      totalReports: chronological.length,
      lookbackApplied: false,
      capApplied: true,
      reason: "timeline_sampled"
    }
  };
};

export const buildWellbeingSummary = ({ reports, checkIns }: BuildWellbeingSummaryOptions): WellbeingSummary | null => {
  if (reports.length === 0) {
    return null;
  }

  const chronologicalReports = sortReportsChronological(reports);
  const windowStart = chronologicalReports[0]?.testDate ?? null;
  const windowEnd = chronologicalReports[chronologicalReports.length - 1]?.testDate ?? null;

  const scopedCheckIns = [...checkIns]
    .filter((checkIn) => {
      if (!windowStart || !windowEnd) {
        return false;
      }
      return checkIn.date >= windowStart && checkIn.date <= windowEnd;
    })
    .sort((left, right) => left.date.localeCompare(right.date));

  const latest = scopedCheckIns[scopedCheckIns.length - 1] ?? null;
  const latestAverage = latest ? averageNumbers(Object.values(getCheckInValues(latest))) : null;

  const metricAverages = emptyWellbeingMetrics<number | null>(null);
  const metricTrends = emptyWellbeingMetrics<WellbeingTrendDirection>("insufficient");

  WELLBEING_METRIC_KEYS.forEach((key) => {
    const values = scopedCheckIns
      .map((checkIn) => getCheckInMetricValue(checkIn, key))
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    metricAverages[key] = averageNumbers(values);
    metricTrends[key] = trendFromSeries(values);
  });

  return {
    windowStart,
    windowEnd,
    count: scopedCheckIns.length,
    latestDate: latest?.date ?? null,
    latestAverage,
    metricAverages,
    metricTrends,
    recentPoints: scopedCheckIns.slice(-WELLBEING_RECENT_POINTS_CAP).map((checkIn) => ({
      date: checkIn.date,
      profileAtEntry: checkIn.profileAtEntry ?? "trt",
      values: getCheckInValues(checkIn),
      energy: getCheckInMetricValue(checkIn, "energy"),
      mood: getCheckInMetricValue(checkIn, "mood"),
      sleep: getCheckInMetricValue(checkIn, "sleep"),
      libido: getCheckInMetricValue(checkIn, "libido"),
      motivation: getCheckInMetricValue(checkIn, "motivation")
    }))
  };
};
