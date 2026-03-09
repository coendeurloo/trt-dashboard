import { FormEvent, useMemo, useState } from "react";
import { Cloud, CloudOff, Loader2, RefreshCw } from "lucide-react";
import { trLocale } from "../i18n";
import { AppLanguage, AppMode } from "../types";
import CloudSyncConflictModal from "./CloudSyncConflictModal";

type CloudAuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";
type CloudSyncStatus = "idle" | "loading" | "syncing" | "pending" | "error";
type CloudSyncAction = "none" | "upload_local" | "choose_source";

interface CloudSyncPanelProps {
  language: AppLanguage;
  appMode: AppMode;
  configured: boolean;
  authStatus: CloudAuthStatus;
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
  onSignInGoogle: () => void;
  onSignInEmail: (email: string, password: string) => Promise<void>;
  onSignUpEmail: (email: string, password: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onUploadLocalData: () => Promise<void>;
  onUseCloudCopy: () => void;
  onReplaceCloudWithLocal: () => Promise<void>;
  onRefreshCloud: () => Promise<void>;
}

const CloudSyncPanel = ({
  language,
  appMode,
  configured,
  authStatus,
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
  onSignInGoogle,
  onSignInEmail,
  onSignUpEmail,
  onSignOut,
  onDeleteAccount,
  onUploadLocalData,
  onUseCloudCopy,
  onReplaceCloudWithLocal,
  onRefreshCloud
}: CloudSyncPanelProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  const submitSignIn = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      await onSignInEmail(email, password);
      setPassword("");
    });
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
        <div className="mt-3 space-y-3">
          <p className="text-sm text-slate-300">
            {tr("Log in om cloud sync tussen apparaten te activeren.", "Sign in to enable cloud sync across devices.")}
          </p>
          <form className="grid gap-2 sm:grid-cols-2" onSubmit={submitSignIn}>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
              required
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={tr("Wachtwoord", "Password")}
              className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
              required
            />
            <button
              type="submit"
              disabled={isBusy}
              className="rounded-md border border-cyan-500/45 bg-cyan-500/15 px-3 py-2 text-sm text-cyan-100 disabled:opacity-50"
            >
              {tr("Inloggen", "Sign in")}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                void run(async () => {
                  await onSignUpEmail(email, password);
                  setPassword("");
                });
              }}
              className="rounded-md border border-emerald-500/45 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100 disabled:opacity-50"
            >
              {tr("Account maken", "Create account")}
            </button>
          </form>
          <button
            type="button"
            onClick={onSignInGoogle}
            disabled={isBusy}
            className="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
          >
            {tr("Doorgaan met Google", "Continue with Google")}
          </button>
        </div>
      ) : null}

      {configured && authStatus === "authenticated" ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-slate-300">
            {tr("Ingelogd als", "Signed in as")} <span className="font-medium text-slate-100">{userEmail ?? "unknown"}</span>
          </p>
          <p className="text-xs text-slate-400">
            {cloudEnabled
              ? tr("Cloud sync staat aan en loopt automatisch op de achtergrond.", "Cloud sync is on and runs automatically in the background.")
              : tr("Cloud sync staat uit op dit apparaat.", "Cloud sync is off on this device.")}
          </p>
          <div className="flex flex-wrap gap-2">
            {!cloudEnabled ? (
              <button
                type="button"
                onClick={onEnableCloud}
                disabled={isBusy}
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
