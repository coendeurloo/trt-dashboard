import type { WellbeingSummary } from "./analysisScope";
import type { AppLanguage, UnitSystem, UserProfile } from "./types";

type AbnormalFlag = "low" | "high" | "normal" | "unknown";

export interface AiCoachMarkerRow {
  m: string;
  v: number;
  u: string;
  ref: [number | null, number | null];
}

export interface AiCoachReportRow {
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
  markers: AiCoachMarkerRow[];
}

export interface AiCoachPersonalContext {
  ageYears: number | null;
  weightKg: number | null;
  heightCm: number | null;
}

export interface AiCoachSupplementContext {
  latestReportDate: string | null;
  activeAtLatestTestDate: string;
  activeToday: string;
  recentDoseOrFrequencyChanges: Array<{
    supplement: string;
    effectiveDate: string;
    from: string;
    to: string;
  }>;
}

export interface AiCoachSignals {
  period: {
    reportCount: number;
    firstDate: string | null;
    lastDate: string | null;
  };
  markerTrends: Array<{
    marker: string;
    directionTag: "worsening" | "improving" | "stable";
    severityTag: "high" | "medium" | "low";
    outOfRangeFlag: boolean;
    relevanceTag: "critical" | "important" | "background";
  }>;
  protocolChanges: Array<{
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
  }>;
  alerts: Array<{
    marker: string;
    type: string;
    severity: "high" | "medium" | "low" | "positive";
    message: string;
  }>;
  dosePredictions: unknown[];
  wellbeing?: WellbeingSummary | null;
  gaps: {
    reportsWithNotes: number;
    reportsWithSymptoms: number;
    sparseMarkers: string[];
    missingSignalMarkers: readonly string[];
  };
  samplingFilter: "all" | "trough" | "peak";
}

export interface AiCoachSummary {
  version: 1;
  language: AppLanguage;
  userProfile: UserProfile;
  unitSystem: UnitSystem;
  personalContext: AiCoachPersonalContext;
  reportWindow: {
    reportCount: number;
    firstDate: string | null;
    latestDate: string | null;
  };
  latestReport: {
    date: string | null;
    markerCount: number;
    samplingTiming: "unknown" | "trough" | "mid" | "peak";
    protocol: {
      doseMgPerWeek: number | null;
      compound: string;
      frequency: string;
      frequencyPerWeek: number | null;
      name: string;
    };
    notableMarkers: Array<{
      marker: string;
      value: number;
      unit: string;
      abnormal: AbnormalFlag;
    }>;
  };
  currentSupplements: {
    activeAtLatestTestDate: string;
    activeToday: string;
    recentDoseOrFrequencyChanges: AiCoachSupplementContext["recentDoseOrFrequencyChanges"];
  };
  topAlerts: AiCoachSignals["alerts"];
  topTrends: AiCoachSignals["markerTrends"];
  wellbeing: Pick<WellbeingSummary, "count" | "latestDate" | "latestAverage" | "metricAverages" | "metricTrends"> | null;
  dataGaps: {
    sparseMarkers: string[];
    missingSignalMarkers: readonly string[];
    samplingFilter: "all" | "trough" | "peak";
  };
}

interface BuildAiCoachSummaryOptions {
  reports: AiCoachReportRow[];
  language: AppLanguage;
  profile: UserProfile;
  unitSystem: UnitSystem;
  personalContext: AiCoachPersonalContext;
  supplementContext: AiCoachSupplementContext;
  signals: AiCoachSignals;
}

const SUMMARY_ALERT_CAP = 6;
const SUMMARY_TREND_CAP = 8;
const SUMMARY_LATEST_MARKER_CAP = 10;
const SUMMARY_SUPPLEMENT_CHANGE_CAP = 5;

const deriveAbnormalFromReference = (value: number, ref: [number | null, number | null]): AbnormalFlag => {
  const [min, max] = ref;
  if (min !== null && value < min) {
    return "low";
  }
  if (max !== null && value > max) {
    return "high";
  }
  return min === null && max === null ? "unknown" : "normal";
};

const markerPriorityScore = (marker: AiCoachMarkerRow): number => {
  const abnormal = deriveAbnormalFromReference(marker.v, marker.ref);
  if (abnormal === "high" || abnormal === "low") {
    return 100;
  }
  if (abnormal === "unknown") {
    return 0;
  }
  return 20;
};

const compactText = (value: string, maxChars: number): string => {
  const compact = value.trim().replace(/\s+/g, " ");
  if (compact.length <= maxChars) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
};

const buildLatestNotableMarkers = (latest: AiCoachReportRow | null): AiCoachSummary["latestReport"]["notableMarkers"] => {
  if (!latest) {
    return [];
  }
  return [...latest.markers]
    .sort((left, right) => {
      const scoreDelta = markerPriorityScore(right) - markerPriorityScore(left);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return left.m.localeCompare(right.m);
    })
    .slice(0, SUMMARY_LATEST_MARKER_CAP)
    .map((marker) => ({
      marker: marker.m,
      value: marker.v,
      unit: marker.u,
      abnormal: deriveAbnormalFromReference(marker.v, marker.ref)
    }));
};

export const buildAiCoachSummary = ({
  reports,
  language,
  profile,
  unitSystem,
  personalContext,
  supplementContext,
  signals
}: BuildAiCoachSummaryOptions): AiCoachSummary => {
  const latest = reports[reports.length - 1] ?? null;
  const latestProtocol = latest?.ann ?? null;
  const wellbeing = signals.wellbeing
    ? {
        count: signals.wellbeing.count,
        latestDate: signals.wellbeing.latestDate,
        latestAverage: signals.wellbeing.latestAverage,
        metricAverages: signals.wellbeing.metricAverages,
        metricTrends: signals.wellbeing.metricTrends
      }
    : null;

  return {
    version: 1,
    language,
    userProfile: profile,
    unitSystem,
    personalContext,
    reportWindow: {
      reportCount: reports.length,
      firstDate: reports[0]?.date ?? null,
      latestDate: latest?.date ?? null
    },
    latestReport: {
      date: latest?.date ?? null,
      markerCount: latest?.markers.length ?? 0,
      samplingTiming: latest?.ann.timing ?? "unknown",
      protocol: {
        doseMgPerWeek: latestProtocol?.dose ?? null,
        compound: compactText(latestProtocol?.compound ?? "", 120),
        frequency: compactText(latestProtocol?.frequency ?? "", 80),
        frequencyPerWeek: latestProtocol?.frequencyPerWeek ?? null,
        name: compactText(latestProtocol?.protocol ?? "", 120)
      },
      notableMarkers: buildLatestNotableMarkers(latest)
    },
    currentSupplements: {
      activeAtLatestTestDate: compactText(supplementContext.activeAtLatestTestDate, 220),
      activeToday: compactText(supplementContext.activeToday, 220),
      recentDoseOrFrequencyChanges: supplementContext.recentDoseOrFrequencyChanges.slice(0, SUMMARY_SUPPLEMENT_CHANGE_CAP)
    },
    topAlerts: signals.alerts.slice(0, SUMMARY_ALERT_CAP),
    topTrends: signals.markerTrends.slice(0, SUMMARY_TREND_CAP),
    wellbeing,
    dataGaps: {
      sparseMarkers: signals.gaps.sparseMarkers.slice(0, 12),
      missingSignalMarkers: signals.gaps.missingSignalMarkers.slice(0, 12),
      samplingFilter: signals.samplingFilter
    }
  };
};
