import { APP_SCHEMA_VERSION, APP_STORAGE_KEY, DEFAULT_SETTINGS } from "./constants";
import {
  AppSettings,
  CompoundEntry,
  LabReport,
  MarkerValue,
  Protocol,
  ReportAnnotations,
  StoredAppData,
  SupplementPeriod,
  SymptomCheckIn,
  UserProfile,
  WellbeingMetricId
} from "./types";
import { normalizeMarkerAliasOverrides, normalizeMarkerLookupKey, setMarkerAliasOverrides } from "./markerNormalization";
import { canonicalizeSupplement, normalizeSupplementFrequency } from "./protocolStandards";
import { canonicalizeMarker, normalizeMarkerMeasurement } from "./unitConversion";
import { inferDashboardChartPresetFromSettings } from "./chartHelpers";
import { createId, deriveAbnormalFlag } from "./utils";
import { normalizeBaselineFlagsByMarkerOverlap } from "./baselineUtils";
import { AnalystMemory } from "./types/analystMemory";
import { coerceAnalystMemory } from "./analystMemory";

declare global {
  interface Window {
    storage?: Storage;
  }
}

type PartialAppData = Partial<StoredAppData> & {
  reports?: Array<Partial<LabReport> & { markers?: Array<Partial<MarkerValue>> }>;
  interventions?: Array<Partial<Protocol>>;
  protocols?: Array<Partial<Protocol>>;
  supplementTimeline?: Array<Partial<SupplementPeriod>>;
  wellbeingEntries?: Array<Partial<SymptomCheckIn>>;
  checkIns?: Array<Partial<SymptomCheckIn>>;
  markerAliasOverrides?: Record<string, string>;
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
  interventions: [],
  protocols: [],
  supplementTimeline: [],
  wellbeingEntries: [],
  checkIns: [],
  markerAliasOverrides: {},
  settings: DEFAULT_SETTINGS
});

const ANALYST_MEMORY_KEY = "analyst-memory";

const normalizeSamplingTiming = (value: unknown): ReportAnnotations["samplingTiming"] => {
  return value === "trough" || value === "mid" || value === "peak" || value === "unknown" ? value : "unknown";
};

const normalizeSupplementAnchorState = (
  value: unknown,
  normalizedOverrides: SupplementPeriod[] | null
): ReportAnnotations["supplementAnchorState"] => {
  if (value === "inherit" || value === "anchor" || value === "none" || value === "unknown") {
    return value;
  }
  if (normalizedOverrides === null) {
    return "inherit";
  }
  return normalizedOverrides.length > 0 ? "anchor" : "none";
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
  if (rounded < 1 || rounded > 10) {
    return null;
  }
  return rounded;
};

const normalizeUserProfile = (value: unknown, fallback: UserProfile = DEFAULT_SETTINGS.userProfile): UserProfile => {
  return value === "trt" || value === "enhanced" || value === "health" || value === "biohacker" ? value : fallback;
};

