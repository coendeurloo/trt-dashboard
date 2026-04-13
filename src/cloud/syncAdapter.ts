import { AppSettings, PersonalInfo } from "../types";
import { getSupabaseAnonKey, getSupabaseUrl } from "./constants";
import {
  CloudIncrementalPatch,
  CloudCheckInRow,
  CloudMarkerRow,
  CloudProtocolRow,
  CloudReportRow,
  CloudSupplementRow,
  CloudSyncPayload,
  fromCloudSyncPayload,
  toCloudSyncPayload
} from "./mapping";
import { StoredAppData } from "../types";
import { captureAppException, withMonitoringSpan } from "../monitoring/sentry";

type SupabaseErrorPayload = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type ApiErrorEnvelope = SupabaseErrorPayload & {
  error?: SupabaseErrorPayload | null;
};

type ReplaceResponse = {
  revision: number;
  lastSyncedAt: string | null;
};

export interface CloudSnapshot {
  data: StoredAppData;
  rawPayload: CloudSyncPayload;
  schemaVersion: number;
  revision: number;
}

const restHeaders = (accessToken: string): HeadersInit => ({
  apikey: getSupabaseAnonKey(),
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json"
});

const parseJson = async <T>(response: Response): Promise<T> => {
  let payload: unknown = null;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const errorEnvelope = payload as ApiErrorEnvelope | null;
    const apiError = errorEnvelope?.error ?? errorEnvelope;
    const code = apiError?.code || `SUPABASE_HTTP_${response.status}`;
    const message = apiError?.message || apiError?.details || "Supabase request failed";
    throw new Error(`${code}:${message}`);
  }
  return payload as T;
};

const isRecoverableSyncStateError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toUpperCase();
  return (
    message.includes("SUPABASE_HTTP_404") ||
    message.includes("42P01") ||
    message.includes("SYNC_STATE")
  );
};

const isExpectedCloudAuthError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  const normalized = (error.message ?? "").trim().toUpperCase();
  return (
    normalized.startsWith("AUTH_REQUIRED:") ||
    normalized.startsWith("AUTH_UNAUTHORIZED") ||
    normalized.startsWith("SUPABASE_HTTP_401:") ||
    normalized.startsWith("SUPABASE_HTTP_403:")
  );
};

const fetchRows = async <T>(
  table: string,
  query: string,
  accessToken: string
): Promise<T[]> => {
  const response = await fetch(`${getSupabaseUrl()}/rest/v1/${table}?${query}`, {
    method: "GET",
    headers: restHeaders(accessToken)
  });
  return parseJson<T[]>(response);
};

const escapeFilterValue = (value: string): string => encodeURIComponent(value);

const normalizeBiologicalSex = (value: unknown): PersonalInfo["biologicalSex"] =>
  value === "male" || value === "female" || value === "prefer_not_to_say" ? value : "prefer_not_to_say";

const normalizeNullableNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeIsoDate = (value: unknown): string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : "";

export class SupabaseCloudAdapter {
  constructor(
    private readonly accessToken: string,
    private readonly userId: string,
    private readonly deviceId: string
  ) {}

