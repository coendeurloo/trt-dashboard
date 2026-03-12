import { format, subMonths, subWeeks } from "date-fns";
import { LabReport, MarkerValue, Protocol, ReportAnnotations, SupplementPeriod, SymptomCheckIn, UserProfile } from "./types";
import { REPORTS_OVERVIEW_PRIMARY_MARKERS_BY_PROFILE } from "./constants";
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
  Prolactin: { unit: "mIU/L", referenceMin: 86, referenceMax: 324 },
  ALT: { unit: "U/L", referenceMin: 0, referenceMax: 45 },
  AST: { unit: "U/L", referenceMin: 0, referenceMax: 40 },
  GGT: { unit: "U/L", referenceMin: 0, referenceMax: 60 },
  Creatinine: { unit: "µmol/L", referenceMin: 64, referenceMax: 104 },
  eGFR: { unit: "mL/min/1.73m²", referenceMin: 90, referenceMax: 130 },
  Glucose: { unit: "mmol/L", referenceMin: 3.9, referenceMax: 5.5 },
  HbA1c: { unit: "%", referenceMin: 4.0, referenceMax: 5.6 },
  TSH: { unit: "mIU/L", referenceMin: 0.4, referenceMax: 4.0 },
  "Free T4": { unit: "pmol/L", referenceMin: 12, referenceMax: 22 },
  "Vitamin D (D3+D2) OH": { unit: "nmol/L", referenceMin: 75, referenceMax: 150 },
  "Vitamine B12": { unit: "pmol/L", referenceMin: 150, referenceMax: 700 },
  CRP: { unit: "mg/L", referenceMin: 0, referenceMax: 5 },
  Homocysteine: { unit: "µmol/L", referenceMin: 5, referenceMax: 15 },
  "IGF-1": { unit: "µg/L", referenceMin: 110, referenceMax: 310 }
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
    { marker: "Ferritin", value: 210 },
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
  interventionId: null,
  interventionLabel: "",
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

const normalizeDemoCompound = (compound: Protocol["compounds"][number]): Protocol["compounds"][number] => {
  const dose = (compound.dose ?? compound.doseMg ?? "").trim();
  return {
    ...compound,
    dose,
    doseMg: dose
  };
};

const createDemoProtocol = (input: Omit<Protocol, "items" | "compounds"> & { compounds: Protocol["compounds"] }): Protocol => {
  const compounds = input.compounds.map((compound) => normalizeDemoCompound(compound));
  return {
    ...input,
    items: compounds,
    compounds
  };
};

const makeReport = (input: {
  monthsAgo: number;
  sourceFileName: string;
  isBaseline?: boolean;
  annotations: ReportAnnotations;
  markers: Array<{ marker: string; value: number }>;
  includeTimelineExtras?: boolean;
}): LabReport => {
  const date = subMonths(new Date(), input.monthsAgo);
  const testDate = makeIsoDate(date);
  const interventionId = input.annotations.interventionId ?? input.annotations.protocolId ?? null;
  const interventionLabel = input.annotations.interventionLabel ?? input.annotations.protocol ?? "";
  const annotations: ReportAnnotations = {
    ...input.annotations,
    interventionId,
    interventionLabel,
    protocolId: interventionId,
    protocol: interventionLabel
  };
  return {
    id: createId(),
    sourceFileName: input.sourceFileName,
    testDate,
    createdAt: makeCreatedAt(testDate),
    markers: [
      ...input.markers,
      ...(input.includeTimelineExtras === false ? [] : EXTRA_DEMO_MARKERS_BY_MONTH[input.monthsAgo] ?? [])
    ].map((item) =>
      makeMarker(item.marker, item.value)
    ),
    annotations,
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
  ].map((protocol) => createDemoProtocol(protocol));
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
    const values = {
      ...(typeof entry.energy === "number" ? { energy: entry.energy } : {}),
      ...(typeof entry.mood === "number" ? { mood: entry.mood } : {}),
      ...(typeof entry.sleep === "number" ? { sleep: entry.sleep } : {}),
      ...(typeof entry.libido === "number" ? { libido: entry.libido } : {}),
      ...(typeof entry.motivation === "number" ? { motivation: entry.motivation } : {})
    };
    return {
      id: `demo-checkin-${String(index + 1).padStart(2, "0")}`,
      date: makeIsoDate(subWeeks(new Date(), weeksAgo)),
      profileAtEntry: "trt",
      values,
      ...entry
    };
  });
};

