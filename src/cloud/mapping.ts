import { APP_SCHEMA_VERSION, DEFAULT_PERSONAL_INFO } from "../constants";
import { coerceStoredAppData } from "../storage";
import { normalizeInterventionSnapshot, normalizeProtocolMirrors } from "../protocolVersions";
import {
  AppSettings,
  LabReport,
  MarkerValue,
  PersonalInfo,
  Protocol,
  ReportAnnotations,
  StoredAppData,
  SupplementPeriod,
  SymptomCheckIn
} from "../types";

export interface CloudReportRow {
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
}

export interface CloudMarkerRow {
  local_id: string;
  report_local_id: string;
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
}

export interface CloudProtocolRow {
  local_id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  details: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export interface CloudSupplementRow {
  local_id: string;
  supplement_name: string;
  dosage: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  details: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export interface CloudCheckInRow {
  local_id: string;
  check_in_date: string;
  data: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export interface CloudSyncPayload {
  schemaVersion: number;
  settings: AppSettings;
  markerAliasOverrides: Record<string, string>;
  personalInfo: PersonalInfo;
  reports: CloudReportRow[];
  markers: CloudMarkerRow[];
  protocols: CloudProtocolRow[];
  supplements: CloudSupplementRow[];
  checkIns: CloudCheckInRow[];
}

export interface CloudTablePatch<TRow extends { local_id: string }> {
  upserts: TRow[];
  deleteLocalIds: string[];
}

export interface CloudIncrementalPatch {
  schemaVersion: number;
  settingsChanged: boolean;
  settings: AppSettings;
  markerAliasOverrides: Record<string, string>;
  personalInfo: PersonalInfo;
  reports: CloudTablePatch<CloudReportRow>;
  markers: CloudTablePatch<CloudMarkerRow>;
  protocols: CloudTablePatch<CloudProtocolRow>;
  supplements: CloudTablePatch<CloudSupplementRow>;
  checkIns: CloudTablePatch<CloudCheckInRow>;
}

const normalizeBiologicalSex = (value: unknown): PersonalInfo["biologicalSex"] =>
  value === "male" || value === "female" || value === "prefer_not_to_say"
    ? value
    : DEFAULT_PERSONAL_INFO.biologicalSex;

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

const normalizeIsoDateString = (value: unknown): string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : "";

const normalizePersonalInfo = (value: unknown): PersonalInfo => {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_PERSONAL_INFO };
  }
  const row = value as Partial<PersonalInfo>;
  return {
    name: typeof row.name === "string" ? row.name : DEFAULT_PERSONAL_INFO.name,
    dateOfBirth: normalizeIsoDateString(row.dateOfBirth),
    biologicalSex: normalizeBiologicalSex(row.biologicalSex),
    heightCm: normalizeNullableNumber(row.heightCm),
    weightKg: normalizeNullableNumber(row.weightKg)
  };
};

export const isPersonalInfoEmpty = (personalInfo: PersonalInfo): boolean =>
  personalInfo.name.trim().length === 0 &&
  personalInfo.dateOfBirth.trim().length === 0 &&
  personalInfo.biologicalSex === "prefer_not_to_say" &&
  personalInfo.heightCm === null &&
  personalInfo.weightKg === null;

const coerceReportAnnotations = (
  value: unknown
): ReportAnnotations => {
  const row = value as Partial<ReportAnnotations> | null;
  const linkedVersionId =
    typeof row?.interventionVersionId === "string"
      ? row.interventionVersionId
      : typeof row?.protocolVersionId === "string"
        ? row.protocolVersionId
        : null;
  const snapshot = normalizeInterventionSnapshot(row?.interventionSnapshot);
  return {
    interventionId:
      typeof row?.interventionId === "string"
        ? row.interventionId
        : typeof row?.protocolId === "string"
          ? row.protocolId
          : null,
    interventionLabel:
      typeof row?.interventionLabel === "string"
        ? row.interventionLabel
        : typeof row?.protocol === "string"
          ? row.protocol
          : "",
    interventionVersionId: linkedVersionId,
    interventionSnapshot: snapshot,
    protocolId:
      typeof row?.protocolId === "string"
        ? row.protocolId
        : typeof row?.interventionId === "string"
          ? row.interventionId
          : null,
    protocolVersionId: linkedVersionId,
    protocol:
      typeof row?.protocol === "string"
        ? row.protocol
        : typeof row?.interventionLabel === "string"
          ? row.interventionLabel
          : "",
    supplementAnchorState:
      row?.supplementAnchorState === "inherit" ||
      row?.supplementAnchorState === "anchor" ||
      row?.supplementAnchorState === "none" ||
      row?.supplementAnchorState === "unknown"
        ? row.supplementAnchorState
        : "unknown",
    supplementOverrides: Array.isArray(row?.supplementOverrides)
      ? (row?.supplementOverrides as SupplementPeriod[])
      : null,
    symptoms: typeof row?.symptoms === "string" ? row.symptoms : "",
    notes: typeof row?.notes === "string" ? row.notes : "",
    samplingTiming:
      row?.samplingTiming === "trough" ||
      row?.samplingTiming === "mid" ||
      row?.samplingTiming === "peak" ||
      row?.samplingTiming === "unknown"
        ? row.samplingTiming
        : "unknown"
  };
};

const coerceExtraction = (value: unknown): LabReport["extraction"] => {
  const row = value as Partial<LabReport["extraction"]> | null;
  return {
    provider:
      row?.provider === "claude" || row?.provider === "gemini" || row?.provider === "fallback"
        ? row.provider
        : "fallback",
    model: typeof row?.model === "string" && row.model.trim().length > 0 ? row.model : "cloud-sync",
    confidence:
      typeof row?.confidence === "number" && Number.isFinite(row.confidence)
        ? row.confidence
        : 0.8,
    needsReview: Boolean(row?.needsReview),
    warningCode: row?.warningCode,
    warnings: Array.isArray(row?.warnings) ? row?.warnings.map((warning) => String(warning)) : [],
    debug:
      row?.debug && typeof row.debug === "object"
        ? (row.debug as LabReport["extraction"]["debug"])
        : undefined,
    costMode:
      row?.costMode === "balanced" || row?.costMode === "ultra_low_cost" || row?.costMode === "max_accuracy"
        ? row.costMode
        : undefined,
    aiUsed: typeof row?.aiUsed === "boolean" ? row.aiUsed : undefined,
    aiReason:
      row?.aiReason === "auto_low_quality" ||
      row?.aiReason === "manual_improve" ||
      row?.aiReason === "disabled_by_budget" ||
      row?.aiReason === "cache_hit" ||
      row?.aiReason === "local_high_quality" ||
      row?.aiReason === "disabled_by_cost_mode" ||
      row?.aiReason === "disabled_by_consent" ||
      row?.aiReason === "disabled_by_entitlement"
        ? row.aiReason
        : undefined
  };
};

const asIsoDate = (value: string | null | undefined, fallback: string): string =>
  typeof value === "string" && value.trim().length > 0 ? value : fallback;

const mapCloudMarker = (row: CloudMarkerRow): MarkerValue => ({
  id: row.local_id,
  marker: row.marker_name,
  rawMarker: row.marker_name,
  canonicalMarker: row.canonical_name ?? row.marker_name,
  value:
    typeof row.value === "number" && Number.isFinite(row.value)
      ? row.value
      : Number.parseFloat(row.value_text ?? "0") || 0,
  unit: row.unit ?? "",
  referenceMin:
    typeof row.reference_low === "number" && Number.isFinite(row.reference_low)
      ? row.reference_low
      : null,
  referenceMax:
    typeof row.reference_high === "number" && Number.isFinite(row.reference_high)
      ? row.reference_high
      : null,
  abnormal:
    row.flag === "low" || row.flag === "high" || row.flag === "normal" || row.flag === "unknown"
      ? row.flag
      : "unknown",
  confidence: 1,
  source: "measured"
});

export const toCloudSyncPayload = (data: StoredAppData): CloudSyncPayload => {
  const reports = data.reports.map((report) => ({
    local_id: report.id,
    report_date: report.testDate,
    lab_name: null,
    source_filename: report.sourceFileName,
    notes: report.annotations.notes ?? "",
    is_baseline: Boolean(report.isBaseline),
    annotations: report.annotations as unknown as Record<string, unknown>,
    extraction_metadata: report.extraction as Record<string, unknown>,
    created_at: report.createdAt,
    updated_at: report.createdAt
  }));

  const markers = data.reports.flatMap((report) =>
    report.markers.map((marker) => ({
      local_id: marker.id,
      report_local_id: report.id,
      marker_name: marker.marker,
      canonical_name: marker.canonicalMarker,
      value: marker.value,
      value_text: Number.isFinite(marker.value) ? null : String(marker.value ?? ""),
      unit: marker.unit,
      reference_low: marker.referenceMin ?? null,
      reference_high: marker.referenceMax ?? null,
      flag: marker.abnormal,
      created_at: report.createdAt,
      updated_at: report.createdAt
    }))
  );

  const protocols = data.protocols.map((entry) => {
    const protocol = normalizeProtocolMirrors(entry);
    return {
    local_id: protocol.id,
    name: protocol.name,
    description: protocol.notes,
    start_date: null,
    end_date: null,
    is_active: true,
    details: {
      items: protocol.items,
      compounds: protocol.compounds,
      versions: protocol.versions ?? [],
      notes: protocol.notes,
      createdAt: protocol.createdAt,
      updatedAt: protocol.updatedAt
    },
    created_at: protocol.createdAt,
    updated_at: protocol.updatedAt
    };
  });

  const supplements = data.supplementTimeline.map((supplement) => ({
    local_id: supplement.id,
    supplement_name: supplement.name,
    dosage: supplement.dose,
    start_date: supplement.startDate,
    end_date: supplement.endDate,
    notes: "",
    details: {
      dose: supplement.dose,
      frequency: supplement.frequency
    },
    created_at: null,
    updated_at: null
  }));

  const checkIns = data.checkIns.map((checkIn) => ({
    local_id: checkIn.id,
    check_in_date: checkIn.date,
    data: {
      profileAtEntry: checkIn.profileAtEntry ?? data.settings.userProfile,
      values: checkIn.values ?? {},
      notes: checkIn.notes ?? ""
    },
    created_at: null,
    updated_at: null
  }));

  return {
    schemaVersion: APP_SCHEMA_VERSION,
    settings: data.settings,
    markerAliasOverrides: data.markerAliasOverrides,
    personalInfo: normalizePersonalInfo(data.personalInfo),
    reports,
    markers,
    protocols,
    supplements,
    checkIns
  };
};

export const fromCloudSyncPayload = (payload: CloudSyncPayload): StoredAppData => {
  const markersByReport = payload.markers.reduce<Record<string, MarkerValue[]>>((acc, marker) => {
    const reportLocalId = marker.report_local_id;
    if (!acc[reportLocalId]) {
      acc[reportLocalId] = [];
    }
    acc[reportLocalId].push(mapCloudMarker(marker));
    return acc;
  }, {});

  const reports: LabReport[] = payload.reports.map((report) => {
    const annotations = coerceReportAnnotations(report.annotations);
    return {
      id: report.local_id,
      sourceFileName: report.source_filename ?? "Cloud report",
      testDate: asIsoDate(report.report_date, new Date().toISOString().slice(0, 10)),
      createdAt: asIsoDate(report.created_at, new Date().toISOString()),
      markers: markersByReport[report.local_id] ?? [],
      annotations,
      isBaseline: Boolean(report.is_baseline),
      extraction: coerceExtraction(report.extraction_metadata)
    };
  });

  const protocols: Protocol[] = payload.protocols.map((protocol) => {
    const details = protocol.details as {
      items?: Protocol["items"];
      compounds?: Protocol["compounds"];
      versions?: Protocol["versions"];
      notes?: string;
      createdAt?: string;
      updatedAt?: string;
    };
    const items = Array.isArray(details.items)
      ? details.items
      : Array.isArray(details.compounds)
        ? details.compounds
        : [];
    return normalizeProtocolMirrors({
      id: protocol.local_id,
      name: protocol.name,
      items,
      compounds: items,
      versions: Array.isArray(details.versions) ? details.versions : undefined,
      notes: typeof details.notes === "string" ? details.notes : protocol.description ?? "",
      createdAt: asIsoDate(details.createdAt ?? protocol.created_at, new Date().toISOString()),
      updatedAt: asIsoDate(details.updatedAt ?? protocol.updated_at, new Date().toISOString())
    });
  });

  const supplementTimeline: SupplementPeriod[] = payload.supplements.map((supplement) => {
    const details = supplement.details as { dose?: string; frequency?: string };
    return {
      id: supplement.local_id,
      name: supplement.supplement_name,
      dose:
        typeof details.dose === "string"
          ? details.dose
          : supplement.dosage ?? "",
      frequency: typeof details.frequency === "string" ? details.frequency : "unknown",
      startDate: asIsoDate(supplement.start_date, new Date().toISOString().slice(0, 10)),
      endDate: supplement.end_date ?? null
    };
  });

  const checkIns: SymptomCheckIn[] = payload.checkIns.map((checkIn) => {
    const data = checkIn.data as {
      profileAtEntry?: string;
      values?: Partial<Record<string, number>>;
      notes?: string;
    };
    return {
      id: checkIn.local_id,
      date: checkIn.check_in_date,
      profileAtEntry:
        data.profileAtEntry === "trt" ||
        data.profileAtEntry === "enhanced" ||
        data.profileAtEntry === "health" ||
        data.profileAtEntry === "biohacker"
          ? data.profileAtEntry
          : "trt",
      values: data.values ?? {},
      notes: typeof data.notes === "string" ? data.notes : ""
    };
  });

  return coerceStoredAppData({
    schemaVersion: payload.schemaVersion || APP_SCHEMA_VERSION,
    reports,
    interventions: protocols,
    protocols,
    supplementTimeline,
    wellbeingEntries: checkIns,
    checkIns,
    markerAliasOverrides: payload.markerAliasOverrides ?? {},
    settings: payload.settings,
    personalInfo: normalizePersonalInfo(payload.personalInfo)
  });
};

const areSameJson = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const buildTablePatch = <TRow extends { local_id: string }>(
  previousRows: TRow[],
  nextRows: TRow[]
): CloudTablePatch<TRow> => {
  const previousById = new Map(previousRows.map((row) => [row.local_id, row]));
  const nextById = new Map(nextRows.map((row) => [row.local_id, row]));

  const upserts: TRow[] = [];
  const deleteLocalIds: string[] = [];

  nextRows.forEach((row) => {
    const previous = previousById.get(row.local_id);
    if (!previous || !areSameJson(previous, row)) {
      upserts.push(row);
    }
  });

  previousRows.forEach((row) => {
    if (!nextById.has(row.local_id)) {
      deleteLocalIds.push(row.local_id);
    }
  });

  return {
    upserts,
    deleteLocalIds
  };
};

export const buildIncrementalPatch = (
  previous: CloudSyncPayload,
  next: CloudSyncPayload
): CloudIncrementalPatch => ({
  schemaVersion: next.schemaVersion,
  settingsChanged:
    !areSameJson(previous.settings, next.settings) ||
    !areSameJson(previous.markerAliasOverrides, next.markerAliasOverrides) ||
    !areSameJson(previous.personalInfo, next.personalInfo),
  settings: next.settings,
  markerAliasOverrides: next.markerAliasOverrides,
  personalInfo: next.personalInfo,
  reports: buildTablePatch(previous.reports, next.reports),
  markers: buildTablePatch(previous.markers, next.markers),
  protocols: buildTablePatch(previous.protocols, next.protocols),
  supplements: buildTablePatch(previous.supplements, next.supplements),
  checkIns: buildTablePatch(previous.checkIns, next.checkIns)
});

export const hasIncrementalPatchOperations = (
  patch: CloudIncrementalPatch
): boolean =>
  patch.settingsChanged ||
  patch.reports.upserts.length > 0 ||
  patch.reports.deleteLocalIds.length > 0 ||
  patch.markers.upserts.length > 0 ||
  patch.markers.deleteLocalIds.length > 0 ||
  patch.protocols.upserts.length > 0 ||
  patch.protocols.deleteLocalIds.length > 0 ||
  patch.supplements.upserts.length > 0 ||
  patch.supplements.deleteLocalIds.length > 0 ||
  patch.checkIns.upserts.length > 0 ||
  patch.checkIns.deleteLocalIds.length > 0;

export const hasMeaningfulData = (data: StoredAppData): boolean =>
  data.reports.length > 0 ||
  data.protocols.length > 0 ||
  data.supplementTimeline.length > 0 ||
  data.checkIns.length > 0 ||
  !isPersonalInfoEmpty(normalizePersonalInfo(data.personalInfo));
