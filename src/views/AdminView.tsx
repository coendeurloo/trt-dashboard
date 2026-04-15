import { FormEvent, useCallback, useEffect, useState } from "react";
import { Loader2, RotateCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { trLocale } from "../i18n";
import { AppLanguage, AppSettings } from "../types";
import {
  fetchAdminAuditLog,
  fetchAdminMe,
  fetchAdminOverview,
  fetchAdminRuntimeConfig,
  fetchAdminSystemStatus,
  fetchAdminUserDirectory,
  fetchAdminUserLookup,
  updateAdminRuntimeConfig
} from "../admin/client";
import {
  AdminAuditLogEntry,
  AdminMe,
  AdminOverview,
  AdminRuntimeConfig,
  AdminSystemStatus,
  AdminUserDirectoryResult,
  AdminUserLookupResult
} from "../admin/types";
import { formatDate } from "../utils";
import AdminMetricCard from "../admin/components/AdminMetricCard";
import AdminPanel from "../admin/components/AdminPanel";
import AdminToggleRow from "../admin/components/AdminToggleRow";
import { captureAppMessage, isSentryClientEnabled } from "../monitoring/sentry";

interface AdminViewProps {
  language: AppLanguage;
  theme: AppSettings["theme"];
  authStatus: "loading" | "authenticated" | "unauthenticated" | "error";
  authError: string | null;
  accessToken: string | null;
  sessionEmail: string | null;
  onOpenCloudAuth: (view: "signin" | "signup") => void;
  onSignOut: () => Promise<void>;
}

const formatDateTime = (value: string | null): string => {
  if (!value) {
    return "-";
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleString();
};

const mapAdminErrorToMessage = (error: unknown, tr: (nl: string, en: string) => string): string => {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (/ADMIN_FORBIDDEN/i.test(raw)) {
    return tr(
      "Dit account staat niet in de admin allowlist.",
      "This account is not in the admin allowlist."
    );
  }
  if (/AUTH_REQUIRED/i.test(raw)) {
    return tr(
      "Je sessie is verlopen. Log opnieuw in.",
      "Your session expired. Please sign in again."
    );
  }
  if (/ADMIN_ALLOWLIST_MISSING/i.test(raw)) {
    return tr(
      "Serverconfig mist LABTRACKER_ADMIN_EMAILS.",
      "Server config is missing LABTRACKER_ADMIN_EMAILS."
    );
  }
  if (/SUPABASE_ENV_MISSING/i.test(raw)) {
    return tr(
      "Supabase env mist op de server.",
      "Supabase environment is missing on the server."
    );
  }
  return tr("Admin request mislukt. Probeer opnieuw.", "Admin request failed. Please retry.");
};

const renderChangeSummary = (entry: AdminAuditLogEntry): string => {
  const keys = Object.keys(entry.changes ?? {});
  if (keys.length === 0) {
    return "-";
  }
  return keys.join(", ");
};

type VerificationFunnelCounts = AdminOverview["verificationFunnel"]["last30d"];

const formatConversion = (current: number, previous: number): string => {
  if (previous <= 0) {
    return "-";
  }
  return `${Math.round((current / previous) * 100)}%`;
};

const resolveConversionTone = (current: number, previous: number): "neutral" | "good" | "warn" => {
  if (previous <= 0) {
    return "neutral";
  }
  const ratio = current / previous;
  if (ratio >= 0.7) {
    return "good";
  }
  if (ratio >= 0.4) {
    return "neutral";
  }
  return "warn";
};

const findLargestVerificationDrop = (
  counts: VerificationFunnelCounts,
  labels: ReadonlyArray<{ key: keyof VerificationFunnelCounts; label: string }>
): { from: string; to: string; conversion: string } | null => {
  let lowestRatio = Number.POSITIVE_INFINITY;
  let summary: { from: string; to: string; conversion: string } | null = null;

  for (let index = 1; index < labels.length; index += 1) {
    const previousKey = labels[index - 1].key;
    const currentKey = labels[index].key;
    const previous = counts[previousKey];
    const current = counts[currentKey];
    if (previous <= 0) {
      continue;
    }
    const ratio = current / previous;
    if (ratio < lowestRatio) {
      lowestRatio = ratio;
      summary = {
        from: labels[index - 1].label,
        to: labels[index].label,
        conversion: `${Math.round(ratio * 100)}%`
      };
    }
  }

  return summary;
};

const AdminView = ({
  language,
  theme,
  authStatus,
  authError,
  accessToken,
  sessionEmail,
  onOpenCloudAuth,
  onSignOut
}: AdminViewProps) => {
  const tr = useCallback((nl: string, en: string): string => trLocale(language, nl, en), [language]);

  const [adminMe, setAdminMe] = useState<AdminMe | null>(null);
  const [adminMeLoading, setAdminMeLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [systemStatus, setSystemStatus] = useState<AdminSystemStatus | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<AdminRuntimeConfig | null>(null);
  const [auditEntries, setAuditEntries] = useState<AdminAuditLogEntry[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [savingRuntime, setSavingRuntime] = useState(false);
  const [userDirectory, setUserDirectory] = useState<AdminUserDirectoryResult | null>(null);
  const [userDirectoryQuery, setUserDirectoryQuery] = useState("");
  const [userDirectoryLoading, setUserDirectoryLoading] = useState(false);
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<AdminUserLookupResult | null>(null);
  const [errorReportingNotice, setErrorReportingNotice] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  const isLightTheme = theme === "light";

  const loadAdminData = useCallback(
    async (token: string) => {
      setLoadingData(true);
      setAdminError("");
      try {
        const [nextOverview, nextSystemStatus, nextRuntimeConfig, nextAuditEntries, nextUserDirectory] = await Promise.all([
          fetchAdminOverview(token),
          fetchAdminSystemStatus(token),
          fetchAdminRuntimeConfig(token),
          fetchAdminAuditLog(token),
          fetchAdminUserDirectory(token, { limit: 250 })
        ]);
        setOverview(nextOverview);
        setSystemStatus(nextSystemStatus);
        setRuntimeConfig(nextRuntimeConfig);
        setAuditEntries(nextAuditEntries);
        setUserDirectory(nextUserDirectory);
      } catch (error) {
        setAdminError(mapAdminErrorToMessage(error, tr));
      } finally {
        setLoadingData(false);
      }
    },
    [tr]
  );

  useEffect(() => {
    if (authStatus !== "authenticated" || !accessToken) {
      setAdminMe(null);
      setOverview(null);
      setSystemStatus(null);
      setRuntimeConfig(null);
      setAuditEntries([]);
      setUserDirectory(null);
      return;
    }

    let cancelled = false;
    const hydrate = async () => {
      setAdminMeLoading(true);
      setAdminError("");
      try {
        const me = await fetchAdminMe(accessToken);
        if (cancelled) {
          return;
        }
        setAdminMe(me);
        await loadAdminData(accessToken);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setAdminMe(null);
        setAdminError(mapAdminErrorToMessage(error, tr));
      } finally {
        if (!cancelled) {
          setAdminMeLoading(false);
        }
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [accessToken, authStatus, loadAdminData, refreshTick, tr]);

  const handleRuntimeToggle = async (
    key:
      | "upstashKeepaliveEnabled"
      | "cloudSignupEnabled"
      | "shareLinksEnabled"
      | "parserImprovementEnabled"
      | "aiAnalysisEnabled",
    nextValue: boolean
  ) => {
    if (!accessToken || !runtimeConfig) {
      return;
    }
    setSavingRuntime(true);
    setAdminError("");
    try {
      const nextConfig = await updateAdminRuntimeConfig(accessToken, {
        [key]: nextValue
      });
      setRuntimeConfig(nextConfig);
      const [nextSystemStatus, nextAuditEntries] = await Promise.all([
        fetchAdminSystemStatus(accessToken),
        fetchAdminAuditLog(accessToken)
      ]);
      setSystemStatus(nextSystemStatus);
      setAuditEntries(nextAuditEntries);
    } catch (error) {
      setAdminError(mapAdminErrorToMessage(error, tr));
    } finally {
      setSavingRuntime(false);
    }
  };

  const handleLookupSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!accessToken || lookupQuery.trim().length < 2) {
      return;
    }
    setLookupLoading(true);
    setAdminError("");
    try {
      const result = await fetchAdminUserLookup(accessToken, lookupQuery.trim());
      setLookupResult(result);
    } catch (error) {
      setAdminError(mapAdminErrorToMessage(error, tr));
    } finally {
      setLookupLoading(false);
    }
  };

  const handleDirectorySubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!accessToken) {
      return;
    }
    setUserDirectoryLoading(true);
    setAdminError("");
    try {
      const nextDirectory = await fetchAdminUserDirectory(accessToken, {
        query: userDirectoryQuery.trim(),
        limit: 250
      });
      setUserDirectory(nextDirectory);
    } catch (error) {
      setAdminError(mapAdminErrorToMessage(error, tr));
    } finally {
      setUserDirectoryLoading(false);
    }
  };

  const handleDirectoryReset = async () => {
    if (!accessToken) {
      return;
    }
    setUserDirectoryQuery("");
    setUserDirectoryLoading(true);
    setAdminError("");
    try {
      const nextDirectory = await fetchAdminUserDirectory(accessToken, { limit: 250 });
      setUserDirectory(nextDirectory);
    } catch (error) {
      setAdminError(mapAdminErrorToMessage(error, tr));
    } finally {
      setUserDirectoryLoading(false);
    }
  };

  const handleSendBrowserTestEvent = () => {
    if (!isSentryClientEnabled()) {
      setErrorReportingNotice(
        tr(
          "Browser error reporting staat nog uit. Voeg eerst VITE_SENTRY_DSN toe.",
          "Browser error reporting is still off. Add VITE_SENTRY_DSN first."
        )
      );
      return;
    }

    captureAppMessage("Admin browser error reporting test", {
      tags: {
        flow: "admin_error_reporting_test",
        route: "admin"
      },
      extra: {
        language,
        theme
      },
      fingerprint: ["admin-browser-error-reporting-test"]
    });
    setErrorReportingNotice(
      tr(
        "Browser test-event verstuurd. In Sentry verschijnt dit meestal binnen een paar seconden.",
        "Browser test event sent. It usually appears in Sentry within a few seconds."
      )
    );
  };

  const topStatusCardClassName = isLightTheme
    ? "rounded-2xl border border-slate-200 bg-white p-4"
    : "rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4";

  const pageClassName = isLightTheme
    ? "min-h-screen bg-slate-100 px-3 py-4 text-slate-900 sm:px-5 lg:px-6"
    : "min-h-screen px-3 py-4 text-slate-100 sm:px-5 lg:px-6";

  const warningCount = systemStatus?.envDiagnostics.warnings.length ?? 0;
  const verificationStepLabels = [
    { key: "signupStarted", label: tr("Signup gestart", "Signup started") },
    { key: "verificationEmailsSent", label: tr("Mail verstuurd", "Email sent") },
    { key: "confirmPageViews", label: tr("Confirm geopend", "Confirm opened") },
    { key: "verifiedCompletions", label: tr("E-mail bevestigd", "Email verified") },
    { key: "firstVerifiedSignIns", label: tr("Eerste login", "First sign-in") }
  ] as const;
  const verificationLargestDrop = overview
    ? findLargestVerificationDrop(overview.verificationFunnel.last30d, verificationStepLabels)
    : null;

  if (authStatus === "loading" || adminMeLoading) {
    return (
      <div className={pageClassName}>
        <section className={topStatusCardClassName}>
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {tr("Admin laden...", "Loading admin...")}
          </div>
        </section>
      </div>
    );
  }

  if (authStatus !== "authenticated" || !accessToken) {
    return (
      <div className={pageClassName}>
        <section className={topStatusCardClassName}>
          <h1 className="text-lg font-semibold">{tr("Admin Ops Cockpit", "Admin Ops Cockpit")}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {tr(
              "Log in met je cloud account om de admin omgeving te openen.",
              "Sign in with your cloud account to open the admin area."
            )}
          </p>
          {authError ? <p className="mt-3 text-sm text-rose-300">{authError}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-sm font-medium text-cyan-100 hover:border-cyan-300/70 hover:bg-cyan-500/20"
              onClick={() => onOpenCloudAuth("signin")}
            >
              {tr("Sign in", "Sign in")}
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500"
              onClick={() => window.location.assign("/")}
            >
              {tr("Terug naar app", "Back to app")}
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (!adminMe) {
    return (
      <div className={pageClassName}>
        <section className={topStatusCardClassName}>
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 text-rose-300" />
            <div>
              <h1 className="text-lg font-semibold">{tr("Geen admin toegang", "No admin access")}</h1>
              <p className="mt-1 text-sm text-slate-400">{adminError || tr("Toegang geweigerd.", "Access denied.")}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500"
              onClick={() => void onSignOut()}
            >
              {tr("Uitloggen", "Sign out")}
            </button>
            <button
              type="button"
              className="rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-sm font-medium text-cyan-100 hover:border-cyan-300/70 hover:bg-cyan-500/20"
              onClick={() => window.location.assign("/")}
            >
              {tr("Open app", "Open app")}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={pageClassName}>
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <section className={topStatusCardClassName}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
                <ShieldCheck className="h-3 w-3" />
                {tr("Admin", "Admin")}
              </div>
              <h1 className="mt-2 text-xl font-semibold">{tr("Admin Ops Cockpit", "Admin Ops Cockpit")}</h1>
              <p className="mt-1 text-sm text-slate-400">
                {tr(
                  "Interne operationele omgeving met veilige runtime controls en support-overzicht.",
                  "Internal ops surface with safe runtime controls and support summary."
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {tr("Ingelogd als", "Signed in as")}: {sessionEmail ?? adminMe.email}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="#admin-users-directory"
                className="rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-sm font-medium text-cyan-100 hover:border-cyan-300/70 hover:bg-cyan-500/20"
              >
                {tr("Alle users", "All users")}
              </a>
              <button
                type="button"
                className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500"
                onClick={() => setRefreshTick((current) => current + 1)}
              >
                <span className="inline-flex items-center gap-1">
                  <RotateCw className={`h-3.5 w-3.5 ${loadingData ? "animate-spin" : ""}`} />
                  {tr("Ververs", "Refresh")}
                </span>
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500"
                onClick={() => window.location.assign("/")}
              >
                {tr("Open app", "Open app")}
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500"
                onClick={() => void onSignOut()}
              >
                {tr("Uitloggen", "Sign out")}
              </button>
            </div>
          </div>
          {adminError ? <p className="mt-3 text-sm text-rose-300">{adminError}</p> : null}
        </section>

        <AdminPanel
          title={tr("Overview", "Overview")}
          subtitle={tr("Kerncijfers voor accountactiviteit en cloud gebruik.", "Core stats for account activity and cloud usage.")}
        >
          {overview ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <AdminMetricCard label={tr("Accounts", "Accounts")} value={String(overview.totals.totalAccounts)} />
                <AdminMetricCard label={tr("Signups 7d", "Signups 7d")} value={String(overview.totals.recentSignups7d)} />
                <AdminMetricCard
                  label={tr("Users met consent", "Users with consent")}
                  value={String(overview.totals.usersWithConsent)}
                />
                <AdminMetricCard
                  label={tr("Users met sync data", "Users with synced data")}
                  value={String(overview.totals.usersWithSyncedData)}
                />
                <AdminMetricCard label={tr("Reports", "Reports")} value={String(overview.totals.totalReports)} />
                <AdminMetricCard label={tr("Check-ins", "Check-ins")} value={String(overview.totals.totalCheckIns)} />
                <AdminMetricCard label={tr("Protocols", "Protocols")} value={String(overview.totals.totalProtocols)} />
                <AdminMetricCard
                  label={tr("Laatste sync", "Last sync")}
                  value={overview.activity.lastSyncAt ? formatDate(overview.activity.lastSyncAt) : "-"}
                  tone={overview.activity.lastSyncAt ? "good" : "warn"}
                />
              </div>
              <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-900/40 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">{tr("Recente signups", "Recent signups")}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {overview.recentUsers.length > 0 ? (
                    overview.recentUsers.map((item) => (
                      <div key={item.id} className="rounded-lg border border-slate-700 bg-slate-950/40 p-2 text-xs text-slate-300">
                        <p className="truncate font-medium text-slate-100">{item.email}</p>
                        <p className="mt-0.5 text-slate-400">{item.createdAt ? formatDateTime(item.createdAt) : "-"}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400">{tr("Nog geen data", "No data yet")}</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">{tr("Geen overview data", "No overview data")}</p>
          )}
        </AdminPanel>

        <AdminPanel
          title={tr("Verification Funnel", "Verification funnel")}
          subtitle={tr(
            "Laatste 30 dagen van signup tot eerste echte login. Resends staan apart zodat je de echte drop-off ziet.",
            "Last 30 days from signup to first real sign-in. Resends are separate so you can spot the real drop-off."
          )}
        >
          {overview ? (
            <div className="space-y-3">
              {!overview.verificationFunnel.storeAvailable ? (
                <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-100">
                  {tr(
                    "Upstash metrics zijn nu niet beschikbaar. Deze funnel wordt weer gevuld zodra Redis terug is.",
                    "Upstash metrics are unavailable right now. This funnel will fill back in once Redis is reachable again."
                  )}
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {verificationStepLabels.map((step, index) => {
                  const last30dValue = overview.verificationFunnel.last30d[step.key];
                  const previousStep = index > 0 ? verificationStepLabels[index - 1] : null;
                  const previousValue = previousStep ? overview.verificationFunnel.last30d[previousStep.key] : 0;
                  const tone = previousStep
                    ? resolveConversionTone(last30dValue, previousValue)
                    : "neutral";

                  return (
                    <AdminMetricCard
                      key={step.key}
                      label={step.label}
                      value={String(last30dValue)}
                      tone={tone}
                    />
                  );
                })}
              </div>

              <div className="grid gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
                <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-3">
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {verificationStepLabels.map((step, index) => {
                      const last30dValue = overview.verificationFunnel.last30d[step.key];
                      const last7dValue = overview.verificationFunnel.last7d[step.key];
                      const previousStep = index > 0 ? verificationStepLabels[index - 1] : null;
                      const previousValue = previousStep ? overview.verificationFunnel.last30d[previousStep.key] : 0;
                      return (
                        <div key={`${step.key}-detail`} className="rounded-lg border border-slate-700 bg-slate-950/40 p-2 text-xs text-slate-300">
                          <p className="font-medium text-slate-100">{step.label}</p>
                          <p className="mt-1 text-slate-400">
                            {tr("30d", "30d")}: {last30dValue.toLocaleString()}
                          </p>
                          <p className="text-slate-400">
                            {tr("7d", "7d")}: {last7dValue.toLocaleString()}
                          </p>
                          <p className="text-slate-500">
                            {previousStep
                              ? `${tr("Van vorige stap", "From previous step")}: ${formatConversion(last30dValue, previousValue)}`
                              : tr("Start van de funnel", "Start of the funnel")}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-400">{tr("Resends", "Resends")}</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-100">
                      {overview.verificationFunnel.last30d.verificationResends.toLocaleString()}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {tr("Laatste 7 dagen", "Last 7 days")}:{" "}
                      {overview.verificationFunnel.last7d.verificationResends.toLocaleString()}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-3 text-xs text-slate-300">
                    <p className="font-medium uppercase tracking-wide text-slate-100">
                      {tr("Grootste drop", "Biggest drop")}
                    </p>
                    <p className="mt-2 text-slate-400">
                      {verificationLargestDrop
                        ? tr(
                            `${verificationLargestDrop.from} naar ${verificationLargestDrop.to}: ${verificationLargestDrop.conversion} conversie.`,
                            `${verificationLargestDrop.from} to ${verificationLargestDrop.to}: ${verificationLargestDrop.conversion} conversion.`
                          )
                        : tr(
                            "Nog niet genoeg data om een duidelijke drop-off te tonen.",
                            "Not enough data yet to show a clear drop-off."
                          )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">{tr("Geen funnel data", "No funnel data")}</p>
          )}
        </AdminPanel>

        <AdminPanel
          title={tr("Runtime Controls", "Runtime controls")}
          subtitle={tr("Veilige app-flags vanuit Supabase, zonder secret editing.", "Safe app-level flags from Supabase, no secret editing.")}
        >
          {runtimeConfig ? (
            <div className="space-y-2">
              <AdminToggleRow
                label={tr("Upstash keepalive", "Upstash keepalive")}
                description={tr(
                  "Stuurt dagelijkse traffic naar Upstash zodat free-tier minder snel inactive wordt.",
                  "Sends daily traffic to Upstash to reduce free-tier inactivity risk."
                )}
                checked={runtimeConfig.upstashKeepaliveEnabled}
                disabled={savingRuntime}
                onToggle={(next) => void handleRuntimeToggle("upstashKeepaliveEnabled", next)}
              />
              <AdminToggleRow
                label={tr("Cloud signup", "Cloud signup")}
                description={tr("Laat nieuwe cloud accounts toe.", "Allow new cloud account signups.")}
                checked={runtimeConfig.cloudSignupEnabled}
                disabled={savingRuntime}
                onToggle={(next) => void handleRuntimeToggle("cloudSignupEnabled", next)}
              />
              <AdminToggleRow
                label={tr("Share links", "Share links")}
                description={tr("Activeer of pauzeer share-link generatie.", "Enable or pause share-link generation.")}
                checked={runtimeConfig.shareLinksEnabled}
                disabled={savingRuntime}
                onToggle={(next) => void handleRuntimeToggle("shareLinksEnabled", next)}
              />
              <AdminToggleRow
                label={tr("Parser improvement", "Parser improvement")}
                description={tr(
                  "Staat parser-improvement inzendingen toe.",
                  "Allow parser improvement submissions."
                )}
                checked={runtimeConfig.parserImprovementEnabled}
                disabled={savingRuntime}
                onToggle={(next) => void handleRuntimeToggle("parserImprovementEnabled", next)}
              />
              <AdminToggleRow
                label={tr("AI analysis", "AI analysis")}
                description={tr("Zet AI analyse functionaliteit aan of uit.", "Toggle AI analysis functionality.")}
                checked={runtimeConfig.aiAnalysisEnabled}
                disabled={savingRuntime}
                onToggle={(next) => void handleRuntimeToggle("aiAnalysisEnabled", next)}
              />
              <p className="text-xs text-slate-500">
                {tr("Laatst gewijzigd", "Last updated")}: {formatDateTime(runtimeConfig.updatedAt)} | {tr("door", "by")} {runtimeConfig.updatedByEmail ?? "-"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">{tr("Geen runtime config", "No runtime config")}</p>
          )}
        </AdminPanel>

        <AdminPanel
          title={tr("System Health", "System health")}
          subtitle={tr("Status van kernservices en veilige env diagnostics.", "Status of core services and safe env diagnostics.")}
        >
          {systemStatus ? (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {systemStatus.services.map((service) => (
                  <article key={service.id} className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-100">{service.label}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                          service.configured && service.healthy
                            ? "border border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                            : service.configured
                              ? "border border-amber-400/40 bg-amber-500/10 text-amber-200"
                              : "border border-slate-500/40 bg-slate-500/10 text-slate-300"
                        }`}
                      >
                        {service.configured && service.healthy
                          ? tr("ok", "ok")
                          : service.configured
                            ? tr("degraded", "degraded")
                            : tr("missing", "missing")}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{service.detail}</p>
                  </article>
                ))}
              </div>

              <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">{tr("Env diagnostics", "Env diagnostics")}</p>
                <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                  {systemStatus.envDiagnostics.entries.map((entry) => (
                    <div key={entry.key} className="rounded-lg border border-slate-700 bg-slate-950/40 px-2 py-1 text-xs text-slate-300">
                      <p className="font-medium text-slate-100">{entry.key}</p>
                      <p className="text-slate-400">
                        {entry.scope === "server" ? tr("server", "server") : tr("client", "client")} | {entry.present ? tr("present", "present") : tr("missing", "missing")}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-2 rounded-lg border border-slate-700 bg-slate-950/40 p-2 text-xs">
                  <p className="font-medium text-slate-100">{tr("Warnings", "Warnings")}: {warningCount}</p>
                  {warningCount > 0 ? (
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-400">
                      {systemStatus.envDiagnostics.warnings.map((warning, index) => (
                        <li key={`${warning}-${index}`}>{warning}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-slate-400">{tr("Geen warnings", "No warnings")}</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">{tr("Geen system status", "No system status")}</p>
          )}
        </AdminPanel>

        <AdminPanel
          title={tr("Error Reporting", "Error reporting")}
          subtitle={tr(
            "Eenvoudig overzicht van je foutregistratie. Dit is je controlekamer, niet de volledige issue-lijst.",
            "Simple overview of your error reporting. This is your control room, not the full issue list."
          )}
        >
          {systemStatus?.errorReporting ? (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <AdminMetricCard
                  label={tr("Browser capture", "Browser capture")}
                  value={systemStatus.errorReporting.clientEnabled ? tr("Aan", "On") : tr("Uit", "Off")}
                  tone={systemStatus.errorReporting.clientEnabled ? "good" : "warn"}
                />
                <AdminMetricCard
                  label={tr("Server capture", "Server capture")}
                  value={systemStatus.errorReporting.serverEnabled ? tr("Aan", "On") : tr("Uit", "Off")}
                  tone={systemStatus.errorReporting.serverEnabled ? "good" : "warn"}
                />
                <AdminMetricCard
                  label={tr("Source maps", "Source maps")}
                  value={systemStatus.errorReporting.sourceMapsConfigured ? tr("Klaar", "Ready") : tr("Mist", "Missing")}
                  tone={systemStatus.errorReporting.sourceMapsConfigured ? "good" : "warn"}
                />
                <AdminMetricCard
                  label={tr("Omgeving", "Environment")}
                  value={systemStatus.errorReporting.environment ?? "-"}
                />
              </div>

              <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-3 text-sm text-slate-300">
                <p className="font-medium text-slate-100">{tr("Wat dit je oplevert", "What this gives you")}</p>
                <p className="mt-2 text-slate-400">
                  {tr(
                    "Als LabTracker stukloopt of een API-route faalt, krijg je eindelijk een nette foutmelding met stacktrace, release en flow-info in plaats van alleen 'het werkt niet'.",
                    "When LabTracker breaks or an API route fails, you finally get a clean error report with stack trace, release, and flow info instead of only 'it does not work'."
                  )}
                </p>
                <p className="mt-2 text-slate-400">
                  {tr(
                    "Privacy blijft streng: geen labwaarden, notities, symptomen, PDF-inhoud of share-tokens worden bewust meegestuurd.",
                    "Privacy stays strict: lab values, notes, symptoms, PDF contents, and share tokens are intentionally not sent along."
                  )}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {tr("Release", "Release")}: {systemStatus.errorReporting.release ?? "-"} | {tr("Privacy", "Privacy")}:{" "}
                  {systemStatus.errorReporting.privacyMode === "strict" ? tr("streng", "strict") : "-"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-sm font-medium text-cyan-100 hover:border-cyan-300/70 hover:bg-cyan-500/20"
                    onClick={handleSendBrowserTestEvent}
                  >
                    {tr("Stuur browser test-event", "Send browser test event")}
                  </button>
                  {systemStatus.errorReporting.dashboardUrl ? (
                    <a
                      href={systemStatus.errorReporting.dashboardUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500"
                    >
                      {tr("Open Sentry", "Open Sentry")}
                    </a>
                  ) : null}
                </div>
                {errorReportingNotice ? <p className="mt-2 text-xs text-cyan-200">{errorReportingNotice}</p> : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">{tr("Geen error reporting status", "No error reporting status")}</p>
          )}
        </AdminPanel>
        <div id="admin-users-directory">
        <AdminPanel
          title={tr("Alle users", "All users")}
          subtitle={tr(
            "Live userlijst vanuit Supabase Auth. Je ziet totaal users en e-mails direct hier.",
            "Live user list from Supabase Auth. You can see total users and emails directly here."
          )}
        >
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <AdminMetricCard
                  label={tr("Totaal users", "Total users")}
                  value={String(userDirectory?.totalUsers ?? 0)}
                />
                <AdminMetricCard
                  label={tr("Getoond", "Shown")}
                  value={String(userDirectory?.returnedUsers ?? 0)}
                />
                <AdminMetricCard
                  label={tr("Met consent", "With consent")}
                  value={String(overview?.totals.usersWithConsent ?? 0)}
                  tone={overview && overview.totals.usersWithConsent > 0 ? "good" : "neutral"}
                />
              </div>

              <form className="flex flex-wrap gap-2" onSubmit={handleDirectorySubmit}>
                <input
                  value={userDirectoryQuery}
                  onChange={(event) => setUserDirectoryQuery(event.target.value)}
                  className="min-w-[260px] flex-1 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  placeholder={tr("Filter op e-mail", "Filter by email")}
                />
                <button
                  type="submit"
                  disabled={userDirectoryLoading}
                  className="rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-2 text-sm font-medium text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {userDirectoryLoading ? tr("Laden...", "Loading...") : tr("Filter", "Filter")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDirectoryReset()}
                  disabled={userDirectoryLoading}
                  className="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {tr("Reset", "Reset")}
                </button>
              </form>

              <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-slate-900/40">
                <div className="grid grid-cols-[minmax(180px,2fr)_minmax(140px,1fr)_minmax(140px,1fr)] gap-2 border-b border-slate-700/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <span>{tr("E-mail", "Email")}</span>
                  <span>{tr("Aangemaakt", "Created")}</span>
                  <span>{tr("Laatste login", "Last sign-in")}</span>
                </div>
                <div className="max-h-[340px] overflow-y-auto">
                  {userDirectory && userDirectory.users.length > 0 ? (
                    userDirectory.users.map((user) => (
                      <div
                        key={user.id}
                        className="grid grid-cols-[minmax(180px,2fr)_minmax(140px,1fr)_minmax(140px,1fr)] gap-2 border-b border-slate-800/80 px-3 py-2 text-xs text-slate-300 last:border-b-0"
                      >
                        <span className="truncate text-slate-100">{user.email ?? "-"}</span>
                        <span>{formatDateTime(user.createdAt)}</span>
                        <span>{formatDateTime(user.lastSignInAt)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="px-3 py-4 text-sm text-slate-400">
                      {tr("Geen users gevonden voor dit filter.", "No users found for this filter.")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-700/70 bg-slate-900/35 p-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">{tr("User lookup", "User lookup")}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {tr(
                    "Zoek één gebruiker op e-mail voor een read-only supportsamenvatting.",
                    "Search one user by email for a read-only support summary."
                  )}
                </p>
              </div>

              <form className="flex flex-wrap gap-2" onSubmit={handleLookupSubmit}>
                <input
                  value={lookupQuery}
                  onChange={(event) => setLookupQuery(event.target.value)}
                  className="min-w-[220px] flex-1 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  placeholder={tr("bijv. user@email.com", "e.g. user@email.com")}
                />
                <button
                  type="submit"
                  disabled={lookupLoading || lookupQuery.trim().length < 2}
                  className="rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-2 text-sm font-medium text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {lookupLoading ? tr("Zoeken...", "Searching...") : tr("Zoek", "Lookup")}
                </button>
              </form>

              {lookupResult ? (
                <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-3 text-sm text-slate-300">
                  {lookupResult.user ? (
                    <div className="space-y-1.5">
                      <p><span className="text-slate-400">ID:</span> {lookupResult.user.id}</p>
                      <p><span className="text-slate-400">Email:</span> {lookupResult.user.email ?? "-"}</p>
                      <p><span className="text-slate-400">{tr("Aangemaakt", "Created")}:</span> {formatDateTime(lookupResult.user.createdAt)}</p>
                      <p><span className="text-slate-400">{tr("Laatste login", "Last sign-in")}:</span> {formatDateTime(lookupResult.user.lastSignInAt)}</p>
                      <p><span className="text-slate-400">{tr("Consent", "Consent")}:</span> {lookupResult.summary?.hasConsent ? tr("ja", "yes") : tr("nee", "no")}</p>
                      <p>
                        <span className="text-slate-400">{tr("Data", "Data")}:</span> {lookupResult.summary?.reportsCount ?? 0} reports, {lookupResult.summary?.checkInsCount ?? 0} check-ins, {lookupResult.summary?.protocolsCount ?? 0} protocols
                      </p>
                      <p>
                        <span className="text-slate-400">{tr("Laatste sync", "Latest sync")}:</span> {formatDateTime(lookupResult.summary?.latestSyncAt ?? null)}
                      </p>
                      <p>
                        <span className="text-slate-400">{tr("Plan", "Plan")}:</span> {lookupResult.plan?.plan ?? "-"}
                        {lookupResult.plan?.entitlements?.length ? ` | ${lookupResult.plan.entitlements.join(", ")}` : ""}
                      </p>
                    </div>
                  ) : (
                    <p>{tr("Geen gebruiker gevonden.", "No user found.")}</p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </AdminPanel>
        </div>

        <AdminPanel
          title={tr("Audit Log", "Audit log")}
          subtitle={tr("Historie van admin runtime wijzigingen.", "History of admin runtime changes.")}
        >
          <div className="space-y-2">
            {auditEntries.length > 0 ? (
              auditEntries.map((entry) => (
                <article key={entry.id} className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-3 text-xs text-slate-300">
                  <p className="font-medium text-slate-100">
                    {entry.action} | {entry.actorEmail ?? entry.actorUserId ?? "unknown"}
                  </p>
                  <p className="mt-1 text-slate-400">{renderChangeSummary(entry)}</p>
                  <p className="mt-1 text-slate-500">{formatDateTime(entry.createdAt)}</p>
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-400">{tr("Nog geen audit events", "No audit events yet")}</p>
            )}
          </div>
        </AdminPanel>
      </div>
    </div>
  );
};

export default AdminView;



