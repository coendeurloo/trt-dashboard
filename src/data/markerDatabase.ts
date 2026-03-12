export type RangeType = "min-max" | "max-only" | "min-only" | "none";

export type MarkerCategory =
  | "Complete Blood Count"
  | "Metabolic Health"
  | "Liver Function"
  | "Kidney Function"
  | "Thyroid"
  | "Hormones - Sex"
  | "Hormones - Adrenal"
  | "Vitamins & Minerals"
  | "Inflammatory Markers"
  | "Blood Glucose"
  | "Iron Studies"
  | "Electrolytes"
  | "Coagulation"
  | "Enzymes"
  | "Other";

export interface CanonicalMarker {
  id: string;
  canonicalName: string;
  category: MarkerCategory;
  aliases: string[];
  preferredUnit: string;
  alternateUnits: string[];
  defaultRangeType: RangeType;
  defaultRange?: { min?: number; max?: number };
  optimalRange?: { min?: number; max?: number };
  description?: string;
}

const normalizeAliases = (aliases: string[]): string[] =>
  Array.from(
    new Set(
      aliases
        .map((alias) => alias.trim().toLowerCase())
        .filter(Boolean)
    )
  );

const marker = (entry: CanonicalMarker): CanonicalMarker => ({
  ...entry,
  aliases: normalizeAliases([entry.canonicalName, ...entry.aliases])
});

