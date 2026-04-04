import { RuntimeConfigSnapshot } from "./adminRuntimeConfig.js";

export interface AdminEnvDiagnosticEntry {
  key: string;
  scope: "server" | "client";
  present: boolean;
}

export interface AdminEnvDiagnostics {
  entries: AdminEnvDiagnosticEntry[];
  warnings: string[];
}

export interface AdminErrorReportingStatus {
  clientEnabled: boolean;
  serverEnabled: boolean;
  sourceMapsConfigured: boolean;
  dashboardUrl: string | null;
  environment: string | null;
  release: string | null;
  privacyMode: "strict";
}

const trimEnv = (value: string | undefined): string => String(value ?? "").trim();

const isPresent = (value: string | undefined): boolean => trimEnv(value).length > 0;

const hasDangerousClientSecretExposure = (): string[] => {
  const riskyKeys = [
    "VITE_SUPABASE_SERVICE_ROLE_KEY",
    "VITE_UPSTASH_REDIS_REST_TOKEN",
    "VITE_CLAUDE_API_KEY",
    "VITE_GEMINI_API_KEY",
    "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY"
  ];

  return riskyKeys.filter((key) => isPresent(process.env[key]));
};

const resolveSentryDashboardUrl = (): string | null => {
  const explicitUrl = trimEnv(process.env.SENTRY_DASHBOARD_URL);
  if (explicitUrl) {
    return explicitUrl;
  }

  const org = trimEnv(process.env.SENTRY_ORG);
  const project = trimEnv(process.env.SENTRY_PROJECT).split(",")[0]?.trim() ?? "";
  if (!org || !project) {
    return null;
  }

  return `https://sentry.io/organizations/${org}/projects/${project}/`;
};

