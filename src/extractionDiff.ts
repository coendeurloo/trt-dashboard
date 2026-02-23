import { ExtractionDiffRowChange, ExtractionDiffRowSnapshot, ExtractionDiffSummary, ExtractionDraft, ExtractionWarningCode } from "./types";

const KNOWN_WARNING_CODES: ReadonlySet<ExtractionWarningCode> = new Set<ExtractionWarningCode>([
  "PDF_TEXT_LAYER_EMPTY",
  "PDF_TEXT_EXTRACTION_FAILED",
  "PDF_OCR_INIT_FAILED",
  "PDF_OCR_PARTIAL",
  "PDF_LOW_CONFIDENCE_LOCAL",
  "PDF_UNKNOWN_LAYOUT",
  "PDF_AI_TEXT_ONLY_INSUFFICIENT",
  "PDF_AI_PDF_RESCUE_SKIPPED_COST_MODE",
  "PDF_AI_PDF_RESCUE_SKIPPED_SIZE",
  "PDF_AI_PDF_RESCUE_FAILED",
  "PDF_AI_SKIPPED_COST_MODE",
  "PDF_AI_SKIPPED_BUDGET",
  "PDF_AI_SKIPPED_RATE_LIMIT",
  "PDF_AI_LIMITS_UNAVAILABLE",
  "PDF_AI_CONSENT_REQUIRED",
  "PDF_AI_DISABLED_BY_PARSER_MODE"
]);

const collectWarningCodes = (draft: ExtractionDraft): ExtractionWarningCode[] =>
  Array.from(
    new Set([...(draft.extraction.warnings ?? []), ...(draft.extraction.warningCode ? [draft.extraction.warningCode] : [])])
  ).filter((code): code is ExtractionWarningCode => KNOWN_WARNING_CODES.has(code as ExtractionWarningCode));

const toSnapshot = (row: ExtractionDraft["markers"][number]): ExtractionDiffRowSnapshot => ({
  marker: row.marker,
  canonicalMarker: row.canonicalMarker,
  value: typeof row.rawValue === "number" ? row.rawValue : row.value,
  unit: row.rawUnit ?? row.unit,
  referenceMin: row.rawReferenceMin ?? row.referenceMin,
  referenceMax: row.rawReferenceMax ?? row.referenceMax,
  confidence: row.confidence
});

const buildMarkerMap = (draft: ExtractionDraft): Map<string, ExtractionDiffRowSnapshot> => {
  const map = new Map<string, ExtractionDiffRowSnapshot>();
  draft.markers.forEach((row) => {
    const key = row.canonicalMarker || row.marker || "Unknown Marker";
    const next = toSnapshot(row);
    const existing = map.get(key);
    if (!existing || next.confidence > existing.confidence) {
      map.set(key, next);
    }
  });
  return map;
};

const sameNumber = (left: number | null, right: number | null): boolean => {
  if (left === null || right === null) {
    return left === right;
  }
  return Math.abs(left - right) < 0.0000001;
};

const changedFields = (
  local: ExtractionDiffRowSnapshot,
  ai: ExtractionDiffRowSnapshot
): NonNullable<ExtractionDiffRowChange["changedFields"]> => {
  const fields: NonNullable<ExtractionDiffRowChange["changedFields"]> = [];
  if (local.marker !== ai.marker) {
    fields.push("marker");
  }
  if (!sameNumber(local.value, ai.value)) {
    fields.push("value");
  }
  if (local.unit !== ai.unit) {
    fields.push("unit");
  }
  if (!sameNumber(local.referenceMin, ai.referenceMin)) {
    fields.push("referenceMin");
  }
  if (!sameNumber(local.referenceMax, ai.referenceMax)) {
    fields.push("referenceMax");
  }
  if (!sameNumber(local.confidence, ai.confidence)) {
    fields.push("confidence");
  }
  return fields;
};

export const buildExtractionDiffSummary = (localDraft: ExtractionDraft, aiDraft: ExtractionDraft): ExtractionDiffSummary => {
  const localMap = buildMarkerMap(localDraft);
  const aiMap = buildMarkerMap(aiDraft);
  const allKeys = new Set([...localMap.keys(), ...aiMap.keys()]);

  const added: ExtractionDiffRowChange[] = [];
  const removed: ExtractionDiffRowChange[] = [];
  const changed: ExtractionDiffRowChange[] = [];

  Array.from(allKeys)
    .sort((left, right) => left.localeCompare(right))
    .forEach((key) => {
      const local = localMap.get(key);
      const ai = aiMap.get(key);

      if (!local && ai) {
        added.push({
          canonicalMarker: ai.canonicalMarker,
          marker: ai.marker,
          ai
        });
        return;
      }

      if (local && !ai) {
        removed.push({
          canonicalMarker: local.canonicalMarker,
          marker: local.marker,
          local
        });
        return;
      }

      if (!local || !ai) {
        return;
      }

      const fields = changedFields(local, ai);
      if (fields.length > 0) {
        changed.push({
          canonicalMarker: local.canonicalMarker,
          marker: ai.marker || local.marker,
          local,
          ai,
          changedFields: fields
        });
      }
    });

  const localWarnings = collectWarningCodes(localDraft);
  const aiWarnings = collectWarningCodes(aiDraft);
  const testDateChanged = localDraft.testDate !== aiDraft.testDate;

  return {
    local: {
      markerCount: localDraft.markers.length,
      confidence: localDraft.extraction.confidence,
      warnings: localWarnings
    },
    ai: {
      markerCount: aiDraft.markers.length,
      confidence: aiDraft.extraction.confidence,
      warnings: aiWarnings
    },
    localTestDate: localDraft.testDate,
    aiTestDate: aiDraft.testDate,
    testDateChanged,
    added,
    removed,
    changed,
    hasChanges: testDateChanged || added.length > 0 || removed.length > 0 || changed.length > 0
  };
};
