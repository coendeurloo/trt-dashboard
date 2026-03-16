import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import CloudAuthModal, { type CloudAuthView } from "./components/CloudAuthModal";
import {
  CLOUD_BACKUP_PROMPT_DISMISSED_STORAGE_KEY,
  CLOUD_PRIVACY_POLICY_VERSION
} from "./cloud/constants";
import type { CloudConsentPayload } from "./cloud/consentClient";
import { getDemoSnapshot } from "./demoData";
import { blankAnnotations, normalizeAnalysisTextForDisplay } from "./chartHelpers";
import { getMarkerDisplayName, getTabLabel, trLocale } from "./i18n";
import {
  getMostRecentlyUpdatedProtocolId,
  getPrimaryProtocolCompound,
  getProtocolDisplayLabel,
  getProtocolDoseMgPerWeek,
  getReportProtocol,
  withResolvedInterventionAnnotations
} from "./protocolUtils";
import { canonicalizeMarker, normalizeMarkerMeasurement } from "./unitConversion";
import useAnalysis from "./hooks/useAnalysis";
import useAppData, { MarkerMergeSuggestion, detectMarkerMergeSuggestions } from "./hooks/useAppData";
import { useCloudAuth } from "./hooks/useCloudAuth";
import { useCloudSync } from "./hooks/useCloudSync";
import { useShareGeneration } from "./hooks/useShareGeneration";
import {
  useShareBootstrap,
  shareBootstrapText
} from "./hooks/useShareBootstrap";
import { buildExtractionDiffSummary } from "./extractionDiff";
import { getCurrentActiveSupplementStack, resolveReportSupplementContexts } from "./supplementUtils";
import { getPersonaTabLabel, isTabVisibleForProfile } from "./personaConfig";
import {
  useCoreDerivedData,
  useDashboardDerivedData,
  useProtocolDerivedData
} from "./hooks/useDerivedData";
import {
  buildRememberedParserRescueConsent,
  isSevereParserExtraction,
  resolveUploadTriggerAction,
  shouldPresentUploadAsNeedsReview,
  shouldOfferParserImprovementSubmission,
  shouldAutoApplyAiRescueResult
} from "./uploadFlow";
import { normalizeMarkerLookupKey } from "./markerNormalization";
import { mapServiceErrorToMessage } from "./lib/errorMessages";
import { enrichMarkersForReview } from "./utils/markerReview";
import { getDemoBannerButtonClassNames } from "./ui/demoBannerStyles";
import {
  ParserImprovementFormValues,
  ParserImprovementSubmissionError,
  submitParserImprovementSample
} from "./parserImprovementSubmission";
import DashboardView from "./views/DashboardView";
import {
  AIConsentAction,
  AIConsentDecision,
  AppMode,
  AppSettings,
  ExtractionDraft,
  ExtractionDiffSummary,
  ExtractionRoute,
  LabReport,
  MarkerValue,
  ParserUncertaintyAssessment,
  ParserStage,
  ReportAnnotations,
  UserProfile,
  TabKey,
  DashboardViewMode,
  TimeRangeKey
} from "./types";
import { AnalystMemory } from "./types/analystMemory";
import { createId, deriveAbnormalFlag } from "./utils";
import { loadAnalystMemory, saveAnalystMemory } from "./storage";

const ProtocolView = lazy(() => import("./views/ProtocolView"));
const SupplementsView = lazy(() => import("./views/SupplementsView"));
const CheckInsView = lazy(() => import("./views/CheckInsView"));
const AlertsView = lazy(() => import("./views/AlertsView"));
const ProtocolImpactView = lazy(() => import("./views/ProtocolImpactView"));
const DoseResponseView = lazy(() => import("./views/DoseResponseView"));
const ReportsView = lazy(() => import("./views/ReportsView"));
const AnalysisView = lazy(() => import("./views/AnalysisView"));
const SettingsView = lazy(() => import("./views/SettingsView"));
const ExtractionReviewTable = lazy(() => import("./components/ExtractionReviewTable"));
const MarkerTrendChart = lazy(() => import("./components/MarkerTrendChart"));
const AIConsentModal = lazy(() => import("./components/AIConsentModal"));
const ExtractionComparisonModal = lazy(() => import("./components/ExtractionComparisonModal"));
const ParserImprovementSubmissionCard = lazy(() => import("./components/ParserImprovementSubmissionCard"));
const ParserUploadSummaryModal = lazy(() => import("./components/ParserUploadSummaryModal"));
const OnboardingWizard = lazy(() => import("./components/OnboardingWizard"));

type UploadSummary =
  | {
      kind: "upload";
      fileName: string;
      markerCount: number;
      warnings: number;
      routeLabel: string;
    }
  | {
      kind: "ai_rescue";
      fileName: string;
      baselineMarkerCount: number;
      baselineRouteLabel: string;
      finalMarkerCount: number;
      finalRouteLabel: string;
      warnings: number;
      aiApplied: boolean;
    };

const CLOUD_POST_AUTH_INTENT_STORAGE_KEY = "labtracker-cloud-post-auth-intent-v1";
const CLOUD_POST_AUTH_INTENT_MAX_AGE_MS = 10 * 60 * 1000;

type PendingCloudAuthIntent = {
  view: CloudAuthView;
  createdAt: string;
};

const persistCloudPostAuthIntent = (view: CloudAuthView): void => {
  if (typeof window === "undefined") {
    return;
  }
  const payload: PendingCloudAuthIntent = {
    view,
    createdAt: new Date().toISOString()
  };
  window.localStorage.setItem(CLOUD_POST_AUTH_INTENT_STORAGE_KEY, JSON.stringify(payload));
};

const clearCloudPostAuthIntent = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(CLOUD_POST_AUTH_INTENT_STORAGE_KEY);
};

const loadCloudPostAuthIntent = (): CloudAuthView | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(CLOUD_POST_AUTH_INTENT_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as PendingCloudAuthIntent;
    if (parsed.view !== "signin" && parsed.view !== "signup") {
      clearCloudPostAuthIntent();
      return null;
    }
    const createdAtMs = new Date(parsed.createdAt).getTime();
    if (!Number.isFinite(createdAtMs) || Date.now() - createdAtMs > CLOUD_POST_AUTH_INTENT_MAX_AGE_MS) {
      clearCloudPostAuthIntent();
      return null;
    }
    return parsed.view;
  } catch {
    clearCloudPostAuthIntent();
    return null;
  }
};

const loadBackupPromptDismissed = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(CLOUD_BACKUP_PROMPT_DISMISSED_STORAGE_KEY) === "1";
};

const buildFallbackParserAssessment = (draft: ExtractionDraft): ParserUncertaintyAssessment => {
  const warningCodes = Array.from(
    new Set([...(draft.extraction.warnings ?? []), ...(draft.extraction.warningCode ? [draft.extraction.warningCode] : [])])
  ) as ParserUncertaintyAssessment["warnings"];
  const markersWithUnit = draft.markers.filter((marker) => typeof marker.unit === "string" && marker.unit.trim().length > 0).length;
  const unitCoverage = draft.markers.length > 0 ? markersWithUnit / draft.markers.length : 0;

  return {
    isUncertain: false,
    reasons: [],
    markerCount: draft.markers.length,
    confidence: draft.extraction.confidence,
    unitCoverage,
    warnings: warningCodes
  };
};

