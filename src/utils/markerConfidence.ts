import { MarkerMatchResult } from "./markerMatcher";

export type DimensionConfidence = "high" | "medium" | "low" | "missing";

export interface ParsedMarker {
  name: string;
  unit?: string | null;
  value: number | string;
  range?: { min?: number | null; max?: number | null } | null;
  referenceMin?: number | null;
  referenceMax?: number | null;
}

export interface MarkerParseConfidence {
  name: DimensionConfidence;
  unit: DimensionConfidence;
  value: DimensionConfidence;
  range: DimensionConfidence;
  overall: "ok" | "review" | "error";
  issues: string[];
  autoFixable: boolean;
  autoFix?: Partial<ParsedMarker>;
}

export const UNIT_NORMALIZATION: Record<string, string> = {
  "10x9/l": "x10^9/L",
  "10^9/l": "x10^9/L",
  "10e9/l": "x10^9/L",
  "10^3/ul": "x10^9/L",
  "10e3/ul": "x10^9/L",
  "x10^3/ul": "x10^9/L",
  "x10e3/ul": "x10^9/L",
  "k/ul": "x10^9/L",
  "thousand/ul": "x10^9/L",
  "k/mm3": "x10^9/L",
  "thousand/mm3": "x10^9/L",
  "10^3/mm3": "x10^9/L",
  "10x12/l": "x10^12/L",
  "10^12/l": "x10^12/L",
  "10e12/l": "x10^12/L",
  "10^6/ul": "x10^12/L",
  "10e6/ul": "x10^12/L",
  "x10^6/ul": "x10^12/L",
  "x10e6/ul": "x10^12/L",
  "m/ul": "x10^12/L",
  "million/ul": "x10^12/L",
  "m/mm3": "x10^12/L",
  "million/mm3": "x10^12/L",
  "10^6/mm3": "x10^12/L",
  "umol/l": "umol/L",
  "nmol/l": "nmol/L",
  "pmol/l": "pmol/L",
  "mmol/l": "mmol/L",
  "ng/ml": "ng/mL",
  "mg/dl": "mg/dL",
  "mg/l": "mg/L",
  "ug/dl": "ug/dL",
  "ug/l": "ug/L",
  "ng/l": "ng/L",
  "pg/ml": "pg/mL",
  "ng/dl": "ng/dL",
  "ml/min/1.73": "mL/min/1.73m2",
  "ml/min/1,73": "mL/min/1.73m2",
  "u/l": "U/L",
  "miu/l": "mIU/L",
  "miu/ml": "mIU/mL",
  "uiu/ml": "uIU/mL",
  "ui/l": "U/L",
  "iu/l": "IU/L",
  "/nl": "/nL",
  "/pl": "/pL",
  fl: "fL",
  fmol: "fmol"
};

const normalizeUnitUnicode = (value: string): string =>
  value
    .normalize("NFKC")
    .replace(/[μµ]/g, "u")
    .replace(/[⁄∕]/g, "/")
    .replace(/[×*]/g, "x");

const unitCompareToken = (value: string): string =>
  normalizeUnitUnicode(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

const unitSemanticToken = (value: string): string => {
  const token = unitCompareToken(value);

  if (
    token === "/nl" ||
    token === "x10^9/l" ||
    token === "10^9/l" ||
    token === "10e9/l" ||
    token === "10x9/l" ||
    token === "x10^3/ul" ||
    token === "10^3/ul" ||
    token === "10e3/ul" ||
    token === "x10e3/ul" ||
    token === "k/ul" ||
    token === "thousand/ul" ||
    token === "k/mm3" ||
    token === "thousand/mm3" ||
    token === "10^3/mm3"
  ) {
    return "count-per-liter-1e9";
  }

  if (
    token === "/pl" ||
    token === "x10^12/l" ||
    token === "10^12/l" ||
    token === "10e12/l" ||
    token === "10x12/l" ||
    token === "x10^6/ul" ||
    token === "10^6/ul" ||
    token === "10e6/ul" ||
    token === "x10e6/ul" ||
    token === "m/ul" ||
    token === "million/ul" ||
    token === "m/mm3" ||
    token === "million/mm3" ||
    token === "10^6/mm3"
  ) {
    return "count-per-liter-1e12";
  }

  // Treat common dimensionless labels as equivalent semantics.
  if (token === "ratio" || token === "index") {
    return "dimensionless-ratio";
  }

  if (token === "score" || token === "z-score" || token === "zscore" || token === "sds") {
    return "dimensionless-score";
  }

  return token;
};

const KNOWN_NORMALIZED_UNITS = new Set(
  Object.values(UNIT_NORMALIZATION).map((value) => unitCompareToken(value))
);

const toNullableNumber = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/,/g, "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeParsedUnit = (unit: string | null | undefined): { normalized: string; changed: boolean; recognized: boolean } => {
  const raw = String(unit ?? "").trim();
  if (!raw) {
    return { normalized: "", changed: false, recognized: false };
  }

  const token = unitCompareToken(raw);
  const normalized = UNIT_NORMALIZATION[token] ?? raw;
  const recognized = Boolean(UNIT_NORMALIZATION[token]) || KNOWN_NORMALIZED_UNITS.has(unitCompareToken(normalized));

  return {
    normalized,
    changed: normalized !== raw,
    recognized
  };
};

