import { motion } from "framer-motion";
import { MarkerSeriesPoint, buildDosePhaseBlocks, MarkerTrendSummary } from "../analytics";
import { AppLanguage, AppSettings, SymptomCheckIn } from "../types";
import { getMarkerDisplayName, trLocale } from "../i18n";
import { trendVisual } from "../chartHelpers";
import MarkerInfoBadge from "./MarkerInfoBadge";
import MarkerTrendChart from "./MarkerTrendChart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
            <Badge variant="cyan" className="text-[10px] px-1 py-0.5">fx</Badge>
          ) : null}
          {alertCount > 0 ? (
            <Button
              type="button"
              onClick={onOpenAlerts}
              variant="ghost"
              size="sm"
              className="shrink-0 text-[10px] leading-none text-rose-300"
              aria-label={`${tr("Open alerts voor", "Open alerts for")} ${markerLabel}`}
            >
              {alertCount} {tr("alert", `alert${alertCount > 1 ? "s" : ""}`)}
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500">{points[0]?.unit ?? ""}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-[11px] text-slate-500 px-1.5 py-0.5"
            onClick={onOpenLarge}
          >
            {tr("Vergroot", "Enlarge")}
          </Button>
        </div>
      </div>

      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1" title={trendExplanation}>
          <span className="text-slate-500">{tr("Algemene trend", "Overall trend")}:</span>
          {trend.icon}
          {trendText}
        </span>
        <span>
          {tr("Recente verandering", "Recent change")} ({tr("sinds vorige test", "since last test")}):{" "}
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

      <Button
        type="button"
        variant="ghost"
        className="block w-full justify-start p-0 cursor-zoom-in"
        onClick={onOpenLarge}
        aria-label={`${tr("Open grotere grafiek voor", "Open larger chart for")} ${markerLabel}`}
      >
        <div className="w-full">
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
        </div>
      </Button>
    </motion.div>
  );
};

export default MarkerChartCard;
