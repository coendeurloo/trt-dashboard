import { format, subMonths } from "date-fns";
import { LabReport, MarkerValue, ReportAnnotations } from "./types";
import { createId, deriveAbnormalFlag } from "./utils";

type MarkerTemplate = {
  unit: string;
  referenceMin: number | null;
  referenceMax: number | null;
};

const MARKER_TEMPLATES: Record<string, MarkerTemplate> = {
  Testosterone: { unit: "nmol/L", referenceMin: 8.0, referenceMax: 29.0 },
  "Free Testosterone": { unit: "nmol/L", referenceMin: 0.17, referenceMax: 0.67 },
  Estradiol: { unit: "pmol/L", referenceMin: 40, referenceMax: 160 },
  SHBG: { unit: "nmol/L", referenceMin: 18, referenceMax: 54 },
  Hematocrit: { unit: "L/L", referenceMin: 0.4, referenceMax: 0.54 },
  PSA: { unit: "µg/L", referenceMin: 0, referenceMax: 4.0 },
  Hemoglobin: { unit: "mmol/L", referenceMin: 8.5, referenceMax: 11.0 },
  Cholesterol: { unit: "mmol/L", referenceMin: 0, referenceMax: 5.0 },
  "HDL Cholesterol": { unit: "mmol/L", referenceMin: 0.9, referenceMax: 2.0 },
  "LDL Cholesterol": { unit: "mmol/L", referenceMin: 0, referenceMax: 3.0 }
};

const makeIsoDate = (date: Date): string => format(date, "yyyy-MM-dd");

const makeCreatedAt = (isoDate: string): string => new Date(`${isoDate}T08:00:00.000Z`).toISOString();

const makeMarker = (canonicalMarker: string, value: number): MarkerValue => {
  const template = MARKER_TEMPLATES[canonicalMarker];
  const referenceMin = template?.referenceMin ?? null;
  const referenceMax = template?.referenceMax ?? null;
  return {
    id: createId(),
    marker: canonicalMarker,
    canonicalMarker,
    value,
    unit: template?.unit ?? "",
    referenceMin,
    referenceMax,
    abnormal: deriveAbnormalFlag(value, referenceMin, referenceMax),
    confidence: 1
  };
};

const defaultAnnotations = (): ReportAnnotations => ({
  dosageMgPerWeek: null,
  compound: "",
  injectionFrequency: "unknown",
  protocol: "",
  supplements: "",
  symptoms: "",
  notes: "",
  samplingTiming: "unknown"
});

const makeReport = (input: {
  monthsAgo: number;
  sourceFileName: string;
  isBaseline?: boolean;
  annotations: ReportAnnotations;
  markers: Array<{ marker: string; value: number }>;
}): LabReport => {
  const date = subMonths(new Date(), input.monthsAgo);
  const testDate = makeIsoDate(date);
  return {
    id: createId(),
    sourceFileName: input.sourceFileName,
    testDate,
    createdAt: makeCreatedAt(testDate),
    markers: input.markers.map((item) => makeMarker(item.marker, item.value)),
    annotations: input.annotations,
    isBaseline: input.isBaseline,
    extraction: {
      provider: "fallback",
      model: "demo-data",
      confidence: 1,
      needsReview: false
    }
  };
};

