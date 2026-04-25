import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { differenceInDays, parseISO } from "date-fns";
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
import AppShell, { AppShellHeaderStat } from "./components/AppShell";
import CloudAuthModal, { type CloudAuthView } from "./components/CloudAuthModal";
import {
  CLOUD_BACKUP_PROMPT_DISMISSED_STORAGE_KEY,
  CLOUD_LAST_AUTH_EMAIL_STORAGE_KEY,
  CLOUD_PRIVACY_POLICY_VERSION,
  getSupabaseUrl
} from "./cloud/constants";
import {
  readAccessTokenFromHash,
  readEmailFromAccessToken,
  trackVerificationEvent
} from "./cloud/authClient";
import type { CloudConsentPayload } from "./cloud/consentClient";
import { getDemoSnapshot } from "./demoData";
import { USER_PROFILES } from "./data/userProfiles";
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
  shouldPresentUploadAsNeedsReview,
  shouldOfferParserImprovementSubmission,
  shouldAutoApplyAiRescueResult
} from "./uploadFlow";
import {
  UndoPatch,
  restoreCheckInsPatch,
  restoreProtocolsPatch,
  restoreReportsPatch,
  restoreSupplementsPatch
} from "./deleteUndo";
import { normalizeMarkerLookupKey } from "./markerNormalization";
import { canMergeMarkersBySpecimen } from "./markerSpecimen";
import { mapServiceErrorToMessage } from "./lib/errorMessages";
import { mapCloudAuthErrorToMessage } from "./lib/cloudErrorMessages";
import { captureAppException, withMonitoringSpan } from "./monitoring/sentry";
import { enrichMarkersForReview } from "./utils/markerReview";
import { getDemoBannerButtonClassNames } from "./ui/demoBannerStyles";
import {
  ParserImprovementFormValues,
  ParserImprovementSubmissionError,
  submitParserImprovementSample
} from "./parserImprovementSubmission";
import DashboardView from "./views/DashboardView";
import CloudEmailConfirmView from "./views/CloudEmailConfirmView";
import CloudPasswordResetView from "./views/CloudPasswordResetView";
import CloudEmailVerifiedView from "./views/CloudEmailVerifiedView";
import {
  AIConsentDecision,
  AiAnalysisPresetKey,
  AiAnalysisScopeSnapshot,
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
  TimeRangeKey,
  ThemeMode
} from "./types";
import { createId, deriveAbnormalFlag, formatDate, sortReportsChronological } from "./utils";

const ProtocolView = lazy(() => import("./views/ProtocolView"));
const SupplementsView = lazy(() => import("./views/SupplementsView"));
const CheckInsView = lazy(() => import("./views/CheckInsView"));
const AlertsView = lazy(() => import("./views/AlertsView"));
const ProtocolImpactView = lazy(() => import("./views/ProtocolImpactView"));
const DoseResponseView = lazy(() => import("./views/DoseResponseView"));
const ReportsView = lazy(() => import("./views/ReportsView"));
const AnalysisView = lazy(() => import("./views/AnalysisView"));
const AnalysisHistoryListView = lazy(() => import("./views/AnalysisHistoryListView"));
const AnalysisHistoryDetailView = lazy(() => import("./views/AnalysisHistoryDetailView"));
const SettingsView = lazy(() => import("./views/SettingsView"));
const AdminView = lazy(() => import("./views/AdminView"));
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

type OnboardingEntryPoint = "first_report" | "replay";
type TopLevelRouteMode = "app" | "admin" | "auth_confirm" | "auth_verified" | "auth_reset";
type AnalysisRouteState =
  | { kind: "coach" }
  | { kind: "history" }
  | { kind: "history_detail"; id: string };

interface PendingUndoAction {
  id: number;
  message: string;
  patch: UndoPatch;
}

const CLOUD_POST_AUTH_INTENT_STORAGE_KEY = "labtracker-cloud-post-auth-intent-v1";
const CLOUD_POST_AUTH_INTENT_MAX_AGE_MS = 10 * 60 * 1000;
const WELLBEING_REMINDER_DISMISS_STORAGE_KEY = "labtracker-wellbeing-reminder-dismiss-v1";
const AI_HISTORY_PATH = "/ai-coach/history";

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

const loadWellbeingReminderDismissedDate = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const value = window.localStorage.getItem(WELLBEING_REMINDER_DISMISS_STORAGE_KEY);
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const resolveTopLevelRouteMode = (): TopLevelRouteMode => {
  if (typeof window === "undefined") {
    return "app";
  }
  const normalizedPathname = window.location.pathname.replace(/\/+$/, "") || "/";
  if (normalizedPathname === "/admin") {
    return "admin";
  }
  if (normalizedPathname === "/auth/confirm") {
    return "auth_confirm";
  }
  if (normalizedPathname === "/auth/verified") {
    return "auth_verified";
  }
  if (normalizedPathname === "/auth/reset") {
    return "auth_reset";
  }
  return "app";
};

const normalizePathname = (pathname: string): string => pathname.replace(/\/+$/, "") || "/";

const parseAnalysisRouteFromPathname = (pathname: string): AnalysisRouteState => {
  const normalized = normalizePathname(pathname);
  if (normalized === AI_HISTORY_PATH) {
    return { kind: "history" };
  }
  if (normalized.startsWith(`${AI_HISTORY_PATH}/`)) {
    const id = decodeURIComponent(normalized.slice(AI_HISTORY_PATH.length + 1)).trim();
    if (id.length > 0) {
      return { kind: "history_detail", id };
    }
  }
  return { kind: "coach" };
};

const readAnalysisRouteFromLocation = (): AnalysisRouteState => {
  if (typeof window === "undefined") {
    return { kind: "coach" };
  }
  return parseAnalysisRouteFromPathname(window.location.pathname);
};

const buildPathForAnalysisRoute = (route: AnalysisRouteState): string => {
  if (route.kind === "history") {
    return AI_HISTORY_PATH;
  }
  if (route.kind === "history_detail") {
    return `${AI_HISTORY_PATH}/${encodeURIComponent(route.id)}`;
  }
  return "/";
};

const isAllowedSupabaseActionUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    const isLocalHttp = parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
    if (parsed.protocol !== "https:" && !isLocalHttp) {
      return false;
    }
    const supabaseUrl = getSupabaseUrl();
    if (!supabaseUrl) {
      return true;
    }
    return parsed.origin === new URL(supabaseUrl).origin;
  } catch {
    return false;
  }
};

const readConfirmationUrlFromLocation = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("confirmation_url");
  if (!raw || !isAllowedSupabaseActionUrl(raw)) {
    return null;
  }
  return raw;
};

const readRecoveryUrlFromLocation = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("recovery_url");
  if (!raw || !isAllowedSupabaseActionUrl(raw)) {
    return null;
  }
  return raw;
};

const readRequestedCloudAuthView = (): CloudAuthView | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("cloudAuth");
  return requested === "signin" || requested === "signup" ? requested : null;
};

const normalizeCloudAuthEmail = (value: unknown): string | null => {
  const candidate = String(value ?? "").trim().toLowerCase();
  if (!candidate) {
    return null;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
};

const loadRememberedCloudAuthEmail = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  return normalizeCloudAuthEmail(window.localStorage.getItem(CLOUD_LAST_AUTH_EMAIL_STORAGE_KEY));
};

const rememberCloudAuthEmail = (email: string | null | undefined): string | null => {
  const normalized = normalizeCloudAuthEmail(email);
  if (typeof window === "undefined") {
    return normalized;
  }
  if (!normalized) {
    window.localStorage.removeItem(CLOUD_LAST_AUTH_EMAIL_STORAGE_KEY);
    return null;
  }
  window.localStorage.setItem(CLOUD_LAST_AUTH_EMAIL_STORAGE_KEY, normalized);
  return normalized;
};

const readRequestedCloudAuthEmail = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  return normalizeCloudAuthEmail(params.get("cloudEmail"));
};

