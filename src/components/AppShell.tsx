import { ReactNode, RefObject } from "react";
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  Cog,
  FileText,
  Gauge,
  Heart,
  Lock,
  Menu,
  Pill,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X
} from "lucide-react";
import appIcon from "../../favicon.svg";
import labtrackerLogoDark from "../assets/labtracker-logo-dark.svg";
import labtrackerLogoLight from "../assets/labtracker-logo-light.svg";
import { getTabLabel, t } from "../i18n";
import { getPersonaStabilityShortLabel, getPersonaTabLabel } from "../personaConfig";
import { stabilityColor } from "../chartHelpers";
import { formatDate } from "../utils";
import { AppMode, AppSettings, CompoundEntry, ParserStage, TabKey, UserProfile } from "../types";
import MobileNavDrawer from "./MobileNavDrawer";
import UploadPanel from "./UploadPanel";

export interface AppShellState {
  activeTab: TabKey;
  activeTabTitle: string;
  activeTabSubtitle: string | null;
  isReviewMode: boolean;
  isOnboardingLocked: boolean;
  visibleTabKeys: Set<TabKey>;
  isMobileMenuOpen: boolean;
  quickUploadDisabled: boolean;
  language: AppSettings["language"];
  theme: AppSettings["theme"];
  userProfile: UserProfile;
  isShareMode: boolean;
  isNl: boolean;
  sharedSnapshotGeneratedAt: string | null;
  hasReports: boolean;
  latestReportDate: string | null;
  markersTrackedCount: number;
  stabilityScore: number | null;
  activeProtocolCompound: CompoundEntry | null;
  outOfRangeCount: number;
  reportsCount: number;
  appMode?: AppMode;
  syncStatus?: "idle" | "loading" | "syncing" | "pending" | "error";
  cloudConfigured?: boolean;
  cloudAuthStatus?: "loading" | "authenticated" | "unauthenticated" | "error";
  cloudUserEmail?: string | null;
  headerStats?: AppShellHeaderStat[];
  sidebarCollapsedDesktop?: boolean;
  interfaceDensity?: AppSettings["interfaceDensity"];
}

export interface AppShellHeaderStat {
  id: string;
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "warning";
  actionTab?: TabKey;
}

export interface AppShellUploadState {
  uploadPanelRef: RefObject<HTMLDivElement>;
  hiddenUploadInputRef: RefObject<HTMLInputElement>;
  isProcessing: boolean;
  uploadStage: ParserStage | null;
  uploadError: string;
  uploadNotice: string;
  isUploadPanelOpen: boolean;
}

export interface AppShellActions {
  onRequestTabChange: (tab: TabKey) => void;
  onToggleMobileMenu: () => void;
  onCloseMobileMenu: () => void;
  onQuickUpload: () => void;
  onOpenUploadPanel: () => void;
  onCloseUploadPanel: () => void;
  onToggleTheme: () => void;
  onUploadFileSelected: (file: File) => void | Promise<void>;
  onUploadIntent: () => void;
  onStartManualEntry: () => void;
  onOpenCloudAuth: (view: "signin" | "signup") => void;
  onToggleDesktopSidebar: () => void;
}

interface AppShellProps {
  shellState: AppShellState;
  uploadState: AppShellUploadState;
  actions: AppShellActions;
  tr: (nl: string, en: string) => string;
  children: ReactNode;
}

