import { useId } from "react";
import { format, parseISO } from "date-fns";
import { Area, CartesianGrid, ComposedChart, Customized, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MarkerSeriesPoint, buildDosePhaseBlocks, getTargetZone } from "../analytics";
import { AppLanguage, AppSettings, SymptomCheckIn } from "../types";
import { formatDate } from "../utils";
import { buildYAxisDomain, compactTooltipText, formatAxisTick, markerColor, phaseColor } from "../chartHelpers";
import { getMarkerDisplayName, trLocale } from "../i18n";
import { getCheckInAverage } from "../wellbeingMetrics";

export interface MarkerTrendChartProps {
  marker: string;
  points: MarkerSeriesPoint[];
  colorIndex: number;
  settings: AppSettings;
  language: AppLanguage;
  phaseBlocks: ReturnType<typeof buildDosePhaseBlocks>;
  height: number;
  showYearHints?: boolean;
  showSeriesGradientFill?: boolean;
  showValuePills?: boolean;
  checkIns?: SymptomCheckIn[];
}

type OverlayLayerKey = "reference" | "trt" | "longevity";
type ThemeKey = "dark" | "light";

interface OverlayStyle {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeOpacity: number;
  strokeWidth: number;
}

const OVERLAY_STYLES: Record<ThemeKey, Record<OverlayLayerKey, OverlayStyle>> = {
  dark: {
    reference: {
      fill: "#22c55e",
      fillOpacity: 0.1,
      stroke: "#22c55e",
      strokeOpacity: 0.45,
      strokeWidth: 1
    },
    trt: {
      fill: "#0ea5e9",
      fillOpacity: 0.12,
      stroke: "#0ea5e9",
      strokeOpacity: 0.5,
      strokeWidth: 1
    },
    longevity: {
      fill: "#a855f7",
      fillOpacity: 0.12,
      stroke: "#a855f7",
      strokeOpacity: 0.52,
      strokeWidth: 1
    }
  },
  light: {
    reference: {
      fill: "#16a34a",
      fillOpacity: 0.14,
      stroke: "#15803d",
      strokeOpacity: 0.68,
      strokeWidth: 1.2
    },
    trt: {
      fill: "#0284c7",
      fillOpacity: 0.16,
      stroke: "#0369a1",
      strokeOpacity: 0.75,
      strokeWidth: 1.25
    },
    longevity: {
      fill: "#9333ea",
      fillOpacity: 0.15,
      stroke: "#7e22ce",
      strokeOpacity: 0.76,
      strokeWidth: 1.25
    }
  }
};

export const resolveMarkerOverlayStyle = (theme: ThemeKey, layer: OverlayLayerKey): OverlayStyle => OVERLAY_STYLES[theme][layer];