const normalizeWellbeingValues = (value: unknown): Partial<Record<WellbeingMetricId, number>> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const source = value as Record<string, unknown>;
  const keys: WellbeingMetricId[] = ["energy", "mood", "sleep", "libido", "motivation", "recovery", "stress", "focus"];
  return keys.reduce(
    (acc, key) => {
      const normalized = normalizeScore(source[key]);
      if (normalized !== null) {
        acc[key] = normalized;
      }
      return acc;
    },
    {} as Partial<Record<WellbeingMetricId, number>>
  );
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
  const normalizedValues = normalizeWellbeingValues((row as unknown as { values?: unknown }).values);
  const energy = normalizeScore(row.energy);
  const libido = normalizeScore(row.libido);
  const mood = normalizeScore(row.mood);
  const sleep = normalizeScore(row.sleep);
  const motivation = normalizeScore(row.motivation);

  const values: Partial<Record<WellbeingMetricId, number>> = {
    ...normalizedValues,
    ...(energy !== null ? { energy } : {}),
    ...(mood !== null ? { mood } : {}),
    ...(sleep !== null ? { sleep } : {}),
    ...(libido !== null ? { libido } : {}),
    ...(motivation !== null ? { motivation } : {})
  };

  return {
    id: String(row.id ?? createId()),
    date,
    profileAtEntry: normalizeUserProfile((row as unknown as { profileAtEntry?: unknown }).profileAtEntry),
    values,
    energy: values.energy ?? null,
    libido: values.libido ?? null,
    mood: values.mood ?? null,
    sleep: values.sleep ?? null,
    motivation: values.motivation ?? null,
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
  const dose = String((row as Partial<CompoundEntry> & { dose?: unknown }).dose ?? row.doseMg ?? "").trim();
  return {
    name,
    dose,
    doseMg: dose,
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

  const rawItems = Array.isArray((value as Partial<Protocol> & { items?: unknown[] }).items)
    ? ((value as Partial<Protocol> & { items?: unknown[] }).items ?? [])
    : Array.isArray(value.compounds)
      ? value.compounds
      : [];

  const items = rawItems
    .map((entry) => normalizeCompoundEntry(entry))
    .filter((entry): entry is CompoundEntry => entry !== null);

  const compounds = items;

  return {
    id,
    name,
    items,
    compounds,
    notes: String(value.notes ?? ""),
    createdAt: typeof value.createdAt === "string" && value.createdAt ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === "string" && value.updatedAt ? value.updatedAt : new Date().toISOString()
  };
};

const normalizeAnnotations = (annotations?: Partial<ReportAnnotations>): ReportAnnotations => {
  const interventionIdRaw = (annotations as Partial<ReportAnnotations> & { interventionId?: unknown })?.interventionId;
  const protocolIdRaw = annotations?.protocolId;
  const selectedId = interventionIdRaw ?? protocolIdRaw;
  const interventionId = typeof selectedId === "string" && selectedId.trim().length > 0 ? selectedId : null;
  const interventionLabelRaw = (annotations as Partial<ReportAnnotations> & { interventionLabel?: unknown })?.interventionLabel;
  const selectedLabel = interventionLabelRaw ?? annotations?.protocol;
  const interventionLabel = String(selectedLabel ?? "");
  const normalizedOverrides = normalizeSupplementOverrides(annotations?.supplementOverrides);
  const supplementAnchorState = normalizeSupplementAnchorState(annotations?.supplementAnchorState, normalizedOverrides);
  const supplementOverrides =
    supplementAnchorState === "anchor"
      ? normalizedOverrides && normalizedOverrides.length > 0
        ? normalizedOverrides
        : []
      : supplementAnchorState === "none"
        ? []
        : null;

  return {
    interventionId,
    interventionLabel,
    protocolId: interventionId,
    protocol: interventionLabel,
    supplementAnchorState,
    supplementOverrides,
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
  const rawMarkerLabel = typeof marker.rawMarker === "string" ? marker.rawMarker.trim() : "";
  const legacyCanonicalLabel = String(marker.canonicalMarker ?? "").trim();
  const canonicalSourceLabel = rawMarkerLabel || markerLabel || legacyCanonicalLabel;

  let canonicalMarker = canonicalizeMarker(canonicalSourceLabel || "Unknown Marker");
  if (!canonicalMarker || canonicalMarker === "Unknown Marker") {
    canonicalMarker = canonicalizeMarker(legacyCanonicalLabel || markerLabel || "Unknown Marker");
  }

  const normalizedCanonical = normalizeMarkerLookupKey(canonicalMarker);
  if (
    normalizedCanonical === "bicarbonate" ||
    normalizedCanonical === "co2" ||
    normalizedCanonical === "total co2" ||
    normalizedCanonical === "co2 total" ||
    normalizedCanonical === "hco3"
  ) {
    canonicalMarker = "Carbon Dioxide";
  }
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
    rawMarker: rawMarkerLabel || markerLabel || canonicalMarker,
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
      provider:
        report.extraction?.provider === "claude"
          ? "claude"
          : report.extraction?.provider === "gemini"
            ? "gemini"
            : "fallback",
      model: String(report.extraction?.model ?? "legacy-import"),
      confidence:
        typeof report.extraction?.confidence === "number" && Number.isFinite(report.extraction.confidence)
          ? report.extraction.confidence
          : 0.8,
      needsReview: Boolean(report.extraction?.needsReview),
      warningCode:
        report.extraction?.warningCode === "PDF_TEXT_LAYER_EMPTY" ||
        report.extraction?.warningCode === "PDF_TEXT_EXTRACTION_FAILED" ||
        report.extraction?.warningCode === "PDF_OCR_INIT_FAILED" ||
        report.extraction?.warningCode === "PDF_OCR_PARTIAL" ||
        report.extraction?.warningCode === "PDF_LOW_CONFIDENCE_LOCAL" ||
        report.extraction?.warningCode === "PDF_UNKNOWN_LAYOUT" ||
        report.extraction?.warningCode === "PDF_AI_TEXT_ONLY_INSUFFICIENT" ||
        report.extraction?.warningCode === "PDF_AI_PDF_RESCUE_SKIPPED_COST_MODE" ||
        report.extraction?.warningCode === "PDF_AI_PDF_RESCUE_SKIPPED_SIZE" ||
        report.extraction?.warningCode === "PDF_AI_PDF_RESCUE_FAILED" ||
        report.extraction?.warningCode === "PDF_AI_SKIPPED_COST_MODE" ||
        report.extraction?.warningCode === "PDF_AI_SKIPPED_BUDGET" ||
        report.extraction?.warningCode === "PDF_AI_SKIPPED_RATE_LIMIT" ||
        report.extraction?.warningCode === "PDF_AI_PLAN_REQUIRED" ||
        report.extraction?.warningCode === "PDF_AI_CONSENT_REQUIRED" ||
        report.extraction?.warningCode === "PDF_AI_DISABLED_BY_PARSER_MODE"
          ? report.extraction.warningCode
          : undefined,
      warnings: Array.isArray(report.extraction?.warnings)
        ? report.extraction.warnings
            .map((warning) => String(warning).trim())
            .filter(Boolean)
            .slice(0, 8)
        : undefined,
      debug:
        report.extraction?.debug &&
        typeof report.extraction.debug === "object" &&
        !Array.isArray(report.extraction.debug)
          ? {
              pageCount:
                typeof report.extraction.debug.pageCount === "number" && Number.isFinite(report.extraction.debug.pageCount)
                  ? Math.max(0, Math.round(report.extraction.debug.pageCount))
                  : undefined,
              textItems:
                typeof report.extraction.debug.textItems === "number" && Number.isFinite(report.extraction.debug.textItems)
                  ? Math.max(0, Math.round(report.extraction.debug.textItems))
                  : 0,
              ocrUsed: Boolean(report.extraction.debug.ocrUsed),
              ocrPages:
                typeof report.extraction.debug.ocrPages === "number" && Number.isFinite(report.extraction.debug.ocrPages)
                  ? Math.max(0, Math.round(report.extraction.debug.ocrPages))
                  : 0,
              keptRows:
                typeof report.extraction.debug.keptRows === "number" && Number.isFinite(report.extraction.debug.keptRows)
                  ? Math.max(0, Math.round(report.extraction.debug.keptRows))
                  : 0,
              rejectedRows:
                typeof report.extraction.debug.rejectedRows === "number" && Number.isFinite(report.extraction.debug.rejectedRows)
                  ? Math.max(0, Math.round(report.extraction.debug.rejectedRows))
                  : 0,
              topRejectReasons:
                report.extraction.debug.topRejectReasons &&
                typeof report.extraction.debug.topRejectReasons === "object" &&
                !Array.isArray(report.extraction.debug.topRejectReasons)
                    ? Object.fromEntries(
                        Object.entries(report.extraction.debug.topRejectReasons)
                          .map(([reason, count]) => [
                            String(reason),
                            Number.isFinite(Number(count)) ? Math.max(0, Math.round(Number(count))) : 0
                          ] as const)
                          .filter((entry) => entry[1] > 0)
                          .slice(0, 6)
                      )
                  : {},
              normalizationSummary:
                report.extraction.debug.normalizationSummary &&
                typeof report.extraction.debug.normalizationSummary === "object" &&
                !Array.isArray(report.extraction.debug.normalizationSummary)
                  ? {
                      overridesHit:
                        Number.isFinite(Number(report.extraction.debug.normalizationSummary.overridesHit))
                          ? Math.max(0, Math.round(Number(report.extraction.debug.normalizationSummary.overridesHit)))
                          : 0,
                      unknownCount:
                        Number.isFinite(Number(report.extraction.debug.normalizationSummary.unknownCount))
                          ? Math.max(0, Math.round(Number(report.extraction.debug.normalizationSummary.unknownCount)))
                          : 0,
                      lowConfidenceCount:
                        Number.isFinite(Number(report.extraction.debug.normalizationSummary.lowConfidenceCount))
                          ? Math.max(0, Math.round(Number(report.extraction.debug.normalizationSummary.lowConfidenceCount)))
                          : 0
                    }
                  : undefined,
              aiInputTokens:
                typeof report.extraction.debug.aiInputTokens === "number" && Number.isFinite(report.extraction.debug.aiInputTokens)
                  ? Math.max(0, Math.round(report.extraction.debug.aiInputTokens))
                  : undefined,
              aiOutputTokens:
                typeof report.extraction.debug.aiOutputTokens === "number" && Number.isFinite(report.extraction.debug.aiOutputTokens)
                  ? Math.max(0, Math.round(report.extraction.debug.aiOutputTokens))
                  : undefined,
              aiCacheHit:
                typeof report.extraction.debug.aiCacheHit === "boolean" ? report.extraction.debug.aiCacheHit : undefined,
              aiAttemptedModes:
                Array.isArray(report.extraction.debug.aiAttemptedModes)
                  ? report.extraction.debug.aiAttemptedModes
                      .map((mode) => String(mode))
                      .filter((mode) => mode === "text_only" || mode === "pdf_rescue")
                  : undefined,
              aiRescueTriggered:
                typeof report.extraction.debug.aiRescueTriggered === "boolean"
                  ? report.extraction.debug.aiRescueTriggered
                  : undefined,
              aiRescueReason:
                typeof report.extraction.debug.aiRescueReason === "string"
                  ? report.extraction.debug.aiRescueReason.slice(0, 200)
                  : undefined,
              extractionRoute:
                report.extraction.debug.extractionRoute === "local-text" ||
                report.extraction.debug.extractionRoute === "local-ocr" ||
                report.extraction.debug.extractionRoute === "local-text-ocr-merged" ||
                report.extraction.debug.extractionRoute === "gemini-with-text" ||
                report.extraction.debug.extractionRoute === "gemini-with-ocr" ||
                report.extraction.debug.extractionRoute === "gemini-vision-only" ||
                report.extraction.debug.extractionRoute === "empty"
                  ? report.extraction.debug.extractionRoute
                  : undefined,
              routing:
                report.extraction.debug.routing &&
                typeof report.extraction.debug.routing === "object" &&
                !Array.isArray(report.extraction.debug.routing)
                  ? {
                      primaryLanguage:
                        typeof report.extraction.debug.routing.primaryLanguage === "string"
                          ? report.extraction.debug.routing.primaryLanguage.slice(0, 32)
                          : undefined,
                      languageCandidates:
                        Array.isArray(report.extraction.debug.routing.languageCandidates)
                          ? report.extraction.debug.routing.languageCandidates
                              .map((entry) => {
                                if (!entry || typeof entry !== "object") {
                                  return null;
                                }
                                const language =
                                  typeof entry.language === "string" ? entry.language.slice(0, 32) : "";
                                const score = Number(entry.score);
                                if (!language || !Number.isFinite(score)) {
                                  return null;
                                }
                                return {
                                  language,
                                  score: Math.max(0, Math.min(1, score))
                                };
                              })
                              .filter((entry): entry is { language: string; score: number } => Boolean(entry))
                              .slice(0, 4)
                          : undefined,
                      templateCandidates:
                        Array.isArray(report.extraction.debug.routing.templateCandidates)
                          ? report.extraction.debug.routing.templateCandidates
                              .map((entry) => {
                                if (!entry || typeof entry !== "object") {
                                  return null;
                                }
                                const template =
                                  typeof entry.template === "string" ? entry.template.slice(0, 64) : "";
                                const score = Number(entry.score);
                                if (!template || !Number.isFinite(score)) {
                                  return null;
                                }
                                return {
                                  template,
                                  score: Math.max(0, Math.min(100, score))
                                };
                              })
                              .filter((entry): entry is { template: string; score: number } => Boolean(entry))
                              .slice(0, 4)
                          : undefined,
                      selectedParsers:
                        Array.isArray(report.extraction.debug.routing.selectedParsers)
                          ? report.extraction.debug.routing.selectedParsers
                              .map((value) => String(value).slice(0, 64))
                              .filter(Boolean)
                              .slice(0, 3)
                          : undefined,
                      selectedOcrLangs:
                        Array.isArray(report.extraction.debug.routing.selectedOcrLangs)
                          ? report.extraction.debug.routing.selectedOcrLangs
                              .map((value) => String(value).slice(0, 32))
                              .filter(Boolean)
                              .slice(0, 3)
                          : undefined,
                      ocrFallbackLang:
                        typeof report.extraction.debug.routing.ocrFallbackLang === "string"
                          ? report.extraction.debug.routing.ocrFallbackLang.slice(0, 32)
                          : report.extraction.debug.routing.ocrFallbackLang === null
                            ? null
                            : undefined,
                      ocrPassCount:
                        Number.isFinite(Number(report.extraction.debug.routing.ocrPassCount))
                          ? Math.max(0, Math.min(5, Math.round(Number(report.extraction.debug.routing.ocrPassCount))))
                          : undefined,
                      previewOcrUsed:
                        typeof report.extraction.debug.routing.previewOcrUsed === "boolean"
                          ? report.extraction.debug.routing.previewOcrUsed
                          : undefined,
                      reason:
                        typeof report.extraction.debug.routing.reason === "string"
                          ? report.extraction.debug.routing.reason.slice(0, 200)
                          : undefined
                    }
                  : undefined
            }
          : undefined,
      costMode:
        report.extraction?.costMode === "balanced" ||
        report.extraction?.costMode === "ultra_low_cost" ||
        report.extraction?.costMode === "max_accuracy"
          ? report.extraction.costMode
          : undefined,
      aiUsed: typeof report.extraction?.aiUsed === "boolean" ? report.extraction.aiUsed : undefined,
      aiReason:
        report.extraction?.aiReason === "auto_low_quality" ||
        report.extraction?.aiReason === "manual_improve" ||
        report.extraction?.aiReason === "disabled_by_budget" ||
        report.extraction?.aiReason === "cache_hit" ||
        report.extraction?.aiReason === "local_high_quality" ||
        report.extraction?.aiReason === "disabled_by_cost_mode" ||
        report.extraction?.aiReason === "disabled_by_consent" ||
        report.extraction?.aiReason === "disabled_by_entitlement"
          ? report.extraction.aiReason
          : undefined
    }
  };

  if (isDemoReport && normalizedReport.annotations.samplingTiming === "unknown") {
    normalizedReport.annotations = {
      ...normalizedReport.annotations,
      samplingTiming: "trough"
    };
  }

  return normalizedReport;
};

