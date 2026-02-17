import { SlidersHorizontal } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import {
  DosePhaseBlock,
  MarkerAlert,
  MarkerSeriesPoint,
  MarkerTrendSummary,
  TrtStabilityResult
} from "../analytics";
import ComparisonChart from "../components/ComparisonChart";
import MarkerChartCard from "../components/MarkerChartCard";
import WelcomeHero from "../components/WelcomeHero";
import { stabilityColor } from "../chartHelpers";
import { getMarkerDisplayName, trLocale } from "../i18n";
import { AppLanguage, AppSettings, LabReport, TimeRangeKey } from "../types";

interface DashboardViewProps {
  reports: LabReport[];
  visibleReports: LabReport[];
  allMarkers: string[];
  primaryMarkers: string[];
  dosePhaseBlocks: DosePhaseBlock[];
  trendByMarker: Record<string, MarkerTrendSummary>;
  alertsByMarker: Record<string, MarkerAlert[]>;
  trtStability: TrtStabilityResult;
  settings: AppSettings;
  language: AppLanguage;
  isShareMode: boolean;
  samplingControlsEnabled: boolean;
  dashboardView: "primary" | "all";
  comparisonMode: boolean;
  leftCompareMarker: string;
  rightCompareMarker: string;
  timeRangeOptions: Array<[TimeRangeKey, string]>;
  samplingOptions: Array<[AppSettings["samplingFilter"], string]>;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onDashboardViewChange: (view: "primary" | "all") => void;
  onComparisonModeChange: (enabled: boolean) => void;
  onLeftCompareMarkerChange: (marker: string) => void;
  onRightCompareMarkerChange: (marker: string) => void;
  onExpandMarker: (marker: string) => void;
  onRenameMarker: (sourceCanonical: string) => void;
  chartPointsForMarker: (marker: string) => MarkerSeriesPoint[];
  markerPercentChange: (marker: string) => number | null;
  markerBaselineDelta: (marker: string) => number | null;
  onLoadDemo: () => void;
  onUploadClick: () => void;
}

