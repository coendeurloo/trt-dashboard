import { Activity, FlaskConical, ShieldCheck } from "lucide-react";

interface AIInfoBarProps {
  isDarkTheme: boolean;
  hasDemoData: boolean;
  isDemoMode: boolean;
  usageLabelTitle: string;
  usageLabel: string;
  usageHint: string | null;
  actionGuardLabel: string;
  demoModeLabel: string;
  demoMixedLabel: string;
  consentRequiredLabel: string | null;
}

const AIInfoBar = ({
  isDarkTheme,
  hasDemoData,
  isDemoMode,
  usageLabelTitle,
  usageLabel,
  usageHint,
  actionGuardLabel,
  demoModeLabel,
  demoMixedLabel,
  consentRequiredLabel
}: AIInfoBarProps) => {
  return (
    <section
      className={
        isDarkTheme
          ? "rounded-2xl border border-slate-700/70 bg-slate-900/60 px-3 py-2.5 sm:px-4"
          : "rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm sm:px-4"
      }
      aria-label="Analysis system status"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <p className={isDarkTheme ? "inline-flex items-center gap-1.5 text-xs text-slate-300" : "inline-flex items-center gap-1.5 text-xs text-slate-700"}>
          <ShieldCheck className="h-3.5 w-3.5" />
          {actionGuardLabel}
        </p>

        {hasDemoData ? (
          <p className={isDarkTheme ? "inline-flex items-center gap-1.5 text-xs text-slate-300" : "inline-flex items-center gap-1.5 text-xs text-slate-700"}>
            <FlaskConical className="h-3.5 w-3.5" />
            {isDemoMode ? demoModeLabel : demoMixedLabel}
          </p>
        ) : null}

        <p className={isDarkTheme ? "inline-flex items-center gap-1.5 text-xs text-slate-300" : "inline-flex items-center gap-1.5 text-xs text-slate-700"}>
          <Activity className="h-3.5 w-3.5" />
          {usageLabelTitle}: {usageLabel}
        </p>
      </div>

      {usageHint || consentRequiredLabel ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {usageHint ? <p className={isDarkTheme ? "text-xs text-amber-300" : "text-xs text-amber-700"}>{usageHint}</p> : null}
          {consentRequiredLabel ? (
            <p className={isDarkTheme ? "text-xs text-amber-200" : "text-xs text-amber-800"}>{consentRequiredLabel}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default AIInfoBar;