const normalizeSettings = (settings?: Partial<AppSettings>): AppSettings => {
  const { claudeApiKey: _legacyClaudeApiKey, ...rest } = (settings ?? {}) as Partial<AppSettings> & {
    claudeApiKey?: string;
  };
  const rawDashboardPreset = rest.dashboardChartPreset;
  const dashboardPresetFromStorage =
    rawDashboardPreset === "clinical" ||
    rawDashboardPreset === "protocol" ||
    rawDashboardPreset === "minimal" ||
    rawDashboardPreset === "custom"
      ? rawDashboardPreset
      : null;
  const aiCostMode =
    rest.aiCostMode === "balanced" || rest.aiCostMode === "ultra_low_cost" || rest.aiCostMode === "max_accuracy"
      ? rest.aiCostMode
      : DEFAULT_SETTINGS.aiCostMode;
  const parserDebugMode =
    rest.parserDebugMode === "text_only" || rest.parserDebugMode === "text_ocr" || rest.parserDebugMode === "text_ocr_ai"
      ? rest.parserDebugMode
      : DEFAULT_SETTINGS.parserDebugMode;
  const aiAnalysisProvider =
    rest.aiAnalysisProvider === "auto" || rest.aiAnalysisProvider === "claude" || rest.aiAnalysisProvider === "gemini"
      ? rest.aiAnalysisProvider
      : DEFAULT_SETTINGS.aiAnalysisProvider;
  const userProfile =
    rest.userProfile === "trt" ||
    rest.userProfile === "enhanced" ||
    rest.userProfile === "health" ||
    rest.userProfile === "biohacker"
      ? rest.userProfile
      : DEFAULT_SETTINGS.userProfile;
  const primaryMarkersSelection = Array.isArray(rest.primaryMarkersSelection)
    ? Array.from(
        new Set(
          rest.primaryMarkersSelection
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
        )
      )
    : DEFAULT_SETTINGS.primaryMarkersSelection;
  const normalizedSettings = {
    ...DEFAULT_SETTINGS,
    ...rest,
    aiExternalConsent: typeof rest.aiExternalConsent === "boolean" ? rest.aiExternalConsent : DEFAULT_SETTINGS.aiExternalConsent,
    parserRescueConsentState:
      rest.parserRescueConsentState === "unset" || rest.parserRescueConsentState === "allowed" || rest.parserRescueConsentState === "denied"
        ? rest.parserRescueConsentState
        : DEFAULT_SETTINGS.parserRescueConsentState,
    parserRescueAllowPdfAttachment:
      typeof rest.parserRescueAllowPdfAttachment === "boolean"
        ? rest.parserRescueAllowPdfAttachment
        : DEFAULT_SETTINGS.parserRescueAllowPdfAttachment,
    aiAnalysisProvider,
    aiCostMode,
    aiAutoImproveEnabled: typeof rest.aiAutoImproveEnabled === "boolean" ? rest.aiAutoImproveEnabled : DEFAULT_SETTINGS.aiAutoImproveEnabled,
    parserDebugMode,
    primaryMarkersSelection,
    userProfile
  };

  const inferredPreset = inferDashboardChartPresetFromSettings({
    showReferenceRanges: normalizedSettings.showReferenceRanges,
    showAbnormalHighlights: normalizedSettings.showAbnormalHighlights,
    showAnnotations: normalizedSettings.showAnnotations,
    showTrtTargetZone: normalizedSettings.showTrtTargetZone,
    showLongevityTargetZone: normalizedSettings.showLongevityTargetZone,
    yAxisMode: normalizedSettings.yAxisMode
  });

  const resolvedDashboardPreset = (() => {
    if (!dashboardPresetFromStorage) {
      return inferredPreset;
    }
    if (dashboardPresetFromStorage === "custom") {
      return "custom";
    }
    if (dashboardPresetFromStorage === inferredPreset) {
      return dashboardPresetFromStorage;
    }
    return inferredPreset;
  })();

  return {
    ...normalizedSettings,
    dashboardChartPreset: resolvedDashboardPreset
  };
};

