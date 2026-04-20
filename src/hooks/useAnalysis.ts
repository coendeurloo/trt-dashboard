import { useEffect, useMemo, useRef, useState } from "react";
import { DosePrediction, MarkerAlert, MarkerTrendSummary, ProtocolImpactSummary, TrtStabilityResult } from "../analytics";
import { AnalysisScopeNotice, buildWellbeingSummary, selectReportsForAnalysis } from "../analysisScope";
import { BETA_LIMITS, checkBetaLimit, getRemainingAnalyses, getUsage, recordAnalysisUsage } from "../betaLimits";
import {
  AIConsentDecision,
  AiAnalysisPresetKey,
  AiAnalysisScopeSnapshot,
  AppLanguage,
  AppSettings,
  LabReport,
  PersonalInfo,
  Protocol,
  SupplementPeriod,
  SymptomCheckIn
} from "../types";
import { captureAppException, withMonitoringSpan } from "../monitoring/sentry";

interface UseAnalysisOptions {
  settings: AppSettings;
  language: AppLanguage;
  allReports: LabReport[];
  visibleReports: LabReport[];
  personalInfo: PersonalInfo;
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

const isExpectedAiServiceError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error.message ?? "").trim();
  return (
    code === "AI_OVERLOADED" ||
    code === "AI_LIMITS_UNAVAILABLE" ||
    code.startsWith("AI_RATE_LIMITED:")
  );
};

export const useAnalysis = ({
  settings,
  language,
  allReports,
  visibleReports,
  personalInfo,
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
  type AnalysisKind = "full" | "latestComparison" | "question";
  type AnalysisRequestState = "idle" | "preparing" | "streaming" | "completed" | "error";
  type AnalysisSubmissionMeta = {
    presetKey?: AiAnalysisPresetKey;
    title?: string;
    scopeSnapshot?: AiAnalysisScopeSnapshot;
  };
  type AnalysisRunCompletion = {
    kind: AnalysisKind;
    analysisType: "full" | "latestComparison";
    question: string | null;
    answer: string;
    generatedAt: string;
    submissionMeta?: AnalysisSubmissionMeta;
  };
  const analysisBaseReports = visibleReports;
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
    consentOverride,
    submissionMeta
  }: {
    kind: AnalysisKind;
    analysisType: "full" | "latestComparison";
    question?: string;
    consentOverride?: AIConsentDecision | null;
    submissionMeta?: AnalysisSubmissionMeta;
  }): Promise<AnalysisRunCompletion | null> => {
    const normalizedQuestion = question?.trim() ?? "";

    if (kind === "question" && normalizedQuestion.length === 0) {
      setAnalysisError(tr("Voer eerst een vraag in voordat je AI start.", "Enter a question first before starting AI."));
      setAnalysisRequestState("error");
      return null;
    }
    if (analysisType === "latestComparison" && analysisBaseReports.length < 2) {
      setAnalysisError(tr("Voor vergelijking van laatste vs vorige rapport zijn minimaal 2 rapporten nodig.", "At least 2 reports are required for latest-vs-previous analysis."));
      setAnalysisRequestState("error");
      return null;
    }
    const externalAiAllowed = consentOverride?.allowExternalAi ?? true;

    refreshBetaUsage();
    const betaCheck = checkBetaLimit();
    if (!betaCheck.allowed) {
      setAnalysisError(betaCheck.reason ?? "Usage limit reached.");
      refreshBetaUsage();
      setAnalysisRequestState("error");
      return null;
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
      const result = await withMonitoringSpan(
        {
          name: kind === "question" ? "ai.question" : `ai.${analysisType}`,
          op: "labtracker.ai",
          attributes: {
            analysis_type: analysisType,
            analysis_kind: kind,
            report_count: selectedReports.length,
            provider_preference: settings.aiAnalysisProvider,
            external_ai_allowed: externalAiAllowed,
            has_custom_question: normalizedQuestion.length > 0
          },
          forceTransaction: true
        },
        () =>
          analyzeLabDataWithClaude({
            reports: selectedReports,
            protocols,
            supplementTimeline,
            personalInfo,
            unitSystem: settings.unitSystem,
            profile: settings.userProfile,
            memory: null,
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
          })
      );
      if (activeRunIdRef.current !== requestId) {
        return null;
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
      const completedAt = new Date().toISOString();
      setAnalysisGeneratedAt(completedAt);
      setAnalysisRequestState("completed");

      recordAnalysisUsage();
      refreshBetaUsage();
      return {
        kind,
        analysisType,
        question: kind === "question" ? normalizedQuestion : null,
        answer: result.text,
        generatedAt: completedAt,
        submissionMeta
      };
    } catch (error) {
      if (activeRunIdRef.current !== requestId) {
        return null;
      }
      if (error instanceof Error && error.message === "AI_REQUEST_ABORTED") {
        setAnalysisRequestState("idle");
        return null;
      }
      if (!isExpectedAiServiceError(error)) {
        captureAppException(error, {
          tags: {
            flow: "ai_analysis",
            analysis_kind: kind,
            analysis_type: analysisType,
            provider_preference: settings.aiAnalysisProvider,
            partial_output: receivedStreamDelta
          },
          extra: {
            reportCount: allReports.length,
            checkInCount: checkIns.length,
            protocolCount: protocols.length,
            supplementCount: supplementTimeline.length,
            userProfile: settings.userProfile
          },
          fingerprint: ["ai-analysis-failure", kind, analysisType]
        });
      }
      const mappedError = mapErrorToMessage(error, "ai");
      setAnalysisError(
        receivedStreamDelta
          ? `${mappedError} ${tr("Gedeeltelijke output is bewaard.", "Partial output has been preserved.")}`
          : mappedError
      );
      setAnalysisRequestState("error");
      return null;
    } finally {
      if (activeRunIdRef.current === requestId) {
        setIsAnalyzingLabs(false);
        setAnalyzingKind(null);
        activeAbortControllerRef.current = null;
      }
    }
  };

  const runAiAnalysis = async (
    analysisType: "full" | "latestComparison",
    consentOverride?: AIConsentDecision | null
  ): Promise<AnalysisRunCompletion | null> => {
    return runAiAnalysisInternal({
      kind: analysisType,
      analysisType,
      consentOverride
    });
  };

  const runAiQuestion = async (
    question: string,
    consentOverride?: AIConsentDecision | null,
    submissionMeta?: AnalysisSubmissionMeta
  ): Promise<AnalysisRunCompletion | null> => {
    return runAiAnalysisInternal({
      kind: "question",
      analysisType: "full",
      question,
      consentOverride,
      submissionMeta
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
