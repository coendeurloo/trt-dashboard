import { ReactNode, RefObject } from "react";
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  Cog,
  Gauge,
  Heart,
  Lock,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
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
import { getPersonaNavSectionLabel, getPersonaSidebarCurrentLabel, getPersonaStabilityShortLabel, getPersonaTabLabel } from "../personaConfig";
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
}

export interface AppShellHeaderStat {
  id: string;
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "warning";
}

export interface AppShellUploadState {
  uploadPanelRef: RefObject<HTMLDivElement>;
  hiddenUploadInputRef: RefObject<HTMLInputElement>;
  isProcessing: boolean;
  uploadStage: ParserStage | null;
  uploadError: string;
  uploadNotice: string;
}

export interface AppShellActions {
  onRequestTabChange: (tab: TabKey) => void;
  onToggleMobileMenu: () => void;
  onCloseMobileMenu: () => void;
  onQuickUpload: () => void;
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
    latestReportDate,
    markersTrackedCount,
    stabilityScore,
    activeProtocolCompound,
    outOfRangeCount,
    reportsCount,
    appMode = "local",
    syncStatus = "idle",
    cloudConfigured = false,
    cloudAuthStatus = "unauthenticated",
    cloudUserEmail = null,
    headerStats = [],
    sidebarCollapsedDesktop = false
  } = shellState;
  const {
    uploadPanelRef,
    hiddenUploadInputRef,
    isProcessing,
    uploadStage,
    uploadError,
    uploadNotice
  } = uploadState;
  const {
    onRequestTabChange,
    onToggleMobileMenu,
    onCloseMobileMenu,
    onQuickUpload,
    onToggleTheme,
    onUploadFileSelected,
    onUploadIntent,
    onStartManualEntry,
    onOpenCloudAuth,
    onToggleDesktopSidebar
  } = actions;

  const tabIsLockedDuringOnboarding = (key: TabKey) =>
    isOnboardingLocked && key !== "dashboard";
  const isLightTheme = theme === "light";
  const stabilityLabel = getPersonaStabilityShortLabel(userProfile, language);
  const protocolSectionLabel = getPersonaNavSectionLabel(userProfile, language);
  const currentPlanLabel = getPersonaSidebarCurrentLabel(userProfile, language);
  const showDashboardStabilityBadge = activeTab === "dashboard" && hasReports && !isReviewMode;
  const shouldShowHeaderStats = !isReviewMode && headerStats.length > 0;

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
        <ClipboardList className="h-4 w-4" />
      ) : key === "analysis" ? (
        <Sparkles className="h-4 w-4" />
      ) : (
        <Cog className="h-4 w-4" />
      );

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
        className={`flex w-full items-center ${compact ? "justify-center px-2" : "gap-2 px-3"} rounded-lg py-2 text-sm transition ${
          isLocked
            ? "cursor-not-allowed border border-slate-800/80 text-slate-500 opacity-75"
            : activeTab === key
              ? "bg-cyan-500/15 text-cyan-200"
              : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-100"
        }`}
      >
        {icon}
        {!compact ? <span>{tabLabel}</span> : null}
        {!compact && isLocked ? (
          <span className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded border border-slate-700/80 bg-slate-900/70 text-slate-500">
            <Lock className="h-3 w-3" />
          </span>
        ) : null}
        {!compact && key === "analysis" ? (
          <span className={`${isLocked ? "" : "ml-auto"} rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-300 ring-1 ring-cyan-500/40`}>
            Pro
          </span>
        ) : null}
      </button>
    );
  };

  const renderNavigationSections = (onAfterNavigate?: () => void, compact = false) => (
    <nav className="space-y-0.5">
      {visibleTabKeys.has("dashboard") || visibleTabKeys.has("reports") || visibleTabKeys.has("alerts") || visibleTabKeys.has("checkIns") ? (
        <>
          {!compact ? (
            <p className={`mb-1 mt-0 px-3 text-[10px] font-semibold uppercase tracking-widest ${isOnboardingLocked ? "text-slate-500" : "text-slate-600"}`}>
              {tr("Kern", "Core")}
            </p>
          ) : null}
          {renderTabButton("dashboard", onAfterNavigate, compact)}
          {renderTabButton("checkIns", onAfterNavigate, compact)}
          {renderTabButton("reports", onAfterNavigate, compact)}
          {renderTabButton("alerts", onAfterNavigate, compact)}
        </>
      ) : null}

      {visibleTabKeys.has("protocol") ||
      visibleTabKeys.has("supplements") ||
      visibleTabKeys.has("protocolImpact") ||
      visibleTabKeys.has("doseResponse") ? (
        <>
          {!compact ? (
            <p className={`mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-widest ${isOnboardingLocked ? "text-slate-500" : "text-slate-600"}`}>
              {protocolSectionLabel}
            </p>
          ) : null}
          {renderTabButton("protocol", onAfterNavigate, compact)}
          {renderTabButton("supplements", onAfterNavigate, compact)}
          {renderTabButton("protocolImpact", onAfterNavigate, compact)}
          {renderTabButton("doseResponse", onAfterNavigate, compact)}
        </>
      ) : null}

      {visibleTabKeys.has("analysis") ? (
        <>
          {!compact ? (
            <p className={`mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-widest ${isOnboardingLocked ? "text-slate-500" : "text-slate-600"}`}>
              {tr("Pro", "Pro")}
            </p>
          ) : null}
          {renderTabButton("analysis", onAfterNavigate, compact)}
        </>
      ) : null}

      {visibleTabKeys.has("settings") ? (
        <div className={`mt-3 border-t border-slate-800 pt-3 ${compact ? "px-1" : ""}`}>{renderTabButton("settings", onAfterNavigate, compact)}</div>
      ) : null}
    </nav>
  );

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
        const valueClassName =
          stat.tone === "positive"
            ? "text-emerald-300"
            : stat.tone === "warning"
              ? "text-amber-300"
              : isLightTheme
                ? "text-slate-900"
                : "text-slate-100";
        return (
          <span
            key={stat.id}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
              isLightTheme ? "border-slate-300 bg-white text-slate-600" : "border-slate-700/70 bg-slate-900/55 text-slate-400"
            }`}
          >
            <strong className={valueClassName}>{stat.value}</strong>
            <span>{stat.label}</span>
          </span>
        );
      })}
    </div>
  );

  const renderUploadShortcut = (compact: boolean) => (
    <button
      type="button"
      onClick={onQuickUpload}
      disabled={quickUploadDisabled}
      title={tr("Upload PDF", "Upload PDF")}
      aria-label={tr("Upload PDF", "Upload PDF")}
      className={`inline-flex items-center justify-center rounded-lg border transition ${
        compact ? "h-10 w-10" : "w-full gap-2 px-3 py-2 text-sm"
      } ${
        quickUploadDisabled
          ? isLightTheme
            ? "cursor-not-allowed border-slate-300 bg-slate-100 text-slate-500"
            : "cursor-not-allowed border-slate-700 bg-slate-900/60 text-slate-500"
          : isLightTheme
            ? "border-cyan-500/45 bg-cyan-50 text-cyan-800 hover:border-cyan-500/70 hover:bg-cyan-100"
            : "border-cyan-500/45 bg-cyan-500/12 text-cyan-100 hover:border-cyan-400/70 hover:bg-cyan-500/20"
      }`}
    >
      <Upload className={compact ? "h-4 w-4" : "h-4 w-4"} />
      {!compact ? <span>{tr("Upload PDF", "Upload PDF")}</span> : null}
    </button>
  );

  const renderUploadPanelCard = (containerClassName: string) => {
    if (isShareMode) {
      return null;
    }

    return (
      <div ref={uploadPanelRef} className={containerClassName}>
        <p className={`mb-2 text-xs uppercase tracking-wide ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>
          {t(language, "uploadPdf")}
        </p>
        {hasReports ? (
          <>
            <UploadPanel
              isProcessing={isProcessing}
              processingStage={uploadStage}
              onFileSelected={(file) => {
                void onUploadFileSelected(file);
              }}
              onUploadIntent={onUploadIntent}
              language={language}
            />
            <button
              type="button"
              className={`mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md border px-3 py-2 text-sm ${
                isLightTheme
                  ? "border-slate-300 text-slate-700 hover:border-cyan-500/50 hover:text-cyan-700"
                  : "border-slate-600 text-slate-200 hover:border-cyan-500/50 hover:text-cyan-200"
              }`}
              onClick={onStartManualEntry}
            >
              <Plus className="h-4 w-4" /> {t(language, "addManualValue")}
            </button>
          </>
        ) : (
          renderUploadShortcut(false)
        )}
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
    );
  };

  const renderSidebarContent = ({
    includeUploadPanel,
    onAfterNavigate,
    compact
  }: {
    includeUploadPanel: boolean;
    onAfterNavigate?: () => void;
    compact?: boolean;
  }) => {
    const sidebarUploadPanel =
      !isShareMode && includeUploadPanel
        ? compact
          ? (
            <div className={isLightTheme ? "mt-4 flex justify-center rounded-xl border border-slate-200 bg-white p-2 shadow-sm" : "mt-4 flex justify-center rounded-xl border border-slate-700 bg-slate-900/80 p-2"}>
              {renderUploadShortcut(true)}
            </div>
          )
          : renderUploadPanelCard(
              isLightTheme
                ? "mt-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                : "mt-4 rounded-xl border border-slate-700 bg-slate-900/80 p-3"
            )
        : null;
    const showAccountTools = !isShareMode && cloudConfigured && !compact;
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
    return (
      <>
        <div className={`brand-card mb-4 rounded-xl bg-gradient-to-br from-cyan-400/20 to-emerald-400/15 ${compact ? "p-2.5" : "p-3"}`}>
          {!onAfterNavigate ? (
            <div className={`hidden items-center ${compact ? "justify-center" : "justify-end"} lg:flex`}>
              <button
                type="button"
                onClick={onToggleDesktopSidebar}
                title={sidebarCollapsedDesktop ? tr("Zijbalk uitklappen", "Expand sidebar") : tr("Zijbalk inklappen", "Collapse sidebar")}
                aria-label={sidebarCollapsedDesktop ? tr("Zijbalk uitklappen", "Expand sidebar") : tr("Zijbalk inklappen", "Collapse sidebar")}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-md border ${
                  isLightTheme
                    ? "border-slate-300 bg-white text-slate-600 hover:border-cyan-500/50 hover:text-cyan-700"
                    : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200"
                }`}
              >
                {sidebarCollapsedDesktop ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </button>
            </div>
          ) : null}
          <img
            src={theme === "dark" ? labtrackerLogoDark : labtrackerLogoLight}
            alt="LabTracker"
            className={`brand-logo mx-auto ${compact ? "mt-2 w-10" : "w-full max-w-[230px]"}`}
          />
          {showAccountTools ? (
            <div className="mt-2">
              {cloudAuthStatus === "authenticated" ? (
                <button
                  type="button"
                  onClick={() => {
                    onRequestTabChange("settings");
                    onAfterNavigate?.();
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                    isLightTheme
                      ? "border-slate-300 bg-white text-slate-700 hover:border-cyan-500/45 hover:text-cyan-700"
                      : "border-slate-700 bg-slate-900/65 text-slate-200 hover:border-cyan-500/45 hover:text-cyan-100"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${syncDotClassName}`} />
                  <span className="min-w-0 flex-1 truncate">{cloudUserEmail || tr("Cloud account", "Cloud account")}</span>
                  <span
                    className={`rounded-full border px-1.5 py-0.5 text-[10px] ${
                      isLightTheme ? "border-slate-300 bg-slate-50 text-slate-600" : "border-slate-700/80 bg-slate-900/70 text-slate-300"
                    }`}
                  >
                    {syncBadgeLabel}
                  </span>
                </button>
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
          {!compact && hasReports ? (
            <div
              className={`sidebar-protocol-card mt-3 rounded-xl border px-3 py-3 ${
                isLightTheme ? "border-slate-200 bg-white shadow-sm" : "border-slate-700/50 bg-slate-900/50"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {activeProtocolCompound ? currentPlanLabel : tr("Tracking", "Tracking")}
              </p>
              {activeProtocolCompound ? (
                <p className={`mt-1 truncate text-[13px] font-semibold ${isLightTheme ? "text-slate-900" : "text-slate-200"}`}>
                  {activeProtocolCompound.name} {activeProtocolCompound.dose}
                </p>
              ) : (
                <>
                  <p className={`mt-1 truncate text-[13px] font-semibold ${isLightTheme ? "text-slate-900" : "text-slate-200"}`}>
                    {tr(`${markersTrackedCount} markers gevolgd`, `${markersTrackedCount} markers tracked`)}
                  </p>
                  <p className={`mt-1 text-[11px] ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>
                    {latestReportDate
                      ? tr(`Laatste upload: ${formatDate(latestReportDate)}`, `Last upload: ${formatDate(latestReportDate)}`)
                      : tr("Nog geen uploads", "No uploads yet")}
                  </p>
                </>
              )}
              {outOfRangeCount > 0 ? (
                <p className="mt-2 inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                  {tr(
                    `${outOfRangeCount} marker${outOfRangeCount !== 1 ? "s" : ""} buiten bereik`,
                    `${outOfRangeCount} marker${outOfRangeCount !== 1 ? "s" : ""} out of range`
                  )}
                </p>
              ) : (
                <p className="mt-2 inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                  {tr("Alle markers binnen bereik", "All markers in range")}
                </p>
              )}
            </div>
          ) : null}
        </div>

        {renderNavigationSections(onAfterNavigate, compact)}
        {isShareMode && !compact ? renderShareSnapshotCard() : null}
        {sidebarUploadPanel}
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
    <div className={`min-h-screen px-3 py-4 ${isLightTheme ? "text-slate-900" : "text-slate-100"} sm:px-5 lg:px-6`}>
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
        <div className={isLightTheme ? "rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" : "rounded-2xl border border-slate-700/70 bg-slate-900/80 p-3"}>
          {renderSidebarContent({ includeUploadPanel: false, onAfterNavigate: onCloseMobileMenu, compact: false })}
        </div>
      </MobileNavDrawer>

      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 lg:flex-row">
        <aside
          className={
            isLightTheme
              ? `hidden w-full rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-4 lg:block ${sidebarCollapsedDesktop ? "lg:w-20" : "lg:w-72"} lg:self-start`
              : `hidden w-full rounded-2xl border border-slate-700/70 bg-slate-900/70 p-3 lg:sticky lg:top-4 lg:block ${sidebarCollapsedDesktop ? "lg:w-20" : "lg:w-72"} lg:self-start`
          }
        >
          {renderSidebarContent({ includeUploadPanel: true, compact: sidebarCollapsedDesktop })}
        </aside>

        <main className="min-w-0 flex-1 space-y-3" id="dashboard-export-root">
          <header className={`space-y-3 px-1 py-0.5 ${hideDashboardDesktopHeader ? "lg:hidden" : ""}`}>
            <div className="flex items-center gap-2 lg:hidden">
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
              <div className="flex-1" />
              {!isReviewMode ? (
                <button
                  type="button"
                    className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
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
                  {tr("Snelle upload", "Quick Upload")}
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
                      <div className="stability-header-tooltip pointer-events-none absolute bottom-full right-0 z-50 mb-2 w-72 max-w-[min(92vw,22rem)] rounded-xl border border-slate-700/90 bg-slate-950 p-3 text-xs leading-relaxed text-slate-300 opacity-0 shadow-2xl transition-opacity group-hover:opacity-100">
                        <p className="stability-tooltip-title font-semibold text-slate-100">{tr("Wat is dit?", "What is this?")}</p>
                        <p className="mt-1.5">
                          {tr(
                            "Dit meet hoe stabiel je hormoonmarkers zijn over je recente rapporten. Een hoge score betekent weinig schommeling â€” een teken dat je protocol goed aanslaat. Lagere scores wijzen op meer variatie, wat kan komen door timing van meting, dosiswijzigingen of andere factoren.",
                            "This measures how steady your hormone markers have been across your recent reports. A high score means little fluctuation â€” a sign your protocol is working well. Lower scores point to more variation, which can come from measurement timing, dose changes, or other factors."
                          )}
                        </p>
                        <p className="mt-2 text-[11px] text-slate-500">
                          {tr("80-100: stabiel Â· 60-79: matig Â· onder 60: wisselend", "80-100: stable Â· 60-79: moderate Â· below 60: variable")}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={onToggleTheme}
                    className="theme-toggle hidden lg:inline-flex"
                    aria-label={tr("Schakel thema", "Toggle theme")}
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
