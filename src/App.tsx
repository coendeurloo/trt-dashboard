import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Info,
  Loader2,
  X
} from "lucide-react";
import {
  MarkerSeriesPoint,
  buildMarkerSeries,
  calculatePercentChange,
  calculatePercentVsBaseline
} from "./analytics";
import { PRIMARY_MARKERS, TAB_ITEMS } from "./constants";
import AppShell from "./components/AppShell";
import ExtractionReviewTable from "./components/ExtractionReviewTable";
import MarkerTrendChart from "./components/MarkerTrendChart";
import AIConsentModal from "./components/AIConsentModal";
import ParserUncertaintyModal from "./components/ParserUncertaintyModal";
import ExtractionComparisonModal from "./components/ExtractionComparisonModal";
import { getDemoCheckIns, getDemoProtocols, getDemoReports, getDemoSupplementTimeline } from "./demoData";
import { blankAnnotations, normalizeAnalysisTextForDisplay } from "./chartHelpers";
import { getMarkerDisplayName, getTabLabel, trLocale } from "./i18n";
import {
  getMostRecentlyUsedProtocolId,
  getPrimaryProtocolCompound,
  getProtocolDisplayLabel,
  getProtocolDoseMgPerWeek,
  getReportProtocol
} from "./protocolUtils";
import { canonicalizeMarker, normalizeMarkerMeasurement } from "./unitConversion";
import useAnalysis from "./hooks/useAnalysis";
import useAppData, { MarkerMergeSuggestion, detectMarkerMergeSuggestions } from "./hooks/useAppData";
import { useShareGeneration } from "./hooks/useShareGeneration";
import {
  useShareBootstrap,
  shareBootstrapText
} from "./hooks/useShareBootstrap";
import { buildExtractionDiffSummary } from "./extractionDiff";
import { getActiveSupplementsAtDate, resolveReportSupplementContexts } from "./supplementUtils";
import {
  useCoreDerivedData,
  useDashboardDerivedData,
  useProtocolDerivedData
} from "./hooks/useDerivedData";
import { resolveUploadTriggerAction } from "./uploadFlow";
import { normalizeMarkerLookupKey } from "./markerNormalization";
import { mapServiceErrorToMessage } from "./lib/errorMessages";
import DashboardView from "./views/DashboardView";
import {
  AIConsentAction,
  AIConsentDecision,
  AppSettings,
  ExtractionDraft,
  ExtractionDiffSummary,
  ExtractionRoute,
  LabReport,
  MarkerValue,
  ParserUncertaintyAssessment,
  ParserStage,
  ReportAnnotations,
  TabKey,
  DashboardViewMode,
  TimeRangeKey
} from "./types";
import { createId, deriveAbnormalFlag, formatDate, withinRange } from "./utils";

const ProtocolView = lazy(() => import("./views/ProtocolView"));
const SupplementsView = lazy(() => import("./views/SupplementsView"));
const CheckInsView = lazy(() => import("./views/CheckInsView"));
const AlertsView = lazy(() => import("./views/AlertsView"));
const ProtocolImpactView = lazy(() => import("./views/ProtocolImpactView"));
const DoseResponseView = lazy(() => import("./views/DoseResponseView"));
const ReportsView = lazy(() => import("./views/ReportsView"));
const AnalysisView = lazy(() => import("./views/AnalysisView"));
const SettingsView = lazy(() => import("./views/SettingsView"));

