import {
  AdminApiError,
  AdminIdentity,
  SupabaseServerEnv,
  adminServiceFetch,
  fetchRestRows,
  parseResponseJsonOrThrow,
  resolveSupabaseEnv
} from "./supabaseAdmin.js";

interface AdminRuntimeConfigRow {
  id: number;
  upstash_keepalive_enabled: boolean;
  cloud_signup_enabled: boolean;
  share_links_enabled: boolean;
  parser_improvement_enabled: boolean;
  ai_analysis_enabled: boolean;
  updated_at: string | null;
  updated_by_user_id: string | null;
  updated_by_email: string | null;
}

interface AdminAuditLogRow {
  id: number;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  target: string;
  changes: Record<string, unknown>;
  created_at: string;
}

export interface RuntimeConfigFlags {
  upstashKeepaliveEnabled: boolean;
  cloudSignupEnabled: boolean;
  shareLinksEnabled: boolean;
  parserImprovementEnabled: boolean;
  aiAnalysisEnabled: boolean;
}

export interface RuntimeConfigSnapshot extends RuntimeConfigFlags {
  updatedAt: string | null;
  updatedByUserId: string | null;
  updatedByEmail: string | null;
  source: "database" | "defaults";
}

export interface RuntimeConfigAuditEntry {
  id: number;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  target: string;
  changes: Record<string, unknown>;
  createdAt: string;
}

const RUNTIME_CONFIG_ID = 1;

const DEFAULT_FLAGS: RuntimeConfigFlags = {
  upstashKeepaliveEnabled: true,
  cloudSignupEnabled: true,
  shareLinksEnabled: true,
  parserImprovementEnabled: true,
  aiAnalysisEnabled: true
};

const normalizeBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
  }
  return fallback;
};

const toSnapshot = (row: Partial<AdminRuntimeConfigRow> | null, source: RuntimeConfigSnapshot["source"]): RuntimeConfigSnapshot => {
  return {
    upstashKeepaliveEnabled: normalizeBoolean(row?.upstash_keepalive_enabled, DEFAULT_FLAGS.upstashKeepaliveEnabled),
    cloudSignupEnabled: normalizeBoolean(row?.cloud_signup_enabled, DEFAULT_FLAGS.cloudSignupEnabled),
    shareLinksEnabled: normalizeBoolean(row?.share_links_enabled, DEFAULT_FLAGS.shareLinksEnabled),
    parserImprovementEnabled: normalizeBoolean(row?.parser_improvement_enabled, DEFAULT_FLAGS.parserImprovementEnabled),
    aiAnalysisEnabled: normalizeBoolean(row?.ai_analysis_enabled, DEFAULT_FLAGS.aiAnalysisEnabled),
    updatedAt: typeof row?.updated_at === "string" ? row.updated_at : null,
    updatedByUserId: typeof row?.updated_by_user_id === "string" ? row.updated_by_user_id : null,
    updatedByEmail: typeof row?.updated_by_email === "string" ? row.updated_by_email : null,
    source
  };
};

const isMissingTableError = (error: unknown, table: string): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes("42p01") || message.includes(`relation \"${table.toLowerCase()}\"`) || message.includes(table.toLowerCase());
};

const readRuntimeRow = async (env: SupabaseServerEnv): Promise<AdminRuntimeConfigRow | null> => {
  const rows = await fetchRestRows<AdminRuntimeConfigRow>(
    env,
    "admin_runtime_config",
    "select=id,upstash_keepalive_enabled,cloud_signup_enabled,share_links_enabled,parser_improvement_enabled,ai_analysis_enabled,updated_at,updated_by_user_id,updated_by_email&limit=1&id=eq.1"
  );
  return rows[0] ?? null;
};

