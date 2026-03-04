import { MarkerValue } from "../types";
import { MatchConfidence, MarkerMatchResult, matchMarker } from "./markerMatcher";
import { MarkerParseConfidence, ParsedMarker, scoreMarkerConfidence } from "./markerConfidence";
import { MarkerCategory } from "../data/markerDatabase";
import { canonicalizeMarker } from "../unitConversion";

export type ReviewMarker = MarkerValue & {
  category?: MarkerCategory;
  _confidence?: MarkerParseConfidence;
  _matchResult?: MarkerMatchResult;
};

const shouldUseCanonicalName = (confidence: MatchConfidence): boolean => confidence === "exact" || confidence === "alias";

const confidenceRank: Record<MatchConfidence, number> = {
  exact: 6,
  alias: 5,
  normalized: 4,
  token: 3,
  fuzzy: 2,
  unmatched: 1
};

const withLegacyAliasConfidence = (result: MarkerMatchResult, matchedAlias: string): MarkerMatchResult => ({
  ...result,
  confidence: result.confidence === "exact" ? "alias" : result.confidence,
  score: Math.max(result.score, 0.92),
  matchedAlias
});

const resolveBestMatch = (marker: MarkerValue): MarkerMatchResult => {
  const displayName = (marker.marker ?? "").trim();
  const rawName = (marker.rawMarker ?? "").trim();
  const currentCanonical = (marker.canonicalMarker ?? "").trim();

  const base = matchMarker(displayName || currentCanonical || rawName);
  let best = base;

  const compareAndTake = (candidate: MarkerMatchResult): void => {
    if (confidenceRank[candidate.confidence] > confidenceRank[best.confidence]) {
      best = candidate;
      return;
    }
    if (confidenceRank[candidate.confidence] === confidenceRank[best.confidence] && candidate.score > best.score) {
      best = candidate;
    }
  };

  if (rawName && rawName !== displayName) {
    compareAndTake(matchMarker(rawName));
  }

  if (currentCanonical && currentCanonical.toLowerCase() !== "unknown marker") {
    const canonicalHit = matchMarker(currentCanonical);
    if (canonicalHit.confidence !== "unmatched") {
      compareAndTake(withLegacyAliasConfidence(canonicalHit, currentCanonical));
    }
  }

  if (best.confidence === "unmatched" || best.confidence === "fuzzy") {
    const legacyCandidate = canonicalizeMarker(rawName || displayName || currentCanonical);
    if (legacyCandidate && legacyCandidate !== "Unknown Marker") {
      const legacyHit = matchMarker(legacyCandidate);
      if (legacyHit.confidence !== "unmatched") {
        compareAndTake(withLegacyAliasConfidence(legacyHit, legacyCandidate));
      }
    }
  }

  return best;
};

const toParsedMarker = (marker: MarkerValue): ParsedMarker => ({
  name: marker.marker,
  unit: marker.unit,
  value: marker.value,
  referenceMin: marker.referenceMin,
  referenceMax: marker.referenceMax
});

export const enrichMarkerForReview = (marker: MarkerValue): ReviewMarker => {
  const matchResult = resolveBestMatch(marker);
  const confidence = scoreMarkerConfidence(toParsedMarker(marker), matchResult);

  const resolvedName =
    shouldUseCanonicalName(matchResult.confidence) && matchResult.canonical
      ? matchResult.canonical.canonicalName
      : marker.marker;

  const resolvedUnit = confidence.autoFix?.unit ?? marker.unit;

  return {
    ...marker,
    rawMarker: marker.rawMarker ?? marker.marker,
    marker: resolvedName,
    unit: resolvedUnit,
    rawUnit: marker.rawUnit ?? marker.unit,
    category: matchResult.canonical?.category ?? "Other",
    _confidence: confidence,
    _matchResult: matchResult
  };
};

export const enrichMarkersForReview = (markers: MarkerValue[]): ReviewMarker[] => markers.map((marker) => enrichMarkerForReview(marker));

export const applyMarkerAutoFix = (marker: ReviewMarker): ReviewMarker => {
  const fix = marker._confidence?.autoFix;
  if (!fix) {
    return marker;
  }

  const next: MarkerValue = {
    ...marker,
    marker: fix.name ?? marker.marker,
    unit: fix.unit ?? marker.unit,
    referenceMin: fix.range?.min !== undefined ? fix.range.min : marker.referenceMin,
    referenceMax: fix.range?.max !== undefined ? fix.range.max : marker.referenceMax,
    rawUnit: fix.unit ? fix.unit : marker.rawUnit,
    rawReferenceMin: fix.range?.min !== undefined ? fix.range.min : marker.rawReferenceMin,
    rawReferenceMax: fix.range?.max !== undefined ? fix.range.max : marker.rawReferenceMax
  };

  return enrichMarkerForReview(next);
};