  async fetchSnapshot(): Promise<CloudSnapshot> {
    const profileRows = await fetchRows<{
      settings: {
        settings?: AppSettings;
        markerAliasOverrides?: Record<string, string>;
      } | null;
      schema_version: number | null;
      personal_name: string | null;
      date_of_birth: string | null;
      biological_sex: string | null;
      height_cm: number | string | null;
      weight_kg: number | string | null;
    }>(
      "profiles",
      `select=settings,schema_version,personal_name,date_of_birth,biological_sex,height_cm,weight_kg&id=eq.${escapeFilterValue(
        this.userId
      )}&limit=1`,
      this.accessToken
    );

    const reportRows = await fetchRows<{
      id: string;
      local_id: string;
      report_date: string;
      lab_name: string | null;
      source_filename: string | null;
      notes: string | null;
      is_baseline: boolean;
      annotations: Record<string, unknown>;
      extraction_metadata: Record<string, unknown>;
      created_at: string | null;
      updated_at: string | null;
    }>(
      "lab_reports",
      `select=id,local_id,report_date,lab_name,source_filename,notes,is_baseline,annotations,extraction_metadata,created_at,updated_at&user_id=eq.${escapeFilterValue(this.userId)}`,
      this.accessToken
    );

    const reportIdToLocalId = reportRows.reduce<Record<string, string>>((acc, row) => {
      acc[row.id] = row.local_id;
      return acc;
    }, {});

    const markerRowsRaw = await fetchRows<{
      local_id: string;
      report_id: string;
      marker_name: string;
      canonical_name: string | null;
      value: number | null;
      value_text: string | null;
      unit: string | null;
      reference_low: number | null;
      reference_high: number | null;
      flag: string | null;
      created_at: string | null;
      updated_at: string | null;
    }>(
      "markers",
      `select=local_id,report_id,marker_name,canonical_name,value,value_text,unit,reference_low,reference_high,flag,created_at,updated_at&user_id=eq.${escapeFilterValue(this.userId)}`,
      this.accessToken
    );

    const markerRows: CloudMarkerRow[] = markerRowsRaw
      .map((row) => {
        const reportLocalId = reportIdToLocalId[row.report_id];
        if (!reportLocalId) {
          return null;
        }
        return {
          local_id: row.local_id,
          report_local_id: reportLocalId,
          marker_name: row.marker_name,
          canonical_name: row.canonical_name,
          value: row.value,
          value_text: row.value_text,
          unit: row.unit,
          reference_low: row.reference_low,
          reference_high: row.reference_high,
          flag: row.flag,
          created_at: row.created_at,
          updated_at: row.updated_at
        } satisfies CloudMarkerRow;
      })
      .filter((row): row is CloudMarkerRow => row !== null);

    const protocolRows = await fetchRows<CloudProtocolRow>(
      "protocols",
      `select=local_id,name,description,start_date,end_date,is_active,details,created_at,updated_at&user_id=eq.${escapeFilterValue(this.userId)}`,
      this.accessToken
    );

    const supplementRows = await fetchRows<CloudSupplementRow>(
      "supplement_timeline",
      `select=local_id,supplement_name,dosage,start_date,end_date,notes,details,created_at,updated_at&user_id=eq.${escapeFilterValue(this.userId)}`,
      this.accessToken
    );

    const checkInRows = await fetchRows<CloudCheckInRow>(
      "check_ins",
      `select=local_id,check_in_date,data,created_at,updated_at&user_id=eq.${escapeFilterValue(this.userId)}`,
      this.accessToken
    );

    let syncStateRows: Array<{ last_revision: number | null }> = [];
    try {
      syncStateRows = await fetchRows<{
        last_revision: number | null;
      }>(
        "sync_state",
        `select=last_revision&user_id=eq.${escapeFilterValue(this.userId)}&device_id=eq.${escapeFilterValue(this.deviceId)}&limit=1`,
        this.accessToken
      );
    } catch (error) {
      if (!isRecoverableSyncStateError(error)) {
        throw error;
      }
      syncStateRows = [];
    }

    const profile = profileRows[0];
    const profileSettings = profile?.settings ?? null;
    const schemaVersion = Number(profile?.schema_version ?? 0) || 0;
    const revision = Number(syncStateRows[0]?.last_revision ?? 0) || 0;
    const personalInfo: PersonalInfo = {
      name: typeof profile?.personal_name === "string" ? profile.personal_name : "",
      dateOfBirth: normalizeIsoDate(profile?.date_of_birth),
      biologicalSex: normalizeBiologicalSex(profile?.biological_sex),
      heightCm: normalizeNullableNumber(profile?.height_cm),
      weightKg: normalizeNullableNumber(profile?.weight_kg)
    };

    const payload: CloudSyncPayload = {
      schemaVersion,
      settings: (profileSettings?.settings ?? {}) as AppSettings,
      markerAliasOverrides: profileSettings?.markerAliasOverrides ?? {},
      personalInfo,
      reports: reportRows.map((row) => ({
        local_id: row.local_id,
        report_date: row.report_date,
        lab_name: row.lab_name,
        source_filename: row.source_filename,
        notes: row.notes,
        is_baseline: Boolean(row.is_baseline),
        annotations: row.annotations ?? {},
        extraction_metadata: row.extraction_metadata ?? {},
        created_at: row.created_at,
        updated_at: row.updated_at
      })) as CloudReportRow[],
      markers: markerRows,
      protocols: protocolRows,
      supplements: supplementRows,
      checkIns: checkInRows
    };

    return {
      data: fromCloudSyncPayload(payload),
      rawPayload: payload,
      schemaVersion,
      revision
    };
  }

  async replaceAll(
    data: StoredAppData,
    expectedRevision: number | null
  ): Promise<ReplaceResponse> {
    try {
      return await withMonitoringSpan(
        {
          name: "cloud.replace_all",
          op: "labtracker.cloud",
          attributes: {
            action: "replace_all",
            expected_revision: expectedRevision ?? -1,
            report_count: data.reports.length
          }
        },
        async () => {
          const payload = toCloudSyncPayload(data);
          const response = await fetch("/api/cloud/replace", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              deviceId: this.deviceId,
              expectedRevision,
              payload
            })
          });
          return parseJson<ReplaceResponse>(response);
        }
      );
    } catch (error) {
      if (!isExpectedCloudAuthError(error)) {
        captureAppException(error, {
          tags: {
            flow: "cloud_sync",
            action: "replace_all"
          },
          extra: {
            expectedRevision,
            reportCount: data.reports.length,
            protocolCount: data.protocols.length,
            checkInCount: data.checkIns.length
          },
          fingerprint: ["cloud-sync-replace-all-failure"]
        });
      }
      throw error;
    }
  }

  async applyPatch(
    patch: CloudIncrementalPatch,
    expectedRevision: number | null
  ): Promise<ReplaceResponse> {
    try {
      return await withMonitoringSpan(
        {
          name: "cloud.apply_patch",
          op: "labtracker.cloud",
          attributes: {
            action: "apply_patch",
            expected_revision: expectedRevision ?? -1
          }
        },
        async () => {
          const response = await fetch("/api/cloud/incremental", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              deviceId: this.deviceId,
              expectedRevision,
              patch
            })
          });
          return parseJson<ReplaceResponse>(response);
        }
      );
    } catch (error) {
      if (!isExpectedCloudAuthError(error)) {
        captureAppException(error, {
          tags: {
            flow: "cloud_sync",
            action: "apply_patch"
          },
          extra: {
            expectedRevision,
            patchKeys: Object.keys(patch ?? {})
          },
          fingerprint: ["cloud-sync-apply-patch-failure"]
        });
      }
      throw error;
    }
  }
}