const App = () => {
  const { shareBootstrap, sharedSnapshot, isShareMode, isShareResolving, isShareBootstrapError } = useShareBootstrap();
  const [analystMemory, setAnalystMemory] = useState<AnalystMemory | null>(() => loadAnalystMemory());

  const {
    appData,
    setAppData,
    updateSettings,
    updatePersonalInfo,
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
  const cloudAuth = useCloudAuth(isShareMode);
  const cloudSync = useCloudSync({
    enabled: cloudAuth.appMode === "cloud",
    session: cloudAuth.session,
    isShareMode,
    appData,
    setAppData
  });
  const [cloudAuthModalOpen, setCloudAuthModalOpen] = useState(false);
  const [cloudAuthModalView, setCloudAuthModalView] = useState<CloudAuthView>("signin");
  const [pendingCloudPostAuthIntent, setPendingCloudPostAuthIntent] = useState<CloudAuthView | null>(() =>
    loadCloudPostAuthIntent()
  );
  const [showSignupSuccessModal, setShowSignupSuccessModal] = useState(false);
  const [showSigninSuccessToast, setShowSigninSuccessToast] = useState(false);
  const [backupPromptDismissed, setBackupPromptDismissed] = useState<boolean>(() => loadBackupPromptDismissed());
  const appMode: AppMode = cloudAuth.appMode;
  const tr = useCallback((nl: string, en: string): string => trLocale(appData.settings.language, nl, en), [appData.settings.language]);
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
  const showAdvancedParserActions =
    import.meta.env.DEV || /^(1|true|yes)$/i.test(String(import.meta.env.VITE_ENABLE_PARSER_DEBUG ?? "").trim());
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
  const [onboardingReport, setOnboardingReport] = useState<LabReport | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [doseResponseInput, setDoseResponseInput] = useState("");
  const [dashboardView, setDashboardView] = useState<"primary" | "all">("primary");
  const openCloudAuthModal = useCallback((view: CloudAuthView = "signin") => {
    setCloudAuthModalView(view);
    setCloudAuthModalOpen(true);
  }, []);
  const closeCloudAuthModal = useCallback(() => {
    setCloudAuthModalOpen(false);
  }, []);
  const rememberCloudPostAuthIntent = useCallback((view: CloudAuthView) => {
    setPendingCloudPostAuthIntent(view);
    persistCloudPostAuthIntent(view);
  }, []);
  const clearPendingCloudPostAuthIntent = useCallback(() => {
    setPendingCloudPostAuthIntent(null);
    clearCloudPostAuthIntent();
  }, []);
  const handleCloudGoogleSignIn = useCallback(
    async (intent: "signin" | "signup" = "signin", payload?: CloudConsentPayload) => {
      rememberCloudPostAuthIntent(intent);
      try {
        await cloudAuth.signInGoogle(intent, payload);
      } catch (error) {
        clearPendingCloudPostAuthIntent();
        throw error;
      }
    },
    [clearPendingCloudPostAuthIntent, cloudAuth, rememberCloudPostAuthIntent]
  );
  const handleCloudSignInEmail = useCallback(
    async (email: string, password: string) => {
      rememberCloudPostAuthIntent("signin");
      try {
        await cloudAuth.signInEmail(email, password);
      } catch (error) {
        clearPendingCloudPostAuthIntent();
        throw error;
      }
    },
    [clearPendingCloudPostAuthIntent, cloudAuth, rememberCloudPostAuthIntent]
  );
  const handleCloudSignUpEmail = useCallback(
    async (email: string, password: string, payload: CloudConsentPayload) => {
      rememberCloudPostAuthIntent("signup");
      try {
        await cloudAuth.signUpEmail(email, password, payload);
      } catch (error) {
        clearPendingCloudPostAuthIntent();
        throw error;
      }
    },
    [clearPendingCloudPostAuthIntent, cloudAuth, rememberCloudPostAuthIntent]
  );

  const [isProcessing, setIsProcessing] = useState(false);
  const [isImprovingExtraction, setIsImprovingExtraction] = useState(false);
  const [uploadStage, setUploadStage] = useState<ParserStage | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);
  const [draft, setDraft] = useState<ExtractionDraft | null>(null);
  const [localBaselineDraft, setLocalBaselineDraft] = useState<ExtractionDraft | null>(null);
  const [aiCandidateDraft, setAiCandidateDraft] = useState<ExtractionDraft | null>(null);
  const [aiAttemptedForCurrentUpload, setAiAttemptedForCurrentUpload] = useState(false);
  const [uncertaintyAssessment, setUncertaintyAssessment] = useState<ParserUncertaintyAssessment | null>(null);
  const [pendingDiff, setPendingDiff] = useState<ExtractionDiffSummary | null>(null);
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [draftOriginalMarkerLabels, setDraftOriginalMarkerLabels] = useState<Record<string, string>>({});
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null);
  const [parserImprovementPromptState, setParserImprovementPromptState] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [parserImprovementPromptError, setParserImprovementPromptError] = useState("");
  const [isParserImprovementModalOpen, setIsParserImprovementModalOpen] = useState(false);
  const [draftAnnotations, setDraftAnnotations] = useState<ReportAnnotations>(blankAnnotations());
  const [selectedProtocolId, setSelectedProtocolId] = useState<string | null>(null);
  const [pendingTabChange, setPendingTabChange] = useState<TabKey | null>(null);

  const hadGrantedCloudAuthRef = useRef(false);
  useEffect(() => {
    const cloudAuthGranted = cloudAuth.status === "authenticated" && cloudAuth.consentStatus === "granted";
    if (cloudAuthGranted) {
      setCloudAuthModalOpen(false);
      setBackupPromptDismissed(true);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(CLOUD_BACKUP_PROMPT_DISMISSED_STORAGE_KEY, "1");
      }
      if (!hadGrantedCloudAuthRef.current && pendingCloudPostAuthIntent) {
        if (pendingCloudPostAuthIntent === "signup") {
          setShowSignupSuccessModal(true);
        } else {
          setShowSigninSuccessToast(true);
        }
        clearPendingCloudPostAuthIntent();
      }
    }
    hadGrantedCloudAuthRef.current = cloudAuthGranted;
  }, [
    clearPendingCloudPostAuthIntent,
    cloudAuth.consentStatus,
    cloudAuth.status,
    pendingCloudPostAuthIntent
  ]);

  useEffect(() => {
    if (!showSigninSuccessToast) {
      return;
    }
    const timeout = globalThis.setTimeout(() => {
      setShowSigninSuccessToast(false);
    }, 4500);
    return () => globalThis.clearTimeout(timeout);
  }, [showSigninSuccessToast]);

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

  const resetParserImprovementPrompt = () => {
    setIsParserImprovementModalOpen(false);
    setParserImprovementPromptState("idle");
    setParserImprovementPromptError("");
  };

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
    baselineReportByMarker,
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
  const draftInheritedSupplements = useMemo(
    () => getCurrentActiveSupplementStack(appData.supplementTimeline),
    [appData.supplementTimeline]
  );
  const draftInheritedSupplementsLabel = useMemo(() => {
    return tr("huidige actieve stack", "current active stack");
  }, [tr]);
  const hasDemoData = reports.some((report) => report.extraction.model === "demo-data");
  const isDemoMode = reports.length > 0 && reports.every((report) => report.extraction.model === "demo-data");
  const isDarkTheme = appData.settings.theme === "dark";
  const demoBannerClassName = isDarkTheme
    ? "rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-3 sm:p-4"
    : "rounded-2xl border border-cyan-200 bg-cyan-50 p-3 sm:p-4";
  const demoBannerTextClassName = isDarkTheme ? "flex items-start gap-2 text-sm text-cyan-100" : "flex items-start gap-2 text-sm text-cyan-900";
  const { clearDemoButtonClassName, uploadOwnPdfButtonClassName } = getDemoBannerButtonClassNames(isDarkTheme);

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
    allReports: reports,
    visibleReports,
    checkIns: appData.checkIns,
    protocols: appData.protocols,
    supplementTimeline: appData.supplementTimeline,
    analystMemory: isShareMode ? null : analystMemory,
    onAnalystMemoryUpdate: (memory) => {
      setAnalystMemory(memory);
      saveAnalystMemory(memory);
    },
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
  }, [samplingControlsEnabled, appData.settings.samplingFilter, appData.settings.compareToBaseline, updateSettings]);

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
    setAiAttemptedForCurrentUpload(false);
    setDraftAnnotations(blankAnnotations());
    setSelectedProtocolId(getMostRecentlyUpdatedProtocolId(appData.protocols));
    setLastUploadedFile(null);
    setIsImprovingExtraction(false);
    setShowComparisonModal(false);
    setPendingDiff(null);
    setAiCandidateDraft(null);
    setUncertaintyAssessment(null);
    resetParserImprovementPrompt();
    const manualDraft: ExtractionDraft = {
      sourceFileName: "Manual entry",
      testDate: new Date().toISOString().slice(0, 10),
      markers: [
        {
          id: createId(),
          marker: "",
          rawMarker: "",
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
    const enrichedManualDraft = enrichDraftForReview(manualDraft);
    setDraft(enrichedManualDraft);
    setLocalBaselineDraft(enrichedManualDraft);
    captureOriginalDraftMarkerLabels(enrichedManualDraft);
    setActiveTab("dashboard");
  };

  const loadDemoData = (profileOverride?: UserProfile) => {
    if (isShareMode) {
      return;
    }
    const selectedProfile = profileOverride ?? appData.settings.userProfile;
    const demo = getDemoSnapshot(selectedProfile);
    const demoMarkers = new Set(demo.reports.flatMap((report) => report.markers.map((marker) => marker.canonicalMarker)));
    const primaryMarkersSelection = demo.primaryMarkersSelection.filter((marker) => demoMarkers.has(marker));
    setAppData((prev) => ({
      ...prev,
      reports: demo.reports,
      interventions: [...prev.interventions.filter((protocol) => !protocol.id.startsWith("demo-protocol-")), ...demo.protocols],
      protocols: [...prev.protocols.filter((protocol) => !protocol.id.startsWith("demo-protocol-")), ...demo.protocols],
      supplementTimeline: [
        ...prev.supplementTimeline.filter((period) => !period.id.startsWith("demo-supp-")),
        ...demo.supplementTimeline
      ],
      wellbeingEntries: [
        ...prev.wellbeingEntries.filter((checkIn) => !checkIn.id.startsWith("demo-checkin-")),
        ...demo.checkIns
      ].sort((a, b) => a.date.localeCompare(b.date)),
      checkIns: [
        ...prev.checkIns.filter((checkIn) => !checkIn.id.startsWith("demo-checkin-")),
        ...demo.checkIns
      ].sort((a, b) => a.date.localeCompare(b.date)),
      settings: {
        ...prev.settings,
        userProfile: selectedProfile,
        primaryMarkersSelection: primaryMarkersSelection.length > 0 ? primaryMarkersSelection : demo.primaryMarkersSelection
      }
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
      interventions: prev.interventions.filter((protocol) => !protocol.id.startsWith("demo-protocol-")),
      protocols: prev.protocols.filter((protocol) => !protocol.id.startsWith("demo-protocol-")),
      supplementTimeline: prev.supplementTimeline.filter((period) => !period.id.startsWith("demo-supp-")),
      wellbeingEntries: prev.wellbeingEntries.filter((checkIn) => !checkIn.id.startsWith("demo-checkin-")),
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
  const hasAnyReportData = reports.length > 0;
  const handleSignupSuccessPrimaryAction = () => {
    setShowSignupSuccessModal(false);
    if (hasAnyReportData) {
      setActiveTab("dashboard");
      scrollPageToTop();
      return;
    }
    startSecondUpload();
  };
  const handleSignupSuccessSecondaryAction = () => {
    setShowSignupSuccessModal(false);
    setActiveTab("dashboard");
    scrollPageToTop();
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

  const hasParserAiAttempt = (candidate: ExtractionDraft | null): boolean => {
    if (!candidate) {
      return false;
    }
    const debug = candidate.extraction.debug;
    const attemptedModes = Array.isArray(debug?.aiAttemptedModes) && debug.aiAttemptedModes.length > 0;
    const inputTokens = Number(debug?.aiInputTokens ?? 0);
    const outputTokens = Number(debug?.aiOutputTokens ?? 0);
    const tokenUsage =
      (Number.isFinite(inputTokens) && inputTokens > 0) || (Number.isFinite(outputTokens) && outputTokens > 0);
    return Boolean(candidate.extraction.aiUsed) || attemptedModes || tokenUsage;
  };

  const enrichDraftForReview = (input: ExtractionDraft): ExtractionDraft => ({
    ...input,
    markers: enrichMarkersForReview(input.markers)
  });

  const hasParserAiAlreadyRunForCurrentUpload =
    aiAttemptedForCurrentUpload || hasParserAiAttempt(draft) || hasParserAiAttempt(aiCandidateDraft);

  const uploadSummaryNeedsReview =
    uploadSummary?.kind === "upload" && draft
      ? shouldPresentUploadAsNeedsReview({
          draft,
          assessment: uncertaintyAssessment
        })
      : false;

  const getExtractionRouteSummary = (
    candidate: ExtractionDraft
  ): { label: string } => {
    const route: ExtractionRoute =
      candidate.extraction.debug?.extractionRoute ??
      (candidate.extraction.aiUsed ? "gemini-with-text" : candidate.extraction.debug?.ocrUsed ? "local-ocr" : "local-text");
    if (route === "local-text") {
      return { label: tr("Alleen tekstlaag", "Text layer only") };
    }
    if (route === "local-ocr") {
      return { label: tr("OCR fallback", "OCR fallback") };
    }
    if (route === "local-text-ocr-merged") {
      return { label: tr("Tekst + OCR (samengevoegd)", "Text + OCR (merged)") };
    }
    if (route === "gemini-with-text") {
      return { label: tr("Tekst + AI", "Text + AI") };
    }
    if (route === "gemini-with-ocr") {
      return { label: tr("OCR + AI", "OCR + AI") };
    }
    if (route === "gemini-vision-only") {
      return { label: tr("AI PDF-rescue", "AI PDF rescue") };
    }
    return { label: tr("Geen parserdata", "No parser data") };
  };

  const getLocalOnlyParserConsent = (): AIConsentDecision => ({
    action: "parser_rescue",
    scope: "once",
    allowExternalAi: false,
    parserRescueEnabled: false,
    includeSymptoms: false,
    includeNotes: false,
    allowPdfAttachment: false
  });

  const getRememberedParserRescueConsent = (): AIConsentDecision =>
    buildRememberedParserRescueConsent(appData.settings.parserRescueAllowPdfAttachment);

  const requestParserRescueConsent = async (forcePrompt: boolean): Promise<AIConsentDecision | null> => {
    if (!forcePrompt) {
      if (appData.settings.parserRescueConsentState === "allowed") {
        return getRememberedParserRescueConsent();
      }
      if (appData.settings.parserRescueConsentState === "denied") {
        return null;
      }
    }

    const decision = await requestAiConsent("parser_rescue");
    if (!decision || !decision.allowExternalAi || !decision.parserRescueEnabled) {
      updateSettings({
        parserRescueConsentState: "denied",
        parserRescueAllowPdfAttachment: false
      });
      return null;
    }

    if (decision.scope === "always") {
      updateSettings({
        parserRescueConsentState: "allowed",
        parserRescueAllowPdfAttachment: decision.allowPdfAttachment
      });
    } else if (forcePrompt && appData.settings.parserRescueConsentState === "denied") {
      updateSettings({ parserRescueConsentState: "unset" });
    }

    return decision;
  };

  const runAutomaticParserRescue = async (
    file: File,
    localDraft: ExtractionDraft,
    consent: AIConsentDecision
  ): Promise<{ finalDraft: ExtractionDraft; aiApplied: boolean; aiAttempted: boolean }> => {
    const { extractLabData } = await ensurePdfParsingModule();
    const improved = await extractLabData(file, {
      costMode: "balanced",
      aiAutoImproveEnabled: true,
      forceAi: true,
      preferAiResultWhenForced: true,
      externalAiAllowed: true,
      aiConsent: consent,
      parserDebugMode: "text_ocr_ai",
      markerAliasOverrides: appData.markerAliasOverrides,
      onStageChange: setUploadStage
    });

    const improvedDraft = enrichDraftForReview(improved);
    const autoApplyDecision = shouldAutoApplyAiRescueResult(localDraft, improvedDraft);

    return {
      finalDraft: autoApplyDecision.shouldApplyAi ? improvedDraft : localDraft,
      aiApplied: autoApplyDecision.shouldApplyAi,
      aiAttempted: hasParserAiAttempt(improvedDraft)
    };
  };

  const handleUpload = async (file: File) => {
    setIsProcessing(true);
    setUploadStage("reading_text_layer");
    setUploadError("");
    setUploadNotice("");
    setUploadSummary(null);
    setAiAttemptedForCurrentUpload(false);
    setIsImprovingExtraction(false);
    setLocalBaselineDraft(null);
    setUncertaintyAssessment(null);
    resetParserImprovementPrompt();
    setShowComparisonModal(false);
    setPendingDiff(null);
    setAiCandidateDraft(null);

    try {
      const { extractLabData, assessParserUncertainty } = await ensurePdfParsingModule();
      const localParserMode = showAdvancedParserActions
        ? appData.settings.parserDebugMode === "text_ocr_ai"
          ? "text_ocr"
          : appData.settings.parserDebugMode
        : "text_ocr";

      const extracted = await extractLabData(file, {
        costMode: appData.settings.aiCostMode,
        aiAutoImproveEnabled: false,
        externalAiAllowed: false,
        aiConsent: getLocalOnlyParserConsent(),
        parserDebugMode: localParserMode,
        markerAliasOverrides: appData.markerAliasOverrides,
        onStageChange: setUploadStage
      });

      const localDraft = enrichDraftForReview(extracted);
      const localAssessment = assessParserUncertainty(localDraft);
      const severeLocalExtraction = isSevereParserExtraction(localAssessment);

      const finalDraft = localDraft;
      const finalAssessment = localAssessment;
      const autoNotice = severeLocalExtraction
        ? tr(
            "Extractiekwaliteit is laag. Je kunt optioneel AI-rescue proberen; dat kan verbeteren, maar is niet gegarandeerd.",
            "Extraction quality is low. You can optionally try AI rescue; it may improve results, but this is not guaranteed."
          )
        : "";

      const warningCount = countWarnings(finalDraft);
      const routeSummary = getExtractionRouteSummary(finalDraft);

      setDraft(finalDraft);
      setLocalBaselineDraft(finalDraft);
      setAiCandidateDraft(null);
      setPendingDiff(null);
      setShowComparisonModal(false);
      setUncertaintyAssessment(finalAssessment);
      captureOriginalDraftMarkerLabels(finalDraft);
      setLastUploadedFile(file);
      setDraftAnnotations(blankAnnotations());
      setSelectedProtocolId(getMostRecentlyUpdatedProtocolId(appData.protocols));
      setActiveTab("dashboard");
      scrollPageToTop();
      setUploadSummary({
        kind: "upload",
        fileName: finalDraft.sourceFileName,
        markerCount: finalDraft.markers.length,
        warnings: warningCount,
        routeLabel: routeSummary.label
      });

      if (autoNotice) {
        setUploadNotice(autoNotice);
      }
    } catch (error) {
      setUploadError(mapErrorToMessage(error, "pdf"));
      setUploadStage("failed");
    } finally {
      setIsProcessing(false);
      setUploadStage(null);
    }
  };
  const enableAiRescueFromReview = async () => {
    if (!lastUploadedFile) {
      setUploadError(tr("Upload dit PDF-bestand opnieuw om AI-rescue uit te voeren.", "Re-upload this PDF to run AI rescue."));
      return;
    }
    const baselineDraft = localBaselineDraft ?? draft;
    if (!baselineDraft) {
      setUploadError(
        tr(
          "Er is geen lokaal basisresultaat beschikbaar voor AI-rescue.",
          "No local baseline result is available for AI rescue."
        )
      );
      return;
    }

    const consent = await requestParserRescueConsent(appData.settings.parserRescueConsentState === "denied");
    if (!consent) {
      setUploadNotice(
        tr(
          "AI-rescue blijft uitgeschakeld. Je kunt doorgaan met lokale extractie.",
          "AI rescue remains disabled. You can continue with local extraction."
        )
      );
      return;
    }

    const baselineRouteSummary = getExtractionRouteSummary(baselineDraft);
    const baselineMarkerCount = baselineDraft.markers.length;

    setIsImprovingExtraction(true);
    setUploadStage("running_ai_text");
    setUploadError("");
    setUploadNotice("");
    setUploadSummary(null);

    try {
      const { assessParserUncertainty } = await ensurePdfParsingModule();
      const rescueResult = await runAutomaticParserRescue(lastUploadedFile, baselineDraft, consent);
      const nextDraft = rescueResult.finalDraft;
      const warningCount = countWarnings(nextDraft);
      const routeSummary = getExtractionRouteSummary(nextDraft);
      if (rescueResult.aiAttempted) {
        setAiAttemptedForCurrentUpload(true);
      }

      setDraft(nextDraft);
      setLocalBaselineDraft(nextDraft);
      setUncertaintyAssessment(assessParserUncertainty(nextDraft));
      captureOriginalDraftMarkerLabels(nextDraft);
      setUploadSummary({
        kind: "ai_rescue",
        fileName: nextDraft.sourceFileName,
        baselineMarkerCount,
        baselineRouteLabel: baselineRouteSummary.label,
        finalMarkerCount: nextDraft.markers.length,
        finalRouteLabel: routeSummary.label,
        warnings: warningCount,
        aiApplied: rescueResult.aiApplied
      });

      setUploadNotice(
        rescueResult.aiApplied
          ? tr(
              "AI-rescue uitgevoerd en automatisch toegepast omdat de kwaliteit beter was.",
              "AI rescue ran and was auto-applied because quality improved."
            )
          : tr("AI-rescue uitgevoerd, lokaal resultaat behouden.", "AI rescue ran; local result was kept.")
      );
    } catch (error) {
      setUploadError(mapErrorToMessage(error, "pdf"));
      setUploadStage("failed");
    } finally {
      setIsImprovingExtraction(false);
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
    const consent = await requestParserRescueConsent(true);
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
        parserDebugMode: "text_ocr_ai",
        markerAliasOverrides: appData.markerAliasOverrides,
        onStageChange: setUploadStage
      });
      const improvedDraft = enrichDraftForReview(improved);
      if (hasParserAiAttempt(improvedDraft)) {
        setAiAttemptedForCurrentUpload(true);
      }
      const diff = buildExtractionDiffSummary(baselineDraft, improvedDraft);
      setAiCandidateDraft(improvedDraft);
      resetParserImprovementPrompt();
      setPendingDiff(diff);
      setShowComparisonModal(true);
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
    resetParserImprovementPrompt();
    captureOriginalDraftMarkerLabels(aiCandidateDraft);
    const routeSummary = getExtractionRouteSummary(aiCandidateDraft);
    setUploadSummary({
      kind: "upload",
      fileName: aiCandidateDraft.sourceFileName,
      markerCount: aiCandidateDraft.markers.length,
      warnings: warningCount,
      routeLabel: routeSummary.label
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
    setAiAttemptedForCurrentUpload(false);
    setIsImprovingExtraction(false);
    setLocalBaselineDraft(null);
    setUncertaintyAssessment(null);
    resetParserImprovementPrompt();
    setShowComparisonModal(false);
    setPendingDiff(null);
    setAiCandidateDraft(null);

    try {
      const { extractLabData, assessParserUncertainty } = await ensurePdfParsingModule();
      const extracted = await extractLabData(lastUploadedFile, {
        costMode: appData.settings.aiCostMode,
        aiAutoImproveEnabled: false,
        externalAiAllowed: false,
        aiConsent: getLocalOnlyParserConsent(),
        parserDebugMode: "text_ocr",
        markerAliasOverrides: appData.markerAliasOverrides,
        onStageChange: setUploadStage
      });
      const enrichedDraft = enrichDraftForReview(extracted);
      const warningCount = countWarnings(enrichedDraft);
      const assessment = assessParserUncertainty(enrichedDraft);

      setDraft(enrichedDraft);
      setLocalBaselineDraft(enrichedDraft);
      setAiCandidateDraft(null);
      setPendingDiff(null);
      setShowComparisonModal(false);
      setUncertaintyAssessment(assessment);
      resetParserImprovementPrompt();
      captureOriginalDraftMarkerLabels(enrichedDraft);
      setDraftAnnotations(blankAnnotations());
      setSelectedProtocolId(getMostRecentlyUpdatedProtocolId(appData.protocols));
      setActiveTab("dashboard");
      scrollPageToTop();
      const routeSummary = getExtractionRouteSummary(enrichedDraft);
      setUploadSummary({
        kind: "upload",
        fileName: enrichedDraft.sourceFileName,
        markerCount: enrichedDraft.markers.length,
        warnings: warningCount,
        routeLabel: routeSummary.label
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
        const { _confidence, _matchResult, category, ...persistable } = marker as MarkerValue & {
          _confidence?: unknown;
          _matchResult?: unknown;
          category?: unknown;
        };
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
          ...persistable,
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

    const resolvedDraftAnnotations = withResolvedInterventionAnnotations(
      {
        ...normalizedDraftAnnotations,
        interventionId: selectedProtocolId,
        protocolId: selectedProtocolId
      },
      selectedProtocolId,
      draft.testDate,
      appData.protocols
    );

    const report: LabReport = {
      id: createId(),
      sourceFileName: draft.sourceFileName,
      testDate: draft.testDate,
      createdAt: new Date().toISOString(),
      markers: sanitizedMarkers,
      annotations: resolvedDraftAnnotations,
      extraction: draft.extraction
    };
    const incomingCanonicalMarkers = Array.from(new Set(report.markers.map((marker) => marker.canonicalMarker)));
    const suggestions = detectMarkerMergeSuggestions(incomingCanonicalMarkers, allMarkers);

    const isFirstReport = reports.length === 0 && !appData.settings.onboardingCompleted;

    addReport(report);
    upsertMarkerAliasOverrides(learnedAliasOverrides);
    appendMarkerSuggestions(suggestions);

    if (isFirstReport) {
      setOnboardingReport(report);
      setShowOnboardingWizard(true);
    }

    setUploadSummary(null);
    setDraft(null);
    setLocalBaselineDraft(null);
    setAiCandidateDraft(null);
    setAiAttemptedForCurrentUpload(false);
    setPendingDiff(null);
    setShowComparisonModal(false);
    setUncertaintyAssessment(null);
    resetParserImprovementPrompt();
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

  const chartPointsForMarker = useCallback(
    (markerName: string): MarkerSeriesPoint[] =>
      buildMarkerSeries(visibleReports, markerName, appData.settings.unitSystem, appData.protocols, appData.supplementTimeline),
    [visibleReports, appData.settings.unitSystem, appData.protocols, appData.supplementTimeline]
  );

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
    const baselineReport = baselineReportByMarker.get(marker);
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
    [expandedMarker, chartPointsForMarker]
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
  const isOnboardingLocked = !isShareMode && !hasReports;
  const latestReportDate = useMemo(() => {
    if (reports.length === 0) {
      return null;
    }
    return [...reports]
      .sort((left, right) => right.testDate.localeCompare(left.testDate) || right.createdAt.localeCompare(left.createdAt))[0]
      ?.testDate ?? null;
  }, [reports]);
  const activeProtocolId = useMemo(() => getMostRecentlyUpdatedProtocolId(appData.protocols), [appData.protocols]);
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
    const annotationLabel = (latestReport.annotations.interventionLabel ?? latestReport.annotations.protocol ?? "").trim();
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
    if (isImprovingExtraction) {
      if (!uploadStage || uploadStage === "reading_text_layer" || uploadStage === "running_ocr") {
        return tr("AI-rescue voorbereiden (lokale checks/OCR)...", "Preparing AI rescue (local checks/OCR)...");
      }
      if (uploadStage === "running_ai_text") {
        return tr("Geanonimiseerde tekst naar AI sturen...", "Sending redacted text to AI...");
      }
      if (uploadStage === "running_ai_pdf_rescue") {
        return tr("PDF naar AI sturen voor parser-rescue...", "Sending PDF to AI for parser rescue...");
      }
      if (uploadStage === "done") {
        return tr("AI-rescue afgerond.", "AI rescue completed.");
      }
      return tr("AI-rescue mislukt.", "AI rescue failed.");
    }

    if (!uploadStage) {
      return tr("PDF wordt verwerkt...", "Processing PDF...");
    }
    if (uploadStage === "reading_text_layer") {
      return tr("Tekstlaag lokaal lezen (nog geen externe AI)...", "Reading text layer locally (no external AI yet)...");
    }
    if (uploadStage === "running_ocr") {
      return tr(
        "Lokale OCR uitvoeren op scans (kan tot ongeveer 2 minuten duren, nog geen externe AI)...",
        "Running local OCR on scanned pages (can take up to about 2 minutes, no external AI yet)..."
      );
    }
    if (uploadStage === "running_ai_text") {
      return tr("Geanonimiseerde tekst naar AI sturen...", "Sending redacted text to AI...");
    }
    if (uploadStage === "running_ai_pdf_rescue") {
      return tr("PDF naar AI sturen voor parser-rescue...", "Sending PDF to AI for parser rescue...");
    }
    if (uploadStage === "done") {
      return tr("Extractie afgerond.", "Extraction completed.");
    }
    return tr("Extractie mislukt.", "Extraction failed.");
  }, [uploadStage, isImprovingExtraction, tr]);
  const processingTitle = isImprovingExtraction
    ? tr("AI-rescue wordt uitgevoerd", "AI rescue is running")
    : tr("Je PDF wordt verwerkt", "Your PDF is being processed");
  const processingHint = isImprovingExtraction
    ? tr(
        "AI-rescue is actief. We doen eerst lokale voorbereiding en sturen daarna - met je toestemming - het originele PDF-bestand naar AI voor een volledige rescue-pass.",
        "AI rescue is active. We first do local preparation and then - with your consent - send the original PDF to AI for a full rescue pass."
      )
    : tr(
        "Markerwaarden, eenheden en referentiebereiken worden lokaal uitgelezen (zonder externe AI). Bij lage kwaliteit kun je daarna optioneel AI-rescue starten (na toestemming).",
        "Markers, units, and reference ranges are extracted locally (without external AI). If quality is low, you can then optionally start AI rescue (after consent)."
      );

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

  const activeTabTitle = getPersonaTabLabel(
    appData.settings.userProfile,
    activeTab,
    appData.settings.language,
    getTabLabel(activeTab, appData.settings.language)
  );
  const activeTabSubtitle = (() => {
    if (isShareMode) {
      return activeTab === "dashboard"
        ? tr("Gedeelde read-only snapshot van tijdlijntrends en markercontext.", "Shared read-only snapshot of timeline trends and marker context.")
        : null;
    }
    if (activeTab === "dashboard") return hasReports ? tr("Je gezondheidsmarkers in één oogopslag.", "Your health markers at a glance.") : null;
    if (activeTab === "reports") return tr("Alle geüploade labresultaten in één overzicht.", "All uploaded lab reports in one overview.");
    if (activeTab === "alerts") return tr("Trends en drempelwaarschuwingen voor je markers.", "Trend and threshold alerts for your markers.");
    if (activeTab === "protocol") {
      const protocolProfile = appData.settings.userProfile === "trt" || appData.settings.userProfile === "enhanced";
      return protocolProfile
        ? tr("Je testosteronprotocolen in detail.", "Your TRT protocols in detail.")
        : appData.settings.userProfile === "health"
          ? tr("Je interventies in detail.", "Your interventions in detail.")
          : tr("Je stacks in detail.", "Your stacks in detail.");
    }
    if (activeTab === "supplements") return tr("Bijhoud supplementen naast je labresultaten.", "Track your supplements alongside lab results.");
    if (activeTab === "protocolImpact") {
      if (appData.settings.userProfile === "health") {
        return tr("Interventiewijzigingen afgezet tegen je gemeten markers.", "Measured impact of intervention changes on your markers.");
      }
      if (appData.settings.userProfile === "biohacker") {
        return tr("Stack-wijzigingen afgezet tegen je gemeten markers.", "Measured impact of stack changes on your markers.");
      }
      return tr("Protocolwijzigingen afgezet tegen je gemeten markers.", "Measured impact of protocol changes on your markers.");
    }
    if (activeTab === "doseResponse") return tr("Simuleer hoe dosisaanpassingen je waarden beïnvloeden.", "Model how dose changes may affect your levels.");
    if (activeTab === "checkIns") return tr("Volg hoe je je voelt naast je labwaarden.", "Track how you feel alongside your lab results.");
    if (activeTab === "analysis") return tr("AI-inzichten gebaseerd op je labdata.", "AI-powered insights from your lab data.");
    return null;
  })();
  const isReviewMode = Boolean(draft && !isShareMode);
  const shellActiveTabTitle = isReviewMode
    ? tr("Controleer geëxtraheerde data", "Review extracted data")
    : activeTabTitle;
  const shellActiveTabSubtitle = isReviewMode
    ? null
    : activeTabSubtitle;
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
  const profileTabs = TAB_ITEMS.filter((tab) => isTabVisibleForProfile(appData.settings.userProfile, tab.key as TabKey));
  const visibleTabs = isShareMode ? TAB_ITEMS.filter((tab) => tab.key === "dashboard") : profileTabs;
  const visibleTabKeys = useMemo(() => new Set(visibleTabs.map((tab) => tab.key as TabKey)), [visibleTabs]);
  const requestTabChange = (nextTab: TabKey) => {
    if (nextTab === activeTab) {
      return;
    }
    if (!visibleTabKeys.has(nextTab)) {
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

  useEffect(() => {
    if (!isOnboardingLocked) {
      return;
    }
    if (activeTab === "dashboard") {
      return;
    }
    setActiveTab("dashboard");
  }, [isOnboardingLocked, activeTab]);

  useEffect(() => {
    if (visibleTabKeys.has(activeTab)) {
      return;
    }
    setActiveTab("dashboard");
  }, [activeTab, visibleTabKeys]);

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
    setAiAttemptedForCurrentUpload(false);
    setPendingDiff(null);
    setShowComparisonModal(false);
    setUncertaintyAssessment(null);
    resetParserImprovementPrompt();
    setDraftOriginalMarkerLabels({});
    setLastUploadedFile(null);
    setDraftAnnotations(blankAnnotations());
    setSelectedProtocolId(null);
    setUploadError("");
    if (nextTab !== "reports") {
      setFocusedReportId(null);
    }
    setActiveTab(nextTab);
  };

  const parserImprovementAssessment = useMemo(() => {
    if (!draft) {
      return null;
    }
    return uncertaintyAssessment ?? buildFallbackParserAssessment(draft);
  }, [draft, uncertaintyAssessment]);

  const handleParserImprovementSubmit = async (values: ParserImprovementFormValues) => {
    if (!draft || !parserImprovementAssessment || !lastUploadedFile) {
      setParserImprovementPromptState("error");
      setParserImprovementPromptError(
        tr(
          "Upload dit PDF-bestand opnieuw als je het voor parserverbetering wilt versturen.",
          "Re-upload this PDF if you want to send it for parser improvement."
        )
      );
      return;
    }

    setParserImprovementPromptState("submitting");
    setParserImprovementPromptError("");

    try {
      await submitParserImprovementSample({
        file: lastUploadedFile,
        draft,
        assessment: parserImprovementAssessment,
        values
      });
      setParserImprovementPromptState("success");
      setIsParserImprovementModalOpen(false);
    } catch (error) {
      const message =
        error instanceof ParserImprovementSubmissionError
          ? error.message
          : tr(
              "Het versturen van dit PDF-bestand is mislukt. Probeer het later opnieuw.",
              "Sending this PDF failed. Please try again later."
            );
      setParserImprovementPromptState("error");
      setParserImprovementPromptError(message);
    }
  };

  const shouldShowLowQualityReviewBanner = Boolean(
    draft && uncertaintyAssessment && shouldOfferParserImprovementSubmission(uncertaintyAssessment)
  );
  const parserImprovementCanSubmit = Boolean(draft && lastUploadedFile);

  const openParserImprovementModal = (options?: { closeUploadSummary?: boolean }) => {
    if (!parserImprovementCanSubmit || parserImprovementPromptState === "success") {
      return;
    }
    if (options?.closeUploadSummary) {
      setUploadSummary(null);
    }
    if (parserImprovementPromptState === "error") {
      setParserImprovementPromptState("idle");
      setParserImprovementPromptError("");
    }
    setIsParserImprovementModalOpen(true);
  };

  const closeParserImprovementModal = () => {
    if (parserImprovementPromptState === "submitting") {
      return;
    }
    if (parserImprovementPromptState === "error") {
      setParserImprovementPromptState("idle");
      setParserImprovementPromptError("");
    }
    setIsParserImprovementModalOpen(false);
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
  const showBackupPrompt =
    !isShareMode &&
    activeTab === "dashboard" &&
    reports.length > 0 &&
    cloudAuth.status !== "authenticated" &&
    !backupPromptDismissed;
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
          activeTabTitle: shellActiveTabTitle,
          activeTabSubtitle: shellActiveTabSubtitle,
          isReviewMode,
          isOnboardingLocked,
          visibleTabKeys,
          isMobileMenuOpen,
          quickUploadDisabled,
          language: appData.settings.language,
          theme: appData.settings.theme,
          userProfile: appData.settings.userProfile,
          isShareMode,
          isNl,
          sharedSnapshotGeneratedAt: sharedSnapshot?.generatedAt ?? null,
          hasReports,
          latestReportDate,
          markersTrackedCount: allMarkers.length,
          stabilityScore: trtStability.score,
          activeProtocolCompound,
          outOfRangeCount,
          reportsCount: reports.length,
          appMode,
          syncStatus: appMode === "cloud" ? cloudSync.syncStatus : "idle",
          cloudConfigured: cloudAuth.configured,
          cloudAuthStatus: cloudAuth.status,
          cloudUserEmail: cloudAuth.session?.user.email ?? null
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
          onStartManualEntry: startManualEntry,
          onOpenCloudAuth: openCloudAuthModal
        }}
        tr={tr}
      >
        <AnimatePresence mode="wait">
            {isReviewMode ? (
              <Suspense fallback={tabLoadFallback}>
                <div>
                  {parserImprovementPromptState === "success" ? (
                    <div className="mb-3 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                        <div>
                          <p className="font-medium">{tr("PDF verstuurd voor parserverbetering", "PDF sent for parser improvement")}</p>
                          <p className="mt-0.5 text-emerald-100/90">
                            {tr(
                              "Bedankt. Je kunt dit rapport nu gewoon blijven controleren en opslaan.",
                              "Thanks. You can keep reviewing and saving this report as usual."
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {draft && parserImprovementAssessment ? (
                    <ParserImprovementSubmissionCard
                      open={isParserImprovementModalOpen}
                      language={appData.settings.language}
                      draft={draft}
                      assessment={parserImprovementAssessment}
                      status={parserImprovementPromptState}
                      errorMessage={parserImprovementPromptError}
                      onSubmit={handleParserImprovementSubmit}
                      onClose={closeParserImprovementModal}
                    />
                  ) : null}
                  <ExtractionReviewTable
                    key="draft"
                    draft={draft!}
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
                    showLowQualityReviewBanner={shouldShowLowQualityReviewBanner}
                    onOpenParserImprovement={
                      parserImprovementCanSubmit && parserImprovementPromptState !== "success"
                        ? () => openParserImprovementModal()
                        : undefined
                    }
                    parserImprovementSubmitted={parserImprovementPromptState === "success"}
                    onImproveWithAi={
                      showAdvancedParserActions && lastUploadedFile && !hasParserAiAlreadyRunForCurrentUpload
                        ? improveDraftWithAi
                        : undefined
                    }
                    onEnableAiRescue={
                      lastUploadedFile &&
                      !hasParserAiAlreadyRunForCurrentUpload &&
                      Boolean(uncertaintyAssessment && isSevereParserExtraction(uncertaintyAssessment))
                        ? enableAiRescueFromReview
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
                      setAiAttemptedForCurrentUpload(false);
                      setPendingDiff(null);
                      setShowComparisonModal(false);
                      setUncertaintyAssessment(null);
                      resetParserImprovementPrompt();
                      setDraftOriginalMarkerLabels({});
                      setLastUploadedFile(null);
                      setSelectedProtocolId(null);
                      setIsImprovingExtraction(false);
                    }}
                  />
                </div>
              </Suspense>
            ) : null}
        </AnimatePresence>

        {!isReviewMode ? (
          <>
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
                              {tr("Demodata wissen", "Clear demo data")}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </motion.section>
                ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {showBackupPrompt ? (
                <motion.section
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="rounded-xl border border-cyan-500/35 bg-cyan-500/10 p-3 text-sm text-cyan-100"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <p>
                      {tr("Je resultaten staan lokaal opgeslagen. Wil je een back-up?", "Your results are saved locally. Want to back them up?")}{" "}
                      <button
                        type="button"
                        onClick={() => openCloudAuthModal("signup")}
                        className="text-cyan-100 underline decoration-cyan-300/70 underline-offset-2 transition hover:text-cyan-50"
                      >
                        {tr("Maak gratis een account ->", "Create a free account ->")}
                      </button>
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setBackupPromptDismissed(true);
                        if (typeof window !== "undefined") {
                          window.localStorage.setItem(CLOUD_BACKUP_PROMPT_DISMISSED_STORAGE_KEY, "1");
                        }
                      }}
                      className="self-start rounded-md border border-slate-600 px-2.5 py-1 text-xs text-slate-200 hover:border-slate-500 md:self-auto"
                    >
                      {tr("Sluiten", "Dismiss")}
                    </button>
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
                personalInfo={appData.personalInfo}
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
                cloudConfigured={cloudAuth.configured}
                onLoadDemo={loadDemoData}
                onUploadClick={startSecondUpload}
                onOpenCloudAuth={openCloudAuthModal}
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
                    userProfile={appData.settings.userProfile}
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
                    userProfile={appData.settings.userProfile}
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
                    reportsInScope={reports.length}
                    markersTracked={allMarkers.length}
                    analysisMarkerNames={analysisMarkerNames}
                    activeProtocolLabel={activeAnalysisProtocolLabel}
                    memory={isShareMode ? null : analystMemory}
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
                    personalInfo={appData.personalInfo}
                    onUpdatePersonalInfo={updatePersonalInfo}
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
                    onClearAllData={() => {
                      clearAllData();
                      setAnalystMemory(null);
                    }}
                    onResetOnboarding={() => {
                      updateSettings({ onboardingCompleted: false });
                      setOnboardingReport(reports[0] ?? null);
                      setShowOnboardingWizard(true);
                    }}
                    onAddMarkerSuggestions={appendMarkerSuggestions}
                    onShareOptionsChange={setShareOptions}
                    onGenerateShareLink={generateShareLink}
                    onReportIssue={() => {
                      if (parserImprovementCanSubmit && parserImprovementPromptState !== "success") {
                        openParserImprovementModal();
                        return;
                      }
                      startSecondUpload();
                    }}
                    cloudUserEmail={cloudAuth.session?.user.email ?? null}
                    onSignOut={cloudAuth.signOut}
                  />
                ) : null}
              </Suspense>
            ) : null}
          </>
        ) : null}
      </AppShell>

      <Suspense fallback={null}>
        <ExtractionComparisonModal
          open={showComparisonModal}
          language={appData.settings.language}
          summary={pendingDiff}
          onKeepLocal={keepLocalDraftVersion}
          onApplyAi={applyAiCandidateDraft}
        />
      </Suspense>

      <Suspense fallback={null}>
        <AIConsentModal
          open={consentAction !== null}
          action={consentAction ?? "analysis"}
          language={appData.settings.language}
          onClose={() => resolveConsentRequest(null)}
          onDecide={(decision) => resolveConsentRequest(decision)}
        />
      </Suspense>

      <CloudAuthModal
        open={cloudAuthModalOpen}
        language={appData.settings.language}
        theme={appData.settings.theme}
        configured={cloudAuth.configured}
        initialView={cloudAuthModalView}
        authStatus={cloudAuth.status}
        authError={cloudAuth.error}
        consentRequired={cloudAuth.status === "authenticated" && cloudAuth.consentStatus !== "granted"}
        privacyPolicyVersion={CLOUD_PRIVACY_POLICY_VERSION}
        onClose={closeCloudAuthModal}
        onSignInGoogle={handleCloudGoogleSignIn}
        onSignInEmail={handleCloudSignInEmail}
        onSignUpEmail={handleCloudSignUpEmail}
        onCompleteConsent={cloudAuth.completeConsent}
      />

      <AnimatePresence>
        {showSignupSuccessModal ? (
          <motion.div
            className="app-modal-overlay z-[88]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSignupSuccessModal(false)}
          >
            <motion.div
              className="app-modal-shell w-full max-w-lg bg-slate-900 p-5 shadow-soft"
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 6 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-xl border border-emerald-500/45 bg-emerald-500/12 p-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-100">
                    {tr("Account succesvol aangemaakt", "Account created successfully")}
                  </h3>
                  <p className="mt-1 text-sm text-slate-300">
                    {tr(
                      "Cloud sync staat nu automatisch aan. Je kunt meteen verder in LabTracker.",
                      "Cloud sync is now automatically enabled. You can continue in LabTracker right away."
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500"
                  onClick={handleSignupSuccessSecondaryAction}
                >
                  {hasAnyReportData ? tr("Sluiten", "Close") : tr("Naar dashboard", "Go to dashboard")}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-sm font-medium text-cyan-100 hover:border-cyan-300/70 hover:bg-cyan-500/20"
                  onClick={handleSignupSuccessPrimaryAction}
                >
                  {hasAnyReportData ? tr("Ga naar dashboard", "Go to dashboard") : tr("Upload je eerste PDF", "Upload your first PDF")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showSigninSuccessToast ? (
          <motion.div
            className="fixed bottom-4 right-4 z-[89] w-[min(92vw,380px)] rounded-xl border border-emerald-500/45 bg-slate-900/95 p-3 shadow-soft"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
          >
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-100">
                  {tr("Ingelogd", "Signed in")}
                </p>
                <p className="mt-0.5 text-xs text-slate-300">
                  {tr("Cloud sync is actief.", "Cloud sync is active.")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSigninSuccessToast(false)}
                className="rounded-md border border-slate-700 px-1.5 py-1 text-xs text-slate-300 hover:border-slate-500 hover:text-slate-100"
                aria-label={tr("Melding sluiten", "Dismiss notification")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isProcessing || isImprovingExtraction ? (
          <motion.div
            className="app-modal-overlay z-[70]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="app-modal-shell w-full max-w-md border-cyan-500/40 bg-slate-900/95 p-5 shadow-soft"
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
                    {processingTitle}
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    {uploadStageText}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {processingHint}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}

        <Suspense fallback={null}>
          <ParserUploadSummaryModal
            open={Boolean(uploadSummary)}
            language={appData.settings.language}
            summary={
              uploadSummary?.kind === "upload"
                ? {
                    ...uploadSummary,
                    needsReview: uploadSummaryNeedsReview,
                    canSendPdf:
                      parserImprovementCanSubmit &&
                      parserImprovementPromptState !== "success" &&
                      Boolean(lastUploadedFile)
                  }
                : uploadSummary
            }
            onContinue={() => setUploadSummary(null)}
            onOpenParserImprovement={() => openParserImprovementModal({ closeUploadSummary: true })}
          />
        </Suspense>

        {pendingTabChange ? (
          <motion.div
            className="app-modal-overlay z-[68]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={cancelPendingTabChange}
          >
            <motion.div
              className="app-modal-shell w-full max-w-md bg-slate-900 p-4 shadow-soft"
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
            className="app-modal-overlay z-50 p-3 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setExpandedMarker(null)}
          >
            <motion.div
              className="app-modal-shell max-h-[92vh] w-full max-w-6xl bg-slate-900 shadow-soft"
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
                <Suspense fallback={tabLoadFallback}>
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
                </Suspense>
              </div>
            </motion.div>
          </motion.div>
        ) : null}

        {!isShareMode && markerSuggestions.length > 0 ? (
          <motion.div
            className="app-modal-overlay z-[60] p-3 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMarkerSuggestions([])}
          >
            <motion.div
              className="app-modal-shell w-full max-w-2xl bg-slate-900 shadow-soft"
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
            className="app-modal-overlay z-[65] p-3 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setRenameDialog(null)}
          >
            <motion.div
              className="app-modal-shell w-full max-w-lg bg-slate-900 shadow-soft"
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

      {/* Onboarding wizard after first report upload */}
      <AnimatePresence>
        {showOnboardingWizard && onboardingReport ? (
          <Suspense fallback={null}>
            <OnboardingWizard
              language={appData.settings.language}
              userProfile={appData.settings.userProfile}
              theme={appData.settings.theme}
              report={onboardingReport}
              personalInfo={appData.personalInfo}
              onUpdatePersonalInfo={updatePersonalInfo}
              onAddProtocol={addProtocol}
              onAddSupplementPeriod={addSupplementPeriod}
              onAddCheckIn={addCheckIn}
              onComplete={() => {
                setShowOnboardingWizard(false);
                setOnboardingReport(null);
                updateSettings({ onboardingCompleted: true });
              }}
              onNavigate={setActiveTab}
            />
          </Suspense>
        ) : null}
      </AnimatePresence>
    </>
  );
};

export default App;
