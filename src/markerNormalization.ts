import { CANONICAL_MARKERS, CanonicalMarkerCatalogEntry, buildAliasLookup } from "./markerCatalog";

export type MarkerNormalizationMode = "balanced" | "conservative" | "aggressive";

export interface CanonicalResolution {
  canonicalMarker: string;
  confidence: number;
  method: "override" | "exact_alias" | "pattern" | "token_score" | "unknown";
  matchedAlias?: string;
}

interface ResolveCanonicalMarkerInput {
  rawName: string;
  unit?: string;
  contextText?: string;
  mode?: MarkerNormalizationMode;
  overrideLookup?: Record<string, string>;
}

const GLOBAL_ALIAS_LOOKUP = buildAliasLookup();

const STOPWORD_SINGLE = new Set([
  "is",
  "to",
  "for",
  "with",
  "and",
  "of",
  "this",
  "that",
  "method",
  "interpretation",
  "new"
]);

const NARRATIVE_NOISE_PATTERN =
  /\b(?:for intermediate and high risk individuals|low risk individuals|sensitive to|please interpret|for further information|target reduction|guideline|guidelines|individuals?|method is|new method effective|changes in serial|if dexamethasone has been given)\b/i;

let localAliasOverrides: Record<string, string> = {};

export const normalizeMarkerLookupKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toTitleCase = (value: string): string =>
  value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");

const cleanMarkerText = (value: string): string =>
  value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenSet = (value: string): Set<string> =>
  new Set(
    normalizeMarkerLookupKey(value)
      .split(" ")
      .map((token) => token.trim())
      .filter(Boolean)
  );

const unitToken = (value?: string): string =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

const unitLooksCompatible = (entry: CanonicalMarkerCatalogEntry, rawUnit: string): boolean => {
  if (!rawUnit) {
    return true;
  }
  const normalizedUnit = unitToken(rawUnit);
  const expectedUnits = Object.values(entry.preferredUnitBySystem ?? {})
    .map((item) => unitToken(item))
    .filter(Boolean);
  if (expectedUnits.length === 0) {
    return true;
  }
  return expectedUnits.some((expected) => normalizedUnit === expected);
};

const patternResolution = (normalized: string): CanonicalResolution | null => {
  if (
    /\b(?:testosterone|testosteron)\b/.test(normalized) &&
    /\b(?:free|vrij|vrije)\b/.test(normalized) &&
    /\b(?:total|totaal|totale)\b/.test(normalized)
  ) {
    return { canonicalMarker: "Testosterone", confidence: 0.95, method: "pattern", matchedAlias: "testosterone free total" };
  }

  if (
    /\b(?:testosterone|testosteron)\b/.test(normalized) &&
    /\b(?:free|vrij|vrije)\b/.test(normalized)
  ) {
    return { canonicalMarker: "Free Testosterone", confidence: 0.95, method: "pattern", matchedAlias: "free testosterone" };
  }

  if (/\bbioavailable\b/.test(normalized) && /\b(?:testosterone|testosteron)\b/.test(normalized)) {
    return {
      canonicalMarker: "Bioavailable Testosterone",
      confidence: 0.96,
      method: "pattern",
      matchedAlias: "bioavailable testosterone"
    };
  }

  if (
    /\bcortisol\b/.test(normalized) &&
    /\bam\b/.test(normalized)
  ) {
    return { canonicalMarker: "Cortisol", confidence: 0.92, method: "pattern", matchedAlias: "cortisol am" };
  }

  if (
    /\bsex\b/.test(normalized) &&
    /\bhorm(?:one|)\b/.test(normalized) &&
    /\bbind(?:ing)?\b/.test(normalized) &&
    /\bglob(?:ulin)?\b/.test(normalized)
  ) {
    return { canonicalMarker: "SHBG", confidence: 0.94, method: "pattern", matchedAlias: "sex hormone binding globulin" };
  }

  return null;
};

