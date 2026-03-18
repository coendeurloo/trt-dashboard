import { Loader2, Sparkles } from "lucide-react";

interface AIQuickActionsPanelProps {
  title: string;
  subtitle: string;
  fullTitle: string;
  fullDescription: string;
  fullButtonLabel: string;
  fullFootnote: string;
  latestTitle: string;
  latestDescription: string;
  latestButtonLabel: string;
  latestFootnote: string;
  latestHelperText?: string;
  isAnalyzingFull: boolean;
  isAnalyzingLatest: boolean;
  canRunFull: boolean;
  canRunLatest: boolean;
  isDarkTheme: boolean;
  onRunFull: () => void;
  onRunLatest: () => void;
}

const AIQuickActionsPanel = ({
  title,
  subtitle,
  fullTitle,
  fullDescription,
  fullButtonLabel,
  fullFootnote,
  latestTitle,
  latestDescription,
  latestButtonLabel,
  latestFootnote,
  latestHelperText,
  isAnalyzingFull,
  isAnalyzingLatest,
  canRunFull,
  canRunLatest,
  isDarkTheme,
  onRunFull,
  onRunLatest
}: AIQuickActionsPanelProps) => {
  return (
    <section
      className={
        isDarkTheme
          ? "rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 sm:p-5"
          : "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      }
    >
      <header>
        <h4 className={isDarkTheme ? "text-base font-semibold text-slate-100" : "text-base font-semibold text-slate-900"}>{title}</h4>
        <p className={isDarkTheme ? "mt-1 text-sm text-slate-300" : "mt-1 text-sm text-slate-600"}>{subtitle}</p>
      </header>

      <div className="mt-4 space-y-4">
        <article className={isDarkTheme ? "rounded-xl border border-slate-700/80 bg-slate-950/55 p-3.5" : "rounded-xl border border-slate-200 bg-slate-50/80 p-3.5"}>
          <h5 className={isDarkTheme ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900"}>{fullTitle}</h5>
          <p className={isDarkTheme ? "mt-1 text-sm text-slate-300" : "mt-1 text-sm text-slate-600"}>{fullDescription}</p>
          <button
            type="button"
            className={
              isDarkTheme
                ? "mt-3 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/45 bg-cyan-500/20 px-3 py-2 text-sm font-medium text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
                : "mt-3 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg border border-cyan-500 bg-cyan-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-45"
            }
            disabled={!canRunFull}
            onClick={onRunFull}
          >
            {isAnalyzingFull ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {fullButtonLabel}
          </button>
          <p className={isDarkTheme ? "mt-2 text-xs text-slate-400" : "mt-2 text-xs text-slate-600"}>{fullFootnote}</p>
        </article>

        <article className={isDarkTheme ? "rounded-xl border border-slate-700/80 bg-slate-950/55 p-3.5" : "rounded-xl border border-slate-200 bg-slate-50/80 p-3.5"}>
          <h5 className={isDarkTheme ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900"}>{latestTitle}</h5>
          <p className={isDarkTheme ? "mt-1 text-sm text-slate-300" : "mt-1 text-sm text-slate-600"}>{latestDescription}</p>
          <button
            type="button"
            className={
              isDarkTheme
                ? "mt-3 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg border border-slate-500/70 bg-slate-900/80 px-3 py-2 text-sm font-medium text-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
                : "mt-3 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-45"
            }
            disabled={!canRunLatest}
            onClick={onRunLatest}
          >
            {isAnalyzingLatest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {latestButtonLabel}
          </button>
          <p className={isDarkTheme ? "mt-2 text-xs text-slate-400" : "mt-2 text-xs text-slate-600"}>{latestFootnote}</p>
          {latestHelperText ? <p className={isDarkTheme ? "mt-1 text-xs text-slate-500" : "mt-1 text-xs text-slate-500"}>{latestHelperText}</p> : null}
        </article>
      </div>
    </section>
  );
};

export default AIQuickActionsPanel;
