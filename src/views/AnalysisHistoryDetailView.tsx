import { format, parseISO } from "date-fns";
import { Suspense, lazy } from "react";
import { AiAnalysis, AppLanguage } from "../types";
import { trLocale } from "../i18n";
import { normalizeAnalysisTextForDisplay } from "../chartHelpers";
import { Loader2 } from "lucide-react";

const AnalysisMarkdownBlock = lazy(() => import("../components/AnalysisMarkdownBlock"));

interface AnalysisHistoryDetailViewProps {
  analysis: AiAnalysis | null;
  language: AppLanguage;
  isDarkTheme: boolean;
  onBackToHistory: () => void;
  onBackToCoach: () => void;
  onDelete: (id: string) => void;
}

const formatDateTime = (value: string): string => {
  try {
    return format(parseISO(value), "dd MMM yyyy HH:mm");
  } catch {
    return value;
  }
};

const AnalysisHistoryDetailView = ({
  analysis,
  language,
  isDarkTheme,
  onBackToHistory,
  onBackToCoach,
  onDelete
}: AnalysisHistoryDetailViewProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  if (!analysis) {
    return (
      <section className="space-y-3 fade-in">
        <p className={isDarkTheme ? "text-sm text-slate-300" : "text-sm text-slate-600"}>
          {tr("Analyse niet gevonden.", "Analysis not found.")}
        </p>
        <div className="flex gap-3">
          <button type="button" onClick={onBackToHistory} className={isDarkTheme ? "text-sm text-cyan-300 hover:underline" : "text-sm text-cyan-700 hover:underline"}>
            {tr("Back to history", "Back to history")}
          </button>
          <button type="button" onClick={onBackToCoach} className={isDarkTheme ? "text-sm text-cyan-300 hover:underline" : "text-sm text-cyan-700 hover:underline"}>
            {tr("Back to AI Coach", "Back to AI Coach")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 fade-in sm:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className={isDarkTheme ? "text-lg font-semibold text-slate-100" : "text-lg font-semibold text-slate-900"}>
            {analysis.title}
          </h3>
          <p className={isDarkTheme ? "text-sm text-slate-300" : "text-sm text-slate-600"}>{formatDateTime(analysis.createdAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => onDelete(analysis.id)} className={isDarkTheme ? "text-sm text-rose-300 hover:underline" : "text-sm text-rose-700 hover:underline"}>
            {tr("Delete", "Delete")}
          </button>
          <button type="button" onClick={onBackToHistory} className={isDarkTheme ? "text-sm text-cyan-300 hover:underline" : "text-sm text-cyan-700 hover:underline"}>
            {tr("Back to history", "Back to history")}
          </button>
          <button type="button" onClick={onBackToCoach} className={isDarkTheme ? "text-sm text-cyan-300 hover:underline" : "text-sm text-cyan-700 hover:underline"}>
            {tr("Back to AI Coach", "Back to AI Coach")}
          </button>
        </div>
      </div>

      <article
        className={
          isDarkTheme
            ? "rounded-2xl border border-slate-700/80 bg-slate-900/60 p-4 sm:p-5"
            : "rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
        }
      >
        <p className={isDarkTheme ? "mb-1 text-xs uppercase tracking-wide text-slate-300" : "mb-1 text-xs uppercase tracking-wide text-slate-600"}>
          {tr("Prompt", "Prompt")}
        </p>
        <blockquote
          className={
            isDarkTheme
              ? "rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200"
              : "rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
          }
        >
          {analysis.prompt}
        </blockquote>

        <div className={isDarkTheme ? "prose-premium-dark mt-4 overflow-x-auto" : "prose-premium-light mt-4 overflow-x-auto"}>
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
            <AnalysisMarkdownBlock content={normalizeAnalysisTextForDisplay(analysis.answer)} isDarkTheme={isDarkTheme} />
          </Suspense>
        </div>
      </article>
    </section>
  );
};

export default AnalysisHistoryDetailView;