const scoreEntry = (
  entry: CanonicalMarkerCatalogEntry,
  normalizedRaw: string,
  normalizedTokens: Set<string>,
  rawUnit: string
): { score: number; matchedAlias?: string } => {
  let bestScore = 0;
  let matchedAlias = "";

  for (const alias of entry.aliases) {
    const normalizedAlias = normalizeMarkerLookupKey(alias);
    if (!normalizedAlias) {
      continue;
    }

    const aliasTokens = tokenSet(normalizedAlias);
    if (aliasTokens.size === 0) {
      continue;
    }

    let shared = 0;
    aliasTokens.forEach((token) => {
      if (normalizedTokens.has(token)) {
        shared += 1;
      }
    });

    const overlap = shared / aliasTokens.size;
    let score = overlap * 65;
    if (normalizedRaw === normalizedAlias) {
      score += 30;
    } else if (normalizedRaw.includes(normalizedAlias)) {
      score += 15;
    }

    if (!unitLooksCompatible(entry, rawUnit)) {
      score -= 10;
    } else if (rawUnit) {
      score += 6;
    }

    if (entry.mustContain && entry.mustContain.length > 0) {
      const hasAllMustContain = entry.mustContain.every((item) =>
        normalizedRaw.includes(normalizeMarkerLookupKey(item))
      );
      if (!hasAllMustContain) {
        score -= 18;
      } else {
        score += 8;
      }
    }

    if (entry.mustNotContain && entry.mustNotContain.length > 0) {
      const hasForbidden = entry.mustNotContain.some((item) =>
        normalizedRaw.includes(normalizeMarkerLookupKey(item))
      );
      if (hasForbidden) {
        score -= 35;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      matchedAlias = alias;
    }
  }

  if (NARRATIVE_NOISE_PATTERN.test(normalizedRaw)) {
    bestScore -= 40;
  }

  return {
    score: Math.max(0, Math.min(100, bestScore)),
    matchedAlias: matchedAlias || undefined
  };
};

const thresholdForMode = (mode: MarkerNormalizationMode): number => {
  if (mode === "conservative") {
    return 78;
  }
  if (mode === "aggressive") {
    return 56;
  }
  return 64;
};

const looksNarrativeOrNoise = (normalized: string): boolean => {
  if (!normalized) {
    return true;
  }
  if (NARRATIVE_NOISE_PATTERN.test(normalized)) {
    return true;
  }
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length === 1 && STOPWORD_SINGLE.has(tokens[0])) {
    return true;
  }
  if (tokens.length >= 9 && !/\b(?:testosterone|estradiol|shbg|hematocrit|cholesterol|triglycerides?|ferritin|psa|cortisol|creatinine|glucose|hemoglobin|wbc|rbc)\b/.test(normalized)) {
    return true;
  }
  return false;
};

export const normalizeMarkerAliasOverrides = (input: unknown): Record<string, string> => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const normalized: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    const key = normalizeMarkerLookupKey(String(rawKey ?? ""));
    const value = cleanMarkerText(String(rawValue ?? ""));
    if (!key || !value) {
      continue;
    }
    const canonical =
      GLOBAL_ALIAS_LOOKUP[normalizeMarkerLookupKey(value)] ??
      patternResolution(normalizeMarkerLookupKey(value))?.canonicalMarker ??
      toTitleCase(value);
    if (!canonical || canonical === "Unknown Marker") {
      continue;
    }
    normalized[key] = canonical;
  }
  return normalized;
};

export const setMarkerAliasOverrides = (overrides: Record<string, string> | null | undefined): void => {
  localAliasOverrides = normalizeMarkerAliasOverrides(overrides ?? {});
};

export const getMarkerAliasOverrides = (): Record<string, string> => ({ ...localAliasOverrides });

export const resolveCanonicalMarker = (input: ResolveCanonicalMarkerInput): CanonicalResolution => {
  const mode = input.mode ?? "balanced";
  const cleanedRaw = cleanMarkerText(input.rawName ?? "");
  const normalized = normalizeMarkerLookupKey(cleanedRaw);

  if (!normalized) {
    return { canonicalMarker: "Unknown Marker", confidence: 0, method: "unknown" };
  }

  const mergedOverrides = {
    ...localAliasOverrides,
    ...normalizeMarkerAliasOverrides(input.overrideLookup ?? {})
  };
  const overrideHit = mergedOverrides[normalized];
  if (overrideHit) {
    return {
      canonicalMarker: overrideHit,
      confidence: 1,
      method: "override",
      matchedAlias: cleanedRaw
    };
  }

  const exact = GLOBAL_ALIAS_LOOKUP[normalized];
  if (exact) {
    return {
      canonicalMarker: exact,
      confidence: 0.99,
      method: "exact_alias",
      matchedAlias: cleanedRaw
    };
  }

  const pattern = patternResolution(normalized);
  if (pattern) {
    return pattern;
  }

  const tokens = tokenSet(normalized);
  let best: { canonical: string; score: number; matchedAlias?: string } | null = null;

  for (const entry of CANONICAL_MARKERS) {
    const scored = scoreEntry(entry, normalized, tokens, input.unit ?? "");
    if (!best || scored.score > best.score) {
      best = {
        canonical: entry.canonicalKey,
        score: scored.score,
        matchedAlias: scored.matchedAlias
      };
    }
  }

  const threshold = thresholdForMode(mode);
  if (best && best.score >= threshold) {
    return {
      canonicalMarker: best.canonical,
      confidence: Math.min(0.96, Math.max(0.52, best.score / 100)),
      method: "token_score",
      matchedAlias: best.matchedAlias
    };
  }

  if (looksNarrativeOrNoise(normalized)) {
    return {
      canonicalMarker: "Unknown Marker",
      confidence: 0,
      method: "unknown"
    };
  }

  return {
    canonicalMarker: toTitleCase(cleanedRaw),
    confidence: 0.35,
    method: "unknown"
  };
};
