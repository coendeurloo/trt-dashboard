import { motion } from "framer-motion";
import { Pencil } from "lucide-react";
import { MarkerSeriesPoint, buildDosePhaseBlocks, MarkerTrendSummary } from "../analytics";
import { AppLanguage, AppSettings, MarkerValue } from "../types";
import { getMarkerDisplayName, trLocale } from "../i18n";
import { markerCardAccentClass, trendVisual } from "../chartHelpers";
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
  onRenameMarker: (marker: string) => void;
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
  onRenameMarker
}: MarkerChartCardProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const latestPoint = points[points.length - 1] ?? null;
  const trend = trendVisual(trendSummary?.direction ?? null);
  const accent = markerCardAccentClass(alertCount, latestPoint?.abnormal ?? null);
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
      className={`rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 shadow-soft ${accent}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-100">{markerLabel}</h3>
          <MarkerInfoBadge marker={marker} language={language} />
          {!isCalculatedMarker ? (
            <button
              type="button"
              className="rounded p-0.5 text-slate-400 transition hover:text-cyan-200"
              onClick={() => onRenameMarker(marker)}
              aria-label={tr("Marker hernoemen", "Rename marker")}
              title={tr("Marker hernoemen", "Rename marker")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {isCalculatedMarker ? (
            <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-200">fx</span>
          ) : null}
          {alertCount > 0 ? (
            <span className="rounded-full border border-rose-400/50 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-200">
              {alertCount} {tr("alert", `alert${alertCount > 1 ? "s" : ""}`)}
            </span>
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
