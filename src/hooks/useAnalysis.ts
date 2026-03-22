import { useEffect, useMemo, useRef, useState } from "react";
import { DosePrediction, MarkerAlert, MarkerTrendSummary, ProtocolImpactSummary, TrtStabilityResult } from "../analytics";
import { AnalysisScopeNotice, buildWellbeingSummary, selectReportsForAnalysis } from "../analysisScope";
import { BETA_LIMITS, checkBetaLimit, getRemainingAnalyses, getUsage, recordAnalysisUsage } from "../betaLimits";
import { AIConsentDecision, AppLanguage, AppSettings, LabReport, PersonalInfo, Protocol, SupplementPeriod, SymptomCheckIn } from "../types";
import { AnalystMemory } from "../types/analystMemory";

interface UseAnalysisOptions {
  settings: AppSettings;
  language: AppLanguage;
  allReports: LabReport[];
  visibleReports: LabReport[];
  personalInfo: PersonalInfo;
  checkIns: SymptomCheckIn[];
  protocols: Protocol[];
  supplementTimeline: SupplementPeriod[];
  analystMemory: AnalystMemory | null;
  onAnalystMemoryUpdate?: (memory: AnalystMemory) => void;
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
  allReports,
  visibleReports: _visibleReports,
  personalInfo,
  checkIns,
  protocols,
  supplementTimeline,
  analystMemory,
  onAnalystMemoryUpdate,
  samplingControlsEnabled,
  protocolImpactSummary,
  alerts,
  trendByMarker,
  trtStability,
  dosePredictions,
  mapErrorToMessage,
  tr
}: UseAnalysisOptions) => {
  type AnalysisKind = "full" | "latestComparison" | "question";
  type AnalysisRequestState = "idle" | "preparing" | "streaming" | "completed" | "error";
  const analysisBaseReports = allReports;
  const activeRunIdRef = useRef(0);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const [isAnalyzingLabs, setIsAnalyzingLabs] = useState(false);
  const [analysisRequestState, setAnalysisRequestState] = useState<AnalysisRequestState>("idle");
  const [analysisError, setAnalysisError] = useState("");
  const [analysisResult, setAnalysisResult] = useState("");
  const [analysisGeneratedAt, setAnalysisGeneratedAt] = useState<string | null>(null);
  const [analysisQuestion, setAnalysisQuestion] = useState<string | null>(null);
  const [analysisCopied, setAnalysisCopied] = useState(false);
  const [analysisModelInfo, setAnalysisModelInfo] = useState<{
    provider: "claude" | "gemini";
    model: string;
    fallbackUsed: boolean;
    actionsNeeded: boolean;
    actionReasons: string[];
    actionConfidence: "high" | "medium" | "low";
    supplementActionsNeeded: boolean;
    supplementAdviceIncluded: boolean;
    qualityGuardApplied: boolean;
    qualityIssues: string[];
  } | null>(null);
  const [analysisKind, setAnalysisKind] = useState<AnalysisKind | null>(null);
  const [analyzingKind, setAnalyzingKind] = useState<AnalysisKind | null>(null);
  const [analysisScopeNotice, setAnalysisScopeNotice] = useState<AnalysisScopeNotice | null>(null);
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

  const abortActiveRun = () => {
    activeAbortControllerRef.current?.abort();
    activeAbortControllerRef.current = null;
  };

  useEffect(
    () => () => {
      abortActiveRun();
    },
    []
  );

  const suggestedScopeNotice = useMemo<AnalysisScopeNotice | null>(() => {
    const scope = selectReportsForAnalysis({
      reports: analysisBaseReports,
      analysisType: "full"
    });
    return scope.notice;
  }, [analysisBaseReports]);

  const runAiAnalysisInternal = async ({
    kind,
    analysisType,
    question,
    consentOverride
  }: {
    kind: AnalysisKind;
    analysisType: "full" | "latestComparison";
    question?: string;
    consentOverride?: AIConsentDecision | null;
  }) => {
    const normalizedQuestion = question?.trim() ?? "";

    if (kind === "question" && normalizedQuestion.length === 0) {
      setAnalysisError(tr("Voer eerst een vraag in voordat je AI start.", "Enter a question first before starting AI."));
      setAnalysisRequestState("error");
      return;
    }
    if (analysisType === "latestComparison" && analysisBaseReports.length < 2) {
      setAnalysisError(tr("Voor vergelijking van laatste vs vorige rapport zijn minimaal 2 rapporten nodig.", "At least 2 reports are required for latest-vs-previous analysis."));
      setAnalysisRequestState("error");
      return;
    }
    const externalAiAllowed = consentOverride?.allowExternalAi ?? true;

    refreshBetaUsage();
    const betaCheck = checkBetaLimit();
    if (!betaCheck.allowed) {
      setAnalysisError(betaCheck.reason ?? "Usage limit reached.");
      refreshBetaUsage();
      setAnalysisRequestState("error");
      return;
    }

    abortActiveRun();
    const requestId = activeRunIdRef.current + 1;
    activeRunIdRef.current = requestId;
    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;

    setIsAnalyzingLabs(true);
    setAnalysisRequestState("preparing");
    setAnalyzingKind(kind);
    setAnalysisKind(kind);
    setAnalysisQuestion(kind === "question" ? normalizedQuestion : null);
    setAnalysisError("");
    setAnalysisResult("");
    setAnalysisGeneratedAt(null);
    setAnalysisCopied(false);
    setAnalysisModelInfo(null);
    let receivedStreamDelta = false;

    try {
      const scopeSelection = selectReportsForAnalysis({
        reports: analysisBaseReports,
        analysisType
      });
      const selectedReports = scopeSelection.selectedReports;
      setAnalysisScopeNotice(scopeSelection.notice);
      const wellbeingSummary = buildWellbeingSummary({
        reports: selectedReports,
        checkIns
      });
      const { analyzeLabDataWithClaude } = await import("../aiAnalysis");
      const result = await analyzeLabDataWithClaude({
        reports: selectedReports,
        protocols,
        supplementTimeline,
        personalInfo,
        unitSystem: settings.unitSystem,
        profile: settings.userProfile,
        memory: analystMemory,
        language,
        analysisType,
        customQuestion: normalizedQuestion.length > 0 ? normalizedQuestion : undefined,
        signal: abortController.signal,
        onStreamEvent: (event) => {
          if (activeRunIdRef.current !== requestId) {
            return;
          }
          if (event.type === "delta" && event.delta) {
            receivedStreamDelta = true;
            setAnalysisRequestState("streaming");
            setAnalysisResult((current) => `${current}${event.delta}`);
          }
        },
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
      if (activeRunIdRef.current !== requestId) {
        return;
      }
      setAnalysisResult(result.text);
      setAnalysisModelInfo({
        provider: result.provider,
        model: result.model,
        fallbackUsed: result.fallbackUsed,
        actionsNeeded: result.actionsNeeded,
        actionReasons: result.actionReasons,
        actionConfidence: result.actionConfidence,
        supplementActionsNeeded: result.supplementActionsNeeded,
        supplementAdviceIncluded: result.supplementAdviceIncluded,
        qualityGuardApplied: result.qualityGuardApplied,
        qualityIssues: result.qualityIssues
      });
      setAnalysisGeneratedAt(new Date().toISOString());
      setAnalysisRequestState("completed");

      void (async () => {
        try {
          const { generateAnalystMemory } = await import("../aiAnalysis");
          const nextMemory = await generateAnalystMemory({
            reports: allReports,
            protocols,
            supplementTimeline,
            unitSystem: settings.unitSystem,
            profile: settings.userProfile,
            currentMemory: analystMemory,
            analysisResult: result.text,
            aiConsent: {
              includeSymptoms: consentOverride?.includeSymptoms ?? false,
              includeNotes: consentOverride?.includeNotes ?? false
            }
          });
          if (nextMemory) {
            onAnalystMemoryUpdate?.(nextMemory);
          }
        } catch (error) {
          console.error("Analyst memory generation failed (non-fatal):", error);
        }
      })();

      recordAnalysisUsage();
      refreshBetaUsage();
    } catch (error) {
      if (activeRunIdRef.current !== requestId) {
        return;
      }
      if (error instanceof Error && error.message === "AI_REQUEST_ABORTED") {
        setAnalysisRequestState("idle");
        return;
      }
      const mappedError = mapErrorToMessage(error, "ai");
      setAnalysisError(
        receivedStreamDelta
          ? `${mappedError} ${tr("Gedeeltelijke output is bewaard.", "Partial output has been preserved.")}`
          : mappedError
      );
      setAnalysisRequestState("error");
    } finally {
      if (activeRunIdRef.current === requestId) {
        setIsAnalyzingLabs(false);
        setAnalyzingKind(null);
        activeAbortControllerRef.current = null;
      }
    }
  };

  const runAiAnalysis = async (analysisType: "full" | "latestComparison", consentOverride?: AIConsentDecision | null) => {
    await runAiAnalysisInternal({
      kind: analysisType,
      analysisType,
      consentOverride
    });
  };

  const runAiQuestion = async (question: string, consentOverride?: AIConsentDecision | null) => {
    await runAiAnalysisInternal({
      kind: "question",
      analysisType: "full",
      question,
      consentOverride
    });
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
    analysisRequestState,
    analysisError,
    analysisResult,
    analysisGeneratedAt,
    analysisQuestion,
    analysisCopied,
    analysisModelInfo,
    analysisKind,
    analyzingKind,
    analysisScopeNotice: analysisScopeNotice ?? suggestedScopeNotice,
    betaUsage,
    betaRemaining,
    betaLimits: BETA_LIMITS,
    setAnalysisError,
    runAiAnalysis,
    runAiQuestion,
    copyAnalysis
  };
};

export default useAnalysis;
