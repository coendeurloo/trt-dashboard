import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, SlidersHorizontal } from "lucide-react";
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
import { getMarkerDisplayName, t, trLocale } from "../i18n";
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
  outOfRangeCount: number;
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
  isProcessing: boolean;
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  tooltip?: string;
  disabled?: boolean;
}

const ToggleSwitch = ({ checked, onChange, label, tooltip, disabled = false }: ToggleSwitchProps) => (
  <label
    className={`group relative inline-flex items-center gap-2 rounded-md px-2.5 py-1.25 text-xs sm:text-sm ${
      disabled ? "cursor-not-allowed bg-slate-800/60 text-slate-500" : "cursor-pointer bg-slate-800 text-slate-300 hover:text-slate-100"
    }`}
  >
    <button
      type="button"
      aria-pressed={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onChange(!checked);
        }
      }}
      className={`relative inline-flex h-4 w-7 shrink-0 rounded-full border transition-colors duration-200 ${
        checked ? "border-cyan-500/60 bg-cyan-500/20" : "border-slate-600 bg-slate-700"
      }`}
    >
      <span
        className={`absolute top-0.5 h-3 w-3 rounded-full transition-transform duration-200 ${
          checked ? "translate-x-3 bg-cyan-400" : "translate-x-0.5 bg-slate-500"
        }`}
      />
    </button>
    {label}
    {tooltip ? (
      <span className="chart-tooltip pointer-events-none absolute left-0 top-full z-40 mt-1 w-72 rounded-xl border border-slate-600 bg-slate-950/95 p-2.5 text-[11px] leading-relaxed text-slate-200 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
        {tooltip}
      </span>
    ) : null}
  </label>
);