export const getDemoReports = (): LabReport[] => [
  makeReport({
    monthsAgo: 12,
    sourceFileName: "demo-baseline-pre-trt.pdf",
    isBaseline: true,
    annotations: {
      ...defaultAnnotations(),
      dosageMgPerWeek: null,
      protocol: "Pre-TRT baseline",
      samplingTiming: "unknown"
    },
    markers: [
      { marker: "Testosterone", value: 8.2 },
      { marker: "Free Testosterone", value: 0.18 },
      { marker: "Estradiol", value: 65 },
      { marker: "SHBG", value: 42 },
      { marker: "Hematocrit", value: 0.43 },
      { marker: "PSA", value: 0.6 },
      { marker: "Hemoglobin", value: 9.1 },
      { marker: "Cholesterol", value: 5.4 },
      { marker: "HDL Cholesterol", value: 1.3 },
      { marker: "LDL Cholesterol", value: 3.2 }
    ]
  }),
  makeReport({
    monthsAgo: 9,
    sourceFileName: "demo-trt-month-3.pdf",
    annotations: {
      ...defaultAnnotations(),
      dosageMgPerWeek: 125,
      protocol: "Testosterone Enanthate 125mg/week",
      supplements: "Vitamin D 4000IU, Omega-3",
      samplingTiming: "trough"
    },
    markers: [
      { marker: "Testosterone", value: 22.5 },
      { marker: "Free Testosterone", value: 0.45 },
      { marker: "Estradiol", value: 118 },
      { marker: "SHBG", value: 38 },
      { marker: "Hematocrit", value: 0.46 },
      { marker: "PSA", value: 0.7 },
      { marker: "Hemoglobin", value: 9.8 },
      { marker: "Cholesterol", value: 5.1 },
      { marker: "HDL Cholesterol", value: 1.2 },
      { marker: "LDL Cholesterol", value: 3.0 }
    ]
  }),
  makeReport({
    monthsAgo: 8,
    sourceFileName: "demo-trt-month-4-dose-increase.pdf",
    annotations: {
      ...defaultAnnotations(),
      dosageMgPerWeek: 140,
      protocol: "Testosterone Enanthate 140mg/week (temporary increase)",
      supplements: "Vitamin D 4000IU, Omega-3",
      symptoms: "More drive, occasional water retention",
      samplingTiming: "trough"
    },
    markers: [
      { marker: "Testosterone", value: 24.8 },
      { marker: "Free Testosterone", value: 0.49 },
      { marker: "Estradiol", value: 128 },
      { marker: "SHBG", value: 37 },
      { marker: "Hematocrit", value: 0.47 },
      { marker: "PSA", value: 0.72 },
      { marker: "Hemoglobin", value: 10.0 },
      { marker: "Cholesterol", value: 5.0 },
      { marker: "HDL Cholesterol", value: 1.18 },
      { marker: "LDL Cholesterol", value: 2.95 }
    ]
  }),
  makeReport({
    monthsAgo: 7,
    sourceFileName: "demo-trt-month-5-dose-step-down.pdf",
    annotations: {
      ...defaultAnnotations(),
      dosageMgPerWeek: 115,
      protocol: "Testosterone Enanthate 115mg/week",
      supplements: "Vitamin D 4000IU, Omega-3, Magnesium",
      symptoms: "More balanced mood after lowering dose",
      samplingTiming: "trough"
    },
    markers: [
      { marker: "Testosterone", value: 20.2 },
      { marker: "Free Testosterone", value: 0.42 },
      { marker: "Estradiol", value: 103 },
      { marker: "SHBG", value: 36.5 },
      { marker: "Hematocrit", value: 0.475 },
      { marker: "PSA", value: 0.73 },
      { marker: "Hemoglobin", value: 10.0 },
      { marker: "Cholesterol", value: 4.9 },
      { marker: "HDL Cholesterol", value: 1.17 },
      { marker: "LDL Cholesterol", value: 2.9 }
    ]
  }),
  makeReport({
    monthsAgo: 6,
    sourceFileName: "demo-trt-month-6-dose-adjustment.pdf",
    annotations: {
      ...defaultAnnotations(),
      dosageMgPerWeek: 100,
      protocol: "Testosterone Enanthate 100mg/week (lowered from 125mg)",
      supplements: "Vitamin D 4000IU, Omega-3, Magnesium",
      symptoms: "Reduced dose due to high hematocrit",
      samplingTiming: "trough"
    },
    markers: [
      { marker: "Testosterone", value: 18.1 },
      { marker: "Free Testosterone", value: 0.38 },
      { marker: "Estradiol", value: 95 },
      { marker: "SHBG", value: 36 },
      { marker: "Hematocrit", value: 0.48 },
      { marker: "PSA", value: 0.7 },
      { marker: "Hemoglobin", value: 9.9 },
      { marker: "Cholesterol", value: 4.8 },
      { marker: "HDL Cholesterol", value: 1.15 },
      { marker: "LDL Cholesterol", value: 2.8 }
    ]
  }),
  makeReport({
    monthsAgo: 4,
    sourceFileName: "demo-trt-month-8-lower-dose-trial.pdf",
    annotations: {
      ...defaultAnnotations(),
      dosageMgPerWeek: 90,
      protocol: "Testosterone Enanthate 90mg/week (short trial)",
      supplements: "Vitamin D 4000IU, Omega-3, Magnesium",
      symptoms: "Slightly lower energy but better sleep",
      samplingTiming: "trough"
    },
    markers: [
      { marker: "Testosterone", value: 16.8 },
      { marker: "Free Testosterone", value: 0.34 },
      { marker: "Estradiol", value: 80 },
      { marker: "SHBG", value: 36 },
      { marker: "Hematocrit", value: 0.46 },
      { marker: "PSA", value: 0.74 },
      { marker: "Hemoglobin", value: 9.8 },
      { marker: "Cholesterol", value: 4.7 },
      { marker: "HDL Cholesterol", value: 1.19 },
      { marker: "LDL Cholesterol", value: 2.7 }
    ]
  }),
  makeReport({
    monthsAgo: 2,
    sourceFileName: "demo-trt-month-9-stable.pdf",
    annotations: {
      ...defaultAnnotations(),
      dosageMgPerWeek: 100,
      protocol: "Testosterone Enanthate 100mg/week",
      supplements: "Vitamin D 4000IU, Omega-3, Magnesium",
      notes: "Feeling great, energy levels stable",
      samplingTiming: "trough"
    },
    markers: [
      { marker: "Testosterone", value: 19.3 },
      { marker: "Free Testosterone", value: 0.41 },
      { marker: "Estradiol", value: 88 },
      { marker: "SHBG", value: 35 },
      { marker: "Hematocrit", value: 0.47 },
      { marker: "PSA", value: 0.8 },
      { marker: "Hemoglobin", value: 9.7 },
      { marker: "Cholesterol", value: 4.6 },
      { marker: "HDL Cholesterol", value: 1.2 },
      { marker: "LDL Cholesterol", value: 2.6 }
    ]
  }),
  makeReport({
    monthsAgo: 1,
    sourceFileName: "demo-trt-month-10-fine-tune.pdf",
    annotations: {
      ...defaultAnnotations(),
      dosageMgPerWeek: 110,
      protocol: "Testosterone Enanthate 110mg/week",
      supplements: "Vitamin D 4000IU, Omega-3, Magnesium",
      notes: "Fine-tuned dose for energy and recovery",
      samplingTiming: "trough"
    },
    markers: [
      { marker: "Testosterone", value: 20.0 },
      { marker: "Free Testosterone", value: 0.43 },
      { marker: "Estradiol", value: 92 },
      { marker: "SHBG", value: 34.5 },
      { marker: "Hematocrit", value: 0.468 },
      { marker: "PSA", value: 0.79 },
      { marker: "Hemoglobin", value: 9.9 },
      { marker: "Cholesterol", value: 4.6 },
      { marker: "HDL Cholesterol", value: 1.21 },
      { marker: "LDL Cholesterol", value: 2.6 }
    ]
  })
];
