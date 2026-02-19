import { APP_SCHEMA_VERSION, APP_STORAGE_KEY, DEFAULT_SETTINGS } from "./constants";
import {
  AppSettings,
  CompoundEntry,
  LabReport,
  MarkerValue,
  Protocol,
  ReportAnnotations,
  StoredAppData,
  SupplementEntry,
  SupplementPeriod,
  SymptomCheckIn
} from "./types";
import { canonicalizeSupplement, normalizeSupplementFrequency } from "./protocolStandards";
import { canonicalizeMarker, normalizeMarkerMeasurement } from "./unitConversion";
import { createId, deriveAbnormalFlag } from "./utils";

declare global {
  interface Window {
    storage?: Storage;
  }
}

type PartialAppData = Partial<StoredAppData> & {
  reports?: Array<Partial<LabReport> & { markers?: Array<Partial<MarkerValue>> }>;
  protocols?: Array<Partial<Protocol>>;
  supplementTimeline?: Array<Partial<SupplementPeriod>>;
  checkIns?: Array<Partial<SymptomCheckIn>>;
  settings?: Partial<AppSettings>;
};

const getStorage = (): Storage | null => {
  if (typeof window === "undefined") {
    return null;
  }
  return window.storage ?? window.localStorage;
};

const createDefaultData = (): StoredAppData => ({
  schemaVersion: APP_SCHEMA_VERSION,
  reports: [],
  protocols: [],
  supplementTimeline: [],
  checkIns: [],
  settings: DEFAULT_SETTINGS
});

const normalizeSamplingTiming = (value: unknown): ReportAnnotations["samplingTiming"] => {
  return value === "trough" || value === "mid" || value === "peak" || value === "unknown" ? value : "unknown";
};

const normalizeSupplementEntry = (value: unknown): SupplementEntry | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Partial<SupplementEntry>;
  const name = String(row.name ?? "").trim();
  if (!name) {
    return null;
  }
  return {
    name,
    dose: String(row.dose ?? "").trim(),
    frequency: normalizeSupplementFrequency(String(row.frequency ?? "unknown"))
  };
};

const normalizeIsoDate = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }
  const ms = Date.parse(`${trimmed}T00:00:00Z`);
  if (!Number.isFinite(ms)) {
    return null;
  }
  return trimmed;
};

const normalizeSupplementPeriod = (value: unknown): SupplementPeriod | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Partial<SupplementPeriod>;
  const name = canonicalizeSupplement(String(row.name ?? ""));
  if (!name) {
    return null;
  }
  const startDate = normalizeIsoDate(row.startDate);
  if (!startDate) {
    return null;
  }
  const parsedEndDate = row.endDate === null || row.endDate === undefined ? null : normalizeIsoDate(row.endDate);
  const endDate = parsedEndDate;
  if (endDate && endDate < startDate) {
    return null;
  }
  return {
    id: String(row.id ?? createId()),
    name,
    dose: String(row.dose ?? "").trim(),
    frequency: normalizeSupplementFrequency(String(row.frequency ?? "unknown")),
    startDate,
    endDate
  };
};

const normalizeSupplementOverrides = (value: unknown): SupplementPeriod[] | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const normalized = value
    .map((entry) => normalizeSupplementPeriod(entry))
    .filter((entry): entry is SupplementPeriod => entry !== null);
  return normalized.length > 0 ? normalized : [];
};

const normalizeScore = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const rounded = Math.round(parsed);
  if (rounded < 1 || rounded > 5) {
    return null;
  }
  return rounded;
};

const normalizeSymptomCheckIn = (value: unknown): SymptomCheckIn | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Partial<SymptomCheckIn>;
  const date = normalizeIsoDate(row.date);
  if (!date) {
    return null;
  }
  return {
    id: String(row.id ?? createId()),
    date,
    energy: normalizeScore(row.energy),
    libido: normalizeScore(row.libido),
    mood: normalizeScore(row.mood),
    sleep: normalizeScore(row.sleep),
    motivation: normalizeScore(row.motivation),
    notes: String(row.notes ?? "")
  };
};

const normalizeCompoundEntry = (value: unknown): CompoundEntry | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Partial<CompoundEntry>;
  const name = String(row.name ?? "").trim();
  if (!name) {
    return null;
  }
  return {
    name,
    doseMg: String(row.doseMg ?? "").trim(),
    frequency: String(row.frequency ?? "unknown").trim() || "unknown",
    route: String(row.route ?? "").trim()
  };
};

const normalizeProtocol = (value: Partial<Protocol> | null | undefined): Protocol | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const id = String(value.id ?? createId()).trim();
  const name = String(value.name ?? "").trim();
  if (!id || !name) {
    return null;
  }

  const compounds = Array.isArray(value.compounds)
    ? value.compounds.map((entry) => normalizeCompoundEntry(entry)).filter((entry): entry is CompoundEntry => entry !== null)
    : [];

  return {
    id,
    name,
    compounds,
    notes: String(value.notes ?? ""),
    createdAt: typeof value.createdAt === "string" && value.createdAt ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === "string" && value.updatedAt ? value.updatedAt : new Date().toISOString()
  };
};