const MarkerTrendChart = ({
  marker,
  points,
  colorIndex,
  settings,
  language,
  phaseBlocks,
  height,
  showYearHints = false,
  showSeriesGradientFill = false,
  showValuePills = false,
  checkIns = []
}: MarkerTrendChartProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const isDarkTheme = settings.theme === "dark";
  const seriesColor = markerColor(colorIndex);
  const gradientBaseId = useId().replace(/:/g, "");
  const seriesGradientId = `marker-series-fill-${gradientBaseId}`;
  const markerLabel = getMarkerDisplayName(marker, language);
  const mins = points.map((point) => point.referenceMin).filter((value): value is number => value !== null);
  const maxs = points.map((point) => point.referenceMax).filter((value): value is number => value !== null);
  const hasLowerBound = mins.length > 0;
  const hasUpperBound = maxs.length > 0;
  const rangeMin = mins.length > 0 ? Math.min(...mins) : undefined;
  const rangeMax = maxs.length > 0 ? Math.max(...maxs) : undefined;
  const trtZone = settings.showTrtTargetZone ? getTargetZone(marker, "trt", settings.unitSystem) : null;
  const longevityZone = settings.showLongevityTargetZone ? getTargetZone(marker, "longevity", settings.unitSystem) : null;
  const yAxisCandidates = [
    ...points.map((point) => point.value),
    ...(settings.showReferenceRanges
      ? [
          ...(rangeMin !== undefined ? [rangeMin] : []),
          ...(rangeMax !== undefined ? [rangeMax] : [])
        ]
      : []),
    ...(trtZone && trtZone.min < trtZone.max ? [trtZone.min, trtZone.max] : []),
    ...(longevityZone && longevityZone.min < longevityZone.max ? [longevityZone.min, longevityZone.max] : [])
  ];
  const yDomain = buildYAxisDomain(yAxisCandidates, settings.yAxisMode);
  const chartMin = yDomain?.[0] ?? Math.min(...points.map((point) => point.value));
  const chartMax = yDomain?.[1] ?? Math.max(...points.map((point) => point.value));
  const areaBaseValue = Number.isFinite(chartMin) ? chartMin : 0;
  const availableKeys = new Set(points.map((point) => point.key));
  const compactTooltip = settings.tooltipDetailMode === "compact";
  const overlayTheme: ThemeKey = isDarkTheme ? "dark" : "light";
  const referenceOverlayStyle = resolveMarkerOverlayStyle(overlayTheme, "reference");
  const trtOverlayStyle = resolveMarkerOverlayStyle(overlayTheme, "trt");
  const longevityOverlayStyle = resolveMarkerOverlayStyle(overlayTheme, "longevity");
  const phaseBlocksForSeries = phaseBlocks.filter(
    (block) => availableKeys.has(block.fromKey) || availableKeys.has(block.toKey)
  );
  const phaseLegend = phaseBlocksForSeries
    .map((block, index) => ({
      key: block.id,
      color: phaseColor(block.dosageMgPerWeek, index),
      dosageMgPerWeek: block.dosageMgPerWeek,
      label: block.dosageMgPerWeek === null ? tr("Fase zonder dosis", "Phase without dose") : `${block.dosageMgPerWeek} mg/wk`,
      protocol: block.protocol || "-"
    }))
    .filter((item, index, array) => array.findIndex((candidate) => candidate.label === item.label && candidate.protocol === item.protocol) === index)
    .slice(0, 4);
  const renderValuePillsOverlay = (chartProps: any) => {
    if (!showValuePills) {
      return null;
    }
    const graphicalItems = chartProps?.formattedGraphicalItems as Array<{ props?: { points?: Array<{ x?: number; y?: number; payload?: MarkerSeriesPoint }> } }> | undefined;
    const lineItem = graphicalItems?.find((item) => Array.isArray(item?.props?.points)) ?? graphicalItems?.[0];
    const linePoints = lineItem?.props?.points ?? [];
    if (linePoints.length === 0) {
      return null;
    }

    const offset = chartProps?.offset as { left?: number; width?: number } | undefined;
    const chartLeft = offset?.left;
    const chartRight = offset?.left !== undefined && offset?.width !== undefined
      ? offset.left + offset.width
      : undefined;
    // These must match the ComposedChart margin values below so pills can
    // freely use the margin space without being clipped by the SVG viewport.
    const CHART_MARGIN_LEFT = 2;
    const CHART_MARGIN_RIGHT = 32;

    return (
      <g pointerEvents="none">
        {linePoints.map((point, index) => {
          const cx = point.x;
          const cy = point.y;
          const payload = point.payload ?? points[index];
          if (cx === undefined || cy === undefined || !payload) {
            return null;
          }

          const pillFill =
            payload.abnormal === "high"
              ? "#c2410c"
              : payload.abnormal === "low"
                ? "#b45309"
                : "#0e7490";
          const textValue = formatAxisTick(payload.value);
          const pillWidth = Math.max(36, textValue.length * 8 + 18);
          const pillHeight = 26;
          const rawPillX = cx - pillWidth / 2;
          const pillEdgePadding = 6;
          // Clamp bounds extend into the chart margins so pills at the edges
          // can center naturally on their data points instead of being pushed
          // inward. This prevents clipping by the modal's overflow:hidden.
          const minPillX = chartLeft !== undefined
            ? chartLeft - CHART_MARGIN_LEFT + pillEdgePadding
            : rawPillX;
          const maxPillX = chartRight !== undefined
            ? chartRight + CHART_MARGIN_RIGHT - pillWidth - pillEdgePadding
            : rawPillX;
          const pillX = Math.min(Math.max(rawPillX, minPillX), maxPillX);
          const pillY = cy - 42;
          const textX = pillX + pillWidth / 2;

          return (
            <g key={`${payload.key}-pill`}>
              <rect
                x={pillX}
                y={pillY}
                width={pillWidth}
                height={pillHeight}
                rx={pillHeight / 2}
                fill={pillFill}
                fillOpacity={0.96}
                stroke={isDarkTheme ? "#0f172a" : "#ffffff"}
                strokeWidth={1.5}
              />
              <text
                x={textX}
                y={pillY + pillHeight / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#f8fafc"
                fontSize="12"
                fontWeight="700"
              >
                {textValue}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

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
    <div className="space-y-2">
      {settings.showAnnotations && phaseLegend.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {phaseLegend.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/70 px-2 py-0.5 text-slate-300">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={points} margin={{ left: 2, right: 32, top: 46, bottom: 5 }}>
        {showSeriesGradientFill ? (
          <defs>
            <linearGradient id={seriesGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={seriesColor} stopOpacity={0.34} />
              <stop offset="52%" stopColor={seriesColor} stopOpacity={0.14} />
              <stop offset="100%" stopColor={seriesColor} stopOpacity={0} />
            </linearGradient>
          </defs>
        ) : null}
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
                  fill={phaseColor(block.dosageMgPerWeek, index)}
                  fillOpacity={0.28}
                  stroke={phaseColor(block.dosageMgPerWeek, index)}
                  strokeOpacity={0.5}
                  strokeWidth={1}
                  ifOverflow="extendDomain"
                />
              ))
            : null}

          {settings.showAnnotations
            ? phaseBlocksForSeries.map((block) => (
                <ReferenceLine
                  key={`${marker}-phase-edge-${block.id}`}
                  x={block.toKey}
                  stroke="#94a3b8"
                  strokeOpacity={0.26}
                  strokeDasharray="4 3"
                  strokeWidth={1}
                />
              ))
            : null}

        {settings.showReferenceRanges && rangeMin !== undefined && rangeMax !== undefined && rangeMin < rangeMax ? (
          <ReferenceArea
            y1={rangeMin}
            y2={rangeMax}
            fill={referenceOverlayStyle.fill}
            fillOpacity={referenceOverlayStyle.fillOpacity}
            stroke={referenceOverlayStyle.stroke}
            strokeOpacity={referenceOverlayStyle.strokeOpacity}
            strokeWidth={referenceOverlayStyle.strokeWidth}
          />
        ) : null}
        {settings.showReferenceRanges && hasLowerBound && !hasUpperBound && rangeMin !== undefined && chartMax > rangeMin ? (
          <ReferenceArea
            y1={rangeMin}
            y2={chartMax}
            fill={referenceOverlayStyle.fill}
            fillOpacity={referenceOverlayStyle.fillOpacity}
            stroke={referenceOverlayStyle.stroke}
            strokeOpacity={referenceOverlayStyle.strokeOpacity}
            strokeWidth={referenceOverlayStyle.strokeWidth}
          />
        ) : null}
        {settings.showReferenceRanges && hasUpperBound && !hasLowerBound && rangeMax !== undefined && chartMin < rangeMax ? (
          <ReferenceArea
            y1={chartMin}
            y2={rangeMax}
            fill={referenceOverlayStyle.fill}
            fillOpacity={referenceOverlayStyle.fillOpacity}
            stroke={referenceOverlayStyle.stroke}
            strokeOpacity={referenceOverlayStyle.strokeOpacity}
            strokeWidth={referenceOverlayStyle.strokeWidth}
          />
        ) : null}

        {trtZone && trtZone.min < trtZone.max ? (
          <ReferenceArea
            y1={trtZone.min}
            y2={trtZone.max}
            fill={trtOverlayStyle.fill}
            fillOpacity={trtOverlayStyle.fillOpacity}
            stroke={trtOverlayStyle.stroke}
            strokeOpacity={trtOverlayStyle.strokeOpacity}
            strokeWidth={trtOverlayStyle.strokeWidth}
          />
        ) : null}

        {longevityZone && longevityZone.min < longevityZone.max ? (
          <ReferenceArea
            y1={longevityZone.min}
            y2={longevityZone.max}
            fill={longevityOverlayStyle.fill}
            fillOpacity={longevityOverlayStyle.fillOpacity}
            stroke={longevityOverlayStyle.stroke}
            strokeOpacity={longevityOverlayStyle.strokeOpacity}
            strokeWidth={longevityOverlayStyle.strokeWidth}
          />
        ) : null}

        {showSeriesGradientFill ? (
          <Area
            type="monotone"
            dataKey="value"
            fill={`url(#${seriesGradientId})`}
            stroke="none"
            baseValue={areaBaseValue}
            fillOpacity={1}
            connectNulls
            isAnimationActive={false}
            dot={false}
            activeDot={false}
          />
        ) : null}

        <Line
          type="monotone"
          dataKey="value"
          stroke={seriesColor}
          strokeWidth={2.6}
          isAnimationActive={false}
          dot={(props) => {
            const payload = props.payload as MarkerSeriesPoint;
            const cx = typeof props.cx === "number" ? props.cx : Number(props.cx);
            const cy = typeof props.cy === "number" ? props.cy : Number(props.cy);
            if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
              return <g />;
            }
            let fill = seriesColor;
            if (settings.showAbnormalHighlights) {
              if (payload.abnormal === "high") {
                fill = "#fb7185";
              }
              if (payload.abnormal === "low") {
                fill = "#f59e0b";
              }
            }
            return <circle cx={cx} cy={cy} r={4} stroke="#0f172a" strokeWidth={1.5} fill={fill} />;
          }}
          activeDot={{ r: 6 }}
        />
        {showValuePills ? <Customized component={renderValuePillsOverlay} /> : null}

        {/* Check-in overlay: vertical lines at nearest point to each check-in date */}
        {settings.showCheckInOverlay && checkIns.length > 0
          ? checkIns
              .map((c) => {
                // Find closest data point within 30 days
                const targetTs = parseISO(c.date).getTime();
                let best: MarkerSeriesPoint | null = null;
                let bestDiff = Infinity;
                for (const point of points) {
                  const diff = Math.abs(parseISO(point.date).getTime() - targetTs);
                  if (diff < bestDiff) { bestDiff = diff; best = point; }
                }
                if (!best || bestDiff > 30 * 24 * 60 * 60 * 1000) return null;
                const avgScore = getCheckInAverage(c) ?? 0;
                const emoji = avgScore >= 7.5 ? "😄" : avgScore >= 5 ? "🙂" : "😟";
                return (
                  <ReferenceLine
                    key={`checkin-${c.id}`}
                    x={best.key}
                    stroke="#f59e0b"
                    strokeOpacity={0.5}
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                    label={{ value: emoji, position: "top", fontSize: 12, offset: 4 }}
                  />
                );
              })
              .filter(Boolean)
          : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default MarkerTrendChart;
