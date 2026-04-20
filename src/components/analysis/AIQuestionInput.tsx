import { KeyboardEvent } from "react";
import { Loader2, Plus, Sparkles, X } from "lucide-react";
import { SuggestedAiQuestion } from "../../analysisSuggestions";

export interface PresetChip {
  key: string;
  label: string;
  variant: "teal" | "neutral";
  icon?: "sparkles" | "x" | "plus";
  disabled?: boolean;
  onClick: () => void;
}

interface AIQuestionInputProps {
  badgeLabel?: string;
  title: string;
  subtitle: string;
  suggestionsTitle: string;
  presetsTitle: string;
  inputPlaceholder: string;
  askButtonLabel: string;
  keyboardHintLabel: string;
  localNote: string;
  reportsHint: string | null;
  value: string;
  suggestions: SuggestedAiQuestion[];
  presets: PresetChip[];
  isSubmitting: boolean;
  canSubmit: boolean;
  isDarkTheme: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onSelectSuggestion: (question: string) => void;
}

const AIQuestionInput = ({
  badgeLabel,
  title,
  subtitle,
  suggestionsTitle,
  presetsTitle,
  inputPlaceholder,
  askButtonLabel,
  keyboardHintLabel,
  localNote,
  reportsHint,
  value,
  suggestions,
  presets,
  isSubmitting,
  canSubmit,
  isDarkTheme,
  onChange,
  onSubmit,
  onSelectSuggestion
}: AIQuestionInputProps) => {
  const inputId = "analysis-ai-question-input";
  const onTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && canSubmit) {
      event.preventDefault();
      onSubmit();
    }
  };

  const chipBaseClass =
    "inline-flex min-h-[36px] items-center rounded-lg border px-3 py-1.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70";
  const suggestionChipClass = isDarkTheme
    ? `${chipBaseClass} border-slate-700/80 bg-slate-800/45 text-slate-200 hover:border-slate-500 hover:bg-slate-800 hover:text-slate-100`
    : `${chipBaseClass} border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900`;
  const presetTealClass = isDarkTheme
    ? `${chipBaseClass} gap-1.5 rounded-full border-cyan-400/40 bg-cyan-500/10 text-cyan-200 hover:border-cyan-300/70 hover:bg-cyan-500/20`
    : `${chipBaseClass} gap-1.5 rounded-full border-cyan-500/50 bg-cyan-500/10 text-cyan-800 hover:border-cyan-500/70 hover:bg-cyan-500/20`;
  const presetNeutralClass = isDarkTheme
    ? `${chipBaseClass} gap-1.5 rounded-full border-slate-600/80 bg-slate-800/65 text-slate-200 hover:border-slate-500 hover:bg-slate-700`
    : `${chipBaseClass} gap-1.5 rounded-full border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50`;

  return (
    <section className="relative">
      {badgeLabel ? (
        <span
          className={
            isDarkTheme
              ? "pointer-events-none absolute -top-3 right-4 z-[1] rounded-md border border-cyan-500/50 bg-slate-900/95 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-cyan-200"
              : "pointer-events-none absolute -top-3 right-4 z-[1] rounded-md border border-cyan-500/50 bg-white/95 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-cyan-700"
          }
        >
          {badgeLabel}
        </span>
      ) : null}

      <div
        className={
          isDarkTheme
            ? "app-teal-glow-surface rounded-[24px] border border-slate-700/70 bg-slate-900/65 p-4 shadow-soft sm:p-6"
            : "rounded-[24px] border border-slate-200/90 bg-white/95 p-4 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.32)] sm:p-6"
        }
      >
        <div className="mb-4 space-y-1">
          <h4 className={isDarkTheme ? "text-3xl font-semibold tracking-tight text-slate-100" : "text-3xl font-semibold tracking-tight text-slate-900"}>{title}</h4>
          <p className={isDarkTheme ? "max-w-2xl text-base text-slate-200" : "max-w-2xl text-base text-slate-700"}>{subtitle}</p>
        </div>

      {suggestions.length > 0 ? (
        <div className="mb-3 space-y-2.5">
          <p className={isDarkTheme ? "text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300" : "text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600"}>
            {suggestionsTitle}
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => onSelectSuggestion(suggestion.question)}
                className={suggestionChipClass}
              >
                {suggestion.question}
              </button>
            ))}
          </div>
          <p className={isDarkTheme ? "text-xs text-slate-300" : "text-xs text-slate-600"}>{localNote}</p>
        </div>
      ) : null}

      <div className="mb-3 space-y-2.5">
        <p className={isDarkTheme ? "text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300" : "text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600"}>
          {presetsTitle}
        </p>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={preset.onClick}
              disabled={preset.disabled}
              className={`${preset.variant === "teal" ? presetTealClass : presetNeutralClass} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {preset.icon === "plus" || preset.key === "more" ? <Plus className="h-3.5 w-3.5" /> : null}
              {preset.icon === "x" ? <X className="h-3.5 w-3.5" /> : null}
              {(preset.icon === "sparkles" || (!preset.icon && preset.key !== "more")) ? <Sparkles className="h-3.5 w-3.5" /> : null}
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={
          isDarkTheme
            ? "relative overflow-hidden rounded-xl border border-slate-600/70 bg-slate-950/65 focus-within:border-cyan-400/60"
            : "relative overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-cyan-500"
        }
      >
        <textarea
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onTextareaKeyDown}
          placeholder={inputPlaceholder}
          rows={5}
          className={
            isDarkTheme
              ? "min-h-[200px] w-full resize-y bg-transparent px-4 pb-16 pt-3 text-base leading-relaxed text-slate-100 placeholder:text-slate-400 focus-visible:outline-none"
              : "min-h-[200px] w-full resize-y bg-transparent px-4 pb-16 pt-3 text-base leading-relaxed text-slate-900 placeholder:text-slate-400 focus-visible:outline-none"
          }
        />
        <div className={isDarkTheme ? "absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-slate-800 px-3 py-2" : "absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-slate-200 px-3 py-2"}>
          <span className={isDarkTheme ? "text-xs text-slate-300" : "text-xs text-slate-600"}>{keyboardHintLabel}</span>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {askButtonLabel}
          </button>
        </div>
      </div>

      {reportsHint ? <p className={isDarkTheme ? "mt-2 text-xs text-slate-300" : "mt-2 text-xs text-slate-600"}>{reportsHint}</p> : null}
      </div>
    </section>
  );
};

export default AIQuestionInput;
