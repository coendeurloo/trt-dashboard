import { ReactNode } from "react";

interface EmptyStateCardProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  icon?: ReactNode;
  isDarkTheme?: boolean;
}

const EmptyStateCard = ({
  title,
  description,
  actionLabel,
  onAction,
  actionDisabled = false,
  icon,
  isDarkTheme = true
}: EmptyStateCardProps) => {
  return (
    <section
      className={
        isDarkTheme
          ? "rounded-xl border border-dashed border-slate-700/80 bg-slate-900/40 px-5 py-8 text-center"
          : "rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-5 py-8 text-center"
      }
    >
      {icon ? <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center">{icon}</div> : null}
      <p className={isDarkTheme ? "text-base font-semibold text-slate-100" : "text-base font-semibold text-slate-900"}>{title}</p>
      <p className={isDarkTheme ? "mx-auto mt-1 max-w-xl text-sm text-slate-400" : "mx-auto mt-1 max-w-xl text-sm text-slate-600"}>{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          disabled={actionDisabled}
          className={`mt-4 rounded-md border px-3 py-1.5 text-sm transition ${
            actionDisabled
              ? isDarkTheme
                ? "cursor-not-allowed border-slate-700 bg-slate-900/60 text-slate-500"
                : "cursor-not-allowed border-slate-300 bg-slate-100 text-slate-500"
              : isDarkTheme
                ? "border-cyan-500/45 bg-cyan-500/12 font-medium text-cyan-100 hover:border-cyan-300/70 hover:bg-cyan-500/20"
                : "border-cyan-500/55 bg-cyan-50 font-medium text-cyan-800 hover:border-cyan-500/70 hover:bg-cyan-100"
          }`}
        >
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
};

export default EmptyStateCard;
