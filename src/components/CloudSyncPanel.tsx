import { useCallback, useMemo, useState } from "react";
import { ArrowRight, Cloud, CloudOff, Loader2, RefreshCw } from "lucide-react";
import { trLocale } from "../i18n";
import { AppLanguage, AppMode, ThemeMode } from "../types";
import CloudSyncConflictModal from "./CloudSyncConflictModal";
import { mapCloudAuthErrorToMessage, mapCloudSyncErrorToMessage } from "../lib/cloudErrorMessages";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

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
  const tr = useCallback((nl: string, en: string): string => trLocale(language, nl, en), [language]);
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

  const displayError = useMemo(() => {
    if (localError) {
      return mapCloudSyncErrorToMessage(localError, tr);
    }
    if (syncError) {
      return mapCloudSyncErrorToMessage(syncError, tr);
    }
    if (authError) {
      return mapCloudAuthErrorToMessage(authError, tr);
    }
    return null;
  }, [authError, localError, syncError, tr]);

  return (
    <Card className="settings-card app-teal-glow-surface border-slate-700/70 bg-slate-900/60 p-4">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-100">{tr("Cloud Sync", "Cloud Sync")}</h2>
          <Badge variant="cyan">
            {modeBadge}
          </Badge>
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
        <Card className="mt-3">
          <CardContent className="p-4">
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
                  <Button
                    onClick={() => onOpenAuthModal("signup")}
                  >
                    {tr("Account maken", "Create account")}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onOpenAuthModal("signin")}
                  >
                    {tr("Ik heb al een account", "I already have an account")}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
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
            <Alert variant="warning">
              <AlertDescription className="flex flex-col gap-2">
                <p>
                  {tr(
                    "Rond je consent af om cloud sync en back-up te activeren.",
                    "Complete consent to enable cloud sync and backup."
                  )}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onCompleteConsent}
                >
                  {tr("Consent afronden", "Complete consent")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {!cloudEnabled ? (
              <Button
                onClick={onEnableCloud}
                disabled={isBusy || consentStatus !== "granted"}
                size="sm"
              >
                <Cloud className="h-4 w-4" />
                {tr("Cloud sync hervatten", "Resume cloud sync")}
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={onDisableCloud}
              disabled={!cloudEnabled || isBusy}
              size="sm"
            >
              <CloudOff className="h-4 w-4" />
              {tr("Lokaal-only modus", "Local-only mode")}
            </Button>
            <Button
              variant="outline"
              onClick={() => void run(onRefreshCloud)}
              disabled={isBusy}
              size="sm"
            >
              <RefreshCw className="h-4 w-4" />
              {tr("Ververs cloudstate", "Refresh cloud state")}
            </Button>
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
            <Alert variant="warning">
              <AlertDescription className="flex flex-col gap-2">
                <p>
                  {syncStatus === "error"
                    ? tr("De eerste cloud-upload is niet gelukt. Probeer het opnieuw.", "The first cloud upload did not finish. Try again.")
                    : tr("We zetten je lokale data automatisch in de cloud.", "We are automatically moving your local data into the cloud.")}
                </p>
                {syncStatus === "error" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void run(onUploadLocalData)}
                  >
                    {tr("Opnieuw proberen", "Try again")}
                  </Button>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onExportData}
            >
              {tr("Exporteer data (JSON)", "Export data (JSON)")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void run(onSignOut)}
              disabled={isBusy}
            >
              {tr("Uitloggen", "Sign out")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
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
            >
              {tr("Verwijder cloudaccount", "Delete cloud account")}
            </Button>
          </div>
        </div>
      ) : null}

        {isBusy ? (
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {tr("Bezig...", "Working...")}
          </p>
        ) : null}

        {displayError ? (
          <Alert variant="destructive" className="mt-2">
            <AlertDescription className="text-xs">{displayError}</AlertDescription>
          </Alert>
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
      </CardContent>
    </Card>
  );
};

export default CloudSyncPanel;
