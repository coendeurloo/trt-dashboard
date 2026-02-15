import { format, parseISO } from "date-fns";
import { Loader2, FileText, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { AppLanguage, AppSettings, LabReport } from "../types";

interface AnalysisViewProps {
  isAnalyzingLabs: boolean;
  analysisError: string;
  analysisResult: string;
  analysisResultDisplay: string;
  analysisGeneratedAt: string | null;
  analysisCopied: boolean;
  analysisKind: "full" | "latestComparison" | null;
  visibleReports: LabReport[];
  samplingControlsEnabled: boolean;
  allMarkersCount: number;
  betaRemaining: {
    dailyRemaining: number;
    monthlyRemaining: number;
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
  visibleReports,
  samplingControlsEnabled,
  allMarkersCount,
  betaRemaining,
  betaLimits,
  settings,
  language,
  onRunAnalysis,
  onCopyAnalysis
}: AnalysisViewProps) => {
  const isNl = language === "nl";
  const tr = (nl: string, en: string): string => (isNl ? nl : en);

  return (
    <section className="space-y-3 fade-in">
      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
        <h3 className="text-base font-semibold text-slate-100">{tr("AI Lab Analyse", "AI Lab Analysis")}</h3>
        <p className="mt-1 text-sm text-slate-400">
          {tr(
            "Laat AI je labwaardes analyseren, inclusief protocol, supplementen en symptomen. Gratis tijdens de beta.",
            "Let AI analyze your lab values including protocol, supplements, and symptoms. Free during beta."
          )}
        </p>

        <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/80">
          <span className="font-medium">Free beta</span>
          {" - "}
          {betaRemaining.dailyRemaining}/{betaLimits.maxAnalysesPerDay} analyses today
          {" · "}
          {betaRemaining.monthlyRemaining}/{betaLimits.maxAnalysesPerMonth} this month
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-cyan-500/50 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200 disabled:opacity-50"
            onClick={() => onRunAnalysis("full")}
            disabled={
              isAnalyzingLabs ||
              visibleReports.length === 0 ||
              betaRemaining.dailyRemaining === 0 ||
              betaRemaining.monthlyRemaining === 0
            }
          >
            {isAnalyzingLabs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isAnalyzingLabs ? tr("Analyseren...", "Analyzing...") : tr("Volledige AI-analyse", "Full AI analysis")}
          </button>
          <button
            type="button"
            className="analysis-latest-btn inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-200 disabled:opacity-50"
            onClick={() => onRunAnalysis("latestComparison")}
            disabled={
              isAnalyzingLabs ||
              visibleReports.length < 2 ||
              betaRemaining.dailyRemaining === 0 ||
              betaRemaining.monthlyRemaining === 0
            }
          >
            <Sparkles className="h-4 w-4" />
            {tr("Laatste vs vorige", "Latest vs previous")}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-50"
            onClick={onCopyAnalysis}
            disabled={!analysisResult}
          >
            <FileText className="h-4 w-4" /> {analysisCopied ? tr("Gekopieerd", "Copied") : tr("Kopieer analyse", "Copy analysis")}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
          <span>
            {tr("Rapporten in scope", "Reports in scope")}: {visibleReports.length}
            {visibleReports.length > 4 ? tr(" (laatste 4 volledig + trends)", " (latest 4 full + trends)") : ""}
          </span>
          {samplingControlsEnabled ? <span>{tr("Meetmoment-filter", "Sampling filter")}: {settings.samplingFilter}</span> : null}
          <span>{tr("Markers gevolgd", "Markers tracked")}: {allMarkersCount}</span>
          <span>{tr("Eenheden", "Unit system")}: {settings.unitSystem.toUpperCase()}</span>
          <span>{tr("Formaat: alleen tekst (geen tabellen)", "Format: text-only (no tables)")}</span>
          {analysisGeneratedAt ? (
            <span>{tr("Laatste run", "Last run")}: {format(parseISO(analysisGeneratedAt), "dd MMM yyyy HH:mm")}</span>
          ) : null}
        </div>
      </div>

      {analysisError ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {analysisError}
        </div>
      ) : null}

      {isAnalyzingLabs ? (
        <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-5">
          <div className="inline-flex items-center gap-2 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
            {tr("AI is je trendanalyse aan het opstellen...", "AI is preparing your trend analysis...")}
          </div>
        </div>
      ) : null}

      {analysisResult ? (
        <article className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
          <h4 className="text-sm font-semibold text-slate-100">
            {analysisKind === "latestComparison"
              ? tr("Analyse-output (laatste vs vorige)", "Analysis output (latest vs previous)")
              : tr("Analyse-output (volledig)", "Analysis output (full)")}
          </h4>
          <div className="mt-3 overflow-x-auto">
            <ReactMarkdown
              skipHtml
              remarkPlugins={[remarkBreaks]}
              allowedElements={["h1", "h2", "h3", "h4", "p", "strong", "em", "ul", "ol", "li", "blockquote", "code", "pre", "br", "hr"]}
              components={{
                h1: ({ children }) => <h1 className="mt-4 text-xl font-semibold text-slate-100">{children}</h1>,
                h2: ({ children }) => <h2 className="mt-4 text-lg font-semibold text-cyan-200">{children}</h2>,
                h3: ({ children }) => <h3 className="mt-3 text-base font-semibold text-slate-100">{children}</h3>,
                h4: ({ children }) => <h4 className="mt-3 text-sm font-semibold text-slate-100">{children}</h4>,
                p: ({ children }) => <p className="mt-2 text-sm leading-6 text-slate-200">{children}</p>,
                ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">{children}</ul>,
                ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-200">{children}</ol>,
                li: ({ children }) => <li className="leading-6">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-slate-100">{children}</strong>,
                em: ({ children }) => <em className="italic text-slate-200">{children}</em>,
                blockquote: ({ children }) => (
                  <blockquote className="mt-3 border-l-2 border-slate-600 pl-3 text-sm text-slate-300">{children}</blockquote>
                ),
                code: ({ children }) => (
                  <code className="rounded bg-slate-800/80 px-1 py-0.5 text-[13px] text-slate-100">{children}</code>
                ),
                pre: ({ children }) => (
                  <pre className="mt-2 overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200">
                    {children}
                  </pre>
                ),
                hr: () => <hr className="my-4 border-slate-700" />
              }}
            >
              {analysisResultDisplay}
            </ReactMarkdown>
          </div>
        </article>
      ) : null}
    </section>
  );
};

export default AnalysisView;
