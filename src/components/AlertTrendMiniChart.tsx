import { format, parseISO } from "date-fns";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MarkerSeriesPoint } from "../analytics";
import { AppLanguage } from "../types";
import { getMarkerDisplayName } from "../i18n";
import { formatDate } from "../utils";
import { buildYAxisDomain, formatAxisTick } from "../chartHelpers";

export interface AlertTrendMiniChartProps {
  marker: string;
  points: MarkerSeriesPoint[];
  highlightDate?: string;
  language: AppLanguage;
  height?: number;
}

const AlertTrendMiniChart = ({ marker, points, highlightDate, language, height = 110 }: AlertTrendMiniChartProps) => {
  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-700 text-xs text-slate-500" style={{ height }}>
        {language === "nl" ? "Geen trenddata" : "No trend data"}
      </div>
    );
  }

  const markerLabel = getMarkerDisplayName(marker, language);
  const yDomain = buildYAxisDomain(
    points.map((point) => point.value),
    "data"
  );

  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-950/40 p-1.5" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ left: 0, right: 0, top: 6, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="key"
            tickFormatter={(value: string) => {
              const dateString = String(value).split("__")[0];
              try {
                return format(parseISO(dateString), "dd MMM yy");
              } catch {
                return dateString;
              }
            }}
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            stroke="#334155"
            minTickGap={16}
          />
          <YAxis hide domain={yDomain ?? ["auto", "auto"]} />
          <Tooltip
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as MarkerSeriesPoint | undefined;
              if (!active || !point) {
                return null;
              }
              return (
                <div className="chart-tooltip-mini rounded-lg border border-slate-600 bg-slate-950/95 px-2.5 py-2 text-[11px] text-slate-200 shadow-lg">
                  <p className="font-medium text-slate-100">{formatDate(point.date)}</p>
                  <p className="mt-1 text-cyan-200">
                    {markerLabel}: {formatAxisTick(point.value)} {point.unit}
                  </p>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#22d3ee"
            strokeWidth={2.1}
            dot={(props) => {
              const payload = props.payload as MarkerSeriesPoint | undefined;
              const isHighlighted = Boolean(highlightDate && payload?.date === highlightDate);
              return (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={isHighlighted ? 4 : 2.5}
                  fill={isHighlighted ? "#fb7185" : "#22d3ee"}
                  stroke="#0f172a"
                  strokeWidth={1.2}
                />
              );
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default AlertTrendMiniChart;