// TODO: profile-specific demo data
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
      { marker: "Testosterone", value: 29.2 },
      { marker: "Free Testosterone", value: 0.45 },
      { marker: "Estradiol", value: 122 },
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
      { marker: "Testosterone", value: 24.0 },
      { marker: "Free Testosterone", value: 0.4 },
      { marker: "Estradiol", value: 112 },
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
      { marker: "Testosterone", value: 19.6 },
      { marker: "Free Testosterone", value: 0.39 },
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
      { marker: "Testosterone", value: 19.2 },
      { marker: "Free Testosterone", value: 0.37 },
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
      { marker: "Testosterone", value: 18.4 },
      { marker: "Free Testosterone", value: 0.35 },
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
      { marker: "Testosterone", value: 18.8 },
      { marker: "Free Testosterone", value: 0.34 },
      { marker: "Estradiol", value: 82 },
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
      { marker: "Estradiol", value: 86 },
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

export interface DemoSnapshot {
  reports: LabReport[];
  protocols: Protocol[];
  supplementTimeline: SupplementPeriod[];
  checkIns: SymptomCheckIn[];
  primaryMarkersSelection: string[];
}

const buildProfileCheckIns = (
  profileKey: string,
  entries: Array<Omit<SymptomCheckIn, "id" | "date" | "profileAtEntry" | "values">>
): SymptomCheckIn[] =>
  entries.map((entry, index) => {
    const weeksAgo = entries.length - index - 1;
    const values = {
      ...(typeof entry.energy === "number" ? { energy: entry.energy } : {}),
      ...(typeof entry.mood === "number" ? { mood: entry.mood } : {}),
      ...(typeof entry.sleep === "number" ? { sleep: entry.sleep } : {}),
      ...(typeof entry.libido === "number" ? { libido: entry.libido } : {}),
      ...(typeof entry.motivation === "number" ? { motivation: entry.motivation } : {})
    };
    return {
      id: `demo-checkin-${profileKey}-${String(index + 1).padStart(2, "0")}`,
      date: makeIsoDate(subWeeks(new Date(), weeksAgo)),
      profileAtEntry: profileKey as UserProfile,
      values,
      ...entry
    };
  });

const getEnhancedDemoProtocols = (): Protocol[] => {
  const now = new Date().toISOString();
  return [
    {
      id: "demo-protocol-enhanced-cruise",
      name: "Performance Cruise",
      compounds: [
        { name: "Testosterone Enanthate", doseMg: "220 mg/week", frequency: "2x_week", route: "IM" }
      ],
      notes: "Cruise baseline before higher load block",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "demo-protocol-enhanced-blast",
      name: "Performance Block",
      compounds: [
        { name: "Testosterone Enanthate", doseMg: "350 mg/week", frequency: "3x_week", route: "IM" },
        { name: "Nandrolone Decanoate", doseMg: "180 mg/week", frequency: "2x_week", route: "IM" }
      ],
      notes: "High-load phase for performance",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "demo-protocol-enhanced-reduce",
      name: "Risk-Reduction Taper",
      compounds: [{ name: "Testosterone Enanthate", doseMg: "180 mg/week", frequency: "2x_week", route: "IM" }],
      notes: "Downshift to improve blood markers",
      createdAt: now,
      updatedAt: now
    }
  ].map((protocol) => createDemoProtocol(protocol));
};

