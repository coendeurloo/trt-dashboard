import { ReactNode, RefObject } from "react";
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  Cog,
  Gauge,
  Heart,
  Menu,
  Pill,
  Plus,
  SlidersHorizontal,
  Sparkles,
  X
} from "lucide-react";
import appIcon from "../../favicon.svg";
import labtrackerLogoDark from "../assets/labtracker-logo-dark.svg";
import labtrackerLogoLight from "../assets/labtracker-logo-light.svg";
import { APP_LANGUAGE_OPTIONS, getTabLabel, t } from "../i18n";
import { formatDate } from "../utils";
import { AppSettings, CompoundEntry, ParserStage, TabKey } from "../types";
import MobileNavDrawer from "./MobileNavDrawer";
import UploadPanel from "./UploadPanel";

export interface AppShellState {
  activeTab: TabKey;
  activeTabTitle: string;
  activeTabSubtitle: string | null;
  visibleTabKeys: Set<TabKey>;
  isMobileMenuOpen: boolean;
  quickUploadDisabled: boolean;
  language: AppSettings["language"];
  theme: AppSettings["theme"];
  isShareMode: boolean;
  isNl: boolean;
  sharedSnapshotGeneratedAt: string | null;
  hasReports: boolean;
  activeProtocolCompound: CompoundEntry | null;
  outOfRangeCount: number;
  reportsCount: number;
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
  onLanguageChange: (language: AppSettings["language"]) => void;
  onToggleTheme: () => void;
  onUploadFileSelected: (file: File) => void | Promise<void>;
  onUploadIntent: () => void;
  onStartManualEntry: () => void;
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
    visibleTabKeys,
    isMobileMenuOpen,
    quickUploadDisabled,
    language,
    theme,
    isShareMode,
    isNl,
    sharedSnapshotGeneratedAt,
    hasReports,
    activeProtocolCompound,
    outOfRangeCount,
    reportsCount
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
    onLanguageChange,
    onToggleTheme,
    onUploadFileSelected,
    onUploadIntent,
    onStartManualEntry
  } = actions;

  const renderTabButton = (key: TabKey, onAfterNavigate?: () => void) => {
    if (!visibleTabKeys.has(key)) {
      return null;
    }

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
          onRequestTabChange(key);
          onAfterNavigate?.();
        }}
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
          activeTab === key ? "bg-cyan-500/15 text-cyan-200" : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-100"
        }`}
      >
        {icon}
        <span>{getTabLabel(key, language)}</span>
        {key === "analysis" ? (
          <span className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-300 ring-1 ring-cyan-500/40">
            Pro
          </span>
        ) : null}
      </button>
    );
  };

  const renderNavigationSections = (onAfterNavigate?: () => void) => (
    <nav className="space-y-0.5">
      {visibleTabKeys.has("dashboard") || visibleTabKeys.has("reports") || visibleTabKeys.has("alerts") || visibleTabKeys.has("checkIns") ? (
        <>
          <p className="mb-1 mt-0 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Core</p>
          {renderTabButton("dashboard", onAfterNavigate)}
          {renderTabButton("checkIns", onAfterNavigate)}
          {renderTabButton("reports", onAfterNavigate)}
          {renderTabButton("alerts", onAfterNavigate)}
        </>
      ) : null}

      {visibleTabKeys.has("protocol") ||
      visibleTabKeys.has("supplements") ||
      visibleTabKeys.has("protocolImpact") ||
      visibleTabKeys.has("doseResponse") ? (
        <>
          <p className="mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Protocol</p>
          {renderTabButton("protocol", onAfterNavigate)}
          {renderTabButton("supplements", onAfterNavigate)}
          {renderTabButton("protocolImpact", onAfterNavigate)}
          {renderTabButton("doseResponse", onAfterNavigate)}
        </>
      ) : null}

      {visibleTabKeys.has("analysis") ? (
        <>
          <p className="mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Pro</p>
          {renderTabButton("analysis", onAfterNavigate)}
        </>
      ) : null}

      {visibleTabKeys.has("settings") ? (
        <div className="mt-3 border-t border-slate-800 pt-3">{renderTabButton("settings", onAfterNavigate)}</div>
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

  const renderUploadPanelCard = (containerClassName: string) => {
    if (isShareMode || reportsCount === 0) {
      return null;
    }

    return (
      <div ref={uploadPanelRef} className={containerClassName}>
        <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">{t(language, "uploadPdf")}</p>
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
          className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:border-cyan-500/50 hover:text-cyan-200"
          onClick={onStartManualEntry}
        >
          <Plus className="h-4 w-4" /> {t(language, "addManualValue")}
        </button>
        {uploadError ? (
          <div className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {uploadError}
          </div>
        ) : null}
        {uploadNotice ? (
          <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            {uploadNotice}
          </div>
        ) : null}
      </div>
    );
  };

  const renderSidebarContent = ({
    includeUploadPanel,
    onAfterNavigate
  }: {
    includeUploadPanel: boolean;
    onAfterNavigate?: () => void;
  }) => {
    return (
      <>
        <div className="brand-card mb-4 rounded-xl bg-gradient-to-br from-cyan-400/20 to-emerald-400/15 p-3">
          <img
            src={theme === "dark" ? labtrackerLogoDark : labtrackerLogoLight}
            alt="LabTracker"
            className="brand-logo mx-auto w-full max-w-[230px]"
          />
          {hasReports && activeProtocolCompound ? (
            <div className="sidebar-protocol-card mt-3 rounded-xl border border-slate-700/50 bg-slate-900/50 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{tr("Huidig protocol", "Current protocol")}</p>
              <p className="mt-1 truncate text-[13px] font-semibold text-slate-200">
                {activeProtocolCompound.name} {activeProtocolCompound.doseMg} mg
              </p>
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

        {renderNavigationSections(onAfterNavigate)}

        {isShareMode ? renderShareSnapshotCard() : null}
        {!isShareMode && includeUploadPanel
          ? renderUploadPanelCard("mt-4 rounded-xl border border-slate-700 bg-slate-900/80 p-3")
          : null}
      </>
    );
  };

  return (
    <div className="min-h-screen px-3 py-4 text-slate-100 sm:px-5 lg:px-6">
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
        onClose={onCloseMobileMenu}
      >
        <div className="rounded-2xl border border-slate-700/70 bg-slate-900/80 p-3">
          {renderSidebarContent({ includeUploadPanel: false, onAfterNavigate: onCloseMobileMenu })}
        </div>
      </MobileNavDrawer>

      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 lg:flex-row">
        <aside className="hidden w-full rounded-2xl border border-slate-700/70 bg-slate-900/70 p-3 lg:sticky lg:top-4 lg:block lg:w-72 lg:self-start">
          {renderSidebarContent({ includeUploadPanel: true })}
        </aside>

        <main className="min-w-0 flex-1 space-y-3" id="dashboard-export-root">
          <header className="space-y-3 px-1 py-0.5">
            <div className="flex items-center gap-2 lg:hidden">
              <button
                type="button"
                aria-expanded={isMobileMenuOpen}
                aria-controls="mobile-nav-drawer"
                aria-label={isMobileMenuOpen ? tr("Menu sluiten", "Close menu") : tr("Menu openen", "Open menu")}
                title={isMobileMenuOpen ? tr("Menu sluiten", "Close menu") : tr("Menu openen", "Open menu")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-600 bg-slate-900/80 text-slate-200 hover:border-cyan-500/60 hover:text-cyan-200"
                onClick={onToggleMobileMenu}
              >
                {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
              <img
                src={appIcon}
                alt="LabTracker"
                className="h-6 w-6 shrink-0 rounded-md border border-slate-700/70 bg-slate-900/75 p-0.5"
              />
              <p className="min-w-0 truncate text-sm font-semibold text-slate-100">{activeTabTitle}</p>
              <div className="flex-1" />
              <button
                type="button"
                className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                  quickUploadDisabled
                    ? "cursor-not-allowed border-slate-700 bg-slate-900/60 text-slate-500"
                    : "border-cyan-500/45 bg-cyan-500/12 text-cyan-100 hover:border-cyan-400/70 hover:bg-cyan-500/20"
                }`}
                onClick={onQuickUpload}
                disabled={quickUploadDisabled}
              >
                <Plus className="h-3.5 w-3.5" />
                {tr("Snelle upload", "Quick Upload")}
              </button>
            </div>
            {activeTabSubtitle ? <p className="text-xs text-slate-400 lg:hidden">{activeTabSubtitle}</p> : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="hidden lg:block">
                <h2 className="text-base font-semibold text-slate-100 sm:text-lg">{activeTabTitle}</h2>
                {activeTabSubtitle ? <p className="text-sm text-slate-400">{activeTabSubtitle}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <label className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/70 px-2 py-1 text-xs text-slate-300">
                  <span>{tr("Taal", "Language")}:</span>
                  <select
                    value={language}
                    onChange={(event) => onLanguageChange(event.target.value as AppSettings["language"])}
                    className="rounded border border-slate-600 bg-slate-900 px-1.5 py-0.5 text-xs text-slate-200 outline-none"
                  >
                    {APP_LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="theme-toggle"
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
          </header>

          {activeTab === "dashboard"
            ? renderUploadPanelCard("lg:hidden rounded-xl border border-slate-700 bg-slate-900/80 p-3")
            : null}

          {children}
        </main>
      </div>
    </div>
  );
};

export default AppShell;
