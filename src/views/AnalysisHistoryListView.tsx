import { format, parseISO } from "date-fns";
import { AiAnalysis, AppLanguage } from "../types";
import { trLocale } from "../i18n";

interface AnalysisHistoryListViewProps {
  analyses: AiAnalysis[];
  language: AppLanguage;
  isDarkTheme: boolean;
  onBackToCoach: () => void;
  onOpenDetail: (id: string) => void;
}

const formatDateTime = (value: string): string => {
  try {
    return format(parseISO(value), "dd MMM yyyy HH:mm");
  } catch {
    return value;
  }
};

const summarize = (value: string): string => value.replace(/\s+/g, " ").trim();

const AnalysisHistoryListView = ({
  analyses,
  language,
  isDarkTheme,
  onBackToCoach,
  onOpenDetail
}: AnalysisHistoryListViewProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  return (
    <section className="space-y-4 fade-in sm:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className={isDarkTheme ? "text-lg font-semibold text-slate-100" : "text-lg font-semibold text-slate-900"}>
            {tr("AI Coach history", "AI Coach history")}
          </h3>
          <p className={isDarkTheme ? "text-sm text-slate-300" : "text-sm text-slate-600"}>
            {tr("Eerdere analyses, gesorteerd op recent.", "Previous analyses, sorted by most recent.")}
          </p>
        </div>
        <button
          type="button"
          onClick={onBackToCoach}
          className={isDarkTheme ? "text-sm text-cyan-300 hover:underline" : "text-sm text-cyan-700 hover:underline"}
        >
          {tr("Back to AI Coach", "Back to AI Coach")}
        </button>
      </div>

      <div className="space-y-3">
        {analyses.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onOpenDetail(entry.id)}
            className={
              isDarkTheme
                ? "w-full rounded-xl border border-slate-700/80 bg-slate-900/60 p-4 text-left transition hover:border-cyan-500/45"
                : "w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-cyan-500/60"
            }
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <span className={isDarkTheme ? "text-xs text-slate-300" : "text-xs text-slate-600"}>
                {formatDateTime(entry.createdAt)} {" · "} {entry.title}
              </span>
              <span className={isDarkTheme ? "rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200" : "rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cyan-700"}>
                AI
              </span>
            </div>
            <p className={isDarkTheme ? "line-clamp-2 text-sm text-slate-100" : "line-clamp-2 text-sm text-slate-800"}>
              {summarize(entry.answer)}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
};

export default AnalysisHistoryListView;