const DashboardView = ({
  reports,
  visibleReports,
  allMarkers,
  primaryMarkers,
  dosePhaseBlocks,
  trendByMarker,
  alertsByMarker,
  trtStability,
  settings,
  language,
  isShareMode,
  samplingControlsEnabled,
  dashboardView,
  comparisonMode,
  leftCompareMarker,
  rightCompareMarker,
  timeRangeOptions,
  samplingOptions,
  onUpdateSettings,
  onDashboardViewChange,
  onComparisonModeChange,
  onLeftCompareMarkerChange,
  onRightCompareMarkerChange,
  onExpandMarker,
  onRenameMarker,
  chartPointsForMarker,
  markerPercentChange,
  markerBaselineDelta,
  onLoadDemo,
  onUploadClick
}: DashboardViewProps) => {
  const isNl = language === "nl";
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const hasReports = reports.length > 0;

  return (
    <section className="space-y-3 fade-in">
      {hasReports ? (
        <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {timeRangeOptions.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`rounded-md px-2.5 py-1 text-xs sm:text-sm ${
                  settings.timeRange === value ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-800 text-slate-300 hover:text-slate-100"
                }`}
                onClick={() => onUpdateSettings({ timeRange: value })}
              >
                {label}
              </button>
            ))}

            {settings.timeRange === "custom" ? (
              <div className="ml-0 flex flex-wrap items-center gap-2 sm:ml-2">
                <input
                  type="date"
                  className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm"
                  value={settings.customRangeStart}
                  onChange={(event) => onUpdateSettings({ customRangeStart: event.target.value })}
                />
                <input
                  type="date"
                  className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm"
                  value={settings.customRangeEnd}
                  onChange={(event) => onUpdateSettings({ customRangeEnd: event.target.value })}
                />
              </div>
            ) : null}

            <button
              type="button"
              className={`ml-auto rounded-md px-2.5 py-1 text-xs sm:text-sm ${
                comparisonMode ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800 text-slate-300"
              }`}
              onClick={() => onComparisonModeChange(!comparisonMode)}
            >
              <span className="inline-flex items-center gap-1">
                <SlidersHorizontal className="h-4 w-4" /> {tr("Multi-marker modus", "Multi-marker mode")}
              </span>
            </button>
            <button
              type="button"
              className="rounded-md bg-slate-800 px-2.5 py-1 text-xs text-slate-300 sm:text-sm"
              onClick={() => onUpdateSettings({ unitSystem: settings.unitSystem === "eu" ? "us" : "eu" })}
            >
              {tr("Eenheden", "Units")}: {settings.unitSystem.toUpperCase()}
            </button>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
              <input
                type="checkbox"
                checked={settings.showReferenceRanges}
                onChange={(event) => onUpdateSettings({ showReferenceRanges: event.target.checked })}
              />
              {tr("Referentiebereiken", "Reference ranges")}
            </label>
            <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
              <input
                type="checkbox"
                checked={settings.showAbnormalHighlights}
                onChange={(event) => onUpdateSettings({ showAbnormalHighlights: event.target.checked })}
              />
              {tr("Afwijkende waarden markeren", "Abnormal highlights")}
            </label>
            <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
              <input
                type="checkbox"
                checked={settings.showAnnotations}
                onChange={(event) => onUpdateSettings({ showAnnotations: event.target.checked })}
              />
              {tr("Dosisfase-overlay", "Dose-phase overlays")}
            </label>
            <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
              <input
                type="checkbox"
                checked={settings.showTrtTargetZone}
                onChange={(event) => onUpdateSettings({ showTrtTargetZone: event.target.checked })}
              />
              {tr("TRT-doelzone", "TRT optimal zone")}
            </label>
            <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
              <input
                type="checkbox"
                checked={settings.showLongevityTargetZone}
                onChange={(event) => onUpdateSettings({ showLongevityTargetZone: event.target.checked })}
              />
              {tr("Longevity-doelzone", "Longevity zone")}
            </label>
            <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
              <input
                type="checkbox"
                checked={settings.yAxisMode === "data"}
                onChange={(event) => onUpdateSettings({ yAxisMode: event.target.checked ? "data" : "zero" })}
              />
              {tr("Gebruik data-bereik Y-as", "Use data-range Y-axis")}
            </label>
          </div>

          {samplingControlsEnabled ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
                {tr("Meetmoment-filter", "Sampling filter")}
              </span>
              {samplingOptions.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`rounded-md px-2.5 py-1 text-xs sm:text-sm ${
                    settings.samplingFilter === value ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-800 text-slate-300 hover:text-slate-100"
                  }`}
                  onClick={() => onUpdateSettings({ samplingFilter: value })}
                >
                  {label}
                </button>
              ))}
              <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
                <input
                  type="checkbox"
                  checked={settings.compareToBaseline}
                  onChange={(event) => onUpdateSettings({ compareToBaseline: event.target.checked })}
                />
                {tr("Vergelijk met baseline", "Compare to baseline")}
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

      {hasReports && comparisonMode ? (
        <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-2.5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select
              className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
              value={leftCompareMarker}
              onChange={(event) => onLeftCompareMarkerChange(event.target.value)}
            >
              {allMarkers.map((marker) => (
                <option key={marker} value={marker}>
                  {getMarkerDisplayName(marker, language)}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
              value={rightCompareMarker}
              onChange={(event) => onRightCompareMarkerChange(event.target.value)}
            >
              {allMarkers.map((marker) => (
                <option key={marker} value={marker}>
                  {getMarkerDisplayName(marker, language)}
                </option>
              ))}
            </select>
            <label className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-2 text-xs text-slate-300 sm:text-sm">
              <input
                type="checkbox"
                checked={settings.comparisonScale === "normalized"}
                onChange={(event) => onUpdateSettings({ comparisonScale: event.target.checked ? "normalized" : "absolute" })}
              />
              {tr("Genormaliseerde schaal (0-100%)", "Normalized scale (0-100%)")}
            </label>
          </div>

          <ComparisonChart
            leftMarker={leftCompareMarker}
            rightMarker={rightCompareMarker}
            reports={visibleReports}
            settings={settings}
            language={language}
          />
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-2.5">
        {hasReports ? (
          <>
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-sm ${
                  dashboardView === "primary" ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-800 text-slate-300"
                }`}
                onClick={() => onDashboardViewChange("primary")}
              >
                {tr("Primaire markers", "Primary markers")}
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-sm ${
                  dashboardView === "all" ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-800 text-slate-300"
                }`}
                onClick={() => onDashboardViewChange("all")}
              >
                {tr("Alle markers", "All markers")}
              </button>
            </div>

            {dashboardView === "primary" ? <div className="mb-1" /> : null}
          </>
        ) : null}

        {reports.length === 0 && !isShareMode ? (
          <WelcomeHero language={language} onLoadDemo={onLoadDemo} onUploadClick={onUploadClick} />
        ) : visibleReports.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 py-14 text-center">
            <p className="text-base font-semibold text-slate-200">{tr("Geen data in huidige filter", "No data in current filter")}</p>
            <p className="mt-1 text-sm text-slate-400">
              {samplingControlsEnabled
                ? tr("Pas tijdsbereik of meetmoment-filter aan om data te tonen.", "Change time range or sampling filter to show data.")
                : tr("Pas het tijdsbereik aan om data te tonen.", "Change time range to show data.")}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(dashboardView === "primary" ? primaryMarkers : allMarkers).map((marker, index) => {
              const points = chartPointsForMarker(marker);
              return (
                <MarkerChartCard
                  key={marker}
                  marker={marker}
                  points={points}
                  colorIndex={index}
                  settings={settings}
                  language={language}
                  phaseBlocks={dosePhaseBlocks}
                  alertCount={alertsByMarker[marker]?.length ?? 0}
                  trendSummary={trendByMarker[marker] ?? null}
                  percentChange={markerPercentChange(marker)}
                  baselineDelta={markerBaselineDelta(marker)}
                  isCalculatedMarker={points.length > 0 && points.every((point) => point.isCalculated)}
                  onOpenLarge={() => onExpandMarker(marker)}
                  onRenameMarker={onRenameMarker}
                />
              );
            })}
          </div>
        )}

        {hasReports && dashboardView === "primary" ? (
          <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800/70 p-3 text-left">
            <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center">
              <div className="relative mx-auto h-28 w-28">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "score", value: trtStability.score ?? 0 },
                        { name: "rest", value: 100 - (trtStability.score ?? 0) }
                      ]}
                      dataKey="value"
                      innerRadius={34}
                      outerRadius={48}
                      stroke="none"
                      startAngle={90}
                      endAngle={-270}
                    >
                      <Cell fill={stabilityColor(trtStability.score)} />
                      <Cell fill="#334155" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-semibold text-slate-100">{trtStability.score === null ? "-" : trtStability.score}</span>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">TRT Stability Index</p>
                  <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs text-cyan-200">
                    {trtStability.score === null ? "-" : `${trtStability.score}`}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-300">
                  {tr(
                    "Dit is een rust-score van je kern TRT-markers over tijd (Testosteron, Estradiol, Hematocriet, SHBG).",
                    "This is a steadiness score of your core TRT markers over time (Testosterone, Estradiol, Hematocrit, SHBG)."
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {tr(
                    "Belangrijk: het zegt niets over ‘goed’ of ‘slecht’, alleen hoe stabiel je patroon is.",
                    "Important: it does not mean 'good' or 'bad'; it only reflects how stable your pattern is."
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {tr(
                    "Snelle interpretatie: 80-100 = vrij stabiel, 60-79 = matig stabiel, <60 = duidelijk wisselend.",
                    "Quick interpretation: 80-100 = fairly stable, 60-79 = moderately stable, <60 = clearly variable."
                  )}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default DashboardView;
