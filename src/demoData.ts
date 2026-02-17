import { format, subMonths } from "date-fns";
import { LabReport, MarkerValue, Protocol, ReportAnnotations } from "./types";
import { createId, deriveAbnormalFlag } from "./utils";

export const DEMO_PROTOCOL_CRUISE_ID = "demo-protocol-cruise-125";
export const DEMO_PROTOCOL_ADJUSTED_ID = "demo-protocol-adjusted-115";

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
  "LDL Cholesterol": { unit: "mmol/L", referenceMin: 0, referenceMax: 3.0 },
  Triglycerides: { unit: "mmol/L", referenceMin: 0.4, referenceMax: 1.7 },
  "Apolipoprotein B": { unit: "g/L", referenceMin: 0.55, referenceMax: 1.2 },
  Ferritin: { unit: "µg/L", referenceMin: 30, referenceMax: 400 },
  Prolactin: { unit: "mIU/L", referenceMin: 86, referenceMax: 324 }
};

const EXTRA_DEMO_MARKERS_BY_MONTH: Record<number, Array<{ marker: string; value: number }>> = {
  12: [
    { marker: "Triglycerides", value: 1.5 },
    { marker: "Apolipoprotein B", value: 1.05 },
    { marker: "Ferritin", value: 290 },
    { marker: "Prolactin", value: 210 }
  ],
  9: [
    { marker: "Triglycerides", value: 1.4 },
    { marker: "Apolipoprotein B", value: 1.0 },
    { marker: "Ferritin", value: 270 },
    { marker: "Prolactin", value: 190 }
  ],
  8: [
    { marker: "Triglycerides", value: 1.35 },
    { marker: "Apolipoprotein B", value: 0.98 },
    { marker: "Ferritin", value: 255 },
    { marker: "Prolactin", value: 185 }
  ],
  7: [
    { marker: "Triglycerides", value: 1.28 },
    { marker: "Apolipoprotein B", value: 0.94 },
    { marker: "Ferritin", value: 240 },
    { marker: "Prolactin", value: 178 }
  ],
  6: [
    { marker: "Triglycerides", value: 1.2 },
    { marker: "Apolipoprotein B", value: 0.9 },
    { marker: "Ferritin", value: 225 },
    { marker: "Prolactin", value: 170 }
  ],
  4: [
    { marker: "Triglycerides", value: 1.12 },
    { marker: "Apolipoprotein B", value: 0.86 },
    { marker: "Ferritin", value: 210 },
    { marker: "Prolactin", value: 160 }
  ],
  2: [
    { marker: "Triglycerides", value: 1.06 },
    { marker: "Apolipoprotein B", value: 0.82 },
    { marker: "Ferritin", value: 200 },
    { marker: "Prolactin", value: 155 }
  ],
  1: [
    { marker: "Triglycerides", value: 1.0 },
    { marker: "Apolipoprotein B", value: 0.8 },
    { marker: "Ferritin", value: 195 },
    { marker: "Prolactin", value: 150 }
  ]
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
  protocolId: null,
  protocol: "",
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
    markers: [...input.markers, ...(EXTRA_DEMO_MARKERS_BY_MONTH[input.monthsAgo] ?? [])].map((item) =>
      makeMarker(item.marker, item.value)
    ),
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

export const getDemoProtocols = (): Protocol[] => {
  const now = new Date().toISOString();
  return [
    {
      id: DEMO_PROTOCOL_CRUISE_ID,
      name: "TRT Cruise 125mg",
      compounds: [
        {
          name: "Testosterone Enanthate",
          doseMg: "125 mg/week",
          frequency: "2x_week",
          route: "SubQ"
        }
      ],
      supplements: [
        { name: "Vitamin D3", dose: "4000 IU" },
        { name: "Omega-3", dose: "2 g" },
        { name: "Magnesium Glycinate", dose: "400 mg" },
        { name: "Zinc", dose: "25 mg" }
      ],
      notes: "Stable TRT cruise",
      createdAt: now,
      updatedAt: now
    },
    {
      id: DEMO_PROTOCOL_ADJUSTED_ID,
      name: "TRT Adjusted 115mg",
      compounds: [
        {
          name: "Testosterone Enanthate",
          doseMg: "115 mg/week",
          frequency: "2x_week",
          route: "SubQ"
        }
      ],
      supplements: [
        { name: "Vitamin D3", dose: "4000 IU" },
        { name: "Omega-3", dose: "2 g" },
        { name: "Magnesium Glycinate", dose: "400 mg" },
        { name: "Zinc", dose: "25 mg" }
      ],
      notes: "Adjusted down for balance",
      createdAt: now,
      updatedAt: now
    }
  ];
};

export const getDemoReports = (): LabReport[] => [
  makeReport({
    monthsAgo: 12,
    sourceFileName: "demo-baseline-pre-trt.pdf",
    isBaseline: true,
    annotations: {
      ...defaultAnnotations(),
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
      protocolId: DEMO_PROTOCOL_CRUISE_ID,
      protocol: "Started TRT cruise",
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
    sourceFileName: "demo-trt-month-4.pdf",
    annotations: {
      ...defaultAnnotations(),
      protocolId: DEMO_PROTOCOL_CRUISE_ID,
      protocol: "Cruise continued",
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
    sourceFileName: "demo-trt-month-5.pdf",
    annotations: {
      ...defaultAnnotations(),
      protocolId: DEMO_PROTOCOL_ADJUSTED_ID,
      protocol: "Dose adjusted downward",
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
    sourceFileName: "demo-trt-month-6.pdf",
    annotations: {
      ...defaultAnnotations(),
      protocolId: DEMO_PROTOCOL_ADJUSTED_ID,
      protocol: "Maintaining adjusted protocol",
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
    sourceFileName: "demo-trt-month-8.pdf",
    annotations: {
      ...defaultAnnotations(),
      protocolId: DEMO_PROTOCOL_ADJUSTED_ID,
      protocol: "Adjusted protocol continues",
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
    sourceFileName: "demo-trt-month-9.pdf",
    annotations: {
      ...defaultAnnotations(),
      protocolId: DEMO_PROTOCOL_ADJUSTED_ID,
      protocol: "Stable phase",
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
    sourceFileName: "demo-trt-month-10.pdf",
    annotations: {
      ...defaultAnnotations(),
      protocolId: DEMO_PROTOCOL_ADJUSTED_ID,
      protocol: "Fine-tuned adjusted protocol",
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
