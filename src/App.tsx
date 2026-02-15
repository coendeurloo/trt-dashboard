import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import {
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  CheckSquare,
  ChevronDown,
  ClipboardList,
  Copy,
  Cog,
  Download,
  FileText,
  Gauge,
  Info,
  Loader2,
  Lock,
  Link2,
  Moon,
  Pencil,
  Plus,
  Save,
  Sparkles,
  SlidersHorizontal,
  Square,
  Sun,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import {
  MarkerSeriesPoint,
  MarkerTrendSummary,
  DosePrediction,
  ProtocolImpactDoseEvent,
  buildAlerts,
  buildAlertsByMarker,
  buildDoseCorrelationInsights,
  buildProtocolImpactDoseEvents,
  buildDosePhaseBlocks,
  buildMarkerSeries,
  buildProtocolImpactSummary,
  buildTrtStabilitySeries,
  calculatePercentChange,
  calculatePercentVsBaseline,
  classifyMarkerTrend,
  computeTrtStabilityIndex,
  enrichReportsWithCalculatedMarkers,
  filterReportsBySampling,
  getTargetZone
} from "./analytics";
import { buildCsv } from "./csvExport";
import { CARDIO_PRIORITY_MARKERS, FEEDBACK_EMAIL, PRIMARY_MARKERS, TAB_ITEMS } from "./constants";
import AlertTrendMiniChart from "./components/AlertTrendMiniChart";
import ComparisonChart from "./components/ComparisonChart";
import DoseProjectionChart from "./components/DoseProjectionChart";
import ExtractionReviewTable from "./components/ExtractionReviewTable";
import MarkerChartCard from "./components/MarkerChartCard";
import MarkerInfoBadge from "./components/MarkerInfoBadge";
import MarkerTrendChart from "./components/MarkerTrendChart";
import UploadPanel from "./components/UploadPanel";
import { getDemoReports } from "./demoData";
import {
  abnormalStatusLabel,
  blankAnnotations,
  dedupeMarkersInReport,
  formatAxisTick,
  markerSimilarity,
  normalizeAnalysisTextForDisplay,
  stabilityColor
} from "./chartHelpers";
import { getMarkerDisplayName, getMarkerMeta, getTabLabel, t } from "./i18n";
import trtLogo from "./assets/trt-logo.png";
import { exportElementToPdf } from "./pdfExport";
import { extractLabData } from "./pdfParsing";
import { buildShareToken, parseShareToken, ShareOptions } from "./share";
import { coerceStoredAppData } from "./storage";
import { canonicalizeMarker, convertBySystem, normalizeMarkerMeasurement } from "./unitConversion";
import useAnalysis from "./hooks/useAnalysis";
import useAppData from "./hooks/useAppData";
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
  AppLanguage,
  TabKey,
  TimeRangeKey
} from "./types";
import {
  createId,
  deriveAbnormalFlag,
  formatDate,
  safeNumber,
  sortReportsChronological,
  withinRange
} from "./utils";

interface MarkerMergeSuggestion {
  sourceCanonical: string;
  targetCanonical: string;
  score: number;
}

const PROTOCOL_MARKER_CATEGORIES: Record<string, string[]> = {
  Hormones: ["Testosterone", "Free Testosterone", "Estradiol", "SHBG", "Free Androgen Index", "Dihydrotestosteron (DHT)"],
  Lipids: ["LDL Cholesterol", "HDL Cholesterol", "Cholesterol", "Triglyceriden", "Apolipoprotein B", "Non-HDL Cholesterol"],
  Hematology: ["Hematocrit", "Hemoglobin", "Red Blood Cells", "Platelets", "Leukocyten"],
  Inflammation: ["CRP"]
};

