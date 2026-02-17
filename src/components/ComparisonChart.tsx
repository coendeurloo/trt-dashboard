import { useMemo } from "react";
import { formatDate } from "../utils";
import { AppLanguage, AppSettings, LabReport } from "../types";
import { convertBySystem } from "../unitConversion";
import { buildYAxisDomain, formatAxisTick } from "../chartHelpers";
import { getMarkerDisplayName, trLocale } from "../i18n";
import { motion } from "framer-motion";
import { CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { parseISO } from "date-fns";

export interface ComparisonChartProps {
  leftMarker: string;
  rightMarker: string;
  reports: LabReport[];
  settings: AppSettings;
  language: AppLanguage;
}

const ComparisonChart = ({ leftMarker, rightMarker, reports, settings, language }: ComparisonChartProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const leftLabel = getMarkerDisplayName(leftMarker, language);
  const rightLabel = getMarkerDisplayName(rightMarker, language);
  const data = useMemo(() => {
    const selectMarkerValue = (report: LabReport, markerName: string): number | null => {
      const matches = report.markers.filter((marker) => marker.canonicalMarker === markerName);
      if (matches.length === 0) {
        return null;
      }

      const best = matches.reduce((current, next) => (next.confidence > current.confidence ? next : current));
      return convertBySystem(best.canonicalMarker, best.value, best.unit, settings.unitSystem).value;
    };

    return reports
      .map((report) => {
        const left = selectMarkerValue(report, leftMarker);
        const right = selectMarkerValue(report, rightMarker);
        if (left === null && right === null) {
          return null;
        }

        return {
          x: `${report.testDate}__${report.id}`,
          date: report.testDate,
          createdAt: report.createdAt,
          left,
          right
        };
      })
      .filter(
        (
          point
        ): point is {
          x: string;
          date: string;
          createdAt: string;
          left: number | null;
          right: number | null;
        } => point !== null
      )
      .sort((a, b) => {
        const byDate = parseISO(a.date).getTime() - parseISO(b.date).getTime();
        if (byDate !== 0) {
          return byDate;
        }
        return parseISO(a.createdAt).getTime() - parseISO(b.createdAt).getTime();
      });
  }, [leftMarker, rightMarker, reports, settings.unitSystem]);

  const normalizedData = useMemo(() => {
    if (settings.comparisonScale !== "normalized") {
      return data;
    }

    const leftValues = data.map((point) => point.left).filter((value): value is number => value !== null);
    const rightValues = data.map((point) => point.right).filter((value): value is number => value !== null);
    const leftMin = leftValues.length > 0 ? Math.min(...leftValues) : null;
    const leftMax = leftValues.length > 0 ? Math.max(...leftValues) : null;
    const rightMin = rightValues.length > 0 ? Math.min(...rightValues) : null;
    const rightMax = rightValues.length > 0 ? Math.max(...rightValues) : null;

    const normalize = (value: number | null, min: number | null, max: number | null): number | null => {
      if (value === null || min === null || max === null) {
        return null;
      }
      if (Math.abs(max - min) < 0.000001) {
        return 50;
      }
      return ((value - min) / (max - min)) * 100;
    };

    return data.map((point) => ({
      ...point,
      leftNorm: normalize(point.left, leftMin, leftMax),
      rightNorm: normalize(point.right, rightMin, rightMax)
    }));
  }, [data, settings.comparisonScale]);

  const leftDomain = useMemo(() => {
    if (settings.comparisonScale === "normalized") {
      return [0, 100] as [number, number];
    }
    return buildYAxisDomain(
      data.map((point) => point.left).filter((value): value is number => value !== null),
      settings.yAxisMode
    );
  }, [data, settings.yAxisMode, settings.comparisonScale]);

  const rightDomain = useMemo(() => {
    if (settings.comparisonScale === "normalized") {
      return [0, 100] as [number, number];
    }
    return buildYAxisDomain(
      data.map((point) => point.right).filter((value): value is number => value !== null),
      settings.yAxisMode
    );
  }, [data, settings.yAxisMode, settings.comparisonScale]);

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/50 p-4">
        <h3 className="text-sm font-semibold text-slate-100">{tr("Vergelijkingsmodus", "Comparison mode")}</h3>
        <p className="mt-2 text-sm text-slate-400">
          {tr("Geen overlappende data in gekozen bereik.", "No overlapping data in selected range.")}
        </p>
      </div>
    );
  }

  return (
    <motion.div
      layout
      className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 shadow-soft"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h3 className="mb-2 text-sm font-semibold text-slate-100">
        {tr("Vergelijkingsmodus", "Comparison mode")}{" "}
        {settings.comparisonScale === "normalized" ? tr("(genormaliseerd 0-100%)", "(normalized 0-100%)") : ""}
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={normalizedData} margin={{ left: 2, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="x"
            tickFormatter={(value) => {
              const date = String(value).split("__")[0];
              return formatDate(date);
            }}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            stroke="#334155"
            minTickGap={18}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickFormatter={(value) => formatAxisTick(Number(value))}
            stroke="#334155"
            width={45}
            domain={leftDomain ?? ["auto", "auto"]}
          />
          {settings.comparisonScale === "normalized" ? null : (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickFormatter={(value) => formatAxisTick(Number(value))}
              stroke="#334155"
              width={45}
              domain={rightDomain ?? ["auto", "auto"]}
            />
          )}
          <Tooltip
            contentStyle={{
              background: "#0b1220",
              border: "1px solid #334155",
              borderRadius: "12px"
            }}
            labelFormatter={(value) => {
              const date = String(value).split("__")[0];
              return formatDate(date);
            }}
            formatter={(value, name, item) => {
              const payload = item?.payload as { left: number | null; right: number | null } | undefined;
              if (settings.comparisonScale === "normalized") {
                const raw = name === leftLabel ? payload?.left : payload?.right;
                const rawSuffix = raw === null || raw === undefined ? "-" : ` | raw ${formatAxisTick(raw)}`;
                return [`${formatAxisTick(Number(value))}%${rawSuffix}`, name];
              }
              return [formatAxisTick(Number(value)), name];
            }}
          />
          <Legend />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey={settings.comparisonScale === "normalized" ? "leftNorm" : "left"}
            name={leftLabel}
            stroke="#22d3ee"
            strokeWidth={2.4}
          />
          <Line
            yAxisId={settings.comparisonScale === "normalized" ? "left" : "right"}
            type="monotone"
            dataKey={settings.comparisonScale === "normalized" ? "rightNorm" : "right"}
            name={rightLabel}
            stroke="#f472b6"
            strokeWidth={2.4}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

export default ComparisonChart;