export const buildAdminEnvDiagnostics = (): AdminEnvDiagnostics => {
  const entries: AdminEnvDiagnosticEntry[] = [
    { key: "SUPABASE_URL", scope: "server", present: isPresent(process.env.SUPABASE_URL) },
    { key: "SUPABASE_ANON_KEY", scope: "server", present: isPresent(process.env.SUPABASE_ANON_KEY) },
    { key: "SUPABASE_SERVICE_ROLE_KEY", scope: "server", present: isPresent(process.env.SUPABASE_SERVICE_ROLE_KEY) },
    { key: "UPSTASH_REDIS_REST_URL", scope: "server", present: isPresent(process.env.UPSTASH_REDIS_REST_URL) },
    { key: "UPSTASH_REDIS_REST_TOKEN", scope: "server", present: isPresent(process.env.UPSTASH_REDIS_REST_TOKEN) },
    { key: "CLAUDE_API_KEY", scope: "server", present: isPresent(process.env.CLAUDE_API_KEY) },
    { key: "GEMINI_API_KEY", scope: "server", present: isPresent(process.env.GEMINI_API_KEY) },
    { key: "RESEND_API_KEY", scope: "server", present: isPresent(process.env.RESEND_API_KEY) },
    { key: "SHARE_LINK_SECRET_BASE64", scope: "server", present: isPresent(process.env.SHARE_LINK_SECRET_BASE64) },
    { key: "SHARE_PUBLIC_ORIGIN", scope: "server", present: isPresent(process.env.SHARE_PUBLIC_ORIGIN) },
    {
      key: "LABTRACKER_ADMIN_EMAILS",
      scope: "server",
      present: isPresent(process.env.LABTRACKER_ADMIN_EMAILS) || isPresent(process.env.LABTRACKTER_ADMIN_EMAILS)
    },
    { key: "SENTRY_DSN", scope: "server", present: isPresent(process.env.SENTRY_DSN) },
    { key: "SENTRY_AUTH_TOKEN", scope: "server", present: isPresent(process.env.SENTRY_AUTH_TOKEN) },
    { key: "SENTRY_ORG", scope: "server", present: isPresent(process.env.SENTRY_ORG) },
    { key: "SENTRY_PROJECT", scope: "server", present: isPresent(process.env.SENTRY_PROJECT) },
    { key: "VITE_SUPABASE_URL", scope: "client", present: isPresent(process.env.VITE_SUPABASE_URL) },
    { key: "VITE_SUPABASE_ANON_KEY", scope: "client", present: isPresent(process.env.VITE_SUPABASE_ANON_KEY) },
    { key: "VITE_SHARE_PUBLIC_ORIGIN", scope: "client", present: isPresent(process.env.VITE_SHARE_PUBLIC_ORIGIN) },
    { key: "VITE_SENTRY_DSN", scope: "client", present: isPresent(process.env.VITE_SENTRY_DSN) }
  ];

  const warnings: string[] = [];
  const hasServerSupabase =
    isPresent(process.env.SUPABASE_URL) &&
    isPresent(process.env.SUPABASE_ANON_KEY) &&
    isPresent(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasClientSupabase =
    isPresent(process.env.VITE_SUPABASE_URL) &&
    isPresent(process.env.VITE_SUPABASE_ANON_KEY);

  if (hasServerSupabase && !hasClientSupabase) {
    warnings.push("Supabase server keys are set, but VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.");
  }

  if (!isPresent(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    warnings.push("SUPABASE_SERVICE_ROLE_KEY is missing, admin API features will fail.");
  }

  if (!isPresent(process.env.UPSTASH_REDIS_REST_URL) || !isPresent(process.env.UPSTASH_REDIS_REST_TOKEN)) {
    warnings.push("Upstash Redis env is incomplete, share links and keepalive checks can degrade.");
  }

  if (isPresent(process.env.VITE_SENTRY_DSN) && !isPresent(process.env.SENTRY_AUTH_TOKEN)) {
    warnings.push("VITE_SENTRY_DSN is set, but SENTRY_AUTH_TOKEN is missing. Source maps will not upload.");
  }

  if (isPresent(process.env.VITE_SENTRY_DSN) && (!isPresent(process.env.SENTRY_ORG) || !isPresent(process.env.SENTRY_PROJECT))) {
    warnings.push("VITE_SENTRY_DSN is set, but SENTRY_ORG or SENTRY_PROJECT is missing for source map release setup.");
  }

  if (isPresent(process.env.SENTRY_DSN) && !isPresent(process.env.VITE_SENTRY_DSN)) {
    warnings.push("SENTRY_DSN is set for the server, but VITE_SENTRY_DSN is missing for browser error capture.");
  }

  const dangerousKeys = hasDangerousClientSecretExposure();
  if (dangerousKeys.length > 0) {
    warnings.push(`Potential secret exposure in client env: ${dangerousKeys.join(", ")}`);
  }

  return {
    entries,
    warnings
  };
};

export const buildAdminErrorReportingStatus = (): AdminErrorReportingStatus => ({
  clientEnabled: isPresent(process.env.VITE_SENTRY_DSN),
  serverEnabled: isPresent(process.env.SENTRY_DSN),
  sourceMapsConfigured:
    isPresent(process.env.SENTRY_AUTH_TOKEN) &&
    isPresent(process.env.SENTRY_ORG) &&
    isPresent(process.env.SENTRY_PROJECT),
  dashboardUrl: resolveSentryDashboardUrl(),
  environment:
    trimEnv(process.env.SENTRY_ENVIRONMENT) ||
    trimEnv(process.env.VERCEL_ENV) ||
    trimEnv(process.env.NODE_ENV) ||
    null,
  release:
    trimEnv(process.env.SENTRY_RELEASE) ||
    trimEnv(process.env.VITE_SENTRY_RELEASE) ||
    trimEnv(process.env.VERCEL_GIT_COMMIT_SHA) ||
    null,
  privacyMode: "strict"
});

export const runtimeConfigToEnvWarnings = (runtimeConfig: RuntimeConfigSnapshot): string[] => {
  const warnings: string[] = [];
  if (!runtimeConfig.cloudSignupEnabled) {
    warnings.push("Cloud sign-up is disabled by runtime config.");
  }
  if (!runtimeConfig.shareLinksEnabled) {
    warnings.push("Share links are disabled by runtime config.");
  }
  if (!runtimeConfig.aiAnalysisEnabled) {
    warnings.push("AI analysis is disabled by runtime config.");
  }
  if (!runtimeConfig.parserImprovementEnabled) {
    warnings.push("Parser improvement submission is disabled by runtime config.");
  }
  return warnings;
};
