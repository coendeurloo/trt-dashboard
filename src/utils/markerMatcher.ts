import { CanonicalMarker, MARKER_ALIAS_INDEX, MARKER_DATABASE } from "../data/markerDatabase";

export type MatchConfidence =
  | "exact"
  | "alias"
  | "normalized"
  | "token"
  | "fuzzy"
  | "unmatched";

export interface MarkerMatchResult {
  canonical: CanonicalMarker | null;
  confidence: MatchConfidence;
  score: number;
  matchedAlias?: string;
}

const STOPWORDS = new Set(["abs", "total", "serum", "vrij", "free", "%"]);

const CONFLICTING_TOKEN_PAIRS: Array<[string, string]> = [
  ["ldl", "hdl"],
  ["direct", "indirect"],
  ["t3", "t4"],
  ["free", "total"]
];

const CANONICAL_INDEX = MARKER_DATABASE.map((marker) => ({
  marker,
  normalizedCanonical: normalize(marker.canonicalName)
}));

const ALIAS_INDEX = MARKER_ALIAS_INDEX.map((entry) => ({
  marker: entry.marker,
  alias: entry.alias,
  normalizedAlias: normalize(entry.alias),
  tokens: tokenize(normalize(entry.alias))
}));

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[()[\]{}]/g, " ")
    .replace(/[,;:\/\\]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s\-\.]/g, "")
    .trim();
}

function tokenize(value: string): string[] {
  return value.split(" ").map((token) => token.trim()).filter(Boolean);
}

const setFromTokens = (tokens: string[]): Set<string> => new Set(tokens);

const hasSharedNonStopwordToken = (left: Set<string>, right: Set<string>): boolean => {
  for (const token of left) {
    if (!STOPWORDS.has(token) && right.has(token)) {
      return true;
    }
  }
  return false;
};

const shouldKeepStopword = (token: string, left: Set<string>, right: Set<string>): boolean => {
  if (!STOPWORDS.has(token)) {
    return true;
  }
  // Keep stopwords when they disambiguate marker variants, e.g. free testosterone vs testosterone.
  return hasSharedNonStopwordToken(left, right);
};

const toMeaningfulTokenSet = (tokens: string[], self: Set<string>, other: Set<string>): Set<string> =>
  new Set(tokens.filter((token) => shouldKeepStopword(token, self, other)));

const countOverlap = (left: Set<string>, right: Set<string>): number => {
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) {
      overlap += 1;
    }
  }
  return overlap;
};

const hasConflictingTokens = (inputTokens: Set<string>, aliasTokens: Set<string>): boolean => {
  return CONFLICTING_TOKEN_PAIRS.some(([a, b]) => {
    const inputHasOnlyA = inputTokens.has(a) && !inputTokens.has(b);
    const inputHasOnlyB = inputTokens.has(b) && !inputTokens.has(a);
    const aliasHasOnlyA = aliasTokens.has(a) && !aliasTokens.has(b);
    const aliasHasOnlyB = aliasTokens.has(b) && !aliasTokens.has(a);
    return (inputHasOnlyA && aliasHasOnlyB) || (inputHasOnlyB && aliasHasOnlyA);
  });
};

const levenshteinDistance = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }
  if (left.length === 0) {
    return right.length;
  }
  if (right.length === 0) {
    return left.length;
  }

  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j < cols; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + substitutionCost
      );
    }
  }

  return matrix[left.length][right.length];
};

