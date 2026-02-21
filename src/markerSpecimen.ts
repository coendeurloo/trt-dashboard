export type MarkerSpecimen = "blood" | "urine";

const URINE_MARKER_PATTERN = /\burine\b/i;

export const inferSpecimenFromCanonicalMarker = (canonicalMarker: string): MarkerSpecimen => {
  if (URINE_MARKER_PATTERN.test(canonicalMarker ?? "")) {
    return "urine";
  }
  // Product default: if specimen is not explicitly urine, treat as blood.
  return "blood";
};

export const canMergeMarkersBySpecimen = (sourceCanonical: string, targetCanonical: string): boolean =>
  inferSpecimenFromCanonicalMarker(sourceCanonical) === inferSpecimenFromCanonicalMarker(targetCanonical);
