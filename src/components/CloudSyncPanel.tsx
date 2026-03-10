import { useMemo, useState } from "react";
import { ArrowRight, Cloud, CloudOff, Loader2, RefreshCw } from "lucide-react";
import { trLocale } from "../i18n";
import { AppLanguage, AppMode, ThemeMode } from "../types";
import CloudSyncConflictModal from "./CloudSyncConflictModal";

type CloudAuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";
type CloudSyncStatus = "idle" | "loading" | "syncing" | "pending" | "error";
type CloudSyncAction = "none" | "upload_local" | "choose_source";

interface CloudSyncPanelProps {
  language: AppLanguage;
  theme: ThemeMode;
  appMode: AppMode;
  configured: boolean;
  authStatus: CloudAuthStatus;
  consentStatus: "loading" | "granted" | "required" | "error";
  cloudEnabled: boolean;
  userEmail: string | null;
  schemaVersionCompatible: boolean;
  syncStatus: CloudSyncStatus;
  lastSyncedAt: string | null;
  authError: string | null;
  syncError: string | null;
  actionRequired: CloudSyncAction;
  conflictDetected: boolean;
  onEnableCloud: () => void;
  onDisableCloud: () => void;
  onOpenAuthModal: (view: "signin" | "signup") => void;
  onCompleteConsent: () => void;
  onSignOut: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onExportData: () => void;
  onUploadLocalData: () => Promise<void>;
  onUseCloudCopy: () => void;
  onReplaceCloudWithLocal: () => Promise<void>;
  onRefreshCloud: () => Promise<void>;
}

