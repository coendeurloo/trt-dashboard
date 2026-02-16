import { MARKER_ALIAS_LOOKUP } from "./constants";
import { UnitSystem } from "./types";

interface ConversionRule {
  canonicalMarker: string;
  euUnit: string;
  usUnit: string;
  euToUs: (value: number) => number;
  usToEu: (value: number) => number;
}

const TESTOSTERONE_NMOL_TO_NGDL = 28.84;
const TESTOSTERONE_NGML_TO_NMOL = 100 / TESTOSTERONE_NMOL_TO_NGDL;
const FREE_TESTOSTERONE_NMOL_TO_PGML = 288.4;
const ESTRADIOL_PGML_TO_PMOL = 3.671;
const HEMOGLOBIN_GPL_TO_MMOLL = 0.06206;
const HEMOGLOBIN_GPDL_TO_MMOLL = 0.6206;
const MCH_PG_TO_FMOL = 0.06206;

const conversionRules: ConversionRule[] = [
  {
    canonicalMarker: "Testosterone",
    euUnit: "nmol/L",
    usUnit: "ng/dL",
    euToUs: (value) => value * TESTOSTERONE_NMOL_TO_NGDL,
    usToEu: (value) => value / TESTOSTERONE_NMOL_TO_NGDL
  },
  {
    canonicalMarker: "Free Testosterone",
    euUnit: "nmol/L",
    usUnit: "pg/mL",
    euToUs: (value) => value * FREE_TESTOSTERONE_NMOL_TO_PGML,
    usToEu: (value) => value / FREE_TESTOSTERONE_NMOL_TO_PGML
  },
  {
    canonicalMarker: "Estradiol",
    euUnit: "pmol/L",
    usUnit: "pg/mL",
    euToUs: (value) => value / ESTRADIOL_PGML_TO_PMOL,
    usToEu: (value) => value * ESTRADIOL_PGML_TO_PMOL
  }
];

