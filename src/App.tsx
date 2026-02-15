import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  Cog,
  Gauge,
  Info,
  Moon,
  Plus,
  Sparkles,
  SlidersHorizontal,
  Sun,
  X
} from "lucide-react";
import {
  MarkerSeriesPoint,
  buildMarkerSeries,
  calculatePercentChange,
  calculatePercentVsBaseline
} from "./analytics";
import { buildCsv } from "./csvExport";
import { PRIMARY_MARKERS, TAB_ITEMS } from "./constants";
import ExtractionReviewTable from "./components/ExtractionReviewTable";
import MarkerTrendChart from "./components/MarkerTrendChart";
import UploadPanel from "./components/UploadPanel";
import { getDemoReports } from "./demoData";
import { blankAnnotations, normalizeAnalysisTextForDisplay } from "./chartHelpers";
import { getMarkerDisplayName, getTabLabel, t } from "./i18n";
import trtLogoLight from "./assets/trt-logo-light.png";
import trtLogoDark from "./assets/trt-logo-dark.png";
import { exportElementToPdf } from "./pdfExport";
import { extractLabData } from "./pdfParsing";
import { buildShareToken, parseShareToken, ShareOptions } from "./share";
import { canonicalizeMarker, normalizeMarkerMeasurement } from "./unitConversion";
import useAnalysis from "./hooks/useAnalysis";
import useAppData, { MarkerMergeSuggestion, detectMarkerMergeSuggestions } from "./hooks/useAppData";
import useDerivedData from "./hooks/useDerivedData";
import AlertsView from "./views/AlertsView";
import AnalysisView from "./views/AnalysisView";
import DashboardView from "./views/DashboardView";
import DoseResponseView from "./views/DoseResponseView";
import ProtocolImpactView from "./views/ProtocolImpactView";
import ReportsView from "./views/ReportsView";
import SettingsView from "./views/SettingsView";
import {
  AppSettings,
  ExtractionDraft,
  LabReport,
  MarkerValue,
  ReportAnnotations,
  TabKey,
  TimeRangeKey
} from "./types";
import { createId, deriveAbnormalFlag, formatDate, withinRange } from "./utils";

