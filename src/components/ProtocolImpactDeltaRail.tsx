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
  const directionArrow = trend === "up" ? "↗" : trend === "down" ? "↘" : "→";
  const ariaSummary = `${tr("Voor", "Before")}: ${formatAxisTick(beforeValue)} ${unit}; ${tr("Na", "After")}: ${formatAxisTick(afterValue)} ${unit}; ${tr("Verandering", "Change")}: ${deltaLabel}.`;

  return (
    <div className="protocol-impact-delta-rail" role="img" aria-label={ariaSummary}>
      <div className="protocol-impact-delta-side">
        <span className="protocol-impact-delta-caption">⬅ {tr("Voor", "Before")}</span>
        <span className="protocol-impact-delta-value">
          <span className="protocol-impact-delta-number">{formatAxisTick(beforeValue)}</span>
          <span className="protocol-impact-delta-unit">{unit}</span>
        </span>
      </div>

      <div className="protocol-impact-delta-center">
        <span className="protocol-impact-delta-direction-dot" aria-hidden="true">
          <span className="protocol-impact-delta-arrow">{directionArrow}</span>
        </span>
        <span className="protocol-impact-delta-badge" title={`${tr("Eenheidssysteem", "Unit system")}: ${unitSystem.toUpperCase()}`}>
          {deltaLabel}
        </span>
      </div>

      <div className="protocol-impact-delta-side protocol-impact-delta-side-right">
        <span className="protocol-impact-delta-caption">
          {tr("Na", "After")} ➡
        </span>
        <span className="protocol-impact-delta-value">
          <span className="protocol-impact-delta-number">{formatAxisTick(afterValue)}</span>
          <span className="protocol-impact-delta-unit">{unit}</span>
        </span>
      </div>
    </div>
  );
};

export default ProtocolImpactDeltaRail;