const getEnhancedDemoReports = (): LabReport[] => [
  makeReport({
    monthsAgo: 10,
    sourceFileName: "demo-enhanced-baseline.pdf",
    isBaseline: true,
    includeTimelineExtras: false,
    annotations: { ...defaultAnnotations(), protocol: "Cruise baseline", samplingTiming: "trough" },
    markers: [
      { marker: "Testosterone", value: 18.8 },
      { marker: "Estradiol", value: 92 },
      { marker: "Hematocrit", value: 0.48 },
      { marker: "Hemoglobin", value: 9.7 },
      { marker: "ALT", value: 32 },
      { marker: "AST", value: 29 },
      { marker: "GGT", value: 21 },
      { marker: "LDL Cholesterol", value: 3.1 },
      { marker: "HDL Cholesterol", value: 1.24 },
      { marker: "Apolipoprotein B", value: 0.97 },
      { marker: "Creatinine", value: 94 },
      { marker: "eGFR", value: 103 }
    ]
  }),
  makeReport({
    monthsAgo: 7,
    sourceFileName: "demo-enhanced-block-start.pdf",
    includeTimelineExtras: false,
    annotations: { ...defaultAnnotations(), protocolId: "demo-protocol-enhanced-blast", protocol: "Performance block", samplingTiming: "trough" },
    markers: [
      { marker: "Testosterone", value: 36.2 },
      { marker: "Estradiol", value: 148 },
      { marker: "Hematocrit", value: 0.515 },
      { marker: "Hemoglobin", value: 10.4 },
      { marker: "ALT", value: 49 },
      { marker: "AST", value: 42 },
      { marker: "GGT", value: 33 },
      { marker: "LDL Cholesterol", value: 3.8 },
      { marker: "HDL Cholesterol", value: 1.02 },
      { marker: "Apolipoprotein B", value: 1.18 },
      { marker: "Creatinine", value: 104 },
      { marker: "eGFR", value: 94 }
    ]
  }),
  makeReport({
    monthsAgo: 5,
    sourceFileName: "demo-enhanced-mid-block.pdf",
    includeTimelineExtras: false,
    annotations: { ...defaultAnnotations(), protocolId: "demo-protocol-enhanced-blast", protocol: "Performance block continued", samplingTiming: "trough" },
    markers: [
      { marker: "Testosterone", value: 39.4 },
      { marker: "Estradiol", value: 166 },
      { marker: "Hematocrit", value: 0.536 },
      { marker: "Hemoglobin", value: 10.8 },
      { marker: "ALT", value: 64 },
      { marker: "AST", value: 56 },
      { marker: "GGT", value: 45 },
      { marker: "LDL Cholesterol", value: 4.2 },
      { marker: "HDL Cholesterol", value: 0.88 },
      { marker: "Apolipoprotein B", value: 1.36 },
      { marker: "Creatinine", value: 112 },
      { marker: "eGFR", value: 85 }
    ]
  }),
  makeReport({
    monthsAgo: 3,
    sourceFileName: "demo-enhanced-downshift.pdf",
    includeTimelineExtras: false,
    annotations: { ...defaultAnnotations(), protocolId: "demo-protocol-enhanced-reduce", protocol: "Risk-reduction taper", samplingTiming: "trough" },
    markers: [
      { marker: "Testosterone", value: 26.8 },
      { marker: "Estradiol", value: 126 },
      { marker: "Hematocrit", value: 0.522 },
      { marker: "Hemoglobin", value: 10.3 },
      { marker: "ALT", value: 54 },
      { marker: "AST", value: 45 },
      { marker: "GGT", value: 34 },
      { marker: "LDL Cholesterol", value: 3.6 },
      { marker: "HDL Cholesterol", value: 0.99 },
      { marker: "Apolipoprotein B", value: 1.19 },
      { marker: "Creatinine", value: 106 },
      { marker: "eGFR", value: 91 }
    ]
  }),
  makeReport({
    monthsAgo: 2,
    sourceFileName: "demo-enhanced-stabilize.pdf",
    includeTimelineExtras: false,
    annotations: { ...defaultAnnotations(), protocolId: "demo-protocol-enhanced-reduce", protocol: "Stabilization phase", samplingTiming: "trough" },
    markers: [
      { marker: "Testosterone", value: 24.2 },
      { marker: "Estradiol", value: 112 },
      { marker: "Hematocrit", value: 0.506 },
      { marker: "Hemoglobin", value: 10.0 },
      { marker: "ALT", value: 46 },
      { marker: "AST", value: 39 },
      { marker: "GGT", value: 28 },
      { marker: "LDL Cholesterol", value: 3.3 },
      { marker: "HDL Cholesterol", value: 1.06 },
      { marker: "Apolipoprotein B", value: 1.08 },
      { marker: "Creatinine", value: 101 },
      { marker: "eGFR", value: 97 }
    ]
  }),
  makeReport({
    monthsAgo: 1,
    sourceFileName: "demo-enhanced-current.pdf",
    includeTimelineExtras: false,
    annotations: { ...defaultAnnotations(), protocolId: "demo-protocol-enhanced-reduce", protocol: "Current reduced load", samplingTiming: "trough" },
    markers: [
      { marker: "Testosterone", value: 22.6 },
      { marker: "Estradiol", value: 104 },
      { marker: "Hematocrit", value: 0.499 },
      { marker: "Hemoglobin", value: 9.9 },
      { marker: "ALT", value: 41 },
      { marker: "AST", value: 35 },
      { marker: "GGT", value: 24 },
      { marker: "LDL Cholesterol", value: 3.1 },
      { marker: "HDL Cholesterol", value: 1.12 },
      { marker: "Apolipoprotein B", value: 1.01 },
      { marker: "Creatinine", value: 98 },
      { marker: "eGFR", value: 100 }
    ]
  })
];

