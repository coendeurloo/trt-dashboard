import { Loader2, Sparkles } from "lucide-react";

interface AIQuickActionsPanelProps {
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
  const cardClassName = isDarkTheme
    ? "rounded-xl border border-slate-700/80 bg-slate-950/55 p-3.5"
    : "rounded-xl border border-slate-200 bg-slate-50/80 p-3.5";
  const cardTitleClassName = isDarkTheme ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900";
  const cardBodyClassName = isDarkTheme ? "mt-1 text-sm text-slate-300" : "mt-1 text-sm text-slate-600";
  const primaryButtonClassName =
    "mt-3 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-cyan-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
      <article className={cardClassName}>
        <h5 className={cardTitleClassName}>{fullTitle}</h5>
        <p className={cardBodyClassName}>{fullDescription}</p>
        <button type="button" className={primaryButtonClassName} disabled={!canRunFull} onClick={onRunFull}>
          {isAnalyzingFull ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {fullButtonLabel}
        </button>
        <p className={isDarkTheme ? "mt-2 text-xs text-slate-400" : "mt-2 text-xs text-slate-600"}>{fullFootnote}</p>
      </article>

      <article className={cardClassName}>
        <h5 className={cardTitleClassName}>{latestTitle}</h5>
        <p className={cardBodyClassName}>{latestDescription}</p>
        <button type="button" className={primaryButtonClassName} disabled={!canRunLatest} onClick={onRunLatest}>
          {isAnalyzingLatest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {latestButtonLabel}
        </button>
        <p className={isDarkTheme ? "mt-2 text-xs text-slate-400" : "mt-2 text-xs text-slate-600"}>{latestFootnote}</p>
        {latestHelperText ? <p className="mt-1 text-xs text-slate-500">{latestHelperText}</p> : null}
      </article>
    </div>
  );
};

export default AIQuickActionsPanel;
