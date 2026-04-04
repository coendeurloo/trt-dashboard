import { IncomingMessage, ServerResponse } from "node:http";
import { getCounter, RedisStoreUnavailableError } from "../../api/_lib/redisStore.js";
import { getRuntimeConfig } from "../../api/_lib/adminRuntimeConfig.js";
import {
  buildAdminEnvDiagnostics,
  buildAdminErrorReportingStatus,
  runtimeConfigToEnvWarnings
} from "../../api/_lib/adminDiagnostics.js";
import {
  adminServiceFetch,
  handleAdminError,
  requireAdminIdentity,
  sendJson
} from "../../api/_lib/supabaseAdmin.js";

interface ServiceStatus {
  id: string;
  label: string;
  configured: boolean;
  healthy: boolean;
  detail: string;
}

const checkSupabaseStatus = async (
  env: Parameters<typeof adminServiceFetch>[0]
): Promise<ServiceStatus> => {
  try {
    const response = await adminServiceFetch(env, "/auth/v1/admin/users?page=1&per_page=1", {
      method: "GET"
    });
    if (!response.ok) {
      const payload = await response.text();
      return {
        id: "supabase",
        label: "Supabase",
        configured: true,
        healthy: false,
        detail: payload.trim() || `HTTP_${response.status}`
      };
    }
    return {
      id: "supabase",
      label: "Supabase",
      configured: true,
      healthy: true,
      detail: "Admin API reachable"
    };
  } catch (error) {
    return {
      id: "supabase",
      label: "Supabase",
      configured: true,
      healthy: false,
      detail: error instanceof Error ? error.message : "Supabase probe failed"
    };
  }
};

const checkUpstashStatus = async (): Promise<ServiceStatus> => {
  const configured =
    String(process.env.UPSTASH_REDIS_REST_URL ?? "").trim().length > 0 &&
    String(process.env.UPSTASH_REDIS_REST_TOKEN ?? "").trim().length > 0;
  if (!configured) {
    return {
      id: "upstash",
      label: "Upstash Redis",
      configured: false,
      healthy: false,
      detail: "UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN missing"
    };
  }

  try {
    await getCounter("meta:keepalive");
    return {
      id: "upstash",
      label: "Upstash Redis",
      configured: true,
      healthy: true,
      detail: "Redis reachable"
    };
  } catch (error) {
    return {
      id: "upstash",
      label: "Upstash Redis",
      configured: true,
      healthy: false,
      detail:
        error instanceof RedisStoreUnavailableError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Redis probe failed"
    };
  }
};

const checkKeyStatus = (id: string, label: string, keys: string[], detail: string): ServiceStatus => {
  const configured = keys.every((key) => String(process.env[key] ?? "").trim().length > 0);
  return {
    id,
    label,
    configured,
    healthy: configured,
    detail: configured ? detail : `Missing env: ${keys.join(", ")}`
  };
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: { message: "Method not allowed" } });
      return;
    }

    const admin = await requireAdminIdentity(req);
    const runtimeConfig = await getRuntimeConfig(admin.env);

    const [supabaseStatus, upstashStatus] = await Promise.all([
      checkSupabaseStatus(admin.env),
      checkUpstashStatus()
    ]);

    const shareConfigured =
      String(process.env.SHARE_LINK_SECRET_BASE64 ?? "").trim().length > 0 &&
      String(process.env.SHARE_PUBLIC_ORIGIN ?? "").trim().length > 0 &&
      String(process.env.UPSTASH_REDIS_REST_URL ?? "").trim().length > 0 &&
      String(process.env.UPSTASH_REDIS_REST_TOKEN ?? "").trim().length > 0;

    const services: ServiceStatus[] = [
      supabaseStatus,
      upstashStatus,
      checkKeyStatus("claude", "Claude API", ["CLAUDE_API_KEY"], "Configured"),
      checkKeyStatus("gemini", "Gemini API", ["GEMINI_API_KEY"], "Configured"),
      checkKeyStatus("resend", "Resend", ["RESEND_API_KEY", "LABTRACKER_REPORTS_TO"], "Configured"),
      {
        id: "share-links",
        label: "Share-link system",
        configured: shareConfigured,
        healthy: shareConfigured && upstashStatus.healthy,
        detail: !shareConfigured
          ? "Missing SHARE_LINK_SECRET_BASE64, SHARE_PUBLIC_ORIGIN or Upstash env"
          : upstashStatus.healthy
            ? "Configured"
            : "Configured but Redis is unhealthy"
      },
      {
        id: "keepalive",
        label: "Upstash keepalive",
        configured: true,
        healthy: runtimeConfig.upstashKeepaliveEnabled,
        detail: runtimeConfig.upstashKeepaliveEnabled
          ? "Daily keepalive probe enabled"
          : "Disabled by admin runtime config"
      }
    ];

    const envDiagnostics = buildAdminEnvDiagnostics();
    const errorReporting = buildAdminErrorReportingStatus();
    const runtimeWarnings = runtimeConfigToEnvWarnings(runtimeConfig);

    sendJson(res, 200, {
      checkedAt: new Date().toISOString(),
      runtimeConfig,
      services,
      keepalive: {
        enabled: runtimeConfig.upstashKeepaliveEnabled,
        effective: runtimeConfig.upstashKeepaliveEnabled && upstashStatus.healthy,
        reason: runtimeConfig.upstashKeepaliveEnabled
          ? upstashStatus.healthy
            ? "Keepalive can run and reach Redis"
            : "Keepalive enabled but Redis is not healthy"
          : "Keepalive disabled via admin runtime config"
      },
      envDiagnostics: {
        entries: envDiagnostics.entries,
        warnings: [...envDiagnostics.warnings, ...runtimeWarnings]
      },
      errorReporting
    });
  } catch (error) {
    handleAdminError(res, error);
  }
}