const getEnhancedDemoSupplementTimeline = (): SupplementPeriod[] => {
  const reports = getEnhancedDemoReports();
  const dateAt = (index: number): string => reports[index]?.testDate ?? new Date().toISOString().slice(0, 10);
  return [
    { id: "demo-supp-enhanced-omega3", name: "Omega-3", dose: "3 g", frequency: "daily", startDate: dateAt(0), endDate: null },
    { id: "demo-supp-enhanced-nac", name: "NAC", dose: "1200 mg", frequency: "daily", startDate: dateAt(1), endDate: null },
    { id: "demo-supp-enhanced-tudca", name: "TUDCA", dose: "500 mg", frequency: "daily", startDate: dateAt(1), endDate: dateAt(4) },
    {
      id: "demo-supp-enhanced-bergamot",
      name: "Citrus Bergamot",
      dose: "1000 mg",
      frequency: "daily",
      startDate: dateAt(3),
      endDate: null
    }
  ];
};

const getEnhancedDemoCheckIns = (): SymptomCheckIn[] =>
  buildProfileCheckIns("enhanced", [
    { energy: 6, libido: 6, mood: 6, sleep: 6, motivation: 7, notes: "Good gym output, average recovery." },
    { energy: 7, libido: 7, mood: 6, sleep: 5, motivation: 8, notes: "Performance climbing, sleep quality drifting down." },
    { energy: 8, libido: 8, mood: 6, sleep: 5, motivation: 8, notes: "Strong sessions, but higher resting stress." },
    { energy: 7, libido: 7, mood: 5, sleep: 4, motivation: 7, notes: "Noticeable fatigue accumulation." },
    { energy: 6, libido: 6, mood: 6, sleep: 6, motivation: 7, notes: "Downshift improved sleep and recovery." },
    { energy: 7, libido: 7, mood: 7, sleep: 7, motivation: 7, notes: "Better balance with reduced load." }
  ]);

