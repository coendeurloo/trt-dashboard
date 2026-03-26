import { CanonicalMarker } from "../data/markerDatabase";
import { MarkerValue } from "../types";
import { normalizeMarkerMeasurement } from "../unitConversion";
import { deriveAbnormalFlag } from "../utils";
import { areUnitsEquivalent } from "./markerConfidence";
import { MarkerMatchResult } from "./markerMatcher";

interface NumericBand {
  min?: number;
  max?: number;
}

interface UnitInferenceCandidate {
  unit: string;
  valueRange: NumericBand;
  referenceMinRange?: NumericBand;
  referenceMaxRange?: NumericBand;
}

interface UnitInferenceProfile {
  allowValueOnly: boolean;
  candidates: UnitInferenceCandidate[];
}

export interface UnitReviewSuggestion {
  unit: string;
  confidence: "high";
  matchedBy: {
    value: boolean;
    referenceMin: boolean;
    referenceMax: boolean;
  };
}

export interface MarkerUnitReview {
  isMissingUnit: boolean;
  suggestion: UnitReviewSuggestion | null;
  options: string[];
}

export const GENERIC_UNIT_REVIEW_OPTIONS = [
  "mmol/L",
  "mg/dL",
  "umol/L",
  "ng/mL",
  "ng/dL",
  "pg/mL",
  "pmol/L",
  "mIU/L",
  "IU/L",
  "U/L",
  "g/L",
  "g/dL",
  "%",
  "ratio"
] as const;

