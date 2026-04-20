import { format, parseISO } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { MarkerTrendSummary } from "../analytics";
import { AnalysisScopeNotice } from "../analysisScope";
import { betaLimitsDisabled } from "../betaLimits";
import AIInfoBar from "../components/analysis/AIInfoBar";
import AIOutputPanel from "../components/analysis/AIOutputPanel";
import AIQuestionInput, { type PresetChip } from "../components/analysis/AIQuestionInput";
import { getRelevantBenchmarks } from "../data/studyBenchmarks";
import useAiQuestionSuggestions from "../hooks/useAiQuestionSuggestions";
import { trLocale } from "../i18n";
import { AiAnalysis, AiAnalysisPresetKey, AppLanguage, AppSettings, LabReport } from "../types";

interface AnalysisViewProps {
  isAnalyzingLabs: boolean;
  analysisRequestState: "idle" | "preparing" | "streaming" | "completed" | "error";
  analysisError: string;
  analysisResult: string;
  analysisResultDisplay: string;
  analysisGeneratedAt: string | null;
  analysisQuestion: string | null;
  analysisCopied: boolean;
  analysisModelInfo: {
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
  } | null;
  analysisKind: "full" | "latestComparison" | "question" | null;
  analyzingKind: "full" | "latestComparison" | "question" | null;
  analysisScopeNotice: AnalysisScopeNotice | null;
  reports: LabReport[];
  trendByMarker: Record<string, MarkerTrendSummary>;
  reportsInScope: number;
  markersTracked: number;
  analysisMarkerNames: string[];
  activeProtocolLabel: string;
  hasActiveProtocol: boolean;
  hasDemoData: boolean;
  isDemoMode: boolean;
  betaUsage: {
    dailyCount: number;
    monthlyCount: number;
  };
  betaLimits: {
    maxAnalysesPerDay: number;
    maxAnalysesPerMonth: number;
  };
  settings: AppSettings;
  language: AppLanguage;
  aiAnalyses: AiAnalysis[];
  recentStatus: "loading" | "ready" | "error";
  onAskQuestion: (question: string, meta?: { presetKey?: AiAnalysisPresetKey; title?: string }) => void;
  onCopyAnalysis: () => void;
  onOpenHistoryList: () => void;
  onOpenHistoryDetail: (id: string) => void;
  onRetryRecent: () => void;
  onDeleteAnalysis: (id: string) => void;
}

const PRESET_TITLE_BY_KEY: Record<AiAnalysisPresetKey, { en: string; nl: string }> = {
  "full-analysis": {
    nl: "Volledige analyse van laatste rapport",
    en: "Full analysis of latest report"
  },
  "compare-latest-previous": {
    nl: "Vergelijk laatste met vorige",
    en: "Compare latest vs previous"
  }
};

const formatRecentDate = (value: string): string => {
  try {
    return format(parseISO(value), "MMM dd");
  } catch {
    return value.slice(0, 10);
  }
};

const stripMarkdownForPreview = (value: string): string =>
  value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/^>\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();

const summarizeAnswer = (value: string): string =>
  stripMarkdownForPreview(value).replace(/^direct answer\s*[:\-]?\s*/i, "").trim();