const getHealthDemoReports = (): LabReport[] => [
  makeReport({
    monthsAgo: 10,
    sourceFileName: "demo-health-baseline.pdf",
    isBaseline: true,
    includeTimelineExtras: false,
    annotations: { ...defaultAnnotations(), protocol: "General health baseline", samplingTiming: "trough" },
    markers: [
      { marker: "Glucose", value: 5.8 },
      { marker: "HbA1c", value: 5.8 },
      { marker: "TSH", value: 3.7 },
      { marker: "Free T4", value: 13.2 },
      { marker: "Vitamin D (D3+D2) OH", value: 56 },
      { marker: "Vitamine B12", value: 210 },
      { marker: "Ferritin", value: 86 },
      { marker: "CRP", value: 4.2 },
      { marker: "Homocysteine", value: 14.4 },
      { marker: "LDL Cholesterol", value: 3.7 },
      { marker: "HDL Cholesterol", value: 1.1 },
      { marker: "Triglycerides", value: 2.0 }
    ]
  }),
  makeReport({
    monthsAgo: 8,
    sourceFileName: "demo-health-phase-1.pdf",
    includeTimelineExtras: false,
    annotations: { ...defaultAnnotations(), protocol: "Diet + sleep intervention", samplingTiming: "trough" },
    markers: [
      { marker: "Glucose", value: 5.5 },
      { marker: "HbA1c", value: 5.6 },
      { marker: "TSH", value: 3.2 },
      { marker: "Free T4", value: 14.0 },
      { marker: "Vitamin D (D3+D2) OH", value: 64 },
      { marker: "Vitamine B12", value: 260 },
      { marker: "Ferritin", value: 82 },
      { marker: "CRP", value: 3.3 },
      { marker: "Homocysteine", value: 13.1 },
      { marker: "LDL Cholesterol", value: 3.5 },
      { marker: "HDL Cholesterol", value: 1.16 },
      { marker: "Triglycerides", value: 1.8 }
    ]
  }),
  makeReport({
    monthsAgo: 6,
    sourceFileName: "demo-health-phase-2.pdf",
    includeTimelineExtras: false,
    annotations: { ...defaultAnnotations(), protocol: "Nutrition consistency", samplingTiming: "trough" },
    markers: [
      { marker: "Glucose", value: 5.3 },
      { marker: "HbA1c", value: 5.5 },
      { marker: "TSH", value: 2.9 },
      { marker: "Free T4", value: 14.7 },
      { marker: "Vitamin D (D3+D2) OH", value: 74 },
      { marker: "Vitamine B12", value: 315 },
      { marker: "Ferritin", value: 94 },
      { marker: "CRP", value: 2.4 },
      { marker: "Homocysteine", value: 12.2 },
      { marker: "LDL Cholesterol", value: 3.3 },
      { marker: "HDL Cholesterol", value: 1.2 },
      { marker: "Triglycerides", value: 1.6 }
    ]
  }),
  makeReport({
    monthsAgo: 4,
    sourceFileName: "demo-health-phase-3.pdf",
    includeTimelineExtras: false,
    annotations: { ...defaultAnnotations(), protocol: "Activity volume increased", samplingTiming: "trough" },
    markers: [
      { marker: "Glucose", value: 5.1 },
      { marker: "HbA1c", value: 5.4 },
      { marker: "TSH", value: 2.6 },
      { marker: "Free T4", value: 15.1 },
      { marker: "Vitamin D (D3+D2) OH", value: 83 },
      { marker: "Vitamine B12", value: 372 },
      { marker: "Ferritin", value: 112 },
      { marker: "CRP", value: 1.9 },
      { marker: "Homocysteine", value: 11.2 },
      { marker: "LDL Cholesterol", value: 3.1 },
      { marker: "HDL Cholesterol", value: 1.26 },
      { marker: "Triglycerides", value: 1.4 }
    ]
  }),
  makeReport({
    monthsAgo: 2,
    sourceFileName: "demo-health-phase-4.pdf",
    includeTimelineExtras: false,
    annotations: { ...defaultAnnotations(), protocol: "Maintenance", samplingTiming: "trough" },
    markers: [
      { marker: "Glucose", value: 4.9 },
      { marker: "HbA1c", value: 5.3 },
      { marker: "TSH", value: 2.2 },
      { marker: "Free T4", value: 15.8 },
      { marker: "Vitamin D (D3+D2) OH", value: 92 },
      { marker: "Vitamine B12", value: 418 },
      { marker: "Ferritin", value: 121 },
      { marker: "CRP", value: 1.3 },
      { marker: "Homocysteine", value: 10.3 },
      { marker: "LDL Cholesterol", value: 2.9 },
      { marker: "HDL Cholesterol", value: 1.33 },
      { marker: "Triglycerides", value: 1.2 }
    ]
  }),
  makeReport({
    monthsAgo: 1,
    sourceFileName: "demo-health-current.pdf",
    includeTimelineExtras: false,
    annotations: { ...defaultAnnotations(), protocol: "Current state", samplingTiming: "trough" },
    markers: [
      { marker: "Glucose", value: 4.8 },
      { marker: "HbA1c", value: 5.2 },
      { marker: "TSH", value: 2.0 },
      { marker: "Free T4", value: 16.0 },
      { marker: "Vitamin D (D3+D2) OH", value: 97 },
      { marker: "Vitamine B12", value: 452 },
      { marker: "Ferritin", value: 126 },
      { marker: "CRP", value: 1.1 },
      { marker: "Homocysteine", value: 9.7 },
      { marker: "LDL Cholesterol", value: 2.8 },
      { marker: "HDL Cholesterol", value: 1.36 },
      { marker: "Triglycerides", value: 1.1 }
    ]
  })
];

