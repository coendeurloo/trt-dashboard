import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { formatAxisTick } from "../chartHelpers";
import { trLocale } from "../i18n";
import { AppLanguage, AppSettings } from "../types";

interface ProtocolImpactDeltaRailProps {
  beforeValue: number | null;
  afterValue: number | null;
  deltaPct: number | null;
  unit: string;
  trend: "up" | "down" | "flat" | "insufficient";
  language: AppLanguage;
  unitSystem: AppSettings["unitSystem"];
  isInsufficient: boolean;
}

const ProtocolImpactDeltaRail = ({
  beforeValue,
  afterValue,
  deltaPct,
  unit,
  trend,
  language,
  unitSystem,
  isInsufficient
}: ProtocolImpactDeltaRailProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  if (isInsufficient || beforeValue === null || afterValue === null) {
    return (
      <div className="protocol-impact-delta-rail protocol-impact-delta-rail-empty" role="status">
        <span>{tr("Nog te weinig data", "Not enough data yet")}</span>
      </div>
    );
  }

  const deltaLabel =
    deltaPct === null
      ? tr("Onbekend", "Unknown")
      : `${deltaPct > 0 ? "+" : ""}${formatAxisTick(deltaPct)}%`;
  const deltaToneClass = trend === "up" ? "text-cyan-300" : trend === "down" ? "text-rose-300" : "text-slate-200";
  const ariaSummary = `${tr("Voor", "Before")}: ${formatAxisTick(beforeValue)} ${unit}; ${tr("Na", "After")}: ${formatAxisTick(afterValue)} ${unit}; ${tr("Verandering", "Change")}: ${deltaLabel}.`;

  return (
    <div className="protocol-impact-delta-rail" role="img" aria-label={ariaSummary}>
      <div className="grid grid-cols-2 divide-x divide-slate-700/60 rounded-xl bg-slate-900/70 px-2 py-3">
        <div className="flex flex-col items-center px-3">
          <span className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
            {tr("Voor", "Before")}
          </span>
          <span className="text-xl font-bold tabular-nums text-slate-200">{formatAxisTick(beforeValue)}</span>
          <span className="mt-0.5 text-[11px] text-slate-500">{unit}</span>
        </div>

        <div className="flex flex-col items-center px-3">
          <span className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
            {tr("Na", "After")}
          </span>
          <span className="text-xl font-bold tabular-nums text-slate-200">{formatAxisTick(afterValue)}</span>
          <span className="mt-0.5 text-[11px] text-slate-500">{unit}</span>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-center" title={`${tr("Eenheidssysteem", "Unit system")}: ${unitSystem.toUpperCase()}`}>
        <span className={`protocol-impact-delta-percent-circle ${deltaToneClass}`}>
          {trend === "up" ? <TrendingUp className="h-3 w-3" /> : null}
          {trend === "down" ? <TrendingDown className="h-3 w-3" /> : null}
          {trend === "flat" ? <Minus className="h-3 w-3" /> : null}
          {deltaLabel}
        </span>
      </div>
    </div>
  );
};

export default ProtocolImpactDeltaRail;
