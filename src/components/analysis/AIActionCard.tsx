import { Loader2, Sparkles } from "lucide-react";

interface AIActionCardProps {
  title: string;
  description: string;
  buttonLabel: string;
  footnote: string;
  helperText?: string;
  tone: "primary" | "secondary";
  isRunning: boolean;
  isDisabled: boolean;
  isDarkTheme: boolean;
  onClick: () => void;
}

const AIActionCard = ({
  title,
  description,
  buttonLabel,
  footnote,
  helperText,
  tone,
  isRunning,
  isDisabled,
  isDarkTheme,
  onClick
}: AIActionCardProps) => {
  const shellClassName = isDarkTheme
    ? "app-teal-glow-surface rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4"
    : "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";
  const buttonClassName = tone === "primary"
    ? isDarkTheme
      ? "inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-cyan-400/45 bg-cyan-500/20 px-3 py-2 text-sm font-medium text-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
      : "inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-cyan-500 bg-cyan-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-45"
    : isDarkTheme
      ? "inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-emerald-400/35 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"
      : "inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-emerald-500 bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <article className={shellClassName}>
      <h4 className={isDarkTheme ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900"}>{title}</h4>
      <p className={isDarkTheme ? "mt-1 text-sm text-slate-300" : "mt-1 text-sm text-slate-600"}>{description}</p>
      <button type="button" className={`mt-3 w-full ${buttonClassName}`} onClick={onClick} disabled={isDisabled}>
        {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {buttonLabel}
      </button>
      <p className={isDarkTheme ? "mt-3 text-xs text-slate-400" : "mt-3 text-xs text-slate-600"}>{footnote}</p>
      {helperText ? <p className={isDarkTheme ? "mt-1 text-xs text-slate-500" : "mt-1 text-xs text-slate-500"}>{helperText}</p> : null}
    </article>
  );
};

export default AIActionCard;