const getHealthDemoSupplementTimeline = (): SupplementPeriod[] => {
  const reports = getHealthDemoReports();
  const dateAt = (index: number): string => reports[index]?.testDate ?? new Date().toISOString().slice(0, 10);
  return [
    { id: "demo-supp-health-vitd", name: "Vitamin D3", dose: "3000 IU", frequency: "daily", startDate: dateAt(0), endDate: null },
    { id: "demo-supp-health-b12", name: "Methyl B12", dose: "1000 mcg", frequency: "daily", startDate: dateAt(1), endDate: null },
    { id: "demo-supp-health-mag", name: "Magnesium Glycinate", dose: "300 mg", frequency: "daily", startDate: dateAt(1), endDate: null },
    { id: "demo-supp-health-fiber", name: "Psyllium Fiber", dose: "8 g", frequency: "daily", startDate: dateAt(2), endDate: null }
  ];
};

const getHealthDemoCheckIns = (): SymptomCheckIn[] =>
  buildProfileCheckIns("health", [
    { energy: 5, libido: 5, mood: 5, sleep: 5, motivation: 5, notes: "Baseline: irregular sleep and variable energy." },
    { energy: 6, libido: 5, mood: 6, sleep: 6, motivation: 6, notes: "Better routine and less afternoon crash." },
    { energy: 6, libido: 6, mood: 6, sleep: 6, motivation: 6, notes: "Steadier appetite and focus." },
    { energy: 7, libido: 6, mood: 7, sleep: 7, motivation: 7, notes: "Clear upward trend in recovery and mood." },
    { energy: 7, libido: 6, mood: 7, sleep: 7, motivation: 7, notes: "Consistency week, less stress reactivity." },
    { energy: 8, libido: 6, mood: 8, sleep: 8, motivation: 8, notes: "Stable sleep and high daytime clarity." }
  ]);

const getBiohackerDemoProtocols = (): Protocol[] => {
  const now = new Date().toISOString();
  return [
    {
      id: "demo-protocol-biohacker-a",
      name: "Experiment A",
      compounds: [{ name: "Testosterone Enanthate", doseMg: "100 mg/week", frequency: "3x_week", route: "SubQ" }],
      notes: "Stability-focused hormone baseline",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "demo-protocol-biohacker-b",
      name: "Experiment B",
      compounds: [{ name: "Testosterone Enanthate", doseMg: "90 mg/week", frequency: "3x_week", route: "SubQ" }],
      notes: "Lower-dose phase to optimize lipid and inflammatory profile",
      createdAt: now,
      updatedAt: now
    }
  ].map((protocol) => createDemoProtocol(protocol));
};

