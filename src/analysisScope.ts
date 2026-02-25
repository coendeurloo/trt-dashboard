import { SymptomCheckIn, LabReport } from "./types";
import { sortReportsChronological } from "./utils";

export const AI_ANALYSIS_REPORT_CAP = 10;
export const AI_ANALYSIS_LOOKBACK_MONTHS = 24;
export const WELLBEING_RECENT_POINTS_CAP = 8;
const WELLBEING_TREND_DELTA_THRESHOLD = 0.6;

export type AnalysisScopeReason = "lookback_and_cap" | "lookback_only" | "recent_cap_fallback";

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

export type WellbeingMetricKey = "energy" | "mood" | "sleep" | "libido" | "motivation";
export type WellbeingTrendDirection = "rising" | "falling" | "stable" | "insufficient";

export interface WellbeingSummary {
  windowStart: string | null;
  windowEnd: string | null;
  count: number;
  latestDate: string | null;
  latestAverage: number | null;
  metricAverages: Record<WellbeingMetricKey, number | null>;
  metricTrends: Record<WellbeingMetricKey, WellbeingTrendDirection>;
  recentPoints: Array<{
    date: string;
    energy: number | null;
    mood: number | null;
    sleep: number | null;
    libido: number | null;
    motivation: number | null;
  }>;
}

interface SelectReportsForAnalysisOptions {
  reports: LabReport[];
  analysisType: "full" | "latestComparison";
  now?: Date | string;
}

interface BuildWellbeingSummaryOptions {
  reports: LabReport[];
  checkIns: SymptomCheckIn[];
}

const WELLBEING_METRIC_KEYS: WellbeingMetricKey[] = ["energy", "mood", "sleep", "libido", "motivation"];

const toIsoDate = (value: Date): string => value.toISOString().slice(0, 10);

const resolveNow = (now?: Date | string): Date => {
  if (!now) {
    return new Date();
  }
  if (now instanceof Date) {
    return Number.isFinite(now.getTime()) ? now : new Date();
  }
  const parsed = new Date(now);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
};

const lookbackStartIsoDate = (now?: Date | string): string => {
  const current = resolveNow(now);
  const lookbackStart = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate()));
  lookbackStart.setUTCMonth(lookbackStart.getUTCMonth() - AI_ANALYSIS_LOOKBACK_MONTHS);
  return toIsoDate(lookbackStart);
};

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
  motivation: value
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

export const selectReportsForAnalysis = ({
  reports,
  analysisType,
  now
}: SelectReportsForAnalysisOptions): AnalysisScopeSelection => {
  const chronological = sortReportsChronological(reports);

  if (analysisType === "latestComparison") {
    return {
      selectedReports: chronological.slice(-2),
      notice: null
    };
  }

  if (chronological.length <= AI_ANALYSIS_REPORT_CAP) {
    return {
      selectedReports: chronological,
      notice: null
    };
  }

  const lookbackStart = lookbackStartIsoDate(now);
  const lookbackReports = chronological.filter((report) => report.testDate >= lookbackStart);

  if (lookbackReports.length === 0) {
    const selectedReports = chronological.slice(-AI_ANALYSIS_REPORT_CAP);
    return {
      selectedReports,
      notice: {
        usedReports: selectedReports.length,
        totalReports: chronological.length,
        lookbackApplied: true,
        capApplied: true,
        reason: "recent_cap_fallback"
      }
    };
  }

  if (lookbackReports.length > AI_ANALYSIS_REPORT_CAP) {
    const selectedReports = lookbackReports.slice(-AI_ANALYSIS_REPORT_CAP);
    return {
      selectedReports,
      notice: {
        usedReports: selectedReports.length,
        totalReports: chronological.length,
        lookbackApplied: true,
        capApplied: true,
        reason: "lookback_and_cap"
      }
    };
  }

  return {
    selectedReports: lookbackReports,
    notice: {
      usedReports: lookbackReports.length,
      totalReports: chronological.length,
      lookbackApplied: true,
      capApplied: false,
      reason: "lookback_only"
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
  const latestAverage = latest
    ? averageNumbers([latest.energy, latest.mood, latest.sleep, latest.libido, latest.motivation])
    : null;

  const metricAverages = emptyWellbeingMetrics<number | null>(null);
  const metricTrends = emptyWellbeingMetrics<WellbeingTrendDirection>("insufficient");

  WELLBEING_METRIC_KEYS.forEach((key) => {
    const values = scopedCheckIns
      .map((checkIn) => checkIn[key])
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
      energy: checkIn.energy,
      mood: checkIn.mood,
      sleep: checkIn.sleep,
      libido: checkIn.libido,
      motivation: checkIn.motivation
    }))
  };
};