const App = () => {
  const { shareBootstrap, sharedSnapshot, isShareMode, isShareResolving, isShareBootstrapError } = useShareBootstrap();

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
    addProtocol,
    updateProtocol,
    deleteProtocol,
    getProtocolUsageCount,
    setBaseline,
    remapMarker,
    upsertMarkerAliasOverrides,
    addSupplementPeriod,
    updateSupplementPeriod,
    stopSupplement,
    deleteSupplementPeriod,
    addCheckIn,
    updateCheckIn,
    deleteCheckIn,
    importData,
    clearAllData,
    exportJson
  } = useAppData({
    sharedData: sharedSnapshot ? sharedSnapshot.data : null,
    isShareMode
  });
  const tr = (nl: string, en: string): string => trLocale(appData.settings.language, nl, en);
  const {
    shareOptions,
    setShareOptions,
    shareLink,
    shareStatus,
    shareMessage,
    shareIncludedReports,
    shareExpiresAt,
    generateShareLink
  } = useShareGeneration({ appData, tr });
  const mapErrorToMessage = (error: unknown, scope: "ai" | "pdf"): string =>
    mapServiceErrorToMessage({
      error,
      scope,
      language: appData.settings.language,
      tr
    });
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [doseResponseInput, setDoseResponseInput] = useState("");
  const [dashboardView, setDashboardView] = useState<"primary" | "all">("primary");

  const [isProcessing, setIsProcessing] = useState(false);
  const [isImprovingExtraction, setIsImprovingExtraction] = useState(false);
  const [uploadStage, setUploadStage] = useState<ParserStage | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const [uploadSummary, setUploadSummary] = useState<{
    fileName: string;
    markerCount: number;
    confidence: number;
    warnings: number;
    routeLabel: string;
    usedAi: boolean;
    usedOcr: boolean;
  } | null>(null);
  const [draft, setDraft] = useState<ExtractionDraft | null>(null);
  const [localBaselineDraft, setLocalBaselineDraft] = useState<ExtractionDraft | null>(null);
  const [aiCandidateDraft, setAiCandidateDraft] = useState<ExtractionDraft | null>(null);
  const [uncertaintyAssessment, setUncertaintyAssessment] = useState<ParserUncertaintyAssessment | null>(null);
  const [showUncertaintyModal, setShowUncertaintyModal] = useState(false);
  const [pendingDiff, setPendingDiff] = useState<ExtractionDiffSummary | null>(null);
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [draftOriginalMarkerLabels, setDraftOriginalMarkerLabels] = useState<Record<string, string>>({});
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null);
  const [draftAnnotations, setDraftAnnotations] = useState<ReportAnnotations>(blankAnnotations());
  const [selectedProtocolId, setSelectedProtocolId] = useState<string | null>(null);
  const [pendingTabChange, setPendingTabChange] = useState<TabKey | null>(null);

  const [dashboardMode, setDashboardMode] = useState<DashboardViewMode>("cards");
  const [leftCompareMarker, setLeftCompareMarker] = useState<string>(PRIMARY_MARKERS[0]);
  const [rightCompareMarker, setRightCompareMarker] = useState<string>(PRIMARY_MARKERS[2]);
  const [focusedAlertMarker, setFocusedAlertMarker] = useState<string | null>(null);
  const [focusedReportId, setFocusedReportId] = useState<string | null>(null);

  const [expandedMarker, setExpandedMarker] = useState<string | null>(null);
  const [protocolWindowSize, setProtocolWindowSize] = useState(45);
  const [protocolMarkerSearch, setProtocolMarkerSearch] = useState("");
  const [protocolCategoryFilter, setProtocolCategoryFilter] = useState<"all" | "Hormones" | "Lipids" | "Hematology" | "Inflammation">("all");
  const [markerSuggestions, setMarkerSuggestions] = useState<MarkerMergeSuggestion[]>([]);
  const [renameDialog, setRenameDialog] = useState<{ sourceCanonical: string; draftName: string } | null>(null);
  const uploadPanelRef = useRef<HTMLDivElement | null>(null);
  const hiddenUploadInputRef = useRef<HTMLInputElement | null>(null);
  const parserModuleRef = useRef<Promise<typeof import("./pdfParsing")> | null>(null);
  const consentResolveRef = useRef<((decision: AIConsentDecision | null) => void) | null>(null);
  const [consentAction, setConsentAction] = useState<AIConsentAction | null>(null);

  const ensurePdfParsingModule = () => {
    if (!parserModuleRef.current) {
      parserModuleRef.current = import("./pdfParsing");
    }
    return parserModuleRef.current;
  };

  const requestAiConsent = (action: AIConsentAction): Promise<AIConsentDecision | null> =>
    new Promise((resolve) => {
      consentResolveRef.current = resolve;
      setConsentAction(action);
    });

  const resolveConsentRequest = (decision: AIConsentDecision | null) => {
    setConsentAction(null);
    const resolver = consentResolveRef.current;
    consentResolveRef.current = null;
    resolver?.(decision);
  };

  const {
    reports,
    visibleReports,
    allMarkers,
    editableMarkers,
    markerUsage,
    primaryMarkers,
    baselineReport,
    dosePhaseBlocks
  } = useCoreDerivedData({
    appData,
    protocols: appData.protocols,
    samplingControlsEnabled
  });
  const needsDashboardDerived = activeTab === "dashboard" || activeTab === "alerts" || activeTab === "analysis";
  const needsProtocolDerived = activeTab === "protocolImpact" || activeTab === "doseResponse" || activeTab === "analysis";
  const {
    trendByMarker,
    alerts,
    actionableAlerts,
    positiveAlerts,
    alertsByMarker,
    alertSeriesByMarker,
    trtStability
  } = useDashboardDerivedData({
    enabled: needsDashboardDerived,
    visibleReports,
    allMarkers,
    settings: appData.settings,
    protocols: appData.protocols,
    supplementTimeline: appData.supplementTimeline
  });
  const {
    protocolImpactSummary,
    protocolDoseEvents,
    protocolDoseOverview,
    dosePredictions,
    customDoseValue,
    hasCustomDose
  } = useProtocolDerivedData({
    enabled: needsProtocolDerived,
    visibleReports,
    allMarkers,
    settings: appData.settings,
    protocols: appData.protocols,
    supplementTimeline: appData.supplementTimeline,
    protocolWindowSize,
    doseResponseInput
  });
  const resolvedSupplementContexts = useMemo(
    () => resolveReportSupplementContexts(reports, appData.supplementTimeline),
    [reports, appData.supplementTimeline]
  );
  const draftDateForSupplements = draft?.testDate ?? new Date().toISOString().slice(0, 10);
  const draftInheritedSupplements = useMemo(
    () => getActiveSupplementsAtDate(appData.supplementTimeline, draftDateForSupplements),
    [appData.supplementTimeline, draftDateForSupplements]
  );
  const draftInheritedSupplementsLabel = useMemo(() => {
    return `${tr("op basis van schema op", "based on schedule on")} ${formatDate(draftDateForSupplements)}`;
  }, [draftDateForSupplements, tr]);
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
    analysisModelInfo,
    analysisKind,
    analyzingKind,
    analysisScopeNotice,
    betaUsage,
    betaLimits,
    setAnalysisError,
    runAiAnalysis,
    copyAnalysis
  } = useAnalysis({
    settings: appData.settings,
    language: appData.settings.language,
    visibleReports,
    checkIns: appData.checkIns,
    protocols: appData.protocols,
    supplementTimeline: appData.supplementTimeline,
    samplingControlsEnabled,
    protocolImpactSummary,
    alerts,
    trendByMarker,
    trtStability,
    dosePredictions,
    mapErrorToMessage: mapErrorToMessage,
    tr
  });

  useEffect(() => {
    if (isShareMode && activeTab !== "dashboard") {
      setActiveTab("dashboard");
    }
  }, [activeTab, isShareMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const browserWindow = window as Window & typeof globalThis;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (nav.connection?.saveData) {
      return;
    }

    const prefetchLikelyTabs = () => {
      void import("./views/ReportsView");
      void import("./views/ProtocolView");
    };

    if (typeof browserWindow.requestIdleCallback === "function") {
      const idleWindow = browserWindow as Window & {
        requestIdleCallback: (callback: IdleRequestCallback) => number;
        cancelIdleCallback: (handle: number) => void;
      };
      const handle = idleWindow.requestIdleCallback(() => {
        prefetchLikelyTabs();
      });
      return () => idleWindow.cancelIdleCallback(handle);
    }

    const timeout = globalThis.setTimeout(prefetchLikelyTabs, 1200);
    return () => globalThis.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!draft) {
      return;
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [draft]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", appData.settings.theme);
    if (appData.settings.theme === "dark") {
      document.documentElement.classList.add("dark");
      document.body.classList.remove("light");
    } else {
      document.documentElement.classList.remove("dark");
      document.body.classList.add("light");
    }
  }, [appData.settings.theme]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const closeMenuOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsMobileMenuOpen(false);
      }
    };

    if (mediaQuery.matches) {
      setIsMobileMenuOpen(false);
    }

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", closeMenuOnDesktop);
      return () => mediaQuery.removeEventListener("change", closeMenuOnDesktop);
    }

    mediaQuery.addListener(closeMenuOnDesktop);
    return () => mediaQuery.removeListener(closeMenuOnDesktop);
  }, []);

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

  const captureOriginalDraftMarkerLabels = (nextDraft: ExtractionDraft | null) => {
    if (!nextDraft) {
      setDraftOriginalMarkerLabels({});
      return;
    }
    const byId = Object.fromEntries(
      nextDraft.markers.map((marker) => [marker.id, marker.marker])
    );
    setDraftOriginalMarkerLabels(byId);
  };

  const startManualEntry = () => {
    setUploadError("");
    setUploadNotice("");
    setUploadSummary(null);
    setDraftAnnotations(blankAnnotations());
    setSelectedProtocolId(getMostRecentlyUsedProtocolId(appData.reports));
    setLastUploadedFile(null);
    setIsImprovingExtraction(false);
    setShowUncertaintyModal(false);
    setShowComparisonModal(false);
    setPendingDiff(null);
    setAiCandidateDraft(null);
    setUncertaintyAssessment(null);
    const manualDraft: ExtractionDraft = {
      sourceFileName: "Manual entry",
      testDate: new Date().toISOString().slice(0, 10),
      markers: [
        {
          id: createId(),
          marker: "",
          canonicalMarker: "Unknown Marker",
          value: 0,
          unit: "",
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
    };
    setDraft(manualDraft);
    setLocalBaselineDraft(manualDraft);
    captureOriginalDraftMarkerLabels(manualDraft);
    setActiveTab("dashboard");
  };

  const loadDemoData = () => {
    if (isShareMode) {
      return;
    }
    const demoProtocols = getDemoProtocols();
    const demoReports = getDemoReports();
    const demoSupplementTimeline = getDemoSupplementTimeline();
    const demoCheckIns = getDemoCheckIns();
    setAppData((prev) => ({
      ...prev,
      reports: demoReports,
      protocols: [...prev.protocols.filter((protocol) => !protocol.id.startsWith("demo-protocol-")), ...demoProtocols],
      supplementTimeline: [
        ...prev.supplementTimeline.filter((period) => !period.id.startsWith("demo-supp-")),
        ...demoSupplementTimeline
      ],
      checkIns: [
        ...prev.checkIns.filter((checkIn) => !checkIn.id.startsWith("demo-checkin-")),
        ...demoCheckIns
      ].sort((a, b) => a.date.localeCompare(b.date))
    }));
    setActiveTab("dashboard");
  };

  const clearDemoData = () => {
    if (isShareMode) {
      return;
    }
    setAppData((prev) => ({
      ...prev,
      reports: prev.reports.filter((report) => report.extraction.model !== "demo-data"),
      protocols: prev.protocols.filter((protocol) => !protocol.id.startsWith("demo-protocol-")),
      supplementTimeline: prev.supplementTimeline.filter((period) => !period.id.startsWith("demo-supp-")),
      checkIns: prev.checkIns.filter((checkIn) => !checkIn.id.startsWith("demo-checkin-"))
    }));
    setActiveTab("dashboard");
  };

  const scrollPageToTop = () => {
    if (typeof window === "undefined") {
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  const openHiddenUploadPicker = () => {
    const input = hiddenUploadInputRef.current;
    if (!input) {
      return;
    }
    input.value = "";
    input.click();
  };

  const scrollToUploadPanel = () => {
    void ensurePdfParsingModule();
    if (activeTab !== "dashboard") {
      setActiveTab("dashboard");
    }
    requestAnimationFrame(() => {
      const action = resolveUploadTriggerAction({
        isShareMode,
        hasUploadPanel: Boolean(uploadPanelRef.current),
        isProcessing
      });
      if (action === "scroll-to-panel" && uploadPanelRef.current) {
        uploadPanelRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (action !== "open-hidden-picker") {
        return;
      }
      openHiddenUploadPicker();
    });
  };

  const startSecondUpload = () => {
    if (isShareMode || isProcessing) {
      return;
    }
    void ensurePdfParsingModule();
    if (activeTab !== "dashboard") {
      setActiveTab("dashboard");
    }
    requestAnimationFrame(() => {
      openHiddenUploadPicker();
    });
  };

  const clearDemoAndUpload = () => {
    clearDemoData();
    requestAnimationFrame(() => {
      scrollToUploadPanel();
    });
  };

  const countWarnings = (candidate: ExtractionDraft): number =>
    new Set([
      ...(candidate.extraction.warnings ?? []),
      ...(candidate.extraction.warningCode ? [candidate.extraction.warningCode] : [])
    ]).size;

  const getExtractionRouteSummary = (
    candidate: ExtractionDraft
  ): { label: string; usedAi: boolean; usedOcr: boolean } => {
    const route: ExtractionRoute =
      candidate.extraction.debug?.extractionRoute ??
      (candidate.extraction.aiUsed ? "gemini-with-text" : candidate.extraction.debug?.ocrUsed ? "local-ocr" : "local-text");
    if (route === "local-text") {
      return { label: tr("Alleen tekstlaag", "Text layer only"), usedAi: false, usedOcr: false };
    }
    if (route === "local-ocr") {
      return { label: tr("OCR fallback", "OCR fallback"), usedAi: false, usedOcr: true };
    }
    if (route === "local-text-ocr-merged") {
      return { label: tr("Tekst + OCR (samengevoegd)", "Text + OCR (merged)"), usedAi: false, usedOcr: true };
    }
    if (route === "gemini-with-text") {
      return { label: tr("Tekst + AI", "Text + AI"), usedAi: true, usedOcr: false };
    }
    if (route === "gemini-with-ocr") {
      return { label: tr("OCR + AI", "OCR + AI"), usedAi: true, usedOcr: true };
    }
    if (route === "gemini-vision-only") {
      return { label: tr("AI PDF-rescue", "AI PDF rescue"), usedAi: true, usedOcr: false };
    }
    return { label: tr("Geen parserdata", "No parser data"), usedAi: false, usedOcr: false };
  };

  const handleUpload = async (file: File) => {
    setIsProcessing(true);
    setUploadStage("reading_text_layer");
    setUploadError("");
    setUploadNotice("");
    setUploadSummary(null);
    setIsImprovingExtraction(false);
    setLocalBaselineDraft(null);
    setUncertaintyAssessment(null);
    setShowUncertaintyModal(false);
    setShowComparisonModal(false);
    setPendingDiff(null);
    setAiCandidateDraft(null);

    try {
      const { extractLabData, assessParserUncertainty } = await ensurePdfParsingModule();
      const initialParserMode =
        appData.settings.parserDebugMode === "text_ocr_ai" ? "text_ocr" : appData.settings.parserDebugMode;
      const extracted = await extractLabData(file, {
        costMode: appData.settings.aiCostMode,
        aiAutoImproveEnabled: false,
        externalAiAllowed: false,
        aiConsent: {
          action: "parser_rescue",
          scope: "once",
          allowExternalAi: false,
          parserRescueEnabled: false,
          includeSymptoms: false,
          includeNotes: false,
          allowPdfAttachment: false
        },
        parserDebugMode: initialParserMode,
        markerAliasOverrides: appData.markerAliasOverrides,
        onStageChange: setUploadStage
      });
      const warningCount = countWarnings(extracted);
      const assessment = assessParserUncertainty(extracted);
      const shouldPromptAi = appData.settings.parserDebugMode === "text_ocr_ai" && assessment.isUncertain;
      setDraft(extracted);
      setLocalBaselineDraft(extracted);
      setAiCandidateDraft(null);
      setPendingDiff(null);
      setShowComparisonModal(false);
      setUncertaintyAssessment(assessment);
      setShowUncertaintyModal(shouldPromptAi);
      captureOriginalDraftMarkerLabels(extracted);
      setLastUploadedFile(file);
      setDraftAnnotations(blankAnnotations());
      setSelectedProtocolId(getMostRecentlyUsedProtocolId(appData.reports));
      setActiveTab("dashboard");
      scrollPageToTop();
      if (!shouldPromptAi) {
        const routeSummary = getExtractionRouteSummary(extracted);
        setUploadSummary({
          fileName: extracted.sourceFileName,
          markerCount: extracted.markers.length,
          confidence: extracted.extraction.confidence,
          warnings: warningCount,
          routeLabel: routeSummary.label,
          usedAi: routeSummary.usedAi,
          usedOcr: routeSummary.usedOcr
        });
      }
    } catch (error) {
      setUploadError(mapErrorToMessage(error, "pdf"));
      setUploadStage("failed");
    } finally {
      setIsProcessing(false);
      setUploadStage(null);
    }
  };

  const improveDraftWithAi = async () => {
    if (!lastUploadedFile) {
      setUploadError(tr("Upload dit PDF-bestand opnieuw om AI-verbetering uit te voeren.", "Re-upload this PDF to run AI refinement."));
      return;
    }
    const baselineDraft = localBaselineDraft ?? draft;
    if (!baselineDraft) {
      setUploadError(
        tr(
          "Er is geen lokaal basisresultaat beschikbaar voor vergelijking.",
          "No local baseline result is available for comparison."
        )
      );
      return;
    }
    const consent = await requestAiConsent("parser_rescue");
    if (!consent || !consent.allowExternalAi || !consent.parserRescueEnabled) {
      setUploadError(
        tr(
          "Externe AI is niet gestart. Je kunt handmatig doorgaan met lokale extractie.",
          "External AI was not started. You can continue with local extraction manually."
        )
      );
      return;
    }
    setIsImprovingExtraction(true);
    setUploadStage("running_ai_text");
    setUploadError("");
    setUploadNotice("");
    try {
      const { extractLabData } = await ensurePdfParsingModule();
      const improved = await extractLabData(lastUploadedFile, {
        costMode: appData.settings.aiCostMode,
        aiAutoImproveEnabled: true,
        forceAi: true,
        preferAiResultWhenForced: true,
        externalAiAllowed: true,
        aiConsent: consent,
        parserDebugMode: appData.settings.parserDebugMode,
        markerAliasOverrides: appData.markerAliasOverrides,
        onStageChange: setUploadStage
      });
      const diff = buildExtractionDiffSummary(baselineDraft, improved);
      setAiCandidateDraft(improved);
      setPendingDiff(diff);
      setShowComparisonModal(true);
      setShowUncertaintyModal(false);
      setUploadSummary(null);
      scrollPageToTop();
      if (!diff.hasChanges) {
        setUploadNotice(
          tr(
            "AI gaf geen inhoudelijke wijzigingen. Je kunt in de vergelijking alsnog kiezen welke versie je houdt.",
            "AI produced no meaningful changes. You can still choose which version to keep in the comparison."
          )
        );
      }
    } catch (error) {
      setUploadError(mapErrorToMessage(error, "pdf"));
      setUploadStage("failed");
    } finally {
      setIsImprovingExtraction(false);
      setUploadStage(null);
    }
  };

  const promptAiFromUncertainty = () => {
    setShowUncertaintyModal(false);
    void improveDraftWithAi();
  };

  const keepLocalDraftVersion = () => {
    setShowComparisonModal(false);
    setPendingDiff(null);
    setAiCandidateDraft(null);
    setUploadNotice(
      tr(
        "Lokale extractie is behouden. Je kunt markers handmatig aanpassen en opslaan.",
        "Local extraction was kept. You can edit markers manually and save."
      )
    );
  };

  const applyAiCandidateDraft = () => {
    if (!aiCandidateDraft) {
      return;
    }
    const warningCount = countWarnings(aiCandidateDraft);
    setDraft(aiCandidateDraft);
    setLocalBaselineDraft(aiCandidateDraft);
    setUncertaintyAssessment(null);
    captureOriginalDraftMarkerLabels(aiCandidateDraft);
    const routeSummary = getExtractionRouteSummary(aiCandidateDraft);
    setUploadSummary({
      fileName: aiCandidateDraft.sourceFileName,
      markerCount: aiCandidateDraft.markers.length,
      confidence: aiCandidateDraft.extraction.confidence,
      warnings: warningCount,
      routeLabel: routeSummary.label,
      usedAi: routeSummary.usedAi,
      usedOcr: routeSummary.usedOcr
    });
    setShowComparisonModal(false);
    setPendingDiff(null);
    setAiCandidateDraft(null);
    setUploadNotice(
      tr(
        "AI-resultaat is toegepast. Controleer de tabel en sla daarna op.",
        "AI result was applied. Review the table, then save."
      )
    );
  };

  const retryDraftWithOcr = async () => {
    if (!lastUploadedFile) {
      setUploadError(
        tr(
          "Upload dit PDF-bestand opnieuw om OCR opnieuw te proberen.",
          "Re-upload this PDF to retry OCR."
        )
      );
      return;
    }

    setIsProcessing(true);
    setUploadStage("running_ocr");
    setUploadError("");
    setUploadNotice("");
    setUploadSummary(null);
    setIsImprovingExtraction(false);
    setLocalBaselineDraft(null);
    setUncertaintyAssessment(null);
    setShowUncertaintyModal(false);
    setShowComparisonModal(false);
    setPendingDiff(null);
    setAiCandidateDraft(null);

    try {
      const { extractLabData, assessParserUncertainty } = await ensurePdfParsingModule();
      const extracted = await extractLabData(lastUploadedFile, {
        costMode: appData.settings.aiCostMode,
        aiAutoImproveEnabled: false,
        externalAiAllowed: false,
        aiConsent: {
          action: "parser_rescue",
          scope: "once",
          allowExternalAi: false,
          parserRescueEnabled: false,
          includeSymptoms: false,
          includeNotes: false,
          allowPdfAttachment: false
        },
        parserDebugMode: "text_ocr",
        markerAliasOverrides: appData.markerAliasOverrides,
        onStageChange: setUploadStage
      });
      const warningCount = countWarnings(extracted);
      const assessment = assessParserUncertainty(extracted);

      setDraft(extracted);
      setLocalBaselineDraft(extracted);
      setAiCandidateDraft(null);
      setPendingDiff(null);
      setShowComparisonModal(false);
      setUncertaintyAssessment(assessment);
      setShowUncertaintyModal(false);
      captureOriginalDraftMarkerLabels(extracted);
      setDraftAnnotations(blankAnnotations());
      setSelectedProtocolId(getMostRecentlyUsedProtocolId(appData.reports));
      setActiveTab("dashboard");
      scrollPageToTop();
      const routeSummary = getExtractionRouteSummary(extracted);
      setUploadSummary({
        fileName: extracted.sourceFileName,
        markerCount: extracted.markers.length,
        confidence: extracted.extraction.confidence,
        warnings: warningCount,
        routeLabel: routeSummary.label,
        usedAi: routeSummary.usedAi,
        usedOcr: routeSummary.usedOcr
      });
    } catch (error) {
      setUploadError(mapErrorToMessage(error, "pdf"));
      setUploadStage("failed");
    } finally {
      setIsProcessing(false);
      setUploadStage(null);
    }
  };

  const saveDraftAsReport = () => {
    if (!draft) {
      return;
    }

    const learnedAliasOverrides: Record<string, string> = {};
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

    draft.markers.forEach((row) => {
      const originalRaw = draftOriginalMarkerLabels[row.id];
      const currentRaw = row.marker?.trim() ?? "";
      if (!originalRaw || !currentRaw) {
        return;
      }
      const originalKey = normalizeMarkerLookupKey(originalRaw);
      const currentKey = normalizeMarkerLookupKey(currentRaw);
      if (!originalKey || originalKey === currentKey) {
        return;
      }
      const canonical = canonicalizeMarker(currentRaw);
      if (!canonical || canonical === "Unknown Marker") {
        return;
      }
      learnedAliasOverrides[originalKey] = canonical;
    });

    if (sanitizedMarkers.length === 0) {
      setUploadError(tr("Geen geldige markerrijen gevonden. Voeg minimaal één marker toe voordat je opslaat.", "No valid marker rows found. Add at least one marker before saving."));
      return;
    }

    const normalizedDraftSupplementAnchorState =
      draftAnnotations.supplementAnchorState === "inherit" ||
      draftAnnotations.supplementAnchorState === "anchor" ||
      draftAnnotations.supplementAnchorState === "none" ||
      draftAnnotations.supplementAnchorState === "unknown"
        ? draftAnnotations.supplementAnchorState
        : draftAnnotations.supplementOverrides === null
          ? "inherit"
          : draftAnnotations.supplementOverrides.length > 0
            ? "anchor"
            : "none";
    const normalizedDraftAnnotations: ReportAnnotations = {
      ...draftAnnotations,
      supplementAnchorState: normalizedDraftSupplementAnchorState,
      supplementOverrides:
        normalizedDraftSupplementAnchorState === "anchor"
          ? draftAnnotations.supplementOverrides ?? []
          : normalizedDraftSupplementAnchorState === "none"
            ? []
            : null
    };

    const report: LabReport = {
      id: createId(),
      sourceFileName: draft.sourceFileName,
      testDate: draft.testDate,
      createdAt: new Date().toISOString(),
      markers: sanitizedMarkers,
      annotations: samplingControlsEnabled
        ? {
            ...normalizedDraftAnnotations,
            protocolId: selectedProtocolId
          }
        : {
            ...normalizedDraftAnnotations,
            protocolId: selectedProtocolId,
            samplingTiming: "trough"
          },
      extraction: draft.extraction
    };
    const incomingCanonicalMarkers = Array.from(new Set(report.markers.map((marker) => marker.canonicalMarker)));
    const suggestions = detectMarkerMergeSuggestions(incomingCanonicalMarkers, allMarkers);

    addReport(report);
    upsertMarkerAliasOverrides(learnedAliasOverrides);
    appendMarkerSuggestions(suggestions);

    setUploadSummary(null);
    setDraft(null);
    setLocalBaselineDraft(null);
    setAiCandidateDraft(null);
    setPendingDiff(null);
    setShowUncertaintyModal(false);
    setShowComparisonModal(false);
    setUncertaintyAssessment(null);
    setDraftOriginalMarkerLabels({});
    setLastUploadedFile(null);
    setDraftAnnotations(blankAnnotations());
    setSelectedProtocolId(null);
    setUploadError("");
    setIsImprovingExtraction(false);
  };

  const exportCsv = async (selectedMarkers: string[]) => {
    const { buildCsv } = await import("./csvExport");
    const csv = buildCsv(reports, selectedMarkers, appData.settings.unitSystem, appData.protocols, appData.supplementTimeline);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `trt-lab-data-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = async () => {
    const { exportElementToPdf } = await import("./pdfExport");
    const root = document.getElementById("dashboard-export-root");
    if (!root) {
      return;
    }
    await exportElementToPdf(root, `labtracker-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const chartPointsForMarker = (markerName: string): MarkerSeriesPoint[] =>
    buildMarkerSeries(visibleReports, markerName, appData.settings.unitSystem, appData.protocols, appData.supplementTimeline);

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
    const baselinePoint = buildMarkerSeries(
      [baselineReport],
      marker,
      appData.settings.unitSystem,
      appData.protocols,
      appData.supplementTimeline
    )[0];
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

  // Only count out-of-range markers from the most recent report so the sidebar
  // reflects the *current* state, not a sum across all historical reports.
  const outOfRangeCount = useMemo(() => {
    if (visibleReports.length === 0) return 0;
    const latestReport = [...visibleReports].sort((a, b) => b.testDate.localeCompare(a.testDate))[0];
    return latestReport.markers.filter((m) => m.abnormal === "high" || m.abnormal === "low").length;
  }, [visibleReports]);
  const hasReports = reports.length > 0;
  const activeProtocolId = useMemo(() => getMostRecentlyUsedProtocolId(reports), [reports]);
  const activeProtocol = useMemo(
    () => appData.protocols.find((protocol) => protocol.id === activeProtocolId) ?? null,
    [appData.protocols, activeProtocolId]
  );
  const activeProtocolCompound = useMemo(
    () => getPrimaryProtocolCompound(activeProtocol),
    [activeProtocol]
  );
  const activeProtocolDose = useMemo(
    () => getProtocolDoseMgPerWeek(activeProtocol),
    [activeProtocol]
  );
  const activeAnalysisProtocolLabel = useMemo(() => {
    if (visibleReports.length === 0) {
      return tr("Geen protocol", "No protocol");
    }
    const latestReport = [...visibleReports].sort((left, right) => {
      const byDate = right.testDate.localeCompare(left.testDate);
      if (byDate !== 0) {
        return byDate;
      }
      return right.createdAt.localeCompare(left.createdAt);
    })[0];
    if (!latestReport) {
      return tr("Geen protocol", "No protocol");
    }
    const linked = getReportProtocol(latestReport, appData.protocols);
    const linkedLabel = getProtocolDisplayLabel(linked).trim();
    if (linkedLabel) {
      return linkedLabel;
    }
    const annotationLabel = latestReport.annotations.protocol.trim();
    return annotationLabel || tr("Geen protocol", "No protocol");
  }, [appData.protocols, visibleReports, tr]);
  const analysisMarkerNames = useMemo(() => {
    const markerSet = new Set<string>();
    visibleReports.forEach((report) => {
      report.markers.forEach((marker) => {
        markerSet.add(marker.canonicalMarker);
      });
    });
    return Array.from(markerSet);
  }, [visibleReports]);

  const uploadStageText = useMemo(() => {
    if (!uploadStage) {
      return tr("PDF wordt verwerkt...", "Processing PDF...");
    }
    if (uploadStage === "reading_text_layer") {
      return tr("Tekstlaag lezen...", "Reading text layer...");
    }
    if (uploadStage === "running_ocr") {
      return tr("OCR uitvoeren op scan...", "Running OCR on scanned pages...");
    }
    if (uploadStage === "running_ai_text") {
      return tr("AI parser op geanonimiseerde tekst...", "Running AI parser on redacted text...");
    }
    if (uploadStage === "running_ai_pdf_rescue") {
      return tr("AI PDF-rescue uitvoeren...", "Running AI PDF rescue...");
    }
    if (uploadStage === "done") {
      return tr("Extractie afgerond.", "Extraction completed.");
    }
    return tr("Extractie mislukt.", "Extraction failed.");
  }, [uploadStage, tr]);

  const runAiAnalysisWithConsent = async (analysisType: "full" | "latestComparison") => {
    const decision = await requestAiConsent("analysis");
    if (!decision || !decision.allowExternalAi) {
      setAnalysisError(
        tr(
          "Externe AI is niet gestart. Je kunt doorgaan zonder AI of later opnieuw proberen.",
          "External AI was not started. You can continue without AI or try again later."
        )
      );
      return;
    }
    if (decision.scope === "always") {
      updateSettings({ aiExternalConsent: true });
    }
    await runAiAnalysis(analysisType, decision);
  };

  const activeTabTitle = getTabLabel(activeTab, appData.settings.language);
  const activeTabSubtitle = (() => {
    if (isShareMode) {
      return activeTab === "dashboard"
        ? tr("Gedeelde read-only snapshot van tijdlijntrends en markercontext.", "Shared read-only snapshot of timeline trends and marker context.")
        : null;
    }
    if (activeTab === "dashboard") return hasReports ? tr("Je gezondheidsmarkers in één oogopslag.", "Your health markers at a glance.") : null;
    if (activeTab === "reports") return tr("Alle geüploade labresultaten in één overzicht.", "All uploaded lab reports in one overview.");
    if (activeTab === "alerts") return tr("Trends en drempelwaarschuwingen voor je markers.", "Trend and threshold alerts for your markers.");
    if (activeTab === "protocol") return tr("Je testosteronprotocol in detail.", "Your TRT protocol details and history.");
    if (activeTab === "supplements") return tr("Bijhoud supplementen naast je labresultaten.", "Track your supplements alongside lab results.");
    if (activeTab === "protocolImpact") return tr("Protocolwijzigingen afgezet tegen je gemeten markers.", "Measured impact of protocol changes on your markers.");
    if (activeTab === "doseResponse") return tr("Simuleer hoe dosisaanpassingen je waarden beïnvloeden.", "Model how dose changes may affect your levels.");
    if (activeTab === "checkIns") return tr("Volg hoe je je voelt naast je labwaarden.", "Track how you feel alongside your lab results.");
    if (activeTab === "analysis") return tr("AI-inzichten gebaseerd op je labdata.", "AI-powered insights from your lab data.");
    return null;
  })();
  const tabLoadFallback = (
    <section className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
      <div className="flex items-center gap-2 text-sm text-slate-300">
        <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
        {tr("Sectie wordt geladen...", "Loading section...")}
      </div>
      <p className="mt-1 text-xs text-slate-500">{activeTabTitle}</p>
    </section>
  );
  const analysisResultDisplay = useMemo(() => normalizeAnalysisTextForDisplay(analysisResult), [analysisResult]);
  const visibleTabs = isShareMode ? TAB_ITEMS.filter((tab) => tab.key === "dashboard") : TAB_ITEMS;
  const visibleTabKeys = useMemo(() => new Set(visibleTabs.map((tab) => tab.key as TabKey)), [visibleTabs]);
  const requestTabChange = (nextTab: TabKey) => {
    if (nextTab === activeTab) {
      return;
    }
    if (nextTab !== "reports") {
      setFocusedReportId(null);
    }
    if (draft && !isShareMode) {
      setPendingTabChange(nextTab);
      return;
    }
    setActiveTab(nextTab);
  };
  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };
  const openAlertsForMarker = (marker: string) => {
    setFocusedAlertMarker(marker);
    requestTabChange("alerts");
  };
  const openReportForSupplementBackfill = (reportId: string) => {
    setFocusedReportId(reportId);
    requestTabChange("reports");
  };

  useEffect(() => {
    closeMobileMenu();
    scrollPageToTop();
  }, [activeTab]);

  const cancelPendingTabChange = () => {
    setPendingTabChange(null);
    setFocusedReportId(null);
  };
  const confirmPendingTabChange = () => {
    if (!pendingTabChange) {
      return;
    }
    const nextTab = pendingTabChange;
    setPendingTabChange(null);
    setDraft(null);
    setLocalBaselineDraft(null);
    setAiCandidateDraft(null);
    setPendingDiff(null);
    setShowUncertaintyModal(false);
    setShowComparisonModal(false);
    setUncertaintyAssessment(null);
    setDraftOriginalMarkerLabels({});
    setDraftAnnotations(blankAnnotations());
    setSelectedProtocolId(null);
    setUploadError("");
    if (nextTab !== "reports") {
      setFocusedReportId(null);
    }
    setActiveTab(nextTab);
  };

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
  const quickUploadDisabled = isShareMode || isProcessing;

  if (isShareResolving) {
    return (
      <div className="min-h-screen px-3 py-4 text-slate-100 sm:px-5 lg:px-6">
        <section className="mx-auto w-full max-w-xl rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-5 text-sm text-slate-200">
          <div className="flex items-center gap-2 text-cyan-200">
            <Loader2 className="h-4 w-4 animate-spin" />
            {shareBootstrapText("Korte deellink wordt geladen...", "Loading short share link...")}
          </div>
          <p className="mt-2 text-slate-400">
            {shareBootstrapText(
              "Even geduld. We openen je read-only snapshot.",
              "Please wait. We are opening your read-only snapshot."
            )}
          </p>
        </section>
      </div>
    );
  }

  if (isShareBootstrapError) {
    return (
      <div className="min-h-screen px-3 py-4 text-slate-100 sm:px-5 lg:px-6">
        <section className="mx-auto w-full max-w-xl rounded-2xl border border-rose-500/30 bg-slate-900/80 p-5 text-sm text-rose-100">
          <p className="font-semibold">{shareBootstrapText("Deellink niet beschikbaar", "Share link unavailable")}</p>
          <p className="mt-2 text-rose-100/90">
            {shareBootstrap.errorMessage ||
              shareBootstrapText(
                "Deze deellink kon niet worden geopend. Vraag de verzender om een nieuwe link.",
                "This share link could not be opened. Ask the sender for a new link."
              )}
          </p>
        </section>
      </div>
    );
  }

  return (
    <>
      <AppShell
        shellState={{
          activeTab,
          activeTabTitle,
          activeTabSubtitle,
          visibleTabKeys,
          isMobileMenuOpen,
          quickUploadDisabled,
          language: appData.settings.language,
          theme: appData.settings.theme,
          isShareMode,
          isNl,
          sharedSnapshotGeneratedAt: sharedSnapshot?.generatedAt ?? null,
          hasReports,
          activeProtocolCompound,
          outOfRangeCount,
          reportsCount: reports.length
        }}
        uploadState={{
          uploadPanelRef,
          hiddenUploadInputRef,
          isProcessing,
          uploadStage,
          uploadError,
          uploadNotice
        }}
        actions={{
          onRequestTabChange: requestTabChange,
          onToggleMobileMenu: () => setIsMobileMenuOpen((current) => !current),
          onCloseMobileMenu: closeMobileMenu,
          onQuickUpload: startSecondUpload,
          onLanguageChange: (language) => updateSettings({ language }),
          onToggleTheme: () => updateSettings({ theme: appData.settings.theme === "dark" ? "light" : "dark" }),
          onUploadFileSelected: handleUpload,
          onUploadIntent: () => {
            void ensurePdfParsingModule();
          },
          onStartManualEntry: startManualEntry
        }}
        tr={tr}
      >
        <AnimatePresence mode="wait">
            {draft && !isShareMode ? (
              <ExtractionReviewTable
                key="draft"
                draft={draft}
                annotations={draftAnnotations}
                protocols={appData.protocols}
                supplementTimeline={appData.supplementTimeline}
                inheritedSupplementsPreview={draftInheritedSupplements}
                inheritedSupplementsSourceLabel={draftInheritedSupplementsLabel}
                selectedProtocolId={selectedProtocolId}
                parserDebugMode={appData.settings.parserDebugMode}
                language={appData.settings.language}
                onDraftChange={setDraft}
                onAnnotationsChange={setDraftAnnotations}
                onSelectedProtocolIdChange={setSelectedProtocolId}
                onProtocolCreate={addProtocol}
                onAddSupplementPeriod={addSupplementPeriod}
                isImprovingWithAi={isImprovingExtraction}
                onImproveWithAi={
                  lastUploadedFile &&
                  appData.settings.parserDebugMode === "text_ocr_ai" &&
                  Boolean(uncertaintyAssessment?.isUncertain) &&
                  !draft.extraction.aiUsed
                    ? improveDraftWithAi
                    : undefined
                }
                onRetryWithOcr={lastUploadedFile ? retryDraftWithOcr : undefined}
                onStartManualEntry={startManualEntry}
                onSave={saveDraftAsReport}
                onCancel={() => {
                  setUploadSummary(null);
                  setDraft(null);
                  setLocalBaselineDraft(null);
                  setAiCandidateDraft(null);
                  setPendingDiff(null);
                  setShowUncertaintyModal(false);
                  setShowComparisonModal(false);
                  setUncertaintyAssessment(null);
                  setDraftOriginalMarkerLabels({});
                  setLastUploadedFile(null);
                  setSelectedProtocolId(null);
                  setIsImprovingExtraction(false);
                }}
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
                            "Je verkent de app met demodata — kijk gerust rond. Klaar? Begin opnieuw met je eigen uitslagen.",
                            "You're exploring with demo data — feel free to look around. When you're ready, start fresh with your own labs."
                          )
                        : tr(
                            "Demodata is nog geladen. Wis het wanneer je klaar bent.",
                            "Demo data is still loaded. Clear it when you're ready."
                          )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isDemoMode ? (
                      <>
                        <button
                          type="button"
                          className={`${uploadOwnPdfButtonClassName} ${isProcessing ? "cursor-not-allowed opacity-70" : ""}`}
                          onClick={clearDemoAndUpload}
                          disabled={isProcessing}
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
                              {tr("PDF wordt verwerkt...", "Processing PDF...")}
                            </>
                          ) : (
                            tr("Upload je eigen PDF", "Upload your own PDF")
                          )}
                        </button>
                        <button
                          type="button"
                          className={clearDemoButtonClassName}
                          onClick={clearDemoData}
                        >
                          {tr("Begin opnieuw", "Start fresh")}
                        </button>
                      </>
                    ) : (
                      // Mixed state (demo + own data): offer to clear demo
                      <button
                        type="button"
                        className={clearDemoButtonClassName}
                        onClick={clearDemoData}
                      >
                        {tr("Demodata wissen", "Clear demo data")}
                      </button>
                    )}
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
            outOfRangeCount={outOfRangeCount}
            settings={appData.settings}
            language={appData.settings.language}
            isShareMode={isShareMode}
            samplingControlsEnabled={samplingControlsEnabled}
            dashboardView={dashboardView}
            dashboardMode={dashboardMode}
            leftCompareMarker={leftCompareMarker}
            rightCompareMarker={rightCompareMarker}
            timeRangeOptions={timeRangeOptions}
            samplingOptions={samplingOptions}
            onUpdateSettings={updateSettings}
            onDashboardViewChange={setDashboardView}
            onDashboardModeChange={setDashboardMode}
            onLeftCompareMarkerChange={setLeftCompareMarker}
            onRightCompareMarkerChange={setRightCompareMarker}
            onExpandMarker={setExpandedMarker}
            onOpenMarkerAlerts={openAlertsForMarker}
            chartPointsForMarker={chartPointsForMarker}
            markerPercentChange={markerPercentChange}
            markerBaselineDelta={markerBaselineDelta}
            onLoadDemo={loadDemoData}
            onUploadClick={startSecondUpload}
            isProcessing={isProcessing}
            checkIns={appData.checkIns}
            onNavigateToCheckIns={() => setActiveTab("checkIns")}
          />
        ) : null}

        {activeTab !== "dashboard" ? (
          <Suspense fallback={tabLoadFallback}>
            {activeTab === "protocol" ? (
              <ProtocolView
                protocols={appData.protocols}
                reports={reports}
                language={appData.settings.language}
                isShareMode={isShareMode}
                onAddProtocol={addProtocol}
                onUpdateProtocol={updateProtocol}
                onDeleteProtocol={deleteProtocol}
                getProtocolUsageCount={getProtocolUsageCount}
              />
            ) : null}

            {activeTab === "supplements" ? (
              <SupplementsView
                language={appData.settings.language}
                reports={reports}
                timeline={appData.supplementTimeline}
                resolvedSupplementContexts={resolvedSupplementContexts}
                isShareMode={isShareMode}
                onAddSupplementPeriod={addSupplementPeriod}
                onUpdateSupplementPeriod={updateSupplementPeriod}
                onStopSupplement={stopSupplement}
                onDeleteSupplementPeriod={deleteSupplementPeriod}
                onOpenReportForSupplementBackfill={openReportForSupplementBackfill}
              />
            ) : null}

            {activeTab === "checkIns" ? (
              <CheckInsView
                checkIns={appData.checkIns}
                language={appData.settings.language}
                isShareMode={isShareMode}
                onAdd={(data) => addCheckIn({ ...data, id: crypto.randomUUID() })}
                onUpdate={updateCheckIn}
                onDelete={deleteCheckIn}
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
                focusedMarker={focusedAlertMarker}
                onFocusedMarkerHandled={() => setFocusedAlertMarker(null)}
              />
            ) : null}

            {activeTab === "protocolImpact" ? (
              <ProtocolImpactView
                protocolDoseOverview={protocolDoseOverview}
                protocolDoseEvents={protocolDoseEvents}
                protocolWindowSize={protocolWindowSize}
                protocolMarkerSearch={protocolMarkerSearch}
                protocolCategoryFilter={protocolCategoryFilter}
                settings={appData.settings}
                language={appData.settings.language}
                onProtocolWindowSizeChange={setProtocolWindowSize}
                onProtocolMarkerSearchChange={setProtocolMarkerSearch}
                onProtocolCategoryFilterChange={setProtocolCategoryFilter}
              />
            ) : null}

            {activeTab === "doseResponse" ? (
              <DoseResponseView
                dosePredictions={dosePredictions}
                customDoseValue={customDoseValue}
                hasCustomDose={hasCustomDose}
                doseResponseInput={doseResponseInput}
                visibleReports={visibleReports}
                protocols={appData.protocols}
                settings={appData.settings}
                language={appData.settings.language}
                currentProtocolDose={activeProtocolDose}
                onDoseResponseInputChange={setDoseResponseInput}
                onNavigateToProtocol={() => setActiveTab("protocol")}
              />
            ) : null}

            {activeTab === "reports" ? (
              <ReportsView
                reports={reports}
                protocols={appData.protocols}
                supplementTimeline={appData.supplementTimeline}
                settings={appData.settings}
                language={appData.settings.language}
                samplingControlsEnabled={samplingControlsEnabled}
                isShareMode={isShareMode}
                resolvedSupplementContexts={resolvedSupplementContexts}
                onDeleteReport={deleteReportFromData}
                onDeleteReports={deleteReportsFromData}
                onUpdateReportAnnotations={updateReportAnnotations}
                onSetBaseline={setBaseline}
                onRenameMarker={openRenameDialog}
                onOpenProtocolTab={() => requestTabChange("protocol")}
                focusedReportId={focusedReportId}
                onFocusedReportHandled={() => setFocusedReportId(null)}
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
                analysisModelInfo={analysisModelInfo}
                analysisKind={analysisKind}
                analyzingKind={analyzingKind}
                analysisScopeNotice={analysisScopeNotice}
                reportsInScope={visibleReports.length}
                markersTracked={allMarkers.length}
                analysisMarkerNames={analysisMarkerNames}
                activeProtocolLabel={activeAnalysisProtocolLabel}
                betaUsage={betaUsage}
                betaLimits={betaLimits}
                settings={appData.settings}
                language={appData.settings.language}
                onRunAnalysis={runAiAnalysisWithConsent}
                onCopyAnalysis={copyAnalysis}
              />
            ) : null}

            {activeTab === "settings" ? (
              <SettingsView
                settings={appData.settings}
                language={appData.settings.language}
                reports={reports}
                samplingControlsEnabled={samplingControlsEnabled}
                allMarkers={allMarkers}
                editableMarkers={editableMarkers}
                markerUsage={markerUsage}
                shareOptions={shareOptions}
                shareLink={shareLink}
                shareStatus={shareStatus}
                shareMessage={shareMessage}
                shareIncludedReports={shareIncludedReports}
                shareExpiresAt={shareExpiresAt}
                onUpdateSettings={updateSettings}
                onRemapMarker={remapMarkerAcrossReports}
                onOpenRenameDialog={openRenameDialog}
                onExportJson={exportJson}
                onExportCsv={exportCsv}
                onExportPdf={exportPdf}
                onImportData={importData}
                onClearAllData={clearAllData}
                onAddMarkerSuggestions={appendMarkerSuggestions}
                onShareOptionsChange={setShareOptions}
                onGenerateShareLink={generateShareLink}
              />
            ) : null}
          </Suspense>
        ) : null}
      </AppShell>

      <ParserUncertaintyModal
        open={showUncertaintyModal}
        language={appData.settings.language}
        assessment={uncertaintyAssessment}
        onSkip={() => setShowUncertaintyModal(false)}
        onUseAi={promptAiFromUncertainty}
      />

      <ExtractionComparisonModal
        open={showComparisonModal}
        language={appData.settings.language}
        summary={pendingDiff}
        onKeepLocal={keepLocalDraftVersion}
        onApplyAi={applyAiCandidateDraft}
      />

      <AIConsentModal
        open={consentAction !== null}
        action={consentAction ?? "analysis"}
        language={appData.settings.language}
        onClose={() => resolveConsentRequest(null)}
        onDecide={(decision) => resolveConsentRequest(decision)}
      />

      <AnimatePresence>
        {isProcessing ? (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-md rounded-2xl border border-cyan-500/40 bg-slate-900/95 p-5 shadow-soft"
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 6 }}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-xl border border-cyan-400/35 bg-cyan-500/10 p-2">
                  <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
                </div>
                <div>
                  <p className="text-base font-semibold text-slate-100">
                    {tr("Je PDF wordt verwerkt", "Your PDF is being processed")}
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    {uploadStageText}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {tr(
                      "Markerwaarden, eenheden en referentiebereiken worden nu uitgelezen.",
                      "Markers, units, and reference ranges are being extracted."
                    )}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}

        {uploadSummary ? (
          <motion.div
            className="fixed inset-0 z-[69] flex items-center justify-center bg-slate-950/60 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setUploadSummary(null)}
          >
            <motion.div
              className="w-full max-w-xl rounded-2xl border border-cyan-500/35 bg-gradient-to-br from-slate-900 to-slate-950 p-5 shadow-soft"
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 6 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-100">
                      {uploadSummary.markerCount > 0
                        ? tr("PDF succesvol verwerkt", "PDF processed successfully")
                        : tr("PDF geüpload, maar geen markers gevonden", "PDF uploaded, but no markers were found")}
                    </h3>
                    <p className="mt-1 text-sm text-slate-300">{uploadSummary.fileName}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:border-slate-500"
                  onClick={() => setUploadSummary(null)}
                >
                  {tr("Sluiten", "Close")}
                </button>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">{tr("Markers gevonden", "Markers found")}</p>
                  <p className="mt-0.5 text-lg font-semibold text-cyan-300">{uploadSummary.markerCount}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">{tr("Betrouwbaarheid", "Confidence")}</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-100">{Math.round(uploadSummary.confidence * 100)}%</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">{tr("Waarschuwingen", "Warnings")}</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-100">{uploadSummary.warnings}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">{tr("Gebruikte route", "Used route")}</p>
                  <p className="mt-0.5 text-sm font-semibold text-cyan-100">{uploadSummary.routeLabel}</p>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                {uploadSummary.usedAi || uploadSummary.usedOcr
                  ? tr(
                      "Controleer altijd markernaam, waarde en referentiebereik voordat je opslaat. OCR/AI kan kleine fouten maken.",
                      "Always verify marker name, value, and reference range before saving. OCR/AI can make minor mistakes."
                    )
                  : tr(
                      "Controleer altijd markernaam, waarde en referentiebereik voordat je opslaat. Ook tekst-only parsing kan fouten maken.",
                      "Always verify marker name, value, and reference range before saving. Text-only parsing can still make mistakes."
                    )}
                {uploadSummary.warnings > 0 ? ` ${tr("Er zijn parserwaarschuwingen gevonden.", "Parser warnings were detected.")}` : ""}
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className="rounded-md border border-cyan-500/60 bg-cyan-500/15 px-3 py-1.5 text-sm font-medium text-cyan-100 hover:border-cyan-400 hover:bg-cyan-500/20"
                  onClick={() => setUploadSummary(null)}
                >
                  {tr("Doorgaan", "Continue")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}

        {pendingTabChange ? (
          <motion.div
            className="fixed inset-0 z-[68] flex items-center justify-center bg-slate-950/70 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={cancelPendingTabChange}
          >
            <motion.div
              className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-900 p-4 shadow-soft"
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 6 }}
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-slate-100">
                {tr("PDF-upload is nog actief", "PDF upload is still active")}
              </h3>
              <p className="mt-2 text-sm text-slate-300">
                {tr(
                  "Je hebt een rapportreview open. Als je deze sectie verlaat, gaan niet-opgeslagen wijzigingen verloren.",
                  "You have an active report review. If you leave this section, unsaved changes will be lost."
                )}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500"
                  onClick={cancelPendingTabChange}
                >
                  {tr("Blijven", "Stay")}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-rose-500/50 bg-rose-500/15 px-3 py-1.5 text-sm text-rose-100 hover:bg-rose-500/20"
                  onClick={confirmPendingTabChange}
                >
                  {tr("Verlaten", "Leave")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}

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
    </>
  );
};

export default App;