const areUnitsEquivalent = (left: string, right: string): boolean => unitSemanticToken(left) === unitSemanticToken(right);

const hasDefaultRange = (matchResult: MarkerMatchResult): boolean => {
  const marker = matchResult.canonical;
  if (!marker?.defaultRange) {
    return false;
  }
  return marker.defaultRange.min !== undefined || marker.defaultRange.max !== undefined;
};

const markerAllowsMissingUnit = (matchResult: MarkerMatchResult): boolean => {
  const marker = matchResult.canonical;
  if (!marker) {
    return false;
  }
  const semanticTokens = [marker.preferredUnit, ...marker.alternateUnits]
    .map((unit) => unitSemanticToken(unit))
    .filter(Boolean);
  return semanticTokens.includes("dimensionless-ratio") || semanticTokens.includes("dimensionless-score");
};

const parseRange = (parsed: ParsedMarker): { min: number | null; max: number | null } => {
  const rangeMin = toNullableNumber(parsed.range?.min ?? parsed.referenceMin ?? null);
  const rangeMax = toNullableNumber(parsed.range?.max ?? parsed.referenceMax ?? null);
  return { min: rangeMin, max: rangeMax };
};

const mapNameConfidence = (matchResult: MarkerMatchResult): DimensionConfidence => {
  if (matchResult.confidence === "exact" || matchResult.confidence === "alias") {
    return "high";
  }
  if (matchResult.confidence === "normalized" || matchResult.confidence === "token") {
    return "medium";
  }
  if (matchResult.confidence === "fuzzy") {
    return "low";
  }
  return "missing";
};

const isWithinPlausibleBounds = (value: number, matchResult: MarkerMatchResult): boolean => {
  const markerRange = matchResult.canonical?.defaultRange;
  if (!markerRange || (markerRange.min === undefined && markerRange.max === undefined)) {
    return true;
  }

  const rangeMin = markerRange.min;
  const rangeMax = markerRange.max;

  const lowerBound = rangeMin !== undefined ? rangeMin * 0.01 : (rangeMax ?? value) * 0.01;
  const upperBound = rangeMax !== undefined ? rangeMax * 100 : (rangeMin ?? value) * 100;

  return value >= Math.min(lowerBound, upperBound) && value <= Math.max(lowerBound, upperBound);
};

