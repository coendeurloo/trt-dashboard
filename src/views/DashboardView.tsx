import { useEffect, useRef, useState } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { Check, ChevronDown, ChevronUp, Loader2, SlidersHorizontal, X } from "lucide-react";
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
import { buildDashboardPresetPatch, inferDashboardChartPresetFromSettings, stabilityColor } from "../chartHelpers";
import { getMarkerDisplayName, trLocale } from "../i18n";
import { AppLanguage, AppSettings, DashboardViewMode, LabReport, PersonalInfo, SymptomCheckIn, TimeRangeKey, UserProfile } from "../types";

interface DashboardViewProps {
  personalInfo: PersonalInfo;
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
  dashboardMode: DashboardViewMode;
  leftCompareMarker: string;
  rightCompareMarker: string;
  timeRangeOptions: Array<[TimeRangeKey, string]>;
  samplingOptions: Array<[AppSettings["samplingFilter"], string]>;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onDashboardViewChange: (view: "primary" | "all") => void;
  onDashboardModeChange: (mode: DashboardViewMode) => void;
  onLeftCompareMarkerChange: (marker: string) => void;
  onRightCompareMarkerChange: (marker: string) => void;
  onExpandMarker: (marker: string) => void;
  onOpenMarkerAlerts: (marker: string) => void;
  chartPointsForMarker: (marker: string) => MarkerSeriesPoint[];
  markerPercentChange: (marker: string) => number | null;
  markerBaselineDelta: (marker: string) => number | null;
  cloudConfigured: boolean;
  onLoadDemo: (profile: UserProfile) => void;
  onUploadClick: () => void;
  onOpenCloudAuth: (view: "signin" | "signup") => void;
  isProcessing: boolean;
  checkIns: SymptomCheckIn[];
  onNavigateToCheckIns: () => void;
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
    className={`group relative inline-flex items-center gap-2 text-xs sm:text-sm ${
      disabled ? "cursor-not-allowed text-slate-500" : "cursor-pointer text-slate-300 hover:text-slate-100"
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
  personalInfo,
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
  dashboardMode,
  leftCompareMarker,
  rightCompareMarker,
  timeRangeOptions,
  samplingOptions,
  onUpdateSettings,
  onDashboardViewChange,
  onDashboardModeChange,
  onLeftCompareMarkerChange,
  onRightCompareMarkerChange,
  onExpandMarker,
  onOpenMarkerAlerts,
  chartPointsForMarker,
  markerPercentChange,
  markerBaselineDelta,
  cloudConfigured,
  onLoadDemo,
  onUploadClick,
  onOpenCloudAuth,
  isProcessing,
  checkIns,
  onNavigateToCheckIns
}: DashboardViewProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const unitSystemLabel = (unitSystem: "eu" | "us"): string =>
    unitSystem === "eu" ? tr("SI (metrisch)", "SI (Metric)") : tr("Conventioneel", "Conventional");
  const hasReports = reports.length > 0;
  const isGeneralProfile = settings.userProfile === "health" || settings.userProfile === "biohacker";

  // Wellbeing nudge: show when no check-ins or last one was ≥7 days ago
  const lastCheckIn = checkIns.length > 0
    ? checkIns.reduce((a, b) => a.date > b.date ? a : b)
    : null;
  const daysSinceCheckIn = lastCheckIn
    ? differenceInDays(new Date(), parseISO(lastCheckIn.date))
    : null;
  const showWellbeingNudge = !isShareMode && (daysSinceCheckIn === null || daysSinceCheckIn >= 7);
  const hasSingleReport = reports.length === 1;
  const firstReportVisible = hasSingleReport && visibleReports.length > 0;
  const firstReportFilteredOut = hasSingleReport && visibleReports.length === 0;
  const [showChartSettings, setShowChartSettings] = useState(false);
  const [showPrimaryMarkerPicker, setShowPrimaryMarkerPicker] = useState(false);
  const chartSettingsRef = useRef<HTMLDivElement | null>(null);

  const referenceRangesTooltip = tr(
    "Toont per marker het normale referentiebereik als band in de grafiek.",
    "Shows each marker's normal reference range as a band on the chart."
  );
  const abnormalHighlightsTooltip = tr(
    "Markeert punten die onder of boven het referentiebereik vallen.",
    "Highlights points that fall below or above the reference range."
  );
  const dosePhaseOverlaysTooltip = tr(
    "Toont duidelijke faseblokken en grenslijnen per protocolfase, zodat je veranderingen direct aan een fase kunt koppelen.",
    "Shows clear phase blocks and boundaries per protocol phase, so you can link marker changes to a phase at a glance."
  );
  const trtTargetZoneTooltip = isGeneralProfile
    ? tr(
        "Toont de streefzone voor markers met een bekende doelband.",
        "Shows the target zone for markers with a known target band."
      )
    : tr(
        "Toont de TRT-streefzone voor markers met een bekende doelband.",
        "Shows the TRT target zone for markers with a known target band."
      );
  const longevityZoneTooltip = tr(
    "Toont een conservatievere streefzone gericht op lange termijn risicobeperking.",
    "Shows a more conservative target zone aimed at long-term risk reduction."
  );
  const yAxisDataRangeTooltip = tr(
    "Past de Y-as aan op het bereik van je data. Uit = Y-as start op nul voor betere absolute vergelijking.",
    "Fits the Y-axis to your data range. Off = Y-axis starts at zero for better absolute comparison."
  );
  const showAllTimeForFirstReport = () => {
    onUpdateSettings({
      timeRange: "all",
      samplingFilter: "all",
      compareToBaseline: false
    });
  };
  const hasPhaseBlocks = dosePhaseBlocks.length > 0;
  const isCompareMode = dashboardMode === "compare2";
  const currentPreset = settings.dashboardChartPreset;
  const selectedPrimaryMarkers = settings.primaryMarkersSelection.length > 0
    ? settings.primaryMarkersSelection.filter((marker) => allMarkers.includes(marker))
    : primaryMarkers.filter((marker) => allMarkers.includes(marker));

  const togglePrimaryMarkerSelection = (marker: string) => {
    const currentSelection = selectedPrimaryMarkers;
    if (currentSelection.includes(marker)) {
      if (currentSelection.length <= 1) {
        return;
      }
      onUpdateSettings({
        primaryMarkersSelection: currentSelection.filter((entry) => entry !== marker)
      });
      return;
    }
    onUpdateSettings({
      primaryMarkersSelection: [...currentSelection, marker]
    });
  };

  const updateChartVisualSettings = (
    patch: Partial<
      Pick<
        AppSettings,
        "showReferenceRanges" | "showAbnormalHighlights" | "showAnnotations" | "showTrtTargetZone" | "showLongevityTargetZone" | "yAxisMode"
      >
    >
  ) => {
    const nextVisualSettings = {
      showReferenceRanges: patch.showReferenceRanges ?? settings.showReferenceRanges,
      showAbnormalHighlights: patch.showAbnormalHighlights ?? settings.showAbnormalHighlights,
      showAnnotations: patch.showAnnotations ?? settings.showAnnotations,
      showTrtTargetZone: patch.showTrtTargetZone ?? settings.showTrtTargetZone,
      showLongevityTargetZone: patch.showLongevityTargetZone ?? settings.showLongevityTargetZone,
      yAxisMode: patch.yAxisMode ?? settings.yAxisMode
    };
    const inferredPreset = inferDashboardChartPresetFromSettings(nextVisualSettings);
    onUpdateSettings({
      ...patch,
      dashboardChartPreset: inferredPreset
    });
  };

  const applyPreset = (preset: "clinical" | "protocol" | "minimal") => {
    onUpdateSettings(buildDashboardPresetPatch(preset));
  };

  useEffect(() => {
    if (!showChartSettings) {
      return;
    }
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!chartSettingsRef.current) {
        return;
      }
      const target = event.target;
      if (target instanceof Node && !chartSettingsRef.current.contains(target)) {
        setShowChartSettings(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [showChartSettings]);

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return tr("Goedemorgen", "Good morning");
    if (hour < 18) return tr("Goedemiddag", "Good afternoon");
    return tr("Goedenavond", "Good evening");
  })();

  return (
    <section className="space-y-4 fade-in">
      {/* ── Greeting + summary row ── */}
      {hasReports && personalInfo.name ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-100">
              {greeting}, {personalInfo.name.split(" ")[0]}
            </h2>
            <p className="mt-0.5 text-sm text-slate-400">
              {outOfRangeCount > 0
                ? tr(
                    `Je hebt ${outOfRangeCount} marker${outOfRangeCount === 1 ? "" : "s"} buiten bereik.`,
                    `You have ${outOfRangeCount} marker${outOfRangeCount === 1 ? "" : "s"} out of range.`
                  )
                : tr("Alles ziet er goed uit. Blijf je voortgang volgen.", "Everything looks good. Keep tracking your progress.")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Compact stability badge */}
            {trtStability.score !== null ? (
              <div className="flex items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-1.5">
                <div className="relative h-8 w-8">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "score", value: trtStability.score },
                          { name: "rest", value: 100 - trtStability.score }
                        ]}
                        dataKey="value"
                        innerRadius={10}
                        outerRadius={15}
                        stroke="none"
                        startAngle={90}
                        endAngle={-270}
                      >
                        <Cell fill={stabilityColor(trtStability.score)} />
                        <Cell fill="#334155" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-xs">
                  <span className="font-semibold text-slate-100">{trtStability.score}</span>
                  <span className="ml-1 text-slate-400">{tr("stabiliteit", "stability")}</span>
                </div>
              </div>
            ) : null}
            {/* Inline wellbeing nudge */}
            {showWellbeingNudge ? (
              <button
                type="button"
                onClick={onNavigateToCheckIns}
                className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 transition hover:bg-amber-500/15"
              >
                {daysSinceCheckIn === null
                  ? tr("Eerste check-in", "First check-in")
                  : tr(`Check-in (${daysSinceCheckIn}d)`, `Check in (${daysSinceCheckIn}d)`)}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasReports ? (
        <div className="rounded-xl bg-slate-800/40 px-3 py-2.5">
          <div ref={chartSettingsRef} className="relative space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div data-testid="time-range-filter-group" className="flex flex-wrap items-center gap-1">
                {timeRangeOptions.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`rounded-md px-2 py-1 text-xs transition-colors ${
                      settings.timeRange === value
                        ? "dashboard-filter-chip-active bg-cyan-500/15 font-medium text-cyan-300"
                        : "dashboard-filter-chip-inactive text-slate-400 hover:text-slate-200"
                    }`}
                    onClick={() => onUpdateSettings({ timeRange: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span data-testid="dashboard-filter-divider" className="hidden h-4 w-px bg-slate-700/50 sm:block" />
              <div data-testid="marker-scope-filter-group" className="flex items-center gap-1">
                <button
                  type="button"
                  className={`rounded-md px-2 py-1 text-xs transition-colors ${
                    dashboardView === "primary"
                      ? "dashboard-filter-chip-active bg-cyan-500/15 font-medium text-cyan-300"
                      : "dashboard-filter-chip-inactive text-slate-400 hover:text-slate-200"
                  }`}
                  onClick={() => onDashboardViewChange("primary")}
                >
                  {tr("Primair", "Primary")}
                </button>
                <button
                  type="button"
                  className={`rounded-md px-2 py-1 text-xs transition-colors ${
                    dashboardView === "all"
                      ? "dashboard-filter-chip-active bg-cyan-500/15 font-medium text-cyan-300"
                      : "dashboard-filter-chip-inactive text-slate-400 hover:text-slate-200"
                  }`}
                  onClick={() => onDashboardViewChange("all")}
                >
                  {tr("Alle", "All")}
                </button>
              </div>
              {settings.timeRange === "custom" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    className="rounded-md border border-slate-700/50 bg-slate-800/80 px-2 py-1 text-xs"
                    value={settings.customRangeStart}
                    onChange={(event) => onUpdateSettings({ customRangeStart: event.target.value })}
                  />
                  <input
                    type="date"
                    className="rounded-md border border-slate-700/50 bg-slate-800/80 px-2 py-1 text-xs"
                    value={settings.customRangeEnd}
                    onChange={(event) => onUpdateSettings({ customRangeEnd: event.target.value })}
                  />
                </div>
              ) : null}
              <div className="ml-auto">
                <button
                  type="button"
                  onClick={() => setShowChartSettings((current) => !current)}
                  className={`inline-flex items-center gap-1 rounded-md p-1.5 text-xs transition-colors ${
                    showChartSettings ? "text-slate-100" : "text-slate-500 hover:text-slate-300"
                  }`}
                  aria-expanded={showChartSettings}
                  aria-label={tr("Grafiekinstellingen", "Chart settings")}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {showChartSettings ? (
            <div className="absolute right-0 top-full z-40 mt-2 w-[min(92vw,28rem)] space-y-3 rounded-xl border border-slate-700/80 bg-slate-950/95 p-3 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between px-0.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{tr("Grafiekinstellingen", "Chart settings")}</p>
                <button
                  type="button"
                  onClick={() => setShowChartSettings(false)}
                  className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-900/70 p-1 text-slate-300 hover:border-slate-500 hover:text-slate-100"
                  aria-label={tr("Sluit grafiekinstellingen", "Close chart settings")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{tr("Weergavemodus", "View mode")}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className={`rounded-md border px-2.5 py-1 text-xs ${
                      dashboardMode === "cards"
                        ? "border-violet-400/40 bg-violet-500/15 text-violet-200"
                        : "border-slate-700 bg-slate-800/70 text-slate-300 hover:text-slate-100"
                    }`}
                    onClick={() => onDashboardModeChange("cards")}
                  >
                    {tr("Markerkaarten", "Marker cards")}
                  </button>
                  <button
                    type="button"
                    className={`rounded-md border px-2.5 py-1 text-xs ${
                      dashboardMode === "compare2"
                        ? "border-violet-400/40 bg-violet-500/15 text-violet-200"
                        : "border-slate-700 bg-slate-800/70 text-slate-300 hover:text-slate-100"
                    }`}
                    onClick={() => onDashboardModeChange("compare2")}
                  >
                    {tr("Vergelijk 2 markers", "Compare 2 markers")}
                  </button>
                </div>
                {!isCompareMode ? (
                  <div className="mt-3 border-t border-slate-700/60 pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{tr("Primaire markers", "Primary markers")}</p>
                      <button
                        type="button"
                        onClick={() => setShowPrimaryMarkerPicker((current) => !current)}
                        className={`rounded-md px-2 py-1 text-xs ${
                          showPrimaryMarkerPicker ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-800 text-slate-300 hover:text-slate-100"
                        }`}
                      >
                        {showPrimaryMarkerPicker ? tr("Verbergen", "Hide") : tr("Bewerken", "Edit")}
                      </button>
                    </div>
                    {showPrimaryMarkerPicker ? (
                      <div className="mt-3 space-y-2 rounded-lg border border-slate-700/70 bg-slate-900/60 p-2.5">
                        <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                          {allMarkers.map((marker) => {
                            const isChecked = selectedPrimaryMarkers.includes(marker);
                            return (
                              <label key={marker} className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-slate-200 hover:bg-slate-800/70">
                                <input
                                  type="checkbox"
                                  className="peer sr-only"
                                  checked={isChecked}
                                  onChange={() => togglePrimaryMarkerSelection(marker)}
                                />
                                <span
                                  className={`inline-flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                                    isChecked ? "border-cyan-400 bg-cyan-500/20 text-cyan-300" : "border-slate-600 bg-slate-800 text-transparent"
                                  }`}
                                >
                                  <Check className="h-3 w-3" />
                                </span>
                                <span>{getMarkerDisplayName(marker, language)}</span>
                              </label>
                            );
                          })}
                        </div>
                        <div className="flex items-center justify-between gap-2 border-t border-slate-700/60 pt-2">
                          <p className="text-[11px] text-slate-400">
                            {tr("Minimaal 1 marker geselecteerd", "At least 1 marker must remain selected")}
                          </p>
                          <button
                            type="button"
                            onClick={() => onUpdateSettings({ primaryMarkersSelection: [] })}
                            className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200"
                          >
                            {tr("Reset standaard", "Reset defaults")}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{tr("Preset", "Preset")}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(
                    [
                      ["clinical", tr("Klinisch", "Clinical")],
                      ["protocol", tr("Protocol", "Protocol")],
                      ["minimal", tr("Minimaal", "Minimal")]
                    ] as const
                  ).map(([preset, label]) => (
                    <button
                      key={preset}
                      type="button"
                      className={`rounded-md px-2.5 py-1 text-xs ${
                        currentPreset === preset ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-800 text-slate-300 hover:text-slate-100"
                      }`}
                      onClick={() => applyPreset(preset)}
                    >
                      {label}
                    </button>
                  ))}
                  {currentPreset === "custom" ? (
                    <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-200">
                      {tr("Aangepast", "Custom")}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{tr("Data & schaal", "Data & scale")}</p>
                <div className="mt-3 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center px-1 text-xs font-medium text-slate-400">{tr("Eenheden:", "Units:")}</span>
                    {(["eu", "us"] as const).map((unitSystem) => (
                      <button
                        key={unitSystem}
                        type="button"
                        className={`rounded-md px-2.5 py-1 text-xs ${
                          settings.unitSystem === unitSystem ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-800 text-slate-300 hover:text-slate-100"
                        }`}
                        onClick={() => onUpdateSettings({ unitSystem })}
                        title={tr(
                          "Waarden worden automatisch omgerekend tussen SI (metrisch) en conventionele eenheden.",
                          "Values are automatically converted between SI (Metric) and Conventional units."
                        )}
                      >
                        {unitSystemLabel(unitSystem)}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center px-1 text-xs font-medium text-slate-400">{tr("Y-as:", "Y-axis:")}</span>
                    <button
                      type="button"
                      className={`rounded-md px-2.5 py-1 text-xs ${
                        settings.yAxisMode === "zero" ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-800 text-slate-300 hover:text-slate-100"
                      }`}
                      onClick={() => updateChartVisualSettings({ yAxisMode: "zero" })}
                    >
                      {tr("Start op nul", "Start at zero")}
                    </button>
                    <button
                      type="button"
                      className={`rounded-md px-2.5 py-1 text-xs ${
                        settings.yAxisMode === "data" ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-800 text-slate-300 hover:text-slate-100"
                      }`}
                      onClick={() => updateChartVisualSettings({ yAxisMode: "data" })}
                    >
                      {tr("Y-as op databereik", "Fit Y-axis to data")}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">{yAxisDataRangeTooltip}</p>
                  {isCompareMode ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300">{tr("Vergelijkschaal", "Comparison scale")}</span>
                      <button
                        type="button"
                        className={`rounded-md px-2.5 py-1 text-xs ${
                          settings.comparisonScale === "absolute"
                            ? "bg-cyan-500/20 text-cyan-200"
                            : "bg-slate-800 text-slate-300 hover:text-slate-100"
                        }`}
                        onClick={() => onUpdateSettings({ comparisonScale: "absolute" })}
                      >
                        {tr("Absoluut", "Absolute")}
                      </button>
                      <button
                        type="button"
                        className={`rounded-md px-2.5 py-1 text-xs ${
                          settings.comparisonScale === "normalized"
                            ? "bg-cyan-500/20 text-cyan-200"
                            : "bg-slate-800 text-slate-300 hover:text-slate-100"
                        }`}
                        onClick={() => onUpdateSettings({ comparisonScale: "normalized" })}
                      >
                        {tr("Genormaliseerd (0-100%)", "Normalized (0-100%)")}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {!isCompareMode ? (
                <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{tr("Klinische lagen", "Clinical layers")}</p>
                  <div className="mt-3 flex flex-col gap-2">
                    <ToggleSwitch
                      checked={settings.showReferenceRanges}
                      onChange={(checked) => updateChartVisualSettings({ showReferenceRanges: checked })}
                      label={tr("Referentiebereiken", "Reference range")}
                      tooltip={referenceRangesTooltip}
                    />
                    <ToggleSwitch
                      checked={settings.showTrtTargetZone}
                      onChange={(checked) => updateChartVisualSettings({ showTrtTargetZone: checked })}
                      label={isGeneralProfile ? tr("Streefzone", "Target zone") : tr("TRT-streefzone", "TRT target zone")}
                      tooltip={trtTargetZoneTooltip}
                    />
                    <ToggleSwitch
                      checked={settings.showLongevityTargetZone}
                      onChange={(checked) => updateChartVisualSettings({ showLongevityTargetZone: checked })}
                      label={tr("Longevity-streefzone", "Longevity target zone")}
                      tooltip={longevityZoneTooltip}
                    />
                  </div>
                </div>
              ) : null}

              {!isCompareMode ? (
                <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{tr("Contextlagen", "Context layers")}</p>
                  <div className="mt-3 flex flex-col gap-2">
                    <ToggleSwitch
                      checked={settings.showAnnotations}
                      onChange={(checked) => updateChartVisualSettings({ showAnnotations: checked })}
                      label={tr("Protocolfase-overlay", "Protocol phase overlay")}
                      tooltip={dosePhaseOverlaysTooltip}
                      disabled={!hasPhaseBlocks}
                    />
                    <ToggleSwitch
                      checked={settings.showCheckInOverlay}
                      onChange={(checked) => onUpdateSettings({ showCheckInOverlay: checked })}
                      label={tr("Welzijns check-ins", "Wellbeing check-ins")}
                      tooltip={tr(
                        "Toont verticale lijnen op check-in datums in de grafieken, zodat je welzijn naast je labwaarden kunt zien.",
                        "Shows vertical markers on check-in dates in the charts, so you can see how you felt alongside your lab values."
                      )}
                      disabled={checkIns.length === 0}
                    />
                  </div>
                  {!hasPhaseBlocks ? (
                    <p className="mt-2 text-xs text-slate-500">
                      {tr(
                        "Geen protocolfase-overlays in dit datumbereik. Voeg meer rapporten toe of kies een ruimer bereik.",
                        "No protocol phase overlays in this date range. Add more reports or choose a wider range."
                      )}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {!isCompareMode ? (
                <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{tr("Highlights", "Highlights")}</p>
                  <div className="mt-3 flex flex-col gap-2">
                    <ToggleSwitch
                      checked={settings.showAbnormalHighlights}
                      onChange={(checked) => updateChartVisualSettings({ showAbnormalHighlights: checked })}
                      label={tr("Markeer waarden buiten bereik", "Highlight out-of-range values")}
                      tooltip={abnormalHighlightsTooltip}
                    />
                  </div>
                </div>
              ) : null}

              {samplingControlsEnabled ? (
                <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{tr("Meetcontext", "Sampling context")}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
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
                    {!isCompareMode ? (
                      <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
                        <input
                          type="checkbox"
                          checked={settings.compareToBaseline}
                          onChange={(event) => onUpdateSettings({ compareToBaseline: event.target.checked })}
                        />
                        {tr("Vergelijk met baseline", "Compare to baseline")}
                      </label>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          </div>
        </div>
      ) : null}

      {hasReports && isCompareMode ? (
        <div className="rounded-xl bg-slate-800/30 p-3">
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

      {!isCompareMode || !hasReports ? (
        <div>
        {hasReports ? (
          <>

            {firstReportVisible ? (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-slate-800/50 px-3 py-2">
                <p className="text-xs text-slate-400">
                  {tr(
                    "Upload nog 1 rapport voor trendgrafieken.",
                    "Upload one more report to unlock trends."
                  )}
                </p>
                {!isShareMode ? (
                  <button
                    type="button"
                    onClick={onUploadClick}
                    disabled={isProcessing}
                    className={`shrink-0 rounded-md px-2.5 py-1 text-xs text-cyan-300 transition-colors ${
                      isProcessing ? "cursor-not-allowed opacity-70" : "hover:text-cyan-200"
                    }`}
                  >
                    {isProcessing ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {tr("Uploaden...", "Uploading...")}
                      </span>
                    ) : (
                      tr("Upload", "Upload")
                    )}
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {reports.length === 0 && !isShareMode ? (
          <WelcomeHero
            language={language}
            theme={settings.theme}
            cloudConfigured={cloudConfigured}
            onLoadDemo={onLoadDemo}
            onUploadClick={onUploadClick}
            onSetUserProfile={(profile) => onUpdateSettings({ userProfile: profile })}
            onOpenCloudAuth={onOpenCloudAuth}
          />
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                  onOpenAlerts={() => onOpenMarkerAlerts(marker)}
                  checkIns={checkIns}
                />
              );
            })}
          </div>
        )}

        {hasReports ? (
          <div
            id="dashboard-stability-index"
            tabIndex={-1}
            className="mt-4 rounded-lg bg-slate-800/40 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
          >
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "score", value: trtStability.score ?? 0 },
                        { name: "rest", value: 100 - (trtStability.score ?? 0) }
                      ]}
                      dataKey="value"
                      innerRadius={16}
                      outerRadius={22}
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
                  <span className="text-xs font-semibold text-slate-100">{trtStability.score === null ? "-" : trtStability.score}</span>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-200">{tr("Stabiliteitsindex", "Stability Index")}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {tr(
                    "Rust-score hormoonmarkers. 80-100 = stabiel, 60-79 = matig, <60 = wisselend.",
                    "Hormone steadiness score. 80-100 = stable, 60-79 = moderate, <60 = variable."
                  )}
                </p>
              </div>
            </div>
          </div>
        ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default DashboardView;
