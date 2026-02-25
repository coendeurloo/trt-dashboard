import { format, subMonths, subWeeks } from "date-fns";
import { LabReport, MarkerValue, Protocol, ReportAnnotations, SupplementPeriod, SymptomCheckIn } from "./types";
import { createId, deriveAbnormalFlag } from "./utils";

export const DEMO_PROTOCOL_CRUISE_ID = "demo-protocol-cruise-125";
export const DEMO_PROTOCOL_ADJUSTED_ID = "demo-protocol-adjusted-115";
export const DEMO_PROTOCOL_SPLIT_ID = "demo-protocol-split-110";
export const DEMO_PROTOCOL_CYPIO_ID = "demo-protocol-cypio-120";

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
  3: [
    { marker: "Triglycerides", value: 1.08 },
    { marker: "Apolipoprotein B", value: 0.83 },
    { marker: "Ferritin", value: 205 },
    { marker: "Prolactin", value: 156 }
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
  supplementAnchorState: "inherit",
  supplementOverrides: null,
  symptoms: "",
  notes: "",
  samplingTiming: "trough"
});

const makeSupplementAnchor = (
  monthsAgo: number,
  slug: string,
  name: string,
  dose: string,
  frequency = "daily"
): SupplementPeriod => ({
  id: `demo-report-supp-${monthsAgo}-${slug}`,
  name,
  dose,
  frequency,
  startDate: makeIsoDate(subMonths(new Date(), monthsAgo)),
  endDate: null
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
      notes: "Adjusted down for balance",
      createdAt: now,
      updatedAt: now
    },
    {
      id: DEMO_PROTOCOL_SPLIT_ID,
      name: "TRT Split 110mg",
      compounds: [
        {
          name: "Testosterone Enanthate",
          doseMg: "110 mg/week",
          frequency: "3x_week",
          route: "SubQ"
        }
      ],
      notes: "Split frequency for smoother levels",
      createdAt: now,
      updatedAt: now
    },
    {
      id: DEMO_PROTOCOL_CYPIO_ID,
      name: "TRT Cypionate 120mg",
      compounds: [
        {
          name: "Testosterone Cypionate",
          doseMg: "120 mg/week",
          frequency: "2x_week",
          route: "IM"
        }
      ],
      notes: "Compound switch trial with stable weekly total",
      createdAt: now,
      updatedAt: now
    }
  ];
};

export const getDemoSupplementTimeline = (): SupplementPeriod[] => {
  const reports = getDemoReports();
  const dateAt = (index: number): string => reports[index]?.testDate ?? new Date().toISOString().slice(0, 10);
  return [
    {
      id: "demo-supp-vitd3",
      name: "Vitamin D3",
      dose: "4000 IU",
      frequency: "daily",
      startDate: dateAt(0),
      endDate: null
    },
    {
      id: "demo-supp-omega3",
      name: "Omega-3",
      dose: "2 g",
      frequency: "daily",
      startDate: dateAt(1),
      endDate: null
    },
    {
      id: "demo-supp-mag",
      name: "Magnesium Glycinate",
      dose: "400 mg",
      frequency: "daily",
      startDate: dateAt(1),
      endDate: null
    },
    {
      id: "demo-supp-zinc",
      name: "Zinc",
      dose: "25 mg",
      frequency: "daily",
      startDate: dateAt(1),
      endDate: dateAt(3)
    },
    {
      id: "demo-supp-nac",
      name: "NAC",
      dose: "600 mg",
      frequency: "daily",
      startDate: dateAt(2),
      endDate: null
    }
  ];
};

export const getDemoCheckIns = (): SymptomCheckIn[] => {
  const entries: Omit<SymptomCheckIn, "id" | "date">[] = [
    {
      energy: 4,
      libido: 3,
      mood: 5,
      sleep: 4,
      motivation: 4,
      notes: "Baseline week: low afternoon energy, waking up tired most days."
    },
    {
      energy: 5,
      libido: 4,
      mood: 5,
      sleep: 5,
      motivation: 5,
      notes: "First improvements in daytime focus; still occasional evening crash."
    },
    {
      energy: 6,
      libido: 5,
      mood: 6,
      sleep: 5,
      motivation: 6,
      notes: "Better training sessions and recovery, fewer low-energy mornings."
    },
    {
      energy: 7,
      libido: 6,
      mood: 6,
      sleep: 6,
      motivation: 7,
      notes: "Steadier mood this week, productive workdays, more consistent routine."
    },
    {
      energy: 6,
      libido: 5,
      mood: 5,
      sleep: 4,
      motivation: 5,
      notes: "Stressful week with shorter sleep; noticed mild dip in drive and patience."
    },
    {
      energy: 7,
      libido: 6,
      mood: 7,
      sleep: 6,
      motivation: 7,
      notes: "Recovered from previous dip; better stress control and stable workouts."
    },
    {
      energy: 7,
      libido: 7,
      mood: 7,
      sleep: 7,
      motivation: 7,
      notes: "Good week overall: strong mornings, stable mood, and no afternoon slump."
    },
    {
      energy: 8,
      libido: 7,
      mood: 7,
      sleep: 7,
      motivation: 8,
      notes: "High output week with solid recovery and better sleep consistency."
    },
    {
      energy: 7,
      libido: 6,
      mood: 7,
      sleep: 6,
      motivation: 7,
      notes: "Busy schedule but still stable; slight sleep drop after late training."
    },
    {
      energy: 8,
      libido: 7,
      mood: 8,
      sleep: 7,
      motivation: 8,
      notes: "Felt balanced most days, good mental clarity and productive evenings."
    },
    {
      energy: 8,
      libido: 8,
      mood: 8,
      sleep: 8,
      motivation: 8,
      notes: "Best week so far: strong motivation, calm mood, and restorative sleep."
    },
    {
      energy: 7,
      libido: 7,
      mood: 8,
      sleep: 7,
      motivation: 7,
      notes: "Stable maintenance week; kept momentum with no major complaints."
    }
  ];

  return entries.map((entry, index) => {
    const weeksAgo = entries.length - index - 1;
    return {
      id: `demo-checkin-${String(index + 1).padStart(2, "0")}`,
      date: makeIsoDate(subWeeks(new Date(), weeksAgo)),
      ...entry
    };
  });
};

