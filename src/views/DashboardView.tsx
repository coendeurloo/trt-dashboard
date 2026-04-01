import { useCallback, useEffect, useMemo, useState } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { Check, Loader2, SlidersHorizontal } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import {
  DosePhaseBlock,
  MarkerAlert,
  MarkerSeriesPoint,
  MarkerTrendSummary,
  TrtStabilityResult
} from "../analytics";
import ComparisonChart from "../components/ComparisonChart";
import ChartSettingsDrawer from "../components/ChartSettingsDrawer";
import MarkerChartCard from "../components/MarkerChartCard";
import WelcomeHero from "../components/WelcomeHero";
import { MARKER_DATABASE, type MarkerCategory } from "../data/markerDatabase";
import {
  inferDashboardChartPresetFromSettings,
  stabilityColor
} from "../chartHelpers";
import { getMarkerDisplayName, trLocale } from "../i18n";
import { normalizeMarkerLookupKey } from "../markerNormalization";
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

const MARKER_CATEGORY_ORDER: MarkerCategory[] = [
  "Hormones - Sex",
  "Hormones - Adrenal",
  "Thyroid",
  "Complete Blood Count",
  "Inflammatory Markers",
  "Coagulation",
  "Metabolic Health",
  "Blood Glucose",
  "Liver Function",
  "Kidney Function",
  "Electrolytes",
  "Enzymes",
  "Vitamins & Minerals",
  "Iron Studies",
  "Other"
];