const getBiohackerDemoReports = (): LabReport[] => [
  makeReport({
    monthsAgo: 10,
    sourceFileName: "demo-biohacker-baseline.pdf",
    isBaseline: true,
    includeTimelineExtras: false,
    annotations: { ...defaultAnnotations(), protocolId: "demo-protocol-biohacker-a", protocol: "Experiment A baseline", samplingTiming: "trough" },
    markers: [
      { marker: "Testosterone", value: 21.2 },
      { marker: "Free Testosterone", value: 0.42 },
      { marker: "Estradiol", value: 88 },
      { marker: "SHBG", value: 31 },
      { marker: "Apolipoprotein B", value: 1.04 },
      { marker: "Homocysteine", value: 12.4 },
      { marker: "CRP", value: 2.6 },
      { marker: "Ferritin", value: 180 },
      { marker: "HbA1c", value: 5.4 },
      { marker: "Vitamin D (D3+D2) OH", value: 72 },
      { marker: "Glucose", value: 5.2 },
      { marker: "IGF-1", value: 214 }
    ]
  }),
  makeReport({
    monthsAgo: 8,
    sourceFileName: "demo-biohacker-a2.pdf",
    includeTimelineExtras: false,
    annotations: { ...defaultAnnotations(), protocolId: "demo-protocol-biohacker-a", protocol: "Experiment A adjusted", samplingTiming: "trough" },
    markers: [
      { marker: "Testosterone", value: 22.0 },
      { marker: "Free Testosterone", value: 0.43 },
      { marker: "Estradiol", value: 95 },
      { marker: "SHBG", value: 30 },
      { marker: "Apolipoprotein B", value: 1.09 },
      { marker: "Homocysteine", value: 12.1 },
      { marker: "CRP", value: 2.2 },
      { marker: "Ferritin", value: 176 },
      { marker: "HbA1c", value: 5.4 },
      { marker: "Vitamin D (D3+D2) OH", value: 76 },
      { marker: "Glucose", value: 5.1 },
      { marker: "IGF-1", value: 222 }
    ]
  }),
  makeReport({
    monthsAgo: 6,
    sourceFileName: "demo-biohacker-b1.pdf",
    includeTimelineExtras: false,
    annotations: { ...defaultAnnotations(), protocolId: "demo-protocol-biohacker-b", protocol: "Experiment B start", samplingTiming: "trough" },
    markers: [
      { marker: "Testosterone", value: 18.9 },
      { marker: "Free Testosterone", value: 0.37 },
      { marker: "Estradiol", value: 78 },
      { marker: "SHBG", value: 32 },
      { marker: "Apolipoprotein B", value: 0.99 },
      { marker: "Homocysteine", value: 11.2 },
      { marker: "CRP", value: 1.8 },
      { marker: "Ferritin", value: 171 },
      { marker: "HbA1c", value: 5.3 },
      { marker: "Vitamin D (D3+D2) OH", value: 84 },
      { marker: "Glucose", value: 5.0 },
      { marker: "IGF-1", value: 205 }
    ]
  }),
  makeReport({
    monthsAgo: 4,
    sourceFileName: "demo-biohacker-b2.pdf",
    includeTimelineExtras: false,
    annotations: { ...defaultAnnotations(), protocolId: "demo-protocol-biohacker-b", protocol: "Experiment B continuation", samplingTiming: "trough" },
    markers: [
      { marker: "Testosterone", value: 18.1 },
      { marker: "Free Testosterone", value: 0.35 },
      { marker: "Estradiol", value: 74 },
      { marker: "SHBG", value: 33 },
      { marker: "Apolipoprotein B", value: 0.94 },
      { marker: "Homocysteine", value: 10.5 },
      { marker: "CRP", value: 1.5 },
      { marker: "Ferritin", value: 166 },
      { marker: "HbA1c", value: 5.2 },
      { marker: "Vitamin D (D3+D2) OH", value: 92 },
      { marker: "Glucose", value: 4.9 },
      { marker: "IGF-1", value: 196 }
    ]
  }),
  makeReport({
    monthsAgo: 2,
    sourceFileName: "demo-biohacker-b3.pdf",
    includeTimelineExtras: false,
    annotations: { ...defaultAnnotations(), protocolId: "demo-protocol-biohacker-b", protocol: "Experiment B optimization", samplingTiming: "trough" },
    markers: [
      { marker: "Testosterone", value: 17.6 },
      { marker: "Free Testosterone", value: 0.34 },
      { marker: "Estradiol", value: 70 },
      { marker: "SHBG", value: 34 },
      { marker: "Apolipoprotein B", value: 0.89 },
      { marker: "Homocysteine", value: 9.8 },
      { marker: "CRP", value: 1.2 },
      { marker: "Ferritin", value: 160 },
      { marker: "HbA1c", value: 5.1 },
      { marker: "Vitamin D (D3+D2) OH", value: 101 },
      { marker: "Glucose", value: 4.8 },
      { marker: "IGF-1", value: 188 }
    ]
  }),
  makeReport({
    monthsAgo: 1,
    sourceFileName: "demo-biohacker-current.pdf",
    includeTimelineExtras: false,
    annotations: { ...defaultAnnotations(), protocolId: "demo-protocol-biohacker-b", protocol: "Current profile", samplingTiming: "trough" },
    markers: [
      { marker: "Testosterone", value: 17.8 },
      { marker: "Free Testosterone", value: 0.35 },
      { marker: "Estradiol", value: 72 },
      { marker: "SHBG", value: 34 },
      { marker: "Apolipoprotein B", value: 0.86 },
      { marker: "Homocysteine", value: 9.4 },
      { marker: "CRP", value: 1.0 },
      { marker: "Ferritin", value: 158 },
      { marker: "HbA1c", value: 5.0 },
      { marker: "Vitamin D (D3+D2) OH", value: 106 },
      { marker: "Glucose", value: 4.7 },
      { marker: "IGF-1", value: 191 }
    ]
  })
];

