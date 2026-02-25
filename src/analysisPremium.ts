import { MarkerAlert, ProtocolImpactSummary, TrtStabilityResult } from "./analytics";
import type { WellbeingSummary } from "./analysisScope";

export interface PremiumReportRow {
  date: string;
  ann: {
    dose: number | null;
    compound: string;
    frequency: string;
    supps: string;
    timing: "unknown" | "trough" | "mid" | "peak";
  };
  markers: Array<{ m: string }>;
}

export interface PremiumTrendSignal {
  marker: string;
  directionTag: "improving" | "worsening" | "stable";
  severityTag: "high" | "medium" | "low";
  outOfRangeFlag: boolean;
  relevanceTag: "critical" | "important" | "background";
}

export interface PremiumInsightPack {
  driverLinks: Array<{
    marker: string;
    driver: string;
    narrative: string;
    confidence: "high" | "medium" | "low";
  }>;
  discordances: string[];
  supplementEffectSignals: Array<{
    supplement: string;
    signal: "possibly_supportive" | "no_clear_protection" | "too_early_to_tell" | "unclear_or_insufficient";
    narrative: string;
  }>;
  confounders: Array<{
    code:
      | "sampling_timing_mixed"
      | "missing_core_markers"
      | "short_observation_window"
      | "limited_wellbeing"
      | "limited_protocol_events";
    narrative: string;
  }>;
  decisionPoints: string[];
}

export interface SupplementActionabilityDecision {
  supplementActionsNeeded: boolean;
  reasons: string[];
  confidence: "high" | "medium" | "low";
}

interface BuildPremiumInsightPackOptions {
  reports: PremiumReportRow[];
  markerTrends: PremiumTrendSignal[];
  alerts: Array<Pick<MarkerAlert, "marker" | "severity">>;
  protocolImpact: ProtocolImpactSummary;
  trtStability: TrtStabilityResult | null;
  wellbeing: WellbeingSummary | null;
  samplingFilter: "all" | "trough" | "peak";
}

interface BuildSupplementActionabilityDecisionOptions {
  generalActionability: {
    actionsNeeded: boolean;
    actionConfidence: "high" | "medium" | "low";
    actionReasons: string[];
  };
  markerTrends: PremiumTrendSignal[];
  alerts: Array<Pick<MarkerAlert, "marker" | "severity">>;
  premiumInsightPack: PremiumInsightPack;
}

const CORE_MARKERS = ["Testosterone", "Estradiol", "Hematocrit", "LDL Cholesterol", "Apolipoprotein B"] as const;
const KNOWN_SUPPLEMENT_LEVER_MARKERS = new Set([
  "Apolipoprotein B",
  "LDL Cholesterol",
  "Non-HDL Cholesterol",
  "Cholesterol",
  "Triglyceriden",
  "HDL Cholesterol",
  "Hematocrit",
  "Ferritin",
  "Vitamin D (D3+D2) OH",
  "Homocysteine",
  "CRP",
  "Glucose Nuchter"
]);

const confidenceRank = (value: string): number => {
  const normalized = value.toLowerCase();
  if (normalized === "high") {
    return 3;
  }
  if (normalized === "medium") {
    return 2;
  }
  return 1;
};

const normalizeConfidence = (value: string): "high" | "medium" | "low" => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  return "low";
};