export const coerceStoredAppData = (raw: PartialAppData | null | undefined): StoredAppData => {
  if (!raw || typeof raw !== "object") {
    setMarkerAliasOverrides({});
    return createDefaultData();
  }

  const markerAliasOverrides = normalizeMarkerAliasOverrides(raw.markerAliasOverrides);
  setMarkerAliasOverrides(markerAliasOverrides);

  const reports = Array.isArray(raw.reports) ? raw.reports.map((report) => normalizeReport(report)).filter((item): item is LabReport => item !== null) : [];
  const rawInterventions = Array.isArray(raw.interventions)
    ? raw.interventions
    : Array.isArray(raw.protocols)
      ? raw.protocols
      : [];

  const interventions = rawInterventions
        .map((protocol) => normalizeProtocol(protocol))
        .filter((protocol): protocol is Protocol => protocol !== null)
        .reduce((deduped, protocol) => {
          if (deduped.some((current) => current.id === protocol.id)) {
            return deduped;
          }
          deduped.push(protocol);
          return deduped;
        }, [] as Protocol[])
  ;
  const supplementTimeline = Array.isArray(raw.supplementTimeline)
    ? raw.supplementTimeline
        .map((entry) => normalizeSupplementPeriod(entry))
        .filter((entry): entry is SupplementPeriod => entry !== null)
        .sort((left, right) => left.startDate.localeCompare(right.startDate) || left.name.localeCompare(right.name))
    : [];
  const rawWellbeingEntries = Array.isArray(raw.wellbeingEntries)
    ? raw.wellbeingEntries
    : Array.isArray(raw.checkIns)
      ? raw.checkIns
      : [];

  const wellbeingEntries = rawWellbeingEntries
        .map((entry) => normalizeSymptomCheckIn(entry))
        .filter((entry): entry is SymptomCheckIn => entry !== null)
        .sort((left, right) => left.date.localeCompare(right.date));

  // Allow multiple baselines only when they do not overlap by marker.
  const normalizedReports = normalizeBaselineFlagsByMarkerOverlap(reports);

  return {
    schemaVersion: APP_SCHEMA_VERSION,
    reports: normalizedReports,
    interventions,
    protocols: interventions,
    supplementTimeline,
    wellbeingEntries,
    checkIns: wellbeingEntries,
    markerAliasOverrides,
    settings: normalizeSettings(raw.settings)
  };
};

