import { DosePrior, UnitSystem } from "../types";
import { canonicalizeMarker } from "../unitConversion";

const PRIORS: DosePrior[] = [
  {
    marker: "Testosterone",
    unitSystem: "eu",
    unit: "nmol/L",
    slopePerMg: 0.1,
    sigma: 4.2,
    doseRange: { min: 60, max: 220 },
    evidence: [
      {
        citation: "Bhasin et al., 2001",
        studyType: "Randomized dose-response trial",
        relevance: "Higher testosterone dose showed stepwise increase in serum testosterone.",
        quality: "high"
      }
    ]
  },
  {
    marker: "Testosterone",
    unitSystem: "us",
    unit: "ng/dL",
    slopePerMg: 2.9,
    sigma: 120,
    doseRange: { min: 60, max: 220 },
    evidence: [
      {
        citation: "Bhasin et al., 2001",
        studyType: "Randomized dose-response trial",
        relevance: "Higher testosterone dose showed stepwise increase in serum testosterone.",
        quality: "high"
      }
    ]
  },
  {
    marker: "Free Testosterone",
    unitSystem: "eu",
    unit: "nmol/L",
    slopePerMg: 0.0012,
    sigma: 0.08,
    doseRange: { min: 60, max: 220 },
    evidence: [
      {
        citation: "Meta-analysis TRT free testosterone kinetics",
        studyType: "Meta-analysis",
        relevance: "Free testosterone generally rises with total testosterone exposure.",
        quality: "medium"
      }
    ]
  },
  {
    marker: "Free Testosterone",
    unitSystem: "us",
    unit: "pg/mL",
    slopePerMg: 0.36,
    sigma: 18,
    doseRange: { min: 60, max: 220 },
    evidence: [
      {
        citation: "Meta-analysis TRT free testosterone kinetics",
        studyType: "Meta-analysis",
        relevance: "Free testosterone generally rises with total testosterone exposure.",
        quality: "medium"
      }
    ]
  },
  {
    marker: "Estradiol",
    unitSystem: "eu",
    unit: "pmol/L",
    slopePerMg: 0.95,
    sigma: 35,
    doseRange: { min: 60, max: 220 },
    evidence: [
      {
        citation: "Aromatization pathway studies in TRT populations",
        studyType: "Observational + mechanistic",
        relevance: "Estradiol tends to increase with androgen exposure in many patients.",
        quality: "medium"
      }
    ]
  },
  {
    marker: "Estradiol",
    unitSystem: "us",
    unit: "pg/mL",
    slopePerMg: 0.26,
    sigma: 10,
    doseRange: { min: 60, max: 220 },
    evidence: [
      {
        citation: "Aromatization pathway studies in TRT populations",
        studyType: "Observational + mechanistic",
        relevance: "Estradiol tends to increase with androgen exposure in many patients.",
        quality: "medium"
      }
    ]
  },
  {
    marker: "Hematocrit",
    unitSystem: "eu",
    unit: "%",
    slopePerMg: 0.015,
    sigma: 1.3,
    doseRange: { min: 60, max: 220 },
    evidence: [
      {
        citation: "TRT erythrocytosis cohort studies",
        studyType: "Observational cohorts",
        relevance: "Higher doses are associated with hematocrit rise in susceptible users.",
        quality: "medium"
      }
    ]
  },
  {
    marker: "Hematocrit",
    unitSystem: "us",
    unit: "%",
    slopePerMg: 0.015,
    sigma: 1.3,
    doseRange: { min: 60, max: 220 },
    evidence: [
      {
        citation: "TRT erythrocytosis cohort studies",
        studyType: "Observational cohorts",
        relevance: "Higher doses are associated with hematocrit rise in susceptible users.",
        quality: "medium"
      }
    ]
  },
  {
    marker: "Apolipoprotein B",
    unitSystem: "eu",
    unit: "mg/dL",
    slopePerMg: 0.014,
    sigma: 11,
    doseRange: { min: 60, max: 220 },
    evidence: [
      {
        citation: "Androgen and lipoprotein metabolism reviews",
        studyType: "Systematic review",
        relevance: "Some androgen protocols show ApoB increase depending on dose and compounds.",
        quality: "medium"
      }
    ]
  },
  {
    marker: "Apolipoprotein B",
    unitSystem: "us",
    unit: "mg/dL",
    slopePerMg: 0.014,
    sigma: 11,
    doseRange: { min: 60, max: 220 },
    evidence: [
      {
        citation: "Androgen and lipoprotein metabolism reviews",
        studyType: "Systematic review",
        relevance: "Some androgen protocols show ApoB increase depending on dose and compounds.",
        quality: "medium"
      }
    ]
  },
  {
    marker: "LDL Cholesterol",
    unitSystem: "eu",
    unit: "mmol/L",
    slopePerMg: 0.0005,
    sigma: 0.2,
    doseRange: { min: 60, max: 220 },
    evidence: [
      {
        citation: "Androgen effect on lipid profile cohorts",
        studyType: "Observational cohorts",
        relevance: "LDL response is heterogeneous, with dose-dependent changes in some cohorts.",
        quality: "medium"
      }
    ]
  },
  {
    marker: "LDL Cholesterol",
    unitSystem: "us",
    unit: "mg/dL",
    slopePerMg: 0.02,
    sigma: 8,
    doseRange: { min: 60, max: 220 },
    evidence: [
      {
        citation: "Androgen effect on lipid profile cohorts",
        studyType: "Observational cohorts",
        relevance: "LDL response is heterogeneous, with dose-dependent changes in some cohorts.",
        quality: "medium"
      }
    ]
  }
];

export const TOP_PRIOR_MARKERS = new Set(
  ["Testosterone", "Free Testosterone", "Estradiol", "Hematocrit", "Apolipoprotein B", "LDL Cholesterol"].map((marker) =>
    canonicalizeMarker(marker)
  )
);

const markerMatches = (prior: DosePrior, canonicalMarker: string, unit?: string): boolean => {
  if (canonicalizeMarker(prior.marker) !== canonicalMarker) {
    return false;
  }
  if (!unit) {
    return true;
  }
  return prior.unit.toLowerCase() === unit.trim().toLowerCase();
};

export const getLocalDosePrior = (marker: string, unitSystem: UnitSystem, unit?: string): DosePrior | null => {
  const canonicalMarker = canonicalizeMarker(marker);
  const direct = PRIORS.find((prior) => prior.unitSystem === unitSystem && markerMatches(prior, canonicalMarker, unit));
  if (direct) {
    return direct;
  }
  return PRIORS.find((prior) => prior.unitSystem === unitSystem && markerMatches(prior, canonicalMarker)) ?? null;
};

export const getLocalDosePriors = (
  markers: Array<{ marker: string; unit?: string }>,
  unitSystem: UnitSystem
): DosePrior[] => {
  const seen = new Set<string>();
  const output: DosePrior[] = [];
  markers.forEach((entry) => {
    const prior = getLocalDosePrior(entry.marker, unitSystem, entry.unit);
    if (!prior) {
      return;
    }
    const key = `${canonicalizeMarker(prior.marker)}|${prior.unitSystem}|${prior.unit}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    output.push(prior);
  });
  return output;
};

export const hasLocalDosePrior = (marker: string, unitSystem: UnitSystem, unit?: string): boolean =>
  getLocalDosePrior(marker, unitSystem, unit) !== null;
