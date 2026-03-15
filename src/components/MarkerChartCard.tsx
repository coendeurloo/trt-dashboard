import { motion } from "framer-motion";
import { MarkerSeriesPoint, buildDosePhaseBlocks, MarkerTrendSummary } from "../analytics";
import { AppLanguage, AppSettings, SymptomCheckIn } from "../types";
import { getMarkerDisplayName, trLocale } from "../i18n";
import { trendVisual } from "../chartHelpers";
import MarkerInfoBadge from "./MarkerInfoBadge";
import MarkerTrendChart from "./MarkerTrendChart";

export interface MarkerChartCardProps {
  marker: string;
  points: MarkerSeriesPoint[];
  colorIndex: number;
  settings: AppSettings;
  language: AppLanguage;
  phaseBlocks: ReturnType<typeof buildDosePhaseBlocks>;
  alertCount: number;
  trendSummary: MarkerTrendSummary | null;
  percentChange: number | null;
  baselineDelta: number | null;
  isCalculatedMarker: boolean;
  onOpenLarge: () => void;
  onOpenAlerts: () => void;
  checkIns?: SymptomCheckIn[];
}

const MarkerChartCard = ({
  marker,
  points,
  colorIndex,
  settings,
  language,
  phaseBlocks,
  alertCount,
  trendSummary,
  percentChange,
  baselineDelta,
  isCalculatedMarker,
  onOpenLarge,
  onOpenAlerts,
  checkIns = []
}: MarkerChartCardProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const trend = trendVisual(trendSummary?.direction ?? null);
  const markerLabel = getMarkerDisplayName(marker, language);
  const trendText =
    trend.text === "Rising"
      ? tr("Stijgend", "Rising")
      : trend.text === "Falling"
        ? tr("Dalend", "Falling")
        : trend.text === "Volatile"
          ? tr("Volatiel", "Volatile")
          : tr("Stabiel", "Stable");
  const trendExplanation = trendSummary?.explanation
    ?.replace("Volatile pattern: variability is high", tr("Volatiel patroon: variabiliteit is hoog", "Volatile pattern: variability is high"))
    .replace(
      "Rising trend based on positive linear regression slope.",
      tr("Stijgende trend op basis van positieve regressie-helling.", "Rising trend based on positive linear regression slope.")
    )
    .replace(
      "Falling trend based on negative linear regression slope.",
      tr("Dalende trend op basis van negatieve regressie-helling.", "Falling trend based on negative linear regression slope.")
    )
    .replace("Stable trend: slope remains close to zero.", tr("Stabiele trend: helling blijft dicht bij nul.", "Stable trend: slope remains close to zero."))
    .replace("Insufficient points for trend classification.", tr("Onvoldoende meetpunten voor trendclassificatie.", "Insufficient points for trend classification."));
  const hasAlerts = alertCount > 0;
  const deltaToneClass = (delta: number | null): string => {
    if (delta === null) {
      return "text-slate-300 marker-delta-neutral";
    }
    if (delta >= 0) {
      return "text-emerald-300 marker-delta-positive";
    }
    return hasAlerts ? "text-amber-300 marker-delta-alert" : "text-slate-200 marker-delta-neutral";
  };

  return (
    <motion.div
      layout
      data-testid={`marker-card-${marker}`}
      className={`rounded-xl p-3 ${
        hasAlerts ? "marker-card-alert" : "bg-slate-800/40"
      }`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-medium text-slate-100">{markerLabel}</h3>
          <MarkerInfoBadge marker={marker} language={language} />
          {isCalculatedMarker ? (
            <span className="rounded bg-cyan-500/10 px-1 py-0.5 text-[10px] text-cyan-300">fx</span>
          ) : null}
          {alertCount > 0 ? (
            <button
              type="button"
              onClick={onOpenAlerts}
              className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[10px] leading-none text-rose-300 transition hover:bg-rose-500/20"
              aria-label={`${tr("Open alerts voor", "Open alerts for")} ${markerLabel}`}
            >
              {alertCount} {tr("alert", `alert${alertCount > 1 ? "s" : ""}`)}
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500">{points[0]?.unit ?? ""}</span>
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-[11px] text-slate-500 transition-colors hover:text-slate-300"
            onClick={onOpenLarge}
          >
            {tr("Vergroot", "Enlarge")}
          </button>
        </div>
      </div>

      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1" title={trendExplanation}>
          {trend.icon}
          {trendText}
        </span>
        <span>
          {tr("Sinds vorige test", "Since last test")}:{" "}
          <strong className={deltaToneClass(percentChange)}>
            {percentChange === null ? "-" : `${percentChange > 0 ? "+" : ""}${percentChange}%`}
          </strong>
        </span>
        {settings.compareToBaseline ? (
          <span>
            {tr("t.o.v. baseline", "vs baseline")}:{" "}
            <strong className={deltaToneClass(baselineDelta)}>
              {baselineDelta === null ? "-" : `${baselineDelta > 0 ? "+" : ""}${baselineDelta}%`}
            </strong>
          </span>
        ) : null}
      </div>

      <button
        type="button"
        className="block w-full cursor-zoom-in text-left"
        onClick={onOpenLarge}
        aria-label={`${tr("Open grotere grafiek voor", "Open larger chart for")} ${markerLabel}`}
      >
        <MarkerTrendChart
          marker={marker}
          points={points}
          colorIndex={colorIndex}
          settings={settings}
          language={language}
          phaseBlocks={phaseBlocks}
          height={200}
          showSeriesGradientFill
          checkIns={checkIns}
        />
      </button>
    </motion.div>
  );
};

export default MarkerChartCard;