export const loadAppData = (): StoredAppData => {
  const storage = getStorage();
  if (!storage) {
    setMarkerAliasOverrides({});
    return createDefaultData();
  }

  const raw = storage.getItem(APP_STORAGE_KEY);
  if (!raw) {
    setMarkerAliasOverrides({});
    return createDefaultData();
  }

  try {
    const parsed = JSON.parse(raw) as PartialAppData;
    return coerceStoredAppData(parsed);
  } catch {
    setMarkerAliasOverrides({});
    return createDefaultData();
  }
};

export const saveAppData = (data: StoredAppData): void => {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  const interventions = Array.isArray(data.interventions) ? data.interventions : data.protocols;
  const wellbeingEntries = Array.isArray(data.wellbeingEntries) ? data.wellbeingEntries : data.checkIns;
  storage.setItem(
    APP_STORAGE_KEY,
    JSON.stringify({
      ...data,
      schemaVersion: APP_SCHEMA_VERSION,
      interventions,
      protocols: interventions,
      wellbeingEntries,
      checkIns: wellbeingEntries
    })
  );
};

export const loadAnalystMemory = (): AnalystMemory | null => {
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  const raw = storage.getItem(ANALYST_MEMORY_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return coerceAnalystMemory(parsed);
  } catch {
    return null;
  }
};

export const saveAnalystMemory = (memory: AnalystMemory): void => {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(ANALYST_MEMORY_KEY, JSON.stringify(memory));
  } catch (error) {
    console.error("Failed to save analyst memory:", error);
  }
};

export const clearAnalystMemory = (): void => {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(ANALYST_MEMORY_KEY);
  } catch (error) {
    console.error("Failed to clear analyst memory:", error);
  }
};