const App = () => {
  const [sharedSnapshot] = useState(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const token = new URLSearchParams(window.location.search).get("share");
    if (!token) {
      return null;
    }
    return parseShareToken(token);
  });
  const isShareMode = sharedSnapshot !== null;

  const [shareOptions, setShareOptions] = useState<ShareOptions>({
    hideNotes: false,
    hideProtocol: false,
    hideSymptoms: false
  });
  const [shareLink, setShareLink] = useState("");
  const {
    appData,
    setAppData,
    updateSettings,
    isNl,
    samplingControlsEnabled,
    addReport,
    deleteReport: deleteReportFromData,
    deleteReports: deleteReportsFromData,
    updateReportAnnotations,
    setBaseline,
    remapMarker,
    importData,
    exportJson
  } = useAppData({
    sharedData: sharedSnapshot ? sharedSnapshot.data : null,
    isShareMode
  });
  const tr = (nl: string, en: string): string => (isNl ? nl : en);
  const mapServiceErrorToMessage = (
    error: unknown,
    scope: "ai" | "pdf"
  ): string => {
    if (!(error instanceof Error)) {
      return scope === "ai"
        ? tr("AI-analyse kon niet worden uitgevoerd.", "AI analysis could not be completed.")
        : t(appData.settings.language, "pdfProcessFailed");
    }

    const code = error.message ?? "";
    if (scope === "ai") {
      if (code.startsWith("AI_RATE_LIMITED:")) {
        const seconds = Number(code.split(":")[1] ?? "0");
        const minutes = Math.max(1, Math.ceil((Number.isFinite(seconds) ? seconds : 0) / 60));
        return t(appData.settings.language, "aiRateLimited").replace("{minutes}", String(minutes));
      }
      if (code === "AI_PROXY_UNREACHABLE") {
        return t(appData.settings.language, "aiProxyUnreachable");
      }
      if (code === "AI_EMPTY_RESPONSE") {
        return t(appData.settings.language, "aiEmptyResponse");
      }
      if (code.startsWith("AI_REQUEST_FAILED:")) {
        const [, status, ...rest] = code.split(":");
        const details = rest.join(":").trim();
        const suffix = details ? ` (${status || "unknown"}: ${details})` : ` (${status || "unknown"})`;
        return `${t(appData.settings.language, "aiRequestFailed")}${suffix}`;
      }
      return error.message;
    }

    if (code === "PDF_PROXY_UNREACHABLE") {
      return t(appData.settings.language, "pdfProxyUnreachable");
    }
    if (code === "PDF_EMPTY_RESPONSE") {
      return t(appData.settings.language, "pdfEmptyResponse");
    }
    if (code.startsWith("PDF_EXTRACTION_FAILED:")) {
      const [, status, ...rest] = code.split(":");
      const details = rest.join(":").trim();
      const suffix = details ? ` (${status || "unknown"}: ${details})` : ` (${status || "unknown"})`;
      return `${t(appData.settings.language, "pdfExtractionFailed")}${suffix}`;
    }
    return t(appData.settings.language, "pdfProcessFailed");
  };
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [doseResponseInput, setDoseResponseInput] = useState("");
  const [dashboardView, setDashboardView] = useState<"primary" | "all">("primary");

  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [draft, setDraft] = useState<ExtractionDraft | null>(null);
  const [draftAnnotations, setDraftAnnotations] = useState<ReportAnnotations>(blankAnnotations());

  const [comparisonMode, setComparisonMode] = useState(false);
  const [leftCompareMarker, setLeftCompareMarker] = useState<string>(PRIMARY_MARKERS[0]);
  const [rightCompareMarker, setRightCompareMarker] = useState<string>(PRIMARY_MARKERS[2]);

  const [expandedMarker, setExpandedMarker] = useState<string | null>(null);
  const [protocolWindowSize, setProtocolWindowSize] = useState(2);
  const [protocolMarkerSearch, setProtocolMarkerSearch] = useState("");
  const [protocolCategoryFilter, setProtocolCategoryFilter] = useState<"all" | "Hormones" | "Lipids" | "Hematology" | "Inflammation">("all");
  const [protocolSortKey, setProtocolSortKey] = useState<"deltaPct" | "deltaAbs" | "marker">("deltaPct");
  const [collapsedProtocolEvents, setCollapsedProtocolEvents] = useState<string[]>([]);
  const [markerSuggestions, setMarkerSuggestions] = useState<MarkerMergeSuggestion[]>([]);
  const [renameDialog, setRenameDialog] = useState<{ sourceCanonical: string; draftName: string } | null>(null);
  const uploadPanelRef = useRef<HTMLDivElement | null>(null);

  const {
    reports,
    visibleReports,
    allMarkers,
    editableMarkers,
    markerUsage,
    primaryMarkers,
    baselineReport,
    dosePhaseBlocks,
    trendByMarker,
    alerts,
    actionableAlerts,
    positiveAlerts,
    alertsByMarker,
    alertSeriesByMarker,
    trtStability,
    protocolImpactSummary,
    protocolDoseEvents,
    protocolDoseOverview,
    dosePredictions,
    customDoseValue,
    hasCustomDose
  } = useDerivedData({
    appData,
    samplingControlsEnabled,
    protocolWindowSize,
    doseResponseInput
  });
  const hasDemoData = reports.some((report) => report.extraction.model === "demo-data");
  const isDemoMode = reports.length > 0 && reports.every((report) => report.extraction.model === "demo-data");
  const isDarkTheme = appData.settings.theme === "dark";
  const demoBannerClassName = isDarkTheme
    ? "rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-3 sm:p-4"
    : "rounded-2xl border border-cyan-200 bg-cyan-50 p-3 sm:p-4";
  const demoBannerTextClassName = isDarkTheme ? "flex items-start gap-2 text-sm text-cyan-100" : "flex items-start gap-2 text-sm text-cyan-900";
  const clearDemoButtonClassName = isDarkTheme
    ? "rounded-md border border-cyan-500/50 bg-cyan-500/15 px-3 py-1.5 text-sm text-cyan-100 hover:border-cyan-400 hover:bg-cyan-500/20"
    : "rounded-md border border-cyan-300 bg-white px-3 py-1.5 text-sm text-cyan-900 hover:border-cyan-400 hover:bg-cyan-100";
  const uploadOwnPdfButtonClassName = isDarkTheme
    ? "rounded-md border border-slate-600 bg-slate-800/70 px-3 py-1.5 text-sm text-slate-200 hover:border-cyan-500/50 hover:text-cyan-200"
    : "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-cyan-400 hover:text-cyan-900";

  const {
    isAnalyzingLabs,
    analysisError,
    analysisResult,
    analysisGeneratedAt,
    analysisCopied,
    analysisKind,
    analyzingKind,
    betaRemaining,
    betaLimits,
    runAiAnalysis,
    copyAnalysis
  } = useAnalysis({
    settings: appData.settings,
    language: appData.settings.language,
    visibleReports,
    samplingControlsEnabled,
    protocolImpactSummary,
    alerts,
    trendByMarker,
    trtStability,
    dosePredictions,
    mapErrorToMessage: mapServiceErrorToMessage,
    tr
  });

  useEffect(() => {
    if (isShareMode && activeTab !== "dashboard") {
      setActiveTab("dashboard");
    }
  }, [activeTab, isShareMode]);

  useEffect(() => {
    if (appData.settings.theme === "dark") {
      document.documentElement.classList.add("dark");
      document.body.classList.remove("light");
    } else {
      document.documentElement.classList.remove("dark");
      document.body.classList.add("light");
    }
  }, [appData.settings.theme]);

  useEffect(() => {
    if (!expandedMarker) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpandedMarker(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedMarker]);

  useEffect(() => {
    if (allMarkers.length === 0) {
      return;
    }

    setLeftCompareMarker((current) => (allMarkers.includes(current) ? current : allMarkers[0]));
    setRightCompareMarker((current) => {
      if (allMarkers.includes(current)) {
        return current;
      }
      return allMarkers[Math.min(1, allMarkers.length - 1)];
    });
  }, [allMarkers]);

  useEffect(() => {
    if (!samplingControlsEnabled && (appData.settings.samplingFilter !== "all" || appData.settings.compareToBaseline)) {
      updateSettings({ samplingFilter: "all", compareToBaseline: false });
    }
  }, [samplingControlsEnabled, appData.settings.samplingFilter, appData.settings.compareToBaseline]);

  const appendMarkerSuggestions = (incoming: MarkerMergeSuggestion[]) => {
    if (incoming.length === 0) {
      return;
    }
    setMarkerSuggestions((current) => {
      const merged = [...current, ...incoming];
      return Array.from(
        merged
          .reduce((map, suggestion) => {
            const key = `${suggestion.sourceCanonical}|${suggestion.targetCanonical}`;
            const existing = map.get(key);
            if (!existing || suggestion.score > existing.score) {
              map.set(key, suggestion);
            }
            return map;
          }, new Map<string, MarkerMergeSuggestion>())
          .values()
      );
    });
  };

  const remapMarkerAcrossReports = (sourceCanonical: string, targetLabel: string) => {
    remapMarker(sourceCanonical, targetLabel);
    setMarkerSuggestions((current) =>
      current.filter(
        (item) => item.sourceCanonical !== sourceCanonical && item.targetCanonical !== sourceCanonical
      )
    );
  };

  const openRenameDialog = (sourceCanonical: string) => {
    setRenameDialog({
      sourceCanonical,
      draftName: sourceCanonical
    });
  };

  const startManualEntry = () => {
    setUploadError("");
    setDraftAnnotations(blankAnnotations());
    setDraft({
      sourceFileName: "Manual entry",
      testDate: new Date().toISOString().slice(0, 10),
      markers: [
        {
          id: createId(),
          marker: "Testosterone",
          canonicalMarker: "Testosterone",
          value: 13.8,
          unit: "nmol/L",
          referenceMin: null,
          referenceMax: null,
          abnormal: "unknown",
          confidence: 1
        }
      ],
      extraction: {
        provider: "fallback",
        model: "manual-entry",
        confidence: 1,
        needsReview: false
      }
    });
    setActiveTab("dashboard");
  };

  const loadDemoData = () => {
    if (isShareMode) {
      return;
    }
    const demoReports = getDemoReports();
    setAppData((prev) => ({
      ...prev,
      reports: demoReports
    }));
    setActiveTab("dashboard");
  };

  const clearDemoData = () => {
    if (isShareMode) {
      return;
    }
    setAppData((prev) => ({
      ...prev,
      reports: prev.reports.filter((report) => report.extraction.model !== "demo-data")
    }));
    setActiveTab("dashboard");
  };

  const scrollToUploadPanel = () => {
    if (isShareMode) {
      return;
    }
    if (activeTab !== "dashboard") {
      setActiveTab("dashboard");
    }
    requestAnimationFrame(() => {
      uploadPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const clearDemoAndUpload = () => {
    clearDemoData();
    requestAnimationFrame(() => {
      scrollToUploadPanel();
    });
  };

  const handleUpload = async (file: File) => {
    setIsProcessing(true);
    setUploadError("");

    try {
      const extracted = await extractLabData(file);
      setDraft(extracted);
      setDraftAnnotations(blankAnnotations());
      setActiveTab("dashboard");
    } catch (error) {
      setUploadError(mapServiceErrorToMessage(error, "pdf"));
    } finally {
      setIsProcessing(false);
    }
  };

  const saveDraftAsReport = () => {
    if (!draft) {
      return;
    }

    const sanitizedMarkers = draft.markers
      .map((marker) => {
        const canonicalMarker = canonicalizeMarker(marker.marker || marker.canonicalMarker);
        const value = Number(marker.value);
        if (!Number.isFinite(value)) {
          return null;
        }
        const normalized = normalizeMarkerMeasurement({
          canonicalMarker,
          value,
          unit: marker.unit,
          referenceMin: marker.referenceMin,
          referenceMax: marker.referenceMax
        });

        return {
          ...marker,
          id: createId(),
          marker: marker.marker.trim() || canonicalMarker,
          canonicalMarker,
          value: normalized.value,
          unit: normalized.unit,
          referenceMin: normalized.referenceMin,
          referenceMax: normalized.referenceMax,
          abnormal: deriveAbnormalFlag(normalized.value, normalized.referenceMin, normalized.referenceMax)
        } as MarkerValue;
      })
      .filter((marker): marker is MarkerValue => marker !== null);

    if (sanitizedMarkers.length === 0) {
      setUploadError(tr("Geen geldige markerrijen gevonden. Voeg minimaal één marker toe voordat je opslaat.", "No valid marker rows found. Add at least one marker before saving."));
      return;
    }

    const report: LabReport = {
      id: createId(),
      sourceFileName: draft.sourceFileName,
      testDate: draft.testDate,
      createdAt: new Date().toISOString(),
      markers: sanitizedMarkers,
      annotations: samplingControlsEnabled
        ? draftAnnotations
        : {
            ...draftAnnotations,
            samplingTiming: "trough"
          },
      extraction: draft.extraction
    };
    const incomingCanonicalMarkers = Array.from(new Set(report.markers.map((marker) => marker.canonicalMarker)));
    const suggestions = detectMarkerMergeSuggestions(incomingCanonicalMarkers, allMarkers);

    addReport(report);
    appendMarkerSuggestions(suggestions);

    setDraft(null);
    setDraftAnnotations(blankAnnotations());
    setUploadError("");
  };

  const exportCsv = (selectedMarkers: string[]) => {
    const csv = buildCsv(reports, selectedMarkers, appData.settings.unitSystem);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `trt-lab-data-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = async () => {
    const root = document.getElementById("dashboard-export-root");
    if (!root) {
      return;
    }
    await exportElementToPdf(root, `trt-dashboard-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const chartPointsForMarker = (markerName: string): MarkerSeriesPoint[] =>
    buildMarkerSeries(visibleReports, markerName, appData.settings.unitSystem);

  const markerPercentChange = (marker: string): number | null => {
    const points = chartPointsForMarker(marker);
    const latest = points[points.length - 1];
    const previous = points[points.length - 2];
    if (!latest || !previous) {
      return null;
    }
    return calculatePercentChange(latest.value, previous.value);
  };

  const markerBaselineDelta = (marker: string): number | null => {
    if (!baselineReport) {
      return null;
    }
    const points = chartPointsForMarker(marker);
    const latest = points[points.length - 1];
    if (!latest) {
      return null;
    }
    const baselinePoint = buildMarkerSeries([baselineReport], marker, appData.settings.unitSystem)[0];
    if (!baselinePoint) {
      return null;
    }
    return calculatePercentVsBaseline(latest.value, baselinePoint.value);
  };

  const expandedMarkerPoints = useMemo(
    () => (expandedMarker ? chartPointsForMarker(expandedMarker) : []),
    [expandedMarker, visibleReports, appData.settings.unitSystem]
  );

  const expandedMarkerColorIndex = useMemo(() => {
    if (!expandedMarker) {
      return 0;
    }
    const allIndex = allMarkers.indexOf(expandedMarker);
    if (allIndex >= 0) {
      return allIndex;
    }
    const primaryIndex = primaryMarkers.findIndex((item) => item === expandedMarker);
    return primaryIndex >= 0 ? primaryIndex : 0;
  }, [expandedMarker, allMarkers, primaryMarkers]);

  const outOfRangeCount = useMemo(() => {
    let count = 0;
    visibleReports.forEach((report) => {
      report.markers.forEach((marker) => {
        if (marker.abnormal === "high" || marker.abnormal === "low") {
          count += 1;
        }
      });
    });
    return count;
  }, [visibleReports]);

  const generateShareLink = async () => {
    if (typeof window === "undefined") {
      return;
    }
    const token = buildShareToken(appData, shareOptions);
    if (!token) {
      return;
    }
    const shareUrl = `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(token)}`;
    setShareLink(shareUrl);
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Clipboard is optional here; the generated URL is still shown in the UI.
    }
  };

  const activeTabTitle = getTabLabel(activeTab, appData.settings.language);
  const analysisResultDisplay = useMemo(() => normalizeAnalysisTextForDisplay(analysisResult), [analysisResult]);
  const visibleTabs = isShareMode ? TAB_ITEMS.filter((tab) => tab.key === "dashboard") : TAB_ITEMS;

  const timeRangeOptions: Array<[TimeRangeKey, string]> = isNl
    ? [
        ["3m", "3 maanden"],
        ["6m", "6 maanden"],
        ["12m", "12 maanden"],
        ["all", "Alles"],
        ["custom", "Aangepast"]
      ]
    : [
        ["3m", "3 months"],
        ["6m", "6 months"],
        ["12m", "12 months"],
        ["all", "All time"],
        ["custom", "Custom"]
      ];

  const samplingOptions: Array<[AppSettings["samplingFilter"], string]> = isNl
    ? [
        ["all", "Alles"],
        ["trough", "Alleen trough"],
        ["peak", "Alleen peak"]
      ]
    : [
        ["all", "Show all"],
        ["trough", "Trough only"],
        ["peak", "Peak only"]
      ];

  return (
    <div className="min-h-screen px-3 py-4 text-slate-100 sm:px-5 lg:px-6">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 lg:flex-row">
        <aside className="w-full rounded-2xl border border-slate-700/70 bg-slate-900/70 p-3 lg:sticky lg:top-4 lg:w-72 lg:self-start">
          <div className="brand-card mb-4 rounded-xl bg-gradient-to-br from-cyan-400/20 to-emerald-400/15 p-3">
            <img
              src={appData.settings.theme === "dark" ? trtLogoDark : trtLogoLight}
              alt="TRT Lab Tracker"
              className="brand-logo mx-auto w-full max-w-[230px]"
            />
            <p className="brand-subtitle mt-2 text-center text-xs text-slate-200/90">{t(appData.settings.language, "subtitle")}</p>
          </div>

          <nav className="space-y-1.5">
            {visibleTabs.map((tab) => {
              const icon =
                tab.key === "dashboard" ? (
                  <BarChart3 className="h-4 w-4" />
                ) : tab.key === "protocolImpact" ? (
                  <Gauge className="h-4 w-4" />
                ) : tab.key === "doseResponse" ? (
                  <SlidersHorizontal className="h-4 w-4" />
                ) : tab.key === "alerts" ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : tab.key === "reports" ? (
                  <ClipboardList className="h-4 w-4" />
                ) : tab.key === "analysis" ? (
                  <Sparkles className="h-4 w-4" />
                ) : (
                  <Cog className="h-4 w-4" />
                );

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as TabKey)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                    activeTab === tab.key
                      ? "bg-cyan-500/15 text-cyan-200"
                      : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-100"
                  }`}
                >
                  {icon}
                  {getTabLabel(tab.key as TabKey, appData.settings.language)}
                </button>
              );
            })}
          </nav>

          {isShareMode ? (
            <div className="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-100">
              <p className="font-semibold">{isNl ? "Read-only deellink-snapshot" : "Read-only share snapshot"}</p>
              <p className="mt-1">
                {isNl
                  ? "Bewerken, uploads, API-keys en lokale opslagwijzigingen zijn uitgeschakeld in deze weergave."
                  : "Editing, uploads, API keys and local data writes are disabled in this view."}
              </p>
              {sharedSnapshot?.generatedAt ? (
                <p className="mt-1 text-cyan-200/80">{isNl ? "Gegenereerd" : "Generated"}: {formatDate(sharedSnapshot.generatedAt)}</p>
              ) : null}
            </div>
          ) : (
            <div ref={uploadPanelRef} className="mt-4 rounded-xl border border-slate-700 bg-slate-900/80 p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">{t(appData.settings.language, "uploadPdf")}</p>
              <UploadPanel isProcessing={isProcessing} onFileSelected={handleUpload} language={appData.settings.language} />
              <button
                type="button"
                className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:border-cyan-500/50 hover:text-cyan-200"
                onClick={startManualEntry}
              >
                <Plus className="h-4 w-4" /> {t(appData.settings.language, "addManualValue")}
              </button>
              {uploadError ? (
                <div className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  {uploadError}
                </div>
              ) : null}
            </div>
          )}

          <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/80 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">{appData.settings.language === "nl" ? "Snel overzicht" : "Quick stats"}</p>
            <div className="mt-2 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">{t(appData.settings.language, "reports")}</span>
                <span className="font-semibold text-slate-100">{reports.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">{t(appData.settings.language, "markersTracked")}</span>
                <span className="font-semibold text-slate-100">{allMarkers.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">{t(appData.settings.language, "outOfRange")}</span>
                <span className="font-semibold text-amber-300">{outOfRangeCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">{t(appData.settings.language, "trtStabilityShort")}</span>
                <span className="font-semibold text-cyan-200">{trtStability.score === null ? "-" : `${trtStability.score}`}</span>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-3" id="dashboard-export-root">
          <header className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-2.5 sm:p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-100 sm:text-lg">{activeTabTitle}</h2>
                  <p className="text-sm text-slate-400">
                    {isShareMode
                      ? isNl
                        ? "Gedeelde read-only snapshot van tijdlijntrends en markercontext."
                        : "Shared read-only snapshot of timeline trends and marker context."
                      : isNl
                        ? "Professionele bloedwaardetracking met bewerkbare extractie en trendvisualisatie."
                        : "Professional blood work tracking with editable extraction and visual trends."}
                  </p>
                </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  className="rounded-md border border-slate-600 px-2.5 py-1.25 text-sm text-slate-200 hover:border-cyan-500/50"
                  onClick={() => updateSettings({ language: appData.settings.language === "nl" ? "en" : "nl" })}
                >
                  {t(appData.settings.language, "language")}: {appData.settings.language.toUpperCase()}
                </button>
                <button
                  type="button"
                  className={`rounded-md px-2.5 py-1.25 text-sm ${
                    appData.settings.theme === "dark" ? "bg-slate-800 text-slate-100" : "bg-slate-200 text-slate-900"
                  }`}
                  onClick={() => updateSettings({ theme: appData.settings.theme === "dark" ? "light" : "dark" })}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {appData.settings.theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}{" "}
                    {t(appData.settings.language, "theme")}
                  </span>
                </button>
              </div>
            </div>
          </header>

          <AnimatePresence mode="wait">
            {draft && !isShareMode ? (
              <ExtractionReviewTable
                key="draft"
                draft={draft}
                annotations={draftAnnotations}
                language={appData.settings.language}
                showSamplingTiming={samplingControlsEnabled}
                onDraftChange={setDraft}
                onAnnotationsChange={setDraftAnnotations}
                onSave={saveDraftAsReport}
                onCancel={() => setDraft(null)}
              />
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {!isShareMode && hasDemoData ? (
              <motion.section
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className={demoBannerClassName}
              >
                <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
                  <div className={demoBannerTextClassName}>
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      {isDemoMode
                        ? tr(
                            "Je bekijkt demodata. Dit zijn voorbeeldgegevens om te laten zien hoe de app werkt.",
                            "You're viewing demo data. This is sample data to show how the app works."
                          )
                        : tr(
                            "Demodata is nog geladen. Wis het wanneer je klaar bent.",
                            "Demo data is still loaded. Clear it when you're ready."
                          )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={clearDemoButtonClassName}
                      onClick={clearDemoData}
                    >
                      {tr("Wis demo & begin opnieuw", "Clear demo & start fresh")}
                    </button>
                    {isDemoMode ? (
                      <button
                        type="button"
                        className={uploadOwnPdfButtonClassName}
                        onClick={clearDemoAndUpload}
                      >
                        {tr("Upload je eigen PDF", "Upload your own PDF")}
                      </button>
                    ) : null}
                  </div>
                </div>
              </motion.section>
            ) : null}
          </AnimatePresence>

          {activeTab === "dashboard" ? (
            <DashboardView
              reports={reports}
              visibleReports={visibleReports}
              allMarkers={allMarkers}
              primaryMarkers={primaryMarkers}
              dosePhaseBlocks={dosePhaseBlocks}
              trendByMarker={trendByMarker}
              alertsByMarker={alertsByMarker}
              trtStability={trtStability}
              settings={appData.settings}
              language={appData.settings.language}
              isShareMode={isShareMode}
              samplingControlsEnabled={samplingControlsEnabled}
              dashboardView={dashboardView}
              comparisonMode={comparisonMode}
              leftCompareMarker={leftCompareMarker}
              rightCompareMarker={rightCompareMarker}
              timeRangeOptions={timeRangeOptions}
              samplingOptions={samplingOptions}
              onUpdateSettings={updateSettings}
              onDashboardViewChange={setDashboardView}
              onComparisonModeChange={setComparisonMode}
              onLeftCompareMarkerChange={setLeftCompareMarker}
              onRightCompareMarkerChange={setRightCompareMarker}
              onExpandMarker={setExpandedMarker}
              onRenameMarker={openRenameDialog}
              chartPointsForMarker={chartPointsForMarker}
              markerPercentChange={markerPercentChange}
              markerBaselineDelta={markerBaselineDelta}
              onLoadDemo={loadDemoData}
              onUploadClick={scrollToUploadPanel}
            />
          ) : null}

          {activeTab === "alerts" ? (
            <AlertsView
              alerts={alerts}
              actionableAlerts={actionableAlerts}
              positiveAlerts={positiveAlerts}
              alertSeriesByMarker={alertSeriesByMarker}
              settings={appData.settings}
              language={appData.settings.language}
              samplingControlsEnabled={samplingControlsEnabled}
            />
          ) : null}

          {activeTab === "protocolImpact" ? (
            <ProtocolImpactView
              protocolDoseOverview={protocolDoseOverview}
              protocolDoseEvents={protocolDoseEvents}
              protocolWindowSize={protocolWindowSize}
              protocolMarkerSearch={protocolMarkerSearch}
              protocolCategoryFilter={protocolCategoryFilter}
              protocolSortKey={protocolSortKey}
              collapsedProtocolEvents={collapsedProtocolEvents}
              settings={appData.settings}
              language={appData.settings.language}
              onProtocolWindowSizeChange={setProtocolWindowSize}
              onProtocolMarkerSearchChange={setProtocolMarkerSearch}
              onProtocolCategoryFilterChange={setProtocolCategoryFilter}
              onProtocolSortKeyChange={setProtocolSortKey}
              onToggleCollapsedEvent={(eventId) =>
                setCollapsedProtocolEvents((current) =>
                  current.includes(eventId) ? current.filter((id) => id !== eventId) : [...current, eventId]
                )
              }
            />
          ) : null}

          {activeTab === "doseResponse" ? (
            <DoseResponseView
              dosePredictions={dosePredictions}
              customDoseValue={customDoseValue}
              hasCustomDose={hasCustomDose}
              doseResponseInput={doseResponseInput}
              visibleReports={visibleReports}
              settings={appData.settings}
              language={appData.settings.language}
              onDoseResponseInputChange={setDoseResponseInput}
            />
          ) : null}

          {activeTab === "reports" ? (
            <ReportsView
              reports={reports}
              settings={appData.settings}
              language={appData.settings.language}
              samplingControlsEnabled={samplingControlsEnabled}
              isShareMode={isShareMode}
              onDeleteReport={deleteReportFromData}
              onDeleteReports={deleteReportsFromData}
              onUpdateReportAnnotations={updateReportAnnotations}
              onSetBaseline={setBaseline}
              onRenameMarker={openRenameDialog}
            />
          ) : null}

          {activeTab === "analysis" ? (
            <AnalysisView
              isAnalyzingLabs={isAnalyzingLabs}
              analysisError={analysisError}
              analysisResult={analysisResult}
              analysisResultDisplay={analysisResultDisplay}
              analysisGeneratedAt={analysisGeneratedAt}
              analysisCopied={analysisCopied}
              analysisKind={analysisKind}
              analyzingKind={analyzingKind}
              visibleReports={visibleReports}
              samplingControlsEnabled={samplingControlsEnabled}
              allMarkersCount={allMarkers.length}
              betaRemaining={betaRemaining}
              betaLimits={betaLimits}
              settings={appData.settings}
              language={appData.settings.language}
              onRunAnalysis={runAiAnalysis}
              onCopyAnalysis={copyAnalysis}
            />
          ) : null}

          {activeTab === "settings" ? (
            <SettingsView
              settings={appData.settings}
              language={appData.settings.language}
              samplingControlsEnabled={samplingControlsEnabled}
              allMarkers={allMarkers}
              editableMarkers={editableMarkers}
              markerUsage={markerUsage}
              shareOptions={shareOptions}
              shareLink={shareLink}
              onUpdateSettings={updateSettings}
              onRemapMarker={remapMarkerAcrossReports}
              onOpenRenameDialog={openRenameDialog}
              onExportJson={exportJson}
              onExportCsv={exportCsv}
              onExportPdf={exportPdf}
              onImportData={importData}
              onAddMarkerSuggestions={appendMarkerSuggestions}
              onShareOptionsChange={setShareOptions}
              onGenerateShareLink={generateShareLink}
            />
          ) : null}
        </main>
      </div>

      <AnimatePresence>
        {expandedMarker ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setExpandedMarker(null)}
          >
            <motion.div
              className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 shadow-soft"
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 6 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-700/70 px-4 py-3 sm:px-5">
                <div>
                  <h3 className="text-base font-semibold text-slate-100">
                    {getMarkerDisplayName(expandedMarker, appData.settings.language)}
                  </h3>
                  <p className="text-xs text-slate-400">{tr("Gedetailleerde markergrafiek", "Detailed marker chart")}</p>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-2.5 py-1.5 text-xs text-slate-200 hover:border-cyan-500/50 hover:text-cyan-200"
                  onClick={() => setExpandedMarker(null)}
                >
                  <X className="h-4 w-4" /> {tr("Sluiten", "Close")}
                </button>
              </div>

              <div className="p-3 sm:p-5">
                <MarkerTrendChart
                  marker={expandedMarker}
                  points={expandedMarkerPoints}
                  colorIndex={expandedMarkerColorIndex}
                  settings={appData.settings}
                  language={appData.settings.language}
                  phaseBlocks={dosePhaseBlocks}
                  height={460}
                  showYearHints
                />
              </div>
            </motion.div>
          </motion.div>
        ) : null}

        {!isShareMode && markerSuggestions.length > 0 ? (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-3 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMarkerSuggestions([])}
          >
            <motion.div
              className="w-full max-w-2xl rounded-2xl border border-slate-700/80 bg-slate-900 shadow-soft"
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 4 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-slate-700/70 px-4 py-3">
                <h3 className="text-base font-semibold text-slate-100">
                  {tr("Marker review nodig", "Marker review needed")}
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  {tr(
                    "Deze markers lijken mogelijk dubbel. Je kunt nu meteen mergen of later via Settings > Marker Manager.",
                    "These markers may be duplicates. Merge now or do it later in Settings > Marker Manager."
                  )}
                </p>
              </div>
              <div className="max-h-[58vh] space-y-2 overflow-auto px-4 py-3">
                {markerSuggestions.map((item) => (
                  <div key={`${item.sourceCanonical}-${item.targetCanonical}`} className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                    <p className="text-sm text-slate-200">
                      <strong className="text-slate-100">{getMarkerDisplayName(item.sourceCanonical, appData.settings.language)}</strong>{" "}
                      {tr("lijkt op", "looks like")}{" "}
                      <strong className="text-slate-100">{getMarkerDisplayName(item.targetCanonical, appData.settings.language)}</strong>.
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {tr("Matchscore", "Match score")}: {(item.score * 100).toFixed(0)}%
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-xs text-cyan-200"
                        onClick={() => remapMarkerAcrossReports(item.sourceCanonical, item.targetCanonical)}
                      >
                        {tr("Merge nu", "Merge now")}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-600 px-2.5 py-1.5 text-xs text-slate-300"
                        onClick={() =>
                          setMarkerSuggestions((current) =>
                            current.filter(
                              (entry) =>
                                !(entry.sourceCanonical === item.sourceCanonical && entry.targetCanonical === item.targetCanonical)
                            )
                          )
                        }
                      >
                        {tr("Later", "Later")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-700/70 px-4 py-3 text-right">
                <button
                  type="button"
                  className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                  onClick={() => setMarkerSuggestions([])}
                >
                  {tr("Sluiten", "Close")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}

        {renameDialog ? (
          <motion.div
            className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/75 p-3 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setRenameDialog(null)}
          >
            <motion.div
              className="w-full max-w-lg rounded-2xl border border-slate-700/80 bg-slate-900 shadow-soft"
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 4 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-slate-700/70 px-4 py-3">
                <h3 className="text-base font-semibold text-slate-100">{tr("Marker hernoemen", "Rename marker")}</h3>
                <p className="mt-1 text-xs text-slate-400">
                  {tr("Wijzigt alle rapporten met deze marker.", "This updates all reports containing this marker.")}
                </p>
              </div>
              <div className="px-4 py-3">
                <label className="block text-xs uppercase tracking-wide text-slate-400">{tr("Nieuwe markernaam", "New marker name")}</label>
                <input
                  className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  value={renameDialog.draftName}
                  onChange={(event) =>
                    setRenameDialog((current) => (current ? { ...current, draftName: event.target.value } : current))
                  }
                  placeholder={tr("Bijv. Hematocrit", "e.g. Hematocrit")}
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-700/70 px-4 py-3">
                <button
                  type="button"
                  className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                  onClick={() => setRenameDialog(null)}
                >
                  {tr("Annuleren", "Cancel")}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200"
                  onClick={() => {
                    if (!renameDialog.draftName.trim()) {
                      return;
                    }
                    remapMarkerAcrossReports(renameDialog.sourceCanonical, renameDialog.draftName);
                    setRenameDialog(null);
                  }}
                >
                  {tr("Opslaan", "Save")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default App;
