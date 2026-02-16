import { APP_SCHEMA_VERSION, APP_STORAGE_KEY, DEFAULT_SETTINGS } from "./constants";
import { AppSettings, LabReport, MarkerValue, ReportAnnotations, StoredAppData } from "./types";
import {
  canonicalizeCompound,
  inferCompoundFromProtocol,
  inferInjectionFrequencyFromProtocol,
  normalizeInjectionFrequency
} from "./protocolStandards";
import { canonicalizeMarker, normalizeMarkerMeasurement } from "./unitConversion";
import { createId, deriveAbnormalFlag } from "./utils";

declare global {
  interface Window {
    storage?: Storage;
  }
}

type PartialAppData = Partial<StoredAppData> & {
  reports?: Array<Partial<LabReport> & { markers?: Array<Partial<MarkerValue>> }>;
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
  settings: DEFAULT_SETTINGS
});

const normalizeAnnotations = (annotations?: Partial<ReportAnnotations>): ReportAnnotations => {
  const protocol = String(annotations?.protocol ?? "");
  const hasCompound = Boolean(annotations && Object.prototype.hasOwnProperty.call(annotations, "compound"));
  const hasInjectionFrequency = Boolean(annotations && Object.prototype.hasOwnProperty.call(annotations, "injectionFrequency"));
  const normalizedFrequency = normalizeInjectionFrequency(String(annotations?.injectionFrequency ?? ""));

  return {
    dosageMgPerWeek:
      typeof annotations?.dosageMgPerWeek === "number" && Number.isFinite(annotations.dosageMgPerWeek)
        ? annotations.dosageMgPerWeek
        : null,
    compound: canonicalizeCompound(hasCompound ? String(annotations?.compound ?? "") : inferCompoundFromProtocol(protocol)),
    injectionFrequency: hasInjectionFrequency ? normalizedFrequency : inferInjectionFrequencyFromProtocol(protocol),
    protocol,
    supplements: String(annotations?.supplements ?? ""),
    symptoms: String(annotations?.symptoms ?? ""),
    notes: String(annotations?.notes ?? ""),
    samplingTiming:
      annotations?.samplingTiming === "trough" ||
      annotations?.samplingTiming === "mid" ||
      annotations?.samplingTiming === "peak" ||
      annotations?.samplingTiming === "unknown"
        ? annotations.samplingTiming
        : "unknown"
  };
};

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

  const normalizedReport: LabReport = {
    id: String(report.id ?? createId()),
    sourceFileName: String(report.sourceFileName ?? "Imported report"),
    testDate: typeof report.testDate === "string" && report.testDate ? report.testDate : new Date().toISOString().slice(0, 10),
    createdAt: typeof report.createdAt === "string" && report.createdAt ? report.createdAt : new Date().toISOString(),
    markers: rawMarkers,
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
