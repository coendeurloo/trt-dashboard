import { motion } from "framer-motion";
import { MarkerSeriesPoint, buildDosePhaseBlocks, MarkerTrendSummary } from "../analytics";
import { AppLanguage, AppSettings } from "../types";
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
  onOpenAlerts
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

  return (
    <motion.div
      layout
      className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 shadow-soft"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-100">{markerLabel}</h3>
          <MarkerInfoBadge marker={marker} language={language} />
          {isCalculatedMarker ? (
            <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-200">fx</span>
          ) : null}
          {alertCount > 0 ? (
            <button
              type="button"
              onClick={onOpenAlerts}
              className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-rose-400/50 bg-rose-500/10 px-2 py-0.5 text-[10px] leading-none text-rose-200 transition hover:border-rose-300/70 hover:bg-rose-500/20 hover:text-rose-100"
              aria-label={`${tr("Open alerts voor", "Open alerts for")} ${markerLabel}`}
            >
              {alertCount} {tr("alert", `alert${alertCount > 1 ? "s" : ""}`)}
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{points[0]?.unit ?? ""}</span>
          <button
            type="button"
            className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:border-cyan-500/50 hover:text-cyan-200"
            onClick={onOpenLarge}
          >
            {tr("Vergroot", "Enlarge")}
          </button>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-300">
        <span className="inline-flex items-center gap-1" title={trendExplanation}>
          {trend.icon}
          {trendText}
        </span>
        <span>
          {tr("Sinds vorige test", "Since last test")}:{" "}
          <strong className={percentChange === null ? "text-slate-300" : percentChange >= 0 ? "text-emerald-300" : "text-amber-300"}>
            {percentChange === null ? "-" : `${percentChange > 0 ? "+" : ""}${percentChange}%`}
          </strong>
        </span>
        {settings.compareToBaseline ? (
          <span>
            {tr("t.o.v. baseline", "vs baseline")}:{" "}
            <strong className={baselineDelta === null ? "text-slate-300" : baselineDelta >= 0 ? "text-emerald-300" : "text-amber-300"}>
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
          height={230}
        />
      </button>
    </motion.div>
  );
};

export default MarkerChartCard;
