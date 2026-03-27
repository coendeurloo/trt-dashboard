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

interface InferenceSignal {
  value: number | null;
  referenceMin: number | null;
  referenceMax: number | null;
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
  hasUnitIssue: boolean;
  issueKind: "none" | "missing" | "unsupported" | "inferred-mismatch";
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
  "apo-b": {
    allowValueOnly: true,
    candidates: [
      {
        unit: "g/L",
        valueRange: { min: 0.2, max: 3.5 },
        referenceMaxRange: { min: 0.4, max: 1.8 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 20, max: 350 },
        referenceMaxRange: { min: 40, max: 180 }
      }
    ]
  },
  "apo-a1": {
    allowValueOnly: true,
    candidates: [
      {
        unit: "g/L",
        valueRange: { min: 0.4, max: 3.5 },
        referenceMinRange: { min: 0.6, max: 2.2 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 40, max: 350 },
        referenceMinRange: { min: 60, max: 220 }
      }
    ]
  },
  "lipoprotein-a": {
    allowValueOnly: false,
    candidates: [
      {
        unit: "nmol/L",
        valueRange: { min: 1, max: 1200 },
        referenceMaxRange: { min: 30, max: 160 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 0.5, max: 250 },
        referenceMaxRange: { min: 10, max: 80 }
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
  "total-bilirubin": {
    allowValueOnly: true,
    candidates: [
      {
        unit: "umol/L",
        valueRange: { min: 1, max: 120 },
        referenceMinRange: { min: 0, max: 8 },
        referenceMaxRange: { min: 8, max: 40 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 0.1, max: 7 },
        referenceMinRange: { min: 0, max: 0.4 },
        referenceMaxRange: { min: 0.4, max: 2.5 }
      }
    ]
  },
  "direct-bilirubin": {
    allowValueOnly: true,
    candidates: [
      {
        unit: "umol/L",
        valueRange: { min: 0.1, max: 50 },
        referenceMaxRange: { min: 2, max: 14 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 0.05, max: 3 },
        referenceMaxRange: { min: 0.1, max: 0.8 }
      }
    ]
  },
  "bilirubin-indirect": {
    allowValueOnly: true,
    candidates: [
      {
        unit: "umol/L",
        valueRange: { min: 0.5, max: 100 },
        referenceMaxRange: { min: 5, max: 30 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 0.05, max: 6 },
        referenceMaxRange: { min: 0.2, max: 1.8 }
      }
    ]
  },
  albumin: {
    allowValueOnly: true,
    candidates: [
      {
        unit: "g/L",
        valueRange: { min: 15, max: 70 },
        referenceMinRange: { min: 20, max: 45 },
        referenceMaxRange: { min: 38, max: 60 }
      },
      {
        unit: "g/dL",
        valueRange: { min: 1.5, max: 7 },
        referenceMinRange: { min: 2, max: 4.5 },
        referenceMaxRange: { min: 3.8, max: 6 }
      }
    ]
  },
  "total-protein": {
    allowValueOnly: true,
    candidates: [
      {
        unit: "g/L",
        valueRange: { min: 30, max: 100 },
        referenceMinRange: { min: 45, max: 72 },
        referenceMaxRange: { min: 70, max: 95 }
      },
      {
        unit: "g/dL",
        valueRange: { min: 3, max: 10 },
        referenceMinRange: { min: 4.5, max: 7.2 },
        referenceMaxRange: { min: 7, max: 9.5 }
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
  "uric-acid": {
    allowValueOnly: true,
    candidates: [
      {
        unit: "umol/L",
        valueRange: { min: 80, max: 1200 },
        referenceMinRange: { min: 120, max: 320 },
        referenceMaxRange: { min: 250, max: 700 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 1.5, max: 20 },
        referenceMinRange: { min: 2, max: 5.5 },
        referenceMaxRange: { min: 4, max: 12 }
      }
    ]
  },
  urea: {
    allowValueOnly: false,
    candidates: [
      {
        unit: "mmol/L",
        valueRange: { min: 0.5, max: 40 },
        referenceMinRange: { min: 1, max: 6 },
        referenceMaxRange: { min: 5, max: 12 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 3, max: 250 },
        referenceMinRange: { min: 5, max: 18 },
        referenceMaxRange: { min: 15, max: 40 }
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
  "free-t4": {
    allowValueOnly: true,
    candidates: [
      {
        unit: "pmol/L",
        valueRange: { min: 3, max: 60 },
        referenceMinRange: { min: 6, max: 16 },
        referenceMaxRange: { min: 12, max: 32 }
      },
      {
        unit: "ng/dL",
        valueRange: { min: 0.2, max: 5 },
        referenceMinRange: { min: 0.4, max: 1.2 },
        referenceMaxRange: { min: 0.9, max: 2.5 }
      }
    ]
  },
  "free-t3": {
    allowValueOnly: true,
    candidates: [
      {
        unit: "pmol/L",
        valueRange: { min: 1, max: 15 },
        referenceMinRange: { min: 2, max: 5 },
        referenceMaxRange: { min: 4, max: 9 }
      },
      {
        unit: "pg/mL",
        valueRange: { min: 0.5, max: 10 },
        referenceMinRange: { min: 1, max: 3.5 },
        referenceMaxRange: { min: 2.5, max: 6.5 }
      }
    ]
  },
  "total-t4": {
    allowValueOnly: true,
    candidates: [
      {
        unit: "nmol/L",
        valueRange: { min: 10, max: 250 },
        referenceMinRange: { min: 30, max: 100 },
        referenceMaxRange: { min: 80, max: 220 }
      },
      {
        unit: "ug/dL",
        valueRange: { min: 1, max: 20 },
        referenceMinRange: { min: 2, max: 8 },
        referenceMaxRange: { min: 5, max: 18 }
      }
    ]
  },
  "total-t3": {
    allowValueOnly: true,
    candidates: [
      {
        unit: "nmol/L",
        valueRange: { min: 0.4, max: 8 },
        referenceMinRange: { min: 0.6, max: 2 },
        referenceMaxRange: { min: 1.6, max: 4.5 }
      },
      {
        unit: "ng/dL",
        valueRange: { min: 25, max: 500 },
        referenceMinRange: { min: 40, max: 120 },
        referenceMaxRange: { min: 100, max: 300 }
      }
    ]
  },
  "reverse-t3": {
    allowValueOnly: false,
    candidates: [
      {
        unit: "ng/dL",
        valueRange: { min: 1, max: 120 },
        referenceMinRange: { min: 4, max: 18 },
        referenceMaxRange: { min: 14, max: 40 }
      },
      {
        unit: "pg/mL",
        valueRange: { min: 10, max: 1200 },
        referenceMinRange: { min: 40, max: 180 },
        referenceMaxRange: { min: 140, max: 400 }
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
  "testosterone-bioavailable": {
    allowValueOnly: false,
    candidates: [
      {
        unit: "nmol/L",
        valueRange: { min: 0.3, max: 40 },
        referenceMinRange: { min: 0.8, max: 8 },
        referenceMaxRange: { min: 5, max: 25 }
      },
      {
        unit: "ng/dL",
        valueRange: { min: 8, max: 1200 },
        referenceMinRange: { min: 20, max: 250 },
        referenceMaxRange: { min: 140, max: 700 }
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
  dht: {
    allowValueOnly: false,
    candidates: [
      {
        unit: "nmol/L",
        valueRange: { min: 0.1, max: 20 },
        referenceMinRange: { min: 0.2, max: 2 },
        referenceMaxRange: { min: 1.5, max: 8 }
      },
      {
        unit: "ng/dL",
        valueRange: { min: 5, max: 800 },
        referenceMinRange: { min: 8, max: 80 },
        referenceMaxRange: { min: 60, max: 300 }
      }
    ]
  },
  progesterone: {
    allowValueOnly: false,
    candidates: [
      {
        unit: "nmol/L",
        valueRange: { min: 0.1, max: 120 },
        referenceMinRange: { min: 0.1, max: 2 },
        referenceMaxRange: { min: 1, max: 20 }
      },
      {
        unit: "ng/mL",
        valueRange: { min: 0.03, max: 40 },
        referenceMinRange: { min: 0.03, max: 0.7 },
        referenceMaxRange: { min: 0.3, max: 8 }
      }
    ]
  },
  shbg: {
    allowValueOnly: true,
    candidates: [
      {
        unit: "nmol/L",
        valueRange: { min: 2, max: 250 },
        referenceMinRange: { min: 5, max: 35 },
        referenceMaxRange: { min: 20, max: 120 }
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
  aldosterone: {
    allowValueOnly: false,
    candidates: [
      {
        unit: "pmol/L",
        valueRange: { min: 5, max: 5000 },
        referenceMinRange: { min: 15, max: 160 },
        referenceMaxRange: { min: 120, max: 1200 }
      },
      {
        unit: "ng/dL",
        valueRange: { min: 0.2, max: 180 },
        referenceMinRange: { min: 0.5, max: 6 },
        referenceMaxRange: { min: 4, max: 45 }
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
  pth: {
    allowValueOnly: false,
    candidates: [
      {
        unit: "pg/mL",
        valueRange: { min: 3, max: 500 },
        referenceMinRange: { min: 8, max: 35 },
        referenceMaxRange: { min: 35, max: 150 }
      },
      {
        unit: "pmol/L",
        valueRange: { min: 0.3, max: 55 },
        referenceMinRange: { min: 0.8, max: 3.8 },
        referenceMaxRange: { min: 3.5, max: 16 }
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
  folate: {
    allowValueOnly: false,
    candidates: [
      {
        unit: "nmol/L",
        valueRange: { min: 1, max: 120 },
        referenceMinRange: { min: 3, max: 18 }
      },
      {
        unit: "ng/mL",
        valueRange: { min: 0.3, max: 60 },
        referenceMinRange: { min: 1, max: 8 }
      }
    ]
  },
  "vitamin-b12": {
    allowValueOnly: false,
    candidates: [
      {
        unit: "pmol/L",
        valueRange: { min: 40, max: 2000 },
        referenceMinRange: { min: 80, max: 260 },
        referenceMaxRange: { min: 350, max: 1200 }
      },
      {
        unit: "pg/mL",
        valueRange: { min: 60, max: 1500 },
        referenceMinRange: { min: 100, max: 350 },
        referenceMaxRange: { min: 400, max: 1200 }
      }
    ]
  },
  "vitamin-b6": {
    allowValueOnly: false,
    candidates: [
      {
        unit: "nmol/L",
        valueRange: { min: 5, max: 1200 },
        referenceMinRange: { min: 10, max: 60 },
        referenceMaxRange: { min: 70, max: 220 }
      },
      {
        unit: "ug/L",
        valueRange: { min: 1, max: 300 },
        referenceMinRange: { min: 2, max: 15 },
        referenceMaxRange: { min: 20, max: 55 }
      }
    ]
  },
  "vitamin-c": {
    allowValueOnly: false,
    candidates: [
      {
        unit: "umol/L",
        valueRange: { min: 3, max: 450 },
        referenceMinRange: { min: 8, max: 40 },
        referenceMaxRange: { min: 70, max: 180 }
      },
      {
        unit: "mg/L",
        valueRange: { min: 0.05, max: 80 },
        referenceMinRange: { min: 0.1, max: 1 },
        referenceMaxRange: { min: 1.2, max: 3.5 }
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
  },
  tibc: {
    allowValueOnly: false,
    candidates: [
      {
        unit: "umol/L",
        valueRange: { min: 10, max: 140 },
        referenceMinRange: { min: 20, max: 60 },
        referenceMaxRange: { min: 50, max: 95 }
      },
      {
        unit: "ug/dL",
        valueRange: { min: 50, max: 780 },
        referenceMinRange: { min: 110, max: 330 },
        referenceMaxRange: { min: 280, max: 540 }
      }
    ]
  },
  iron: {
    allowValueOnly: true,
    candidates: [
      {
        unit: "umol/L",
        valueRange: { min: 1, max: 80 },
        referenceMinRange: { min: 3, max: 15 },
        referenceMaxRange: { min: 18, max: 40 }
      },
      {
        unit: "ug/dL",
        valueRange: { min: 10, max: 450 },
        referenceMinRange: { min: 20, max: 90 },
        referenceMaxRange: { min: 80, max: 240 }
      }
    ]
  },
  zinc: {
    allowValueOnly: false,
    candidates: [
      {
        unit: "umol/L",
        valueRange: { min: 1, max: 60 },
        referenceMinRange: { min: 4, max: 14 },
        referenceMaxRange: { min: 12, max: 28 }
      },
      {
        unit: "ug/dL",
        valueRange: { min: 10, max: 400 },
        referenceMinRange: { min: 30, max: 90 },
        referenceMaxRange: { min: 80, max: 190 }
      }
    ]
  },
  copper: {
    allowValueOnly: false,
    candidates: [
      {
        unit: "umol/L",
        valueRange: { min: 1, max: 70 },
        referenceMinRange: { min: 5, max: 16 },
        referenceMaxRange: { min: 12, max: 35 }
      },
      {
        unit: "ug/dL",
        valueRange: { min: 5, max: 450 },
        referenceMinRange: { min: 30, max: 100 },
        referenceMaxRange: { min: 70, max: 240 }
      }
    ]
  },
  selenium: {
    allowValueOnly: false,
    candidates: [
      {
        unit: "umol/L",
        valueRange: { min: 0.1, max: 10 },
        referenceMinRange: { min: 0.3, max: 1.2 },
        referenceMaxRange: { min: 1.1, max: 2.8 }
      },
      {
        unit: "ug/L",
        valueRange: { min: 10, max: 800 },
        referenceMinRange: { min: 30, max: 95 },
        referenceMaxRange: { min: 90, max: 220 }
      }
    ]
  },
  magnesium: {
    allowValueOnly: true,
    candidates: [
      {
        unit: "mmol/L",
        valueRange: { min: 0.2, max: 3 },
        referenceMinRange: { min: 0.4, max: 1.0 },
        referenceMaxRange: { min: 0.7, max: 1.5 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 0.5, max: 7 },
        referenceMinRange: { min: 1, max: 2.3 },
        referenceMaxRange: { min: 1.8, max: 3.8 }
      }
    ]
  },
  calcium: {
    allowValueOnly: true,
    candidates: [
      {
        unit: "mmol/L",
        valueRange: { min: 1, max: 4 },
        referenceMinRange: { min: 1.5, max: 2.4 },
        referenceMaxRange: { min: 2.2, max: 3.2 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 4, max: 20 },
        referenceMinRange: { min: 6, max: 9.5 },
        referenceMaxRange: { min: 8, max: 12.5 }
      }
    ]
  },
  phosphate: {
    allowValueOnly: true,
    candidates: [
      {
        unit: "mmol/L",
        valueRange: { min: 0.2, max: 4 },
        referenceMinRange: { min: 0.4, max: 1.2 },
        referenceMaxRange: { min: 1.1, max: 2.5 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 0.6, max: 12 },
        referenceMinRange: { min: 1.2, max: 3.8 },
        referenceMaxRange: { min: 3, max: 7.5 }
      }
    ]
  },
  "d-dimer": {
    allowValueOnly: true,
    candidates: [
      {
        unit: "mg/L FEU",
        valueRange: { min: 0.01, max: 20 },
        referenceMaxRange: { min: 0.2, max: 1.5 }
      },
      {
        unit: "ng/mL FEU",
        valueRange: { min: 10, max: 20000 },
        referenceMaxRange: { min: 200, max: 1500 }
      }
    ]
  },
  fibrinogen: {
    allowValueOnly: true,
    candidates: [
      {
        unit: "g/L",
        valueRange: { min: 0.5, max: 10 },
        referenceMinRange: { min: 1, max: 2.5 },
        referenceMaxRange: { min: 3, max: 6 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 50, max: 1000 },
        referenceMinRange: { min: 100, max: 250 },
        referenceMaxRange: { min: 300, max: 600 }
      }
    ]
  },
  lactate: {
    allowValueOnly: false,
    candidates: [
      {
        unit: "mmol/L",
        valueRange: { min: 0.1, max: 20 },
        referenceMinRange: { min: 0.2, max: 1.2 },
        referenceMaxRange: { min: 1.2, max: 4.5 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 1, max: 180 },
        referenceMinRange: { min: 2, max: 12 },
        referenceMaxRange: { min: 10, max: 45 }
      }
    ]
  },
  "c-peptide": {
    allowValueOnly: false,
    candidates: [
      {
        unit: "nmol/L",
        valueRange: { min: 0.05, max: 6 },
        referenceMinRange: { min: 0.1, max: 0.8 },
        referenceMaxRange: { min: 0.6, max: 3 }
      },
      {
        unit: "ng/mL",
        valueRange: { min: 0.2, max: 18 },
        referenceMinRange: { min: 0.3, max: 2.5 },
        referenceMaxRange: { min: 2, max: 9 }
      }
    ]
  },
  transferrin: {
    allowValueOnly: true,
    candidates: [
      {
        unit: "g/L",
        valueRange: { min: 0.5, max: 6 },
        referenceMinRange: { min: 1, max: 3 },
        referenceMaxRange: { min: 2.5, max: 5 }
      },
      {
        unit: "mg/dL",
        valueRange: { min: 50, max: 600 },
        referenceMinRange: { min: 100, max: 300 },
        referenceMaxRange: { min: 250, max: 500 }
      }
    ]
  },
  cortisol: {
    allowValueOnly: true,
    candidates: [
      {
        unit: "nmol/L",
        valueRange: { min: 20, max: 2000 },
        referenceMinRange: { min: 60, max: 250 },
        referenceMaxRange: { min: 250, max: 900 }
      },
      {
        unit: "ug/dL",
        valueRange: { min: 1, max: 70 },
        referenceMinRange: { min: 2, max: 8 },
        referenceMaxRange: { min: 8, max: 35 }
      }
    ]
  },
  "dhea-s": {
    allowValueOnly: true,
    candidates: [
      {
        unit: "umol/L",
        valueRange: { min: 0.1, max: 40 },
        referenceMinRange: { min: 0.5, max: 8 },
        referenceMaxRange: { min: 2, max: 20 }
      },
      {
        unit: "ug/dL",
        valueRange: { min: 5, max: 1500 },
        referenceMinRange: { min: 20, max: 250 },
        referenceMaxRange: { min: 100, max: 700 }
      }
    ]
  },
  dhea: {
    allowValueOnly: false,
    candidates: [
      {
        unit: "ng/mL",
        valueRange: { min: 0.1, max: 70 },
        referenceMinRange: { min: 0.3, max: 3.5 },
        referenceMaxRange: { min: 4, max: 18 }
      },
      {
        unit: "umol/L",
        valueRange: { min: 0.01, max: 250 },
        referenceMinRange: { min: 0.8, max: 10 },
        referenceMaxRange: { min: 12, max: 65 }
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

const buildInferenceSignal = (marker: MarkerValue, preferRaw: boolean): InferenceSignal => {
  const preferredValue = preferRaw ? marker.rawValue : marker.value;
  const fallbackValue = preferRaw ? marker.value : marker.rawValue;
  const preferredReferenceMin = preferRaw
    ? marker.rawReferenceMin !== undefined
      ? marker.rawReferenceMin
      : marker.referenceMin
    : marker.referenceMin;
  const fallbackReferenceMin = preferRaw ? marker.referenceMin : marker.referenceMin;
  const preferredReferenceMax = preferRaw
    ? marker.rawReferenceMax !== undefined
      ? marker.rawReferenceMax
      : marker.referenceMax
    : marker.referenceMax;
  const fallbackReferenceMax = preferRaw ? marker.referenceMax : marker.referenceMax;

  return {
    value: toNullableNumber(
      typeof preferredValue === "number"
        ? preferredValue
        : typeof fallbackValue === "number"
          ? fallbackValue
          : null
    ),
    referenceMin: toNullableNumber(
      typeof preferredReferenceMin === "number"
        ? preferredReferenceMin
        : typeof fallbackReferenceMin === "number"
          ? fallbackReferenceMin
          : null
    ),
    referenceMax: toNullableNumber(
      typeof preferredReferenceMax === "number"
        ? preferredReferenceMax
        : typeof fallbackReferenceMax === "number"
          ? fallbackReferenceMax
          : null
    )
  };
};

const inferFromSignal = (
  profile: UnitInferenceProfile,
  signal: InferenceSignal
): UnitReviewSuggestion | null => {
  if (signal.value === null) {
    return null;
  }

  const hasReferenceMin = signal.referenceMin !== null;
  const hasReferenceMax = signal.referenceMax !== null;
  const hasAnyReference = hasReferenceMin || hasReferenceMax;
  const hasCompleteReference = hasReferenceMin && hasReferenceMax;
  const valueMatches = profile.candidates
    .map((candidate) => {
      const valueMatches = isWithinBand(signal.value as number, candidate.valueRange);
      if (!valueMatches) {
        return null;
      }

      const referenceMinMatches = !hasReferenceMin || isWithinBand(signal.referenceMin as number, candidate.referenceMinRange);
      const referenceMaxMatches = !hasReferenceMax || isWithinBand(signal.referenceMax as number, candidate.referenceMaxRange);
      return {
        unit: candidate.unit,
        matchedBy: {
          value: true,
          referenceMin: hasReferenceMin && referenceMinMatches,
          referenceMax: hasReferenceMax && referenceMaxMatches
        },
        strictReferenceMatch: referenceMinMatches && referenceMaxMatches
      };
    })
    .filter(
      (
        candidate
      ): candidate is {
        unit: string;
        matchedBy: UnitReviewSuggestion["matchedBy"];
        strictReferenceMatch: boolean;
      } => candidate !== null
    );

  const strictMatches = valueMatches.filter((candidate) => candidate.strictReferenceMatch);
  if (strictMatches.length === 1) {
    return {
      unit: strictMatches[0].unit,
      confidence: "high",
      matchedBy: strictMatches[0].matchedBy
    };
  }
  if (strictMatches.length > 1) {
    return null;
  }

  if (hasAnyReference && !hasCompleteReference && profile.allowValueOnly && valueMatches.length === 1) {
    return {
      unit: valueMatches[0].unit,
      confidence: "high",
      matchedBy: {
        value: true,
        referenceMin: false,
        referenceMax: false
      }
    };
  }

  if (!hasAnyReference && !profile.allowValueOnly) {
    return null;
  }

  if (hasAnyReference) {
    return null;
  }

  if (valueMatches.length !== 1) {
    return null;
  }

  return {
    unit: valueMatches[0].unit,
    confidence: "high",
    matchedBy: {
      value: true,
      referenceMin: false,
      referenceMax: false
    }
  };
};

const scoreCandidateBySignal = (candidate: UnitInferenceCandidate, signal: InferenceSignal): number => {
  if (signal.value === null) {
    return 0;
  }

  let score = 0;
  if (isWithinBand(signal.value, candidate.valueRange)) {
    score += 4;
  } else {
    const min = candidate.valueRange.min;
    const max = candidate.valueRange.max;
    if (min !== undefined && signal.value < min) {
      score -= Math.min(4, (min - signal.value) / Math.max(Math.abs(min), 1));
    } else if (max !== undefined && signal.value > max) {
      score -= Math.min(4, (signal.value - max) / Math.max(Math.abs(max), 1));
    } else {
      score -= 1;
    }
  }

  if (signal.referenceMin !== null) {
    score += isWithinBand(signal.referenceMin, candidate.referenceMinRange) ? 2 : -2;
  }
  if (signal.referenceMax !== null) {
    score += isWithinBand(signal.referenceMax, candidate.referenceMaxRange) ? 2 : -2;
  }

  return score;
};

const rankProfileUnitsBySignal = (profile: UnitInferenceProfile, marker: MarkerValue): string[] => {
  const signal = buildInferenceSignal(marker, false);
  return profile.candidates
    .map((candidate, index) => ({
      unit: candidate.unit,
      index,
      score: scoreCandidateBySignal(candidate, signal)
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.unit);
};

const resolveUnitOptions = (
  profile: UnitInferenceProfile | undefined,
  marker: CanonicalMarker | null,
  markerValue: MarkerValue
): string[] => {
  const options: string[] = [];

  if (profile) {
    rankProfileUnitsBySignal(profile, markerValue).forEach((unit) => pushUniqueUnit(options, unit));
  }
  if (marker) {
    pushUniqueUnit(options, marker.preferredUnit);
    marker.alternateUnits.forEach((unit) => pushUniqueUnit(options, unit));
  }
  if (options.length === 0) {
    GENERIC_UNIT_REVIEW_OPTIONS.forEach((unit) => pushUniqueUnit(options, unit));
  }

  return options;
};

const inferUnitFromSignals = (
  marker: MarkerValue,
  canonicalMarker: CanonicalMarker | null
): UnitReviewSuggestion | null => {
  const profile = canonicalMarker ? UNIT_INFERENCE_PROFILES[canonicalMarker.id] : undefined;
  if (!profile) {
    return null;
  }

  const normalizedSignal = buildInferenceSignal(marker, false);
  const normalizedSuggestion = inferFromSignal(profile, normalizedSignal);
  if (normalizedSuggestion) {
    return normalizedSuggestion;
  }

  const rawSignal = buildInferenceSignal(marker, true);
  const hasRawSignalDelta =
    normalizedSignal.value !== rawSignal.value ||
    normalizedSignal.referenceMin !== rawSignal.referenceMin ||
    normalizedSignal.referenceMax !== rawSignal.referenceMax;
  if (!hasRawSignalDelta) {
    return null;
  }
  return inferFromSignal(profile, rawSignal);
};

export const buildMarkerUnitReview = (
  marker: MarkerValue,
  matchResult: MarkerMatchResult
): MarkerUnitReview => {
  const currentUnit = String(marker.unit ?? "").trim();
  const isMissingUnit = currentUnit.length === 0;
  const canonicalMarker = matchResult.canonical;
  const profile = canonicalMarker ? UNIT_INFERENCE_PROFILES[canonicalMarker.id] : undefined;
  const allowedUnits = canonicalMarker ? [canonicalMarker.preferredUnit, ...canonicalMarker.alternateUnits].filter(Boolean) : [];
  const isSupportedByCatalog =
    currentUnit.length > 0 && allowedUnits.some((unit) => areUnitsEquivalent(unit, currentUnit));
  const inferredSuggestion = inferUnitFromSignals(marker, canonicalMarker);
  const hasUnsupportedUnit = currentUnit.length > 0 && canonicalMarker !== null && allowedUnits.length > 0 && !isSupportedByCatalog;
  const hasInferredMismatch =
    currentUnit.length > 0 &&
    inferredSuggestion !== null &&
    !areUnitsEquivalent(currentUnit, inferredSuggestion.unit);
  const issueKind: MarkerUnitReview["issueKind"] = isMissingUnit
    ? "missing"
    : hasInferredMismatch
      ? "inferred-mismatch"
      : hasUnsupportedUnit
        ? "unsupported"
        : "none";
  const hasUnitIssue = issueKind !== "none";
  const suggestion = hasUnitIssue ? inferredSuggestion : null;
  const baseOptions = resolveUnitOptions(profile, canonicalMarker, marker);
  const options =
    suggestion === null
      ? baseOptions
      : [suggestion.unit, ...baseOptions.filter((option) => !areUnitsEquivalent(option, suggestion.unit))];

  return {
    isMissingUnit,
    hasUnitIssue,
    issueKind,
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