const upsertRuntimeRow = async (
  env: SupabaseServerEnv,
  payload: Partial<AdminRuntimeConfigRow>
): Promise<AdminRuntimeConfigRow> => {
  const response = await adminServiceFetch(env, "/rest/v1/admin_runtime_config?on_conflict=id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([
      {
        id: RUNTIME_CONFIG_ID,
        ...payload
      }
    ])
  });

  const rows = await parseResponseJsonOrThrow<AdminRuntimeConfigRow[]>(
    response,
    "ADMIN_RUNTIME_CONFIG_UPSERT_FAILED",
    "Could not save admin runtime configuration."
  );
  const row = rows[0];
  if (!row) {
    throw new AdminApiError(500, "ADMIN_RUNTIME_CONFIG_EMPTY", "Runtime configuration update returned no row.");
  }
  return row;
};

const insertAuditRow = async (
  env: SupabaseServerEnv,
  actor: AdminIdentity,
  changes: Record<string, unknown>
): Promise<void> => {
  const response = await adminServiceFetch(env, "/rest/v1/admin_audit_log", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      {
        actor_user_id: actor.userId,
        actor_email: actor.email,
        action: "runtime_config_updated",
        target: "admin_runtime_config",
        changes,
        created_at: new Date().toISOString()
      }
    ])
  });

  await parseResponseJsonOrThrow<unknown[]>(
    response,
    "ADMIN_AUDIT_LOG_INSERT_FAILED",
    "Could not write admin audit log row."
  );
};

const buildDiff = (
  previous: RuntimeConfigSnapshot,
  next: RuntimeConfigSnapshot
): Record<string, { from: boolean; to: boolean }> => {
  const diff: Record<string, { from: boolean; to: boolean }> = {};
  const mappings: Array<[keyof RuntimeConfigFlags, keyof RuntimeConfigFlags]> = [
    ["upstashKeepaliveEnabled", "upstashKeepaliveEnabled"],
    ["cloudSignupEnabled", "cloudSignupEnabled"],
    ["shareLinksEnabled", "shareLinksEnabled"],
    ["parserImprovementEnabled", "parserImprovementEnabled"],
    ["aiAnalysisEnabled", "aiAnalysisEnabled"]
  ];

  mappings.forEach(([key]) => {
    if (previous[key] !== next[key]) {
      diff[key] = {
        from: previous[key],
        to: next[key]
      };
    }
  });

  return diff;
};

const patchToRowPayload = (patch: Partial<RuntimeConfigFlags>) => ({
  upstash_keepalive_enabled: patch.upstashKeepaliveEnabled,
  cloud_signup_enabled: patch.cloudSignupEnabled,
  share_links_enabled: patch.shareLinksEnabled,
  parser_improvement_enabled: patch.parserImprovementEnabled,
  ai_analysis_enabled: patch.aiAnalysisEnabled
});

export const getDefaultRuntimeConfig = (): RuntimeConfigSnapshot => ({
  ...DEFAULT_FLAGS,
  updatedAt: null,
  updatedByUserId: null,
  updatedByEmail: null,
  source: "defaults"
});

export const getRuntimeConfig = async (env: SupabaseServerEnv): Promise<RuntimeConfigSnapshot> => {
  try {
    const row = await readRuntimeRow(env);
    if (!row) {
      try {
        const inserted = await upsertRuntimeRow(env, {
          upstash_keepalive_enabled: DEFAULT_FLAGS.upstashKeepaliveEnabled,
          cloud_signup_enabled: DEFAULT_FLAGS.cloudSignupEnabled,
          share_links_enabled: DEFAULT_FLAGS.shareLinksEnabled,
          parser_improvement_enabled: DEFAULT_FLAGS.parserImprovementEnabled,
          ai_analysis_enabled: DEFAULT_FLAGS.aiAnalysisEnabled,
          updated_at: new Date().toISOString(),
          updated_by_user_id: null,
          updated_by_email: null
        });
        return toSnapshot(inserted, "database");
      } catch (insertError) {
        if (isMissingTableError(insertError, "admin_runtime_config")) {
          return getDefaultRuntimeConfig();
        }
        throw insertError;
      }
    }
    return toSnapshot(row, "database");
  } catch (error) {
    if (isMissingTableError(error, "admin_runtime_config")) {
      return getDefaultRuntimeConfig();
    }
    throw error;
  }
};