const DashboardView = ({
  reports,
  visibleReports,
  allMarkers,
  primaryMarkers,
  dosePhaseBlocks,
  trendByMarker,
  alertsByMarker,
  trtStability,
  outOfRangeCount,
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
  onUploadClick,
  isProcessing
}: DashboardViewProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const hasReports = reports.length > 0;
  const hasSingleReport = reports.length === 1;
  const firstReportVisible = hasSingleReport && visibleReports.length > 0;
  const firstReportFilteredOut = hasSingleReport && visibleReports.length === 0;
  const [showChartOptions, setShowChartOptions] = useState(outOfRangeCount > 0);

  useEffect(() => {
    if (outOfRangeCount > 0) {
      setShowChartOptions(true);
    }
  }, [outOfRangeCount]);

  const referenceRangesTooltip = tr(
    "Toont per marker het normale referentiebereik als band in de grafiek.",
    "Shows each marker's normal reference range as a band on the chart."
  );
  const abnormalHighlightsTooltip = tr(
    "Markeert met kleur wanneer waarden onder of boven het referentiebereik vallen.",
    "Highlights values in color when they fall below or above the reference range."
  );
  const dosePhaseOverlaysTooltip = tr(
    "Toont duidelijke faseblokken en grenslijnen per protocolfase, zodat je veranderingen direct aan een fase kunt koppelen.",
    "Shows clear phase blocks and boundaries per protocol phase, so you can link marker changes to a phase at a glance."
  );
  const trtOptimalZoneTooltip = tr(
    "Toont de ingestelde doelzone voor markers die daar een bekende streefband voor hebben.",
    "Shows the configured optimal target zone for markers that have a known target band."
  );
  const longevityZoneTooltip = tr(
    "Toont een conservatievere gezondheidszone gericht op lange termijn risicobeperking.",
    "Shows a more conservative health zone aimed at long-term risk reduction."
  );
  const yAxisDataRangeTooltip = tr(
    "Past de Y-as aan op het bereik van je data. Uit = Y-as start op nul voor betere absolute vergelijking.",
    "Scales the Y-axis to your data range. Off = Y-axis starts at zero for better absolute comparison."
  );
  const showAllTimeForFirstReport = () => {
    onUpdateSettings({
      timeRange: "all",
      samplingFilter: "all",
      compareToBaseline: false
    });
  };
  const hasPhaseBlocks = dosePhaseBlocks.length > 0;
  const overlayFocusEnabled = settings.showAnnotations;

  return (
    <section className="space-y-3 fade-in">
      {hasReports ? (
        <div className="flex flex-wrap gap-4 rounded-2xl border border-slate-700/70 bg-slate-900/60 px-4 py-3 text-sm">
          <span className="text-slate-400">
            {t(language, "reports")}: <strong className="text-slate-100">{reports.length}</strong>
          </span>
          <span className="text-slate-400">
            {t(language, "markersTracked")}: <strong className="text-slate-100">{allMarkers.length}</strong>
          </span>
          <span className="text-slate-400">
            {t(language, "outOfRange")}: <strong className="text-amber-300">{outOfRangeCount}</strong>
          </span>
          <span className="text-slate-400">
            {t(language, "trtStabilityShort")}: <strong className="text-cyan-200">{trtStability.score ?? "—"}</strong>
          </span>
        </div>
      ) : null}

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

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowChartOptions((current) => !current)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition ${
                showChartOptions ? "bg-slate-700 text-slate-100" : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {tr("Grafiekopties", "Chart options")}
              {showChartOptions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>

          {showChartOptions ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <ToggleSwitch
                checked={settings.showReferenceRanges}
                onChange={(checked) => onUpdateSettings({ showReferenceRanges: checked })}
                label={tr("Referentiebereiken", "Reference ranges")}
                tooltip={referenceRangesTooltip}
                disabled={overlayFocusEnabled}
              />
              <ToggleSwitch
                checked={settings.showAbnormalHighlights}
                onChange={(checked) => onUpdateSettings({ showAbnormalHighlights: checked })}
                label={tr("Afwijkende waarden markeren", "Abnormal highlights")}
                tooltip={abnormalHighlightsTooltip}
              />
              <ToggleSwitch
                checked={settings.showAnnotations}
                onChange={(checked) =>
                  onUpdateSettings(
                    checked
                      ? {
                          showAnnotations: true,
                          showReferenceRanges: false,
                          showTrtTargetZone: false,
                          showLongevityTargetZone: false
                        }
                      : { showAnnotations: false }
                  )
                }
                label={tr("Protocolfases", "Protocol phases")}
                tooltip={dosePhaseOverlaysTooltip}
                disabled={!hasPhaseBlocks}
              />
              <ToggleSwitch
                checked={settings.showTrtTargetZone}
                onChange={(checked) => onUpdateSettings({ showTrtTargetZone: checked })}
                label={tr("Doelzone", "Optimal zone")}
                tooltip={trtOptimalZoneTooltip}
                disabled={overlayFocusEnabled}
              />
              <ToggleSwitch
                checked={settings.showLongevityTargetZone}
                onChange={(checked) => onUpdateSettings({ showLongevityTargetZone: checked })}
                label={tr("Longevity-doelzone", "Longevity zone")}
                tooltip={longevityZoneTooltip}
                disabled={overlayFocusEnabled}
              />
              <ToggleSwitch
                checked={settings.yAxisMode === "data"}
                onChange={(checked) => onUpdateSettings({ yAxisMode: checked ? "data" : "zero" })}
                label={tr("Gebruik data-bereik Y-as", "Use data-range Y-axis")}
                tooltip={yAxisDataRangeTooltip}
              />
            </div>
          ) : null}
          {showChartOptions && !hasPhaseBlocks ? (
            <p className="mt-2 text-xs text-slate-500">
              {tr(
                "Geen protocolfase-overlays in dit datumbereik. Voeg meer rapporten toe of kies een ruimer bereik.",
                "No protocol phase overlays in this date range. Add more reports or choose a wider range."
              )}
            </p>
          ) : null}
          {showChartOptions && overlayFocusEnabled ? (
            <p className="mt-2 text-xs text-cyan-300/90">
              {tr(
                "Protocolfases-focus staat aan. Referentiebereik en doelzones zijn tijdelijk verborgen voor een heldere fasevergelijking.",
                "Protocol phases focus is on. Reference ranges and target zones are temporarily hidden for a clearer phase comparison."
              )}
            </p>
          ) : null}

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

            {firstReportVisible ? (
              <div className="mb-3 rounded-xl border border-cyan-500/35 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p>
                    {tr(
                      "Sterke start: je eerste rapport staat erin. Voeg nog 1 rapport toe om trendgrafieken en vergelijkingen over tijd te zien.",
                      "Great start: your first report is saved. Add one more report to unlock trend charts and over-time comparisons."
                    )}
                  </p>
                  {!isShareMode ? (
                    <button
                      type="button"
                      onClick={onUploadClick}
                      disabled={isProcessing}
                      className={`rounded-md border border-cyan-400/50 bg-slate-900/70 px-3 py-1.5 text-xs font-medium text-cyan-100 sm:text-sm ${
                        isProcessing ? "cursor-not-allowed opacity-70" : "hover:border-cyan-300 hover:text-cyan-50"
                      }`}
                    >
                      {isProcessing ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {tr("Bezig met upload...", "Uploading...")}
                        </span>
                      ) : (
                        tr("Upload tweede rapport", "Upload second report")
                      )}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {reports.length === 0 && !isShareMode ? (
          <WelcomeHero language={language} onLoadDemo={onLoadDemo} onUploadClick={onUploadClick} />
        ) : visibleReports.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 py-14 text-center">
            {firstReportFilteredOut ? (
              <div className="mx-auto max-w-xl px-4">
                <p className="text-base font-semibold text-slate-100">{tr("Eerste rapport opgeslagen", "First report saved")}</p>
                <p className="mt-1 text-sm text-slate-300">
                  {tr(
                    "Je eerste rapport is opgeslagen, maar valt buiten je huidige filter. Zet je bereik op ‘All time’ of upload een tweede rapport om trends te zien.",
                    "Your first report is saved, but it falls outside your current filter. Set your range to All time or upload a second report to start seeing trends."
                  )}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={showAllTimeForFirstReport}
                    className="rounded-md border border-slate-500 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-cyan-400 hover:text-cyan-200 sm:text-sm"
                  >
                    {tr("Toon alles", "Show all time")}
                  </button>
                  {!isShareMode ? (
                    <button
                      type="button"
                      onClick={onUploadClick}
                      disabled={isProcessing}
                      className={`rounded-md border border-cyan-400/50 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-100 sm:text-sm ${
                        isProcessing ? "cursor-not-allowed opacity-70" : "hover:border-cyan-300 hover:text-cyan-50"
                      }`}
                    >
                      {isProcessing ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {tr("Bezig met upload...", "Uploading...")}
                        </span>
                      ) : (
                        tr("Upload tweede rapport", "Upload second report")
                      )}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                <p className="text-base font-semibold text-slate-200">{tr("Geen data in huidige filter", "No data in current filter")}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {samplingControlsEnabled
                    ? tr("Pas tijdsbereik of meetmoment-filter aan om data te tonen.", "Change time range or sampling filter to show data.")
                    : tr("Pas het tijdsbereik aan om data te tonen.", "Change time range to show data.")}
                </p>
                {!isShareMode ? (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={onUploadClick}
                      disabled={isProcessing}
                      className={`rounded-md border border-cyan-400/50 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-100 sm:text-sm ${
                        isProcessing ? "cursor-not-allowed opacity-70" : "hover:border-cyan-300 hover:text-cyan-50"
                      }`}
                    >
                      {isProcessing ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {tr("Bezig met upload...", "Uploading...")}
                        </span>
                      ) : (
                        tr("Of upload nog een PDF", "Or, upload another PDF")
                      )}
                    </button>
                  </div>
                ) : null}
              </>
            )}
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
                  <p className="text-sm font-semibold text-slate-100">{tr("Stabiliteitsindex", "Stability Index")}</p>
                  <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs text-cyan-200">
                    {trtStability.score === null ? "-" : `${trtStability.score}`}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-300">
                  {tr(
                    "Dit is een rust-score van je kern hormoonmarkers over tijd (Testosteron, Estradiol, Hematocriet, SHBG).",
                    "This is a steadiness score of your core hormone markers over time (Testosterone, Estradiol, Hematocrit, SHBG)."
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