const CATEGORY_FILTER_ORDER = ["hormones", "metabolic", "blood", "organs", "nutrients", "other"];

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
  const tr = useCallback((nl: string, en: string): string => trLocale(language, nl, en), [language]);
  const unitSystemLabel = (unitSystem: "eu" | "us"): string =>
    unitSystem === "eu" ? tr("SI (metrisch)", "SI (Metric)") : tr("Conventioneel", "Conventional");
  const hasReports = reports.length > 0;
  const isDarkTheme = settings.theme === "dark";
  const isCompactDensity = settings.interfaceDensity === "compact";

  // Wellbeing nudge: show when no check-ins or last one was >= 7 days ago
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
  const [markerSearchTerm, setMarkerSearchTerm] = useState("");
  const [markerCategoryFilter, setMarkerCategoryFilter] = useState("all");

  const showAllTimeForFirstReport = () => {
    onUpdateSettings({
      timeRange: "all",
      samplingFilter: "all",
      compareToBaseline: false
    });
  };
  const isCompareMode = dashboardMode === "compare2";
  const selectedPrimaryMarkers = settings.primaryMarkersSelection.length > 0
    ? settings.primaryMarkersSelection.filter((marker) => allMarkers.includes(marker))
    : primaryMarkers.filter((marker) => allMarkers.includes(marker));
  const markerCategoryLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    MARKER_DATABASE.forEach((entry) => {
      [entry.canonicalName, ...entry.aliases].forEach((alias) => {
        const key = normalizeMarkerLookupKey(alias);
        if (!key) {
          return;
        }
        lookup.set(key, entry.category);
      });
    });
    return lookup;
  }, []);
  const markersToRenderBase = dashboardView === "primary" ? primaryMarkers : allMarkers;
  const resolveMarkerCategory = useCallback((marker: string): string => {
    const lookupKey = normalizeMarkerLookupKey(marker);
    return markerCategoryLookup.get(lookupKey) ?? "Other";
  }, [markerCategoryLookup]);
  const getMarkerCategoryLabel = useCallback((category: string): string => {
    if (category === "Hormones - Sex") {
      return tr("Geslachtshormonen", "Hormones - Sex");
    }
    if (category === "Hormones - Adrenal") {
      return tr("Bijnierhormonen", "Hormones - Adrenal");
    }
    if (category === "Thyroid") {
      return tr("Schildklier", "Thyroid");
    }
    if (category === "Complete Blood Count") {
      return tr("Compleet bloedbeeld", "Complete Blood Count");
    }
    if (category === "Inflammatory Markers") {
      return tr("Ontstekingsmarkers", "Inflammatory Markers");
    }
    if (category === "Coagulation") {
      return tr("Stolling", "Coagulation");
    }
    if (category === "Metabolic Health") {
      return tr("Metabole gezondheid", "Metabolic Health");
    }
    if (category === "Blood Glucose") {
      return tr("Bloedglucose", "Blood Glucose");
    }
    if (category === "Liver Function") {
      return tr("Leverfunctie", "Liver Function");
    }
    if (category === "Kidney Function") {
      return tr("Nierfunctie", "Kidney Function");
    }
    if (category === "Electrolytes") {
      return tr("Elektrolyten", "Electrolytes");
    }
    if (category === "Enzymes") {
      return tr("Enzymen", "Enzymes");
    }
    if (category === "Vitamins & Minerals") {
      return tr("Vitamines & mineralen", "Vitamins & Minerals");
    }
    if (category === "Iron Studies") {
      return tr("IJzerstatus", "Iron Studies");
    }
    return tr("Overig", "Other");
  }, [tr]);
  const mapMarkerCategoryToFilterGroup = (category: string): string => {
    if (category === "Hormones - Sex" || category === "Hormones - Adrenal" || category === "Thyroid") {
      return "hormones";
    }
    if (category === "Metabolic Health" || category === "Blood Glucose") {
      return "metabolic";
    }
    if (category === "Complete Blood Count" || category === "Inflammatory Markers" || category === "Coagulation") {
      return "blood";
    }
    if (category === "Liver Function" || category === "Kidney Function" || category === "Electrolytes" || category === "Enzymes") {
      return "organs";
    }
    if (category === "Vitamins & Minerals" || category === "Iron Studies") {
      return "nutrients";
    }
    return "other";
  };
  const categoryFilterLabel = (key: string): string => {
    if (key === "hormones") {
      return tr("Hormonen & schildklier", "Hormones & thyroid");
    }
    if (key === "metabolic") {
      return tr("Metabool & glucose", "Metabolic & glucose");
    }
    if (key === "blood") {
      return tr("Bloed & ontsteking", "Blood & inflammation");
    }
    if (key === "organs") {
      return tr("Lever, nier & elektrolyten", "Liver, kidney & electrolytes");
    }
    if (key === "nutrients") {
      return tr("Vitamines & ijzer", "Vitamins & iron");
    }
    return tr("Overig", "Other");
  };
  const dashboardCategoryOptions = useMemo(() => {
    if (dashboardView !== "all") {
      return [];
    }
    const availableGroups = new Set(
      markersToRenderBase.map((marker) => mapMarkerCategoryToFilterGroup(resolveMarkerCategory(marker)))
    );
    return CATEGORY_FILTER_ORDER.filter((group) => availableGroups.has(group));
  }, [dashboardView, markersToRenderBase, resolveMarkerCategory]);
  useEffect(() => {
    if (dashboardView !== "all") {
      setMarkerSearchTerm("");
      setMarkerCategoryFilter("all");
      return;
    }
    if (markerCategoryFilter !== "all" && !dashboardCategoryOptions.includes(markerCategoryFilter)) {
      setMarkerCategoryFilter("all");
    }
  }, [dashboardCategoryOptions, dashboardView, markerCategoryFilter]);
  const normalizedMarkerSearchTerm = markerSearchTerm.trim().toLowerCase();
  const markersToRender = useMemo(
    () =>
      markersToRenderBase.filter((marker) => {
        if (dashboardView !== "all") {
          return true;
        }
        const markerCategoryGroup = mapMarkerCategoryToFilterGroup(resolveMarkerCategory(marker));
        if (markerCategoryFilter !== "all" && markerCategoryGroup !== markerCategoryFilter) {
          return false;
        }
        if (!normalizedMarkerSearchTerm) {
          return true;
        }
        const markerLabel = getMarkerDisplayName(marker, language).toLowerCase();
        return markerLabel.includes(normalizedMarkerSearchTerm) || marker.toLowerCase().includes(normalizedMarkerSearchTerm);
      }),
    [dashboardView, language, markerCategoryFilter, markersToRenderBase, normalizedMarkerSearchTerm, resolveMarkerCategory]
  );
  const markerRenderIndexLookup = useMemo(
    () => new Map(markersToRender.map((marker, index) => [marker, index])),
    [markersToRender]
  );
  const groupedMarkersToRender = useMemo(
    () =>
      Array.from(
        markersToRender.reduce((groups, marker) => {
          const category = resolveMarkerCategory(marker);
          const markers = groups.get(category) ?? [];
          markers.push(marker);
          groups.set(category, markers);
          return groups;
        }, new Map<string, string[]>())
      )
        .map(([category, markers]) => ({
          category,
          categoryLabel: getMarkerCategoryLabel(category),
          markers: [...markers].sort((left, right) => getMarkerDisplayName(left, language).localeCompare(getMarkerDisplayName(right, language))),
          order: MARKER_CATEGORY_ORDER.indexOf(category as MarkerCategory)
        }))
        .sort((left, right) => {
          const leftOrder = left.order === -1 ? Number.MAX_SAFE_INTEGER : left.order;
          const rightOrder = right.order === -1 ? Number.MAX_SAFE_INTEGER : right.order;
          if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
          }
          return left.categoryLabel.localeCompare(right.categoryLabel);
        }),
    [getMarkerCategoryLabel, language, markersToRender, resolveMarkerCategory]
  );

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

  const updateChartVisualSettings = useCallback(
    (
      patch: Partial<
        Pick<
          AppSettings,
          | "showReferenceRanges"
          | "showAbnormalHighlights"
          | "showAnnotations"
          | "showCheckInOverlay"
          | "showTrtTargetZone"
          | "showLongevityTargetZone"
          | "yAxisMode"
        >
      >
    ) => {
      const normalizedPatch: Partial<AppSettings> = { ...patch };
      if (patch.showReferenceRanges === true) {
        normalizedPatch.showTrtTargetZone = false;
        normalizedPatch.showLongevityTargetZone = false;
      }
      const inferredPreset = inferDashboardChartPresetFromSettings({
        showReferenceRanges: normalizedPatch.showReferenceRanges ?? settings.showReferenceRanges,
        showAbnormalHighlights: normalizedPatch.showAbnormalHighlights ?? settings.showAbnormalHighlights,
        showAnnotations: normalizedPatch.showAnnotations ?? settings.showAnnotations,
        showTrtTargetZone: normalizedPatch.showTrtTargetZone ?? settings.showTrtTargetZone,
        showLongevityTargetZone: normalizedPatch.showLongevityTargetZone ?? settings.showLongevityTargetZone,
        yAxisMode: normalizedPatch.yAxisMode ?? settings.yAxisMode
      });
      onUpdateSettings({
        ...normalizedPatch,
        dashboardChartPreset: inferredPreset
      });
    },
    [onUpdateSettings, settings]
  );

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return tr("Goedemorgen", "Good morning");
    if (hour < 18) return tr("Goedemiddag", "Good afternoon");
    return tr("Goedenavond", "Good evening");
  })();

  return (
    <section className={`${isCompactDensity ? "space-y-3" : "space-y-4"} fade-in`}>
      {/* Greeting + summary row */}
      {hasReports && personalInfo.name ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className={isDarkTheme ? "text-lg font-semibold text-slate-100" : "text-lg font-semibold text-slate-900"}>
              {greeting}, {personalInfo.name.split(" ")[0]}
            </h2>
            <p className={isDarkTheme ? "mt-0.5 text-sm text-slate-400" : "mt-0.5 text-sm text-slate-500"}>
              {outOfRangeCount > 0
                ? tr(
                    `Je hebt ${outOfRangeCount} marker${outOfRangeCount === 1 ? "" : "s"} buiten bereik.`,
                    `You have ${outOfRangeCount} marker${outOfRangeCount === 1 ? "" : "s"} out of range.`
                  )
                : tr("Alles ziet er goed uit. Blijf je voortgang volgen.", "Everything looks good. Keep tracking your progress.")}
            </p>
          </div>
          <div className="flex items-center gap-3">
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
        <div
          className={
            isDarkTheme
              ? "dashboard-filter-bar rounded-xl bg-slate-800/40 px-3 py-2.5"
              : "dashboard-filter-bar rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm"
          }
        >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div data-testid="time-range-filter-group" className="flex flex-wrap items-center gap-1">
                {timeRangeOptions.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`rounded-md px-2 py-1 text-xs transition-colors ${
                      settings.timeRange === value
                        ? "dashboard-filter-chip-active bg-cyan-500/15 font-medium text-cyan-300"
                        : isDarkTheme
                          ? "dashboard-filter-chip-inactive text-slate-400 hover:text-slate-200"
                          : "dashboard-filter-chip-inactive text-slate-500 hover:text-slate-700"
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
                      : isDarkTheme
                        ? "dashboard-filter-chip-inactive text-slate-400 hover:text-slate-200"
                        : "dashboard-filter-chip-inactive text-slate-500 hover:text-slate-700"
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
                      : isDarkTheme
                        ? "dashboard-filter-chip-inactive text-slate-400 hover:text-slate-200"
                        : "dashboard-filter-chip-inactive text-slate-500 hover:text-slate-700"
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
                    className={
                      isDarkTheme
                        ? "rounded-md border border-slate-700/50 bg-slate-800/80 px-2 py-1 text-xs"
                        : "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                    }
                    value={settings.customRangeStart}
                    onChange={(event) => onUpdateSettings({ customRangeStart: event.target.value })}
                  />
                  <input
                    type="date"
                    className={
                      isDarkTheme
                        ? "rounded-md border border-slate-700/50 bg-slate-800/80 px-2 py-1 text-xs"
                        : "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                    }
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
                    showChartSettings
                      ? isDarkTheme
                        ? "text-slate-100"
                        : "text-slate-700"
                      : isDarkTheme
                        ? "text-slate-500 hover:text-slate-300"
                        : "text-slate-500 hover:text-slate-700"
                  }`}
                  aria-expanded={showChartSettings}
                  aria-controls="dashboard-chart-settings-drawer"
                  aria-label={tr("Grafiekinstellingen", "Chart settings")}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {dashboardView === "all" && !isCompareMode ? (
              <div
                className={`flex flex-wrap items-center gap-2 border-t pt-2 ${
                  isDarkTheme ? "border-slate-700/60" : "border-slate-200/90"
                }`}
              >
                <input
                  type="search"
                  value={markerSearchTerm}
                  onChange={(event) => setMarkerSearchTerm(event.target.value)}
                  placeholder={tr("Zoek biomarker...", "Search biomarkers...")}
                  className={
                    isDarkTheme
                      ? "w-full rounded-md border border-slate-700/80 bg-slate-900/70 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 sm:w-64"
                      : "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder:text-slate-500 sm:w-64"
                  }
                  aria-label={tr("Zoek biomarker", "Search biomarker")}
                />
                <p className={isDarkTheme ? "text-xs text-slate-400" : "text-xs text-slate-600"}>
                  {tr(`${markersToRender.length} biomarkers zichtbaar`, `${markersToRender.length} biomarkers shown`)}
                </p>
                <label className="ml-auto flex items-center gap-2 text-xs">
                  <span className={isDarkTheme ? "text-slate-400" : "text-slate-600"}>{tr("Categorie", "Category")}</span>
                  <select
                    value={markerCategoryFilter}
                    onChange={(event) => setMarkerCategoryFilter(event.target.value)}
                    className={
                      isDarkTheme
                        ? "rounded-md border border-slate-700/80 bg-slate-900/70 px-2 py-1.5 text-xs text-slate-100"
                        : "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
                    }
                    aria-label={tr("Marker category", "Marker category")}
                  >
                    <option value="all">{tr("Alle categorieen", "All categories")}</option>
                    {dashboardCategoryOptions.map((group) => (
                      <option key={group} value={group}>
                        {categoryFilterLabel(group)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            <ChartSettingsDrawer
              id="dashboard-chart-settings-drawer"
              open={showChartSettings}
              title={tr("Grafiekinstellingen", "Chart settings")}
              closeLabel={tr("Sluit grafiekinstellingen", "Close chart settings")}
              isDarkTheme={isDarkTheme}
              onClose={() => setShowChartSettings(false)}
            >
              <div className="space-y-3">
              <div className={isDarkTheme ? "rounded-xl border border-slate-700/70 bg-slate-900/50 p-3" : "rounded-xl border border-slate-200 bg-slate-50 p-3"}>
                <p className={isDarkTheme ? "text-[11px] font-semibold uppercase tracking-wide text-slate-400" : "text-[11px] font-semibold uppercase tracking-wide text-slate-500"}>
                  {tr("Weergavemodus", "View mode")}
                </p>
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
                    {tr("Vergelijk 2 biomarkers", "Compare 2 biomarkers")}
                  </button>
                </div>
                {!isCompareMode ? (
                  <div className="mt-3 border-t border-slate-700/60 pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{tr("Belangrijke biomarkers", "Key Biomarkers")}</p>
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
                            {tr("Minimaal 1 biomarker geselecteerd", "At least 1 biomarker must remain selected")}
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
              {!isCompareMode ? (
                <div className={isDarkTheme ? "rounded-xl border border-slate-700/70 bg-slate-900/50 p-3" : "rounded-xl border border-slate-200 bg-slate-50 p-3"}>
                  <p className={isDarkTheme ? "text-[11px] font-semibold uppercase tracking-wide text-slate-400" : "text-[11px] font-semibold uppercase tracking-wide text-slate-500"}>
                    {tr("Display", "Display")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className={`rounded-md px-2.5 py-1 text-xs ${
                        settings.showReferenceRanges ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-800 text-slate-300 hover:text-slate-100"
                      }`}
                      onClick={() => updateChartVisualSettings({ showReferenceRanges: !settings.showReferenceRanges })}
                    >
                      {tr("Referentiebereik", "Reference range")}
                    </button>
                    <button
                      type="button"
                      className={`rounded-md px-2.5 py-1 text-xs ${
                        settings.showAbnormalHighlights ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-800 text-slate-300 hover:text-slate-100"
                      }`}
                      onClick={() => updateChartVisualSettings({ showAbnormalHighlights: !settings.showAbnormalHighlights })}
                    >
                      {tr("Markeer waarden buiten bereik", "Highlight out-of-range values")}
                    </button>
                    <button
                      type="button"
                      className={`rounded-md px-2.5 py-1 text-xs ${
                        settings.showAnnotations ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-800 text-slate-300 hover:text-slate-100"
                      }`}
                      onClick={() => updateChartVisualSettings({ showAnnotations: !settings.showAnnotations })}
                    >
                      {tr("Protocolfase-overlay", "Protocol phase overlay")}
                    </button>
                    <button
                      type="button"
                      className={`rounded-md px-2.5 py-1 text-xs ${
                        settings.showCheckInOverlay ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-800 text-slate-300 hover:text-slate-100"
                      }`}
                      onClick={() => updateChartVisualSettings({ showCheckInOverlay: !settings.showCheckInOverlay })}
                    >
                      {tr("Welzijns check-ins", "Wellbeing check-ins")}
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300">{tr("Y-as", "Y-axis")}</span>
                    <button
                      type="button"
                      className={`rounded-md px-2.5 py-1 text-xs ${
                        settings.yAxisMode === "zero"
                          ? "bg-cyan-500/20 text-cyan-200"
                          : "bg-slate-800 text-slate-300 hover:text-slate-100"
                      }`}
                      onClick={() => updateChartVisualSettings({ yAxisMode: "zero" })}
                    >
                      {tr("Start op nul", "Start at zero")}
                    </button>
                    <button
                      type="button"
                      className={`rounded-md px-2.5 py-1 text-xs ${
                        settings.yAxisMode === "data"
                          ? "bg-cyan-500/20 text-cyan-200"
                          : "bg-slate-800 text-slate-300 hover:text-slate-100"
                      }`}
                      onClick={() => updateChartVisualSettings({ yAxisMode: "data" })}
                    >
                      {tr("Fit op data", "Fit to data")}
                    </button>
                  </div>
                </div>
              ) : null}
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
            </ChartSettingsDrawer>
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
                    "Goed begin: je eerste rapport is opgeslagen. Upload nog een rapport voor trendgrafieken en vergelijkingen.",
                    "Great start: your first report is saved. Add one more report to unlock trend charts and over-time comparisons."
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
                    "Je eerste rapport is opgeslagen, maar valt buiten je huidige filter. Zet je bereik op 'All time' of upload een tweede rapport om trends te zien.",
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
        ) : markersToRender.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 py-10 text-center">
            <p className="text-base font-semibold text-slate-200">{tr("Geen biomarkers gevonden", "No biomarkers found")}</p>
            <p className="mt-1 text-sm text-slate-400">
              {tr("Pas je zoekterm of categorie aan om biomarkers te tonen.", "Adjust your search term or category filter to show biomarkers.")}
            </p>
          </div>
        ) : dashboardView === "all" ? (
          <div className="space-y-5">
            {groupedMarkersToRender.map((group) => {
              const groupId = `dashboard-marker-group-${group.category.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
              return (
              <section key={group.category} className="space-y-3" aria-labelledby={groupId}>
                <div className="flex items-center gap-2 border-b border-slate-700/60 pb-2">
                  <h3
                    id={groupId}
                    className="text-sm font-semibold uppercase tracking-wide text-slate-200"
                  >
                    {group.categoryLabel}
                  </h3>
                  <span className="rounded-full border border-slate-700 bg-slate-800/70 px-2 py-0.5 text-[11px] text-slate-400">
                    {group.markers.length}
                  </span>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {group.markers.map((marker) => {
                    const points = chartPointsForMarker(marker);
                    return (
                      <MarkerChartCard
                        key={marker}
                        marker={marker}
                        points={points}
                        colorIndex={markerRenderIndexLookup.get(marker) ?? 0}
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
              </section>
            );
            })}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {markersToRender.map((marker, index) => {
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
                <p className="text-xs font-medium text-slate-200">{tr("Hormoonestabiliteit", "Hormone stability")}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                  {tr(
                    "Meet hoe consistent je biomarkers zijn over je recente rapporten. Weinig schommeling betekent een hoge score - een goed teken dat je protocol zijn werk doet. 80-100: stabiel | 60-79: matig | onder 60: wisselend.",
                    "Measures how consistent your biomarkers have been across your recent reports. Little fluctuation means a high score - a good sign your protocol is working. 80-100: stable | 60-79: moderate | below 60: variable."
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
