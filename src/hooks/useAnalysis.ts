import { useMemo, useState } from "react";
import { DosePrediction, MarkerAlert, MarkerTrendSummary, ProtocolImpactSummary, TrtStabilityResult } from "../analytics";
import { buildWellbeingSummary, selectReportsForAnalysis } from "../analysisScope";
import { BETA_LIMITS, checkBetaLimit, getRemainingAnalyses, getUsage, recordAnalysisUsage } from "../betaLimits";
import { AIConsentDecision, AppLanguage, AppSettings, LabReport, Protocol, SupplementPeriod, SymptomCheckIn } from "../types";

interface UseAnalysisOptions {
  settings: AppSettings;
  language: AppLanguage;
  visibleReports: LabReport[];
  checkIns: SymptomCheckIn[];
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
  checkIns,
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
  const [analysisModelInfo, setAnalysisModelInfo] = useState<{
    provider: "claude" | "gemini";
    model: string;
    fallbackUsed: boolean;
    actionsNeeded: boolean;
    actionReasons: string[];
    actionConfidence: "high" | "medium" | "low";
    supplementAdviceIncluded: boolean;
  } | null>(null);
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

  const suggestedScopeNotice = useMemo(() => {
    const scope = selectReportsForAnalysis({
      reports: visibleReports,
      analysisType: "full"
    });
    return scope.notice;
  }, [visibleReports]);

  const runAiAnalysis = async (analysisType: "full" | "latestComparison", consentOverride?: AIConsentDecision | null) => {
    if (analysisType === "latestComparison" && visibleReports.length < 2) {
      setAnalysisError(tr("Voor vergelijking van laatste vs vorige rapport zijn minimaal 2 rapporten nodig.", "At least 2 reports are required for latest-vs-previous analysis."));
      return;
    }
    const externalAiAllowed = settings.aiExternalConsent || Boolean(consentOverride?.allowExternalAi);
    if (!externalAiAllowed) {
      setAnalysisError(
        tr(
          "AI staat uit. Geef eerst expliciete toestemming in Instellingen > Privacy & AI.",
          "AI is disabled. Please grant explicit consent first in Settings > Privacy & AI."
        )
      );
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
    setAnalysisModelInfo(null);

    try {
      const scopeSelection = selectReportsForAnalysis({
        reports: visibleReports,
        analysisType
      });
      const selectedReports = scopeSelection.selectedReports;
      const wellbeingSummary = buildWellbeingSummary({
        reports: selectedReports,
        checkIns
      });
      const { analyzeLabDataWithClaude } = await import("../aiAnalysis");
      const result = await analyzeLabDataWithClaude({
        reports: selectedReports,
        protocols,
        supplementTimeline,
        unitSystem: settings.unitSystem,
        language,
        analysisType,
        externalAiAllowed,
        aiConsent: {
          includeSymptoms: consentOverride?.includeSymptoms ?? false,
          includeNotes: consentOverride?.includeNotes ?? false
        },
        context: {
          samplingFilter: samplingControlsEnabled ? settings.samplingFilter : "all",
          protocolImpact: protocolImpactSummary,
          alerts,
          trendByMarker,
          trtStability,
          dosePredictions,
          wellbeingSummary
        },
        providerPreference: settings.aiAnalysisProvider
      });
      setAnalysisResult(result.text);
      setAnalysisModelInfo({
        provider: result.provider,
        model: result.model,
        fallbackUsed: result.fallbackUsed,
        actionsNeeded: result.actionsNeeded,
        actionReasons: result.actionReasons,
        actionConfidence: result.actionConfidence,
        supplementAdviceIncluded: result.supplementAdviceIncluded
      });
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
    analysisModelInfo,
    analysisKind,
    analyzingKind,
    analysisScopeNotice: suggestedScopeNotice,
    betaUsage,
    betaRemaining,
    betaLimits: BETA_LIMITS,
    setAnalysisError,
    runAiAnalysis,
    copyAnalysis
  };
};

export default useAnalysis;