const UNIT_INFERENCE_PROFILES: Record<string, UnitInferenceProfile> = {
  glucose: {
    allowValueOnly: true,
    candidates: [
      {
        unit: "mmol/L",
        valueRange: { min: 2.5, max: 20 },
        referenceMinRange: { min: 3.0, max: 6.5 },
        referenceMaxRange: { min: 4.0, max: 8.5 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 45, max: 360 },
        referenceMinRange: { min: 55, max: 115 },
        referenceMaxRange: { min: 70, max: 150 }
      }
    ]
  },
  hba1c: {
    allowValueOnly: true,
    candidates: [
      {
        unit: "%",
        valueRange: { min: 3, max: 16 },
        referenceMaxRange: { min: 4.5, max: 7 }
      },
      {
        unit: "mmol/mol",
        valueRange: { min: 15, max: 150 },
        referenceMaxRange: { min: 26, max: 53 }
      }
    ]
  },
  insulin: {
    allowValueOnly: false,
    candidates: [
      {
        unit: "mIU/L",
        valueRange: { min: 1, max: 80 },
        referenceMinRange: { min: 1, max: 8 },
        referenceMaxRange: { min: 8, max: 35 }
      },
      {
        unit: "pmol/L",
        valueRange: { min: 6, max: 550 },
        referenceMinRange: { min: 12, max: 60 },
        referenceMaxRange: { min: 45, max: 250 }
      }
    ]
  },
  "total-cholesterol": {
    allowValueOnly: true,
    candidates: [
      {
        unit: "mmol/L",
        valueRange: { min: 1.5, max: 12 },
        referenceMaxRange: { min: 3.0, max: 8.0 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 60, max: 450 },
        referenceMaxRange: { min: 120, max: 320 }
      }
    ]
  },
  "ldl-cholesterol": {
    allowValueOnly: true,
    candidates: [
      {
        unit: "mmol/L",
        valueRange: { min: 0.3, max: 8 },
        referenceMaxRange: { min: 1.5, max: 5.5 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 12, max: 310 },
        referenceMaxRange: { min: 60, max: 220 }
      }
    ]
  },
  "hdl-cholesterol": {
    allowValueOnly: true,
    candidates: [
      {
        unit: "mmol/L",
        valueRange: { min: 0.2, max: 4 },
        referenceMinRange: { min: 0.6, max: 2.5 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 10, max: 155 },
        referenceMinRange: { min: 25, max: 100 }
      }
    ]
  },
  triglycerides: {
    allowValueOnly: true,
    candidates: [
      {
        unit: "mmol/L",
        valueRange: { min: 0.2, max: 15 },
        referenceMaxRange: { min: 0.8, max: 4.0 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 20, max: 1300 },
        referenceMaxRange: { min: 70, max: 350 }
      }
    ]
  },
  "non-hdl-cholesterol": {
    allowValueOnly: true,
    candidates: [
      {
        unit: "mmol/L",
        valueRange: { min: 0.5, max: 10 },
        referenceMaxRange: { min: 2.0, max: 6.0 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 20, max: 390 },
        referenceMaxRange: { min: 80, max: 240 }
      }
    ]
  },
  creatinine: {
    allowValueOnly: true,
    candidates: [
      {
        unit: "umol/L",
        valueRange: { min: 20, max: 1500 },
        referenceMinRange: { min: 40, max: 90 },
        referenceMaxRange: { min: 70, max: 140 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 0.2, max: 12 },
        referenceMinRange: { min: 0.4, max: 1.1 },
        referenceMaxRange: { min: 0.8, max: 2.0 }
      }
    ]
  },
  egfr: {
    allowValueOnly: true,
    candidates: [
      {
        unit: "mL/min/1.73m2",
        valueRange: { min: 10, max: 180 },
        referenceMinRange: { min: 45, max: 90 }
      }
    ]
  },
  "acr-urine": {
    allowValueOnly: false,
    candidates: [
      {
        unit: "mg/mmol",
        valueRange: { min: 0.01, max: 300 },
        referenceMaxRange: { min: 1, max: 10 }
      },
      {
        unit: "mg/g",
        valueRange: { min: 0.5, max: 2600 },
        referenceMaxRange: { min: 10, max: 90 }
      }
    ]
  },
  "microalbumin-urine": {
    allowValueOnly: false,
    candidates: [
      {
        unit: "mg/L",
        valueRange: { min: 0.1, max: 5000 },
        referenceMaxRange: { min: 10, max: 60 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 0.01, max: 500 },
        referenceMaxRange: { min: 1, max: 6 }
      }
    ]
  },
  tsh: {
    allowValueOnly: true,
    candidates: [
      {
        unit: "mIU/L",
        valueRange: { min: 0.01, max: 100 },
        referenceMinRange: { min: 0.1, max: 2 },
        referenceMaxRange: { min: 2, max: 10 }
      }
    ]
  },
  "testosterone-total": {
    allowValueOnly: false,
    candidates: [
      {
        unit: "nmol/L",
        valueRange: { min: 0.5, max: 80 },
        referenceMinRange: { min: 2, max: 20 },
        referenceMaxRange: { min: 10, max: 45 }
      },
      {
        unit: "ng/dL",
        valueRange: { min: 20, max: 2300 },
        referenceMinRange: { min: 100, max: 600 },
        referenceMaxRange: { min: 300, max: 1500 }
      }
    ]
  },
  "free-testosterone": {
    allowValueOnly: false,
    candidates: [
      {
        unit: "pmol/L",
        valueRange: { min: 10, max: 2000 },
        referenceMinRange: { min: 40, max: 250 },
        referenceMaxRange: { min: 200, max: 900 }
      },
      {
        unit: "pg/mL",
        valueRange: { min: 1, max: 300 },
        referenceMinRange: { min: 3, max: 25 },
        referenceMaxRange: { min: 10, max: 80 }
      }
    ]
  },
  estradiol: {
    allowValueOnly: false,
    candidates: [
      {
        unit: "pmol/L",
        valueRange: { min: 10, max: 1500 },
        referenceMinRange: { min: 20, max: 120 },
        referenceMaxRange: { min: 80, max: 250 }
      },
      {
        unit: "pg/mL",
        valueRange: { min: 3, max: 400 },
        referenceMinRange: { min: 5, max: 35 },
        referenceMaxRange: { min: 20, max: 70 }
      }
    ]
  },
  prolactin: {
    allowValueOnly: false,
    candidates: [
      {
        unit: "mIU/L",
        valueRange: { min: 10, max: 5000 },
        referenceMinRange: { min: 40, max: 150 },
        referenceMaxRange: { min: 180, max: 600 }
      },
      {
        unit: "ng/mL",
        valueRange: { min: 0.5, max: 250 },
        referenceMinRange: { min: 2, max: 7 },
        referenceMaxRange: { min: 8, max: 30 }
      }
    ]
  },
  "psa-total": {
    allowValueOnly: true,
    candidates: [
      {
        unit: "ug/L",
        valueRange: { min: 0, max: 100 },
        referenceMaxRange: { min: 1.5, max: 8 }
      }
    ]
  },
  "vitamin-d": {
    allowValueOnly: false,
    candidates: [
      {
        unit: "nmol/L",
        valueRange: { min: 5, max: 400 },
        referenceMinRange: { min: 25, max: 90 },
        referenceMaxRange: { min: 80, max: 180 }
      },
      {
        unit: "ng/mL",
        valueRange: { min: 2, max: 160 },
        referenceMinRange: { min: 10, max: 35 },
        referenceMaxRange: { min: 30, max: 80 }
      }
    ]
  },
  ferritin: {
    allowValueOnly: false,
    candidates: [
      {
        unit: "ug/L",
        valueRange: { min: 1, max: 5000 },
        referenceMinRange: { min: 10, max: 80 },
        referenceMaxRange: { min: 120, max: 600 }
      },
      {
        unit: "ng/mL",
        valueRange: { min: 1, max: 5000 },
        referenceMinRange: { min: 10, max: 80 },
        referenceMaxRange: { min: 120, max: 600 }
      }
    ]
  }
};

const toNullableNumber = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const isWithinBand = (value: number, range?: NumericBand): boolean => {
  if (!range) {
    return true;
  }
  if (range.min !== undefined && value < range.min) {
    return false;
  }
  if (range.max !== undefined && value > range.max) {
    return false;
  }
  return true;
};