const AppShell = ({
  shellState,
  uploadState,
  actions,
  tr,
  children
}: AppShellProps) => {
  const {
    activeTab,
    activeTabTitle,
    activeTabSubtitle,
    isReviewMode,
    isOnboardingLocked,
    visibleTabKeys,
    isMobileMenuOpen,
    quickUploadDisabled,
    language,
    theme,
    userProfile,
    isShareMode,
    isNl,
    sharedSnapshotGeneratedAt,
    hasReports,
    stabilityScore,
    appMode = "local",
    syncStatus = "idle",
    cloudConfigured = false,
    cloudAuthStatus = "unauthenticated",
    cloudUserEmail = null,
    headerStats = [],
    interfaceDensity = "comfortable"
  } = shellState;
  const {
    hiddenUploadInputRef,
    isProcessing,
    uploadStage,
    uploadError,
    uploadNotice,
    isUploadPanelOpen
  } = uploadState;
  const {
    onRequestTabChange,
    onToggleMobileMenu,
    onCloseMobileMenu,
    onQuickUpload,
    onOpenUploadPanel,
    onCloseUploadPanel,
    onToggleTheme,
    onUploadFileSelected,
    onUploadIntent,
    onStartManualEntry,
    onOpenCloudAuth
  } = actions;

  const tabIsLockedDuringOnboarding = (key: TabKey) =>
    isOnboardingLocked && key !== "dashboard" && key !== "settings";
  const isLightTheme = theme === "light";
  const isCompactDensity = interfaceDensity === "compact";
  const stabilityLabel = getPersonaStabilityShortLabel(userProfile, language);
  const showDashboardStabilityBadge = activeTab === "dashboard" && hasReports && !isReviewMode;
  const shouldShowHeaderStats = !isReviewMode && headerStats.length > 0;
  const syncBadgeLabel =
    appMode !== "cloud"
      ? tr("Lokaal-only", "Local-only")
      : syncStatus === "idle"
        ? tr("Gesynct", "Synced")
        : syncStatus === "syncing" || syncStatus === "loading"
          ? tr("Synchroniseren", "Syncing")
          : syncStatus === "error"
            ? tr("Sync fout", "Sync error")
            : tr("Actie nodig", "Action needed");
  const syncDotClassName =
    appMode !== "cloud"
      ? "bg-slate-400"
      : syncStatus === "idle"
        ? "bg-emerald-300"
        : syncStatus === "syncing" || syncStatus === "loading"
          ? "bg-cyan-300"
          : syncStatus === "error"
            ? "bg-rose-300"
            : "bg-amber-300";
  const openSettingsLabel =
    syncStatus === "error"
      ? tr("Open Instellingen om sync te herstellen", "Open Settings to resolve sync")
      : tr("Open Instellingen", "Open Settings");
  const showCloudAuthEntryPoints = !isShareMode && (cloudConfigured || !import.meta.env.PROD);

  const renderTabButton = (key: TabKey, onAfterNavigate?: () => void, compact = false) => {
    if (!visibleTabKeys.has(key)) {
      return null;
    }

    const isLocked = tabIsLockedDuringOnboarding(key);
    const tabLabel = getPersonaTabLabel(userProfile, key, language, getTabLabel(key, language));
    const lockedTitle = tr("Upload je eerste PDF om deze sectie te ontgrendelen", "Upload your first PDF to unlock this section");
    const icon =
      key === "dashboard" ? (
        <BarChart3 className="h-4 w-4" />
      ) : key === "protocol" ? (
        <ClipboardList className="h-4 w-4" />
      ) : key === "supplements" ? (
        <Pill className="h-4 w-4" />
      ) : key === "protocolImpact" ? (
        <Gauge className="h-4 w-4" />
      ) : key === "doseResponse" ? (
        <SlidersHorizontal className="h-4 w-4" />
      ) : key === "checkIns" ? (
        <Heart className="h-4 w-4" />
      ) : key === "alerts" ? (
        <AlertTriangle className="h-4 w-4" />
      ) : key === "reports" ? (
        <FileText className="h-4 w-4" />
      ) : key === "analysis" ? (
        <Sparkles className="h-4 w-4" />
      ) : (
        <Cog className="h-4 w-4" />
      );

    const navStateClass = isLocked
      ? "cursor-not-allowed border border-l-transparent border-slate-800/80 text-slate-500 opacity-75"
      : activeTab === key
        ? isLightTheme
          ? "border-l-cyan-600 bg-gradient-to-r from-cyan-500/20 via-cyan-500/10 to-transparent text-cyan-900 shadow-[inset_0_0_0_1px_rgba(8,145,178,0.18),0_0_12px_rgba(6,182,212,0.12)]"
          : "border-l-cyan-300 bg-gradient-to-r from-cyan-500/22 via-cyan-500/10 to-transparent text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22),0_0_14px_rgba(34,211,238,0.15)]"
        : isLightTheme
          ? "border-l-transparent text-slate-700 hover:border-l-cyan-500 hover:bg-slate-100/90 hover:text-slate-900"
          : "border-l-transparent text-slate-300 hover:border-l-cyan-500/65 hover:bg-slate-800/75 hover:text-slate-100";

    return (
        <button
        key={key}
        type="button"
        onClick={() => {
          if (isLocked) {
            return;
          }
          onRequestTabChange(key);
          onAfterNavigate?.();
        }}
        disabled={isLocked}
        aria-disabled={isLocked}
        aria-label={tabLabel}
        title={isLocked ? `${tabLabel} - ${lockedTitle}` : tabLabel}
        className={`flex w-full items-center border-l-2 ${compact ? "justify-center px-2" : "gap-2 px-3"} rounded-lg py-2 text-sm transition-all duration-200 ease-out ${navStateClass}`}
      >
        <span className="shrink-0">{icon}</span>
        {!compact ? <span>{tabLabel}</span> : null}
        {!compact && isLocked ? (
          <span className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded border border-slate-700/80 bg-slate-900/70 text-slate-500">
            <Lock className="h-3 w-3" />
          </span>
        ) : null}
      </button>
    );
  };

  const renderNavigationSections = (onAfterNavigate?: () => void, compact = false) => {
    const labelClassName = isLightTheme
      ? "px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
      : "px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400";
    return (
      <nav className="space-y-1">
        <div>
          <p className={labelClassName}>{tr("Your data", "Your data")}</p>
          <div className="space-y-0.5">
            {renderTabButton("dashboard", onAfterNavigate, compact)}
            {renderTabButton("checkIns", onAfterNavigate, compact)}
            {renderTabButton("reports", onAfterNavigate, compact)}
            {renderTabButton("alerts", onAfterNavigate, compact)}
          </div>
        </div>

        <div className="mt-1">
          <p className={labelClassName}>{tr("Protocols", "Protocols")}</p>
          <div className="space-y-0.5">
            {renderTabButton("protocol", onAfterNavigate, compact)}
            {renderTabButton("supplements", onAfterNavigate, compact)}
            {renderTabButton("protocolImpact", onAfterNavigate, compact)}
            {renderTabButton("doseResponse", onAfterNavigate, compact)}
          </div>
        </div>

        <div className="mt-1">
          <p className={labelClassName}>AI</p>
          <div className="space-y-0.5">
            {renderTabButton("analysis", onAfterNavigate, compact)}
          </div>
        </div>

        <div className={`mt-5 space-y-1.5 border-t pt-3 ${isLightTheme ? "border-slate-200" : "border-slate-700/70"}`}>
          {renderUploadShortcut(compact)}
          <button
            type="button"
            onClick={onStartManualEntry}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
              isLightTheme
                ? "border-slate-300 bg-white text-slate-700 hover:border-cyan-500/50 hover:text-cyan-700"
                : "border-slate-700 bg-slate-900/60 text-slate-200 hover:border-cyan-500/50 hover:text-cyan-200"
            }`}
          >
            <Plus className="h-4 w-4" />
            {t(language, "addManualValue")}
          </button>
          {renderTabButton("settings", onAfterNavigate, compact)}
        </div>
      </nav>
    );
  };

  const renderShareSnapshotCard = () => (
    <div className="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-100">
      <p className="font-semibold">{tr("Read-only deellink-snapshot", "Read-only share snapshot")}</p>
      <p className="mt-1">
        {isNl
          ? "Bewerken, uploads, API-keys en lokale opslagwijzigingen zijn uitgeschakeld in deze weergave."
          : "Editing, uploads, API keys and local data writes are disabled in this view."}
      </p>
      {sharedSnapshotGeneratedAt ? (
        <p className="mt-1 text-cyan-200/80">
          {tr("Gegenereerd", "Generated")}: {formatDate(sharedSnapshotGeneratedAt)}
        </p>
      ) : null}
    </div>
  );

  const renderHeaderStats = () => (
    <div className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm">
      {headerStats.map((stat) => {
        const isInteractive = Boolean(stat.actionTab);
        const valueClassName =
          stat.tone === "positive"
            ? "text-emerald-300"
            : stat.tone === "warning"
              ? "text-amber-300"
              : isLightTheme
                ? "text-slate-900"
                : "text-slate-100";
        const baseClassName = `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
          isLightTheme ? "border-slate-300 bg-white text-slate-600" : "border-slate-700/70 bg-slate-900/55 text-slate-300"
        }`;
        if (!isInteractive) {
          return (
            <span key={stat.id} className={baseClassName}>
              <strong className={valueClassName}>{stat.value}</strong>
              <span>{stat.label}</span>
            </span>
          );
        }
        return (
          <button
            key={stat.id}
            type="button"
            onClick={() => onRequestTabChange(stat.actionTab!)}
            className={`${baseClassName} transition hover:border-cyan-500/55 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60`}
            aria-label={`${tr("Open", "Open")} ${stat.label}`}
            title={`${tr("Open", "Open")} ${stat.label}`}
          >
            <strong className={valueClassName}>{stat.value}</strong>
            <span>{stat.label}</span>
          </button>
        );
      })}
    </div>
  );

  const renderAccountStatusButton = (placement: "header" | "mobile", onAfterNavigate?: () => void) => (
    <button
      type="button"
      onClick={() => {
        onRequestTabChange("settings");
        onAfterNavigate?.();
      }}
      title={openSettingsLabel}
      aria-label={openSettingsLabel}
      className={
        placement === "header"
          ? `hidden max-w-[320px] items-center gap-2 rounded-full border px-2.5 py-1 text-left text-xs transition lg:inline-flex ${
              isLightTheme
                ? "border-slate-300 bg-white text-slate-700 hover:border-cyan-500/45 hover:text-cyan-700"
                : "border-slate-700 bg-slate-900/65 text-slate-100 hover:border-cyan-500/45 hover:text-cyan-100"
            }`
          : `flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
              isLightTheme
                ? "border-slate-300 bg-white text-slate-700 hover:border-cyan-500/45 hover:text-cyan-700"
                : "border-slate-700 bg-slate-900/65 text-slate-100 hover:border-cyan-500/45 hover:text-cyan-100"
            }`
      }
    >
      <span className={`h-2 w-2 rounded-full ${syncDotClassName}`} />
      <span className="min-w-0 flex-1 truncate">{cloudUserEmail || tr("Cloud account", "Cloud account")}</span>
      <span
        title={tr("Your data is synced across devices", "Your data is synced across devices")}
        className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${
          isLightTheme ? "border-slate-300 bg-slate-50 text-slate-700" : "border-slate-700/80 bg-slate-900/70 text-slate-200"
        }`}
      >
        {syncBadgeLabel}
      </span>
    </button>
  );

  const renderHeaderAuthLinks = () => (
    <div className="hidden items-center gap-2 lg:flex">
      <button
        type="button"
        onClick={() => onOpenCloudAuth("signup")}
        className={`rounded-md border px-2.5 py-1 text-xs transition ${
          isLightTheme
            ? "border-cyan-600/45 bg-cyan-500/20 font-medium text-cyan-900 hover:border-cyan-700/60 hover:bg-cyan-500/30"
            : "border-cyan-500/45 bg-cyan-500/10 text-cyan-100 hover:border-cyan-300/70 hover:bg-cyan-500/20"
        }`}
      >
        {tr("Sign up", "Sign up")}
      </button>
      <button
        type="button"
        onClick={() => onOpenCloudAuth("signin")}
        className={`rounded-md px-2 py-1 text-xs transition ${
          isLightTheme
            ? "font-medium text-slate-700 hover:text-slate-900"
            : "text-slate-300 hover:text-slate-100"
        }`}
      >
        {tr("Sign in", "Sign in")}
      </button>
    </div>
  );

  const renderUploadShortcut = (compact: boolean) => (
    <button
      type="button"
      onClick={onOpenUploadPanel}
      disabled={quickUploadDisabled}
      title={tr("Upload lab PDF", "Upload lab PDF")}
      aria-label={tr("Upload lab PDF", "Upload lab PDF")}
      className={`inline-flex items-center justify-center rounded-lg border transition ${
        compact ? "h-10 w-10" : "w-full gap-2 px-3 py-2 text-sm"
      } ${
        quickUploadDisabled
          ? isLightTheme
            ? "cursor-not-allowed border-slate-300 bg-slate-100 text-slate-500"
            : "cursor-not-allowed border-slate-700 bg-slate-900/60 text-slate-500"
          : isLightTheme
            ? "border-cyan-500/45 bg-transparent text-cyan-800 hover:border-cyan-500/70 hover:bg-cyan-50"
            : "border-cyan-500/45 bg-transparent text-cyan-100 hover:border-cyan-400/70 hover:bg-cyan-500/12"
      }`}
    >
      <Upload className={compact ? "h-4 w-4" : "h-4 w-4"} />
      {!compact ? <span>{tr("Upload lab PDF", "Upload lab PDF")}</span> : null}
    </button>
  );

  const renderSidebarContent = ({
    onAfterNavigate,
    compact
  }: {
    onAfterNavigate?: () => void;
    compact?: boolean;
  }) => {
    const showAccountTools = showCloudAuthEntryPoints && !compact && Boolean(onAfterNavigate);
    return (
      <>
        <div className={`brand-card mb-4 rounded-xl bg-gradient-to-br from-cyan-400/20 to-emerald-400/15 ${compact ? "p-2.5" : "p-3"}`}>
          <img
            src={theme === "dark" ? labtrackerLogoDark : labtrackerLogoLight}
            alt="LabTracker"
            className={`brand-logo mx-auto ${compact ? "mt-2 w-10" : "w-full max-w-[230px]"}`}
          />
          {showAccountTools ? (
            <div className="mt-2">
              {cloudAuthStatus === "authenticated" ? (
                renderAccountStatusButton("mobile", onAfterNavigate)
              ) : cloudAuthStatus === "loading" ? (
                <p className="text-center text-xs text-slate-300">{tr("Account check...", "Account check...")}</p>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenCloudAuth("signup")}
                    className={`rounded-md border px-2.5 py-1 text-xs transition ${
                      isLightTheme
                        ? "border-cyan-600/45 bg-cyan-500/20 font-medium text-cyan-900 hover:border-cyan-700/60 hover:bg-cyan-500/30"
                        : "border-cyan-500/45 bg-cyan-500/10 text-cyan-100 hover:border-cyan-300/70 hover:bg-cyan-500/20"
                    }`}
                  >
                    {tr("Sign up", "Sign up")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenCloudAuth("signin")}
                    className={`rounded-md px-2 py-1 text-xs transition ${
                      isLightTheme
                        ? "font-medium text-slate-700 hover:text-slate-900"
                        : "text-slate-300 hover:text-slate-100"
                    }`}
                  >
                    {tr("Sign in", "Sign in")}
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {renderNavigationSections(onAfterNavigate, compact)}
        {isShareMode && !compact ? renderShareSnapshotCard() : null}
      </>
    );
  };

  const hideDashboardDesktopHeader = isOnboardingLocked && activeTab === "dashboard" && !isReviewMode;
  const hideDashboardMobileTitle = hideDashboardDesktopHeader;
  const scrollToStabilityIndex = () => {
    const section = document.getElementById("dashboard-stability-index");
    if (!section) {
      return;
    }
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    if (section instanceof HTMLElement) {
      section.focus({ preventScroll: true });
    }
  };

  return (
    <div
      className={`min-h-screen max-w-full overflow-x-hidden ${isCompactDensity ? "px-2.5 py-3 sm:px-4 lg:px-5" : "px-3 py-4 sm:px-5 lg:px-6"} ${isLightTheme ? "text-slate-900" : "text-slate-100"}`}
    >
      <input
        ref={hiddenUploadInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file) {
            return;
          }
          void onUploadFileSelected(file);
        }}
      />
      <MobileNavDrawer
        open={isMobileMenuOpen}
        title={tr("Navigatie", "Navigation")}
        closeLabel={tr("Navigatie sluiten", "Close navigation")}
        onClose={onCloseMobileMenu}
      >
        <div
          className={
            isLightTheme
              ? `rounded-2xl border border-slate-200 bg-white shadow-sm ${isCompactDensity ? "p-2.5" : "p-3"}`
              : `rounded-2xl border border-slate-700/70 bg-slate-900/80 ${isCompactDensity ? "p-2.5" : "p-3"}`
          }
        >
          {renderSidebarContent({ onAfterNavigate: onCloseMobileMenu, compact: false })}
        </div>
      </MobileNavDrawer>

      {isUploadPanelOpen && !isShareMode ? (
        <div className="app-modal-overlay z-[72] p-3 sm:p-6" onClick={onCloseUploadPanel}>
          <div
            className={isLightTheme ? "app-modal-shell w-full max-w-lg border border-slate-200 bg-white p-4 shadow-soft" : "app-modal-shell w-full max-w-lg bg-slate-900 p-4 shadow-soft"}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-panel-title"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 id="upload-panel-title" className={isLightTheme ? "text-base font-semibold text-slate-900" : "text-base font-semibold text-slate-100"}>
                {tr("Upload lab PDF", "Upload lab PDF")}
              </h3>
              <button
                type="button"
                onClick={onCloseUploadPanel}
                className={isLightTheme ? "rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:border-slate-400" : "rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:border-slate-500"}
              >
                {tr("Sluiten", "Close")}
              </button>
            </div>

            <UploadPanel
              isProcessing={isProcessing}
              processingStage={uploadStage}
              onFileSelected={(file) => {
                void onUploadFileSelected(file);
                onCloseUploadPanel();
              }}
              onUploadIntent={onUploadIntent}
              language={language}
            />

            <button
              type="button"
              className={`mt-3 inline-flex w-full items-center justify-center gap-1 rounded-md border px-3 py-2 text-sm ${
                isLightTheme
                  ? "border-slate-300 text-slate-700 hover:border-cyan-500/50 hover:text-cyan-700"
                  : "border-slate-600 text-slate-200 hover:border-cyan-500/50 hover:text-cyan-200"
              }`}
              onClick={() => {
                onCloseUploadPanel();
                onStartManualEntry();
              }}
            >
              <Plus className="h-4 w-4" /> {t(language, "addManualValue")}
            </button>

            {uploadError ? (
              <div role="alert" aria-live="assertive" className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {uploadError}
              </div>
            ) : null}
            {uploadNotice ? (
              <div role="status" aria-live="polite" className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                {uploadNotice}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={`mx-auto flex w-full max-w-[1400px] flex-col ${isCompactDensity ? "gap-3" : "gap-4"} lg:flex-row`}>
        <aside
          className={
            isLightTheme
              ? `hidden w-full rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-4 lg:block ${isCompactDensity ? "p-2.5" : "p-3"} lg:w-72 lg:self-start`
              : `hidden w-full rounded-2xl border border-slate-700/70 bg-slate-900/70 lg:sticky lg:top-4 lg:block ${isCompactDensity ? "p-2.5" : "p-3"} lg:w-72 lg:self-start`
          }
        >
          {renderSidebarContent({ compact: false })}
        </aside>

        <main className={`min-w-0 flex-1 ${isCompactDensity ? "space-y-2.5" : "space-y-3"}`} id="dashboard-export-root">
          <header className={`${isCompactDensity ? "space-y-2.5" : "space-y-3"} min-w-0 px-1 py-0.5 ${hideDashboardDesktopHeader ? "lg:hidden" : ""}`}>
            <div className="flex min-w-0 items-center gap-2 lg:hidden">
              <button
                type="button"
                aria-expanded={isMobileMenuOpen}
                aria-controls="mobile-nav-drawer"
                aria-label={isMobileMenuOpen ? tr("Menu sluiten", "Close menu") : tr("Menu openen", "Open menu")}
                title={isMobileMenuOpen ? tr("Menu sluiten", "Close menu") : tr("Menu openen", "Open menu")}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-md border ${
                  isLightTheme
                    ? "border-slate-300 bg-white text-slate-700 hover:border-cyan-500/60 hover:text-cyan-700"
                    : "border-slate-600 bg-slate-900/80 text-slate-200 hover:border-cyan-500/60 hover:text-cyan-200"
                }`}
                onClick={onToggleMobileMenu}
              >
                {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
              <img
                src={appIcon}
                alt="LabTracker"
                className={`h-6 w-6 shrink-0 rounded-md border p-0.5 ${isLightTheme ? "border-slate-300 bg-white" : "border-slate-700/70 bg-slate-900/75"}`}
              />
              {!hideDashboardMobileTitle ? <p className={`min-w-0 truncate text-sm font-semibold ${isLightTheme ? "text-slate-900" : "text-slate-100"}`}>{activeTabTitle}</p> : null}
              <div className="min-w-0 flex-1" />
              {!isReviewMode ? (
                <button
                  type="button"
                    className={`inline-flex max-w-[42vw] shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                      quickUploadDisabled
                        ? isLightTheme
                          ? "cursor-not-allowed border-slate-300 bg-slate-100 text-slate-500"
                          : "cursor-not-allowed border-slate-700 bg-slate-900/60 text-slate-500"
                        : isLightTheme
                          ? "border-cyan-500/45 bg-cyan-50 text-cyan-800 hover:border-cyan-500/70 hover:bg-cyan-100"
                          : "border-cyan-500/45 bg-cyan-500/12 text-cyan-100 hover:border-cyan-400/70 hover:bg-cyan-500/20"
                    }`}
                  onClick={onQuickUpload}
                  disabled={quickUploadDisabled}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="truncate">{tr("Snelle upload", "Quick Upload")}</span>
                </button>
              ) : null}
            </div>
            {!isReviewMode && activeTabSubtitle ? <p className={`text-xs lg:hidden ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>{activeTabSubtitle}</p> : null}
            {!hideDashboardDesktopHeader ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                {!isReviewMode ? (
                  <div className="hidden lg:block">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className={`text-base font-semibold sm:text-lg ${isLightTheme ? "text-slate-900" : "text-slate-100"}`}>{activeTabTitle}</h2>
                      {shouldShowHeaderStats ? renderHeaderStats() : null}
                    </div>
                    {activeTabSubtitle ? <p className={`text-sm ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>{activeTabSubtitle}</p> : null}
                  </div>
                ) : (
                  <div className="hidden lg:block" />
                )}
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {showDashboardStabilityBadge && stabilityScore !== null ? (
                    <div className="group relative">
                      <button
                        type="button"
                        onClick={scrollToStabilityIndex}
                        aria-label={tr("Open stabiliteitsindex", "Open Stability Index")}
                        title={tr("Open stabiliteitsindex", "Open Stability Index")}
                        className="stability-header-pill inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-600/60 bg-slate-800/60 px-2.5 py-1 text-xs transition hover:border-slate-500/80 hover:bg-slate-800/90"
                      >
                        <span className="stability-pill-label text-slate-300">{stabilityLabel}</span>
                        <span className="font-semibold" style={{ color: stabilityColor(stabilityScore) }}>{stabilityScore}</span>
                      </button>
                      <div className="stability-header-tooltip pointer-events-none absolute right-0 top-full z-50 mt-2 w-72 max-w-[min(92vw,22rem)] rounded-xl border border-slate-700/90 bg-slate-950 p-3 text-xs leading-relaxed text-slate-300 opacity-0 shadow-2xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <p className="stability-tooltip-title font-semibold text-slate-100">{tr("Wat is dit?", "What is this?")}</p>
                        <p className="mt-1.5">
                          {tr(
                            "Dit meet hoe stabiel je hormoonbiomarkers zijn over je recente rapporten. Een hoge score betekent weinig schommeling, een teken dat je protocol goed aanslaat. Lagere scores wijzen op meer variatie, wat kan komen door timing van meting, dosiswijzigingen of andere factoren.",
                            "This measures how steady your hormone biomarkers have been across your recent reports. A high score means little fluctuation, a sign your protocol is working well. Lower scores point to more variation, which can come from measurement timing, dose changes, or other factors."
                          )}
                        </p>
                        <p className="mt-2 text-[11px] text-slate-400">
                          {tr("80-100: stabiel · 60-79: matig · onder 60: wisselend", "80-100: stable · 60-79: moderate · below 60: variable")}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  {showCloudAuthEntryPoints && cloudAuthStatus === "authenticated"
                    ? renderAccountStatusButton("header")
                    : showCloudAuthEntryPoints && cloudAuthStatus !== "authenticated" && cloudAuthStatus !== "loading"
                      ? renderHeaderAuthLinks()
                      : null}
                  <button
                    type="button"
                    onClick={onToggleTheme}
                    className="theme-toggle hidden lg:inline-flex"
                    aria-label={
                      theme === "dark"
                        ? tr("Schakel naar lichte modus", "Switch to light mode")
                        : tr("Schakel naar donkere modus", "Switch to dark mode")
                    }
                    title={tr("Thema wisselen", "Toggle theme")}
                  >
                    <span className="toggle-thumb">
                      <svg
                        className="theme-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <mask id="moon-mask">
                          <rect x="0" y="0" width="100%" height="100%" fill="white" />
                          <circle className="moon-cutout" cx="24" cy="0" r="8" fill="black" />
                        </mask>
                        <circle className="sun-core" cx="12" cy="12" r="5" mask="url(#moon-mask)" fill="currentColor" />
                        <g className="sun-beams" stroke="currentColor">
                          <line x1="12" y1="1" x2="12" y2="4" />
                          <line x1="12" y1="20" x2="12" y2="23" />
                          <line x1="4.22" y1="4.22" x2="6.34" y2="6.34" />
                          <line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
                          <line x1="1" y1="12" x2="4" y2="12" />
                          <line x1="20" y1="12" x2="23" y2="12" />
                          <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" />
                          <line x1="17.66" y1="6.34" x2="19.78" y2="4.22" />
                        </g>
                      </svg>
                    </span>
                  </button>
                </div>
              </div>
            ) : null}
          </header>

          {children}
        </main>
      </div>
    </div>
  );
};

export default AppShell;
