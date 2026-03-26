import { useEffect, useMemo, useRef, useState } from "react";
import { MarkerTrendSummary } from "../analytics";
import { AnalysisScopeNotice } from "../analysisScope";
import { betaLimitsDisabled } from "../betaLimits";
import AIInfoBar from "../components/analysis/AIInfoBar";
import AIOutputPanel from "../components/analysis/AIOutputPanel";
import AIQuestionInput from "../components/analysis/AIQuestionInput";
import AIQuickActionsPanel from "../components/analysis/AIQuickActionsPanel";
import { getRelevantBenchmarks } from "../data/studyBenchmarks";
import useAiQuestionSuggestions from "../hooks/useAiQuestionSuggestions";
import { trLocale } from "../i18n";
import { AppLanguage, AppSettings, LabReport } from "../types";
import { AnalystMemory } from "../types/analystMemory";

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
  memory: AnalystMemory | null;
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
  onRunAnalysis: (mode: "full" | "latestComparison") => void;
  onAskQuestion: (question: string) => void;
  onCopyAnalysis: () => void;
}

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
  markersTracked,
  analysisMarkerNames,
  activeProtocolLabel,
  hasActiveProtocol,
  hasDemoData,
  isDemoMode,
  memory: _memory,
  betaUsage,
  betaLimits,
  settings,
  language,
  onRunAnalysis,
  onAskQuestion,
  onCopyAnalysis
}: AnalysisViewProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const unitSystemLabel = settings.unitSystem === "eu" ? tr("SI (metrisch)", "SI (Metric)") : tr("Conventioneel", "Conventional");
  const isDarkTheme = settings.theme === "dark";
  const limitsDisabled = betaLimitsDisabled();
  const dayLimitReached = !limitsDisabled && betaUsage.dailyCount >= betaLimits.maxAnalysesPerDay;
  const monthLimitReached = !limitsDisabled && betaUsage.monthlyCount >= betaLimits.maxAnalysesPerMonth;
  const blockedByLimits = dayLimitReached || monthLimitReached;
  const isAnalyzingFull = isAnalyzingLabs && analyzingKind === "full";
  const isAnalyzingLatest = isAnalyzingLabs && analyzingKind === "latestComparison";
  const isAnalyzingQuestion = isAnalyzingLabs && analyzingKind === "question";
  const canRunFull = !isAnalyzingLabs && reportsInScope > 0 && !blockedByLimits;
  const canRunLatest = !isAnalyzingLabs && reportsInScope >= 2 && !blockedByLimits;
  const relevantBenchmarks = useMemo(
    () => getRelevantBenchmarks(analysisMarkerNames),
    [analysisMarkerNames]
  );

  const suggestedQuestions = useAiQuestionSuggestions({
    reports,
    trendByMarker,
    language,
    userProfile: settings.userProfile,
    hasActiveProtocol
  });

  const [questionInput, setQuestionInput] = useState("");
  const outputPanelRef = useRef<HTMLDivElement | null>(null);
  const canAskQuestion = !isAnalyzingLabs && questionInput.trim().length > 0 && reportsInScope > 0 && !blockedByLimits;

  useEffect(() => {
    if (analysisQuestion) {
      setQuestionInput(analysisQuestion);
    }
  }, [analysisQuestion]);

  useEffect(() => {
    const hasOutput = analysisResult.trim().length > 0;
    if (!hasOutput) {
      return;
    }
    if (analysisRequestState !== "streaming" && analysisRequestState !== "completed") {
      return;
    }
    outputPanelRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [analysisRequestState, analysisResult]);

  const usageLabel = limitsDisabled
    ? tr("Beta limieten uit", "Beta limits disabled")
    : `${betaUsage.dailyCount}/${betaLimits.maxAnalysesPerDay} ${tr("vandaag", "today")} · ${betaUsage.monthlyCount}/${betaLimits.maxAnalysesPerMonth} ${tr("maand", "month")}`;
  const usageHint = dayLimitReached
    ? tr("Daglimiet bereikt, reset om middernacht.", "Daily limit reached, resets at midnight.")
    : monthLimitReached
      ? tr("Maandlimiet bereikt, probeer later opnieuw.", "Monthly limit reached, try again later.")
      : null;
  const scopeHint = hasActiveProtocol
    ? tr(
        `${reportsInScope} rapporten in scope · ${markersTracked} markers · ${unitSystemLabel} · ${activeProtocolLabel}`,
        `${reportsInScope} reports in scope · ${markersTracked} markers · ${unitSystemLabel} · ${activeProtocolLabel}`
      )
    : tr(
        `${reportsInScope} rapporten in scope · ${markersTracked} markers · ${unitSystemLabel}`,
        `${reportsInScope} reports in scope · ${markersTracked} markers · ${unitSystemLabel}`
      );

  return (
    <section className="space-y-4 fade-in sm:space-y-5">
      <AIInfoBar
        isDarkTheme={isDarkTheme}
        hasDemoData={hasDemoData}
        isDemoMode={isDemoMode}
        usageLabelTitle={tr("Gebruik", "Usage")}
        usageLabel={usageLabel}
        usageHint={usageHint}
        actionGuardLabel={tr(
          "AI draait alleen wanneer jij expliciet een actie start.",
          "AI runs only when you explicitly start an action."
        )}
        demoModeLabel={tr("Je werkt nu met demodata.", "You're currently using demo data.")}
        demoMixedLabel={tr("Demodata staat nog deels actief.", "Demo data is still partially active.")}
        consentRequiredLabel={null}
      />

      <AIQuestionInput
        title={tr("Ask AI", "Ask AI")}
        subtitle={tr(
          "Ask a focused question or run a broader analysis when you need it.",
          "Ask a focused question or run a broader analysis when you need it."
        )}
        scopeHint={scopeHint}
        inputLabel={tr("Jouw vraag", "Your question")}
        inputPlaceholder={tr(
          "Bijv. waarom stijgt mijn hematocriet en wat moet ik nu monitoren?",
          "E.g. why is my hematocrit rising and what should I monitor next?"
        )}
        askButtonLabel={isAnalyzingQuestion ? tr("Bezig...", "Asking...") : tr("Ask AI", "Ask AI")}
        suggestionsTitle={tr("Snelle lokale suggesties", "Quick local suggestions")}
        localNote={tr(
          "Suggesties worden lokaal gegenereerd uit je rapportdata. AI start alleen na jouw klik.",
          "Suggestions are generated locally from your report data. AI starts only after your click."
        )}
        reportsHint={
          reportsInScope === 0
            ? tr("Voeg eerst minstens één rapport toe om vragen te kunnen stellen.", "Add at least one report first to ask questions.")
            : null
        }
        value={questionInput}
        suggestions={suggestedQuestions.slice(0, 4)}
        actionsSlot={
          <AIQuickActionsPanel
            fullTitle={tr("Run full analysis", "Run full analysis")}
            fullDescription={tr(
              "Trends, protocolcontext, supplementen en praktische volgende stappen.",
              "Trends, protocol context, supplements, and practical next steps."
            )}
            fullButtonLabel={isAnalyzingFull ? tr("Analyseren...", "Analyzing...") : tr("Run full analysis", "Run full analysis")}
            fullFootnote={tr(
              "Je start dit handmatig. Er draait niets automatisch op paginalaad.",
              "You start this manually. Nothing runs automatically on page load."
            )}
            latestTitle={tr("Compare latest vs previous", "Compare latest vs previous")}
            latestDescription={tr(
              "Snelle vergelijking van wat recent het meest veranderde.",
              "Quick comparison of what changed most recently."
            )}
            latestButtonLabel={isAnalyzingLatest ? tr("Vergelijken...", "Comparing...") : tr("Compare latest report", "Compare latest report")}
            latestFootnote={tr(
              "Compacte check als je eerst snel overzicht wilt.",
              "Compact check when you want a quick overview first."
            )}
            latestHelperText={
              reportsInScope < 2
                ? tr("Minimaal 2 rapporten nodig voor vergelijking.", "At least 2 reports are required for comparison.")
                : undefined
            }
            isAnalyzingFull={isAnalyzingFull}
            isAnalyzingLatest={isAnalyzingLatest}
            canRunFull={canRunFull}
            canRunLatest={canRunLatest}
            isDarkTheme={isDarkTheme}
            onRunFull={() => onRunAnalysis("full")}
            onRunLatest={() => onRunAnalysis("latestComparison")}
          />
        }
        isSubmitting={isAnalyzingQuestion}
        canSubmit={canAskQuestion}
        isDarkTheme={isDarkTheme}
        onChange={setQuestionInput}
        onSubmit={() => onAskQuestion(questionInput.trim())}
        onSelectSuggestion={setQuestionInput}
      />

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
          preparingStatusLabel={tr("Analyzing your reports…", "Analyzing your reports...")}
          streamingStatusLabel={tr("Generating response…", "Generating response...")}
          streamingHintLabel={tr("Tekst verschijnt live terwijl Claude antwoordt.", "Text appears live while Claude responds.")}
          onCopyAnalysis={onCopyAnalysis}
        />
      </div>
    </section>
  );
};

export default AnalysisView;