export function scoreMarkerConfidence(parsed: ParsedMarker, matchResult: MarkerMatchResult): MarkerParseConfidence {
  const issues: string[] = [];
  let fixableIssues = 0;
  const autoFix: Partial<ParsedMarker> = {};

  const addIssue = (message: string, fixable: boolean): void => {
    issues.push(message);
    if (fixable) {
      fixableIssues += 1;
    }
  };

  const nameConfidence = mapNameConfidence(matchResult);
  if (nameConfidence === "medium") {
    const canFix = Boolean(matchResult.canonical);
    if (canFix) {
      autoFix.name = matchResult.canonical?.canonicalName;
    }
    addIssue("Marker name matched approximately. Please verify.", canFix);
  } else if (nameConfidence === "low") {
    const canFix = Boolean(matchResult.canonical);
    if (canFix) {
      autoFix.name = matchResult.canonical?.canonicalName;
    }
    addIssue("Marker name matched via fuzzy search. Please verify.", canFix);
  } else if (nameConfidence === "missing") {
    addIssue("Marker name could not be matched to the canonical database.", false);
  }

  const rawUnit = String(parsed.unit ?? "").trim();
  const normalizedUnit = normalizeParsedUnit(rawUnit);
  const preferredUnit = matchResult.canonical?.preferredUnit?.trim() ?? "";
  const alternateUnits = matchResult.canonical?.alternateUnits ?? [];
  let unitConfidence: DimensionConfidence = "missing";

  if (matchResult.canonical) {
    if (!rawUnit) {
      if (markerAllowsMissingUnit(matchResult)) {
        unitConfidence = "high";
      } else {
        unitConfidence = "low";
        addIssue("Unit is missing.", false);
      }
    } else if (preferredUnit && areUnitsEquivalent(normalizedUnit.normalized, preferredUnit)) {
      unitConfidence = "high";
    } else if (alternateUnits.some((unit) => areUnitsEquivalent(normalizedUnit.normalized, unit))) {
      unitConfidence = "medium";
      addIssue(`Unit '${normalizedUnit.normalized}' is valid but not preferred for this marker.`, false);
    } else if (!preferredUnit) {
      unitConfidence = "medium";
    } else {
      unitConfidence = "low";
      addIssue(`Unit '${normalizedUnit.normalized}' is not recognized for this marker.`, false);
    }
  } else {
    if (!rawUnit) {
      unitConfidence = "missing";
      addIssue("Unit is missing and marker name is not recognized.", false);
    } else if (normalizedUnit.recognized) {
      unitConfidence = "medium";
    } else {
      unitConfidence = "low";
      addIssue(`Unit '${rawUnit}' is unknown.`, false);
    }
  }

  if (rawUnit && normalizedUnit.changed) {
    autoFix.unit = normalizedUnit.normalized;
    const onlyCosmeticNormalization = areUnitsEquivalent(rawUnit, normalizedUnit.normalized);
    if (!onlyCosmeticNormalization) {
      addIssue(`Unit normalized from '${rawUnit}' to '${normalizedUnit.normalized}'.`, true);
    }
  }

  const numericValue = toNullableNumber(parsed.value);
  let valueConfidence: DimensionConfidence = "missing";

  if (numericValue === null) {
    valueConfidence = "missing";
    addIssue("Marker value could not be parsed as a number.", false);
  } else if (numericValue <= 0) {
    valueConfidence = "low";
    addIssue("Marker value is zero or negative. Please verify.", false);
  } else if (isWithinPlausibleBounds(numericValue, matchResult)) {
    valueConfidence = "high";
  } else {
    valueConfidence = "medium";
    addIssue("Marker value looks outside plausible parser bounds.", false);
  }

  const parsedRange = parseRange(parsed);
  let rangeConfidence: DimensionConfidence = "missing";

  if (parsedRange.min !== null && parsedRange.max !== null) {
    rangeConfidence = "high";
  } else if (parsedRange.min !== null || parsedRange.max !== null) {
    rangeConfidence = "medium";
  } else if (hasDefaultRange(matchResult)) {
    rangeConfidence = "low";
    autoFix.range = {
      min: matchResult.canonical?.defaultRange?.min ?? null,
      max: matchResult.canonical?.defaultRange?.max ?? null
    };
    const minText = matchResult.canonical?.defaultRange?.min;
    const maxText = matchResult.canonical?.defaultRange?.max;
    const hasMin = minText !== undefined;
    const hasMax = maxText !== undefined;
    const rangeLabel = hasMin && hasMax ? `${minText} - ${maxText}` : hasMin ? `>= ${minText}` : `<= ${maxText}`;
    addIssue(`Reference range missing in PDF. Using database default (${rangeLabel}).`, true);
  } else {
    rangeConfidence = "missing";
    addIssue("Reference range is missing and no fallback exists in the database.", false);
  }

  const overall: MarkerParseConfidence["overall"] =
    nameConfidence === "missing" || valueConfidence === "missing"
      ? "error"
      : nameConfidence === "low" ||
          nameConfidence === "medium" ||
          unitConfidence === "low" ||
          unitConfidence === "missing" ||
          rangeConfidence === "missing"
        ? "review"
        : "ok";

  const autoFixPayload = Object.keys(autoFix).length > 0 ? autoFix : undefined;

  return {
    name: nameConfidence,
    unit: unitConfidence,
    value: valueConfidence,
    range: rangeConfidence,
    overall,
    issues,
    autoFixable: issues.length > 0 && fixableIssues === issues.length,
    autoFix: autoFixPayload
  };
}