const pushUniqueUnit = (units: string[], nextUnit: string): void => {
  const trimmed = nextUnit.trim();
  if (!trimmed) {
    return;
  }
  if (units.some((existing) => areUnitsEquivalent(existing, trimmed))) {
    return;
  }
  units.push(trimmed);
};

const resolveUnitOptions = (profile: UnitInferenceProfile | undefined, marker: CanonicalMarker | null): string[] => {
  const options: string[] = [];

  profile?.candidates.forEach((candidate) => pushUniqueUnit(options, candidate.unit));
  if (marker) {
    pushUniqueUnit(options, marker.preferredUnit);
    marker.alternateUnits.forEach((unit) => pushUniqueUnit(options, unit));
  }
  if (options.length === 0) {
    GENERIC_UNIT_REVIEW_OPTIONS.forEach((unit) => pushUniqueUnit(options, unit));
  }

  return options;
};

const inferMissingUnit = (
  marker: MarkerValue,
  canonicalMarker: CanonicalMarker | null
): UnitReviewSuggestion | null => {
  const profile = canonicalMarker ? UNIT_INFERENCE_PROFILES[canonicalMarker.id] : undefined;
  if (!profile) {
    return null;
  }

  const value = toNullableNumber(typeof marker.rawValue === "number" ? marker.rawValue : marker.value);
  if (value === null) {
    return null;
  }

  const referenceMin = toNullableNumber(marker.rawReferenceMin !== undefined ? marker.rawReferenceMin ?? null : marker.referenceMin);
  const referenceMax = toNullableNumber(marker.rawReferenceMax !== undefined ? marker.rawReferenceMax ?? null : marker.referenceMax);
  const hasReference = referenceMin !== null || referenceMax !== null;

  const matches = profile.candidates
    .map((candidate) => {
      const valueMatches = isWithinBand(value, candidate.valueRange);
      if (!valueMatches) {
        return null;
      }

      if (referenceMin !== null && !isWithinBand(referenceMin, candidate.referenceMinRange)) {
        return null;
      }
      if (referenceMax !== null && !isWithinBand(referenceMax, candidate.referenceMaxRange)) {
        return null;
      }
      if (!hasReference && !profile.allowValueOnly) {
        return null;
      }

      return {
        unit: candidate.unit,
        matchedBy: {
          value: true,
          referenceMin: referenceMin !== null,
          referenceMax: referenceMax !== null
        }
      };
    })
    .filter((candidate): candidate is { unit: string; matchedBy: UnitReviewSuggestion["matchedBy"] } => candidate !== null);

  if (matches.length !== 1) {
    return null;
  }

  return {
    unit: matches[0].unit,
    confidence: "high",
    matchedBy: matches[0].matchedBy
  };
};

export const buildMarkerUnitReview = (
  marker: MarkerValue,
  matchResult: MarkerMatchResult
): MarkerUnitReview => {
  const isMissingUnit = String(marker.unit ?? "").trim().length === 0;
  const canonicalMarker = matchResult.canonical;
  const profile = canonicalMarker ? UNIT_INFERENCE_PROFILES[canonicalMarker.id] : undefined;
  const suggestion = isMissingUnit ? inferMissingUnit(marker, canonicalMarker) : null;
  const baseOptions = resolveUnitOptions(profile, canonicalMarker);
  const options =
    suggestion === null
      ? baseOptions
      : [suggestion.unit, ...baseOptions.filter((option) => !areUnitsEquivalent(option, suggestion.unit))];

  return {
    isMissingUnit,
    suggestion,
    options
  };
};

export const normalizeMarkerWithSourceFields = (marker: MarkerValue): MarkerValue => {
  const sourceValue = typeof marker.rawValue === "number" ? marker.rawValue : marker.value;
  const sourceUnit = marker.rawUnit ?? marker.unit;
  const sourceReferenceMin = marker.rawReferenceMin !== undefined ? marker.rawReferenceMin : marker.referenceMin;
  const sourceReferenceMax = marker.rawReferenceMax !== undefined ? marker.rawReferenceMax : marker.referenceMax;
  const normalized = normalizeMarkerMeasurement({
    canonicalMarker: marker.canonicalMarker,
    value: sourceValue,
    unit: sourceUnit,
    referenceMin: sourceReferenceMin,
    referenceMax: sourceReferenceMax
  });

  return {
    ...marker,
    rawValue: sourceValue,
    rawUnit: sourceUnit,
    rawReferenceMin: sourceReferenceMin,
    rawReferenceMax: sourceReferenceMax,
    value: normalized.value,
    unit: normalized.unit,
    referenceMin: normalized.referenceMin,
    referenceMax: normalized.referenceMax,
    abnormal: deriveAbnormalFlag(normalized.value, normalized.referenceMin, normalized.referenceMax)
  };
};

export const applyConfirmedMarkerUnit = (marker: MarkerValue, selectedUnit: string): MarkerValue =>
  normalizeMarkerWithSourceFields({
    ...marker,
    rawUnit: selectedUnit.trim()
  });