const getBiohackerDemoSupplementTimeline = (): SupplementPeriod[] => {
  const reports = getBiohackerDemoReports();
  const dateAt = (index: number): string => reports[index]?.testDate ?? new Date().toISOString().slice(0, 10);
  return [
    { id: "demo-supp-biohacker-omega3", name: "Omega-3", dose: "2 g", frequency: "daily", startDate: dateAt(0), endDate: null },
    { id: "demo-supp-biohacker-berberine", name: "Berberine", dose: "500 mg", frequency: "2x_daily", startDate: dateAt(1), endDate: null },
    { id: "demo-supp-biohacker-glycine", name: "Glycine", dose: "3 g", frequency: "nightly", startDate: dateAt(2), endDate: null },
    { id: "demo-supp-biohacker-creatine", name: "Creatine Monohydrate", dose: "5 g", frequency: "daily", startDate: dateAt(0), endDate: null }
  ];
};

const getBiohackerDemoCheckIns = (): SymptomCheckIn[] =>
  buildProfileCheckIns("biohacker", [
    { energy: 6, libido: 6, mood: 6, sleep: 6, motivation: 7, notes: "Baseline tracking block." },
    { energy: 7, libido: 6, mood: 7, sleep: 6, motivation: 7, notes: "Improved consistency with lower variance." },
    { energy: 7, libido: 6, mood: 7, sleep: 7, motivation: 7, notes: "Sleep latency down after evening routine change." },
    { energy: 7, libido: 6, mood: 7, sleep: 7, motivation: 8, notes: "Better morning readiness scores." },
    { energy: 8, libido: 7, mood: 8, sleep: 8, motivation: 8, notes: "Stable high output with low perceived strain." },
    { energy: 8, libido: 7, mood: 8, sleep: 8, motivation: 8, notes: "Current phase remains stable." }
  ]);

export const getDemoSnapshot = (profile: UserProfile): DemoSnapshot => {
  if (profile === "enhanced") {
    return {
      reports: getEnhancedDemoReports(),
      protocols: getEnhancedDemoProtocols(),
      supplementTimeline: getEnhancedDemoSupplementTimeline(),
      checkIns: getEnhancedDemoCheckIns(),
      primaryMarkersSelection: [...REPORTS_OVERVIEW_PRIMARY_MARKERS_BY_PROFILE.enhanced]
    };
  }
  if (profile === "health") {
    return {
      reports: getHealthDemoReports(),
      protocols: [],
      supplementTimeline: getHealthDemoSupplementTimeline(),
      checkIns: getHealthDemoCheckIns(),
      primaryMarkersSelection: [...REPORTS_OVERVIEW_PRIMARY_MARKERS_BY_PROFILE.health]
    };
  }
  if (profile === "biohacker") {
    return {
      reports: getBiohackerDemoReports(),
      protocols: getBiohackerDemoProtocols(),
      supplementTimeline: getBiohackerDemoSupplementTimeline(),
      checkIns: getBiohackerDemoCheckIns(),
      primaryMarkersSelection: [...REPORTS_OVERVIEW_PRIMARY_MARKERS_BY_PROFILE.biohacker]
    };
  }
  return {
    reports: getDemoReports(),
    protocols: getDemoProtocols(),
    supplementTimeline: getDemoSupplementTimeline(),
    checkIns: getDemoCheckIns(),
    primaryMarkersSelection: [...REPORTS_OVERVIEW_PRIMARY_MARKERS_BY_PROFILE.trt]
  };
};