const normalizeAnnotations = (annotations?: Partial<ReportAnnotations>): ReportAnnotations => {
  const protocolIdRaw = annotations?.protocolId;
  const protocolId = typeof protocolIdRaw === "string" && protocolIdRaw.trim().length > 0 ? protocolIdRaw : null;

  return {
    protocolId,
    protocol: String(annotations?.protocol ?? ""),
    supplementOverrides: normalizeSupplementOverrides(annotations?.supplementOverrides),
    symptoms: String(annotations?.symptoms ?? ""),
    notes: String(annotations?.notes ?? ""),
    samplingTiming: normalizeSamplingTiming(annotations?.samplingTiming)
  };
};

type DemoReferenceRange = {
  referenceMin: number | null;
  referenceMax: number | null;
  unit?: string;
};

const DEMO_REFERENCE_RANGE_FALLBACKS: Record<string, DemoReferenceRange> = {
  Testosterone: { unit: "nmol/L", referenceMin: 8.0, referenceMax: 29.0 },
  "Free Testosterone": { unit: "nmol/L", referenceMin: 0.17, referenceMax: 0.67 },
  Estradiol: { unit: "pmol/L", referenceMin: 40, referenceMax: 160 },
  SHBG: { unit: "nmol/L", referenceMin: 18, referenceMax: 54 },
  Hematocrit: { unit: "L/L", referenceMin: 0.4, referenceMax: 0.54 },
  PSA: { unit: "µg/L", referenceMin: 0, referenceMax: 4.0 },
  Hemoglobin: { unit: "mmol/L", referenceMin: 8.5, referenceMax: 11.0 },
  Cholesterol: { unit: "mmol/L", referenceMin: 0, referenceMax: 5.0 },
  "HDL Cholesterol": { unit: "mmol/L", referenceMin: 0.9, referenceMax: 2.0 },
  "LDL Cholesterol": { unit: "mmol/L", referenceMin: 0, referenceMax: 3.0 },
  Triglyceriden: { unit: "mmol/L", referenceMin: 0.5, referenceMax: 1.7 },
  "Apolipoprotein B": { unit: "g/L", referenceMin: 0.55, referenceMax: 1.2 },
  Ferritine: { unit: "µg/L", referenceMin: 30, referenceMax: 400 },
  Prolactin: { unit: "mIU/L", referenceMin: 86, referenceMax: 324 }
};

const applyDemoReferenceRangeFallbacks = (markers: MarkerValue[]): MarkerValue[] =>
  markers.map((marker) => {
    const fallback = DEMO_REFERENCE_RANGE_FALLBACKS[marker.canonicalMarker];
    if (!fallback) {
      return marker;
    }

    const referenceMin = marker.referenceMin ?? fallback.referenceMin;
    const referenceMax = marker.referenceMax ?? fallback.referenceMax;
    const unit = marker.unit || fallback.unit || marker.unit;
    const normalized = normalizeMarkerMeasurement({
      canonicalMarker: marker.canonicalMarker,
      value: marker.value,
      unit,
      referenceMin,
      referenceMax
    });

    return {
      ...marker,
      unit: normalized.unit,
      referenceMin: normalized.referenceMin,
      referenceMax: normalized.referenceMax,
      abnormal: deriveAbnormalFlag(normalized.value, normalized.referenceMin, normalized.referenceMax)
    };
  });

const sanitizeMarker = (marker: Partial<MarkerValue>): MarkerValue | null => {
  const rawValue = typeof marker.value === "number" ? marker.value : Number(marker.value);
  if (!Number.isFinite(rawValue)) {
    return null;
  }

  const markerLabel = String(marker.marker ?? marker.canonicalMarker ?? "").trim();
  const canonicalMarker = canonicalizeMarker(markerLabel || "Unknown Marker");
  const normalized = normalizeMarkerMeasurement({
    canonicalMarker,
    value: rawValue,
    unit: String(marker.unit ?? ""),
    referenceMin: marker.referenceMin === null || marker.referenceMin === undefined ? null : Number(marker.referenceMin),
    referenceMax: marker.referenceMax === null || marker.referenceMax === undefined ? null : Number(marker.referenceMax)
  });

  return {
    id: String(marker.id ?? createId()),
    marker: markerLabel || canonicalMarker,
    canonicalMarker,
    value: normalized.value,
    unit: normalized.unit,
    referenceMin: normalized.referenceMin,
    referenceMax: normalized.referenceMax,
    abnormal: deriveAbnormalFlag(normalized.value, normalized.referenceMin, normalized.referenceMax),
    confidence:
      typeof marker.confidence === "number" && Number.isFinite(marker.confidence) ? marker.confidence : marker.isCalculated ? 1 : 0.8,
    isCalculated: Boolean(marker.isCalculated),
    source: marker.isCalculated ? "calculated" : "measured"
  };
};

