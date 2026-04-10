import { Loader2, Sparkles } from "lucide-react";
import { SuggestedAiQuestion } from "../../analysisSuggestions";

export interface IntentChip {
  key: string;
  label: string;
  icon?: "sparkles";
  variant: "primary" | "secondary";
  isRunning: boolean;
  disabled: boolean;
  helperText?: string;
  onClick: () => void;
}

interface AIQuestionInputProps {
  title: string;
  subtitle: string;
  inputLabel: string;
  inputPlaceholder: string;
  askButtonLabel: string;
  suggestionsTitle: string;
  localNote: string;
  scopeHint?: string | null;
  intents: IntentChip[];
  reportsHint: string | null;
  value: string;
  suggestions: SuggestedAiQuestion[];
  isSubmitting: boolean;
  canSubmit: boolean;
  isDarkTheme: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onSelectSuggestion: (question: string) => void;
}

const AIQuestionInput = ({
  title,
  subtitle,
  inputLabel,
  inputPlaceholder,
  askButtonLabel,
  suggestionsTitle,
  localNote,
  scopeHint,
  intents,
  reportsHint,
  value,
  suggestions,
  isSubmitting,
  canSubmit,
  isDarkTheme,
  onChange,
  onSubmit,
  onSelectSuggestion
}: AIQuestionInputProps) => {
  const inputId = "analysis-ai-question-input";
  const blockingIntentHelper = intents.find((intent) => intent.disabled && intent.helperText)?.helperText;

  return (
    <section
      className={
        isDarkTheme
          ? "app-teal-glow-surface rounded-[24px] border border-slate-700/70 bg-slate-900/65 p-4 shadow-soft sm:p-5"
          : "rounded-[24px] border border-slate-200/90 bg-white/95 p-4 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.32)] sm:p-5"
      }
    >
      <div className="space-y-1">
        <h4 className={isDarkTheme ? "text-lg font-semibold tracking-tight text-slate-100" : "text-lg font-semibold tracking-tight text-slate-900"}>{title}</h4>
        <p className={isDarkTheme ? "max-w-2xl text-sm text-slate-300" : "max-w-2xl text-sm text-slate-600"}>{subtitle}</p>
        {scopeHint ? <p className={isDarkTheme ? "text-xs text-slate-400" : "text-xs text-slate-500"}>{scopeHint}</p> : null}
      </div>

      <div className="mt-3 mb-3 flex flex-wrap items-center gap-2">
        {intents.map((intent) => {
          const intentClassName =
            intent.variant === "primary"
              ? isDarkTheme
                ? "inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:border-cyan-400/60 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                : "inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-700 transition hover:border-cyan-500/60 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-40"
              : isDarkTheme
                ? "inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                : "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

          return (
            <button
              key={intent.key}
              type="button"
              onClick={intent.onClick}
              disabled={intent.disabled}
              title={intent.disabled && intent.helperText ? intent.helperText : undefined}
              className={intentClassName}
            >
              {intent.isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : intent.icon === "sparkles" ? <Sparkles className="h-3.5 w-3.5" /> : null}
              {intent.label}
            </button>
          );
        })}
      </div>

      {blockingIntentHelper ? (
        <p className={isDarkTheme ? "mb-3 text-[11px] text-slate-500" : "mb-3 text-[11px] text-slate-500"}>{blockingIntentHelper}</p>
      ) : null}

      <div className="space-y-2">
        <label htmlFor={inputId} className={isDarkTheme ? "text-xs font-medium uppercase tracking-wide text-slate-400" : "text-xs font-medium uppercase tracking-wide text-slate-500"}>
          {inputLabel}
        </label>
        <textarea
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={inputPlaceholder}
          rows={2}
          className={
            isDarkTheme
              ? "min-h-[86px] w-full resize-y rounded-2xl border border-slate-500/80 bg-slate-700/65 px-4 py-3 text-sm leading-relaxed text-slate-100 placeholder:text-slate-400 focus-visible:border-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30 sm:min-h-[96px]"
              : "min-h-[86px] w-full resize-y rounded-2xl border border-slate-300/90 bg-white px-4 py-3 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus-visible:border-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/20 sm:min-h-[96px]"
          }
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-cyan-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:min-w-[132px]"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {askButtonLabel}
          </button>
        </div>
      </div>

      {suggestions.length > 0 ? (
        <div className="mt-3 space-y-2">
          <p className={isDarkTheme ? "text-[11px] font-medium uppercase tracking-wide text-slate-500" : "text-[11px] font-medium uppercase tracking-wide text-slate-500"}>
            {suggestionsTitle}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => onSelectSuggestion(suggestion.question)}
                className={
                  isDarkTheme
                    ? "inline-flex items-center rounded-lg border border-slate-700/80 bg-slate-800/40 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100"
                    : "inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                }
              >
                {suggestion.question}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className={isDarkTheme ? "mt-2.5 border-t border-slate-800/90 pt-2.5 text-[11px] text-slate-500" : "mt-2.5 border-t border-slate-200/90 pt-2.5 text-[11px] text-slate-500"}>
        <p>{localNote}</p>
        {reportsHint ? <p className="mt-1">{reportsHint}</p> : null}
      </div>
    </section>
  );
};

export default AIQuestionInput;