const clearRequestedCloudAuthParams = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.delete("cloudAuth");
  currentUrl.searchParams.delete("cloudEmail");
  const nextPath = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
  window.history.replaceState({}, document.title, nextPath);
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

  const {
    appData,
    setAppData,
    updateSettings,
    updatePersonalInfo,
    isNl,
    samplingControlsEnabled,
    addAiAnalysis,
    deleteAiAnalysis,
    deleteReport: deleteReportFromData,
    deleteReports: deleteReportsFromData,
    updateReportAnnotations,
    updateReportMarkerUnit,
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
  const [cloudAuthModalPrefillEmail, setCloudAuthModalPrefillEmail] = useState<string | null>(() =>
    loadRememberedCloudAuthEmail()
  );
  const [pendingCloudPostAuthIntent, setPendingCloudPostAuthIntent] = useState<CloudAuthView | null>(() =>
    loadCloudPostAuthIntent()
  );
  const [showSignupSuccessModal, setShowSignupSuccessModal] = useState(false);
  const [signupVerificationEmail, setSignupVerificationEmail] = useState<string | null>(null);
  const [signupVerificationResendNotice, setSignupVerificationResendNotice] = useState<string | null>(null);
  const [signupVerificationResendBusy, setSignupVerificationResendBusy] = useState(false);
  const [verifiedSignInEmail, setVerifiedSignInEmail] = useState<string | null>(() => loadRememberedCloudAuthEmail());
  const [showSigninSuccessToast, setShowSigninSuccessToast] = useState(false);
  const [showWellbeingReminderModal, setShowWellbeingReminderModal] = useState(false);
  const [wellbeingReminderDismissedDate, setWellbeingReminderDismissedDate] = useState<string | null>(() =>
    loadWellbeingReminderDismissedDate()
  );
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
  const [topLevelRouteMode, setTopLevelRouteMode] = useState<TopLevelRouteMode>(() => resolveTopLevelRouteMode());
  const [analysisRoute, setAnalysisRoute] = useState<AnalysisRouteState>(() => readAnalysisRouteFromLocation());
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [isUploadPanelOpen, setIsUploadPanelOpen] = useState(false);
  const [recentAnalysesStatus, setRecentAnalysesStatus] = useState<"loading" | "ready" | "error">("loading");
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
  const [showFirstReportProfilePicker, setShowFirstReportProfilePicker] = useState(false);
  const [onboardingReport, setOnboardingReport] = useState<LabReport | null>(null);
  const [onboardingEntryPoint, setOnboardingEntryPoint] = useState<OnboardingEntryPoint | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [doseResponseInput, setDoseResponseInput] = useState("");
  const [dashboardView, setDashboardView] = useState<"primary" | "all">("primary");
  const startFirstReportOnboarding = useCallback((report: LabReport) => {
    setOnboardingReport(report);
    setOnboardingEntryPoint("first_report");
    setShowFirstReportProfilePicker(true);
  }, []);
  const continueFirstReportOnboarding = useCallback(
    (profile?: UserProfile) => {
      if (profile) {
        updateSettings({ userProfile: profile });
      }
      setShowFirstReportProfilePicker(false);
      setShowOnboardingWizard(true);
    },
    [updateSettings]
  );
  const openCloudAuthModal = useCallback((view: CloudAuthView = "signin", prefillEmail?: string | null) => {
    setCloudAuthModalView(view);
    setCloudAuthModalPrefillEmail(
      view === "signin"
        ? normalizeCloudAuthEmail(prefillEmail) ?? loadRememberedCloudAuthEmail()
        : normalizeCloudAuthEmail(prefillEmail)
    );
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
  const handleCloudVerificationEmailRequest = useCallback(
    async (email: string) => {
      const normalizedEmail = rememberCloudAuthEmail(email) ?? email.trim().toLowerCase();
      setCloudAuthModalPrefillEmail(normalizedEmail);
      setVerifiedSignInEmail(normalizedEmail);
      await cloudAuth.requestVerificationEmail(normalizedEmail);
    },
    [cloudAuth]
  );
  const handleCloudPasswordResetEmailRequest = useCallback(
    async (email: string) => {
      const normalizedEmail = rememberCloudAuthEmail(email) ?? email.trim().toLowerCase();
      setCloudAuthModalPrefillEmail(normalizedEmail);
      setVerifiedSignInEmail(normalizedEmail);
      await cloudAuth.requestPasswordResetEmail(normalizedEmail);
    },
    [cloudAuth]
  );
  const handleCloudSignInEmail = useCallback(
    async (email: string, password: string) => {
      const normalizedEmail = rememberCloudAuthEmail(email) ?? email.trim().toLowerCase();
      setCloudAuthModalPrefillEmail(normalizedEmail);
      setVerifiedSignInEmail(normalizedEmail);
      rememberCloudPostAuthIntent("signin");
      try {
        await cloudAuth.signInEmail(normalizedEmail, password);
      } catch (error) {
        clearPendingCloudPostAuthIntent();
        throw error;
      }
    },
    [clearPendingCloudPostAuthIntent, cloudAuth, rememberCloudPostAuthIntent]
  );
  const handleCloudSignUpEmail = useCallback(
    async (email: string, password: string, payload: CloudConsentPayload) => {
      const normalizedEmail = rememberCloudAuthEmail(email) ?? email.trim().toLowerCase();
      setCloudAuthModalPrefillEmail(normalizedEmail);
      setVerifiedSignInEmail(normalizedEmail);
      rememberCloudPostAuthIntent("signup");
      try {
        await cloudAuth.signUpEmail(normalizedEmail, password, payload);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "AUTH_EMAIL_VERIFICATION_REQUIRED"
        ) {
          setSignupVerificationEmail(normalizedEmail);
          setSignupVerificationResendNotice(null);
          clearPendingCloudPostAuthIntent();
          return;
        }
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
  const [multiDateDrafts, setMultiDateDrafts] = useState<ExtractionDraft[]>([]);
  const [multiDateAssessments, setMultiDateAssessments] = useState<ParserUncertaintyAssessment[]>([]);
  const [multiDateAnnotations, setMultiDateAnnotations] = useState<ReportAnnotations[]>([]);
  const [multiDateProtocolIds, setMultiDateProtocolIds] = useState<Array<string | null>>([]);
  const [multiDateOriginalMarkerLabels, setMultiDateOriginalMarkerLabels] = useState<Array<Record<string, string>>>([]);
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
  const [pendingUndoAction, setPendingUndoAction] = useState<PendingUndoAction | null>(null);
  const [systemTheme, setSystemTheme] = useState<Exclude<ThemeMode, "system">>("dark");

  const hadGrantedCloudAuthRef = useRef(false);
  const undoTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const syncRouteMode = () => {
      setTopLevelRouteMode(resolveTopLevelRouteMode());
      setAnalysisRoute(readAnalysisRouteFromLocation());
    };
    syncRouteMode();
    window.addEventListener("popstate", syncRouteMode);
    return () => {
      window.removeEventListener("popstate", syncRouteMode);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (topLevelRouteMode !== "auth_verified") {
      return;
    }

    const fallbackEmail = loadRememberedCloudAuthEmail();
    let nextEmail = fallbackEmail;
    const accessToken = readAccessTokenFromHash(window.location.hash);
    const tokenEmail = readEmailFromAccessToken(accessToken);
    if (tokenEmail) {
      nextEmail = rememberCloudAuthEmail(tokenEmail);
      setCloudAuthModalPrefillEmail(nextEmail);
    }
    setVerifiedSignInEmail(nextEmail);

    if (accessToken) {
      void trackVerificationEvent("verified_opened", accessToken).then((result) => {
        if (!result.email) {
          return;
        }
        const trackedEmail = rememberCloudAuthEmail(result.email);
        setCloudAuthModalPrefillEmail(trackedEmail);
        setVerifiedSignInEmail(trackedEmail);
      });
    }

    if (window.location.hash) {
      const cleanUrl = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }, [topLevelRouteMode]);

  useEffect(() => {
    if (topLevelRouteMode !== "app" || isShareMode) {
      return;
    }
    const requestedView = readRequestedCloudAuthView();
    if (!requestedView) {
      return;
    }
    const requestedEmail =
      requestedView === "signin"
        ? readRequestedCloudAuthEmail() ?? loadRememberedCloudAuthEmail()
        : readRequestedCloudAuthEmail();
    openCloudAuthModal(requestedView, requestedEmail);
    if (requestedEmail) {
      setCloudAuthModalPrefillEmail(requestedEmail);
      setVerifiedSignInEmail(requestedEmail);
      rememberCloudAuthEmail(requestedEmail);
    }
    clearRequestedCloudAuthParams();
  }, [isShareMode, openCloudAuthModal, topLevelRouteMode]);

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!wellbeingReminderDismissedDate) {
      window.localStorage.removeItem(WELLBEING_REMINDER_DISMISS_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(WELLBEING_REMINDER_DISMISS_STORAGE_KEY, wellbeingReminderDismissedDate);
  }, [wellbeingReminderDismissedDate]);

  useEffect(() => () => {
    if (undoTimeoutRef.current !== null) {
      window.clearTimeout(undoTimeoutRef.current);
    }
  }, []);

  const [dashboardMode, setDashboardMode] = useState<DashboardViewMode>("cards");
  const [leftCompareMarker, setLeftCompareMarker] = useState<string>(PRIMARY_MARKERS[0]);
  const [rightCompareMarker, setRightCompareMarker] = useState<string>(PRIMARY_MARKERS[2]);
  const [focusedAlertMarker, setFocusedAlertMarker] = useState<string | null>(null);
  const [focusedReportId, setFocusedReportId] = useState<string | null>(null);

  const [expandedMarker, setExpandedMarker] = useState<string | null>(null);
  const protocolWindowSize = 45;
  const [markerSuggestions, setMarkerSuggestions] = useState<MarkerMergeSuggestion[]>([]);
  const [renameDialog, setRenameDialog] = useState<{ sourceCanonical: string; draftName: string } | null>(null);
  const uploadPanelRef = useRef<HTMLDivElement | null>(null);
  const hiddenUploadInputRef = useRef<HTMLInputElement | null>(null);
  const parserModuleRef = useRef<Promise<typeof import("./pdfParsing")> | null>(null);
  const consentResolveRef = useRef<((decision: AIConsentDecision | null) => void) | null>(null);
  const [consentAction, setConsentAction] = useState<"analysis" | "parser_rescue" | null>(null);

  const ensurePdfParsingModule = () => {
    if (!parserModuleRef.current) {
      parserModuleRef.current = import("./pdfParsing");
    }
    return parserModuleRef.current;
  };

  const requestAiConsent = (action: "analysis" | "parser_rescue"): Promise<AIConsentDecision | null> =>
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

  const clearReviewDraftState = () => {
    setDraft(null);
    setMultiDateDrafts([]);
    setMultiDateAssessments([]);
    setMultiDateAnnotations([]);
    setMultiDateProtocolIds([]);
    setMultiDateOriginalMarkerLabels([]);
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

  const clearPendingUndoAction = useCallback(() => {
    if (undoTimeoutRef.current !== null) {
      window.clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
    setPendingUndoAction(null);
  }, []);

  const queueUndoAction = useCallback(
    (message: string, patch: UndoPatch) => {
      if (undoTimeoutRef.current !== null) {
        window.clearTimeout(undoTimeoutRef.current);
      }
      const id = Date.now();
      setPendingUndoAction({
        id,
        message,
        patch
      });
      undoTimeoutRef.current = window.setTimeout(() => {
        setPendingUndoAction((current) => (current?.id === id ? null : current));
        undoTimeoutRef.current = null;
      }, 10_000);
    },
    []
  );

  const applyUndoAction = useCallback(() => {
    if (!pendingUndoAction) {
      return;
    }
    const patch = pendingUndoAction.patch;
    clearPendingUndoAction();
    setAppData((current) => patch(current));
  }, [clearPendingUndoAction, pendingUndoAction, setAppData]);

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
  const resolvedTheme = appData.settings.theme === "system" ? systemTheme : appData.settings.theme;
  const confirmationUrl = topLevelRouteMode === "auth_confirm" ? readConfirmationUrlFromLocation() : null;
  const recoveryUrl = topLevelRouteMode === "auth_reset" ? readRecoveryUrlFromLocation() : null;
  const resolvedSettings = useMemo(
    () => ({
      ...appData.settings,
      theme: resolvedTheme
    }),
    [appData.settings, resolvedTheme]
  );
  const isDarkTheme = resolvedTheme === "dark";
  const demoBannerClassName = isDarkTheme
    ? "rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-3 sm:p-4"
    : "rounded-2xl border border-cyan-200 bg-cyan-50 p-3 sm:p-4";
  const demoBannerTextClassName = isDarkTheme ? "flex items-start gap-2 text-sm text-cyan-100" : "flex items-start gap-2 text-sm text-cyan-900";
  const { clearDemoButtonClassName, uploadOwnPdfButtonClassName } = getDemoBannerButtonClassNames(isDarkTheme);

  const {
    isAnalyzingLabs,
    analysisRequestState,
    analysisError,
    analysisResult,
    analysisGeneratedAt,
    analysisQuestion,
    analysisCopied,
    analysisModelInfo,
    analysisKind,
    analyzingKind,
    analysisScopeNotice,
    betaUsage,
    betaLimits,
    setAnalysisError,
    runAiQuestion,
    copyAnalysis
  } = useAnalysis({
    settings: resolvedSettings,
    language: appData.settings.language,
    allReports: reports,
    visibleReports,
    personalInfo: appData.personalInfo,
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
  const aiAnalyses = useMemo(
    () => [...(appData.aiAnalyses ?? [])].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [appData.aiAnalyses]
  );
  const activeAnalysisHistoryEntry = useMemo(() => {
    if (analysisRoute.kind !== "history_detail") {
      return null;
    }
    return aiAnalyses.find((entry) => entry.id === analysisRoute.id) ?? null;
  }, [aiAnalyses, analysisRoute]);
  const retryRecentAnalyses = useCallback(() => {
    setRecentAnalysesStatus("loading");
    window.setTimeout(() => setRecentAnalysesStatus("ready"), 120);
  }, []);

  useEffect(() => {
    setRecentAnalysesStatus("loading");
    const timeout = window.setTimeout(() => {
      setRecentAnalysesStatus("ready");
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [aiAnalyses.length]);

  useEffect(() => {
    if (isShareMode && activeTab !== "dashboard") {
      setActiveTab("dashboard");
    }
  }, [activeTab, isShareMode]);

  useEffect(() => {
    if ((isShareMode || topLevelRouteMode !== "app") && analysisRoute.kind !== "coach") {
      setAnalysisRoute({ kind: "coach" });
    }
  }, [analysisRoute.kind, isShareMode, topLevelRouteMode]);

  useEffect(() => {
    if (isShareMode && isUploadPanelOpen) {
      setIsUploadPanelOpen(false);
    }
  }, [isShareMode, isUploadPanelOpen]);

  useEffect(() => {
    if (topLevelRouteMode !== "app" || isShareMode) {
      return;
    }
    if (analysisRoute.kind === "coach") {
      return;
    }
    if (activeTab !== "analysis") {
      setActiveTab("analysis");
    }
  }, [activeTab, analysisRoute.kind, isShareMode, topLevelRouteMode]);

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
    if (!draft && multiDateDrafts.length === 0) {
      return;
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [draft, multiDateDrafts.length]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => {
      setSystemTheme(mediaQuery.matches ? "dark" : "light");
    };

    syncSystemTheme();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncSystemTheme);
      return () => mediaQuery.removeEventListener("change", syncSystemTheme);
    }

    mediaQuery.addListener(syncSystemTheme);
    return () => mediaQuery.removeListener(syncSystemTheme);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
    document.documentElement.setAttribute("data-theme-preference", appData.settings.theme);
    document.documentElement.setAttribute("data-interface-density", appData.settings.interfaceDensity);
    if (resolvedTheme === "dark") {
      document.documentElement.classList.add("dark");
      document.body.classList.remove("light");
    } else {
      document.documentElement.classList.remove("dark");
      document.body.classList.add("light");
    }
  }, [appData.settings.interfaceDensity, appData.settings.theme, resolvedTheme]);

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

  const remapMarkerAcrossReports = (
    sourceCanonical: string,
    targetLabel: string,
    forceSpecimenOverride = false
  ) => {
    remapMarker(sourceCanonical, targetLabel, forceSpecimenOverride);
    setMarkerSuggestions((current) =>
      current.filter(
        (item) => item.sourceCanonical !== sourceCanonical && item.targetCanonical !== sourceCanonical
      )
    );
  };

  const deleteReportWithUndo = useCallback(
    (reportId: string) => {
      if (isShareMode) {
        return;
      }
      if (!appData.reports.some((report) => report.id === reportId)) {
        return;
      }
      const reportsSnapshot = appData.reports;
      deleteReportFromData(reportId);
      queueUndoAction(tr("Rapport verwijderd.", "Report deleted."), restoreReportsPatch(reportsSnapshot));
    },
    [appData.reports, deleteReportFromData, isShareMode, queueUndoAction, tr]
  );

  const deleteReportsWithUndo = useCallback(
    (reportIds: string[]) => {
      if (isShareMode || reportIds.length === 0) {
        return;
      }
      const selected = new Set(reportIds);
      const deleteCount = appData.reports.filter((report) => selected.has(report.id)).length;
      if (deleteCount === 0) {
        return;
      }
      const reportsSnapshot = appData.reports;
      deleteReportsFromData(reportIds);
      queueUndoAction(
        tr(`${deleteCount} rapporten verwijderd.`, `${deleteCount} reports deleted.`),
        restoreReportsPatch(reportsSnapshot)
      );
    },
    [appData.reports, deleteReportsFromData, isShareMode, queueUndoAction, tr]
  );

  const deleteSupplementPeriodWithUndo = useCallback(
    (id: string) => {
      if (isShareMode) {
        return;
      }
      if (!appData.supplementTimeline.some((period) => period.id === id)) {
        return;
      }
      const timelineSnapshot = appData.supplementTimeline;
      deleteSupplementPeriod(id);
      queueUndoAction(tr("Supplement verwijderd.", "Supplement deleted."), restoreSupplementsPatch(timelineSnapshot));
    },
    [appData.supplementTimeline, deleteSupplementPeriod, isShareMode, queueUndoAction, tr]
  );

  const deleteProtocolWithUndo = useCallback(
    (id: string): boolean => {
      if (isShareMode) {
        return false;
      }
      const protocolSnapshot = appData.protocols;
      const interventionsSnapshot = appData.interventions;
      const deleted = deleteProtocol(id);
      if (deleted) {
        queueUndoAction(
          tr("Protocol verwijderd.", "Protocol deleted."),
          restoreProtocolsPatch(protocolSnapshot, interventionsSnapshot)
        );
      }
      return deleted;
    },
    [appData.interventions, appData.protocols, deleteProtocol, isShareMode, queueUndoAction, tr]
  );

  const deleteCheckInWithUndo = useCallback(
    (id: string) => {
      if (isShareMode) {
        return;
      }
      if (!appData.checkIns.some((checkIn) => checkIn.id === id)) {
        return;
      }
      const checkInsSnapshot = appData.checkIns;
      deleteCheckIn(id);
      queueUndoAction(tr("Check-in verwijderd.", "Check-in deleted."), restoreCheckInsPatch(checkInsSnapshot));
    },
    [appData.checkIns, deleteCheckIn, isShareMode, queueUndoAction, tr]
  );

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

  const captureMultiDateOriginalLabels = (nextDrafts: ExtractionDraft[]) => {
    const perDraft = nextDrafts.map((entry) =>
      Object.fromEntries(entry.markers.map((marker) => [marker.id, marker.marker]))
    );
    setMultiDateOriginalMarkerLabels(perDraft);
  };

  const startManualEntry = () => {
    setIsUploadPanelOpen(false);
    setUploadError("");
    setUploadNotice("");
    setUploadSummary(null);
    setMultiDateDrafts([]);
    setMultiDateAssessments([]);
    setMultiDateAnnotations([]);
    setMultiDateProtocolIds([]);
    setMultiDateOriginalMarkerLabels([]);
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

  const openHiddenUploadPicker = (): boolean => {
    const input = hiddenUploadInputRef.current;
    if (!input) {
      return false;
    }
    input.value = "";
    try {
      const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
      if (typeof pickerInput.showPicker === "function") {
        pickerInput.showPicker();
      } else {
        input.click();
      }
      return true;
    } catch {
      return false;
    }
  };

  const navigateAnalysisRoute = useCallback(
    (nextRoute: AnalysisRouteState, options?: { replace?: boolean }) => {
      setAnalysisRoute(nextRoute);
      if (typeof window === "undefined" || topLevelRouteMode !== "app" || isShareMode) {
        return;
      }
      const targetPath = buildPathForAnalysisRoute(nextRoute);
      if (normalizePathname(window.location.pathname) === normalizePathname(targetPath)) {
        return;
      }
      if (options?.replace) {
        window.history.replaceState({}, document.title, targetPath);
      } else {
        window.history.pushState({}, document.title, targetPath);
      }
    },
    [isShareMode, topLevelRouteMode]
  );

  const focusUploadPanelFallback = useCallback(() => {
    if (activeTab !== "dashboard") {
      setActiveTab("dashboard");
    }
    setIsUploadPanelOpen(true);
  }, [activeTab]);

  const startSecondUpload = useCallback(() => {
    if (isShareMode || isProcessing) {
      return;
    }
    void ensurePdfParsingModule();
    const pickerOpened = openHiddenUploadPicker();
    if (pickerOpened) {
      return;
    }
    focusUploadPanelFallback();
  }, [focusUploadPanelFallback, isProcessing, isShareMode]);
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
  const closeSignupVerificationModal = () => {
    setSignupVerificationEmail(null);
    setSignupVerificationResendNotice(null);
  };
  const handleResendSignupVerificationEmail = async () => {
    if (!signupVerificationEmail) {
      return;
    }
    setSignupVerificationResendBusy(true);
    setSignupVerificationResendNotice(null);
    try {
      await handleCloudVerificationEmailRequest(signupVerificationEmail);
      setSignupVerificationResendNotice(
        tr(
          "Nieuwe verificatie-e-mail verstuurd. Kijk ook in spam, ongewenst of promoties.",
          "Fresh verification email sent. Also check spam, junk, or promotions."
        )
      );
    } catch (error) {
      setSignupVerificationResendNotice(mapCloudAuthErrorToMessage(error, tr));
    } finally {
      setSignupVerificationResendBusy(false);
    }
  };

  const clearDemoAndUpload = () => {
    clearDemoData();
    requestAnimationFrame(() => {
      startSecondUpload();
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

  const buildRememberedAiCoachConsent = (): AIConsentDecision => ({
    action: "analysis",
    scope: "once",
    allowExternalAi: true,
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
    const improved = await withMonitoringSpan(
      {
        name: "parser.ai_rescue",
        op: "labtracker.parser",
        attributes: {
          parser_mode: "text_ocr_ai",
          ai_forced: true,
          file_size_bytes: file.size
        }
      },
      () =>
        extractLabData(file, {
          costMode: "balanced",
          aiAutoImproveEnabled: true,
          forceAi: true,
          preferAiResultWhenForced: true,
          externalAiAllowed: true,
          aiConsent: consent,
          parserDebugMode: "text_ocr_ai",
          markerAliasOverrides: appData.markerAliasOverrides,
          onStageChange: setUploadStage
        })
    );

    const improvedDraft = enrichDraftForReview(improved);
    const autoApplyDecision = shouldAutoApplyAiRescueResult(localDraft, improvedDraft);

    return {
      finalDraft: autoApplyDecision.shouldApplyAi ? improvedDraft : localDraft,
      aiApplied: autoApplyDecision.shouldApplyAi,
      aiAttempted: hasParserAiAttempt(improvedDraft)
    };
  };

  const handleUpload = async (file: File) => {
    setIsUploadPanelOpen(false);
    setIsProcessing(true);
    setUploadStage("reading_text_layer");
    setUploadError("");
    setUploadNotice("");
    setUploadSummary(null);
    setMultiDateDrafts([]);
    setMultiDateAssessments([]);
    setMultiDateAnnotations([]);
    setMultiDateProtocolIds([]);
    setMultiDateOriginalMarkerLabels([]);
    setAiAttemptedForCurrentUpload(false);
    setIsImprovingExtraction(false);
    setLocalBaselineDraft(null);
    setUncertaintyAssessment(null);
    resetParserImprovementPrompt();
    setShowComparisonModal(false);
    setPendingDiff(null);
    setAiCandidateDraft(null);

    try {
      const { extractLabDataBatch, assessParserUncertainty } = await ensurePdfParsingModule();
      const localParserMode = showAdvancedParserActions
        ? appData.settings.parserDebugMode === "text_ocr_ai"
          ? "text_ocr"
          : appData.settings.parserDebugMode
        : "text_ocr";

      const extractedBatch = await withMonitoringSpan(
        {
          name: "parser.upload",
          op: "labtracker.parser",
          attributes: {
            parser_mode: localParserMode,
            file_size_bytes: file.size,
            ai_enabled: false
          }
        },
        () =>
          extractLabDataBatch(file, {
            costMode: appData.settings.aiCostMode,
            aiAutoImproveEnabled: false,
            externalAiAllowed: false,
            aiConsent: getLocalOnlyParserConsent(),
            parserDebugMode: localParserMode,
            markerAliasOverrides: appData.markerAliasOverrides,
            onStageChange: setUploadStage
          })
      );

      if (extractedBatch.isMultiDate && extractedBatch.drafts.length > 1) {
        const enrichedDrafts = extractedBatch.drafts.map((entry) => enrichDraftForReview(entry));
        const assessments = enrichedDrafts.map((entry) => assessParserUncertainty(entry));
        const warningCount = new Set(
          enrichedDrafts.flatMap((entry) => [
            ...(entry.extraction.warnings ?? []),
            ...(entry.extraction.warningCode ? [entry.extraction.warningCode] : [])
          ])
        ).size;
        const markerCount = enrichedDrafts.reduce((sum, entry) => sum + entry.markers.length, 0);
        const defaultProtocolId = getMostRecentlyUpdatedProtocolId(appData.protocols);

        setDraft(null);
        setLocalBaselineDraft(null);
        setAiCandidateDraft(null);
        setPendingDiff(null);
        setShowComparisonModal(false);
        setUncertaintyAssessment(null);
        setDraftOriginalMarkerLabels({});
        setMultiDateDrafts(enrichedDrafts);
        setMultiDateAssessments(assessments);
        setMultiDateAnnotations(enrichedDrafts.map(() => blankAnnotations()));
        setMultiDateProtocolIds(enrichedDrafts.map(() => defaultProtocolId));
        captureMultiDateOriginalLabels(enrichedDrafts);
        setLastUploadedFile(file);
        setDraftAnnotations(blankAnnotations());
        setSelectedProtocolId(null);
        setActiveTab("dashboard");
        scrollPageToTop();
        setUploadSummary({
          kind: "upload",
          fileName: file.name,
          markerCount,
          warnings: warningCount,
          routeLabel: tr("Multi-date tabel", "Multi-date table")
        });
        setUploadNotice(
          tr(
            `${enrichedDrafts.length} meetmomenten gevonden. Controleer per datum en sla alles of per datum op.`,
            `${enrichedDrafts.length} measurement dates found. Review each date, then save all or per date.`
          )
        );
        return;
      }

      const extracted = extractedBatch.drafts[0];
      if (!extracted) {
        throw new Error("Parser returned no extraction drafts.");
      }

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
      captureAppException(error, {
        tags: {
          flow: "parser_upload",
          parser_mode: showAdvancedParserActions
            ? appData.settings.parserDebugMode === "text_ocr_ai"
              ? "text_ocr"
              : appData.settings.parserDebugMode
            : "text_ocr",
          upload_stage: uploadStage ?? "unknown"
        },
        extra: {
          fileSizeBytes: file.size,
          fileType: file.type || "unknown",
          userProfile: appData.settings.userProfile
        },
        fingerprint: ["parser-upload-failure"]
      });
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
      captureAppException(error, {
        tags: {
          flow: "parser_ai_rescue_auto",
          upload_stage: uploadStage ?? "unknown"
        },
        extra: {
          baselineMarkerCount,
          userProfile: appData.settings.userProfile
        },
        fingerprint: ["parser-ai-rescue-auto-failure"]
      });
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
      const improved = await withMonitoringSpan(
        {
          name: "parser.ai_refine_compare",
          op: "labtracker.parser",
          attributes: {
            parser_mode: "text_ocr_ai",
            ai_forced: true,
            file_size_bytes: lastUploadedFile.size
          }
        },
        () =>
          extractLabData(lastUploadedFile, {
            costMode: appData.settings.aiCostMode,
            aiAutoImproveEnabled: true,
            forceAi: true,
            preferAiResultWhenForced: true,
            externalAiAllowed: true,
            aiConsent: consent,
            parserDebugMode: "text_ocr_ai",
            markerAliasOverrides: appData.markerAliasOverrides,
            onStageChange: setUploadStage
          })
      );
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
      captureAppException(error, {
        tags: {
          flow: "parser_ai_refine_compare",
          upload_stage: uploadStage ?? "unknown"
        },
        extra: {
          baselineMarkerCount: baselineDraft.markers.length,
          fileSizeBytes: lastUploadedFile.size
        },
        fingerprint: ["parser-ai-refine-compare-failure"]
      });
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
        "Lokale extractie is behouden. Je kunt biomarkers handmatig aanpassen en opslaan.",
        "Local extraction was kept. You can edit biomarkers manually and save."
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
      const extracted = await withMonitoringSpan(
        {
          name: "parser.ocr_retry",
          op: "labtracker.parser",
          attributes: {
            parser_mode: "text_ocr",
            file_size_bytes: lastUploadedFile.size,
            ai_enabled: false
          }
        },
        () =>
          extractLabData(lastUploadedFile, {
            costMode: appData.settings.aiCostMode,
            aiAutoImproveEnabled: false,
            externalAiAllowed: false,
            aiConsent: getLocalOnlyParserConsent(),
            parserDebugMode: "text_ocr",
            markerAliasOverrides: appData.markerAliasOverrides,
            onStageChange: setUploadStage
          })
      );
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
      captureAppException(error, {
        tags: {
          flow: "parser_ocr_retry",
          upload_stage: uploadStage ?? "unknown"
        },
        extra: {
          fileSizeBytes: lastUploadedFile.size,
          userProfile: appData.settings.userProfile
        },
        fingerprint: ["parser-ocr-retry-failure"]
      });
      setUploadError(mapErrorToMessage(error, "pdf"));
      setUploadStage("failed");
    } finally {
      setIsProcessing(false);
      setUploadStage(null);
    }
  };

  const normalizeDraftAnnotationsForSave = (input: ReportAnnotations): ReportAnnotations => {
    const normalizedDraftSupplementAnchorState =
      input.supplementAnchorState === "inherit" ||
      input.supplementAnchorState === "anchor" ||
      input.supplementAnchorState === "none" ||
      input.supplementAnchorState === "unknown"
        ? input.supplementAnchorState
        : input.supplementOverrides === null
          ? "inherit"
          : input.supplementOverrides.length > 0
            ? "anchor"
            : "none";

    return {
      ...input,
      supplementAnchorState: normalizedDraftSupplementAnchorState,
      supplementOverrides:
        normalizedDraftSupplementAnchorState === "anchor"
          ? input.supplementOverrides ?? []
          : normalizedDraftSupplementAnchorState === "none"
            ? []
            : null
    };
  };

  interface PreparedReportSave {
    report: LabReport;
    learnedAliasOverrides: Record<string, string>;
    suggestions: MarkerMergeSuggestion[];
  }

  const prepareReportFromDraft = (
    sourceDraft: ExtractionDraft,
    sourceAnnotations: ReportAnnotations,
    protocolId: string | null,
    originalMarkerLabels: Record<string, string>
  ): PreparedReportSave | null => {
    const learnedAliasOverrides: Record<string, string> = {};
    const sanitizedMarkers = sourceDraft.markers
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

    sourceDraft.markers.forEach((row) => {
      const originalRaw = originalMarkerLabels[row.id];
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
      return null;
    }

    const resolvedDraftAnnotations = withResolvedInterventionAnnotations(
      {
        ...normalizeDraftAnnotationsForSave(sourceAnnotations),
        interventionId: protocolId,
        protocolId
      },
      protocolId,
      sourceDraft.testDate,
      appData.protocols
    );

    const report: LabReport = {
      id: createId(),
      sourceFileName: sourceDraft.sourceFileName,
      testDate: sourceDraft.testDate,
      createdAt: new Date().toISOString(),
      markers: sanitizedMarkers,
      annotations: resolvedDraftAnnotations,
      extraction: sourceDraft.extraction
    };
    const incomingCanonicalMarkers = Array.from(new Set(report.markers.map((marker) => marker.canonicalMarker)));
    const suggestions = detectMarkerMergeSuggestions(incomingCanonicalMarkers, allMarkers);

    return {
      report,
      learnedAliasOverrides,
      suggestions
    };
  };

  const normalizeFingerprintNumber = (value: number | null): string =>
    value === null || !Number.isFinite(value) ? "null" : (Math.round(value * 1_000_000) / 1_000_000).toString();

  const buildReportFingerprint = (report: LabReport): string =>
    report.markers
      .map((marker) => ({
        canonicalMarker: marker.canonicalMarker,
        unit: marker.unit.trim().toLowerCase(),
        value: normalizeFingerprintNumber(marker.value),
        referenceMin: normalizeFingerprintNumber(marker.referenceMin),
        referenceMax: normalizeFingerprintNumber(marker.referenceMax)
      }))
      .sort((left, right) => {
        if (left.canonicalMarker !== right.canonicalMarker) {
          return left.canonicalMarker.localeCompare(right.canonicalMarker);
        }
        if (left.unit !== right.unit) {
          return left.unit.localeCompare(right.unit);
        }
        if (left.value !== right.value) {
          return left.value.localeCompare(right.value);
        }
        if (left.referenceMin !== right.referenceMin) {
          return left.referenceMin.localeCompare(right.referenceMin);
        }
        return left.referenceMax.localeCompare(right.referenceMax);
      })
      .map((entry) => `${entry.canonicalMarker}|${entry.unit}|${entry.value}|${entry.referenceMin}|${entry.referenceMax}`)
      .join("||");

  interface SaveReportsOutcome {
    saved: number;
    replaced: number;
    skippedExact: number;
    skippedConflicts: number;
    savedTestDates: string[];
    exactDuplicateTestDates: string[];
    conflictSkippedTestDates: string[];
    firstSavedReport: LabReport | null;
  }

  const savePreparedReports = (prepared: PreparedReportSave[]): SaveReportsOutcome => {
    if (prepared.length === 0) {
      return {
        saved: 0,
        replaced: 0,
        skippedExact: 0,
        skippedConflicts: 0,
        savedTestDates: [],
        exactDuplicateTestDates: [],
        conflictSkippedTestDates: [],
        firstSavedReport: null
      };
    }

    const mergedAliasOverrides: Record<string, string> = {};
    const mergedSuggestions: MarkerMergeSuggestion[] = [];
    let nextReports = [...appData.reports];
    let saved = 0;
    let replaced = 0;
    let skippedExact = 0;
    let skippedConflicts = 0;
    const savedTestDates: string[] = [];
    const exactDuplicateTestDates: string[] = [];
    const conflictSkippedTestDates: string[] = [];
    let firstSavedReport: LabReport | null = null;

    for (const entry of prepared) {
      Object.assign(mergedAliasOverrides, entry.learnedAliasOverrides);
      mergedSuggestions.push(...entry.suggestions);
      const sameDateReports = nextReports.filter((report) => report.testDate === entry.report.testDate);
      if (sameDateReports.length === 0) {
        nextReports.push(entry.report);
        saved += 1;
        savedTestDates.push(entry.report.testDate);
        if (!firstSavedReport) {
          firstSavedReport = entry.report;
        }
        continue;
      }

      const incomingFingerprint = buildReportFingerprint(entry.report);
      const exactExisting = sameDateReports.find((report) => buildReportFingerprint(report) === incomingFingerprint);
      if (exactExisting) {
        skippedExact += 1;
        exactDuplicateTestDates.push(entry.report.testDate);
        continue;
      }

      const toReplace = sameDateReports[0];
      const replaceConfirmed =
        typeof window === "undefined"
          ? true
          : window.confirm(
              tr(
                `Er bestaat al een rapport op ${entry.report.testDate}. Vervang het bestaande rapport voor deze datum?`,
                `A report already exists on ${entry.report.testDate}. Replace the existing report for this date?`
              )
            );
      if (!replaceConfirmed) {
        skippedConflicts += 1;
        conflictSkippedTestDates.push(entry.report.testDate);
        continue;
      }

      const replacedReport: LabReport = {
        ...toReplace,
        sourceFileName: entry.report.sourceFileName,
        testDate: entry.report.testDate,
        markers: entry.report.markers,
        extraction: entry.report.extraction
      };
      nextReports = nextReports.map((report) => (report.id === toReplace.id ? replacedReport : report));
      saved += 1;
      replaced += 1;
      savedTestDates.push(entry.report.testDate);
      if (!firstSavedReport) {
        firstSavedReport = replacedReport;
      }
    }

    if (saved > 0) {
      const sorted = sortReportsChronological(nextReports);
      setAppData((prev) => ({
        ...prev,
        reports: sorted
      }));
    }
    if (Object.keys(mergedAliasOverrides).length > 0) {
      upsertMarkerAliasOverrides(mergedAliasOverrides);
    }
    if (mergedSuggestions.length > 0) {
      appendMarkerSuggestions(mergedSuggestions);
    }

    return {
      saved,
      replaced,
      skippedExact,
      skippedConflicts,
      savedTestDates,
      exactDuplicateTestDates,
      conflictSkippedTestDates,
      firstSavedReport
    };
  };

  const saveDraftAsReport = () => {
    if (!draft) {
      return;
    }

    const prepared = prepareReportFromDraft(
      draft,
      draftAnnotations,
      selectedProtocolId,
      draftOriginalMarkerLabels
    );
    if (!prepared) {
      setUploadError(
        tr(
          "Geen geldige biomarker-rijen gevonden. Voeg minimaal één biomarker toe voordat je opslaat.",
          "No valid biomarker rows found. Add at least one biomarker before saving."
        )
      );
      return;
    }

    const isFirstReport = reports.length === 0 && !appData.settings.onboardingCompleted;
    const outcome = savePreparedReports([prepared]);
    if (outcome.saved > 0 && isFirstReport && outcome.firstSavedReport) {
      startFirstReportOnboarding(outcome.firstSavedReport);
    }

    if (outcome.saved === 0 && outcome.skippedConflicts > 0) {
      setUploadNotice(
        tr(
          "Opslaan geannuleerd voor deze datum. Controleer de review en probeer opnieuw.",
          "Save was skipped for this date. Review and try again."
        )
      );
      return;
    }

    if (outcome.saved === 0 && outcome.skippedExact > 0) {
      setUploadNotice(
        tr(
          "Dit meetmoment bestaat al exact. Er is niets nieuws opgeslagen.",
          "This measurement date already exists exactly. Nothing new was saved."
        )
      );
    } else if (outcome.saved > 0) {
      setUploadNotice(
        outcome.replaced > 0
          ? tr("Rapport opgeslagen en bestaande datum bijgewerkt.", "Report saved and existing date updated.")
          : tr("Rapport opgeslagen.", "Report saved.")
      );
    }

    setUploadSummary(null);
    clearReviewDraftState();
  };

  const removeMultiDateDraftAtIndex = (index: number) => {
    setMultiDateDrafts((current) => current.filter((_, entryIndex) => entryIndex !== index));
    setMultiDateAssessments((current) => current.filter((_, entryIndex) => entryIndex !== index));
    setMultiDateAnnotations((current) => current.filter((_, entryIndex) => entryIndex !== index));
    setMultiDateProtocolIds((current) => current.filter((_, entryIndex) => entryIndex !== index));
    setMultiDateOriginalMarkerLabels((current) => current.filter((_, entryIndex) => entryIndex !== index));
  };

  const saveMultiDateDraftByIndex = (index: number) => {
    const draftAtIndex = multiDateDrafts[index];
    if (!draftAtIndex) {
      return;
    }

    const prepared = prepareReportFromDraft(
      draftAtIndex,
      multiDateAnnotations[index] ?? blankAnnotations(),
      multiDateProtocolIds[index] ?? null,
      multiDateOriginalMarkerLabels[index] ?? {}
    );
    if (!prepared) {
      setUploadError(
        tr(
          "Geen geldige biomarker-rijen gevonden. Voeg minimaal één biomarker toe voordat je opslaat.",
          "No valid biomarker rows found. Add at least one biomarker before saving."
        )
      );
      return;
    }

    const isFirstReport = reports.length === 0 && !appData.settings.onboardingCompleted;
    const outcome = savePreparedReports([prepared]);
    if (outcome.saved > 0 && isFirstReport && outcome.firstSavedReport) {
      startFirstReportOnboarding(outcome.firstSavedReport);
    }

    if (outcome.saved > 0 || outcome.skippedExact > 0) {
      removeMultiDateDraftAtIndex(index);
      const remainingCount = multiDateDrafts.length - 1;
      if (remainingCount <= 0) {
        setUploadSummary(null);
        clearReviewDraftState();
      }
    }

    if (outcome.saved > 0) {
      setUploadNotice(
        outcome.replaced > 0
          ? tr("Meetmoment opgeslagen en bestaande datum bijgewerkt.", "Measurement date saved and existing date updated.")
          : tr("Meetmoment opgeslagen.", "Measurement date saved.")
      );
      return;
    }
    if (outcome.skippedExact > 0) {
      setUploadNotice(
        tr(
          "Dit meetmoment bestond al exact en is overgeslagen.",
          "This measurement date already existed exactly and was skipped."
        )
      );
      return;
    }
    if (outcome.skippedConflicts > 0) {
      setUploadNotice(
        tr(
          "Meetmoment niet opgeslagen. Je kunt opnieuw kiezen of de bestaande datum vervangen moet worden.",
          "Measurement date was not saved. You can retry and choose whether to replace the existing date."
        )
      );
    }
  };

  const saveAllMultiDateDrafts = () => {
    if (multiDateDrafts.length === 0) {
      return;
    }
    const prepared = multiDateDrafts
      .map((entry, index) =>
        prepareReportFromDraft(
          entry,
          multiDateAnnotations[index] ?? blankAnnotations(),
          multiDateProtocolIds[index] ?? null,
          multiDateOriginalMarkerLabels[index] ?? {}
        )
      )
      .filter((entry): entry is PreparedReportSave => Boolean(entry));

    if (prepared.length === 0) {
      setUploadError(
        tr(
          "Geen geldige biomarker-rijen gevonden. Voeg minimaal één biomarker toe voordat je opslaat.",
          "No valid biomarker rows found. Add at least one biomarker before saving."
        )
      );
      return;
    }

    const isFirstReport = reports.length === 0 && !appData.settings.onboardingCompleted;
    const outcome = savePreparedReports(prepared);
    if (outcome.saved > 0 && isFirstReport && outcome.firstSavedReport) {
      startFirstReportOnboarding(outcome.firstSavedReport);
    }
    const conflictDates = new Set(outcome.conflictSkippedTestDates);
    if (conflictDates.size > 0) {
      const keepIndexes = multiDateDrafts
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => conflictDates.has(entry.testDate))
        .map(({ index }) => index);
      if (keepIndexes.length === 0) {
        setUploadSummary(null);
        clearReviewDraftState();
      } else {
        setMultiDateDrafts(keepIndexes.map((index) => multiDateDrafts[index]));
        setMultiDateAssessments(keepIndexes.map((index) => multiDateAssessments[index] ?? buildFallbackParserAssessment(multiDateDrafts[index])));
        setMultiDateAnnotations(keepIndexes.map((index) => multiDateAnnotations[index] ?? blankAnnotations()));
        setMultiDateProtocolIds(keepIndexes.map((index) => multiDateProtocolIds[index] ?? null));
        setMultiDateOriginalMarkerLabels(keepIndexes.map((index) => multiDateOriginalMarkerLabels[index] ?? {}));
      }
    } else {
      setUploadSummary(null);
      clearReviewDraftState();
    }

    setUploadNotice(
      tr(
        `${outcome.saved} opgeslagen, ${outcome.skippedExact} overgeslagen (exact), ${outcome.skippedConflicts} conflicten overgeslagen.`,
        `${outcome.saved} saved, ${outcome.skippedExact} skipped (exact), ${outcome.skippedConflicts} conflict skips.`
      )
    );
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
  const latestWellbeingCheckInDate = useMemo(() => {
    if (appData.checkIns.length === 0) {
      return null;
    }
    return [...appData.checkIns].sort((left, right) => right.date.localeCompare(left.date))[0]?.date ?? null;
  }, [appData.checkIns]);
  const daysSinceWellbeingCheckIn = useMemo(() => {
    if (!latestWellbeingCheckInDate) {
      return null;
    }
    const parsedDate = parseISO(latestWellbeingCheckInDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return null;
    }
    return differenceInDays(new Date(), parsedDate);
  }, [latestWellbeingCheckInDate]);
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
  const activeSupplementsCount = useMemo(
    () => appData.supplementTimeline.filter((period) => period.endDate === null).length,
    [appData.supplementTimeline]
  );
  const supplementHistoryCount = appData.supplementTimeline.length;
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
  const hasActiveAnalysisProtocol = useMemo(
    () => activeAnalysisProtocolLabel.trim().length > 0 && activeAnalysisProtocolLabel !== tr("Geen protocol", "No protocol"),
    [activeAnalysisProtocolLabel, tr]
  );
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
        "Biomarkerwaarden, eenheden en referentiebereiken worden lokaal uitgelezen (zonder externe AI). Bij lage kwaliteit kun je daarna optioneel AI-rescue starten (na toestemming).",
        "Biomarkers, units, and reference ranges are extracted locally (without external AI). If quality is low, you can then optionally start AI rescue (after consent)."
      );

  const runAiQuestionWithConsent = async (
    question: string,
    meta?: { presetKey?: AiAnalysisPresetKey; title?: string }
  ) => {
    let consent: AIConsentDecision | null = null;

    if (appData.settings.aiCoachConsentAsked) {
      consent = appData.settings.aiExternalConsent ? buildRememberedAiCoachConsent() : null;
    } else {
      const decision = await requestAiConsent("analysis");
      if (!decision) {
        return;
      }
      const allowExternalAi = Boolean(decision?.allowExternalAi);
      updateSettings({
        aiCoachConsentAsked: true,
        aiExternalConsent: allowExternalAi
      });
      consent = allowExternalAi ? buildRememberedAiCoachConsent() : null;
    }

    if (!consent) {
      setAnalysisError(
        tr(
          "AI Coach staat uit. Open AI Coach opnieuw en geef toestemming om AI te gebruiken.",
          "AI Coach is disabled. Open AI Coach again and grant consent to use AI."
        )
      );
      return;
    }

    const scopeSnapshot: AiAnalysisScopeSnapshot = {
      reportCount: reports.length,
      biomarkerCount: allMarkers.length,
      units: appData.settings.unitSystem === "eu" ? "SI (Metric)" : "Conventional",
      activeProtocol:
        hasActiveAnalysisProtocol && activeAnalysisProtocolLabel.trim().length > 0
          ? activeAnalysisProtocolLabel
          : null
    };
    const completed = await runAiQuestion(question, consent, {
      presetKey: meta?.presetKey,
      title: meta?.title,
      scopeSnapshot
    });
    if (!completed || !completed.answer.trim()) {
      return;
    }
    const fallbackTitle = question.trim().slice(0, 60);
    const normalizedTitle = (meta?.title ?? fallbackTitle).trim();
    addAiAnalysis({
      id: createId(),
      createdAt: completed.generatedAt,
      prompt: question.trim(),
      presetKey: meta?.presetKey,
      title: normalizedTitle.length > 0 ? normalizedTitle : fallbackTitle,
      answer: completed.answer,
      scopeSnapshot
    });
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
        ? tr("Gedeelde read-only snapshot van tijdlijntrends en biomarkercontext.", "Shared read-only snapshot of timeline trends and biomarker context.")
        : null;
    }
    if (activeTab === "dashboard") return hasReports ? tr("Je biomarkers in één oogopslag.", "Your biomarkers at a glance.") : null;
    if (activeTab === "reports") return tr("Alle geüploade labresultaten in één overzicht.", "All uploaded lab reports in one overview.");
    if (activeTab === "alerts") return tr("Trends en drempelwaarschuwingen voor je biomarkers.", "Trend and threshold alerts for your biomarkers.");
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
        return tr("Interventiewijzigingen afgezet tegen je gemeten biomarkers.", "Measured impact of intervention changes on your biomarkers.");
      }
      if (appData.settings.userProfile === "biohacker") {
        return tr("Stack-wijzigingen afgezet tegen je gemeten biomarkers.", "Measured impact of stack changes on your biomarkers.");
      }
      return tr("Protocolwijzigingen afgezet tegen je gemeten biomarkers.", "Measured impact of protocol changes on your biomarkers.");
    }
    if (activeTab === "doseResponse") return tr("Simuleer hoe dosisaanpassingen je waarden beïnvloeden.", "Model how dose changes may affect your levels.");
    if (activeTab === "checkIns") return tr("Volg hoe je je voelt naast je labwaarden.", "Track how you feel alongside your lab results.");
    if (activeTab === "analysis") {
      if (analysisRoute.kind === "coach") {
        return tr(
          "Ask questions about your lab data. AI only runs when you start an action.",
          "Ask questions about your lab data. AI only runs when you start an action."
        );
      }
      if (analysisRoute.kind === "history") {
        return tr(
          "Bekijk en heropen je eerdere AI-analyses.",
          "Review and reopen your previous AI analyses."
        );
      }
      return tr(
        "Volledige AI-analyse met prompt en antwoord.",
        "Full AI analysis with prompt and answer."
      );
    }
    return null;
  })();
  const isReviewMode = Boolean((draft || multiDateDrafts.length > 0) && !isShareMode);
  const shouldShowWellbeingReminder =
    !isShareMode &&
    !isReviewMode &&
    !showOnboardingWizard &&
    activeTab === "dashboard" &&
    hasReports &&
    !isProcessing &&
    !isImprovingExtraction &&
    daysSinceWellbeingCheckIn !== null &&
    daysSinceWellbeingCheckIn >= 7 &&
    latestWellbeingCheckInDate !== null &&
    latestWellbeingCheckInDate !== wellbeingReminderDismissedDate;
  useEffect(() => {
    if (shouldShowWellbeingReminder) {
      setShowWellbeingReminderModal(true);
      return;
    }
    setShowWellbeingReminderModal(false);
  }, [shouldShowWellbeingReminder]);
  const shellActiveTabTitle = isReviewMode
    ? tr("Controleer geëxtraheerde data", "Review extracted data")
    : activeTabTitle;
  const shellActiveTabSubtitle = isReviewMode
    ? null
    : activeTabSubtitle;
  const headerStats = useMemo<AppShellHeaderStat[]>(() => {
    if (isReviewMode) {
      return [];
    }
    if (activeTab === "dashboard" && hasReports) {
      return [
        {
          id: "reports",
          value: String(reports.length),
          label: tr("rapporten", "reports")
        },
        {
          id: "markers",
          value: String(allMarkers.length),
          label: tr("biomarkers gevolgd", "biomarkers tracked")
        },
        {
          id: "out-of-range",
          value: String(outOfRangeCount),
          label: tr("buiten bereik", "out of range"),
          tone: outOfRangeCount === 0 ? "positive" : "warning",
          actionTab: outOfRangeCount > 0 ? "alerts" : undefined
        }
      ];
    }
    if (activeTab === "reports") {
      return [
        {
          id: "reports-total",
          value: String(reports.length),
          label: tr("rapporten", "reports")
        },
        {
          id: "reports-latest",
          value: latestReportDate ? formatDate(latestReportDate) : "-",
          label: tr("laatste rapport", "latest report")
        }
      ];
    }
    if (activeTab === "alerts") {
      return [
        {
          id: "alerts-actionable",
          value: String(actionableAlerts.length),
          label: tr("actie nodig", "actionable"),
          tone: actionableAlerts.length === 0 ? "positive" : "warning"
        },
        {
          id: "alerts-positive",
          value: String(positiveAlerts.length),
          label: tr("positief", "positive"),
          tone: positiveAlerts.length > 0 ? "positive" : "neutral"
        },
        {
          id: "alerts-total",
          value: String(alerts.length),
          label: tr("totaal", "total")
        }
      ];
    }
    if (activeTab === "supplements") {
      return [
        {
          id: "supplements-active",
          value: String(activeSupplementsCount),
          label: tr("actief", "active")
        },
        {
          id: "supplements-history",
          value: String(supplementHistoryCount),
          label: tr("historie-items", "history items")
        }
      ];
    }
    if (activeTab === "protocol") {
      return [
        {
          id: "protocol-total",
          value: String(appData.protocols.length),
          label: tr("protocollen", "protocols")
        },
        {
          id: "protocol-active",
          value: activeProtocol?.name?.trim() ? activeProtocol.name : tr("geen", "none"),
          label: tr("actief", "active")
        }
      ];
    }
    if (activeTab === "checkIns") {
      return [
        {
          id: "checkins-total",
          value: String(appData.checkIns.length),
          label: tr("check-ins", "check-ins")
        },
        {
          id: "checkins-last",
          value: daysSinceWellbeingCheckIn === null ? tr("geen", "none") : String(daysSinceWellbeingCheckIn),
          label: tr("dagen sinds laatste", "days since last")
        }
      ];
    }
    return [];
  }, [
    activeProtocol,
    activeSupplementsCount,
    activeTab,
    alerts.length,
    allMarkers.length,
    appData.checkIns.length,
    appData.protocols.length,
    actionableAlerts.length,
    daysSinceWellbeingCheckIn,
    hasReports,
    isReviewMode,
    latestReportDate,
    outOfRangeCount,
    positiveAlerts.length,
    reports.length,
    supplementHistoryCount,
    tr
  ]);
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
      if (nextTab === "analysis" && analysisRoute.kind !== "coach") {
        navigateAnalysisRoute({ kind: "coach" }, { replace: true });
      }
      return;
    }
    if (!visibleTabKeys.has(nextTab)) {
      return;
    }
    if (nextTab !== "reports") {
      setFocusedReportId(null);
    }
    if ((draft || multiDateDrafts.length > 0) && !isShareMode) {
      setPendingTabChange(nextTab);
      return;
    }
    if (nextTab !== "analysis" && analysisRoute.kind !== "coach") {
      navigateAnalysisRoute({ kind: "coach" }, { replace: true });
    }
    setActiveTab(nextTab);
  };
  const openAnalysisCoach = useCallback(() => {
    if (activeTab !== "analysis") {
      setActiveTab("analysis");
    }
    navigateAnalysisRoute({ kind: "coach" });
  }, [activeTab, navigateAnalysisRoute]);
  const openAnalysisHistoryList = useCallback(() => {
    if (activeTab !== "analysis") {
      setActiveTab("analysis");
    }
    navigateAnalysisRoute({ kind: "history" });
  }, [activeTab, navigateAnalysisRoute]);
  const openAnalysisHistoryDetail = useCallback(
    (analysisId: string) => {
      if (activeTab !== "analysis") {
        setActiveTab("analysis");
      }
      navigateAnalysisRoute({ kind: "history_detail", id: analysisId });
    },
    [activeTab, navigateAnalysisRoute]
  );
  const handleDeleteAiAnalysis = useCallback(
    (analysisId: string) => {
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(
          tr(
            "Weet je zeker dat je deze AI-analyse wilt verwijderen?",
            "Are you sure you want to delete this AI analysis?"
          )
        );
        if (!confirmed) {
          return;
        }
      }
      deleteAiAnalysis(analysisId);
      if (analysisRoute.kind === "history_detail" && analysisRoute.id === analysisId) {
        navigateAnalysisRoute({ kind: "history" }, { replace: true });
      }
    },
    [analysisRoute, deleteAiAnalysis, navigateAnalysisRoute, tr]
  );
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
  const dismissWellbeingReminder = () => {
    if (latestWellbeingCheckInDate) {
      setWellbeingReminderDismissedDate(latestWellbeingCheckInDate);
    }
    setShowWellbeingReminderModal(false);
  };
  const handleOpenWellbeingCheckIn = () => {
    dismissWellbeingReminder();
    requestTabChange("checkIns");
  };

  useEffect(() => {
    closeMobileMenu();
    scrollPageToTop();
  }, [activeTab]);

  useEffect(() => {
    if (!isOnboardingLocked) {
      return;
    }
    if (activeTab === "dashboard" || activeTab === "settings") {
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
    clearReviewDraftState();
    if (nextTab !== "reports") {
      setFocusedReportId(null);
    }
    setActiveTab(nextTab);
  };

  const parserImprovementDraft = draft ?? multiDateDrafts[0] ?? null;
  const parserImprovementAssessment = useMemo(() => {
    if (draft) {
      return uncertaintyAssessment ?? buildFallbackParserAssessment(draft);
    }
    if (!parserImprovementDraft) {
      return null;
    }
    return multiDateAssessments[0] ?? buildFallbackParserAssessment(parserImprovementDraft);
  }, [draft, parserImprovementDraft, uncertaintyAssessment, multiDateAssessments]);

  const handleParserImprovementSubmit = async (values: ParserImprovementFormValues) => {
    if (!parserImprovementDraft || !parserImprovementAssessment || !lastUploadedFile) {
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
        draft: parserImprovementDraft,
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
  const parserImprovementCanSubmit = Boolean(parserImprovementDraft && lastUploadedFile);

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
  const showDemoBanner = !isShareMode && hasDemoData && activeTab !== "analysis";
  const showBackupPrompt =
    !isShareMode &&
    activeTab === "dashboard" &&
    reports.length > 0 &&
    cloudAuth.status !== "authenticated" &&
    !backupPromptDismissed &&
    !showDemoBanner;
  const wellbeingReminderDays = daysSinceWellbeingCheckIn ?? 7;
  const quickUploadDisabled = isShareMode || isProcessing;
  const adminLoadFallback = (
    <div className="min-h-screen px-3 py-4 text-slate-100 sm:px-5 lg:px-6">
      <section className="mx-auto w-full max-w-xl rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-5 text-sm text-slate-200">
        <div className="flex items-center gap-2 text-cyan-200">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tr("Admin wordt geladen...", "Loading admin...")}
        </div>
      </section>
    </div>
  );

  if (topLevelRouteMode === "admin") {
    return (
      <>
        <Suspense fallback={adminLoadFallback}>
          <AdminView
            language={appData.settings.language}
            theme={resolvedTheme}
            authStatus={cloudAuth.status}
            authError={cloudAuth.error}
            accessToken={cloudAuth.session?.accessToken ?? null}
            sessionEmail={cloudAuth.session?.user.email ?? null}
            onOpenCloudAuth={openCloudAuthModal}
            onSignOut={cloudAuth.signOut}
          />
        </Suspense>

        <CloudAuthModal
          open={cloudAuthModalOpen}
          language={appData.settings.language}
          theme={resolvedTheme}
          configured={cloudAuth.configured}
          initialView={cloudAuthModalView}
          initialEmail={cloudAuthModalPrefillEmail}
          authStatus={cloudAuth.status}
          authError={cloudAuth.error}
          consentRequired={cloudAuth.status === "authenticated" && cloudAuth.consentStatus !== "granted"}
          privacyPolicyVersion={CLOUD_PRIVACY_POLICY_VERSION}
          onClose={closeCloudAuthModal}
          onSignInGoogle={handleCloudGoogleSignIn}
          onSignInEmail={handleCloudSignInEmail}
          onSignUpEmail={handleCloudSignUpEmail}
          onCompleteConsent={cloudAuth.completeConsent}
          onRequestVerificationEmail={handleCloudVerificationEmailRequest}
          onRequestPasswordResetEmail={handleCloudPasswordResetEmailRequest}
          onOpenView={openCloudAuthModal}
        />
      </>
    );
  }

  if (topLevelRouteMode === "auth_confirm") {
    return (
      <CloudEmailConfirmView
        language={appData.settings.language}
        theme={resolvedTheme}
        confirmationUrl={confirmationUrl}
      />
    );
  }

  if (topLevelRouteMode === "auth_verified") {
    return (
      <CloudEmailVerifiedView
        language={appData.settings.language}
        theme={resolvedTheme}
        prefillEmail={verifiedSignInEmail}
      />
    );
  }

  if (topLevelRouteMode === "auth_reset") {
    return (
      <CloudPasswordResetView
        language={appData.settings.language}
        theme={resolvedTheme}
        recoveryUrl={recoveryUrl}
        onResetPassword={cloudAuth.resetPassword}
      />
    );
  }

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
          theme: resolvedTheme,
          interfaceDensity: appData.settings.interfaceDensity,
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
          cloudUserEmail: cloudAuth.session?.user.email ?? null,
          headerStats,
          sidebarCollapsedDesktop: appData.settings.sidebarCollapsedDesktop
        }}
        uploadState={{
          uploadPanelRef,
          hiddenUploadInputRef,
          isProcessing,
          uploadStage,
          uploadError,
          uploadNotice,
          isUploadPanelOpen
        }}
        actions={{
          onRequestTabChange: requestTabChange,
          onToggleMobileMenu: () => setIsMobileMenuOpen((current) => !current),
          onCloseMobileMenu: closeMobileMenu,
          onQuickUpload: startSecondUpload,
          onOpenUploadPanel: () => {
            if (isShareMode || quickUploadDisabled) {
              return;
            }
            setIsUploadPanelOpen(true);
          },
          onCloseUploadPanel: () => setIsUploadPanelOpen(false),
          onToggleTheme: () =>
            updateSettings({
              theme:
                appData.settings.theme === "system"
                  ? resolvedTheme === "dark"
                    ? "light"
                    : "dark"
                  : appData.settings.theme === "dark"
                    ? "light"
                    : "dark"
            }),
          onUploadFileSelected: handleUpload,
          onUploadIntent: () => {
            void ensurePdfParsingModule();
          },
          onStartManualEntry: startManualEntry,
          onOpenCloudAuth: openCloudAuthModal,
          onToggleDesktopSidebar: () =>
            updateSettings({ sidebarCollapsedDesktop: !appData.settings.sidebarCollapsedDesktop })
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
                  {parserImprovementDraft && parserImprovementAssessment ? (
                    <ParserImprovementSubmissionCard
                      open={isParserImprovementModalOpen}
                      language={appData.settings.language}
                      draft={parserImprovementDraft}
                      assessment={parserImprovementAssessment}
                      status={parserImprovementPromptState}
                      errorMessage={parserImprovementPromptError}
                      prefillEmail={cloudAuth.session?.user.email ?? null}
                      onSubmit={handleParserImprovementSubmit}
                      onClose={closeParserImprovementModal}
                    />
                  ) : null}
                  {draft ? (
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
                      theme={resolvedTheme}
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
                        clearReviewDraftState();
                      }}
                    />
                  ) : null}
                  {!draft && multiDateDrafts.length > 0 ? (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-cyan-500/35 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                        <p className="font-medium">
                          {tr(
                            `${multiDateDrafts.length} meetmomenten gevonden in deze PDF`,
                            `${multiDateDrafts.length} measurement dates found in this PDF`
                          )}
                        </p>
                        <p className="mt-1 text-cyan-100/90">
                          {tr(
                            "Controleer per datum de waarden. Je kunt alles in één keer opslaan of per datum apart.",
                            "Review values per date. You can save everything at once or save each date separately."
                          )}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-cyan-400"
                            onClick={saveAllMultiDateDrafts}
                          >
                            {tr("Alles opslaan", "Save all")}
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500"
                            onClick={() => {
                              setUploadSummary(null);
                              clearReviewDraftState();
                            }}
                          >
                            {tr("Annuleren", "Cancel")}
                          </button>
                        </div>
                      </div>

                      {multiDateDrafts.map((entry, index) => (
                        <div key={`${entry.testDate}-${index}`} className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-3">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-100">
                              {tr("Meetmoment", "Measurement date")}: {formatDate(entry.testDate)}
                            </p>
                            <p className="text-xs text-slate-400">
                              {entry.markers.length} {tr("biomarkers", "biomarkers")}
                            </p>
                          </div>
                          <ExtractionReviewTable
                            key={`multi-draft-${index}`}
                            draft={entry}
                            annotations={multiDateAnnotations[index] ?? blankAnnotations()}
                            protocols={appData.protocols}
                            supplementTimeline={appData.supplementTimeline}
                            inheritedSupplementsPreview={draftInheritedSupplements}
                            inheritedSupplementsSourceLabel={draftInheritedSupplementsLabel}
                            selectedProtocolId={multiDateProtocolIds[index] ?? null}
                            parserDebugMode={appData.settings.parserDebugMode}
                            language={appData.settings.language}
                            theme={resolvedTheme}
                            onDraftChange={(nextDraft) =>
                              setMultiDateDrafts((current) =>
                                current.map((candidate, candidateIndex) =>
                                  candidateIndex === index ? nextDraft : candidate
                                )
                              )
                            }
                            onAnnotationsChange={(nextAnnotations) =>
                              setMultiDateAnnotations((current) =>
                                current.map((candidate, candidateIndex) =>
                                  candidateIndex === index ? nextAnnotations : candidate
                                )
                              )
                            }
                            onSelectedProtocolIdChange={(nextProtocolId) =>
                              setMultiDateProtocolIds((current) =>
                                current.map((candidate, candidateIndex) =>
                                  candidateIndex === index ? nextProtocolId : candidate
                                )
                              )
                            }
                            onProtocolCreate={addProtocol}
                            onAddSupplementPeriod={addSupplementPeriod}
                            isImprovingWithAi={false}
                            showLowQualityReviewBanner={false}
                            parserImprovementSubmitted={parserImprovementPromptState === "success"}
                            onStartManualEntry={startManualEntry}
                            onSave={() => saveMultiDateDraftByIndex(index)}
                            onCancel={() => {
                              setUploadSummary(null);
                              clearReviewDraftState();
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Suspense>
            ) : null}
        </AnimatePresence>

        {!isReviewMode ? (
          <>
            <AnimatePresence>
                {showDemoBanner ? (
                  <motion.section
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className={demoBannerClassName}
                  >
                    <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
                      <div className={demoBannerTextClassName}>
                        <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <p>
                            {isDemoMode
                              ? tr(
                                  "Je verkent de app met demodata, kijk gerust rond. Klaar? Begin opnieuw met je eigen uitslagen.",
                                  "You're exploring with demo data, feel free to look around. When you're ready, start fresh with your own labs."
                                )
                              : tr(
                                  "Demodata is nog geladen. Wis het wanneer je klaar bent.",
                                  "Demo data is still loaded. Clear it when you're ready."
                                )}
                          </p>
                          {cloudAuth.status !== "authenticated" ? (
                            <button
                              type="button"
                              onClick={() => openCloudAuthModal("signup")}
                              className={
                                isDarkTheme
                                  ? "mt-1 text-xs text-cyan-200 underline decoration-cyan-300/70 underline-offset-2 transition hover:text-cyan-50"
                                  : "mt-1 text-xs text-cyan-800 underline decoration-cyan-600/60 underline-offset-2 transition hover:text-cyan-900"
                              }
                            >
                              {tr(
                                "Tip: maak een gratis account voor cloud back-up.",
                                "Tip: create a free account to back up your data."
                              )}
                            </button>
                          ) : null}
                        </div>
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
                settings={resolvedSettings}
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
                    onDeleteProtocol={deleteProtocolWithUndo}
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
                    onDeleteSupplementPeriod={deleteSupplementPeriodWithUndo}
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
                    onDelete={deleteCheckInWithUndo}
                  />
                ) : null}

                {activeTab === "alerts" ? (
                  <AlertsView
                    alerts={alerts}
                    actionableAlerts={actionableAlerts}
                    positiveAlerts={positiveAlerts}
                    alertSeriesByMarker={alertSeriesByMarker}
                    settings={resolvedSettings}
                    language={appData.settings.language}
                    samplingControlsEnabled={samplingControlsEnabled}
                    focusedMarker={focusedAlertMarker}
                    onFocusedMarkerHandled={() => setFocusedAlertMarker(null)}
                    onOpenDashboard={() => requestTabChange("dashboard")}
                  />
                ) : null}

                {activeTab === "protocolImpact" ? (
                  <ProtocolImpactView
                    protocolDoseEvents={protocolDoseEvents}
                    settings={resolvedSettings}
                    language={appData.settings.language}
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
                    settings={resolvedSettings}
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
                    settings={resolvedSettings}
                    language={appData.settings.language}
                    samplingControlsEnabled={samplingControlsEnabled}
                    isShareMode={isShareMode}
                    resolvedSupplementContexts={resolvedSupplementContexts}
                    onDeleteReport={deleteReportWithUndo}
                    onDeleteReports={deleteReportsWithUndo}
                    onUpdateReportAnnotations={updateReportAnnotations}
                    onUpdateReportMarkerUnit={updateReportMarkerUnit}
                    onSetBaseline={setBaseline}
                    onRenameMarker={openRenameDialog}
                    onOpenProtocolTab={() => requestTabChange("protocol")}
                    focusedReportId={focusedReportId}
                    onFocusedReportHandled={() => setFocusedReportId(null)}
                  />
                ) : null}

                {activeTab === "analysis" ? (
                  analysisRoute.kind === "coach" ? (
                    <AnalysisView
                      isAnalyzingLabs={isAnalyzingLabs}
                      analysisRequestState={analysisRequestState}
                      analysisError={analysisError}
                      analysisResult={analysisResult}
                      analysisResultDisplay={analysisResultDisplay}
                      analysisGeneratedAt={analysisGeneratedAt}
                      analysisQuestion={analysisQuestion}
                      analysisCopied={analysisCopied}
                      analysisModelInfo={analysisModelInfo}
                      analysisKind={analysisKind}
                      analyzingKind={analyzingKind}
                      analysisScopeNotice={analysisScopeNotice}
                      reports={reports}
                      trendByMarker={trendByMarker}
                      reportsInScope={reports.length}
                      markersTracked={allMarkers.length}
                      analysisMarkerNames={analysisMarkerNames}
                      activeProtocolLabel={activeAnalysisProtocolLabel}
                      hasActiveProtocol={hasActiveAnalysisProtocol}
                      hasDemoData={hasDemoData}
                      isDemoMode={isDemoMode}
                      betaUsage={betaUsage}
                      betaLimits={betaLimits}
                      settings={resolvedSettings}
                      language={appData.settings.language}
                      aiAnalyses={aiAnalyses}
                      recentStatus={recentAnalysesStatus}
                      onAskQuestion={runAiQuestionWithConsent}
                      onCopyAnalysis={copyAnalysis}
                      onOpenHistoryList={openAnalysisHistoryList}
                      onOpenHistoryDetail={openAnalysisHistoryDetail}
                      onRetryRecent={retryRecentAnalyses}
                      onDeleteAnalysis={handleDeleteAiAnalysis}
                    />
                  ) : analysisRoute.kind === "history" ? (
                    <AnalysisHistoryListView
                      analyses={aiAnalyses}
                      language={appData.settings.language}
                      isDarkTheme={resolvedTheme === "dark"}
                      onBackToCoach={openAnalysisCoach}
                      onOpenDetail={openAnalysisHistoryDetail}
                      onDelete={handleDeleteAiAnalysis}
                    />
                  ) : (
                    <AnalysisHistoryDetailView
                      analysis={activeAnalysisHistoryEntry}
                      language={appData.settings.language}
                      isDarkTheme={resolvedTheme === "dark"}
                      onBackToHistory={openAnalysisHistoryList}
                      onBackToCoach={openAnalysisCoach}
                      onDelete={handleDeleteAiAnalysis}
                    />
                  )
                ) : null}

                {activeTab === "settings" ? (
                  <SettingsView
                    personalInfo={appData.personalInfo}
                    onUpdatePersonalInfo={updatePersonalInfo}
                    settings={appData.settings}
                    resolvedTheme={resolvedTheme}
                    language={appData.settings.language}
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
                    onCreateBackup={exportJson}
                    onImportData={importData}
                    onClearAllData={() => clearAllData()}
                    onResetOnboarding={() => {
                      const replayReport = reports[0] ?? null;
                      if (!replayReport) {
                        return;
                      }
                      setOnboardingEntryPoint("replay");
                      setOnboardingReport(replayReport);
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
                    onDeleteAccount={cloudAuth.deleteAccount}
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
        theme={resolvedTheme}
        configured={cloudAuth.configured}
        initialView={cloudAuthModalView}
        initialEmail={cloudAuthModalPrefillEmail}
        authStatus={cloudAuth.status}
        authError={cloudAuth.error}
        consentRequired={cloudAuth.status === "authenticated" && cloudAuth.consentStatus !== "granted"}
        privacyPolicyVersion={CLOUD_PRIVACY_POLICY_VERSION}
        onClose={closeCloudAuthModal}
        onSignInGoogle={handleCloudGoogleSignIn}
        onSignInEmail={handleCloudSignInEmail}
        onSignUpEmail={handleCloudSignUpEmail}
        onCompleteConsent={cloudAuth.completeConsent}
        onRequestVerificationEmail={handleCloudVerificationEmailRequest}
        onRequestPasswordResetEmail={handleCloudPasswordResetEmailRequest}
        onOpenView={openCloudAuthModal}
      />

      <AnimatePresence>
        {signupVerificationEmail ? (
          <motion.div
            className="app-modal-overlay z-[88]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeSignupVerificationModal}
          >
            <motion.div
              className="app-modal-shell w-full max-w-xl overflow-hidden border border-slate-700/80 bg-slate-950/95 shadow-[0_34px_110px_-52px_rgba(8,47,73,0.85)]"
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 6 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-slate-800 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] px-6 py-6 sm:px-7">
                <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {tr("Account created", "Account created")}
                </div>
                <div className="mx-auto mt-5 max-w-2xl text-center">
                  <h3 className="text-[1.9rem] font-semibold leading-tight text-slate-50 sm:text-[2.1rem]">
                    {tr("Bijna klaar", "You're almost done")}
                  </h3>
                  <p className="mt-3 text-base leading-7 text-slate-300">
                    {tr(
                      "Je account is aangemaakt. De laatste stap is je e-mailadres bevestigen via de mail die we net hebben gestuurd.",
                      "Your account was created. The final step is confirming your email with the message we just sent."
                    )}
                  </p>
                </div>
              </div>

              <div className="space-y-5 px-6 py-6 sm:px-7">
                <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 p-5">
                  <div className="flex flex-wrap items-center justify-center gap-2 text-center">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                      {tr("Verstuurd naar", "Sent to")}
                    </span>
                    <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-sm font-medium text-slate-100">
                      {signupVerificationEmail}
                    </span>
                  </div>

                  <div className="mt-5 space-y-3">
                    <div className="flex items-start justify-center gap-3 text-center">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-500/25 bg-cyan-500/10 text-xs font-semibold text-cyan-200">
                        1
                      </div>
                      <p className="max-w-xl text-sm leading-6 text-slate-300">
                        {tr(
                          "Open je inbox en klik op de verificatieknop in de mail van LabTracker.",
                          "Open your inbox and click the verification button in the email from LabTracker."
                        )}
                      </p>
                    </div>
                    <div className="flex items-start justify-center gap-3 text-center">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-500/25 bg-cyan-500/10 text-xs font-semibold text-cyan-200">
                        2
                      </div>
                      <p className="max-w-xl text-sm leading-6 text-slate-300">
                        {tr(
                          "Zie je niets binnen een minuut? Kijk dan ook in spam, ongewenst of promoties en markeer LabTracker als veilig.",
                          "If nothing shows up within a minute, also check spam, junk, or promotions and mark LabTracker as safe."
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800/90 bg-slate-950/75 px-4 py-3">
                  <p className="text-center text-xs leading-6 text-slate-400">
                    {tr(
                      "Je kunt LabTracker ondertussen gewoon in lokale modus blijven gebruiken.",
                      "You can keep using LabTracker in local mode while you wait."
                    )}
                  </p>
                  {signupVerificationResendNotice ? (
                    <p className="mt-2 text-center text-xs leading-6 text-cyan-200">{signupVerificationResendNotice}</p>
                  ) : null}
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-slate-50 disabled:cursor-not-allowed disabled:opacity-65"
                    onClick={() => {
                      void handleResendSignupVerificationEmail();
                    }}
                    disabled={signupVerificationResendBusy}
                  >
                    {signupVerificationResendBusy
                      ? tr("Bezig met versturen...", "Sending...")
                      : tr("Stuur e-mail opnieuw", "Resend email")}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-cyan-500/35 bg-cyan-500/12 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/60 hover:bg-cyan-500/18"
                    onClick={closeSignupVerificationModal}
                  >
                    {tr("Oké, ik check mijn mailbox", "Okay, I'll check my inbox")}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

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
        {showWellbeingReminderModal ? (
          <motion.div
            className="app-modal-overlay z-[89]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismissWellbeingReminder}
          >
            <motion.div
              className="app-modal-shell w-full max-w-sm bg-slate-900 p-4 shadow-soft"
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 6 }}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="wellbeing-reminder-title"
            >
              <h3 id="wellbeing-reminder-title" className="text-base font-semibold text-slate-100">
                {tr("Tijd voor een welzijn check-in", "Time for a wellbeing check-in")}
              </h3>
              <p className="mt-2 text-sm text-slate-300">
                {tr(
                  `${wellbeingReminderDays} dagen geleden deed je je laatste check-in. Een korte update helpt trends te koppelen aan je labwaarden.`,
                  `Your last check-in was ${wellbeingReminderDays} days ago. A quick update helps connect your wellbeing trends to your labs.`
                )}
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={dismissWellbeingReminder}
                  className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500"
                >
                  {tr("Later", "Later")}
                </button>
                <button
                  type="button"
                  onClick={handleOpenWellbeingCheckIn}
                  className="rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-sm font-medium text-cyan-100 hover:border-cyan-300/70 hover:bg-cyan-500/20"
                >
                  {tr("Nu check-in doen", "Do check-in now")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {pendingUndoAction ? (
          <motion.div
            className="fixed bottom-4 left-4 z-[90] w-[min(92vw,420px)] rounded-xl border border-cyan-500/40 bg-slate-900/95 p-3 shadow-soft"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-100">{pendingUndoAction.message}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {tr("Je kunt dit binnen 10 seconden ongedaan maken.", "You can undo this within 10 seconds.")}
                </p>
                <button
                  type="button"
                  onClick={applyUndoAction}
                  className="mt-2 inline-flex items-center rounded-md border border-cyan-500/45 bg-cyan-500/12 px-2.5 py-1 text-xs font-medium text-cyan-100 hover:border-cyan-300/70 hover:bg-cyan-500/20"
                >
                  {tr("Ongedaan maken", "Undo")}
                </button>
              </div>
              <button
                type="button"
                onClick={clearPendingUndoAction}
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
                  <p className="text-xs text-slate-400">{tr("Gedetailleerde biomarkergrafiek", "Detailed biomarker chart")}</p>
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
                    settings={resolvedSettings}
                    language={appData.settings.language}
                    phaseBlocks={dosePhaseBlocks}
                    height={460}
                    showYearHints
                    showValuePills
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
                  {tr("Biomarker review nodig", "Biomarker review needed")}
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  {tr(
                    "Deze biomarkers lijken mogelijk dubbel. Je kunt nu meteen mergen of later via Settings > Biomarker Manager.",
                    "These biomarkers may be duplicates. Merge now or do it later in Settings > Biomarker Manager."
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
                <h3 className="text-base font-semibold text-slate-100">{tr("Biomarker hernoemen", "Rename biomarker")}</h3>
                <p className="mt-1 text-xs text-slate-400">
                  {tr("Wijzigt alle rapporten met deze biomarker.", "This updates all reports containing this biomarker.")}
                </p>
              </div>
              <div className="px-4 py-3">
                <label className="block text-xs uppercase tracking-wide text-slate-400">{tr("Nieuwe biomarkernaam", "New biomarker name")}</label>
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
                    const targetCanonical = canonicalizeMarker(renameDialog.draftName);
                    const needsSpecimenOverride = !canMergeMarkersBySpecimen(
                      renameDialog.sourceCanonical,
                      targetCanonical
                    );
                    if (
                      needsSpecimenOverride &&
                      typeof window !== "undefined" &&
                      !window.confirm(
                        tr(
                          "Deze biomarker lijkt van een ander specimen (bijv. urine vs bloed). Doorgaan met handmatige override?",
                          "This biomarker appears to use a different specimen (for example urine vs blood). Continue with manual override?"
                        )
                      )
                    ) {
                      return;
                    }
                    remapMarkerAcrossReports(
                      renameDialog.sourceCanonical,
                      renameDialog.draftName,
                      needsSpecimenOverride
                    );
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

      {/* Profile choice after first successful upload */}
      <AnimatePresence>
        {showFirstReportProfilePicker && onboardingReport ? (
          <motion.div
            className="app-modal-overlay z-[92]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="first-report-profile-title"
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              className={`app-modal-shell w-full max-w-3xl p-4 sm:p-5 ${
                resolvedTheme === "light"
                  ? "border border-cyan-500/35 bg-white/95 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.45)]"
                  : "border border-cyan-500/40 bg-slate-900/95"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p
                    id="first-report-profile-title"
                    className={`text-lg font-semibold ${resolvedTheme === "light" ? "text-slate-900" : "text-cyan-100"}`}
                  >
                    {tr("Je rapport staat erin. Waar moeten we op focussen?", "Your report is in. What should we focus on?")}
                  </p>
                  <p className={`mt-1 text-sm ${resolvedTheme === "light" ? "text-slate-600" : "text-slate-300"}`}>
                    {tr(
                      "Kies nu je profiel zodat tabs, biomarkers en AI-context meteen op jouw situatie aansluiten.",
                      "Pick your profile now so tabs, biomarkers, and AI context match your situation."
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => continueFirstReportOnboarding()}
                  className={`rounded-md border px-2.5 py-1.5 text-xs ${
                    resolvedTheme === "light"
                      ? "border-slate-300 text-slate-700 hover:border-slate-400"
                      : "border-slate-600 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  {tr("Overslaan", "Skip")}
                </button>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {USER_PROFILES.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => continueFirstReportOnboarding(profile.id)}
                    className={`rounded-lg border p-3 text-left transition ${
                      resolvedTheme === "light"
                        ? "border-slate-300 bg-slate-50 hover:border-cyan-500/60 hover:bg-cyan-500/10"
                        : "border-slate-700 bg-slate-900/60 hover:border-cyan-400/60 hover:bg-cyan-500/10"
                    }`}
                  >
                    <p className={`text-sm font-semibold ${resolvedTheme === "light" ? "text-slate-900" : "text-slate-100"}`}>
                      {appData.settings.language === "nl" ? profile.labelNl : profile.labelEn}
                    </p>
                    <p className={`mt-1 text-xs leading-5 ${resolvedTheme === "light" ? "text-slate-600" : "text-slate-400"}`}>
                      {appData.settings.language === "nl" ? profile.descriptionNl : profile.descriptionEn}
                    </p>
                  </button>
                ))}
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
              theme={resolvedTheme}
              report={onboardingReport}
              personalInfo={appData.personalInfo}
              onUpdatePersonalInfo={updatePersonalInfo}
              onAddProtocol={addProtocol}
              onAddSupplementPeriod={addSupplementPeriod}
              onAddCheckIn={addCheckIn}
              onComplete={() => {
                setShowOnboardingWizard(false);
                setShowFirstReportProfilePicker(false);
                setOnboardingReport(null);
                setOnboardingEntryPoint(null);
                if (onboardingEntryPoint === "first_report") {
                  updateSettings({ onboardingCompleted: true });
                }
              }}
              onCancel={() => {
                setShowOnboardingWizard(false);
                setShowFirstReportProfilePicker(false);
                setOnboardingReport(null);
                setOnboardingEntryPoint(null);
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