const detectMarkerMergeSuggestions = (
  incomingCanonicalMarkers: string[],
  existingCanonicalMarkers: string[]
): MarkerMergeSuggestion[] => {
  const existingSet = new Set(existingCanonicalMarkers);
  const suggestions = incomingCanonicalMarkers
    .map((source) => {
      if (existingSet.has(source) || source === "Unknown Marker") {
        return null;
      }
      let bestTarget = "";
      let bestScore = 0;
      for (const candidate of existingCanonicalMarkers) {
        if (candidate === source) {
          continue;
        }
        const score = markerSimilarity(source, candidate);
        if (score > bestScore) {
          bestScore = score;
          bestTarget = candidate;
        }
      }
      if (!bestTarget || bestScore < 0.82) {
        return null;
      }
      return {
        sourceCanonical: source,
        targetCanonical: bestTarget,
        score: Number(bestScore.toFixed(2))
      } satisfies MarkerMergeSuggestion;
    })
    .filter((item): item is MarkerMergeSuggestion => item !== null);

  return Array.from(
    suggestions
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
};

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
  const [reportComparisonOpen, setReportComparisonOpen] = useState(false);
  const { appData, setAppData, updateSettings, isNl, samplingControlsEnabled } = useAppData({
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

  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [expandedReportIds, setExpandedReportIds] = useState<string[]>([]);
  const [reportSortOrder, setReportSortOrder] = useState<"asc" | "desc">("desc");
  const [csvMarkerSelection, setCsvMarkerSelection] = useState<string[]>([]);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editingAnnotations, setEditingAnnotations] = useState<ReportAnnotations>(blankAnnotations());
  const [expandedMarker, setExpandedMarker] = useState<string | null>(null);
  const [protocolWindowSize, setProtocolWindowSize] = useState(2);
  const [protocolMarkerSearch, setProtocolMarkerSearch] = useState("");
  const [protocolCategoryFilter, setProtocolCategoryFilter] = useState<"all" | "Hormones" | "Lipids" | "Hematology" | "Inflammation">("all");
  const [protocolSortKey, setProtocolSortKey] = useState<"deltaPct" | "deltaAbs" | "marker">("deltaPct");
  const [collapsedProtocolEvents, setCollapsedProtocolEvents] = useState<string[]>([]);
  const [markerSuggestions, setMarkerSuggestions] = useState<MarkerMergeSuggestion[]>([]);
  const [renameDialog, setRenameDialog] = useState<{ sourceCanonical: string; draftName: string } | null>(null);
  const [mergeFromMarker, setMergeFromMarker] = useState("");
  const [mergeIntoMarker, setMergeIntoMarker] = useState("");
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importStatus, setImportStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const uploadPanelRef = useRef<HTMLDivElement | null>(null);

  const {
    reports,
    rangeFilteredReports,
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
    trtStabilitySeries,
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

  const {
    isAnalyzingLabs,
    analysisError,
    analysisResult,
    analysisGeneratedAt,
    analysisCopied,
    analysisKind,
    setAnalysisError,
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
    setCsvMarkerSelection((current) => {
      if (current.length === 0) {
        return allMarkers;
      }
      return current.filter((marker) => allMarkers.includes(marker));
    });
  }, [allMarkers]);

  useEffect(() => {
    if (editableMarkers.length === 0) {
      setMergeFromMarker("");
      setMergeIntoMarker("");
      return;
    }
    setMergeFromMarker((current) => (editableMarkers.includes(current) ? current : editableMarkers[0]));
    setMergeIntoMarker((current) => {
      if (editableMarkers.includes(current) && current !== (editableMarkers[0] ?? "")) {
        return current;
      }
      return editableMarkers.find((marker) => marker !== (editableMarkers[0] ?? "")) ?? "";
    });
  }, [editableMarkers]);

  useEffect(() => {
    setExpandedReportIds((current) => current.filter((id) => reports.some((report) => report.id === id)));
  }, [reports]);

  useEffect(() => {
    if (!editingReportId) {
      return;
    }
    setExpandedReportIds((current) => (current.includes(editingReportId) ? current : [...current, editingReportId]));
  }, [editingReportId]);

  useEffect(() => {
    if (!samplingControlsEnabled && (appData.settings.samplingFilter !== "all" || appData.settings.compareToBaseline)) {
      updateSettings({ samplingFilter: "all", compareToBaseline: false });
    }
  }, [samplingControlsEnabled, appData.settings.samplingFilter, appData.settings.compareToBaseline]);

  const remapMarkerAcrossReports = (sourceCanonical: string, targetLabel: string) => {
    const cleanLabel = targetLabel.trim();
    if (!cleanLabel) {
      return;
    }
    const targetCanonical = canonicalizeMarker(cleanLabel);
    setAppData((prev) => ({
      ...prev,
      reports: prev.reports.map((report) => {
        const rewritten = report.markers.map((marker) => {
          if (marker.canonicalMarker !== sourceCanonical || marker.isCalculated) {
            return marker;
          }
          const normalized = normalizeMarkerMeasurement({
            canonicalMarker: targetCanonical,
            value: marker.value,
            unit: marker.unit,
            referenceMin: marker.referenceMin,
            referenceMax: marker.referenceMax
          });
          return {
            ...marker,
            marker: cleanLabel,
            canonicalMarker: targetCanonical,
            value: normalized.value,
            unit: normalized.unit,
            referenceMin: normalized.referenceMin,
            referenceMax: normalized.referenceMax,
            abnormal: deriveAbnormalFlag(normalized.value, normalized.referenceMin, normalized.referenceMax)
          };
        });
        return {
          ...report,
          markers: dedupeMarkersInReport(rewritten)
        };
      })
    }));
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

    setAppData((prev) => ({
      ...prev,
      reports: sortReportsChronological([...prev.reports, report])
    }));
    if (suggestions.length > 0) {
      setMarkerSuggestions((current) => {
        const merged = [...current, ...suggestions];
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
    }

    setDraft(null);
    setDraftAnnotations(blankAnnotations());
    setUploadError("");
  };

  const deleteReport = (reportId: string) => {
    if (isShareMode) {
      return;
    }
    setAppData((prev) => ({
      ...prev,
      reports: prev.reports.filter((report) => report.id !== reportId)
    }));
    setSelectedReports((prev) => prev.filter((id) => id !== reportId));
    if (editingReportId === reportId) {
      setEditingReportId(null);
      setEditingAnnotations(blankAnnotations());
    }
  };

  const startEditingReport = (report: LabReport) => {
    if (isShareMode) {
      return;
    }
    setEditingReportId(report.id);
    setEditingAnnotations({ ...report.annotations });
  };

  const cancelEditingReport = () => {
    setEditingReportId(null);
    setEditingAnnotations(blankAnnotations());
  };

  const saveEditedReport = () => {
    if (!editingReportId) {
      return;
    }
    if (isShareMode) {
      return;
    }

    setAppData((prev) => ({
      ...prev,
      reports: prev.reports.map((report) =>
        report.id === editingReportId
          ? {
              ...report,
              annotations: samplingControlsEnabled
                ? editingAnnotations
                : {
                    ...editingAnnotations,
                    samplingTiming: "trough"
                  }
            }
          : report
      )
    }));
    setEditingReportId(null);
    setEditingAnnotations(blankAnnotations());
  };

  const setBaselineReport = (reportId: string) => {
    if (isShareMode) {
      return;
    }
    setAppData((prev) => ({
      ...prev,
      reports: prev.reports.map((report) => ({
        ...report,
        isBaseline: report.id === reportId
      }))
    }));
  };

  const deleteSelectedReports = () => {
    if (selectedReports.length === 0) {
      return;
    }
    if (isShareMode) {
      return;
    }

    const selected = new Set(selectedReports);
    setAppData((prev) => ({
      ...prev,
      reports: prev.reports.filter((report) => !selected.has(report.id))
    }));
    setSelectedReports([]);
  };

  const normalizeBaselineFlags = (reportsToNormalize: LabReport[]): LabReport[] => {
    let baselineSeen = false;
    return reportsToNormalize.map((report) => {
      if (!report.isBaseline) {
        return report;
      }
      if (!baselineSeen) {
        baselineSeen = true;
        return report;
      }
      return {
        ...report,
        isBaseline: false
      };
    });
  };

  const applyImportedData = (incomingRaw: unknown, mode: "merge" | "replace") => {
    const incoming = coerceStoredAppData(incomingRaw as Record<string, unknown>);
    const importedReports = sortReportsChronological(incoming.reports);
    const incomingCanonicalMarkers = Array.from(
      new Set(importedReports.flatMap((report) => report.markers.map((marker) => marker.canonicalMarker)))
    );

    if (mode === "replace") {
      const replaceConfirmed =
        typeof window === "undefined"
          ? true
          : window.confirm(
              tr(
                "Dit vervangt al je huidige data. Weet je het zeker?",
                "This will replace your current data. Are you sure?"
              )
            );
      if (!replaceConfirmed) {
        return;
      }

      setAppData((prev) => ({
        ...incoming,
        settings: {
          ...incoming.settings
        },
        reports: normalizeBaselineFlags(importedReports)
      }));
      setSelectedReports([]);
      setEditingReportId(null);
      setEditingAnnotations(blankAnnotations());
      setImportStatus({
        type: "success",
        message: tr(
          `Backup hersteld: ${importedReports.length} rapporten geladen.`,
          `Backup restored: ${importedReports.length} reports loaded.`
        )
      });
      return;
    }

    const mergeSuggestions = detectMarkerMergeSuggestions(incomingCanonicalMarkers, allMarkers);

    setAppData((prev) => {
      const byId = new Map<string, LabReport>();
      prev.reports.forEach((report) => {
        byId.set(report.id, report);
      });
      importedReports.forEach((report) => {
        byId.set(report.id, report);
      });
      const merged = normalizeBaselineFlags(sortReportsChronological(Array.from(byId.values())));
      return {
        ...prev,
        reports: merged
      };
    });
    setImportStatus({
      type: "success",
      message: tr(
        `Backup samengevoegd: ${importedReports.length} rapporten verwerkt.`,
        `Backup merged: processed ${importedReports.length} reports.`
      )
    });
    if (mergeSuggestions.length > 0) {
      setMarkerSuggestions((current) => {
        const merged = [...current, ...mergeSuggestions];
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
    }
  };

  const onImportBackupFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      applyImportedData(parsed, importMode);
    } catch {
      setImportStatus({
        type: "error",
        message: tr(
          "Import mislukt: dit lijkt geen geldig TRT backup JSON-bestand.",
          "Import failed: this does not look like a valid TRT backup JSON file."
        )
      });
    } finally {
      event.target.value = "";
    }
  };

  const exportJson = () => {
    const reportsForExport = reports.map((report) => ({
      ...report,
      markers: report.markers
        .filter((marker) => appData.settings.enableCalculatedFreeTestosterone || !marker.isCalculated)
        .map((marker) => ({
          ...marker,
          source: marker.isCalculated ? "calculated" : "measured"
        }))
    }));
    const exportPayload = {
      ...appData,
      reports: reportsForExport
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `trt-lab-data-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const csv = buildCsv(reports, csvMarkerSelection, appData.settings.unitSystem);
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

  const sortedReportsForList = useMemo(() => {
    const withIndex = reports.map((report, index) => ({ report, index }));
    withIndex.sort((left, right) => {
      const byDate = left.report.testDate.localeCompare(right.report.testDate);
      if (byDate !== 0) {
        return reportSortOrder === "asc" ? byDate : -byDate;
      }
      const byCreated = left.report.createdAt.localeCompare(right.report.createdAt);
      if (byCreated !== 0) {
        return reportSortOrder === "asc" ? byCreated : -byCreated;
      }
      return left.index - right.index;
    });
    return withIndex.map((item) => item.report);
  }, [reports, reportSortOrder]);

  const compareReports = useMemo(
    () => reports.filter((report) => selectedReports.includes(report.id)).sort((left, right) => left.testDate.localeCompare(right.testDate)),
    [reports, selectedReports]
  );

  const comparedMarkerRows = useMemo(() => {
    if (compareReports.length < 2) {
      return [];
    }
    const markerSet = new Set<string>();
    compareReports.forEach((report) => {
      report.markers.forEach((marker) => markerSet.add(marker.canonicalMarker));
    });
    return Array.from(markerSet).sort((left, right) => left.localeCompare(right));
  }, [compareReports]);

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

  const samplingTimingLabel = (value: ReportAnnotations["samplingTiming"]): string => {
    if (value === "unknown") {
      return isNl ? "Onbekend" : "Unknown";
    }
    if (value === "trough") {
      return "Trough";
    }
    if (value === "mid") {
      return isNl ? "Midden" : "Mid";
    }
    return "Peak";
  };

  const confidenceLabel = (value: string): string => {
    if (!isNl) {
      return value;
    }
    if (value === "High") {
      return "Hoog";
    }
    if (value === "Medium") {
      return "Middel";
    }
    if (value === "Low") {
      return "Laag";
    }
    return value;
  };

  const alertSeverityLabel = (severity: "high" | "medium" | "low"): string => {
    if (!isNl) {
      return severity;
    }
    if (severity === "high") {
      return "hoog";
    }
    if (severity === "medium") {
      return "middel";
    }
    return "laag";
  };

  const alertTypeLabel = (type: "threshold" | "trend"): string => {
    if (type === "threshold") {
      return isNl ? "Drempel" : "Threshold";
    }
    return isNl ? "Trend" : "Trend";
  };
  const settingsFeedbackMailto = useMemo(() => {
    const subject = isNl ? "Feedback PDF-verwerking" : "PDF Parsing Feedback";
    const body = isNl
      ? [
          "Hoi,",
          "",
          "Ik loop tegen problemen aan met het verwerken van lab-PDF's.",
          "",
          "Lab / land: [vul in]",
          "Wat ging er mis: [vul in]",
          "",
          "---",
          "Stuur bij voorkeur geen PDF mee vanwege medische privacy.",
          "Omschrijf liever welke markers ontbraken of verkeerd waren."
        ].join("\n")
      : [
          "Hi,",
          "",
          "I'm having trouble with lab PDF parsing.",
          "",
          "Lab / country: [fill in]",
          "What went wrong: [fill in]",
          "",
          "---",
          "Please avoid attaching medical PDFs for privacy.",
          "Describe which markers were missing or incorrect."
        ].join("\n");
    return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [isNl]);

  return (
    <div className="min-h-screen px-3 py-4 text-slate-100 sm:px-5 lg:px-6">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 lg:flex-row">
        <aside className="w-full rounded-2xl border border-slate-700/70 bg-slate-900/70 p-3 lg:sticky lg:top-4 lg:w-72 lg:self-start">
          <div className="brand-card mb-4 rounded-xl bg-gradient-to-br from-cyan-400/20 to-emerald-400/15 p-3">
            <img src={trtLogo} alt="TRT Lab Tracker" className="brand-logo mx-auto w-full max-w-[230px]" />
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
                {isShareMode ? null : (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-2.5 py-1.25 text-sm text-slate-200 hover:border-cyan-500/50"
                    onClick={exportJson}
                  >
                    <Download className="h-4 w-4" /> JSON
                  </button>
                )}
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
                className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-3 sm:p-4"
              >
                <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-2 text-sm text-cyan-100">
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
                      className="rounded-md border border-cyan-500/50 bg-cyan-500/15 px-3 py-1.5 text-sm text-cyan-100 hover:border-cyan-400 hover:bg-cyan-500/20"
                      onClick={clearDemoData}
                    >
                      {tr("Wis demo & begin opnieuw", "Clear demo & start fresh")}
                    </button>
                    {isDemoMode ? (
                      <button
                        type="button"
                        className="rounded-md border border-slate-600 bg-slate-800/70 px-3 py-1.5 text-sm text-slate-200 hover:border-cyan-500/50 hover:text-cyan-200"
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
            <DashboardView>
              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {timeRangeOptions.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`rounded-md px-2.5 py-1 text-xs sm:text-sm ${
                        appData.settings.timeRange === value
                          ? "bg-cyan-500/20 text-cyan-200"
                          : "bg-slate-800 text-slate-300 hover:text-slate-100"
                      }`}
                      onClick={() => updateSettings({ timeRange: value })}
                    >
                      {label}
                    </button>
                  ))}

                  {appData.settings.timeRange === "custom" ? (
                    <div className="ml-0 flex flex-wrap items-center gap-2 sm:ml-2">
                      <input
                        type="date"
                        className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm"
                        value={appData.settings.customRangeStart}
                        onChange={(event) => updateSettings({ customRangeStart: event.target.value })}
                      />
                      <input
                        type="date"
                        className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm"
                        value={appData.settings.customRangeEnd}
                        onChange={(event) => updateSettings({ customRangeEnd: event.target.value })}
                      />
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className={`ml-auto rounded-md px-2.5 py-1 text-xs sm:text-sm ${
                      comparisonMode ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800 text-slate-300"
                    }`}
                    onClick={() => setComparisonMode((prev) => !prev)}
                  >
                    <span className="inline-flex items-center gap-1">
                      <SlidersHorizontal className="h-4 w-4" /> {isNl ? "Multi-marker modus" : "Multi-marker mode"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-slate-800 px-2.5 py-1 text-xs text-slate-300 sm:text-sm"
                    onClick={() => updateSettings({ unitSystem: appData.settings.unitSystem === "eu" ? "us" : "eu" })}
                  >
                    {isNl ? "Eenheden" : "Units"}: {appData.settings.unitSystem.toUpperCase()}
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
                    <input
                      type="checkbox"
                      checked={appData.settings.showReferenceRanges}
                      onChange={(event) => updateSettings({ showReferenceRanges: event.target.checked })}
                    />
                    {isNl ? "Referentiebereiken" : "Reference ranges"}
                  </label>
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
                    <input
                      type="checkbox"
                      checked={appData.settings.showAbnormalHighlights}
                      onChange={(event) => updateSettings({ showAbnormalHighlights: event.target.checked })}
                    />
                    {isNl ? "Afwijkende waarden markeren" : "Abnormal highlights"}
                  </label>
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
                    <input
                      type="checkbox"
                      checked={appData.settings.showAnnotations}
                      onChange={(event) => updateSettings({ showAnnotations: event.target.checked })}
                    />
                    {isNl ? "Dosisfase-overlay" : "Dose-phase overlays"}
                  </label>
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
                    <input
                      type="checkbox"
                      checked={appData.settings.showTrtTargetZone}
                      onChange={(event) => updateSettings({ showTrtTargetZone: event.target.checked })}
                    />
                    {isNl ? "TRT-doelzone" : "TRT optimal zone"}
                  </label>
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
                    <input
                      type="checkbox"
                      checked={appData.settings.showLongevityTargetZone}
                      onChange={(event) => updateSettings({ showLongevityTargetZone: event.target.checked })}
                    />
                    {isNl ? "Longevity-doelzone" : "Longevity zone"}
                  </label>
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
                    <input
                      type="checkbox"
                      checked={appData.settings.yAxisMode === "data"}
                      onChange={(event) => updateSettings({ yAxisMode: event.target.checked ? "data" : "zero" })}
                    />
                    {isNl ? "Gebruik data-bereik Y-as" : "Use data-range Y-axis"}
                  </label>
                </div>

                {samplingControlsEnabled ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
                      {isNl ? "Meetmoment-filter" : "Sampling filter"}
                    </span>
                    {samplingOptions.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`rounded-md px-2.5 py-1 text-xs sm:text-sm ${
                          appData.settings.samplingFilter === value
                            ? "bg-cyan-500/20 text-cyan-200"
                            : "bg-slate-800 text-slate-300 hover:text-slate-100"
                        }`}
                        onClick={() => updateSettings({ samplingFilter: value })}
                      >
                        {label}
                      </button>
                    ))}
                    <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
                      <input
                        type="checkbox"
                        checked={appData.settings.compareToBaseline}
                        onChange={(event) => updateSettings({ compareToBaseline: event.target.checked })}
                      />
                      {isNl ? "Vergelijk met baseline" : "Compare to baseline"}
                    </label>
                  </div>
                ) : null}
              </div>

              {comparisonMode ? (
                <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-2.5">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                      value={leftCompareMarker}
                      onChange={(event) => setLeftCompareMarker(event.target.value)}
                    >
                      {allMarkers.map((marker) => (
                        <option key={marker} value={marker}>
                          {getMarkerDisplayName(marker, appData.settings.language)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                      value={rightCompareMarker}
                      onChange={(event) => setRightCompareMarker(event.target.value)}
                    >
                      {allMarkers.map((marker) => (
                        <option key={marker} value={marker}>
                          {getMarkerDisplayName(marker, appData.settings.language)}
                        </option>
                      ))}
                    </select>
                    <label className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-2 text-xs text-slate-300 sm:text-sm">
                      <input
                        type="checkbox"
                        checked={appData.settings.comparisonScale === "normalized"}
                        onChange={(event) =>
                          updateSettings({
                            comparisonScale: event.target.checked ? "normalized" : "absolute"
                          })
                        }
                      />
                      {appData.settings.language === "nl" ? "Genormaliseerde schaal (0-100%)" : "Normalized scale (0-100%)"}
                    </label>
                  </div>

                  <ComparisonChart
                    leftMarker={leftCompareMarker}
                    rightMarker={rightCompareMarker}
                    reports={visibleReports}
                    settings={appData.settings}
                    language={appData.settings.language}
                  />
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-2.5">
                <div className="mb-3 flex gap-2">
                  <button
                    type="button"
                    className={`rounded-md px-3 py-1.5 text-sm ${
                      dashboardView === "primary" ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-800 text-slate-300"
                    }`}
                    onClick={() => setDashboardView("primary")}
                  >
                    {isNl ? "Primaire markers" : "Primary markers"}
                  </button>
                  <button
                    type="button"
                    className={`rounded-md px-3 py-1.5 text-sm ${
                      dashboardView === "all" ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-800 text-slate-300"
                    }`}
                    onClick={() => setDashboardView("all")}
                  >
                    {isNl ? "Alle markers" : "All markers"}
                  </button>
                </div>

                {dashboardView === "primary" ? (
                  <div className="mb-1" />
                ) : null}

                {visibleReports.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-700 py-14 text-center">
                    <p className="text-base font-semibold text-slate-200">{isNl ? "Geen data in huidige filter" : "No data in current filter"}</p>
                    <p className="mt-1 text-sm text-slate-400">
                      {reports.length === 0
                        ? isNl
                          ? "Upload je eerste PDF om TRT-bloedwaardetrends te volgen."
                          : "Upload your first PDF to start tracking TRT blood work trends."
                        : isNl
                          ? samplingControlsEnabled
                            ? "Pas tijdsbereik of meetmoment-filter aan om data te tonen."
                            : "Pas het tijdsbereik aan om data te tonen."
                          : samplingControlsEnabled
                            ? "Change time range or sampling filter to show data."
                            : "Change time range to show data."}
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
                          settings={appData.settings}
                          language={appData.settings.language}
                          phaseBlocks={dosePhaseBlocks}
                          alertCount={alertsByMarker[marker]?.length ?? 0}
                          trendSummary={trendByMarker[marker] ?? null}
                          percentChange={markerPercentChange(marker)}
                          baselineDelta={markerBaselineDelta(marker)}
                          isCalculatedMarker={points.length > 0 && points.every((point) => point.isCalculated)}
                          onOpenLarge={() => setExpandedMarker(marker)}
                          onRenameMarker={openRenameDialog}
                        />
                      );
                    })}
                  </div>
                )}

                {dashboardView === "primary" ? (
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
                          {isNl
                            ? "Dit is een rust-score van je kern TRT-markers over tijd (Testosteron, Estradiol, Hematocriet, SHBG)."
                            : "This is a steadiness score of your core TRT markers over time (Testosterone, Estradiol, Hematocrit, SHBG)."}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {isNl
                            ? "Belangrijk: het zegt niets over ‘goed’ of ‘slecht’, alleen hoe stabiel je patroon is."
                            : "Important: it does not mean 'good' or 'bad'; it only reflects how stable your pattern is."}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {isNl
                            ? "Snelle interpretatie: 80-100 = vrij stabiel, 60-79 = matig stabiel, <60 = duidelijk wisselend."
                            : "Quick interpretation: 80-100 = fairly stable, 60-79 = moderately stable, <60 = clearly variable."}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </DashboardView>
          ) : null}

          {activeTab === "alerts" ? (
            <AlertsView>
              <div className="alerts-hero rounded-2xl border border-slate-700/70 bg-gradient-to-br from-slate-900/80 via-slate-900/70 to-cyan-950/25 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-100">{isNl ? "Alerts Centrum" : "Alerts Center"}</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      {isNl
                        ? "Signalen met context en suggesties om met je arts te bespreken."
                        : "Signals with context and discussion suggestions for your doctor."}
                    </p>
                  </div>
                  {samplingControlsEnabled ? (
                    <span className="rounded-full border border-cyan-500/40 bg-cyan-500/15 px-3 py-1 text-xs text-cyan-200">
                      {isNl ? "Filter actief" : "Filter active"}: {appData.settings.samplingFilter}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                    <p className="text-xs uppercase tracking-wide text-rose-200">{isNl ? "Actie nodig" : "Action needed"}</p>
                    <p className="mt-1 text-2xl font-semibold text-rose-100">{actionableAlerts.length}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <p className="text-xs uppercase tracking-wide text-emerald-200">{isNl ? "Positieve signalen" : "Positive signals"}</p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-100">{positiveAlerts.length}</p>
                  </div>
                  <div className="rounded-xl border border-slate-600 bg-slate-800/70 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-300">{isNl ? "Totaal" : "Total alerts"}</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-100">{alerts.length}</p>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-900/60 p-3 text-xs text-slate-300">
                  {isNl
                    ? "Leesvolgorde: 1) bekijk eerst 'Positieve signalen', 2) zie wat al goed gaat, 3) ga daarna naar 'Actie nodig' voor de aandachtspunten."
                    : "Reading order: 1) review 'Positive signals' first, 2) see what is already going well, 3) then review 'Action needed' for attention points."}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h4 className="text-sm font-semibold text-slate-100">{isNl ? "Positieve signalen" : "Positive signals"}</h4>
                <p className="mt-1 text-xs text-slate-400">
                  {isNl
                    ? "Waarden of trends die momenteel gunstig ogen worden hier groen gemarkeerd."
                    : "Values or trends that currently look favorable are shown here in green."}
                </p>
                {positiveAlerts.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-400">{isNl ? "Nog geen positieve signalen in deze filter." : "No positive signals in this filter yet."}</p>
                ) : (
                  <div className="mt-3 columns-1 [column-gap:0.75rem] md:columns-2 2xl:columns-3">
                    {positiveAlerts.map((alert) => {
                      const series = alertSeriesByMarker[alert.marker] ?? [];
                      return (
                      <article key={alert.id} className="positive-alert-card mb-3 break-inside-avoid rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3 text-emerald-100">
                        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_190px]">
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold">{getMarkerDisplayName(alert.marker, appData.settings.language)}</p>
                              <span className="rounded-full border border-emerald-300/30 bg-emerald-500/20 px-2 py-0.5 text-[11px]">
                                {isNl ? "Positief" : "Positive"}
                              </span>
                            </div>
                            <p className="mt-1 text-sm leading-snug">{alert.message}</p>
                            <p className="mt-1 text-xs leading-snug text-emerald-200/90">{alert.suggestion}</p>
                            <p className="mt-1 text-[11px] text-emerald-200/80">{formatDate(alert.date)}</p>
                          </div>
                          <div>
                            <AlertTrendMiniChart
                              marker={alert.marker}
                              points={series}
                              highlightDate={alert.date}
                              language={appData.settings.language}
                              height={100}
                            />
                          </div>
                        </div>
                      </article>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h4 className="text-sm font-semibold text-slate-100">{isNl ? "Actiegerichte alerts" : "Actionable alerts"}</h4>
                <p className="mt-1 text-xs text-slate-400">
                  {isNl
                    ? "Dit zijn signalen waarbij vaak een bespreekactie of extra monitoring zinvol is."
                    : "These signals often benefit from discussion or additional monitoring."}
                </p>
                {actionableAlerts.length === 0 ? (
                  <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-4 text-sm text-emerald-200">
                    {isNl
                      ? "Geen alerts met directe actie in de huidige filter. Dat is meestal een goed teken."
                      : "No action-needed alerts in the current filter. That is usually a good sign."}
                  </div>
                ) : (
                  <div className="mt-3 columns-1 [column-gap:0.75rem] xl:columns-2">
                    {actionableAlerts.map((alert) => {
                      const cardClass =
                        alert.severity === "high"
                          ? "border-rose-500/40 bg-rose-500/10 text-rose-100"
                          : alert.severity === "medium"
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
                            : "border-slate-600 bg-slate-800/70 text-slate-100";
                      const series = alertSeriesByMarker[alert.marker] ?? [];
                      return (
                        <article key={alert.id} className={`mb-3 break-inside-avoid rounded-xl border p-3 shadow-soft ${cardClass}`}>
                          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_200px]">
                            <div>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold">
                                  {getMarkerDisplayName(alert.marker, appData.settings.language)}
                                </p>
                                <div className="flex items-center gap-1.5 text-[11px]">
                                  <span className="rounded-full border border-white/20 bg-black/15 px-2 py-0.5">
                                    {alertTypeLabel(alert.type)}
                                  </span>
                                  <span className="rounded-full border border-white/20 bg-black/15 px-2 py-0.5">
                                    {isNl ? "Prioriteit" : "Priority"}: {alertSeverityLabel(alert.severity)}
                                  </span>
                                </div>
                              </div>
                              <p className="mt-1 text-sm leading-snug">{alert.message}</p>
                              <div className="mt-1 rounded-lg border border-white/15 bg-slate-950/30 px-2.5 py-2">
                                <p className="text-[11px] uppercase tracking-wide opacity-80">
                                  {isNl ? "Mogelijke bespreekactie" : "Suggested discussion action"}
                                </p>
                                <p className="mt-1 text-xs leading-snug">{alert.suggestion}</p>
                              </div>
                              <p className="mt-1 text-[11px] opacity-75">{formatDate(alert.date)}</p>
                            </div>
                            <div>
                              <AlertTrendMiniChart
                                marker={alert.marker}
                                points={series}
                                highlightDate={alert.date}
                                language={appData.settings.language}
                                height={100}
                              />
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </AlertsView>
          ) : null}

          {activeTab === "protocolImpact" ? (
            <ProtocolImpactView>
              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h3 className="text-base font-semibold text-slate-100">{isNl ? "Protocol-impact" : "Protocol Impact"}</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                  <label className="text-xs text-slate-300">
                    {isNl ? "Zoek marker" : "Filter markers"}
                    <input
                      value={protocolMarkerSearch}
                      onChange={(event) => setProtocolMarkerSearch(event.target.value)}
                      placeholder={isNl ? "bijv. Estradiol" : "e.g. Estradiol"}
                      className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900/80 px-2.5 py-1.5 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-300">
                    {isNl ? "Window grootte" : "Window size"}
                    <select
                      value={protocolWindowSize}
                      onChange={(event) => setProtocolWindowSize(Number(event.target.value))}
                      className="mt-1 rounded-md border border-slate-600 bg-slate-900/80 px-2.5 py-1.5 text-sm text-slate-100"
                    >
                      {[1, 2, 3, 4].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-300">
                    {isNl ? "Categorie" : "Category"}
                    <select
                      value={protocolCategoryFilter}
                      onChange={(event) =>
                        setProtocolCategoryFilter(event.target.value as "all" | "Hormones" | "Lipids" | "Hematology" | "Inflammation")
                      }
                      className="mt-1 rounded-md border border-slate-600 bg-slate-900/80 px-2.5 py-1.5 text-sm text-slate-100"
                    >
                      <option value="all">{isNl ? "Alle categorieën" : "All categories"}</option>
                      <option value="Hormones">{isNl ? "Hormonen" : "Hormones"}</option>
                      <option value="Lipids">{isNl ? "Lipiden" : "Lipids"}</option>
                      <option value="Hematology">{isNl ? "Hematologie" : "Hematology"}</option>
                      <option value="Inflammation">{isNl ? "Ontsteking" : "Inflammation"}</option>
                    </select>
                  </label>
                </div>

                <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800/70 p-3">
                  <h4 className="text-sm font-semibold text-slate-100">{isNl ? "Dosis-respons overzicht" : "Dose Response Overview"}</h4>
                  {protocolDoseOverview.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-400">
                      {isNl ? "Nog te weinig punten (minimaal n=3 per marker) voor correlatie-overzicht." : "Not enough points yet (minimum n=3 per marker) for correlation overview."}
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-xs text-slate-300">
                      {protocolDoseOverview.map((item) => (
                        <li key={item.marker}>
                          {getMarkerDisplayName(item.marker, appData.settings.language)}{" "}
                          {item.r >= 0
                            ? isNl
                              ? "neigt omhoog bij hogere dosis"
                              : "tends to increase with higher dose"
                            : isNl
                              ? "neigt omlaag bij hogere dosis"
                              : "tends to decrease with higher dose"}{" "}
                          (r={formatAxisTick(item.r)}, n={item.n})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {protocolDoseEvents.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-400">
                    {isNl
                      ? "Nog geen dosisveranderingsevents gevonden in je huidige datafilter."
                      : "No dose change events found in your current data filter."}
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {protocolDoseEvents.map((event: ProtocolImpactDoseEvent) => {
                      const isCollapsed = collapsedProtocolEvents.includes(event.id);
                      const categorySet =
                        protocolCategoryFilter === "all"
                          ? null
                          : new Set(PROTOCOL_MARKER_CATEGORIES[protocolCategoryFilter] ?? []);
                      const query = protocolMarkerSearch.trim().toLowerCase();
                      const rows = event.rows
                        .filter((row) => {
                          if (categorySet && !categorySet.has(row.marker)) {
                            return false;
                          }
                          if (!query) {
                            return true;
                          }
                          const label = getMarkerDisplayName(row.marker, appData.settings.language).toLowerCase();
                          return label.includes(query) || row.marker.toLowerCase().includes(query);
                        })
                        .sort((left, right) => {
                          if (protocolSortKey === "marker") {
                            return left.marker.localeCompare(right.marker);
                          }
                          if (protocolSortKey === "deltaAbs") {
                            return Math.abs(right.deltaAbs ?? -Infinity) - Math.abs(left.deltaAbs ?? -Infinity);
                          }
                          return Math.abs(right.deltaPct ?? -Infinity) - Math.abs(left.deltaPct ?? -Infinity);
                        });
                      return (
                        <article key={event.id} className="rounded-xl border border-slate-700 bg-slate-800/70 p-3">
                          <button
                            type="button"
                            className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                            onClick={() =>
                              setCollapsedProtocolEvents((current) =>
                                current.includes(event.id) ? current.filter((id) => id !== event.id) : [...current, event.id]
                              )
                            }
                          >
                            <h4 className="text-sm font-semibold text-slate-100">
                              {(event.fromDose ?? "-")} {"->"} {(event.toDose ?? "-")} mg/week
                            </h4>
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-slate-400">
                                {formatDate(event.changeDate)} | {isNl ? "Window" : "Window"}: {event.beforeCount} {isNl ? "voor" : "before"} /{" "}
                                {event.afterCount} {isNl ? "na" : "after"}
                              </p>
                              <ChevronDown className={`h-4 w-4 text-slate-400 transition ${isCollapsed ? "" : "rotate-180"}`} />
                            </div>
                          </button>
                          {!isCollapsed ? (
                            <>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {event.topImpacts.length === 0 ? (
                                  <span className="text-xs text-slate-400">{isNl ? "Top impacts: onvoldoende data" : "Top impacts: insufficient data"}</span>
                                ) : (
                                  event.topImpacts.map((row) => (
                                    <span key={`${event.id}-${row.marker}`} className="rounded-full bg-slate-900/70 px-2 py-0.5 text-xs text-cyan-200">
                                      {getMarkerDisplayName(row.marker, appData.settings.language)}{" "}
                                      {row.deltaPct === null ? "-" : `${row.deltaPct > 0 ? "+" : ""}${row.deltaPct}%`}
                                    </span>
                                  ))
                                )}
                              </div>
                              <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                                <span>{isNl ? "Sorteer op" : "Sort by"}:</span>
                                <button type="button" className={`rounded px-2 py-0.5 ${protocolSortKey === "deltaPct" ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-900/70"}`} onClick={() => setProtocolSortKey("deltaPct")}>Δ%</button>
                                <button type="button" className={`rounded px-2 py-0.5 ${protocolSortKey === "deltaAbs" ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-900/70"}`} onClick={() => setProtocolSortKey("deltaAbs")}>Δ</button>
                                <button type="button" className={`rounded px-2 py-0.5 ${protocolSortKey === "marker" ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-900/70"}`} onClick={() => setProtocolSortKey("marker")}>{isNl ? "Marker" : "Marker"}</button>
                              </div>
                              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-700">
                                <table className="min-w-full divide-y divide-slate-700 text-xs">
                                  <thead className="bg-slate-900/70 text-slate-300">
                                    <tr>
                                      <th className="px-2 py-1.5 text-left">{isNl ? "Marker" : "Marker"}</th>
                                      <th className="px-2 py-1.5 text-right">{isNl ? "Voor gem." : "Before avg"}</th>
                                      <th className="px-2 py-1.5 text-right">{isNl ? "Na gem." : "After avg"}</th>
                                      <th className="px-2 py-1.5 text-right">Δ</th>
                                      <th className="px-2 py-1.5 text-right">Δ%</th>
                                      <th className="px-2 py-1.5 text-center">{isNl ? "Trend" : "Trend"}</th>
                                      <th className="px-2 py-1.5 text-left">{isNl ? "Confidence" : "Confidence"}</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-800">
                                    {rows.map((row) => (
                                      <tr key={`${event.id}-${row.marker}`} className="bg-slate-900/30 text-slate-200">
                                        <td className="px-2 py-1.5">{getMarkerDisplayName(row.marker, appData.settings.language)}</td>
                                        <td className="px-2 py-1.5 text-right">{row.beforeAvg === null ? "Insufficient data" : `${formatAxisTick(row.beforeAvg)} ${row.unit}`}</td>
                                        <td className="px-2 py-1.5 text-right">{row.afterAvg === null ? "Insufficient data" : `${formatAxisTick(row.afterAvg)} ${row.unit}`}</td>
                                        <td className="px-2 py-1.5 text-right">{row.deltaAbs === null ? "-" : formatAxisTick(row.deltaAbs)}</td>
                                        <td className="px-2 py-1.5 text-right">{row.deltaPct === null ? "-" : `${row.deltaPct > 0 ? "+" : ""}${row.deltaPct}%`}</td>
                                        <td className="px-2 py-1.5 text-center">
                                          {row.trend === "up" ? "↑" : row.trend === "down" ? "↓" : row.trend === "flat" ? "→" : "·"}
                                        </td>
                                        <td className="px-2 py-1.5" title={row.confidenceReason}>
                                          {confidenceLabel(row.confidence)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </ProtocolImpactView>
          ) : null}

          {activeTab === "doseResponse" ? (
            <DoseResponseView>
              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h3 className="text-base font-semibold text-slate-100">{isNl ? "Dosis-respons schattingen" : "Dose-response Estimates"}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {isNl
                    ? "In gewone taal: dit model schat, op basis van je eigen historie, wat er waarschijnlijk met een marker gebeurt als je dosis verandert."
                    : "In plain language: this model estimates, from your own history, what will likely happen to a marker if your dose changes."}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {isNl
                    ? "Alleen zichtbaar bij voldoende meetpunten; bedoeld als gesprekshulp met je arts."
                    : "Only shown with enough data points; intended as a discussion aid with your doctor."}
                </p>

                <div className="mt-3 rounded-lg border border-cyan-500/25 bg-cyan-500/5 p-3">
                  <label className="text-xs font-medium uppercase tracking-wide text-cyan-200">
                    {isNl ? "Simuleer testosterondosis (mg/week)" : "Simulate testosterone dose (mg/week)"}
                  </label>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      inputMode="decimal"
                      value={doseResponseInput}
                      onChange={(event) => setDoseResponseInput(event.target.value)}
                      placeholder={isNl ? "Bijv. 100" : "e.g. 100"}
                      className="w-40 rounded-md border border-slate-600 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setDoseResponseInput("")}
                      className="rounded-md border border-slate-600 px-2.5 py-1.5 text-xs text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200"
                    >
                      {isNl ? "Auto-scenario" : "Auto scenario"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    {hasCustomDose && customDoseValue !== null
                      ? isNl
                        ? `Actief scenario: ${formatAxisTick(customDoseValue)} mg/week voor alle voorspellingen.`
                        : `Active scenario: ${formatAxisTick(customDoseValue)} mg/week for all estimates.`
                      : isNl
                        ? "Geen handmatige dosis ingevuld; per marker wordt het standaard scenario gebruikt."
                        : "No manual dose entered; each marker currently uses its default scenario."}
                  </p>
                </div>

                {dosePredictions.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-400">
                    {isNl ? "Nog te weinig dose-gekoppelde meetpunten voor schattingen." : "Not enough dose-linked data points yet for estimates."}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm">
                    {dosePredictions.map((prediction) => {
                      const markerLabel = getMarkerDisplayName(prediction.marker, appData.settings.language);
                      const targetDose = hasCustomDose && customDoseValue !== null ? customDoseValue : prediction.suggestedDose;
                      const canPredict = prediction.status === "clear";
                      const targetEstimate =
                        canPredict
                          ? Math.max(0, prediction.intercept + prediction.slopePerMg * targetDose)
                          : null;
                      const targetPercentChange =
                        canPredict && targetEstimate !== null
                          ? calculatePercentChange(targetEstimate, prediction.currentEstimate)
                          : null;
                      const currentEstimate = `${formatAxisTick(prediction.currentEstimate)} ${prediction.unit}`;
                      const projectedEstimate = targetEstimate === null ? "-" : `${formatAxisTick(targetEstimate)} ${prediction.unit}`;
                      const pctText =
                        targetPercentChange === null
                          ? isNl
                            ? "onbekend"
                            : "unknown"
                          : `${targetPercentChange > 0 ? "+" : ""}${targetPercentChange}%`;
                      const directionText =
                        targetPercentChange === null
                          ? isNl
                            ? "verandering"
                            : "change"
                          : targetPercentChange >= 0
                            ? isNl
                              ? "stijging"
                              : "increase"
                            : isNl
                              ? "daling"
                              : "decrease";
                      const correlationText =
                        prediction.correlationR === null
                          ? isNl
                            ? "n.v.t."
                            : "n/a"
                          : `${prediction.correlationR > 0 ? "+" : ""}${formatAxisTick(prediction.correlationR)}`;
                      const usedDatesText =
                        prediction.usedReportDates.length === 0
                          ? "-"
                          : prediction.usedReportDates.join(", ");
                      const excludedSummary =
                        prediction.excludedPoints.length === 0
                          ? null
                          : prediction.excludedPoints
                              .slice(0, 3)
                              .map((item) => `${item.date}: ${item.reason}`)
                              .join(" | ");
                      return (
                        <li key={prediction.marker} className="rounded-lg bg-slate-800/70 px-3 py-2 text-slate-200">
                          <p className="font-medium">{markerLabel}</p>
                          {canPredict ? (
                            <p className="mt-1 text-xs leading-relaxed text-slate-200">
                              {isNl
                                ? `Als je dosis rond ${formatAxisTick(targetDose)} mg/week ligt, verwacht dit model dat ${markerLabel} ongeveer ${projectedEstimate} wordt. Ter vergelijking: bij ongeveer ${formatAxisTick(prediction.currentDose)} mg/week is de modelwaarde nu ${currentEstimate}. Dat is waarschijnlijk een ${directionText} van ${pctText}.`
                                : `If your dose is around ${formatAxisTick(targetDose)} mg/week, this model expects ${markerLabel} to be about ${projectedEstimate}. For reference, at around ${formatAxisTick(prediction.currentDose)} mg/week the current model value is ${currentEstimate}. That is likely a ${directionText} of ${pctText}.`}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs leading-relaxed text-amber-200">
                              {isNl
                                ? `Nog geen betrouwbare dosis-schatting voor ${markerLabel}. ${prediction.statusReason}`
                                : `No reliable dose estimate yet for ${markerLabel}. ${prediction.statusReason}`}
                            </p>
                          )}
                          <p className="mt-1 text-[11px] text-slate-400">
                            {isNl ? "Betrouwbaarheid van deze inschatting" : "Confidence of this estimate"}: {confidenceLabel(prediction.confidence)}{" "}
                            (n={prediction.sampleCount}, r={correlationText}, R²={formatAxisTick(prediction.rSquared)}, {prediction.modelType})
                          </p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            {isNl ? "Debug (gebruikte data)" : "Debug (used data)"}:{" "}
                            {isNl ? "helling" : "slope"}={formatAxisTick(prediction.slopePerMg)},{" "}
                            {isNl ? "intercept" : "intercept"}={formatAxisTick(prediction.intercept)},{" "}
                            {isNl ? "data-datums" : "dates"}={usedDatesText}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            {isNl ? "Samplingbasis" : "Sampling basis"}:{" "}
                            {prediction.samplingMode === "trough"
                              ? isNl
                                ? "Trough-only"
                                : "Trough-only"
                              : isNl
                                ? "Alle timings"
                                : "All timings"}
                            {prediction.samplingWarning ? ` • ${prediction.samplingWarning}` : ""}
                          </p>
                          {excludedSummary ? (
                            <p className="mt-1 text-[11px] text-slate-500">
                              {isNl ? "Uitgesloten punten" : "Excluded points"}: {excludedSummary}
                              {prediction.excludedPoints.length > 3 ? ` +${prediction.excludedPoints.length - 3}` : ""}
                            </p>
                          ) : null}
                          {canPredict && targetEstimate !== null ? (
                            <div className="mt-2">
                              <DoseProjectionChart
                                prediction={prediction}
                                reports={visibleReports}
                                settings={appData.settings}
                                language={appData.settings.language}
                                targetDose={targetDose}
                                targetEstimate={targetEstimate}
                              />
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </DoseResponseView>
          ) : null}

          {activeTab === "reports" ? (
            <ReportsView>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
                <div className="text-sm text-slate-300">
                  <span className="font-semibold text-slate-100">{reports.length}</span>{" "}
                  {isNl ? "rapporten totaal" : "reports total"}
                </div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/70 p-0.5">
                    <button
                      type="button"
                      className={`rounded px-2 py-1 text-xs ${reportSortOrder === "desc" ? "bg-cyan-500/20 text-cyan-200" : "text-slate-300 hover:text-slate-100"}`}
                      onClick={() => setReportSortOrder("desc")}
                    >
                      {isNl ? "Nieuwste eerst" : "Newest first"}
                    </button>
                    <button
                      type="button"
                      className={`rounded px-2 py-1 text-xs ${reportSortOrder === "asc" ? "bg-cyan-500/20 text-cyan-200" : "text-slate-300 hover:text-slate-100"}`}
                      onClick={() => setReportSortOrder("asc")}
                    >
                      {isNl ? "Oudste eerst" : "Oldest first"}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-2.5 py-1.5 text-sm text-slate-300"
                    onClick={() => {
                      if (selectedReports.length === sortedReportsForList.length) {
                        setSelectedReports([]);
                        return;
                      }
                      setSelectedReports(sortedReportsForList.map((report) => report.id));
                    }}
                  >
                    {selectedReports.length === sortedReportsForList.length && sortedReportsForList.length > 0 ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    {isNl ? "Selecteer alles" : "Select all"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-sm text-cyan-200 disabled:opacity-50"
                    disabled={selectedReports.length < 2}
                    onClick={() => setReportComparisonOpen((prev) => !prev)}
                  >
                    <ClipboardList className="h-4 w-4" /> {isNl ? "Vergelijk selectie" : "Compare selected"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-sm text-rose-300 disabled:opacity-50"
                    disabled={selectedReports.length === 0 || isShareMode}
                    onClick={deleteSelectedReports}
                  >
                    <Trash2 className="h-4 w-4" /> {isNl ? "Verwijder selectie" : "Delete selected"}
                  </button>
                </div>
              </div>

              {reportComparisonOpen && compareReports.length >= 2 ? (
                <div className="overflow-x-auto rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
                  <h4 className="mb-2 text-sm font-semibold text-slate-100">
                    {isNl ? "Vergelijking van geselecteerde rapporten" : "Selected report comparison"}
                  </h4>
                  <table className="min-w-full divide-y divide-slate-700 text-xs sm:text-sm">
                    <thead className="bg-slate-900/70 text-slate-300">
                      <tr>
                        <th className="px-2 py-2 text-left">{isNl ? "Marker" : "Marker"}</th>
                        {compareReports.map((report) => (
                          <th key={report.id} className="px-2 py-2 text-right">
                            {formatDate(report.testDate)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {comparedMarkerRows.map((marker) => (
                        <tr key={marker} className="bg-slate-900/30 text-slate-200">
                          <td className="px-2 py-2 text-left">{getMarkerDisplayName(marker, appData.settings.language)}</td>
                          {compareReports.map((report) => {
                            const point = buildMarkerSeries([report], marker, appData.settings.unitSystem)[0];
                            return (
                              <td key={`${report.id}-${marker}`} className="px-2 py-2 text-right">
                                {point ? `${formatAxisTick(point.value)} ${point.unit}` : "-"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {sortedReportsForList.map((report) => {
                const isEditing = editingReportId === report.id;
                const isExpanded = expandedReportIds.includes(report.id);
                const doseSummary =
                  report.annotations.dosageMgPerWeek === null
                    ? isNl
                      ? "Dosis: -"
                      : "Dose: -"
                    : `${isNl ? "Dosis" : "Dose"}: ${report.annotations.dosageMgPerWeek} mg/week`;

                return (
                <motion.article key={report.id} layout className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (isExpanded && isEditing) {
                        cancelEditingReport();
                      }
                      setExpandedReportIds((current) =>
                        current.includes(report.id) ? current.filter((id) => id !== report.id) : [...current, report.id]
                      );
                    }}
                    className="flex w-full min-w-0 items-start gap-2 rounded-lg text-left hover:bg-slate-800/30"
                    aria-label={isExpanded ? tr("Inklappen", "Collapse") : tr("Uitklappen", "Expand")}
                  >
                    <span className="mt-0.5 rounded-md border border-slate-700 bg-slate-800/70 p-1 text-slate-300">
                      <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </span>
                    <span className="min-w-0">
                      <h3 className="text-base font-semibold text-slate-100">
                        {formatDate(report.testDate)}
                        {report.isBaseline ? (
                          <span className="ml-2 rounded-full border border-cyan-400/50 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium text-cyan-200">
                            {isNl ? "Baseline" : "Baseline"}
                          </span>
                        ) : null}
                      </h3>
                      <p className="text-xs text-slate-300">{doseSummary}</p>
                      <p className="truncate text-xs text-slate-400">{report.sourceFileName}</p>
                    </span>
                  </button>

                  {isExpanded ? (
                    <>
                    <div className="mt-3 flex flex-wrap items-center gap-2 self-start">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-600 bg-slate-800/70 px-2 py-1.5 text-xs text-slate-200"
                        onClick={() => {
                          setSelectedReports((current) => {
                            if (current.includes(report.id)) {
                              return current.filter((id) => id !== report.id);
                            }
                            return [...current, report.id];
                          });
                        }}
                      >
                        {selectedReports.includes(report.id) ? (
                          <CheckSquare className="h-4 w-4 text-cyan-300" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                        {selectedReports.includes(report.id)
                          ? isNl
                            ? "Geselecteerd"
                            : "Selected"
                          : isNl
                            ? "Selecteer"
                            : "Select"}
                      </button>
                      {!isShareMode && isEditing ? (
                        <>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md border border-slate-500/60 bg-slate-800/70 px-2 py-1.5 text-xs text-slate-200"
                            onClick={cancelEditingReport}
                          >
                            <X className="h-3.5 w-3.5" /> {isNl ? "Annuleer" : "Cancel"}
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-300"
                            onClick={saveEditedReport}
                          >
                            <Save className="h-3.5 w-3.5" /> {isNl ? "Opslaan" : "Save"}
                          </button>
                        </>
                      ) : !isShareMode ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1.5 text-xs text-cyan-200"
                          onClick={() => startEditingReport(report)}
                        >
                          <Pencil className="h-3.5 w-3.5" /> {isNl ? "Bewerk details" : "Edit details"}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-2 py-1.5 text-xs text-slate-300">
                          <Lock className="h-3.5 w-3.5" /> {isNl ? "Alleen-lezen" : "Read-only"}
                        </span>
                      )}

                      {!isShareMode ? (
                        <button
                          type="button"
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs ${
                            report.isBaseline
                              ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200"
                              : "border-slate-600 bg-slate-800/70 text-slate-200"
                          }`}
                          onClick={() => setBaselineReport(report.id)}
                        >
                          <Lock className="h-3.5 w-3.5" /> {report.isBaseline ? "Baseline" : isNl ? "Zet als baseline" : "Set baseline"}
                        </button>
                      ) : null}

                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-300"
                        disabled={isShareMode}
                        onClick={() => deleteReport(report.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {isNl ? "Verwijder" : "Delete"}
                      </button>
                    </div>

                  {isEditing ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <label className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                        <span className="mb-1 block text-slate-400">{isNl ? "Dosis (mg/week)" : "Dose (mg/week)"}</span>
                        <input
                          type="number"
                          className="w-full rounded-md border border-slate-600 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100"
                          value={editingAnnotations.dosageMgPerWeek ?? ""}
                          onChange={(event) =>
                            setEditingAnnotations((current) => ({
                              ...current,
                              dosageMgPerWeek: safeNumber(event.target.value)
                            }))
                          }
                        />
                      </label>
                      <label className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                        <span className="mb-1 block text-slate-400">Protocol</span>
                        <input
                          className="w-full rounded-md border border-slate-600 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100"
                          value={editingAnnotations.protocol}
                          onChange={(event) =>
                            setEditingAnnotations((current) => ({
                              ...current,
                              protocol: event.target.value
                            }))
                          }
                        />
                      </label>
                      <label className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                        <span className="mb-1 block text-slate-400">{isNl ? "Supplementen / vitaminen" : "Supplements / vitamins"}</span>
                        <input
                          className="w-full rounded-md border border-slate-600 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100"
                          value={editingAnnotations.supplements}
                          onChange={(event) =>
                            setEditingAnnotations((current) => ({
                              ...current,
                              supplements: event.target.value
                            }))
                          }
                        />
                      </label>
                      <label className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                        <span className="mb-1 block text-slate-400">{isNl ? "Symptomen" : "Symptoms"}</span>
                        <input
                          className="w-full rounded-md border border-slate-600 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100"
                          value={editingAnnotations.symptoms}
                          onChange={(event) =>
                            setEditingAnnotations((current) => ({
                              ...current,
                              symptoms: event.target.value
                            }))
                          }
                        />
                      </label>
                      <label className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300 sm:col-span-2">
                        <span className="mb-1 block text-slate-400">{tr("Notities", "Notes")}</span>
                        <textarea
                          className="h-20 w-full resize-none rounded-md border border-slate-600 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100"
                          value={editingAnnotations.notes}
                          onChange={(event) =>
                            setEditingAnnotations((current) => ({
                              ...current,
                              notes: event.target.value
                            }))
                          }
                        />
                      </label>
                      {samplingControlsEnabled ? (
                        <label className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                          <span className="mb-1 block text-slate-400">{isNl ? "Meetmoment" : "Sampling timing"}</span>
                          <select
                            className="w-full rounded-md border border-slate-600 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100"
                            value={editingAnnotations.samplingTiming}
                            onChange={(event) =>
                              setEditingAnnotations((current) => ({
                                ...current,
                                samplingTiming: event.target.value as ReportAnnotations["samplingTiming"]
                              }))
                            }
                          >
                            <option value="unknown">{isNl ? "Onbekend" : "Unknown"}</option>
                            <option value="trough">Trough</option>
                            <option value="mid">{isNl ? "Midden" : "Mid"}</option>
                            <option value="peak">Peak</option>
                          </select>
                        </label>
                      ) : null}
                    </div>
                  ) : (
                    <div className={`mt-3 grid gap-2 sm:grid-cols-2 ${samplingControlsEnabled ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}>
                      <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                        <span className="block text-slate-400">{isNl ? "Dosis" : "Dose"}</span>
                        <strong className="text-sm text-slate-100">
                          {report.annotations.dosageMgPerWeek === null ? "-" : `${report.annotations.dosageMgPerWeek} mg/week`}
                        </strong>
                      </div>
                      <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                        <span className="block text-slate-400">Protocol</span>
                        <strong className="text-sm text-slate-100">{report.annotations.protocol || "-"}</strong>
                      </div>
                      <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                        <span className="block text-slate-400">{isNl ? "Supplementen" : "Supplements"}</span>
                        <strong className="text-sm text-slate-100">{report.annotations.supplements || "-"}</strong>
                      </div>
                      <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                        <span className="block text-slate-400">{isNl ? "Symptomen" : "Symptoms"}</span>
                        <strong className="text-sm text-slate-100">{report.annotations.symptoms || "-"}</strong>
                      </div>
                      <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                        <span className="block text-slate-400">{tr("Notities", "Notes")}</span>
                        <strong className="text-sm text-slate-100">{report.annotations.notes || "-"}</strong>
                      </div>
                      {samplingControlsEnabled ? (
                        <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                          <span className="block text-slate-400">{isNl ? "Meetmoment" : "Sampling timing"}</span>
                          <strong className="text-sm text-slate-100">{samplingTimingLabel(report.annotations.samplingTiming)}</strong>
                        </div>
                      ) : null}
                    </div>
                  )}

                  <div className="mt-3 overflow-visible rounded-lg border border-slate-700">
                    <div className="overflow-x-auto overflow-y-visible">
                    <table className="min-w-full divide-y divide-slate-700 text-xs sm:text-sm">
                      <thead className="bg-slate-900/70 text-slate-300">
                        <tr>
                          <th className="px-3 py-2 text-left">{tr("Marker", "Marker")}</th>
                          <th className="px-3 py-2 text-right">{isNl ? "Waarde" : "Value"}</th>
                          <th className="px-3 py-2 text-left">{tr("Eenheid", "Unit")}</th>
                          <th className="px-3 py-2 text-right">{isNl ? "Bereik" : "Range"}</th>
                          <th className="px-3 py-2 text-right">{tr("Status", "Status")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {report.markers.map((marker) => {
                          const converted = convertBySystem(
                            marker.canonicalMarker,
                            marker.value,
                            marker.unit,
                            appData.settings.unitSystem
                          );
                          const min =
                            marker.referenceMin === null
                              ? null
                              : convertBySystem(
                                  marker.canonicalMarker,
                                  marker.referenceMin,
                                  marker.unit,
                                  appData.settings.unitSystem
                                ).value;
                          const max =
                            marker.referenceMax === null
                              ? null
                              : convertBySystem(
                                  marker.canonicalMarker,
                                  marker.referenceMax,
                                  marker.unit,
                                  appData.settings.unitSystem
                                ).value;

                          return (
                            <tr key={marker.id} className="bg-slate-900/35 text-slate-200">
                              <td className="px-3 py-2">
                                <span className="inline-flex items-center gap-1">
                                  {getMarkerDisplayName(marker.canonicalMarker, appData.settings.language)}
                                  <MarkerInfoBadge marker={marker.canonicalMarker} language={appData.settings.language} />
                                  {!marker.isCalculated ? (
                                    <button
                                      type="button"
                                      className="rounded p-0.5 text-slate-400 transition hover:text-cyan-200"
                                      onClick={() => openRenameDialog(marker.canonicalMarker)}
                                      aria-label={tr("Marker hernoemen", "Rename marker")}
                                      title={tr("Marker hernoemen", "Rename marker")}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                                  {marker.isCalculated ? (
                                    <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-200">
                                      fx
                                    </span>
                                  ) : null}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right">{converted.value.toFixed(2)}</td>
                              <td className="px-3 py-2">{converted.unit}</td>
                              <td className="px-3 py-2 text-right">
                                {min === null || max === null
                                  ? "-"
                                  : `${Number(min.toFixed(2))} - ${Number(max.toFixed(2))}`}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                                    marker.abnormal === "high"
                                      ? "bg-rose-500/20 text-rose-300"
                                      : marker.abnormal === "low"
                                        ? "bg-amber-500/20 text-amber-300"
                                        : "bg-emerald-500/20 text-emerald-300"
                                  }`}
                                >
                                  {abnormalStatusLabel(marker.abnormal, appData.settings.language)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                  </div>
                  </>
                  ) : null}
                </motion.article>
                );
              })}
            </ReportsView>
          ) : null}

          {activeTab === "analysis" ? (
            <AnalysisView>
              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h3 className="text-base font-semibold text-slate-100">{tr("AI Lab Analyse", "AI Lab Analysis")}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {tr(
                    "Laat AI al je labwaardes over tijd analyseren, inclusief protocol, supplementen, symptomen en notities.",
                    "Let AI analyze all your lab values over time, including protocol, supplements, symptoms, and notes."
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {tr(
                    "Deze analyse gebruikt alle opgeslagen rapporten en stuurt data naar Anthropic via de serverconfiguratie.",
                    "This analysis uses all saved reports and sends data to Anthropic through server-side configuration."
                  )}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-cyan-500/50 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200 disabled:opacity-50"
                    onClick={() => runAiAnalysis("full")}
                    disabled={isAnalyzingLabs || visibleReports.length === 0}
                  >
                    {isAnalyzingLabs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {isAnalyzingLabs ? tr("Analyseren...", "Analyzing...") : tr("Volledige AI-analyse", "Full AI analysis")}
                  </button>
                  <button
                    type="button"
                    className="analysis-latest-btn inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-200 disabled:opacity-50"
                    onClick={() => runAiAnalysis("latestComparison")}
                    disabled={isAnalyzingLabs || visibleReports.length < 2}
                  >
                    <Sparkles className="h-4 w-4" />
                    {tr("Laatste vs vorige", "Latest vs previous")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-50"
                    onClick={copyAnalysis}
                    disabled={!analysisResult}
                  >
                    <FileText className="h-4 w-4" /> {analysisCopied ? tr("Gekopieerd", "Copied") : tr("Kopieer analyse", "Copy analysis")}
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                  <span>{tr("Rapporten in scope", "Reports in scope")}: {visibleReports.length}</span>
                  {samplingControlsEnabled ? <span>{tr("Meetmoment-filter", "Sampling filter")}: {appData.settings.samplingFilter}</span> : null}
                  <span>{tr("Markers gevolgd", "Markers tracked")}: {allMarkers.length}</span>
                  <span>{tr("Eenheden", "Unit system")}: {appData.settings.unitSystem.toUpperCase()}</span>
                  <span>{tr("Formaat: alleen tekst (geen tabellen)", "Format: text-only (no tables)")}</span>
                  {analysisGeneratedAt ? (
                    <span>{tr("Laatste run", "Last run")}: {format(parseISO(analysisGeneratedAt), "dd MMM yyyy HH:mm")}</span>
                  ) : null}
                </div>
              </div>

              {analysisError ? (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
                  {analysisError}
                </div>
              ) : null}

              {isAnalyzingLabs ? (
                <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-5">
                  <div className="inline-flex items-center gap-2 text-sm text-slate-300">
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                    {tr("AI is je trendanalyse aan het opstellen...", "AI is preparing your trend analysis...")}
                  </div>
                </div>
              ) : null}

              {analysisResult ? (
                <article className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                  <h4 className="text-sm font-semibold text-slate-100">
                    {analysisKind === "latestComparison"
                      ? tr("Analyse-output (laatste vs vorige)", "Analysis output (latest vs previous)")
                      : tr("Analyse-output (volledig)", "Analysis output (full)")}
                  </h4>
                  <div className="mt-3 overflow-x-auto">
                    <ReactMarkdown
                      skipHtml
                      remarkPlugins={[remarkBreaks]}
                      allowedElements={[
                        "h1",
                        "h2",
                        "h3",
                        "h4",
                        "p",
                        "strong",
                        "em",
                        "ul",
                        "ol",
                        "li",
                        "blockquote",
                        "code",
                        "pre",
                        "br",
                        "hr"
                      ]}
                      components={{
                        h1: ({ children }) => <h1 className="mt-4 text-xl font-semibold text-slate-100">{children}</h1>,
                        h2: ({ children }) => <h2 className="mt-4 text-lg font-semibold text-cyan-200">{children}</h2>,
                        h3: ({ children }) => <h3 className="mt-3 text-base font-semibold text-slate-100">{children}</h3>,
                        h4: ({ children }) => <h4 className="mt-3 text-sm font-semibold text-slate-100">{children}</h4>,
                        p: ({ children }) => <p className="mt-2 text-sm leading-6 text-slate-200">{children}</p>,
                        ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">{children}</ul>,
                        ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-200">{children}</ol>,
                        li: ({ children }) => <li className="leading-6">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold text-slate-100">{children}</strong>,
                        em: ({ children }) => <em className="italic text-slate-200">{children}</em>,
                        blockquote: ({ children }) => (
                          <blockquote className="mt-3 border-l-2 border-slate-600 pl-3 text-sm text-slate-300">{children}</blockquote>
                        ),
                        code: ({ children }) => (
                          <code className="rounded bg-slate-800/80 px-1 py-0.5 text-[13px] text-slate-100">{children}</code>
                        ),
                        pre: ({ children }) => (
                          <pre className="mt-2 overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200">
                            {children}
                          </pre>
                        ),
                        hr: () => <hr className="my-4 border-slate-700" />
                      }}
                    >
                      {analysisResultDisplay}
                    </ReactMarkdown>
                  </div>
                </article>
              ) : null}
            </AnalysisView>
          ) : null}

          {activeTab === "settings" ? (
            <SettingsView>
              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h3 className="text-base font-semibold text-slate-100">{tr("Voorkeuren", "Preferences")}</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm">
                    <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("Thema", "Theme")}</span>
                    <select
                      className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
                      value={appData.settings.theme}
                      onChange={(event) => updateSettings({ theme: event.target.value as AppSettings["theme"] })}
                    >
                      <option value="dark">{tr("Donker", "Dark")}</option>
                      <option value="light">{tr("Licht", "Light")}</option>
                    </select>
                  </label>

                  <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm">
                    <span className="block text-xs uppercase tracking-wide text-slate-400">{t(appData.settings.language, "language")}</span>
                    <select
                      className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
                      value={appData.settings.language}
                      onChange={(event) => updateSettings({ language: event.target.value as AppSettings["language"] })}
                    >
                      <option value="nl">Nederlands</option>
                      <option value="en">English</option>
                    </select>
                  </label>

                  <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm">
                    <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("Eenhedensysteem", "Unit system")}</span>
                    <select
                      className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
                      value={appData.settings.unitSystem}
                      onChange={(event) =>
                        updateSettings({
                          unitSystem: event.target.value as AppSettings["unitSystem"]
                        })
                      }
                    >
                      <option value="eu">{tr("Europees", "European")}</option>
                      <option value="us">US</option>
                    </select>
                  </label>

                  <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm">
                    <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("Grafiek Y-as", "Chart Y-axis")}</span>
                    <select
                      className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
                      value={appData.settings.yAxisMode}
                      onChange={(event) =>
                        updateSettings({
                          yAxisMode: event.target.value as AppSettings["yAxisMode"]
                        })
                      }
                    >
                      <option value="zero">{tr("Start op nul", "Start at zero")}</option>
                      <option value="data">{tr("Gebruik databereik", "Use data range")}</option>
                    </select>
                  </label>

                  <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm">
                    <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("Tooltip-detail", "Tooltip detail")}</span>
                    <select
                      className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
                      value={appData.settings.tooltipDetailMode}
                      onChange={(event) =>
                        updateSettings({
                          tooltipDetailMode: event.target.value as AppSettings["tooltipDetailMode"]
                        })
                      }
                    >
                      <option value="compact">{tr("Compact (snel overzicht)", "Compact (quick overview)")}</option>
                      <option value="full">{tr("Uitgebreid (alle context)", "Extended (full context)")}</option>
                    </select>
                  </label>

                  <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm md:col-span-2">
                    <span className="block text-xs uppercase tracking-wide text-slate-400">
                      {tr("Geavanceerde meetmoment-filters", "Advanced sampling filters")}
                    </span>
                    <div className="mt-2 flex items-center gap-2 text-slate-200">
                      <input
                        type="checkbox"
                        checked={samplingControlsEnabled}
                        onChange={(event) => updateSettings({ enableSamplingControls: event.target.checked })}
                      />
                      <span>{tr("Toon sampling filter + baseline vergelijking op dashboard", "Show sampling filter + baseline comparison on dashboard")}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      {tr(
                        "Standaard uit. Als uitgeschakeld worden trough/peak- en baseline-opties verborgen.",
                        "Off by default. When disabled, trough/peak and baseline options are hidden."
                      )}
                    </p>
                  </label>

                  <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm md:col-span-2">
                    <span className="block text-xs uppercase tracking-wide text-slate-400">
                      {tr("Afgeleide marker", "Derived marker")}
                    </span>
                    <div className="mt-2 flex items-center gap-2 text-slate-200">
                      <input
                        type="checkbox"
                        checked={appData.settings.enableCalculatedFreeTestosterone}
                        onChange={(event) => updateSettings({ enableCalculatedFreeTestosterone: event.target.checked })}
                      />
                      <span>{tr("Bereken Vrij Testosteron (afgeleid)", "Enable calculated Free Testosterone (derived)")}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      {tr(
                        "Berekend uit totaal testosteron + SHBG (+ albumine). Vervangt gemeten vrij testosteron nooit en vult alleen ontbrekende punten aan.",
                        "Computed from Total T + SHBG (+ Albumin). Never replaces measured Free T; it only fills missing points."
                      )}
                    </p>
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h3 className="text-base font-semibold text-slate-100">{tr("Feedback", "Feedback")}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {tr(
                    "Problemen met het verwerken van PDF's? Laat ons weten welke labformaten niet werken.",
                    "Having trouble with PDF parsing? Let us know which lab formats don't work."
                  )}
                </p>
                <a
                  href={settingsFeedbackMailto}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm text-cyan-200 hover:text-cyan-100"
                >
                  <AlertTriangle className="h-4 w-4" />
                  {tr("Meld een verwerkingsprobleem", "Report a parsing issue")}
                </a>
              </div>

              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h3 className="text-base font-semibold text-slate-100">{tr("Marker Manager", "Marker Manager")}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {tr(
                    "Beheer markernaam-normalisatie zonder je dashboard te verstoren. Je kunt markers handmatig samenvoegen of hernoemen.",
                    "Manage marker-name normalization without cluttering the dashboard. You can manually merge or rename markers."
                  )}
                </p>
                <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
                  <select
                    className="rounded-md border border-slate-600 bg-slate-800 px-2 py-2 text-sm"
                    value={mergeFromMarker}
                    onChange={(event) => setMergeFromMarker(event.target.value)}
                  >
                    {editableMarkers.length === 0 ? (
                      <option value="">{tr("Geen markers beschikbaar", "No markers available")}</option>
                    ) : (
                      editableMarkers.map((marker) => (
                        <option key={`from-${marker}`} value={marker}>
                          {getMarkerDisplayName(marker, appData.settings.language)}
                        </option>
                      ))
                    )}
                  </select>
                  <div className="self-center text-center text-xs text-slate-400">{tr("naar", "into")}</div>
                  <select
                    className="rounded-md border border-slate-600 bg-slate-800 px-2 py-2 text-sm"
                    value={mergeIntoMarker}
                    onChange={(event) => setMergeIntoMarker(event.target.value)}
                  >
                    <option value="">{tr("Selecteer target", "Select target")}</option>
                    {editableMarkers
                      .filter((marker) => marker !== mergeFromMarker)
                      .map((marker) => (
                        <option key={`to-${marker}`} value={marker}>
                          {getMarkerDisplayName(marker, appData.settings.language)}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 disabled:opacity-50"
                    disabled={!mergeFromMarker || !mergeIntoMarker || mergeFromMarker === mergeIntoMarker}
                    onClick={() => remapMarkerAcrossReports(mergeFromMarker, mergeIntoMarker)}
                  >
                    {tr("Voer merge uit", "Merge markers")}
                  </button>
                </div>

                <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-slate-700 bg-slate-900/40">
                  <table className="min-w-full divide-y divide-slate-700 text-sm">
                    <thead className="bg-slate-900/70 text-slate-300">
                      <tr>
                        <th className="px-3 py-2 text-left">{tr("Marker", "Marker")}</th>
                        <th className="px-3 py-2 text-right">{tr("Waarden", "Values")}</th>
                        <th className="px-3 py-2 text-right">{tr("Rapporten", "Reports")}</th>
                        <th className="px-3 py-2 text-right">{tr("Actie", "Action")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {markerUsage.map((item) => (
                        <tr key={item.marker} className="bg-slate-900/30 text-slate-200">
                          <td className="px-3 py-2">{getMarkerDisplayName(item.marker, appData.settings.language)}</td>
                          <td className="px-3 py-2 text-right">{item.valueCount}</td>
                          <td className="px-3 py-2 text-right">{item.reportCount}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              className="rounded p-1 text-slate-400 transition hover:text-cyan-200"
                              onClick={() => openRenameDialog(item.marker)}
                              aria-label={tr("Marker hernoemen", "Rename marker")}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h3 className="text-base font-semibold text-slate-100">{tr("Backup & Herstel", "Backup & Restore")}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {tr(
                    "Maak een JSON-backup van al je data. Je kunt die later importeren als merge of volledige restore.",
                    "Create a JSON backup of all your data. You can later import it as a merge or full restore."
                  )}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200"
                    onClick={exportJson}
                  >
                    <Download className="h-4 w-4" /> {tr("Backup maken (JSON)", "Create backup (JSON)")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-200"
                    onClick={() => {
                      setImportMode("merge");
                      importFileInputRef.current?.click();
                    }}
                  >
                    <FileText className="h-4 w-4" /> {tr("Importeer backup (samenvoegen)", "Import backup (merge)")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-200"
                    onClick={() => {
                      setImportMode("replace");
                      importFileInputRef.current?.click();
                    }}
                  >
                    <FileText className="h-4 w-4" /> {tr("Herstel backup (vervangen)", "Restore backup (replace)")}
                  </button>
                </div>

                <input
                  ref={importFileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={onImportBackupFile}
                />

                {importStatus ? (
                  <div
                    className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                      importStatus.type === "success"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                        : "border-rose-500/30 bg-rose-500/10 text-rose-200"
                    }`}
                  >
                    {importStatus.message}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h3 className="text-base font-semibold text-slate-100">{tr("Deelmodus", "Share mode")}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {tr(
                    "Genereer een read-only snapshotlink zonder API keys. De gedeelde weergave staat geen bewerken toe.",
                    "Generate a read-only snapshot link without API keys. Shared view does not allow editing."
                  )}
                </p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-200">
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5">
                    <input
                      type="checkbox"
                      checked={shareOptions.hideNotes}
                      onChange={(event) => setShareOptions((current) => ({ ...current, hideNotes: event.target.checked }))}
                    />
                    {tr("Verberg notities", "Hide notes")}
                  </label>
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5">
                    <input
                      type="checkbox"
                      checked={shareOptions.hideProtocol}
                      onChange={(event) => setShareOptions((current) => ({ ...current, hideProtocol: event.target.checked }))}
                    />
                    {tr("Verberg protocol", "Hide protocol")}
                  </label>
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5">
                    <input
                      type="checkbox"
                      checked={shareOptions.hideSymptoms}
                      onChange={(event) => setShareOptions((current) => ({ ...current, hideSymptoms: event.target.checked }))}
                    />
                    {tr("Verberg symptomen", "Hide symptoms")}
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-cyan-500/50 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200"
                    onClick={generateShareLink}
                  >
                    <Link2 className="h-4 w-4" /> {tr("Genereer deellink", "Generate share link")}
                  </button>
                  {shareLink ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(shareLink);
                        } catch {
                          // no-op
                        }
                      }}
                    >
                      <Copy className="h-4 w-4" /> {tr("Kopieer link", "Copy link")}
                    </button>
                  ) : null}
                </div>
                {shareLink ? (
                  <p className="mt-2 break-all rounded-md border border-slate-700 bg-slate-800/70 px-3 py-2 text-xs text-slate-300">
                    {shareLink}
                  </p>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h3 className="text-base font-semibold text-slate-100">{tr("Export", "Export")}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {tr(
                    "Exporteer alle opgeslagen data als JSON, geselecteerde markers als CSV, of grafieken als PDF.",
                    "Export all stored data as JSON, selected markers as CSV, or charts as PDF."
                  )}
                </p>

                <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">{tr("CSV markerselectie", "CSV marker selection")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {allMarkers.map((marker) => {
                      const selected = csvMarkerSelection.includes(marker);
                      return (
                        <button
                          key={marker}
                          type="button"
                          className={`rounded-full border px-3 py-1 text-xs ${
                            selected
                              ? "border-cyan-500/60 bg-cyan-500/20 text-cyan-200"
                              : "border-slate-600 text-slate-300"
                          }`}
                          onClick={() => {
                            setCsvMarkerSelection((current) => {
                              if (current.includes(marker)) {
                                return current.filter((item) => item !== marker);
                              }
                              return [...current, marker];
                            });
                          }}
                        >
                          {getMarkerDisplayName(marker, appData.settings.language)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                    onClick={exportJson}
                  >
                    <FileText className="h-4 w-4" /> {tr("Exporteer JSON", "Export JSON")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                    onClick={exportCsv}
                  >
                    <Download className="h-4 w-4" /> {tr("Exporteer CSV", "Export CSV")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                    onClick={exportPdf}
                  >
                    <FileText className="h-4 w-4" /> {tr("Exporteer PDF-rapport", "Export PDF report")}
                  </button>
                </div>
              </div>

              <div className="medical-disclaimer rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                <p className="font-semibold">{tr("Medische disclaimer", "Medical disclaimer")}</p>
                <p className="mt-1">
                  {tr(
                    "Deze tool is alleen voor persoonlijke tracking en geeft geen medisch advies.",
                    "This tool is for personal tracking only and does not provide medical advice."
                  )}
                </p>
              </div>
            </SettingsView>
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
