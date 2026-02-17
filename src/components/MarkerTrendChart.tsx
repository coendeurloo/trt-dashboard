import { format, parseISO } from "date-fns";
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MarkerSeriesPoint, buildDosePhaseBlocks, getTargetZone } from "../analytics";
import { AppLanguage, AppSettings } from "../types";
import { formatDate } from "../utils";
import { buildYAxisDomain, compactTooltipText, formatAxisTick, markerColor, phaseColor } from "../chartHelpers";
import { getMarkerDisplayName, trLocale } from "../i18n";

export interface MarkerTrendChartProps {
  marker: string;
  points: MarkerSeriesPoint[];
  colorIndex: number;
  settings: AppSettings;
  language: AppLanguage;
  phaseBlocks: ReturnType<typeof buildDosePhaseBlocks>;
  height: number;
  showYearHints?: boolean;
}

const MarkerTrendChart = ({
  marker,
  points,
  colorIndex,
  settings,
  language,
  phaseBlocks,
  height,
  showYearHints = false
}: MarkerTrendChartProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const markerLabel = getMarkerDisplayName(marker, language);
  const mins = points.map((point) => point.referenceMin).filter((value): value is number => value !== null);
  const maxs = points.map((point) => point.referenceMax).filter((value): value is number => value !== null);
  const rangeMin = mins.length > 0 ? Math.min(...mins) : undefined;
  const rangeMax = maxs.length > 0 ? Math.max(...maxs) : undefined;
  const trtZone = settings.showTrtTargetZone ? getTargetZone(marker, "trt", settings.unitSystem) : null;
  const longevityZone = settings.showLongevityTargetZone ? getTargetZone(marker, "longevity", settings.unitSystem) : null;
  const yAxisCandidates = [
    ...points.map((point) => point.value),
    ...(settings.showReferenceRanges && rangeMin !== undefined && rangeMax !== undefined && rangeMin < rangeMax ? [rangeMin, rangeMax] : []),
    ...(trtZone && trtZone.min < trtZone.max ? [trtZone.min, trtZone.max] : []),
    ...(longevityZone && longevityZone.min < longevityZone.max ? [longevityZone.min, longevityZone.max] : [])
  ];
  const yDomain = buildYAxisDomain(yAxisCandidates, settings.yAxisMode);
  const availableKeys = new Set(points.map((point) => point.key));
  const compactTooltip = settings.tooltipDetailMode === "compact";
  const phaseBlocksForSeries = phaseBlocks.filter(
    (block) => availableKeys.has(block.fromKey) || availableKeys.has(block.toKey)
  );

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-slate-700 text-sm text-slate-400"
        style={{ height }}
      >
        {tr("Geen data in dit bereik", "No data in selected range")}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ left: 2, right: 8, top: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="key"
          tickFormatter={(value: string, index) => {
            try {
              const dateString = String(value).split("__")[0];
              const currentDate = parseISO(dateString);
              if (!showYearHints) {
                return format(currentDate, "dd MMM");
              }

              if (index === 0) {
                return format(currentDate, "dd MMM yyyy");
              }

              const previousPoint = points[index - 1];
              if (!previousPoint) {
                return format(currentDate, "dd MMM yyyy");
              }

              const previousDate = parseISO(previousPoint.date);
              if (previousDate.getFullYear() !== currentDate.getFullYear()) {
                return format(currentDate, "dd MMM yyyy");
              }

              return format(currentDate, "dd MMM");
            } catch {
              return value;
            }
          }}
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          stroke="#334155"
          minTickGap={18}
        />
        <YAxis
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          tickFormatter={(value) => formatAxisTick(Number(value))}
          stroke="#334155"
          width={44}
          domain={yDomain ?? ["auto", "auto"]}
        />
        <Tooltip
          offset={18}
          allowEscapeViewBox={{ x: true, y: true }}
          wrapperStyle={{ pointerEvents: "none", zIndex: 50 }}
          cursor={{ stroke: "#334155", strokeDasharray: "4 3", strokeWidth: 1 }}
          content={({ active, payload }) => {
            const point = payload?.[0]?.payload as MarkerSeriesPoint | undefined;
            if (!active || !point) {
              return null;
            }
            const protocolText = compactTooltipText(point.context.protocol, 54);
            return (
              <div
                className={`chart-tooltip rounded-xl border border-slate-600 bg-slate-950/95 p-2.5 text-xs text-slate-200 shadow-xl ${
                  compactTooltip ? "w-[210px]" : "w-[300px]"
                }`}
              >
                <p className="font-semibold text-slate-100">{formatDate(point.date)}</p>
                <p className="mt-1 text-sm text-cyan-200">
                  {markerLabel}: <strong>{formatAxisTick(point.value)}</strong> {point.unit}
                </p>
                <div className="mt-1.5 space-y-1 text-slate-300">
                  <p>{tr("Dosis", "Dose")}: {point.context.dosageMgPerWeek === null ? "-" : `${point.context.dosageMgPerWeek} mg/week`}</p>
                  {compactTooltip ? (
                    <p>Protocol: {protocolText}</p>
                  ) : (
                    <>
                      <p>Protocol: {point.context.protocol || "-"}</p>
                      <p>{tr("Supplementen", "Supplements")}: {point.context.supplements || "-"}</p>
                      <p>{tr("Symptomen", "Symptoms")}: {point.context.symptoms || "-"}</p>
                      <p>{tr("Notities", "Notes")}: {point.context.notes || "-"}</p>
                    </>
                  )}
                </div>
              </div>
            );
          }}
        />

        {settings.showAnnotations
          ? phaseBlocksForSeries.map((block, index) => (
              <ReferenceArea
                key={`${marker}-phase-${block.id}`}
                x1={block.fromKey}
                x2={block.toKey}
                y1="dataMin"
                y2="dataMax"
                fill={phaseColor(block.dosageMgPerWeek, index)}
                fillOpacity={0.08}
                strokeOpacity={0}
              />
            ))
          : null}

        {settings.showReferenceRanges && rangeMin !== undefined && rangeMax !== undefined && rangeMin < rangeMax ? (
          <ReferenceArea y1={rangeMin} y2={rangeMax} fill="#22c55e" fillOpacity={0.18} stroke="#22c55e" strokeOpacity={0.3} />
        ) : null}

        {trtZone && trtZone.min < trtZone.max ? (
          <ReferenceArea y1={trtZone.min} y2={trtZone.max} fill="#0ea5e9" fillOpacity={0.15} stroke="#0ea5e9" strokeOpacity={0.3} />
        ) : null}

        {longevityZone && longevityZone.min < longevityZone.max ? (
          <ReferenceArea
            y1={longevityZone.min}
            y2={longevityZone.max}
            fill="#a855f7"
            fillOpacity={0.12}
            stroke="#a855f7"
            strokeOpacity={0.28}
          />
        ) : null}

        <Line
          type="monotone"
          dataKey="value"
          stroke={markerColor(colorIndex)}
          strokeWidth={2.6}
          dot={(props) => {
            const payload = props.payload as MarkerSeriesPoint;
            let fill = markerColor(colorIndex);
            if (settings.showAbnormalHighlights) {
              if (payload.abnormal === "high") {
                fill = "#fb7185";
              }
              if (payload.abnormal === "low") {
                fill = "#f59e0b";
              }
            }
            return <circle cx={props.cx} cy={props.cy} r={4} stroke="#0f172a" strokeWidth={1.5} fill={fill} />;
          }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default MarkerTrendChart;