const AnalysisView = ({
  isAnalyzingLabs,
  analysisRequestState,
  analysisError,
  analysisResult,
  analysisResultDisplay,
  analysisGeneratedAt,
  analysisQuestion,
  analysisCopied,
  analysisModelInfo,
  analysisKind,
  analyzingKind,
  analysisScopeNotice,
  reports,
  trendByMarker,
  reportsInScope,
  markersTracked: _markersTracked,
  analysisMarkerNames,
  activeProtocolLabel: _activeProtocolLabel,
  hasActiveProtocol,
  hasDemoData: _hasDemoData,
  isDemoMode: _isDemoMode,
  betaUsage,
  betaLimits,
  settings,
  language,
  aiAnalyses,
  recentStatus,
  onAskQuestion,
  onCopyAnalysis,
  onOpenHistoryList,
  onOpenHistoryDetail,
  onRetryRecent,
  onDeleteAnalysis
}: AnalysisViewProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const isDarkTheme = settings.theme === "dark";
  const limitsDisabled = betaLimitsDisabled();
  const dayLimitReached = !limitsDisabled && betaUsage.dailyCount >= betaLimits.maxAnalysesPerDay;
  const monthLimitReached = !limitsDisabled && betaUsage.monthlyCount >= betaLimits.maxAnalysesPerMonth;
  const blockedByLimits = dayLimitReached || monthLimitReached;
  const hasActiveRun = analysisRequestState === "preparing" || analysisRequestState === "streaming";
  const hasOutput = analysisResult.trim().length > 0;
  const hasError = analysisError.trim().length > 0;
  const shouldShowOutputPanel = hasActiveRun || hasOutput || hasError;
  const relevantBenchmarks = useMemo(
    () => getRelevantBenchmarks(analysisMarkerNames),
    [analysisMarkerNames]
  );
  const recentAnalyses = useMemo(() => aiAnalyses.slice(0, 4), [aiAnalyses]);
  const shouldShowRecent =
    recentStatus === "loading" || recentStatus === "error" || recentAnalyses.length > 0;

  const suggestedQuestions = useAiQuestionSuggestions({
    reports,
    trendByMarker,
    language,
    userProfile: settings.userProfile,
    hasActiveProtocol
  });

  const [questionInput, setQuestionInput] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<AiAnalysisPresetKey | undefined>();
  const outputPanelRef = useRef<HTMLDivElement | null>(null);
  const canAskQuestion = !isAnalyzingLabs && questionInput.trim().length > 0 && reportsInScope > 0 && !blockedByLimits;

  useEffect(() => {
    if (analysisQuestion) {
      setQuestionInput(analysisQuestion);
    }
  }, [analysisQuestion]);

  useEffect(() => {
    if (!shouldShowOutputPanel) {
      return;
    }
    if (!hasActiveRun && !hasOutput) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      outputPanelRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [hasActiveRun, hasOutput, shouldShowOutputPanel]);

  const applyPreset = (preset: AiAnalysisPresetKey) => {
    if (preset === "full-analysis") {
      setQuestionInput(
        tr(
          "Geef een volledige analyse van mijn nieuwste labrapport. Benoem wat buiten bereik valt of de verkeerde kant op trent, en wat ik eerst moet prioriteren.",
          "Run a full analysis of my latest lab report. Call out anything outside range or trending the wrong way, and tell me what to prioritize."
        )
      );
    } else {
      setQuestionInput(
        tr(
          "Vergelijk mijn nieuwste rapport met het vorige en benoem de belangrijkste veranderingen, mogelijke oorzaken en wat ik nu moet opvolgen.",
          "Compare my latest report with the previous one and explain the most important changes, likely drivers, and what I should follow up on now."
        )
      );
    }
    setSelectedPreset(preset);
  };

  const presetChips: PresetChip[] = [
    {
      key: "full-analysis",
      label: tr("Full analysis of latest report", "Full analysis of latest report"),
      variant: "teal",
      icon: "sparkles",
      onClick: () => applyPreset("full-analysis")
    },
    {
      key: "compare-latest-previous",
      label: tr("Compare latest vs previous", "Compare latest vs previous"),
      variant: "teal",
      icon: "x",
      onClick: () => applyPreset("compare-latest-previous")
    },
    {
      key: "more",
      label: tr("More presets", "More presets"),
      variant: "neutral",
      icon: "plus",
      onClick: () => {
        // TODO: wire preset library modal
      }
    }
  ];

  return (
    <section className="space-y-4 fade-in sm:space-y-5">
      <AIInfoBar
        isDarkTheme={isDarkTheme}
        badgeLabel={tr("Clearer meter", "Clearer meter")}
        trustLabel={tr("AI only runs when you start an action", "AI only runs when you start an action")}
        todayLabel={tr("Today's analyses", "Today's analyses")}
        todayCount={betaUsage.dailyCount}
        todayLimit={betaLimits.maxAnalysesPerDay}
        monthLabel={tr("This month", "This month")}
        monthCount={betaUsage.monthlyCount}
        monthLimit={betaLimits.maxAnalysesPerMonth}
        whatsThisLabel={tr("What's this?", "What's this?")}
        whatsThisTitle={tr(
          "Analyse runs zijn AI-calls. Daglimiet reset rond middernacht; maandlimiet reset bij een nieuwe maand.",
          "Analysis runs are AI calls. Daily limit resets around midnight; monthly limit resets on a new month."
        )}
      />

      <AIQuestionInput
        badgeLabel={tr("Single primary flow", "Single primary flow")}
        title={tr("Your question", "Your question")}
        subtitle={tr(
          "Start from a suggestion, pick a preset, or write your own.",
          "Start from a suggestion, pick a preset, or write your own."
        )}
        suggestionsTitle={tr("Suggested from your data", "Suggested from your data")}
        presetsTitle={tr("Or start from a preset", "Or start from a preset")}
        inputPlaceholder={tr(
          "Bijv. waarom stijgt mijn hematocriet en wat moet ik nu monitoren?",
          "e.g. Why is my hematocrit rising, and what should I monitor next?"
        )}
        askButtonLabel={isAnalyzingLabs && analyzingKind === "question" ? tr("Bezig...", "Asking...") : tr("Ask AI", "Ask AI")}
        keyboardHintLabel={tr("Ctrl + Enter om te verzenden", "Ctrl + Enter to submit")}
        localNote={tr(
          "Generated locally from your reports - the AI only runs after you submit.",
          "Generated locally from your reports - the AI only runs after you submit."
        )}
        reportsHint={
          reportsInScope === 0
            ? tr("Voeg eerst minstens één rapport toe om vragen te kunnen stellen.", "Add at least one report first to ask questions.")
            : dayLimitReached
              ? tr("Daglimiet bereikt, reset om middernacht.", "Daily limit reached, resets at midnight.")
              : monthLimitReached
                ? tr("Maandlimiet bereikt, probeer later opnieuw.", "Monthly limit reached, try again later.")
                : null
        }
        value={questionInput}
        suggestions={suggestedQuestions.slice(0, 4)}
        presets={presetChips}
        isSubmitting={isAnalyzingLabs && analyzingKind === "question"}
        canSubmit={canAskQuestion}
        isDarkTheme={isDarkTheme}
        onChange={(value) => {
          setQuestionInput(value);
        }}
        onSubmit={() =>
          onAskQuestion(questionInput.trim(), {
            presetKey: selectedPreset,
            title: selectedPreset
              ? tr(PRESET_TITLE_BY_KEY[selectedPreset].nl, PRESET_TITLE_BY_KEY[selectedPreset].en)
              : undefined
          })
        }
        onSelectSuggestion={(question) => {
          setSelectedPreset(undefined);
          setQuestionInput(question);
        }}
      />

      {shouldShowRecent ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className={isDarkTheme ? "text-[13px] font-semibold uppercase tracking-[0.12em] text-slate-300" : "text-[13px] font-semibold uppercase tracking-[0.12em] text-slate-700"}>
              {tr("Recent", "Recent")}
            </h3>
            <button
              type="button"
              onClick={onOpenHistoryList}
              className={isDarkTheme ? "text-sm text-cyan-300 hover:underline" : "text-sm text-cyan-700 hover:underline"}
            >
              {tr("View all", "View all")}
            </button>
          </div>

          {recentStatus === "loading" ? (
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`recent-skeleton-${index}`}
                  className={isDarkTheme ? "h-28 animate-pulse rounded-xl border border-slate-700 bg-slate-900/55" : "h-28 animate-pulse rounded-xl border border-slate-200 bg-slate-100"}
                />
              ))}
            </div>
          ) : null}

          {recentStatus === "error" ? (
            <div className={isDarkTheme ? "rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100" : "rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"}>
              <p>{tr("Couldn't load recent analyses.", "Couldn't load recent analyses.")}</p>
              <button type="button" onClick={onRetryRecent} className="mt-1 text-sm underline">
                {tr("Retry", "Retry")}
              </button>
            </div>
          ) : null}

          {recentStatus === "ready" && recentAnalyses.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {recentAnalyses.map((entry) => (
                <article
                  key={entry.id}
                  className={
                    isDarkTheme
                      ? "rounded-xl border border-slate-700/80 bg-slate-900/60 p-4 transition hover:border-cyan-500/45"
                      : "rounded-xl border border-slate-200 bg-white p-4 transition hover:border-cyan-500/60"
                  }
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <button type="button" onClick={() => onOpenHistoryDetail(entry.id)} className="min-w-0 text-left">
                      <span className={isDarkTheme ? "text-xs text-slate-300" : "text-xs text-slate-600"}>
                        {formatRecentDate(entry.createdAt)} {" · "} {entry.title}
                      </span>
                    </button>
                    <div className="flex items-center gap-2">
                      <span className={isDarkTheme ? "rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200" : "rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cyan-700"}>
                        AI
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteAnalysis(entry.id)}
                        className={isDarkTheme ? "rounded border border-slate-600 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300 hover:border-rose-400/60 hover:text-rose-200" : "rounded border border-slate-300 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-700 hover:border-rose-300 hover:text-rose-700"}
                      >
                        {tr("Delete", "Delete")}
                      </button>
                    </div>
                  </div>
                  <button type="button" onClick={() => onOpenHistoryDetail(entry.id)} className="w-full text-left">
                    <p className={isDarkTheme ? "line-clamp-2 text-sm text-slate-100" : "line-clamp-2 text-sm text-slate-800"}>
                      {summarizeAnswer(entry.answer)}
                    </p>
                  </button>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {shouldShowOutputPanel ? (
        <div ref={outputPanelRef}>
          <AIOutputPanel
            analysisRequestState={analysisRequestState}
            analysisError={analysisError}
            analysisResult={analysisResult}
            analysisResultDisplay={analysisResultDisplay}
            analysisGeneratedAt={analysisGeneratedAt}
            analysisCopied={analysisCopied}
            analysisModelInfo={analysisModelInfo}
            analysisKind={analysisKind}
            analysisQuestion={analysisQuestion}
            analysisScopeNotice={analysisScopeNotice}
            relevantBenchmarks={relevantBenchmarks}
            isDarkTheme={isDarkTheme}
            titleOutput={tr("Analysis output", "Analysis output")}
            titleLatestComparison={tr("Analysis output (latest vs previous)", "Analysis output (latest vs previous)")}
            titleQuestionAnswer={tr("Answer to your question", "Answer to your question")}
            copyLabel={tr("Kopieer analyse", "Copy analysis")}
            copiedLabel={tr("Gekopieerd", "Copied")}
            styleLabel={tr("Stijl", "Style")}
            styleValue={tr("Narrative premium", "Narrative premium")}
            modelLabel={tr("Model", "Model")}
            providerLabel={tr("Provider", "Provider")}
            supplementActionsLabel={tr("Supplement acties", "Supplement actions")}
            noneLabel={tr("geen", "none")}
            outputGuardLabel={tr("Output guard toegepast", "Output guard applied")}
            lastRunLabel={tr("Laatste run", "Last run")}
            loadingLabel={tr("AI is je analyse aan het opstellen...", "AI is preparing your analysis...")}
            loadingFormatLabel={tr("Analyse-opmaak laden...", "Loading analysis formatting...")}
            emptyBody={tr("Start een analyse of stel een vraag om te beginnen.", "Run an analysis or ask a question to get started.")}
            disclaimerLabel={tr(
              "Analyse kan gepubliceerd onderzoek refereren. Waarden variëren per individu. Dit is geen medisch advies.",
              "Analysis may reference published research. Values vary between individuals. This is not medical advice."
            )}
            aiUsesPrefix={tr("AI gebruikt", "AI uses")}
            aiUsesMiddle={tr("van", "of")}
            aiUsesSuffix={tr("rapporten voor deze run.", "reports for this run.")}
            questionPrefixLabel={tr("Vraag:", "Question:")}
            preparingStatusLabel={tr("Analyzing your reports...", "Analyzing your reports...")}
            streamingStatusLabel={tr("Generating response...", "Generating response...")}
            streamingHintLabel={tr("Tekst verschijnt live terwijl Claude antwoordt.", "Text appears live while Claude responds.")}
            onCopyAnalysis={onCopyAnalysis}
          />
        </div>
      ) : null}

    </section>
  );
};

export default AnalysisView;
