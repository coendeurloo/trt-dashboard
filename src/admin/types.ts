export interface AdminMe {
  userId: string;
  email: string;
  isAdmin: true;
}

export interface AdminOverview {
  totals: {
    totalAccounts: number;
    recentSignups7d: number;
    recentSignups30d: number;
    usersWithConsent: number;
    usersWithSyncedData: number;
    totalReports: number;
    totalCheckIns: number;
    totalProtocols: number;
  };
  activity: {
    latestSignupAt: string | null;
    lastSyncAt: string | null;
  };
  recentUsers: Array<{
    id: string;
    email: string;
    createdAt: string | null;
  }>;
}

export interface AdminServiceStatus {
  id: string;
  label: string;
  configured: boolean;
  healthy: boolean;
  detail: string;
}

export interface AdminEnvDiagnosticEntry {
  key: string;
  scope: "server" | "client";
  present: boolean;
}

export interface AdminSystemStatus {
  checkedAt: string;
  runtimeConfig: AdminRuntimeConfig;
  services: AdminServiceStatus[];
  keepalive: {
    enabled: boolean;
    effective: boolean;
    reason: string;
  };
  envDiagnostics: {
    entries: AdminEnvDiagnosticEntry[];
    warnings: string[];
  };
}

export interface AdminRuntimeConfig {
  upstashKeepaliveEnabled: boolean;
  cloudSignupEnabled: boolean;
  shareLinksEnabled: boolean;
  parserImprovementEnabled: boolean;
  aiAnalysisEnabled: boolean;
  updatedAt: string | null;
  updatedByUserId: string | null;
  updatedByEmail: string | null;
  source: "database" | "defaults";
}

export interface AdminUserLookupResult {
  query: string;
  user: {
    id: string;
    email: string | null;
    createdAt: string | null;
    lastSignInAt: string | null;
  } | null;
  summary?: {
    hasConsent: boolean;
    reportsCount: number;
    checkInsCount: number;
    protocolsCount: number;
    latestSyncRevision: number | null;
    latestSyncAt: string | null;
  };
  plan?: {
    plan: string | null;
    entitlements: string[];
  } | null;
}

export interface AdminAuditLogEntry {
  id: number;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  target: string;
  changes: Record<string, unknown>;
  createdAt: string;
}
