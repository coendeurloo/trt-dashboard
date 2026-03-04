import { MarkerValue } from "../types";
import { MatchConfidence, MarkerMatchResult, matchMarker } from "./markerMatcher";
import { MarkerParseConfidence, ParsedMarker, scoreMarkerConfidence } from "./markerConfidence";
import { MarkerCategory } from "../data/markerDatabase";

export type ReviewMarker = MarkerValue & {
  category?: MarkerCategory;
  _confidence?: MarkerParseConfidence;
  _matchResult?: MarkerMatchResult;
};

const shouldUseCanonicalName = (confidence: MatchConfidence): boolean => confidence === "exact" || confidence === "alias";

const toParsedMarker = (marker: MarkerValue): ParsedMarker => ({
  name: marker.marker,
  unit: marker.unit,
  value: marker.value,
  referenceMin: marker.referenceMin,
  referenceMax: marker.referenceMax
});

export const enrichMarkerForReview = (marker: MarkerValue): ReviewMarker => {
  const matchResult = matchMarker(marker.marker || marker.canonicalMarker || "");
  const confidence = scoreMarkerConfidence(toParsedMarker(marker), matchResult);

  const resolvedName =
    shouldUseCanonicalName(matchResult.confidence) && matchResult.canonical
      ? matchResult.canonical.canonicalName
      : marker.marker;

  const resolvedUnit = confidence.autoFix?.unit ?? marker.unit;

  return {
    ...marker,
    marker: resolvedName,
    unit: resolvedUnit,
    rawUnit: marker.rawUnit !== undefined && confidence.autoFix?.unit ? resolvedUnit : marker.rawUnit,
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