export const getRuntimeConfigWithFallback = async (): Promise<RuntimeConfigSnapshot> => {
  try {
    const env = resolveSupabaseEnv();
    return await getRuntimeConfig(env);
  } catch {
    return getDefaultRuntimeConfig();
  }
};

export const updateRuntimeConfig = async (
  actor: AdminIdentity,
  patch: Partial<RuntimeConfigFlags>
): Promise<RuntimeConfigSnapshot> => {
  const current = await getRuntimeConfig(actor.env);
  const nextPayload: RuntimeConfigFlags = {
    upstashKeepaliveEnabled:
      typeof patch.upstashKeepaliveEnabled === "boolean"
        ? patch.upstashKeepaliveEnabled
        : current.upstashKeepaliveEnabled,
    cloudSignupEnabled:
      typeof patch.cloudSignupEnabled === "boolean"
        ? patch.cloudSignupEnabled
        : current.cloudSignupEnabled,
    shareLinksEnabled:
      typeof patch.shareLinksEnabled === "boolean"
        ? patch.shareLinksEnabled
        : current.shareLinksEnabled,
    parserImprovementEnabled:
      typeof patch.parserImprovementEnabled === "boolean"
        ? patch.parserImprovementEnabled
        : current.parserImprovementEnabled,
    aiAnalysisEnabled:
      typeof patch.aiAnalysisEnabled === "boolean"
        ? patch.aiAnalysisEnabled
        : current.aiAnalysisEnabled
  };

  const savedRow = await upsertRuntimeRow(actor.env, {
    ...patchToRowPayload(nextPayload),
    updated_at: new Date().toISOString(),
    updated_by_user_id: actor.userId,
    updated_by_email: actor.email
  });

  const saved = toSnapshot(savedRow, "database");
  const diff = buildDiff(current, saved);
  if (Object.keys(diff).length > 0) {
    await insertAuditRow(actor.env, actor, diff);
  }
  return saved;
};

export const sanitizeRuntimeConfigPatch = (payload: unknown): Partial<RuntimeConfigFlags> => {
  if (!payload || typeof payload !== "object") {
    return {};
  }
  const input = payload as Record<string, unknown>;
  const patch: Partial<RuntimeConfigFlags> = {};

  if (typeof input.upstashKeepaliveEnabled === "boolean") {
    patch.upstashKeepaliveEnabled = input.upstashKeepaliveEnabled;
  }
  if (typeof input.cloudSignupEnabled === "boolean") {
    patch.cloudSignupEnabled = input.cloudSignupEnabled;
  }
  if (typeof input.shareLinksEnabled === "boolean") {
    patch.shareLinksEnabled = input.shareLinksEnabled;
  }
  if (typeof input.parserImprovementEnabled === "boolean") {
    patch.parserImprovementEnabled = input.parserImprovementEnabled;
  }
  if (typeof input.aiAnalysisEnabled === "boolean") {
    patch.aiAnalysisEnabled = input.aiAnalysisEnabled;
  }

  return patch;
};

export const listRuntimeConfigAuditLog = async (env: SupabaseServerEnv): Promise<RuntimeConfigAuditEntry[]> => {
  const rows = await fetchRestRows<AdminAuditLogRow>(
    env,
    "admin_audit_log",
    "select=id,actor_user_id,actor_email,action,target,changes,created_at&order=created_at.desc&limit=100"
  );

  return rows.map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id ?? null,
    actorEmail: row.actor_email ?? null,
    action: row.action,
    target: row.target,
    changes: row.changes ?? {},
    createdAt: row.created_at
  }));
};