export const MARKER_DATABASE: CanonicalMarker[] = [
  // Complete Blood Count
  marker({
    id: "leukocytes",
    canonicalName: "Leukocytes",
    category: "Complete Blood Count",
    aliases: ["wbc", "white blood cells", "white blood cell count", "leukocyten", "leukozyten", "white cells", "leucocytes"],
    preferredUnit: "x10^9/L",
    alternateUnits: ["10^9/L", "10e9/L", "g/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 4.0, max: 10.0 },
    optimalRange: { min: 4.5, max: 8.5 },
    description: "White blood cell count reflects immune activity and infection response."
  }),
  marker({
    id: "erythrocytes",
    canonicalName: "Erythrocytes",
    category: "Complete Blood Count",
    aliases: ["rbc", "red blood cells", "red blood cell count", "erythrocyten", "rode bloedcellen", "erythrozyten"],
    preferredUnit: "x10^12/L",
    alternateUnits: ["10^12/L", "10e12/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 4.2, max: 6.0 },
    description: "Red blood cell count supports oxygen transport status."
  }),
  marker({
    id: "hemoglobin",
    canonicalName: "Hemoglobin",
    category: "Complete Blood Count",
    aliases: ["hb", "haemoglobin", "hemoglobine"],
    preferredUnit: "g/dL",
    alternateUnits: ["mmol/L", "g/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 12.5, max: 17.5 },
    description: "Hemoglobin indicates oxygen carrying capacity of blood."
  }),
  marker({
    id: "hematocrit",
    canonicalName: "Hematocrit",
    category: "Complete Blood Count",
    aliases: ["hct", "ht", "hematocriet", "packed cell volume", "pcv"],
    preferredUnit: "%",
    alternateUnits: ["L/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 38, max: 52 },
    optimalRange: { min: 40, max: 50 },
    description: "Hematocrit estimates red blood cell volume fraction."
  }),
  marker({
    id: "mcv",
    canonicalName: "MCV",
    category: "Complete Blood Count",
    aliases: ["mean corpuscular volume"],
    preferredUnit: "fL",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 80, max: 100 }
  }),
  marker({
    id: "mch",
    canonicalName: "MCH",
    category: "Complete Blood Count",
    aliases: ["mean corpuscular hemoglobin"],
    preferredUnit: "pg",
    alternateUnits: ["fmol"],
    defaultRangeType: "min-max",
    defaultRange: { min: 27, max: 34 }
  }),
  marker({
    id: "mchc",
    canonicalName: "MCHC",
    category: "Complete Blood Count",
    aliases: ["mean corpuscular hemoglobin concentration"],
    preferredUnit: "g/dL",
    alternateUnits: ["mmol/L", "g/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 31, max: 36 }
  }),
  marker({
    id: "rdw-cv",
    canonicalName: "RDW-CV",
    category: "Complete Blood Count",
    aliases: ["rdw", "red cell distribution width", "erythrocyte distribution width"],
    preferredUnit: "%",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 11.5, max: 14.5 }
  }),
  marker({
    id: "platelets",
    canonicalName: "Platelets",
    category: "Complete Blood Count",
    aliases: ["platelet count", "thrombocytes", "trombocyten", "bloedplaatjes", "plt"],
    preferredUnit: "x10^9/L",
    alternateUnits: ["10^9/L", "10e9/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 150, max: 400 }
  }),
  marker({
    id: "plateletcrit",
    canonicalName: "Plateletcrit",
    category: "Complete Blood Count",
    aliases: ["pct", "plateletcrit", "platelet crit", "platelet-crit", "thrombocrit", "pct-plateletcrit", "pct plateletcrit"],
    preferredUnit: "%",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 0.12, max: 0.39 }
  }),
  marker({
    id: "mpv",
    canonicalName: "MPV",
    category: "Complete Blood Count",
    aliases: ["m.p.v", "m p v", "mean platelet volume"],
    preferredUnit: "fL",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 7.5, max: 12.5 }
  }),
  marker({
    id: "neutrophils",
    canonicalName: "Neutrophils",
    category: "Complete Blood Count",
    aliases: ["neutrofielen", "neutrophile granulocytes", "pmn"],
    preferredUnit: "%",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 40, max: 75 }
  }),
  marker({
    id: "neutrophils-abs",
    canonicalName: "Neutrophils abs.",
    category: "Complete Blood Count",
    aliases: ["neutrofielen abs", "absolute neutrophils", "neutrophils abs"],
    preferredUnit: "x10^9/L",
    alternateUnits: ["10^9/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 1.8, max: 7.5 }
  }),
  marker({
    id: "lymphocytes",
    canonicalName: "Lymphocytes",
    category: "Complete Blood Count",
    aliases: ["lymfocyten"],
    preferredUnit: "%",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 20, max: 45 }
  }),
  marker({
    id: "lymphocytes-abs",
    canonicalName: "Lymphocytes abs.",
    category: "Complete Blood Count",
    aliases: ["lymphocytes abs", "lymfocyten abs", "absolute lymphocytes"],
    preferredUnit: "x10^9/L",
    alternateUnits: ["10^9/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 1.0, max: 4.0 }
  }),
  marker({
    id: "monocytes",
    canonicalName: "Monocytes",
    category: "Complete Blood Count",
    aliases: ["monocyten"],
    preferredUnit: "%",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 2, max: 12 }
  }),
  marker({
    id: "monocytes-abs",
    canonicalName: "Monocytes abs.",
    category: "Complete Blood Count",
    aliases: ["monocytes abs", "monocyten abs", "absolute monocytes"],
    preferredUnit: "x10^9/L",
    alternateUnits: ["10^9/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 0.2, max: 1.0 }
  }),
  marker({
    id: "eosinophils",
    canonicalName: "Eosinophils",
    category: "Complete Blood Count",
    aliases: ["eosinofielen"],
    preferredUnit: "%",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 0, max: 6 }
  }),
  marker({
    id: "eosinophils-abs",
    canonicalName: "Eosinophils abs.",
    category: "Complete Blood Count",
    aliases: ["eosinophils abs", "eosinofielen abs", "absolute eosinophils"],
    preferredUnit: "x10^9/L",
    alternateUnits: ["10^9/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 0, max: 0.5 }
  }),
  marker({
    id: "basophils",
    canonicalName: "Basophils",
    category: "Complete Blood Count",
    aliases: ["basofielen"],
    preferredUnit: "%",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 0, max: 2 }
  }),
  marker({
    id: "basophils-abs",
    canonicalName: "Basophils abs.",
    category: "Complete Blood Count",
    aliases: ["basophils abs", "basofielen abs", "absolute basophils"],
    preferredUnit: "x10^9/L",
    alternateUnits: ["10^9/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 0, max: 0.2 }
  }),

  // Metabolic Health
  marker({
    id: "total-cholesterol",
    canonicalName: "Total Cholesterol",
    category: "Metabolic Health",
    aliases: ["cholesterol totaal", "cholesterol", "gesamtcholesterin"],
    preferredUnit: "mmol/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "max-only",
    defaultRange: { max: 5.0 },
    optimalRange: { max: 4.5 }
  }),
  marker({
    id: "ldl-cholesterol",
    canonicalName: "LDL Cholesterol",
    category: "Metabolic Health",
    aliases: ["ldl", "ldl-cholesterol", "ldl cholesterol"],
    preferredUnit: "mmol/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "max-only",
    defaultRange: { max: 3.0 },
    optimalRange: { max: 2.6 }
  }),
  marker({
    id: "hdl-cholesterol",
    canonicalName: "HDL Cholesterol",
    category: "Metabolic Health",
    aliases: ["hdl", "hdl-cholesterol", "hdl cholesterol"],
    preferredUnit: "mmol/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "min-only",
    defaultRange: { min: 1.0 },
    optimalRange: { min: 1.2 }
  }),
  marker({
    id: "triglycerides",
    canonicalName: "Triglycerides",
    category: "Metabolic Health",
    aliases: ["triglyceriden", "triglycerides", "tg"],
    preferredUnit: "mmol/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "max-only",
    defaultRange: { max: 1.7 },
    optimalRange: { max: 1.2 }
  }),
  marker({
    id: "non-hdl-cholesterol",
    canonicalName: "Non-HDL Cholesterol",
    category: "Metabolic Health",
    aliases: ["non-hdl", "niet-hdl cholesterol", "non hdl cholesterol"],
    preferredUnit: "mmol/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "max-only",
    defaultRange: { max: 3.8 }
  }),
  marker({
    id: "ldl-hdl-ratio",
    canonicalName: "LDL/HDL Ratio",
    category: "Metabolic Health",
    aliases: ["ldl/hdl ratio", "ldl/hdl-risico index", "cardiovascular risk ratio"],
    preferredUnit: "ratio",
    alternateUnits: [],
    defaultRangeType: "max-only",
    defaultRange: { max: 3.0 }
  }),
  marker({
    id: "total-cholesterol-hdl-ratio",
    canonicalName: "Cholesterol/HDL Ratio",
    category: "Metabolic Health",
    aliases: [
      "total cholesterol/hdl ratio",
      "cholesterol/hdl ratio",
      "chol/hdl ratio",
      "cholesterol hdl ratio",
      "chol/hdlc ratio",
      "chol hdlc ratio",
      "chol/hdlc"
    ],
    preferredUnit: "ratio",
    alternateUnits: [],
    defaultRangeType: "max-only",
    defaultRange: { max: 5.0 }
  }),
  marker({
    id: "triglyceride-hdl-ratio",
    canonicalName: "Triglyceride/HDL Ratio",
    category: "Metabolic Health",
    aliases: ["tg/hdl ratio", "triglyceride hdl ratio", "triglycerides/hdl"],
    preferredUnit: "ratio",
    alternateUnits: [],
    defaultRangeType: "max-only",
    defaultRange: { max: 2.0 }
  }),
  marker({
    id: "apo-b",
    canonicalName: "Apolipoprotein B",
    category: "Metabolic Health",
    aliases: ["apob", "apo b", "apo-b", "apolipoprotein b"],
    preferredUnit: "g/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "max-only",
    defaultRange: { max: 1.0 }
  }),
  marker({
    id: "apo-a1",
    canonicalName: "Apolipoprotein A1",
    category: "Metabolic Health",
    aliases: ["apoa1", "apo a1", "apo-a1", "apolipoprotein a1"],
    preferredUnit: "g/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "min-only",
    defaultRange: { min: 1.2 }
  }),
  marker({
    id: "lipoprotein-a",
    canonicalName: "Lipoprotein (a)",
    category: "Metabolic Health",
    aliases: ["lipoprotein(a)", "lp(a)", "lpa", "lipoprotein a", "lipoproteine a"],
    preferredUnit: "nmol/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "max-only",
    defaultRange: { max: 75 }
  }),
  marker({
    id: "ldl-particle-number",
    canonicalName: "LDL Particle Number",
    category: "Metabolic Health",
    aliases: ["ldl-p", "ldl particle number", "ldl particles number"],
    preferredUnit: "nmol/L",
    alternateUnits: [],
    defaultRangeType: "max-only",
    defaultRange: { max: 1138 }
  }),
  marker({
    id: "ldl-small",
    canonicalName: "LDL Small",
    category: "Metabolic Health",
    aliases: ["ldl small", "small ldl"],
    preferredUnit: "nmol/L",
    alternateUnits: [],
    defaultRangeType: "max-only",
    defaultRange: { max: 142 }
  }),
  marker({
    id: "ldl-medium",
    canonicalName: "LDL Medium",
    category: "Metabolic Health",
    aliases: ["ldl medium", "medium ldl"],
    preferredUnit: "nmol/L",
    alternateUnits: [],
    defaultRangeType: "max-only",
    defaultRange: { max: 215 }
  }),
  marker({
    id: "hdl-large",
    canonicalName: "HDL Large",
    category: "Metabolic Health",
    aliases: ["hdl large", "large hdl"],
    preferredUnit: "nmol/L",
    alternateUnits: [],
    defaultRangeType: "min-only",
    defaultRange: { min: 6729 }
  }),
  marker({
    id: "ldl-peak-size",
    canonicalName: "LDL Peak Size",
    category: "Metabolic Health",
    aliases: ["ldl peak size", "ldl peak"],
    preferredUnit: "Angstrom",
    alternateUnits: [],
    defaultRangeType: "min-only",
    defaultRange: { min: 222.9 }
  }),
  marker({
    id: "ldl-pattern",
    canonicalName: "LDL Pattern",
    category: "Metabolic Health",
    aliases: ["ldl pattern", "ldl-pattern", "ldl pattern a", "ldl pattern b"],
    preferredUnit: "pattern",
    alternateUnits: [],
    defaultRangeType: "none",
    description: "LDL pattern classification (e.g. A/B) from advanced lipoprotein panels."
  }),
  marker({
    id: "small-dense-ldl",
    canonicalName: "Small Dense LDL",
    category: "Metabolic Health",
    aliases: ["sdldl", "small dense ldl", "small-dense ldl"],
    preferredUnit: "mg/dL",
    alternateUnits: ["mmol/L"],
    defaultRangeType: "max-only",
    defaultRange: { max: 50 }
  }),

  // Liver Function
  marker({
    id: "asat",
    canonicalName: "ASAT",
    category: "Liver Function",
    aliases: ["ast", "asat", "asat (got)", "aspartate aminotransferase", "got", "sgot", "sgot (ast)", "sgot ast", "ast (sgot)"],
    preferredUnit: "U/L",
    alternateUnits: ["IU/L"],
    defaultRangeType: "max-only",
    defaultRange: { max: 40 }
  }),
  marker({
    id: "alat",
    canonicalName: "ALAT",
    category: "Liver Function",
    aliases: ["alt", "alat", "alat (gpt)", "alanine aminotransferase", "gpt", "sgpt", "sgpt (alt)", "sgpt alt", "alt (sgpt)"],
    preferredUnit: "U/L",
    alternateUnits: ["IU/L"],
    defaultRangeType: "max-only",
    defaultRange: { max: 40 }
  }),
  marker({
    id: "ggt",
    canonicalName: "GGT",
    category: "Liver Function",
    aliases: ["gamma-gt", "gamma glutamyl transferase", "ggtp"],
    preferredUnit: "U/L",
    alternateUnits: ["IU/L"],
    defaultRangeType: "max-only",
    defaultRange: { max: 60 }
  }),
  marker({
    id: "alkaline-phosphatase",
    canonicalName: "Alkaline Phosphatase",
    category: "Liver Function",
    aliases: ["alp", "alkalische fosfatase", "alk phosphatase", "alk. phosphatase"],
    preferredUnit: "U/L",
    alternateUnits: ["IU/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 40, max: 130 }
  }),
  marker({
    id: "total-bilirubin",
    canonicalName: "Total Bilirubin",
    category: "Liver Function",
    aliases: ["bilirubine totaal", "bilirubin", "bilirubin total"],
    preferredUnit: "umol/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 3, max: 21 }
  }),
  marker({
    id: "direct-bilirubin",
    canonicalName: "Direct Bilirubin",
    category: "Liver Function",
    aliases: ["bilirubine direct", "conjugated bilirubin", "direct bilirubin"],
    preferredUnit: "umol/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "max-only",
    defaultRange: { max: 7 }
  }),
  marker({
    id: "bilirubin-indirect",
    canonicalName: "Indirect Bilirubin",
    category: "Liver Function",
    aliases: ["indirect bilirubin", "unconjugated bilirubin", "bilirubine indirect"],
    preferredUnit: "umol/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "max-only",
    defaultRange: { max: 17 }
  }),
  marker({
    id: "albumin",
    canonicalName: "Albumin",
    category: "Liver Function",
    aliases: ["albumine"],
    preferredUnit: "g/L",
    alternateUnits: ["g/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 35, max: 52 },
    optimalRange: { min: 40, max: 48 }
  }),
  marker({
    id: "globulin",
    canonicalName: "Globulin",
    category: "Liver Function",
    aliases: ["globuline", "serum globulin"],
    preferredUnit: "g/L",
    alternateUnits: ["g/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 20, max: 35 }
  }),
  marker({
    id: "a-g-ratio",
    canonicalName: "Albumin/Globulin Ratio",
    category: "Liver Function",
    aliases: ["a/g ratio", "albumin globulin ratio", "albumine/globuline ratio"],
    preferredUnit: "ratio",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 1.0, max: 2.5 }
  }),
  marker({
    id: "total-protein",
    canonicalName: "Total Protein",
    category: "Liver Function",
    aliases: ["totaal eiwit", "eiwit totaal", "gesamtprotein", "serum protein"],
    preferredUnit: "g/L",
    alternateUnits: ["g/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 64, max: 83 }
  }),
  marker({
    id: "ast-alt-ratio",
    canonicalName: "AST/ALT Ratio",
    category: "Liver Function",
    aliases: ["asat/alat ratio", "ast alt ratio", "de ritis ratio"],
    preferredUnit: "ratio",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 0.7, max: 1.8 }
  }),

  // Kidney Function
  marker({
    id: "creatinine",
    canonicalName: "Creatinine",
    category: "Kidney Function",
    aliases: ["kreatinin", "creatinina", "serum creatinine"],
    preferredUnit: "umol/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 62, max: 106 }
  }),
  marker({
    id: "egfr",
    canonicalName: "eGFR",
    category: "Kidney Function",
    aliases: [
      "egfr",
      "gfr",
      "geschatte glomerulaire filtratiesnelheid",
      "estimated gfr",
      "glomerular filtration",
      "glomerular filtration rate",
      "estimated glomerular filtration",
      "ckd-epi"
    ],
    preferredUnit: "mL/min/1.73m2",
    alternateUnits: [],
    defaultRangeType: "min-only",
    defaultRange: { min: 60 }
  }),
  marker({
    id: "urea",
    canonicalName: "Urea",
    category: "Kidney Function",
    aliases: ["ureum", "urea nitrogen", "bun"],
    preferredUnit: "mmol/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 2.5, max: 7.5 }
  }),
  marker({
    id: "uric-acid",
    canonicalName: "Uric Acid",
    category: "Kidney Function",
    aliases: ["urinezuur", "harnsaeure", "urate", "uric acid"],
    preferredUnit: "umol/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 200, max: 430 }
  }),
  marker({
    id: "cystatin-c",
    canonicalName: "Cystatin C",
    category: "Kidney Function",
    aliases: ["cystatine c", "cystatin c"],
    preferredUnit: "mg/L",
    alternateUnits: [],
    defaultRangeType: "max-only",
    defaultRange: { max: 1.1 }
  }),
  marker({
    id: "bun-creatinine-ratio",
    canonicalName: "BUN/Creatinine Ratio",
    category: "Kidney Function",
    aliases: ["bun creatinine ratio", "bun/creatinine ratio", "bun/creatinine ratio (calc)", "urea creatinine ratio"],
    preferredUnit: "ratio",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 10, max: 20 }
  }),
  marker({
    id: "microalbumin-urine",
    canonicalName: "Microalbumin Urine",
    category: "Kidney Function",
    aliases: ["microalbumin", "urine microalbumin", "albumine urine"],
    preferredUnit: "mg/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "max-only",
    defaultRange: { max: 30 }
  }),
  marker({
    id: "creatinine-urine",
    canonicalName: "Creatinine Urine",
    category: "Kidney Function",
    aliases: ["urine creatinine", "creatinine urine"],
    preferredUnit: "mmol/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "none"
  }),
  marker({
    id: "acr-urine",
    canonicalName: "Albumin/Creatinine Ratio",
    category: "Kidney Function",
    aliases: ["acr", "urine acr", "albumin creatinine ratio", "microalbumin creatinine ratio"],
    preferredUnit: "mg/mmol",
    alternateUnits: ["mg/g"],
    defaultRangeType: "max-only",
    defaultRange: { max: 3.0 }
  }),

  // Thyroid
  marker({
    id: "tsh",
    canonicalName: "TSH",
    category: "Thyroid",
    aliases: ["thyroid stimulating hormone", "thyrotropin", "tsh"],
    preferredUnit: "mIU/L",
    alternateUnits: ["uIU/mL", "mU/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 0.4, max: 4.0 },
    optimalRange: { min: 0.5, max: 2.5 }
  }),
  marker({
    id: "free-t4",
    canonicalName: "Free T4",
    category: "Thyroid",
    aliases: ["ft4", "vrij t4", "free thyroxine", "thyroxine vrij"],
    preferredUnit: "pmol/L",
    alternateUnits: ["ng/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 12, max: 22 }
  }),
  marker({
    id: "free-t3",
    canonicalName: "Free T3",
    category: "Thyroid",
    aliases: ["ft3", "vrij t3", "free triiodothyronine"],
    preferredUnit: "pmol/L",
    alternateUnits: ["pg/mL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 3.1, max: 6.8 }
  }),
  marker({
    id: "total-t4",
    canonicalName: "Total T4",
    category: "Thyroid",
    aliases: ["t4 totaal", "thyroxine totaal", "total t4"],
    preferredUnit: "nmol/L",
    alternateUnits: ["ug/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 64, max: 154 }
  }),
  marker({
    id: "total-t3",
    canonicalName: "Total T3",
    category: "Thyroid",
    aliases: ["t3 totaal", "total triiodothyronine", "total t3"],
    preferredUnit: "nmol/L",
    alternateUnits: ["ng/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 1.2, max: 2.8 }
  }),
  marker({
    id: "reverse-t3",
    canonicalName: "Reverse T3",
    category: "Thyroid",
    aliases: ["rt3", "reverse t3", "r-t3"],
    preferredUnit: "ng/dL",
    alternateUnits: ["pg/mL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 9, max: 24 }
  }),
  marker({
    id: "anti-tpo",
    canonicalName: "Anti-TPO",
    category: "Thyroid",
    aliases: ["tpo antistoffen", "thyroperoxidase antibodies", "anti tpo"],
    preferredUnit: "IU/mL",
    alternateUnits: ["kU/L"],
    defaultRangeType: "max-only",
    defaultRange: { max: 35 }
  }),
  marker({
    id: "anti-tg",
    canonicalName: "Anti-Tg",
    category: "Thyroid",
    aliases: ["thyroglobulin antibodies", "anti tg", "anti-thyroglobulin"],
    preferredUnit: "IU/mL",
    alternateUnits: ["kU/L"],
    defaultRangeType: "max-only",
    defaultRange: { max: 40 }
  }),

  // Hormones - Sex
  marker({
    id: "testosterone-total",
    canonicalName: "Testosterone (Total)",
    category: "Hormones - Sex",
    aliases: ["testosteron", "testosterone", "testosterone, total, ms", "testosterone total ms", "testosteron totaal", "total testosterone", "tt"],
    preferredUnit: "nmol/L",
    alternateUnits: ["ng/dL", "ng/mL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 8.4, max: 28.8 },
    optimalRange: { min: 15, max: 30 }
  }),
  marker({
    id: "free-testosterone",
    canonicalName: "Free Testosterone",
    category: "Hormones - Sex",
    aliases: [
      "vrij testosteron",
      "testosteron vrij",
      "free t",
      "testosterone vrij (issam)",
      "testosteron vrij (volgens issam)",
      "ft"
    ],
    preferredUnit: "pmol/L",
    alternateUnits: ["pg/mL", "nmol/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 115, max: 577 }
  }),
  marker({
    id: "testosterone-bioavailable",
    canonicalName: "Bioavailable Testosterone",
    category: "Hormones - Sex",
    aliases: ["bioavailable testosterone", "bat", "testosterone bioavailable"],
    preferredUnit: "nmol/L",
    alternateUnits: ["ng/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 2.7, max: 13.5 }
  }),
  marker({
    id: "estradiol",
    canonicalName: "Estradiol",
    category: "Hormones - Sex",
    aliases: ["e2", "oestradiol", "estradiol ultrasensitive", "estradiol, ultrasensitive", "estradiol,ultrasensitive, lc/ms", "estradiol (17-beta-estradiol)", "17beta estradiol"],
    preferredUnit: "pmol/L",
    alternateUnits: ["pg/mL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 40, max: 160 }
  }),
  marker({
    id: "shbg",
    canonicalName: "SHBG",
    category: "Hormones - Sex",
    aliases: [
      "sex hormone binding globulin",
      "sex hormone binding globulin serum",
      "sex hormone binding glob, serum",
      "sex hormone binding glob",
      "sex horm bind glob",
      "sex horm bind glob serum",
      "sex.horm.bind. gl.",
      "sex.horm.bind.gl.",
      "shbg (sex.horm.bind. gl.)",
      "geslachtshormoonbindend globuline",
      "sexualhormon-bindendes globulin"
    ],
    preferredUnit: "nmol/L",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 10, max: 70 }
  }),
  marker({
    id: "lh",
    canonicalName: "LH",
    category: "Hormones - Sex",
    aliases: ["luteiniserend hormoon", "luteinizing hormone", "luteinisierendes hormon"],
    preferredUnit: "IU/L",
    alternateUnits: ["mIU/mL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 1.7, max: 8.6 }
  }),
  marker({
    id: "fsh",
    canonicalName: "FSH",
    category: "Hormones - Sex",
    aliases: ["follikelstimulerend hormoon", "follicle stimulating hormone"],
    preferredUnit: "IU/L",
    alternateUnits: ["mIU/mL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 1.5, max: 12.4 }
  }),
  marker({
    id: "prolactin",
    canonicalName: "Prolactin",
    category: "Hormones - Sex",
    aliases: ["prolactine", "prl"],
    preferredUnit: "mIU/L",
    alternateUnits: ["ng/mL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 86, max: 324 }
  }),
  marker({
    id: "dht",
    canonicalName: "DHT",
    category: "Hormones - Sex",
    aliases: ["dihydrotestosterone", "dihydrotestosteron"],
    preferredUnit: "nmol/L",
    alternateUnits: ["ng/dL", "pg/mL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 0.8, max: 3.4 }
  }),
  marker({
    id: "progesterone",
    canonicalName: "Progesterone",
    category: "Hormones - Sex",
    aliases: ["progesteron"],
    preferredUnit: "nmol/L",
    alternateUnits: ["ng/mL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 0.3, max: 3.0 }
  }),
  marker({
    id: "free-androgen-index",
    canonicalName: "Free Androgen Index",
    category: "Hormones - Sex",
    aliases: ["fai", "vrije androgeen index", "free androgen index"],
    preferredUnit: "ratio",
    alternateUnits: ["%"],
    defaultRangeType: "min-max",
    defaultRange: { min: 24, max: 104 }
  }),
  marker({
    id: "testosterone-estradiol-ratio",
    canonicalName: "T/E2 Ratio",
    category: "Hormones - Sex",
    aliases: ["t/e2 ratio", "t e2 ratio", "te2 ratio", "testosterone/estradiol ratio", "testosterone estradiol ratio"],
    preferredUnit: "ratio",
    alternateUnits: [],
    defaultRangeType: "none"
  }),

  // Hormones - Adrenal
  marker({
    id: "cortisol",
    canonicalName: "Cortisol",
    category: "Hormones - Adrenal",
    aliases: ["cortisol", "hydrocortison", "am cortisol"],
    preferredUnit: "nmol/L",
    alternateUnits: ["ug/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 125, max: 536 }
  }),
  marker({
    id: "dhea-s",
    canonicalName: "DHEA-S",
    category: "Hormones - Adrenal",
    aliases: [
      "dhea-s",
      "dheas",
      "dhea s",
      "dhea so4",
      "dhea-so4",
      "dhea - so4",
      "dehydroepiandrosterone sulfate",
      "dehydroepiandrosterone-sulfate",
      "dhea sulfaat",
      "dhea sulphaat",
      "dhea sulphate"
    ],
    preferredUnit: "umol/L",
    alternateUnits: ["ug/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 2.0, max: 15.0 }
  }),
  marker({
    id: "aldosterone",
    canonicalName: "Aldosterone",
    category: "Hormones - Adrenal",
    aliases: ["aldosteron"],
    preferredUnit: "pmol/L",
    alternateUnits: ["ng/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 50, max: 500 }
  }),
  marker({
    id: "acth",
    canonicalName: "ACTH",
    category: "Hormones - Adrenal",
    aliases: ["adrenocorticotropic hormone", "acth"],
    preferredUnit: "pg/mL",
    alternateUnits: ["pmol/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 7, max: 63 }
  }),
  marker({
    id: "renin",
    canonicalName: "Renin",
    category: "Hormones - Adrenal",
    aliases: ["plasma renin", "renine"],
    preferredUnit: "mU/L",
    alternateUnits: ["ng/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 4, max: 46 }
  }),
  marker({
    id: "dhea",
    canonicalName: "DHEA",
    category: "Hormones - Adrenal",
    aliases: ["dehydroepiandrosterone", "dhea"],
    preferredUnit: "ng/mL",
    alternateUnits: ["umol/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 1.3, max: 9.8 }
  }),

  // Vitamins & Minerals
  marker({
    id: "vitamin-d",
    canonicalName: "Vitamin D",
    category: "Vitamins & Minerals",
    aliases: [
      "vitamine d",
      "25-oh vitamine d",
      "25-hydroxyvitamine d",
      "25(oh)d",
      "calcidiol",
      "cholecalciferol"
    ],
    preferredUnit: "nmol/L",
    alternateUnits: ["ng/mL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 50, max: 125 },
    optimalRange: { min: 75, max: 125 }
  }),
  marker({
    id: "vitamin-b12",
    canonicalName: "Vitamin B12",
    category: "Vitamins & Minerals",
    aliases: ["vitamine b12", "cobalamine", "cyanocobalamin"],
    preferredUnit: "pmol/L",
    alternateUnits: ["pg/mL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 150, max: 650 }
  }),
  marker({
    id: "folate",
    canonicalName: "Folate",
    category: "Vitamins & Minerals",
    aliases: ["foliumzuur", "folic acid", "folate", "folsaeure"],
    preferredUnit: "nmol/L",
    alternateUnits: ["ng/mL"],
    defaultRangeType: "min-only",
    defaultRange: { min: 7 }
  }),
  marker({
    id: "ferritin",
    canonicalName: "Ferritin",
    category: "Vitamins & Minerals",
    aliases: ["ferritine", "ferritin"],
    preferredUnit: "ug/L",
    alternateUnits: ["ng/mL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 30, max: 400 },
    optimalRange: { min: 50, max: 200 }
  }),
  marker({
    id: "iron",
    canonicalName: "Iron",
    category: "Vitamins & Minerals",
    aliases: ["ijzer", "serum iron", "serum-eisen", "fe"],
    preferredUnit: "umol/L",
    alternateUnits: ["ug/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 10, max: 30 }
  }),
  marker({
    id: "transferrin-saturation",
    canonicalName: "Transferrin Saturation",
    category: "Vitamins & Minerals",
    aliases: ["transferrine saturatie", "tsat", "ijzerverzadiging"],
    preferredUnit: "%",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 20, max: 45 }
  }),
  marker({
    id: "magnesium",
    canonicalName: "Magnesium",
    category: "Vitamins & Minerals",
    aliases: ["magnesium", "mg", "magnesium serum", "serum magnesium", "magnesium (serum)"],
    preferredUnit: "mmol/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 0.70, max: 1.00 }
  }),
  marker({
    id: "zinc",
    canonicalName: "Zinc",
    category: "Vitamins & Minerals",
    aliases: ["zink", "zn"],
    preferredUnit: "umol/L",
    alternateUnits: ["ug/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 10, max: 18 }
  }),
  marker({
    id: "calcium",
    canonicalName: "Calcium",
    category: "Vitamins & Minerals",
    aliases: ["calcium", "ca"],
    preferredUnit: "mmol/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 2.15, max: 2.55 }
  }),
  marker({
    id: "phosphate",
    canonicalName: "Phosphate",
    category: "Vitamins & Minerals",
    aliases: ["fosfaat", "phosphat", "inorganic phosphate"],
    preferredUnit: "mmol/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 0.8, max: 1.5 }
  }),
  marker({
    id: "vitamin-b6",
    canonicalName: "Vitamin B6",
    category: "Vitamins & Minerals",
    aliases: ["pyridoxine", "vitamine b6", "vitamin b6"],
    preferredUnit: "nmol/L",
    alternateUnits: ["ug/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 20, max: 125 }
  }),
  marker({
    id: "vitamin-b1",
    canonicalName: "Vitamin B1",
    category: "Vitamins & Minerals",
    aliases: ["thiamine", "vitamine b1", "vitamin b1"],
    preferredUnit: "nmol/L",
    alternateUnits: ["ug/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 70, max: 180 }
  }),
  marker({
    id: "vitamin-c",
    canonicalName: "Vitamin C",
    category: "Vitamins & Minerals",
    aliases: ["ascorbic acid", "vitamine c", "vitamin c"],
    preferredUnit: "umol/L",
    alternateUnits: ["mg/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 23, max: 114 }
  }),
  marker({
    id: "copper",
    canonicalName: "Copper",
    category: "Vitamins & Minerals",
    aliases: ["koper", "cu", "serum copper"],
    preferredUnit: "umol/L",
    alternateUnits: ["ug/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 12, max: 24 }
  }),
  marker({
    id: "selenium",
    canonicalName: "Selenium",
    category: "Vitamins & Minerals",
    aliases: ["seleen", "se", "serum selenium"],
    preferredUnit: "umol/L",
    alternateUnits: ["ug/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 0.9, max: 1.9 }
  }),

  // Inflammatory Markers
  marker({
    id: "crp",
    canonicalName: "CRP",
    category: "Inflammatory Markers",
    aliases: ["c-reactive protein", "crp", "c-reactief proteine"],
    preferredUnit: "mg/L",
    alternateUnits: [],
    defaultRangeType: "max-only",
    defaultRange: { max: 5 },
    optimalRange: { max: 1 }
  }),
  marker({
    id: "hs-crp",
    canonicalName: "hs-CRP",
    category: "Inflammatory Markers",
    aliases: ["high-sensitivity crp", "hoogsensitief crp", "hscrp", "hs-crp"],
    preferredUnit: "mg/L",
    alternateUnits: [],
    defaultRangeType: "max-only",
    defaultRange: { max: 3 }
  }),
  marker({
    id: "esr",
    canonicalName: "ESR",
    category: "Inflammatory Markers",
    aliases: ["bse", "erythrocyte sedimentation rate", "bezinkingssnelheid", "blutsenkungsgeschwindigkeit"],
    preferredUnit: "mm/h",
    alternateUnits: [],
    defaultRangeType: "max-only",
    defaultRange: { max: 20 }
  }),
  marker({
    id: "homocysteine",
    canonicalName: "Homocysteine",
    category: "Inflammatory Markers",
    aliases: ["homocysteine", "homocysteine"],
    preferredUnit: "umol/L",
    alternateUnits: [],
    defaultRangeType: "max-only",
    defaultRange: { max: 15 },
    optimalRange: { max: 10 }
  }),
  marker({
    id: "fibrinogen",
    canonicalName: "Fibrinogen",
    category: "Inflammatory Markers",
    aliases: ["fibrinogeen"],
    preferredUnit: "g/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 2.0, max: 4.0 }
  }),
  marker({
    id: "il-6",
    canonicalName: "IL-6",
    category: "Inflammatory Markers",
    aliases: ["interleukin-6", "il 6", "il-6"],
    preferredUnit: "pg/mL",
    alternateUnits: [],
    defaultRangeType: "max-only",
    defaultRange: { max: 7 }
  }),
  marker({
    id: "tnf-alpha",
    canonicalName: "TNF-alpha",
    category: "Inflammatory Markers",
    aliases: ["tnf alpha", "tumor necrosis factor alpha", "tnf-a"],
    preferredUnit: "pg/mL",
    alternateUnits: [],
    defaultRangeType: "max-only",
    defaultRange: { max: 8 }
  }),
  marker({
    id: "lp-pla2",
    canonicalName: "Lp-PLA2",
    category: "Inflammatory Markers",
    aliases: ["lp-pla2", "lipoprotein-associated phospholipase a2"],
    preferredUnit: "nmol/min/mL",
    alternateUnits: ["U/L"],
    defaultRangeType: "max-only",
    defaultRange: { max: 225 }
  }),

  // Blood Glucose
  marker({
    id: "glucose",
    canonicalName: "Glucose",
    category: "Blood Glucose",
    aliases: ["bloedglucose", "blood glucose", "fasting glucose", "glucose nuchter"],
    preferredUnit: "mmol/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 3.9, max: 5.5 },
    optimalRange: { min: 4.2, max: 5.2 }
  }),
  marker({
    id: "hba1c",
    canonicalName: "HbA1c",
    category: "Blood Glucose",
    aliases: ["geglyceerd hemoglobine", "glycated hemoglobin", "hemoglobine a1c", "a1c"],
    preferredUnit: "%",
    alternateUnits: ["mmol/mol"],
    defaultRangeType: "max-only",
    defaultRange: { max: 5.7 },
    optimalRange: { max: 5.4 }
  }),
  marker({
    id: "insulin",
    canonicalName: "Insulin",
    category: "Blood Glucose",
    aliases: ["insuline", "fasting insulin", "insuline nuchter"],
    preferredUnit: "mIU/L",
    alternateUnits: ["uIU/mL", "pmol/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 2, max: 25 },
    optimalRange: { min: 2, max: 10 }
  }),
  marker({
    id: "homa-ir",
    canonicalName: "HOMA-IR",
    category: "Blood Glucose",
    aliases: ["homa ir", "insulin resistance index"],
    preferredUnit: "ratio",
    alternateUnits: [],
    defaultRangeType: "max-only",
    defaultRange: { max: 2.0 }
  }),
  marker({
    id: "c-peptide",
    canonicalName: "C-Peptide",
    category: "Blood Glucose",
    aliases: ["c peptide", "c-peptide", "connecting peptide"],
    preferredUnit: "nmol/L",
    alternateUnits: ["ng/mL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 0.3, max: 1.5 }
  }),
  marker({
    id: "fructosamine",
    canonicalName: "Fructosamine",
    category: "Blood Glucose",
    aliases: ["fructosamine", "glycated serum protein"],
    preferredUnit: "umol/L",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 205, max: 285 }
  }),

  // Iron Studies
  marker({
    id: "tibc",
    canonicalName: "TIBC",
    category: "Iron Studies",
    aliases: ["totale ijzerbindingscapaciteit", "total iron binding capacity"],
    preferredUnit: "umol/L",
    alternateUnits: ["ug/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 45, max: 72 }
  }),
  marker({
    id: "transferrin",
    canonicalName: "Transferrin",
    category: "Iron Studies",
    aliases: ["transferrine"],
    preferredUnit: "g/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 2.0, max: 3.6 }
  }),
  marker({
    id: "soluble-transferrin-receptor",
    canonicalName: "Soluble Transferrin Receptor",
    category: "Iron Studies",
    aliases: ["sTfR", "soluble transferrin receptor", "oplosbare transferrin receptor"],
    preferredUnit: "mg/L",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 1.2, max: 2.8 }
  }),

  // Electrolytes
  marker({
    id: "sodium",
    canonicalName: "Sodium",
    category: "Electrolytes",
    aliases: ["natrium", "na"],
    preferredUnit: "mmol/L",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 135, max: 145 }
  }),
  marker({
    id: "potassium",
    canonicalName: "Potassium",
    category: "Electrolytes",
    aliases: ["kalium", "k"],
    preferredUnit: "mmol/L",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 3.5, max: 5.1 }
  }),
  marker({
    id: "chloride",
    canonicalName: "Chloride",
    category: "Electrolytes",
    aliases: ["chloride", "cl"],
    preferredUnit: "mmol/L",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 98, max: 107 }
  }),
  marker({
    id: "carbon-dioxide",
    canonicalName: "Carbon Dioxide",
    category: "Electrolytes",
    aliases: ["co2", "total co2", "co2 total", "bicarbonate", "bicarbonaat", "hco3", "hco3-"],
    preferredUnit: "mmol/L",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 22, max: 29 }
  }),
  marker({
    id: "anion-gap",
    canonicalName: "Anion Gap",
    category: "Electrolytes",
    aliases: ["anion gap", "anionen gap"],
    preferredUnit: "mmol/L",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 6, max: 16 }
  }),
  marker({
    id: "osmolality",
    canonicalName: "Osmolality",
    category: "Electrolytes",
    aliases: ["osmolality", "serum osmolality", "osmolarity"],
    preferredUnit: "mOsm/kg",
    alternateUnits: ["mmol/kg"],
    defaultRangeType: "min-max",
    defaultRange: { min: 275, max: 295 }
  }),

  // Coagulation
  marker({
    id: "inr",
    canonicalName: "INR",
    category: "Coagulation",
    aliases: ["international normalized ratio", "pt-inr"],
    preferredUnit: "ratio",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 0.8, max: 1.2 }
  }),
  marker({
    id: "pt",
    canonicalName: "PT",
    category: "Coagulation",
    aliases: ["prothrombin time", "protrombinetijd"],
    preferredUnit: "s",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 10, max: 14 }
  }),
  marker({
    id: "aptt",
    canonicalName: "APTT",
    category: "Coagulation",
    aliases: ["activated partial thromboplastin time", "aPTT"],
    preferredUnit: "s",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 25, max: 36 }
  }),
  marker({
    id: "d-dimer",
    canonicalName: "D-Dimer",
    category: "Coagulation",
    aliases: ["d-dimeer", "d dimer"],
    preferredUnit: "mg/L FEU",
    alternateUnits: ["ng/mL FEU"],
    defaultRangeType: "max-only",
    defaultRange: { max: 0.5 }
  }),
  marker({
    id: "antithrombin-iii",
    canonicalName: "Antithrombin III",
    category: "Coagulation",
    aliases: ["antithrombin 3", "antithrombin iii", "at3"],
    preferredUnit: "%",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 80, max: 120 }
  }),

  // Enzymes
  marker({
    id: "ck",
    canonicalName: "CK",
    category: "Enzymes",
    aliases: ["creatine kinase", "creatine-kinase", "ck (creatine-kinase)", "cpk"],
    preferredUnit: "U/L",
    alternateUnits: ["IU/L"],
    defaultRangeType: "max-only",
    defaultRange: { max: 190 }
  }),
  marker({
    id: "ldh",
    canonicalName: "LDH",
    category: "Enzymes",
    aliases: ["lactaat dehydrogenase", "lactate dehydrogenase"],
    preferredUnit: "U/L",
    alternateUnits: ["IU/L"],
    defaultRangeType: "max-only",
    defaultRange: { max: 250 }
  }),
  marker({
    id: "amylase",
    canonicalName: "Amylase",
    category: "Enzymes",
    aliases: ["amylase", "amilase"],
    preferredUnit: "U/L",
    alternateUnits: ["IU/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 28, max: 100 }
  }),
  marker({
    id: "lipase",
    canonicalName: "Lipase",
    category: "Enzymes",
    aliases: ["lipase"],
    preferredUnit: "U/L",
    alternateUnits: ["IU/L"],
    defaultRangeType: "max-only",
    defaultRange: { max: 67 }
  }),

  // Other
  marker({
    id: "psa-total",
    canonicalName: "PSA (Total)",
    category: "Other",
    aliases: ["psa", "psa (total)", "prostaat specifiek antigeen", "prostate specific antigen", "prostate specific antigen total", "psa totaal", "total psa"],
    preferredUnit: "ug/L",
    alternateUnits: ["ng/mL"],
    defaultRangeType: "max-only",
    defaultRange: { max: 4.0 }
  }),
  marker({
    id: "psa-free",
    canonicalName: "Free PSA",
    category: "Other",
    aliases: ["vrij psa", "free psa"],
    preferredUnit: "ug/L",
    alternateUnits: ["ng/mL"],
    defaultRangeType: "none"
  }),
  marker({
    id: "igf-1",
    canonicalName: "IGF-1",
    category: "Other",
    aliases: ["insulin-like growth factor 1", "somatomedin c", "igf1"],
    preferredUnit: "ug/L",
    alternateUnits: ["ng/mL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 80, max: 250 }
  }),
  marker({
    id: "pth",
    canonicalName: "Parathyroid Hormone",
    category: "Other",
    aliases: ["pth", "parathormone", "parathyroid hormone"],
    preferredUnit: "pg/mL",
    alternateUnits: ["pmol/L"],
    defaultRangeType: "min-max",
    defaultRange: { min: 15, max: 65 }
  }),
  marker({
    id: "nt-probnp",
    canonicalName: "NT-proBNP",
    category: "Other",
    aliases: ["nt probnp", "nt-probnp", "n-terminal pro bnp"],
    preferredUnit: "ng/L",
    alternateUnits: ["pg/mL"],
    defaultRangeType: "max-only",
    defaultRange: { max: 125 }
  }),
  marker({
    id: "troponin-i",
    canonicalName: "Troponin I (hs)",
    category: "Other",
    aliases: ["troponin i", "high sensitivity troponin i", "hs troponin i"],
    preferredUnit: "ng/L",
    alternateUnits: ["pg/mL"],
    defaultRangeType: "max-only",
    defaultRange: { max: 26 }
  }),
  marker({
    id: "urine-ph",
    canonicalName: "Urine pH",
    category: "Other",
    aliases: ["urine ph", "ph urine", "urinary ph"],
    preferredUnit: "pH",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 5.0, max: 8.0 }
  }),
  marker({
    id: "lactate",
    canonicalName: "Lactate",
    category: "Other",
    aliases: ["lactic acid", "lactate", "melkzuur"],
    preferredUnit: "mmol/L",
    alternateUnits: ["mg/dL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 0.5, max: 2.2 }
  }),
  marker({
    id: "urine-specific-gravity",
    canonicalName: "Urine Specific Gravity",
    category: "Other",
    aliases: ["specific gravity", "urine specific gravity", "soortelijk gewicht urine"],
    preferredUnit: "ratio",
    alternateUnits: [],
    defaultRangeType: "min-max",
    defaultRange: { min: 1.005, max: 1.03 }
  }),
  marker({
    id: "gh",
    canonicalName: "Growth Hormone",
    category: "Other",
    aliases: ["gh", "growth hormone", "somatotropin"],
    preferredUnit: "ug/L",
    alternateUnits: ["ng/mL"],
    defaultRangeType: "min-max",
    defaultRange: { min: 0, max: 5 }
  })
];

export const MARKER_BY_ID: Record<string, CanonicalMarker> = Object.fromEntries(
  MARKER_DATABASE.map((m) => [m.id, m])
);

export const MARKER_ALIAS_INDEX: Array<{ marker: CanonicalMarker; alias: string; normalizedAlias: string }> =
  MARKER_DATABASE.flatMap((markerEntry) =>
    markerEntry.aliases.map((alias) => ({
      marker: markerEntry,
      alias,
      normalizedAlias: alias
    }))
  );