const normalizeMarkerText = (input: string): string => {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizedAliasEntries = Object.entries(MARKER_ALIAS_LOOKUP)
  .map(([alias, canonical]) => ({
    alias: normalizeMarkerText(alias),
    canonical
  }))
  .filter((entry) => entry.alias.length > 0)
  .sort((a, b) => b.alias.length - a.alias.length);

const hasWholeAlias = (normalizedText: string, alias: string): boolean => {
  const pattern = new RegExp(`\\b${escapeRegex(alias)}\\b`);
  return pattern.test(normalizedText);
};

export const canonicalizeMarker = (input: string): string => {
  const normalized = normalizeMarkerText(input);
  if (!normalized) {
    return "Unknown Marker";
  }

  if (/\bbioavailable\b/.test(normalized) && /\b(?:testosterone|testosteron)\b/.test(normalized)) {
    return "Bioavailable Testosterone";
  }

  if (
    /\b(testosterone|testosteron)\b/.test(normalized) &&
    /\b(free|vrij|vrije)\b/.test(normalized) &&
    /\b(calculated|berekend|derived)\b/.test(normalized)
  ) {
    return "Free Testosterone";
  }

  // Prefer the explicit "free + testosterone" pattern before generic testosterone aliases.
  if (
    /\b(testosterone|testosteron)\b/.test(normalized) &&
    /\b(free|vrij|vrije)\b/.test(normalized)
  ) {
    return "Free Testosterone";
  }

  const exact = normalizedAliasEntries.find((entry) => entry.alias === normalized);
  if (exact) {
    return exact.canonical;
  }

  const includes = normalizedAliasEntries.find((entry) => hasWholeAlias(normalized, entry.alias));
  if (includes) {
    return includes.canonical;
  }

  if (!input.trim()) {
    return "Unknown Marker";
  }

  return input
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

const getRule = (canonicalMarker: string): ConversionRule | undefined => {
  return conversionRules.find((rule) => rule.canonicalMarker === canonicalMarker);
};

interface MarkerMeasurement {
  canonicalMarker: string;
  value: number;
  unit: string;
  referenceMin: number | null;
  referenceMax: number | null;
}

const normalizeUnitToken = (unit: string): string => unit.toLowerCase().replace(/\s+/g, "");
const isOneOf = (value: string, candidates: string[]): boolean => candidates.includes(value);
const scaleNullable = (value: number | null, factor: number): number | null => (value === null ? null : value * factor);

const isHematocritRatioUnit = (normalizedUnit: string): boolean => {
  return normalizedUnit === "l/l" || normalizedUnit === "ll" || normalizedUnit === "ratio" || normalizedUnit === "fraction";
};

const toPercentIfRatio = (value: number | null): number | null => {
  if (value === null) {
    return null;
  }
  return value <= 1.5 ? value * 100 : value;
};

const normalizeMarkerUnits = (
  measurement: MarkerMeasurement,
  normalizedUnit: string
): Omit<MarkerMeasurement, "canonicalMarker"> | null => {
  if (measurement.canonicalMarker === "Testosterone") {
    if (isOneOf(normalizedUnit, ["nmol/l", "nmoll"])) {
      return {
        value: measurement.value,
        unit: "nmol/L",
        referenceMin: measurement.referenceMin,
        referenceMax: measurement.referenceMax
      };
    }
    if (isOneOf(normalizedUnit, ["ng/ml", "ngml"])) {
      return {
        value: measurement.value * TESTOSTERONE_NGML_TO_NMOL,
        unit: "nmol/L",
        referenceMin: scaleNullable(measurement.referenceMin, TESTOSTERONE_NGML_TO_NMOL),
        referenceMax: scaleNullable(measurement.referenceMax, TESTOSTERONE_NGML_TO_NMOL)
      };
    }
    if (isOneOf(normalizedUnit, ["ng/dl", "ngdl"])) {
      const factor = 1 / TESTOSTERONE_NMOL_TO_NGDL;
      return {
        value: measurement.value * factor,
        unit: "nmol/L",
        referenceMin: scaleNullable(measurement.referenceMin, factor),
        referenceMax: scaleNullable(measurement.referenceMax, factor)
      };
    }
    return null;
  }

  if (measurement.canonicalMarker === "Free Testosterone") {
    if (isOneOf(normalizedUnit, ["nmol/l", "nmoll"])) {
      return {
        value: measurement.value,
        unit: "nmol/L",
        referenceMin: measurement.referenceMin,
        referenceMax: measurement.referenceMax
      };
    }
    if (isOneOf(normalizedUnit, ["pmol/l", "pmoll"])) {
      const factor = 1 / 1000;
      return {
        value: measurement.value * factor,
        unit: "nmol/L",
        referenceMin: scaleNullable(measurement.referenceMin, factor),
        referenceMax: scaleNullable(measurement.referenceMax, factor)
      };
    }
    if (isOneOf(normalizedUnit, ["pg/ml", "pgml"])) {
      const factor = 1 / FREE_TESTOSTERONE_NMOL_TO_PGML;
      return {
        value: measurement.value * factor,
        unit: "nmol/L",
        referenceMin: scaleNullable(measurement.referenceMin, factor),
        referenceMax: scaleNullable(measurement.referenceMax, factor)
      };
    }
    return null;
  }

  if (measurement.canonicalMarker === "Estradiol") {
    if (isOneOf(normalizedUnit, ["pmol/l", "pmoll"])) {
      return {
        value: measurement.value,
        unit: "pmol/L",
        referenceMin: measurement.referenceMin,
        referenceMax: measurement.referenceMax
      };
    }
    if (isOneOf(normalizedUnit, ["pg/ml", "pgml"])) {
      return {
        value: measurement.value * ESTRADIOL_PGML_TO_PMOL,
        unit: "pmol/L",
        referenceMin: scaleNullable(measurement.referenceMin, ESTRADIOL_PGML_TO_PMOL),
        referenceMax: scaleNullable(measurement.referenceMax, ESTRADIOL_PGML_TO_PMOL)
      };
    }
    return null;
  }

  if (measurement.canonicalMarker === "SHBG" && isOneOf(normalizedUnit, ["nmol/l", "nmoll"])) {
    return {
      value: measurement.value,
      unit: "nmol/L",
      referenceMin: measurement.referenceMin,
      referenceMax: measurement.referenceMax
    };
  }

  if (measurement.canonicalMarker === "Hemoglobin") {
    if (isOneOf(normalizedUnit, ["mmol/l", "mmoll"])) {
      return {
        value: measurement.value,
        unit: "mmol/L",
        referenceMin: measurement.referenceMin,
        referenceMax: measurement.referenceMax
      };
    }
    if (isOneOf(normalizedUnit, ["g/l", "gl"])) {
      return {
        value: measurement.value * HEMOGLOBIN_GPL_TO_MMOLL,
        unit: "mmol/L",
        referenceMin: scaleNullable(measurement.referenceMin, HEMOGLOBIN_GPL_TO_MMOLL),
        referenceMax: scaleNullable(measurement.referenceMax, HEMOGLOBIN_GPL_TO_MMOLL)
      };
    }
    if (isOneOf(normalizedUnit, ["g/dl", "gdl"])) {
      return {
        value: measurement.value * HEMOGLOBIN_GPDL_TO_MMOLL,
        unit: "mmol/L",
        referenceMin: scaleNullable(measurement.referenceMin, HEMOGLOBIN_GPDL_TO_MMOLL),
        referenceMax: scaleNullable(measurement.referenceMax, HEMOGLOBIN_GPDL_TO_MMOLL)
      };
    }
    return null;
  }

  if (measurement.canonicalMarker === "MCH") {
    if (isOneOf(normalizedUnit, ["fmol"])) {
      return {
        value: measurement.value,
        unit: "fmol",
        referenceMin: measurement.referenceMin,
        referenceMax: measurement.referenceMax
      };
    }
    if (isOneOf(normalizedUnit, ["pg"])) {
      return {
        value: measurement.value * MCH_PG_TO_FMOL,
        unit: "fmol",
        referenceMin: scaleNullable(measurement.referenceMin, MCH_PG_TO_FMOL),
        referenceMax: scaleNullable(measurement.referenceMax, MCH_PG_TO_FMOL)
      };
    }
    return null;
  }

  if (measurement.canonicalMarker === "MCHC") {
    if (isOneOf(normalizedUnit, ["mmol/l", "mmoll"])) {
      return {
        value: measurement.value,
        unit: "mmol/L",
        referenceMin: measurement.referenceMin,
        referenceMax: measurement.referenceMax
      };
    }
    if (isOneOf(normalizedUnit, ["g/l", "gl"])) {
      return {
        value: measurement.value * HEMOGLOBIN_GPL_TO_MMOLL,
        unit: "mmol/L",
        referenceMin: scaleNullable(measurement.referenceMin, HEMOGLOBIN_GPL_TO_MMOLL),
        referenceMax: scaleNullable(measurement.referenceMax, HEMOGLOBIN_GPL_TO_MMOLL)
      };
    }
    if (isOneOf(normalizedUnit, ["g/dl", "gdl"])) {
      return {
        value: measurement.value * HEMOGLOBIN_GPDL_TO_MMOLL,
        unit: "mmol/L",
        referenceMin: scaleNullable(measurement.referenceMin, HEMOGLOBIN_GPDL_TO_MMOLL),
        referenceMax: scaleNullable(measurement.referenceMax, HEMOGLOBIN_GPDL_TO_MMOLL)
      };
    }
    return null;
  }

  return null;
};

export const normalizeMarkerMeasurement = (measurement: MarkerMeasurement): Omit<MarkerMeasurement, "canonicalMarker"> => {
  const normalizedUnit = normalizeUnitToken(measurement.unit);

  const markerNormalized = normalizeMarkerUnits(measurement, normalizedUnit);
  if (markerNormalized) {
    return markerNormalized;
  }

  if (measurement.canonicalMarker !== "Hematocrit") {
    return {
      value: measurement.value,
      unit: measurement.unit,
      referenceMin: measurement.referenceMin,
      referenceMax: measurement.referenceMax
    };
  }

  const hasRatioHint =
    isHematocritRatioUnit(normalizedUnit) ||
    measurement.value <= 1.5 ||
    (measurement.referenceMin !== null && measurement.referenceMin <= 1.5) ||
    (measurement.referenceMax !== null && measurement.referenceMax <= 1.5);

  if (!hasRatioHint) {
    return {
      value: measurement.value,
      unit: "%",
      referenceMin: measurement.referenceMin,
      referenceMax: measurement.referenceMax
    };
  }

  return {
    value: toPercentIfRatio(measurement.value) ?? measurement.value,
    unit: "%",
    referenceMin: toPercentIfRatio(measurement.referenceMin),
    referenceMax: toPercentIfRatio(measurement.referenceMax)
  };
};

export const convertBySystem = (
  canonicalMarker: string,
  value: number,
  currentUnit: string,
  targetSystem: UnitSystem
): { value: number; unit: string } => {
  const normalizedMeasurement = normalizeMarkerMeasurement({
    canonicalMarker,
    value,
    unit: currentUnit,
    referenceMin: null,
    referenceMax: null
  });

  const rule = getRule(canonicalMarker);
  if (!rule) {
    return {
      value: normalizedMeasurement.value,
      unit: normalizedMeasurement.unit || currentUnit
    };
  }

  const sourceValue = normalizedMeasurement.value;
  const sourceUnit = normalizedMeasurement.unit || currentUnit;
  const normalizedUnit = normalizeUnitToken(sourceUnit);
  const isEuUnit = normalizedUnit === rule.euUnit.toLowerCase().replace(/\s+/g, "");
  const isUsUnit = normalizedUnit === rule.usUnit.toLowerCase().replace(/\s+/g, "");

  if (targetSystem === "eu") {
    if (isEuUnit) {
      return { value: sourceValue, unit: rule.euUnit };
    }
    if (isUsUnit) {
      return { value: rule.usToEu(sourceValue), unit: rule.euUnit };
    }
    return { value: sourceValue, unit: sourceUnit };
  }

  if (isUsUnit) {
    return { value: sourceValue, unit: rule.usUnit };
  }
  if (isEuUnit) {
    return { value: rule.euToUs(sourceValue), unit: rule.usUnit };
  }
  return { value: sourceValue, unit: sourceUnit };
};
