import { useState } from "react";
import { DosePrediction, MarkerAlert, MarkerTrendSummary, ProtocolImpactSummary, TrtStabilityResult } from "../analytics";
import { BETA_LIMITS, checkBetaLimit, getRemainingAnalyses, getUsage, recordAnalysisUsage } from "../betaLimits";
import { AppLanguage, AppSettings, LabReport, Protocol, SupplementPeriod } from "../types";

interface UseAnalysisOptions {
  settings: AppSettings;
  language: AppLanguage;
  visibleReports: LabReport[];
  protocols: Protocol[];
  supplementTimeline: SupplementPeriod[];
  samplingControlsEnabled: boolean;
  protocolImpactSummary: ProtocolImpactSummary;
  alerts: MarkerAlert[];
  trendByMarker: Record<string, MarkerTrendSummary>;
  trtStability: TrtStabilityResult;
  dosePredictions: DosePrediction[];
  mapErrorToMessage: (error: unknown, scope: "ai" | "pdf") => string;
  tr: (nl: string, en: string) => string;
}

export const useAnalysis = ({
  settings,
  language,
  visibleReports,
  protocols,
  supplementTimeline,
  samplingControlsEnabled,
  protocolImpactSummary,
  alerts,
  trendByMarker,
  trtStability,
  dosePredictions,
  mapErrorToMessage,
  tr
}: UseAnalysisOptions) => {
  const [isAnalyzingLabs, setIsAnalyzingLabs] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisResult, setAnalysisResult] = useState("");
  const [analysisGeneratedAt, setAnalysisGeneratedAt] = useState<string | null>(null);
  const [analysisCopied, setAnalysisCopied] = useState(false);
  const [analysisKind, setAnalysisKind] = useState<"full" | "latestComparison" | null>(null);
  const [analyzingKind, setAnalyzingKind] = useState<"full" | "latestComparison" | null>(null);
  const [betaRemaining, setBetaRemaining] = useState(getRemainingAnalyses());
  const [betaUsage, setBetaUsage] = useState(() => {
    const usage = getUsage();
    return {
      dailyCount: usage.dailyCount,
      monthlyCount: usage.monthlyCount
    };
  });

  const refreshBetaUsage = () => {
    const usage = getUsage();
    setBetaUsage({
      dailyCount: usage.dailyCount,
      monthlyCount: usage.monthlyCount
    });
    setBetaRemaining(getRemainingAnalyses());
  };

  const runAiAnalysis = async (analysisType: "full" | "latestComparison") => {
    if (analysisType === "latestComparison" && visibleReports.length < 2) {
      setAnalysisError(tr("Voor vergelijking van laatste vs vorige rapport zijn minimaal 2 rapporten nodig.", "At least 2 reports are required for latest-vs-previous analysis."));
      return;
    }

    refreshBetaUsage();
    const betaCheck = checkBetaLimit();
    if (!betaCheck.allowed) {
      setAnalysisError(betaCheck.reason ?? "Usage limit reached.");
      refreshBetaUsage();
      return;
    }

    setIsAnalyzingLabs(true);
    setAnalyzingKind(analysisType);
    setAnalysisError("");
    setAnalysisCopied(false);

    try {
      const { analyzeLabDataWithClaude } = await import("../aiAnalysis");
      const result = await analyzeLabDataWithClaude({
        reports: visibleReports,
        protocols,
        supplementTimeline,
        unitSystem: settings.unitSystem,
        language,
        analysisType,
        context: {
          samplingFilter: samplingControlsEnabled ? settings.samplingFilter : "all",
          protocolImpact: protocolImpactSummary,
          alerts,
          trendByMarker,
          trtStability,
          dosePredictions
        }
      });
      setAnalysisResult(result);
      setAnalysisGeneratedAt(new Date().toISOString());
      setAnalysisKind(analysisType);
      recordAnalysisUsage();
      refreshBetaUsage();
    } catch (error) {
      setAnalysisError(mapErrorToMessage(error, "ai"));
    } finally {
      setIsAnalyzingLabs(false);
      setAnalyzingKind(null);
    }
  };

  const copyAnalysis = async () => {
    if (!analysisResult) {
      return;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setAnalysisError(tr("Kopiëren wordt niet ondersteund in deze browser.", "Copying is not supported in this browser."));
      return;
    }

    try {
      await navigator.clipboard.writeText(analysisResult);
      setAnalysisCopied(true);
      setTimeout(() => setAnalysisCopied(false), 1800);
    } catch {
      setAnalysisError(tr("Kon analyse niet kopiëren naar klembord.", "Could not copy analysis to clipboard."));
    }
  };

  return {
    isAnalyzingLabs,
    analysisError,
    analysisResult,
    analysisGeneratedAt,
    analysisCopied,
    analysisKind,
    analyzingKind,
    betaUsage,
    betaRemaining,
    betaLimits: BETA_LIMITS,
    setAnalysisError,
    runAiAnalysis,
    copyAnalysis
  };
};

export default useAnalysis;
