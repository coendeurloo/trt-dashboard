import { ShieldCheck } from "lucide-react";

interface AIUsageMeterProps {
  isDarkTheme: boolean;
  badgeLabel?: string;
  trustLabel: string;
  todayLabel: string;
  todayCount: number;
  todayLimit: number;
  monthLabel: string;
  monthCount: number;
  monthLimit: number;
  whatsThisLabel: string;
  whatsThisTitle: string;
}

const getFillPercent = (count: number, limit: number): number => {
  if (!Number.isFinite(limit) || limit <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (count / limit) * 100));
};

const AIInfoBar = ({
  isDarkTheme,
  badgeLabel,
  trustLabel,
  todayLabel,
  todayCount,
  todayLimit,
  monthLabel,
  monthCount,
  monthLimit,
  whatsThisLabel,
  whatsThisTitle
}: AIUsageMeterProps) => {
  const todayFill = getFillPercent(todayCount, todayLimit);
  const monthFill = getFillPercent(monthCount, monthLimit);

  return (
    <section className="relative" aria-label="Analysis usage meter">
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
            ? "rounded-2xl border border-slate-700/70 bg-slate-900/60 px-4 py-3"
            : "rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
        }
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <p className={isDarkTheme ? "inline-flex items-center gap-1.5 text-sm text-slate-200" : "inline-flex items-center gap-1.5 text-sm text-slate-700"}>
          <ShieldCheck className="h-4 w-4 shrink-0 text-cyan-300" />
          {trustLabel}
        </p>

        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex-1">
            <div className={isDarkTheme ? "mb-1 flex items-center justify-between text-xs text-slate-200" : "mb-1 flex items-center justify-between text-xs text-slate-700"}>
              <span>{todayLabel}</span>
              <span>
                <strong className={isDarkTheme ? "text-slate-100" : "text-slate-900"}>{todayCount}</strong> {`of ${todayLimit}`}
              </span>
            </div>
            <div className={isDarkTheme ? "h-1.5 rounded-full bg-slate-800" : "h-1.5 rounded-full bg-slate-200"}>
              <div className="h-full rounded-full bg-cyan-400" style={{ width: `${todayFill}%` }} />
            </div>
          </div>

          <div className="flex-1">
            <div className={isDarkTheme ? "mb-1 flex items-center justify-between text-xs text-slate-200" : "mb-1 flex items-center justify-between text-xs text-slate-700"}>
              <span>{monthLabel}</span>
              <span>
                <strong className={isDarkTheme ? "text-slate-100" : "text-slate-900"}>{monthCount}</strong> {`of ${monthLimit}`}
              </span>
            </div>
            <div className={isDarkTheme ? "h-1.5 rounded-full bg-slate-800" : "h-1.5 rounded-full bg-slate-200"}>
              <div className="h-full rounded-full bg-cyan-400" style={{ width: `${monthFill}%` }} />
            </div>
          </div>

          <button
            type="button"
            title={whatsThisTitle}
            className={isDarkTheme ? "self-end text-xs text-slate-300 underline-offset-2 hover:text-cyan-200 hover:underline sm:self-center" : "self-end text-xs text-slate-600 underline-offset-2 hover:text-cyan-700 hover:underline sm:self-center"}
          >
            {whatsThisLabel}
          </button>
        </div>
      </div>
      </div>
    </section>
  );
};

export default AIInfoBar;