const dedupeMarkers = (markers: MarkerValue[]): MarkerValue[] =>
  Array.from(
    markers
      .reduce((map, marker) => {
        const key = [
          marker.canonicalMarker,
          marker.value,
          marker.unit,
          marker.referenceMin ?? "",
          marker.referenceMax ?? "",
          marker.isCalculated ? "calc" : "raw"
        ].join("|");
        const existing = map.get(key);
        if (!existing || marker.confidence > existing.confidence) {
          map.set(key, marker);
        }
        return map;
      }, new Map<string, MarkerValue>())
      .values()
  );

const normalizeReport = (report: Partial<LabReport>): LabReport | null => {
  const markers = Array.isArray(report.markers) ? report.markers.map(sanitizeMarker).filter((item): item is MarkerValue => item !== null) : [];
  const rawMarkers = dedupeMarkers(markers).filter((marker) => !marker.isCalculated);
  if (rawMarkers.length === 0) {
    return null;
  }
  const isDemoReport = String(report.extraction?.model ?? "") === "demo-data";
  const normalizedMarkers = isDemoReport ? applyDemoReferenceRangeFallbacks(rawMarkers) : rawMarkers;

  const normalizedReport: LabReport = {
    id: String(report.id ?? createId()),
    sourceFileName: String(report.sourceFileName ?? "Imported report"),
    testDate: typeof report.testDate === "string" && report.testDate ? report.testDate : new Date().toISOString().slice(0, 10),
    createdAt: typeof report.createdAt === "string" && report.createdAt ? report.createdAt : new Date().toISOString(),
    markers: normalizedMarkers,
    annotations: normalizeAnnotations(report.annotations),
    isBaseline: Boolean(report.isBaseline),
    extraction: {
      provider: report.extraction?.provider === "claude" ? "claude" : "fallback",
      model: String(report.extraction?.model ?? "legacy-import"),
      confidence:
        typeof report.extraction?.confidence === "number" && Number.isFinite(report.extraction.confidence)
          ? report.extraction.confidence
          : 0.8,
      needsReview: Boolean(report.extraction?.needsReview)
    }
  };

  return normalizedReport;
};

const normalizeSettings = (settings?: Partial<AppSettings>): AppSettings => {
  const { claudeApiKey: _legacyClaudeApiKey, ...rest } = (settings ?? {}) as Partial<AppSettings> & {
    claudeApiKey?: string;
  };
  return {
    ...DEFAULT_SETTINGS,
    ...rest
  };
};

export const coerceStoredAppData = (raw: PartialAppData | null | undefined): StoredAppData => {
  if (!raw || typeof raw !== "object") {
    return createDefaultData();
  }

  const reports = Array.isArray(raw.reports) ? raw.reports.map((report) => normalizeReport(report)).filter((item): item is LabReport => item !== null) : [];
  const protocols = Array.isArray(raw.protocols)
    ? raw.protocols
        .map((protocol) => normalizeProtocol(protocol))
        .filter((protocol): protocol is Protocol => protocol !== null)
        .reduce((deduped, protocol) => {
          if (deduped.some((current) => current.id === protocol.id)) {
            return deduped;
          }
          deduped.push(protocol);
          return deduped;
        }, [] as Protocol[])
    : [];
  const supplementTimeline = Array.isArray(raw.supplementTimeline)
    ? raw.supplementTimeline
        .map((entry) => normalizeSupplementPeriod(entry))
        .filter((entry): entry is SupplementPeriod => entry !== null)
        .sort((left, right) => left.startDate.localeCompare(right.startDate) || left.name.localeCompare(right.name))
    : [];
  const checkIns = Array.isArray(raw.checkIns)
    ? raw.checkIns
        .map((entry) => normalizeSymptomCheckIn(entry))
        .filter((entry): entry is SymptomCheckIn => entry !== null)
        .sort((left, right) => left.date.localeCompare(right.date))
    : [];

  // Ensure exactly one baseline when legacy data has multiple baseline flags.
  let baselineTaken = false;
  const normalizedReports = reports.map((report) => {
    if (!report.isBaseline) {
      return report;
    }
    if (!baselineTaken) {
      baselineTaken = true;
      return report;
    }
    return {
      ...report,
      isBaseline: false
    };
  });

  return {
    schemaVersion: APP_SCHEMA_VERSION,
    reports: normalizedReports,
    protocols,
    supplementTimeline,
    checkIns,
    settings: normalizeSettings(raw.settings)
  };
};

export const loadAppData = (): StoredAppData => {
  const storage = getStorage();
  if (!storage) {
    return createDefaultData();
  }

  const raw = storage.getItem(APP_STORAGE_KEY);
  if (!raw) {
    return createDefaultData();
  }

  try {
    const parsed = JSON.parse(raw) as PartialAppData;
    return coerceStoredAppData(parsed);
  } catch {
    return createDefaultData();
  }
};

export const saveAppData = (data: StoredAppData): void => {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  storage.setItem(APP_STORAGE_KEY, JSON.stringify({ ...data, schemaVersion: APP_SCHEMA_VERSION }));
};
