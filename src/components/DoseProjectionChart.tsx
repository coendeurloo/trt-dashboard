import { addDays, format, parseISO } from "date-fns";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DosePrediction, MarkerSeriesPoint, buildMarkerSeries } from "../analytics";
import { AppLanguage, AppSettings, LabReport } from "../types";
import { getMarkerDisplayName } from "../i18n";
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
}

const DoseProjectionChart = ({ prediction, reports, settings, language, targetDose, targetEstimate }: DoseProjectionChartProps) => {
  const markerLabel = getMarkerDisplayName(prediction.marker, language);
  const projectedDose = typeof targetDose === "number" && Number.isFinite(targetDose) ? targetDose : prediction.suggestedDose;
  const projectedEstimate =
    typeof targetEstimate === "number" && Number.isFinite(targetEstimate) ? targetEstimate : prediction.suggestedEstimate;
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

  const chartData: Array<{ x: string; date: string; actual: number | null; projected: number | null }> = recentHistorical.map((point, index) => ({
    x: point.key,
    date: point.date,
    actual: point.value,
    projected: index === recentHistorical.length - 1 ? point.value : null
  }));

  chartData.push({
    x: projectionKey,
    date: projectionDateIso,
    actual: null,
    projected: projectedEstimate
  });

  const yDomain = buildYAxisDomain(
    [
      ...recentHistorical.map((point) => point.value),
      projectedEstimate
    ].filter((value): value is number => Number.isFinite(value)),
    "data"
  );

  return (
    <div className="rounded-lg border border-cyan-500/20 bg-slate-950/40 p-2">
      <p className="mb-1 text-[11px] text-slate-300">
        {language === "nl"
          ? "Volle lijn = gemeten. Stippellijn = modelinschatting bij dit dosis-scenario."
          : "Solid line = measured. Dotted line = model estimate for this dose scenario."}
      </p>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={chartData} margin={{ left: 2, right: 6, top: 6, bottom: 4 }}>
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
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            tickFormatter={(value) => formatAxisTick(Number(value))}
            stroke="#334155"
            width={40}
            domain={yDomain ?? ["auto", "auto"]}
          />
          <Tooltip
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as { date: string; actual: number | null; projected: number | null } | undefined;
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
                    <p className="mt-1 text-[10px] text-amber-200">
                      {language === "nl"
                        ? `Hypothetische modelwaarde bij ${formatAxisTick(projectedDose)} mg/week`
                        : `Hypothetical model value at ${formatAxisTick(projectedDose)} mg/week`}
                    </p>
                  ) : null}
                </div>
              );
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
              const payload = props.payload as { x: string } | undefined;
              const isProjectionPoint = payload?.x === projectionKey;
              return (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={isProjectionPoint ? 4 : 0}
                  fill={isProjectionPoint ? "#fb7185" : "transparent"}
                  stroke="#0f172a"
                  strokeWidth={1.3}
                />
              );
            }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DoseProjectionChart;