export const getDemoReports = (): LabReport[] => [
  makeReport({
    monthsAgo: 12,
    sourceFileName: "demo-baseline-pre-trt.pdf",
    isBaseline: true,
    annotations: {
      ...defaultAnnotations(),
      protocol: "Pre-TRT baseline",
      supplementAnchorState: "none",
      supplementOverrides: [],
      samplingTiming: "trough"
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
      supplementAnchorState: "anchor",
      supplementOverrides: [
        makeSupplementAnchor(9, "vitd3", "Vitamin D3", "2000 IU"),
        makeSupplementAnchor(9, "omega3", "Omega-3", "1 g")
      ],
      samplingTiming: "trough"
    },
    markers: [
      { marker: "Testosterone", value: 31.2 },
      { marker: "Free Testosterone", value: 0.5 },
      { marker: "Estradiol", value: 134 },
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
      { marker: "Testosterone", value: 29.8 },
      { marker: "Free Testosterone", value: 0.47 },
      { marker: "Estradiol", value: 126 },
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
      supplementAnchorState: "anchor",
      supplementOverrides: [
        makeSupplementAnchor(7, "vitd3", "Vitamin D3", "4000 IU"),
        makeSupplementAnchor(7, "omega3", "Omega-3", "2 g"),
        makeSupplementAnchor(7, "mag", "Magnesium Glycinate", "300 mg")
      ],
      symptoms: "More balanced mood after lowering dose",
      samplingTiming: "trough"
    },
    markers: [
      { marker: "Testosterone", value: 18.9 },
      { marker: "Free Testosterone", value: 0.37 },
      { marker: "Estradiol", value: 96 },
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
      { marker: "Testosterone", value: 17.1 },
      { marker: "Free Testosterone", value: 0.33 },
      { marker: "Estradiol", value: 88 },
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
      protocolId: DEMO_PROTOCOL_SPLIT_ID,
      protocol: "Frequency split trial",
      supplementAnchorState: "anchor",
      supplementOverrides: [
        makeSupplementAnchor(4, "vitd3", "Vitamin D3", "4000 IU"),
        makeSupplementAnchor(4, "omega3", "Omega-3", "2 g"),
        makeSupplementAnchor(4, "mag", "Magnesium Glycinate", "400 mg"),
        makeSupplementAnchor(4, "nac", "NAC", "600 mg")
      ],
      symptoms: "Smoother mood and fewer peaks",
      samplingTiming: "trough"
    },
    markers: [
      { marker: "Testosterone", value: 15.3 },
      { marker: "Free Testosterone", value: 0.3 },
      { marker: "Estradiol", value: 76 },
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
    monthsAgo: 3,
    sourceFileName: "demo-trt-month-8b.pdf",
    annotations: {
      ...defaultAnnotations(),
      protocolId: DEMO_PROTOCOL_SPLIT_ID,
      protocol: "Split protocol stabilized",
      symptoms: "Fewer peaks, better sleep consistency",
      samplingTiming: "trough"
    },
    markers: [
      { marker: "Testosterone", value: 16.0 },
      { marker: "Free Testosterone", value: 0.31 },
      { marker: "Estradiol", value: 79 },
      { marker: "SHBG", value: 35.5 },
      { marker: "Hematocrit", value: 0.462 },
      { marker: "PSA", value: 0.75 },
      { marker: "Hemoglobin", value: 9.8 },
      { marker: "Cholesterol", value: 4.68 },
      { marker: "HDL Cholesterol", value: 1.2 },
      { marker: "LDL Cholesterol", value: 2.68 }
    ]
  }),
  makeReport({
    monthsAgo: 2,
    sourceFileName: "demo-trt-month-9.pdf",
    annotations: {
      ...defaultAnnotations(),
      protocolId: DEMO_PROTOCOL_CYPIO_ID,
      protocol: "Switched to cypionate",
      notes: "Trial switch to compare feel and recovery",
      samplingTiming: "trough"
    },
    markers: [
      { marker: "Testosterone", value: 21.1 },
      { marker: "Free Testosterone", value: 0.44 },
      { marker: "Estradiol", value: 94 },
      { marker: "SHBG", value: 34.5 },
      { marker: "Hematocrit", value: 0.47 },
      { marker: "PSA", value: 0.8 },
      { marker: "Hemoglobin", value: 9.7 },
      { marker: "Cholesterol", value: 4.6 },
      { marker: "HDL Cholesterol", value: 1.2 },
      { marker: "LDL Cholesterol", value: 2.7 }
    ]
  }),
  makeReport({
    monthsAgo: 1,
    sourceFileName: "demo-trt-month-10.pdf",
    annotations: {
      ...defaultAnnotations(),
      protocolId: DEMO_PROTOCOL_CYPIO_ID,
      protocol: "Cypionate maintenance",
      notes: "Stable response on new compound",
      samplingTiming: "trough"
    },
    markers: [
      { marker: "Testosterone", value: 20.7 },
      { marker: "Free Testosterone", value: 0.42 },
      { marker: "Estradiol", value: 90 },
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
