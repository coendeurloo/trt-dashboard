import { addDays, format, parseISO } from "date-fns";
import { Area, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DosePrediction, buildMarkerSeries, calculatePercentChange } from "../analytics";
import { AppLanguage, AppSettings, LabReport } from "../types";
import { getMarkerDisplayName, trLocale } from "../i18n";
import { formatDate } from "../utils";
import { buildYAxisDomain, formatAxisTick } from "../chartHelpers";
import { useMemo } from "react";

export interface DoseProjectionChartProps {
  prediction: DosePrediction;
  reports: LabReport[];
  settings: AppSettings;
  language: AppLanguage;
  targetDose?: number;
  targetEstimate?: number;
  targetLow?: number | null;
  targetHigh?: number | null;
  isSameDoseScenario?: boolean;
  sameDoseDeltaPct?: number | null;
}

const DoseProjectionChart = ({
  prediction,
  reports,
  settings,
  language,
  targetDose,
  targetEstimate,
  targetLow,
  targetHigh,
  isSameDoseScenario = false,
  sameDoseDeltaPct = null
}: DoseProjectionChartProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const markerLabel = getMarkerDisplayName(prediction.marker, language);
  const projectedDose = typeof targetDose === "number" && Number.isFinite(targetDose) ? targetDose : prediction.suggestedDose;
  const projectedEstimate =
    typeof targetEstimate === "number" && Number.isFinite(targetEstimate) ? targetEstimate : prediction.suggestedEstimate;
  const projectedLow =
    typeof targetLow === "number" && Number.isFinite(targetLow)
      ? targetLow
      : prediction.predictedLow !== null
        ? prediction.predictedLow
        : null;
  const projectedHigh =
    typeof targetHigh === "number" && Number.isFinite(targetHigh)
      ? targetHigh
      : prediction.predictedHigh !== null
        ? prediction.predictedHigh
        : null;
  const historical = useMemo(
    () => buildMarkerSeries(reports, prediction.marker, settings.unitSystem),
    [reports, prediction.marker, settings.unitSystem]
  );

  if (historical.length === 0) {
    return null;
  }

  const recentHistorical = historical.slice(-3);
  const latest = recentHistorical[recentHistorical.length - 1];
  if (!latest) {
    return null;
  }
  const projectionStartValue = latest.value;
  const projectionValue = isSameDoseScenario ? latest.value : projectedEstimate;
  const projectionLow = isSameDoseScenario ? latest.value : projectedLow;
  const projectionHigh = isSameDoseScenario ? latest.value : projectedHigh;

  const projectionSpacingDays =
    recentHistorical.length >= 2
      ? (() => {
          const previous = recentHistorical[recentHistorical.length - 2];
          if (!previous) {
            return 42;
          }
          const days = Math.round((Date.parse(`${latest.date}T00:00:00Z`) - Date.parse(`${previous.date}T00:00:00Z`)) / 86400000);
          return Number.isFinite(days) && days > 0 ? Math.min(Math.max(days, 21), 120) : 42;
        })()
      : 42;

  const projectionDateIso = format(addDays(parseISO(latest.date), projectionSpacingDays), "yyyy-MM-dd");
  const projectionKey = `${projectionDateIso}__projection`;

  const chartData: Array<{
    x: string;
    date: string;
    actual: number | null;
    projected: number | null;
    bandBase: number | null;
    bandSpan: number | null;
    projectedLow: number | null;
    projectedHigh: number | null;
  }> = recentHistorical.map((point, index) => ({
    x: point.key,
    date: point.date,
    actual: point.value,
    projected: index === recentHistorical.length - 1 ? projectionStartValue : null,
    bandBase: index === recentHistorical.length - 1 ? projectionStartValue : null,
    bandSpan: index === recentHistorical.length - 1 ? 0 : null,
    projectedLow: index === recentHistorical.length - 1 ? projectionStartValue : null,
    projectedHigh: index === recentHistorical.length - 1 ? projectionStartValue : null
  }));

  chartData.push({
    x: projectionKey,
    date: projectionDateIso,
    actual: null,
    projected: projectionValue,
    bandBase: projectionLow,
    bandSpan:
      projectionLow !== null && projectionHigh !== null && projectionHigh >= projectionLow
        ? projectionHigh - projectionLow
        : null,
    projectedLow: projectionLow,
    projectedHigh: projectionHigh
  });

  const yDomain = buildYAxisDomain(
    [
      ...recentHistorical.map((point) => point.value),
      projectionStartValue,
      projectionValue,
      projectionLow ?? projectionValue,
      projectionHigh ?? projectionValue
    ].filter((value): value is number => Number.isFinite(value)),
    "data"
  );

  const measuredVsModelPct =
    typeof latest.value === "number" && Number.isFinite(latest.value)
      ? calculatePercentChange(projectedEstimate, latest.value)
      : null;
  const modelVsMeasuredRoundedEqual = measuredVsModelPct !== null && Math.round(measuredVsModelPct) === 0;
  const modelNowLabel =
    sameDoseDeltaPct === null
      ? tr("onbekend", "unknown")
      : `${sameDoseDeltaPct > 0 ? "+" : ""}${Math.round(sameDoseDeltaPct)}%`;
  const measuredVsModelLabel =
    measuredVsModelPct === null
      ? null
      : `${measuredVsModelPct > 0 ? "+" : ""}${formatAxisTick(measuredVsModelPct)}%`;
  const modelNowAndCloseNote = tr(
    "Zelfde dosis als je huidige protocol. Verandering vs nu is {delta}. De projectie blijft vlak vanaf je laatste meting.",
    "Same dose as your current protocol. Change vs now is {delta}. The projection stays flat from your latest measurement."
  ).replace("{delta}", modelNowLabel);
  const modelNowWithGapNote = tr(
    "Zelfde dosis als je huidige protocol. Verandering vs nu is {delta}; daarom blijft de projectie vlak op je laatste meting. Ter context kan een modelpunt {gap} afwijken door afnametiming, biologische ruis of model-fit.",
    "Same dose as your current protocol. Change vs now is {delta}; that is why the projection stays flat at your latest measurement. For context, a model point can still differ by {gap} due to sampling timing, biological noise, or model fitting."
  )
    .replace("{delta}", modelNowLabel)
    .replace("{gap}", measuredVsModelLabel ?? tr("onbekend", "unknown"));
  const projectionAxisLabel = `${formatAxisTick(projectionValue)} ${prediction.unit}`;

  return (
    <div className="rounded-lg border border-cyan-500/20 bg-slate-950/40 p-2">
      <p className="mb-1 text-[11px] text-slate-300">
        {tr("Volle lijn = gemeten. Stippellijn = modelinschatting bij dit dosis-scenario.", "Solid line = measured. Dotted line = model estimate for this dose scenario.")}
      </p>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={chartData} margin={{ left: 2, right: 110, top: 6, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="x"
            tickFormatter={(value) => {
              const date = String(value).split("__")[0];
              try {
                return format(parseISO(date), "dd MMM yy");
              } catch {
                return date;
              }
            }}
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            stroke="#334155"
            minTickGap={16}
          />
          <YAxis
            orientation="right"
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            tickFormatter={(value) => formatAxisTick(Number(value))}
            stroke="#334155"
            width={48}
            axisLine={false}
            tickLine={false}
            domain={yDomain ?? ["auto", "auto"]}
          />
          <Tooltip
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as
                | {
                    date: string;
                    actual: number | null;
                    projected: number | null;
                    projectedLow: number | null;
                    projectedHigh: number | null;
                  }
                | undefined;
              if (!active || !point) {
                return null;
              }
              const isProjectionPoint = point.actual === null && point.projected !== null;
              const value = isProjectionPoint ? point.projected : point.actual ?? point.projected;
              return (
                <div className="chart-tooltip-mini rounded-lg border border-slate-600 bg-slate-950/95 px-2.5 py-2 text-[11px] text-slate-200 shadow-lg">
                  <p className="font-medium text-slate-100">{formatDate(point.date)}</p>
                  <p className="mt-1 text-cyan-200">
                    {markerLabel}: {value === null ? "-" : `${formatAxisTick(value)} ${prediction.unit}`}
                  </p>
                  {isProjectionPoint ? (
                    <>
                      {!isSameDoseScenario && point.projectedLow !== null && point.projectedHigh !== null ? (
                        <p className="mt-1 text-[10px] text-amber-200">
                          {tr(
                            `Waarschijnlijk bereik: ${formatAxisTick(point.projectedLow)} - ${formatAxisTick(point.projectedHigh)} ${prediction.unit}`,
                            `Likely range: ${formatAxisTick(point.projectedLow)} - ${formatAxisTick(point.projectedHigh)} ${prediction.unit}`
                          )}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[10px] text-amber-200">
                        {isSameDoseScenario
                          ? tr(
                              "Vlakke projectie op je huidige protocoldosis, verankerd op je laatste meting.",
                              "Flat projection at your current protocol dose, anchored to your latest measurement."
                            )
                          : tr(
                              `Hypothetische modelwaarde bij ${formatAxisTick(projectedDose)} mg/week`,
                              `Hypothetical model value at ${formatAxisTick(projectedDose)} mg/week`
                            )}
                      </p>
                    </>
                  ) : null}
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="bandBase"
            stackId="projectionBand"
            stroke="none"
            fill="transparent"
            isAnimationActive={false}
            connectNulls
          />
          <Area
            type="monotone"
            dataKey="bandSpan"
            stackId="projectionBand"
            stroke="none"
            fill="#f59e0b"
            fillOpacity={0.16}
            isAnimationActive={false}
            connectNulls
          />
          <ReferenceLine
            y={projectionValue}
            stroke="#fb7185"
            strokeDasharray="3 4"
            strokeOpacity={0.55}
            ifOverflow="extendDomain"
            label={{
              value: projectionAxisLabel,
              position: "right",
              fill: "#fda4af",
              fontSize: 10,
              fontWeight: 600
            }}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#22d3ee"
            strokeWidth={2.2}
            dot={{ r: 2.8, fill: "#22d3ee", stroke: "#0f172a", strokeWidth: 1.1 }}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="projected"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={(props) => {
              const payload = props.payload as { x: string; projected?: number | null } | undefined;
              const isProjectionPoint = payload?.x === projectionKey;
              return (
                <g>
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={isProjectionPoint ? 4 : 0}
                    fill={isProjectionPoint ? "#fb7185" : "transparent"}
                    stroke="#0f172a"
                    strokeWidth={1.3}
                  />
                </g>
              );
            }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
      {isSameDoseScenario && (
        <p className="dose-projection-context-note mt-1.5 rounded-md border border-slate-700/60 bg-slate-900/35 px-2.5 py-2 text-[11px] text-slate-300">
          {modelVsMeasuredRoundedEqual
            ? modelNowAndCloseNote
            : modelNowWithGapNote}
        </p>
      )}
    </div>
  );
};

export default DoseProjectionChart;
