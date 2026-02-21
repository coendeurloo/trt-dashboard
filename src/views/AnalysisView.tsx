import { format, parseISO } from "date-fns";
import { Suspense, lazy, useMemo } from "react";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { trLocale } from "../i18n";
import { AppLanguage, AppSettings } from "../types";
import { getRelevantBenchmarks } from "../data/studyBenchmarks";

const AnalysisMarkdownBlock = lazy(() => import("../components/AnalysisMarkdownBlock"));

interface AnalysisViewProps {
  isAnalyzingLabs: boolean;
  analysisError: string;
  analysisResult: string;
  analysisResultDisplay: string;
  analysisGeneratedAt: string | null;
  analysisCopied: boolean;
  analysisKind: "full" | "latestComparison" | null;
  analyzingKind: "full" | "latestComparison" | null;
  reportsInScope: number;
  markersTracked: number;
  analysisMarkerNames: string[];
  activeProtocolLabel: string;
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
  onCopyAnalysis: () => void;
}

const AnalysisView = ({
  isAnalyzingLabs,
  analysisError,
  analysisResult,
  analysisResultDisplay,
  analysisGeneratedAt,
  analysisCopied,
  analysisKind,
  analyzingKind,
  reportsInScope,
  markersTracked,
  analysisMarkerNames,
  activeProtocolLabel,
  betaUsage,
  betaLimits,
  settings,
  language,
  onRunAnalysis,
  onCopyAnalysis
}: AnalysisViewProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const isDarkTheme = settings.theme === "dark";
  const dayLimitReached = betaUsage.dailyCount >= betaLimits.maxAnalysesPerDay;
  const monthLimitReached = betaUsage.monthlyCount >= betaLimits.maxAnalysesPerMonth;
  const blockedByLimits = dayLimitReached || monthLimitReached;
  const isAnalyzingFull = isAnalyzingLabs && analyzingKind === "full";
  const isAnalyzingLatest = isAnalyzingLabs && analyzingKind === "latestComparison";
  const canRunFull = !isAnalyzingLabs && reportsInScope > 0 && !blockedByLimits;
  const canRunLatest = !isAnalyzingLabs && reportsInScope >= 2 && !blockedByLimits;

  const scopeCardClassName = isDarkTheme
    ? "rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4"
    : "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";
  const scopeMutedClassName = isDarkTheme ? "text-sm text-slate-400" : "text-sm text-slate-600";
  const scopeValueClassName = isDarkTheme ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900";
  const usageBadgeClassName =
    blockedByLimits
      ? isDarkTheme
        ? "rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
        : "rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
      : isDarkTheme
        ? "rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-100/90"
        : "rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-2 text-xs text-cyan-900";

  const actionCardBaseClass = isDarkTheme
    ? "rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 transition hover:border-cyan-500/40"
    : "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-cyan-300";
  const actionTitleClass = isDarkTheme ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900";
  const actionBodyClass = isDarkTheme ? "mt-1 text-sm text-slate-400" : "mt-1 text-sm text-slate-600";
  const actionButtonClass =
    "mt-3 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed";
  const outputShellClass = isDarkTheme
    ? "rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/80 to-slate-950/70 p-4 shadow-xl shadow-slate-950/20"
    : "rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/60";
  const outputBodyClass = isDarkTheme ? "prose-premium-dark mt-3 overflow-x-auto" : "prose-premium-light mt-3 overflow-x-auto";
  const relevantBenchmarks = useMemo(
    () => getRelevantBenchmarks(analysisMarkerNames),
    [analysisMarkerNames]
  );

  return (
    <section className="space-y-3 fade-in">
      <div className={scopeCardClassName}>
        <h3 className={isDarkTheme ? "text-base font-semibold text-slate-100" : "text-base font-semibold text-slate-900"}>
          {tr("AI Lab Analyse", "AI Lab Analysis")}
        </h3>
        <p className={scopeMutedClassName}>
          {tr(
            "Gebruik AI om je trends te interpreteren op basis van rapporten, protocol, supplementen en symptomen.",
            "Use AI to interpret your trends using reports, protocol, supplements, and symptoms."
          )}
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className={isDarkTheme ? "rounded-xl border border-slate-700 bg-slate-900/70 p-3" : "rounded-xl border border-slate-200 bg-slate-50 p-3"}>
            <p className={scopeMutedClassName}>{tr("Rapporten in scope", "Reports in scope")}</p>
            <p className={scopeValueClassName}>{reportsInScope}</p>
          </div>
          <div className={isDarkTheme ? "rounded-xl border border-slate-700 bg-slate-900/70 p-3" : "rounded-xl border border-slate-200 bg-slate-50 p-3"}>
            <p className={scopeMutedClassName}>{tr("Markers gevolgd", "Markers tracked")}</p>
            <p className={scopeValueClassName}>{markersTracked}</p>
          </div>
          <div className={isDarkTheme ? "rounded-xl border border-slate-700 bg-slate-900/70 p-3" : "rounded-xl border border-slate-200 bg-slate-50 p-3"}>
            <p className={scopeMutedClassName}>{tr("Eenheden", "Unit system")}</p>
            <p className={scopeValueClassName}>{settings.unitSystem.toUpperCase()}</p>
          </div>
          <div className={isDarkTheme ? "rounded-xl border border-slate-700 bg-slate-900/70 p-3" : "rounded-xl border border-slate-200 bg-slate-50 p-3"}>
            <p className={scopeMutedClassName}>{tr("Actief protocol", "Active protocol")}</p>
            <p className={scopeValueClassName}>{activeProtocolLabel}</p>
          </div>
        </div>

        <div className="mt-3">
          <div className={usageBadgeClassName}>
            <span className="font-medium">Free beta</span>
            {" - "}
            {betaUsage.dailyCount}/{betaLimits.maxAnalysesPerDay} {tr("gebruikt vandaag", "used today")}
            {" · "}
            {betaUsage.monthlyCount}/{betaLimits.maxAnalysesPerMonth} {tr("gebruikt deze maand", "used this month")}
            {dayLimitReached ? ` · ${tr("reset om middernacht", "resets at midnight")}` : ""}
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className={actionCardBaseClass}>
          <h4 className={actionTitleClass}>{tr("Volledige AI-analyse", "Full AI analysis")}</h4>
          <p className={actionBodyClass}>
            {tr(
              "Volledige trendanalyse met samenvatting, protocolimpact, supplementcontext en vervolgstappen.",
              "Full trend analysis with summary, protocol impact, supplement context, and next steps."
            )}
          </p>
          <button
            type="button"
            className={`${actionButtonClass} border-cyan-500/50 bg-cyan-500/10 text-cyan-200`}
            onClick={() => onRunAnalysis("full")}
            disabled={!canRunFull}
          >
            {isAnalyzingFull ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isAnalyzingFull ? tr("Analyseren...", "Analyzing...") : tr("Start volledige analyse", "Start full analysis")}
          </button>
        </div>

        <div className={actionCardBaseClass}>
          <h4 className={actionTitleClass}>{tr("Laatste vs vorige", "Latest vs previous")}</h4>
          <p className={actionBodyClass}>
            {tr(
              "Snelle vergelijking van je meest recente rapport met het rapport daarvoor.",
              "Quick comparison between your latest report and the previous report."
            )}
          </p>
          <button
            type="button"
            className={`${actionButtonClass} border-emerald-500/40 bg-emerald-500/10 text-emerald-200`}
            onClick={() => onRunAnalysis("latestComparison")}
            disabled={!canRunLatest}
          >
            {isAnalyzingLatest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isAnalyzingLatest ? tr("Analyseren...", "Analyzing...") : tr("Vergelijk laatste rapport", "Compare latest report")}
          </button>
          {reportsInScope < 2 ? (
            <p className={isDarkTheme ? "mt-2 text-xs text-slate-500" : "mt-2 text-xs text-slate-500"}>
              {tr(
                "Minimaal 2 rapporten nodig voor deze vergelijking.",
                "At least 2 reports are required for this comparison."
              )}
            </p>
          ) : null}
        </div>
      </div>

      {analysisError ? (
        <div
          className={
            isDarkTheme
              ? "rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"
              : "rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
          }
        >
          {analysisError}
        </div>
      ) : null}

      <article className={outputShellClass}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className={isDarkTheme ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900"}>
            {analysisKind === "latestComparison"
              ? tr("Analyse-output (laatste vs vorige)", "Analysis output (latest vs previous)")
              : tr("Analyse-output", "Analysis output")}
          </h4>
          {analysisResult ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-50"
              onClick={onCopyAnalysis}
              disabled={!analysisResult}
            >
              <FileText className="h-4 w-4" /> {analysisCopied ? tr("Gekopieerd", "Copied") : tr("Kopieer analyse", "Copy analysis")}
            </button>
          ) : null}
        </div>

        {analysisGeneratedAt ? (
          <p className={isDarkTheme ? "mt-2 text-xs text-slate-500" : "mt-2 text-xs text-slate-500"}>
            {tr("Laatste run", "Last run")}: {format(parseISO(analysisGeneratedAt), "dd MMM yyyy HH:mm")}
          </p>
        ) : null}

        {isAnalyzingLabs ? (
          <div className={isDarkTheme ? "mt-3 rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-300" : "mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"}>
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
              {tr("AI is je trendanalyse aan het opstellen...", "AI is preparing your trend analysis...")}
            </span>
          </div>
        ) : null}

        {!isAnalyzingLabs && !analysisResult ? (
          <div className={isDarkTheme ? "mt-3 rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-400" : "mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600"}>
            {tr(
              "Kies hierboven een analyse om AI-inzichten te genereren op basis van je huidige rapporten.",
              "Choose an analysis above to generate AI insights from your current reports."
            )}
          </div>
        ) : null}

        {analysisResult ? (
          <div className={outputBodyClass}>
            <Suspense
              fallback={
                <div className={isDarkTheme ? "rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-300" : "rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"}>
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                    {tr("Analyse-opmaak laden...", "Loading analysis formatting...")}
                  </span>
                </div>
              }
            >
              <AnalysisMarkdownBlock content={analysisResultDisplay} isDarkTheme={isDarkTheme} />
            </Suspense>
          </div>
        ) : null}

        {analysisResult && relevantBenchmarks.length > 0 ? (
          <div className={isDarkTheme ? "mt-4 border-t border-slate-800 pt-3" : "mt-4 border-t border-slate-200 pt-3"}>
            <p className={isDarkTheme ? "text-[11px] text-slate-500" : "text-[11px] text-slate-600"}>
              {tr(
                "Analyse kan gepubliceerd onderzoek refereren. Waarden variëren per individu. Dit is geen medisch advies.",
                "Analysis may reference published research. Values vary between individuals. This is not medical advice."
              )}{" "}
              {relevantBenchmarks.slice(0, 3).map((benchmark, index) => (
                <span key={`${benchmark.source.url}-${benchmark.marker}-${index}`}>
                  <a
                    href={benchmark.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={isDarkTheme ? "underline decoration-slate-700 hover:text-slate-300" : "underline decoration-slate-300 hover:text-slate-800"}
                  >
                    {benchmark.source.authors} ({benchmark.source.year})
                  </a>
                  {index < Math.min(2, relevantBenchmarks.length - 1) ? ", " : "."}
                </span>
              ))}
            </p>
          </div>
        ) : null}
      </article>
    </section>
  );
};

export default AnalysisView;