export function matchMarker(rawName: string): MarkerMatchResult {
  const normalizedInput = normalize(rawName ?? "");
  if (!normalizedInput) {
    return { canonical: null, confidence: "unmatched", score: 0 };
  }

  // Step 1 — Exact canonical name match.
  for (const candidate of CANONICAL_INDEX) {
    if (normalizedInput === candidate.normalizedCanonical) {
      return {
        canonical: candidate.marker,
        confidence: "exact",
        score: 1,
        matchedAlias: candidate.marker.canonicalName
      };
    }
  }

  // Step 2 — Exact alias match.
  for (const candidate of ALIAS_INDEX) {
    if (normalizedInput === candidate.normalizedAlias) {
      return {
        canonical: candidate.marker,
        confidence: "alias",
        score: 0.95,
        matchedAlias: candidate.alias
      };
    }
  }

  // Step 3 — Normalized contained/substring match.
  let bestNormalizedContained: { marker: CanonicalMarker; alias: string; ratio: number } | null = null;
  for (const candidate of ALIAS_INDEX) {
    const aliasValue = candidate.normalizedAlias;
    if (!aliasValue) {
      continue;
    }
    const isContained = aliasValue.includes(normalizedInput) || normalizedInput.includes(aliasValue);
    if (!isContained) {
      continue;
    }
    const shortest = Math.min(aliasValue.length, normalizedInput.length);
    const longest = Math.max(aliasValue.length, normalizedInput.length);
    const ratio = longest === 0 ? 0 : shortest / longest;
    if (ratio <= 0.7) {
      continue;
    }
    if (!bestNormalizedContained || ratio > bestNormalizedContained.ratio) {
      bestNormalizedContained = {
        marker: candidate.marker,
        alias: candidate.alias,
        ratio
      };
    }
  }
  if (bestNormalizedContained) {
    return {
      canonical: bestNormalizedContained.marker,
      confidence: "normalized",
      score: 0.85,
      matchedAlias: bestNormalizedContained.alias
    };
  }

  // Step 4 — Token overlap match.
  const inputTokens = tokenize(normalizedInput);
  const inputTokenSet = setFromTokens(inputTokens);
  let bestTokenMatch: { marker: CanonicalMarker; alias: string; score: number } | null = null;

  for (const candidate of ALIAS_INDEX) {
    const aliasTokens = candidate.tokens;
    if (aliasTokens.length === 0) {
      continue;
    }
    const aliasTokenSet = setFromTokens(aliasTokens);

    if (hasConflictingTokens(inputTokenSet, aliasTokenSet)) {
      continue;
    }

    const inputMeaningful = toMeaningfulTokenSet(inputTokens, inputTokenSet, aliasTokenSet);
    const aliasMeaningful = toMeaningfulTokenSet(aliasTokens, aliasTokenSet, inputTokenSet);
    const overlap = countOverlap(inputMeaningful, aliasMeaningful);

    if (overlap < 2) {
      continue;
    }

    const denominator = Math.max(inputMeaningful.size, aliasMeaningful.size);
    if (denominator === 0) {
      continue;
    }

    const score = overlap / denominator;
    if (score < 0.5) {
      continue;
    }

    if (!bestTokenMatch || score > bestTokenMatch.score) {
      bestTokenMatch = {
        marker: candidate.marker,
        alias: candidate.alias,
        score
      };
    }
  }

  if (bestTokenMatch) {
    return {
      canonical: bestTokenMatch.marker,
      confidence: "token",
      score: bestTokenMatch.score,
      matchedAlias: bestTokenMatch.alias
    };
  }

  // Step 5 — Fuzzy Levenshtein similarity.
  let bestFuzzy: { marker: CanonicalMarker; alias: string; score: number } | null = null;

  for (const candidate of ALIAS_INDEX) {
    if (!candidate.normalizedAlias) {
      continue;
    }
    const longestLength = Math.max(normalizedInput.length, candidate.normalizedAlias.length);
    if (longestLength === 0) {
      continue;
    }
    const distance = levenshteinDistance(normalizedInput, candidate.normalizedAlias);
    const similarity = 1 - distance / longestLength;
    if (!bestFuzzy || similarity > bestFuzzy.score) {
      bestFuzzy = {
        marker: candidate.marker,
        alias: candidate.alias,
        score: similarity
      };
    }
  }

  if (bestFuzzy && bestFuzzy.score >= 0.82) {
    return {
      canonical: bestFuzzy.marker,
      confidence: "fuzzy",
      score: bestFuzzy.score,
      matchedAlias: bestFuzzy.alias
    };
  }

  // Step 6 — Unmatched.
  return { canonical: null, confidence: "unmatched", score: 0 };
}