const toIsoMs = (value: string): number => {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseSupplements = (value: string): string[] => {
  if (!value) {
    return [];
  }
  return value
    .split(/[;,|]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .filter((entry) => {
      const lower = entry.toLowerCase();
      return !(lower === "none" || lower === "n/a" || lower === "no supplements" || lower === "-");
    });
};

const uniq = <T,>(values: T[]): T[] => Array.from(new Set(values));

export const buildPremiumInsightPack = ({
  reports,
  markerTrends,
  alerts,
  protocolImpact,
  trtStability,
  wellbeing,
  samplingFilter
}: BuildPremiumInsightPackOptions): PremiumInsightPack => {
  const chronological = [...reports].sort((left, right) => left.date.localeCompare(right.date));
  const latest = chronological[chronological.length - 1] ?? null;
  const previous = chronological[chronological.length - 2] ?? null;
  const latestMarkers = new Set((latest?.markers ?? []).map((marker) => marker.m));

  const protocolInsights: PremiumInsightPack["driverLinks"] = [...(protocolImpact.insights ?? [])]
    .sort((left, right) => {
      const confidenceDelta = confidenceRank(right.confidence) - confidenceRank(left.confidence);
      if (confidenceDelta !== 0) {
        return confidenceDelta;
      }
      return Math.abs(right.percentChange ?? 0) - Math.abs(left.percentChange ?? 0);
    })
    .slice(0, 4)
    .map((insight) => {
      const direction = insight.toValue >= insight.fromValue ? "up" : "down";
      return {
        marker: insight.marker,
        driver: insight.trigger,
        narrative: `${insight.trigger} around ${insight.eventDate} lines up with ${insight.marker} moving ${direction}.`,
        confidence: normalizeConfidence(insight.confidence)
      };
    });

  const fallbackDriverLinks: PremiumInsightPack["driverLinks"] = markerTrends
    .filter((trend) => trend.directionTag === "worsening" && trend.relevanceTag !== "background")
    .slice(0, 2)
    .map((trend) => ({
      marker: trend.marker,
      driver: "multi-factor context",
      narrative: `${trend.marker} is moving in an unfavorable direction while protocol/supplement context stayed complex.`,
      confidence: trend.severityTag === "high" ? "medium" : "low"
    }));

  const driverLinks: PremiumInsightPack["driverLinks"] = protocolInsights.length > 0 ? protocolInsights : fallbackDriverLinks;

  const worseningImportant = markerTrends.filter(
    (trend) => trend.directionTag === "worsening" && trend.relevanceTag !== "background"
  );
  const improvingImportant = markerTrends.filter(
    (trend) => trend.directionTag === "improving" && trend.relevanceTag !== "background"
  );

  const discordances: string[] = [];
  if (wellbeing && typeof wellbeing.latestAverage === "number" && wellbeing.latestAverage >= 6.5 && worseningImportant.length > 0) {
    discordances.push("Wellbeing feels better while several key biomarkers moved in the wrong direction.");
  }
  if (wellbeing && typeof wellbeing.latestAverage === "number" && wellbeing.latestAverage <= 5.5 && improvingImportant.length > 0) {
    discordances.push("Biomarkers improved, but wellbeing did not improve in parallel.");
  }
  if ((trtStability?.score ?? 0) >= 70 && alerts.some((alert) => alert.severity === "high" || alert.severity === "medium")) {
    discordances.push("Dose stability looks good, yet clinically relevant alerts remain active.");
  }

  const latestSupplements = parseSupplements(latest?.ann.supps ?? "");
  const previousSupplements = parseSupplements(previous?.ann.supps ?? "");
  const sharedSupplements = latestSupplements.filter((supplement) => previousSupplements.includes(supplement));
  const addedSupplements = latestSupplements.filter((supplement) => !previousSupplements.includes(supplement));

  const supplementEffectSignals: PremiumInsightPack["supplementEffectSignals"] = [];
  if (sharedSupplements.length > 0 && worseningImportant.length > 0) {
    sharedSupplements.slice(0, 2).forEach((supplement) => {
      supplementEffectSignals.push({
        supplement,
        signal: "no_clear_protection",
        narrative: `${supplement} stayed in place, but key risk markers still worsened.`
      });
    });
  }
  if (sharedSupplements.length > 0 && supplementEffectSignals.length === 0 && improvingImportant.length > 0) {
    sharedSupplements.slice(0, 2).forEach((supplement) => {
      supplementEffectSignals.push({
        supplement,
        signal: "possibly_supportive",
        narrative: `${supplement} remained stable while several important markers improved.`
      });
    });
  }
  if (addedSupplements.length > 0) {
    addedSupplements.slice(0, 2).forEach((supplement) => {
      supplementEffectSignals.push({
        supplement,
        signal: "too_early_to_tell",
        narrative: `${supplement} was added recently; impact is still too early to judge.`
      });
    });
  }
  if (supplementEffectSignals.length === 0 && latestSupplements.length > 0) {
    supplementEffectSignals.push({
      supplement: latestSupplements[0],
      signal: "unclear_or_insufficient",
      narrative: `Current data is insufficient to isolate the specific effect of ${latestSupplements[0]}.`
    });
  }

  const confounders: PremiumInsightPack["confounders"] = [];
  const timingModes = uniq(chronological.map((report) => report.ann.timing).filter((timing) => timing !== "unknown"));
  if (samplingFilter === "all" && timingModes.length > 1) {
    confounders.push({
      code: "sampling_timing_mixed",
      narrative: "Sampling timing varied across reports, which can distort trend comparisons."
    });
  }

  const missingCoreMarkers = CORE_MARKERS.filter((marker) => !latestMarkers.has(marker));
  if (missingCoreMarkers.length > 0) {
    confounders.push({
      code: "missing_core_markers",
      narrative: `Key markers are missing in the latest panel: ${missingCoreMarkers.join(", ")}.`
    });
  }

  const spanDays = (() => {
    if (!chronological[0] || !chronological[chronological.length - 1]) {
      return 0;
    }
    return Math.max(0, Math.round((toIsoMs(chronological[chronological.length - 1].date) - toIsoMs(chronological[0].date)) / (24 * 60 * 60 * 1000)));
  })();
  if (spanDays > 0 && spanDays < 56) {
    confounders.push({
      code: "short_observation_window",
      narrative: "The observed window is short, so some trends may still be noise."
    });
  }

  if (!wellbeing || wellbeing.count < 2) {
    confounders.push({
      code: "limited_wellbeing",
      narrative: "There are too few wellbeing check-ins to confidently link symptoms to biomarker shifts."
    });
  }

  if ((protocolImpact.events ?? []).length === 0) {
    confounders.push({
      code: "limited_protocol_events",
      narrative: "No clear protocol change event was captured for robust pre/post attribution."
    });
  }

  const alertMarkers = uniq(
    alerts
      .filter((alert) => alert.severity === "high" || alert.severity === "medium")
      .map((alert) => alert.marker)
  );

  const decisionPoints: string[] = [];
  if (missingCoreMarkers.length > 0) {
    decisionPoints.push(`Include the missing core markers next time: ${missingCoreMarkers.join(", ")}.`);
  }
  if (samplingFilter === "all" && timingModes.length > 1) {
    decisionPoints.push("Use a consistent sampling moment on the next test (preferably the same trough/peak context)." );
  }
  if (alertMarkers.length > 0) {
    decisionPoints.push(`Retest these priority markers after stabilization: ${alertMarkers.slice(0, 4).join(", ")}.`);
  }
  if ((protocolImpact.events ?? []).length > 0) {
    decisionPoints.push("Keep protocol and supplement stack stable until the next blood test to isolate causality.");
  }
  if (!wellbeing || wellbeing.count < 2) {
    decisionPoints.push("Add weekly wellbeing check-ins before the next lab to improve lab-to-symptom interpretation.");
  }

  return {
    driverLinks: driverLinks.slice(0, 4),
    discordances: discordances.slice(0, 3),
    supplementEffectSignals: supplementEffectSignals.slice(0, 3),
    confounders: confounders.slice(0, 5),
    decisionPoints: decisionPoints.slice(0, 4)
  };
};

const markerToSupplementReason = (marker: string): string | null => {
  if (["Apolipoprotein B", "LDL Cholesterol", "Non-HDL Cholesterol", "Cholesterol", "Triglyceriden"].includes(marker)) {
    return "lipid_support_needed";
  }
  if (["Hematocrit"].includes(marker)) {
    return "hematology_support_needed";
  }
  if (["Ferritin"].includes(marker)) {
    return "iron_support_needed";
  }
  if (["CRP", "Homocysteine", "Glucose Nuchter"].includes(marker)) {
    return "metabolic_support_needed";
  }
  return null;
};

export const buildSupplementActionabilityDecision = ({
  generalActionability,
  markerTrends,
  alerts,
  premiumInsightPack
}: BuildSupplementActionabilityDecisionOptions): SupplementActionabilityDecision => {
  if (!generalActionability.actionsNeeded || generalActionability.actionConfidence === "low") {
    return {
      supplementActionsNeeded: false,
      reasons: [],
      confidence: "low"
    };
  }

  const reasons: string[] = [];
  alerts
    .filter((alert) => alert.severity === "high" || alert.severity === "medium")
    .forEach((alert) => {
      const reason = markerToSupplementReason(alert.marker);
      if (reason) {
        reasons.push(reason);
      }
    });

  markerTrends
    .filter((trend) => trend.directionTag === "worsening" && trend.relevanceTag !== "background")
    .forEach((trend) => {
      const reason = markerToSupplementReason(trend.marker);
      if (reason) {
        reasons.push(reason);
      }
    });

  if (premiumInsightPack.supplementEffectSignals.some((signal) => signal.signal === "no_clear_protection")) {
    reasons.push("current_stack_not_enough");
  }

  const uniqueReasons = uniq(reasons).slice(0, 4);
  const hasKnownLever = uniqueReasons.length > 0;
  const supplementActionsNeeded = hasKnownLever;

  let confidence: "high" | "medium" | "low" = "low";
  if (supplementActionsNeeded) {
    confidence = generalActionability.actionConfidence === "high" ? "high" : "medium";
  }

  return {
    supplementActionsNeeded,
    reasons: uniqueReasons,
    confidence
  };
};

export const hasForbiddenSupplementAdviceLanguage = (value: string): boolean =>
  /\b(keep|maintain|continue|unchanged|no change)\b/i.test(value);