const CloudSyncPanel = ({
  language,
  theme,
  appMode,
  configured,
  authStatus,
  consentStatus,
  cloudEnabled,
  userEmail,
  schemaVersionCompatible,
  syncStatus,
  lastSyncedAt,
  authError,
  syncError,
  actionRequired,
  conflictDetected,
  onEnableCloud,
  onDisableCloud,
  onOpenAuthModal,
  onCompleteConsent,
  onSignOut,
  onDeleteAccount,
  onExportData,
  onUploadLocalData,
  onUseCloudCopy,
  onReplaceCloudWithLocal,
  onRefreshCloud
}: CloudSyncPanelProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const isLightTheme = theme === "light";
  const [isBusy, setIsBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const modeBadge = useMemo(() => {
    if (appMode === "share") {
      return tr("Share (alleen lezen)", "Share (read-only)");
    }
    if (appMode === "cloud") {
      return tr("Cloud actief", "Cloud active");
    }
    return tr("Lokaal actief", "Local active");
  }, [appMode, tr]);

  const run = async (fn: () => Promise<void>) => {
    setIsBusy(true);
    setLocalError(null);
    try {
      await fn();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : tr("Actie mislukt.", "Action failed."));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="settings-card app-teal-glow-surface rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-100">{tr("Cloud Sync", "Cloud Sync")}</h2>
        <span className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2.5 py-0.5 text-xs text-cyan-200">
          {modeBadge}
        </span>
      </div>

      {!configured ? (
        <p className="mt-2 text-sm text-amber-200">
          {tr(
            "Cloud staat uit: voeg `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` toe om in te loggen.",
            "Cloud is disabled: set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to sign in."
          )}
        </p>
      ) : null}

      {configured && authStatus !== "authenticated" ? (
        <div
          className={`mt-3 rounded-2xl p-4 ${
            isLightTheme
              ? "border border-slate-300/80 bg-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
              : "border border-slate-700/80 bg-slate-950/45"
          }`}
        >
          {authStatus === "loading" ? (
            <p className="inline-flex items-center gap-2 text-sm text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              {tr("Cloud-account wordt gecontroleerd...", "Checking your cloud account...")}
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-100">
                {tr("Maak een account voor automatische cloud sync.", "Create an account for automatic cloud sync.")}
              </p>
              <p className="mt-1 text-sm text-slate-300">
                {tr(
                  "Cloud is optioneel. Zodra je inlogt, lopen back-up en sync vanzelf op de achtergrond.",
                  "Cloud is optional. Once you sign in, backup and sync run automatically in the background."
                )}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onOpenAuthModal("signup")}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                    isLightTheme
                      ? "border border-cyan-600/40 bg-cyan-500/20 text-cyan-900 hover:border-cyan-700/60 hover:bg-cyan-500/30"
                      : "border border-cyan-500/45 bg-cyan-500/15 text-cyan-100 hover:border-cyan-300/80 hover:bg-cyan-500/22"
                  }`}
                >
                  {tr("Account maken", "Create account")}
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuthModal("signin")}
                  className={`rounded-xl border px-4 py-2 text-sm transition ${
                    isLightTheme
                      ? "border-slate-300 text-slate-700 hover:border-slate-400 hover:text-slate-900"
                      : "border-slate-600 text-slate-200 hover:border-slate-500 hover:text-slate-50"
                  }`}
                >
                  {tr("Ik heb al een account", "I already have an account")}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {configured && authStatus === "authenticated" ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-slate-300">
            {tr("Ingelogd als", "Signed in as")} <span className="font-medium text-slate-100">{userEmail ?? "unknown"}</span>
          </p>
          <p className="text-xs text-slate-400">
            {consentStatus === "required"
              ? tr(
                  "Cloud sync wacht op verplichte privacy- en health-data consent.",
                  "Cloud sync is waiting for required privacy and health-data consent."
                )
              : cloudEnabled
                ? tr("Cloud sync staat aan en loopt automatisch op de achtergrond.", "Cloud sync is on and runs automatically in the background.")
                : tr("Cloud sync staat uit op dit apparaat.", "Cloud sync is off on this device.")}
          </p>
          {consentStatus === "required" ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
              <p>
                {tr(
                  "Rond je consent af om cloud sync en back-up te activeren.",
                  "Complete consent to enable cloud sync and backup."
                )}
              </p>
              <button
                type="button"
                onClick={onCompleteConsent}
                className="mt-2 rounded-md border border-amber-400/60 bg-amber-500/20 px-3 py-1.5 text-sm"
              >
                {tr("Consent afronden", "Complete consent")}
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {!cloudEnabled ? (
              <button
                type="button"
                onClick={onEnableCloud}
                disabled={isBusy || consentStatus !== "granted"}
                className="inline-flex items-center gap-1 rounded-md border border-cyan-500/45 bg-cyan-500/15 px-3 py-1.5 text-sm text-cyan-100 disabled:opacity-50"
              >
                <Cloud className="h-4 w-4" />
                {tr("Cloud sync hervatten", "Resume cloud sync")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onDisableCloud}
              disabled={!cloudEnabled || isBusy}
              className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-50"
            >
              <CloudOff className="h-4 w-4" />
              {tr("Lokaal-only modus", "Local-only mode")}
            </button>
            <button
              type="button"
              onClick={() => void run(onRefreshCloud)}
              disabled={isBusy}
              className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              {tr("Ververs cloudstate", "Refresh cloud state")}
            </button>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm text-slate-300">
            <p>
              {tr("Sync status", "Sync status")}: <span className="font-medium text-slate-100">{syncStatus}</span>
            </p>
            <p className="mt-1">
              {tr("Laatste sync", "Last sync")}:{" "}
              <span className="text-slate-100">{lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : tr("Nog niet", "Not yet")}</span>
            </p>
            {!schemaVersionCompatible ? (
              <p className="mt-2 text-rose-200">
                {tr("Schema mismatch gedetecteerd. Cloud sync is geblokkeerd.", "Schema mismatch detected. Cloud sync is blocked.")}
              </p>
            ) : null}
          </div>

          {actionRequired === "upload_local" ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
              <p>
                {syncStatus === "error"
                  ? tr("De eerste cloud-upload is niet gelukt. Probeer het opnieuw.", "The first cloud upload did not finish. Try again.")
                  : tr("We zetten je lokale data automatisch in de cloud.", "We are automatically moving your local data into the cloud.")}
              </p>
              {syncStatus === "error" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void run(onUploadLocalData)}
                    className="rounded-md border border-amber-400/60 bg-amber-500/20 px-3 py-1.5 text-sm"
                  >
                    {tr("Opnieuw proberen", "Try again")}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onExportData}
              className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200"
            >
              {tr("Exporteer data (JSON)", "Export data (JSON)")}
            </button>
            <button
              type="button"
              onClick={() => void run(onSignOut)}
              disabled={isBusy}
              className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-50"
            >
              {tr("Uitloggen", "Sign out")}
            </button>
            <button
              type="button"
              onClick={() =>
                void run(async () => {
                  const confirmed = window.confirm(
                    tr(
                      "Weet je zeker dat je je account en clouddata wilt verwijderen?",
                      "Are you sure you want to delete your account and cloud data?"
                    )
                  );
                  if (!confirmed) {
                    return;
                  }
                  await onDeleteAccount();
                })
              }
              disabled={isBusy}
              className="rounded-md border border-rose-700/70 bg-rose-900/30 px-3 py-1.5 text-sm text-rose-200 disabled:opacity-50"
            >
              {tr("Verwijder cloudaccount", "Delete cloud account")}
            </button>
          </div>
        </div>
      ) : null}

      {isBusy ? (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {tr("Bezig...", "Working...")}
        </p>
      ) : null}

      {authError || syncError || localError ? (
        <p className="mt-2 text-xs text-rose-200">{localError ?? syncError ?? authError}</p>
      ) : null}

      <CloudSyncConflictModal
        open={configured && authStatus === "authenticated" && actionRequired === "choose_source"}
        language={language}
        conflictDetected={conflictDetected}
        isBusy={isBusy}
        onUseCloudCopy={onUseCloudCopy}
        onReplaceCloudWithLocal={() => {
          void run(onReplaceCloudWithLocal);
        }}
        onUseLocalOnly={onDisableCloud}
      />
    </div>
  );
};

export default CloudSyncPanel;
