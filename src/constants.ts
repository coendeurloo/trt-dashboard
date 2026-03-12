import { AppSettings } from "./types";

export const APP_STORAGE_KEY = "trt_lab_tracker_v1";
export const APP_SCHEMA_VERSION = 6;
export const FEEDBACK_EMAIL = "trtlabtracker@gmail.com";

export const PRIMARY_MARKERS = [
  "Testosterone",
  "Free Testosterone",
  "Estradiol",
  "Hematocrit",
  "SHBG"
] as const;

export const CARDIO_PRIORITY_MARKERS = [
  "Apolipoprotein B",
  "LDL Cholesterol",
  "Non-HDL Cholesterol",
  "Cholesterol"
] as const;

export const PROTOCOL_MARKER_CATEGORIES: Record<string, string[]> = {
  Hormones: ["Testosterone", "Free Testosterone", "Estradiol", "SHBG", "Free Androgen Index", "Dihydrotestosteron (DHT)"],
  Lipids: ["LDL Cholesterol", "HDL Cholesterol", "Cholesterol", "Triglyceriden", "Apolipoprotein B", "Non-HDL Cholesterol"],
  Hematology: ["Hematocrit", "Hemoglobin", "Red Blood Cells", "Platelets", "Leukocyten"],
  Inflammation: ["CRP"]
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  unitSystem: "us",
  language: "en",
  userProfile: "trt",
  tooltipDetailMode: "compact",
  enableSamplingControls: false,
  enableCalculatedFreeTestosterone: false,
  showReferenceRanges: true,
  showAbnormalHighlights: true,
  showAnnotations: false,
  showCheckInOverlay: false,
  showTrtTargetZone: false,
  showLongevityTargetZone: false,
  yAxisMode: "zero",
  samplingFilter: "all",
  compareToBaseline: false,
  comparisonScale: "absolute",
  dashboardChartPreset: "clinical",
  timeRange: "all",
  customRangeStart: "",
  customRangeEnd: "",
  aiExternalConsent: false,
  parserRescueConsentState: "unset",
  parserRescueAllowPdfAttachment: false,
  aiAnalysisProvider: "auto",
  aiCostMode: "balanced",
  aiAutoImproveEnabled: false,
  parserDebugMode: "text_ocr_ai",
  primaryMarkersSelection: []
};

const RAW_ALIASES: Record<string, string[]> = {
  Testosterone: [
    "testosterone",
    "total testosterone",
    "testosteron",
    "testosterone total",
    "testosterone, total, ms",
    "testosterone total ms",
    "totale testosteron",
    "totaal testosteron"
  ],
  "Free Testosterone": [
    "free testosterone",
    "vrij testosteron",
    "vrije testosteron",
    "testosterone free",
    "testosterone direct",
    "testosterone (direct)",
    "direct testosterone",
    "testosteron vrij",
    "testosteron, vrij",
    "testosterone, free",
    "free test",
    "free t",
    "testosterone free calculated",
    "free testosterone calculated",
    "calculated free testosterone",
    "free testosterone (calculated)",
    "vrij testosteron berekend",
    "vrij testosteron (berekend)"
  ],
  Estradiol: [
    "estradiol",
    "e2",
    "oestradiol",
    "oestrodiol",
    "estradiol ultrasensitive",
    "estradiol, ultrasensitive",
    "estradiol,ultrasensitive, lc/ms",
    "estradiol ultrasensitive lc/ms",
    "estradiol ultrasensitive lc/ms/ms"
  ],
  Hematocrit: ["hematocrit", "hematokriet", "hematocriet", "hct"],
  SHBG: [
    "shbg",
    "sex hormone binding globulin",
    "sex hormone binding glob",
    "sex hormone binding glob, serum",
    "sex horm bind gl",
    "sex horm bind glob",
    "sex horm binding glob",
    "sex horm binding glob serum"
  ],
  FSH: ["fsh", "follicle stimulating hormone", "follikel stimulerend hormoon"],
  LH: ["lh", "luteinizing hormone", "luteiniserend hormoon"],
  Prolactin: ["prolactin", "prolactine", "monomeric prolactin"],
  "DHEA Sulfate": ["dhea sulfate", "dhea-sulfate", "dehydroepiandrosterone sulfate", "dhea-s"],
  Albumine: ["albumine", "albumin", "serum albumin"],
  "Dihydrotestosteron (DHT)": [
    "dihydrotestosteron",
    "dihydrotestosterone",
    "dihydrotestosteron (dht)",
    "dihydrotestosterone (dht)",
    "dht"
  ],
  "Vitamin D (D3+D2) OH": [
    "oh vitamin d d3 d2",
    "oh- vitamin d d3 d2",
    "vitamin d d3 d2 oh",
    "25 oh vitamin d d3 d2",
    "25-oh vitamin d d3 d2",
    "25 oh vitamin d",
    "25-oh vitamin d",
    "vitamin d d3 d2"
  ],
  "Red Blood Cells": [
    "red blood cells",
    "red blood cell",
    "red blood cell count",
    "erythrocyten",
    "erytrocyten",
    "rbc"
  ],
  eGFR: [
    "egfr",
    "e g f r",
    "ckd-epi",
    "ckd epi",
    "ckd-epi egfr",
    "ckd-epi, egfr",
    "egfr if nonafricn am",
    "egfr if nonafrican am"
  ],
  TSH: ["tsh", "thyrotropin", "thyroid stimulating hormone", "thyroïd stimulerend hormoon"],
  "Free T4": ["free t4", "ft4", "vrij t4", "vrije t4", "vrije thyroxine"],
  "Free T3": ["free t3", "ft3", "vrij t3", "vrije t3", "vrije trijodothyronine"],
  Creatinine: ["creatinine", "creatinine serum", "serum creatinine", "kreatinine", "creatinine bloed"],
  CRP: ["crp", "c-reactive protein", "c reactive protein", "c-reactief proteine", "c reactief proteine"],
  Cortisol: ["cortisol", "am cortisol", "cortisol am", "cortisol am cortisol", "cortisol (am)"],
  Cholesterol: ["cholesterol", "cholesterol totaal", "total cholesterol", "cholesterol total"],
  "Cholesterol/HDL Ratio": [
    "cholesterol/hdl-cholesterol ratio",
    "cholesterol/hdl cholesterol ratio",
    "cholesterol/hdl ratio",
    "cholesterol hdl ratio",
    "chol/hdlc ratio",
    "chol hdlc ratio",
    "chol/hdl ratio"
  ],
  "Non-HDL Cholesterol": ["non hdl cholesterol", "non-hdl cholesterol", "non-hdl-cholesterol", "non hdl"],
  Triglyceriden: ["triglyceriden", "triglycerides", "hoog risico triglyceriden", "high risk triglycerides"],
  "Vitamine B12": ["vitamine b12", "vitamin b12", "vit b12", "b12", "cobalamin", "cobalamine"],
  Foliumzuur: ["foliumzuur", "folate", "folic acid"],
  "Glucose Nuchter": [
    "glucose",
    "glucose nuchter",
    "glucose nuchter veneus lab",
    "glucose nuchter veneus",
    "glucose nuchter veneus (lab)",
    "glucose plasma",
    "glucose plasma lab",
    "glucose(plasma)",
    "glucose (plasma)",
    "glucose fasting",
    "fasting glucose"
  ],
  MCV: ["mcv", "m.c.v.", "m c v"],
  Transferrine: ["transferrine", "transferrin"],
  "Transferrine Saturatie": ["transferrine saturatie", "transferrin saturation", "transferrin saturatie"],
  Homocysteine: ["homocysteine", "homocysteïne"],
  Ureum: ["ureum", "urea", "bun", "urea nitrogen", "urea nitrogen (bun)"],
  Ferritine: ["ferritine", "ferritin", "serum ferritin", "ferritina"],
  PSA: ["psa", "prostaat specifiek antigeen", "prostaatspecifiek ag", "prostaatspecifiek ag psa"],
  "Albumine Urine": ["albumine urine", "albumine urine portie", "urine albumine"],
  "Urine ACR": [
    "albumine creatinine ratio urine acr",
    "albumine/creatinine ratio urine acr",
    "acr urine",
    "urine acr",
    "albumine creatinine ratio urine"
  ],
  "Creatinine Urine": ["creatinine urine", "creatinine urine portie", "urine creatinine"],
  Hemoglobin: ["hemoglobin", "hemoglobine", "hemoglobine hb", "hb"],
  MCH: [
    "mch",
    "mean corpuscular hemoglobin",
    "langere tijd tussen afname en analyse",
    "langere tijd tussen bloedafname en analyse",
    "longer time between blood collection and analysis"
  ],
  MCHC: ["mchc", "mean corpuscular hemoglobin concentration"],
  "RDW-CV": ["rdw-cv", "rdw cv", "rdw", "red cell distribution width", "erythrocyte distribution width"],
  Platelets: [
    "platelets",
    "platelet",
    "platelet count",
    "thrombocytes",
    "thrombocyten",
    "trombocyten",
    "bloedplaatjes"
  ],
  "Monocytes Abs.": ["monocytes abs", "monocytes abs.", "monocyten abs", "monocyten abs.", "absolute monocytes"],
  "Basophils Abs.": [
    "basophils abs",
    "basophils abs.",
    "basofylen abs",
    "basofielen abs",
    "absolute basophils",
    "baso (absolute)"
  ],
  "Lymphocytes Abs.": [
    "lymphocytes abs",
    "lymphocytes abs.",
    "lymfocyten abs",
    "lymfocyten abs.",
    "absolute lymphocytes",
    "lymphs (absolute)"
  ],
  "Eosinophils Abs.": [
    "eosinophils abs",
    "eosinophils abs.",
    "eosinofielen abs",
    "eosinofielen abs.",
    "absolute eosinophils",
    "eos (absolute)"
  ],
  "Neutrophils Abs.": [
    "neutrophils abs",
    "neutrophils abs.",
    "neutrofielen abs",
    "neutrofielen abs.",
    "absolute neutrophils",
    "neutrophils (absolute)"
  ],
  "Immature Granulocytes": ["immature granulocytes"],
  "Immature Grans (Abs)": [
    "immature grans (abs)",
    "immature grans abs",
    "immature granulocytes absolute",
    "immature granulocytes (absolute)"
  ],
  Neutrophils: ["neutrophils", "neutrophil percentage", "neutrophils %"],
  Lymphocytes: ["lymphocytes", "lymphocyte percentage", "lymphocytes %", "lymphs"],
  Monocytes: ["monocytes", "monocyte percentage", "monocytes %"],
  Eosinophils: ["eosinophils", "eosinophil percentage", "eosinophils %", "eos"],
  Basophils: ["basophils", "basophil percentage", "basophils %", "basos"],
  "Free Androgen Index": ["free androgen index", "free androgen index.", "fai", "vrije androgeen index"],
  "T/E2 Ratio": [
    "t/e2 ratio",
    "t e2 ratio",
    "testosterone e2 ratio",
    "testosteron e2 ratio",
    "testosterone/estradiol ratio",
    "testosteron/estradiol ratio"
  ],
  "HOMA-IR": ["homa-ir", "homa ir", "homa"],
  "LDL/HDL Ratio": ["ldl/hdl ratio", "ldl hdl ratio", "ldl/hdl-cholesterol ratio", "ldl hdl cholesterol ratio"],
  Leukocyten: [
    "leukocyten",
    "leucocyten",
    "leukocytes",
    "leucocytes",
    "white blood cells",
    "white blood cell count",
    "wbc",
    "nuchter hematologie bloedbeeld klein leucocyten"
  ],
  "HDL Cholesterol": ["hdl cholesterol", "hdl-cholesterol", "hdlcholesterol", "cholesterol hdl"],
  "LDL Cholesterol": [
    "ldl cholesterol",
    "ldl-cholesterol",
    "ldlcholesterol",
    "cholesterol ldl",
    "ldl cholesterol direct",
    "ldl-cholesterol direct"
  ],
  "Apolipoprotein B": [
    "apolipoprotein b",
    "apolipoproteine b",
    "apo b",
    "apo-b",
    "apo b100",
    "apob",
    "apo-b100"
  ],
  "Lipoprotein (a)": ["lipoprotein (a)", "lipoprotein(a)", "lipoprotein a", "lp(a)", "lpa"],
  MPV: ["mpv", "mean platelet volume"],
  "LDL Particle Number": ["ldl particle number"],
  "LDL Small": ["ldl small"],
  "LDL Medium": ["ldl medium"],
  "HDL Large": ["hdl large"],
  "LDL Peak Size": ["ldl peak size"],
  "LDL Pattern": ["ldl pattern", "ldl-pattern", "ldl pattern a", "ldl pattern b"],
  Sodium: ["sodium"],
  Potassium: ["potassium"],
  Chloride: ["chloride"],
  "Carbon Dioxide": ["carbon dioxide", "co2", "bicarbonate"],
  "BUN/Creatinine Ratio": [
    "bun/creatinine ratio",
    "bun creatinine ratio",
    "bun/creatinine ratio (calc)",
    "bun creatinine ratio (calc)"
  ],
  Calcium: ["calcium"],
  "Total Protein": ["total protein", "protein, total", "protein total", "serum protein"],
  Globulin: ["globulin", "globulin, total", "globulin total"],
  "Albumin/Globulin Ratio": ["albumin/globulin ratio", "albumin globulin ratio", "a/g ratio"],
  "Total Bilirubin": ["total bilirubin", "bilirubin, total", "bilirubin total"],
  "Alkaline Phosphatase": ["alkaline phosphatase", "alk phosphatase", "alp"],
  AST: ["ast", "aspartate aminotransferase", "sgot", "ast (sgot)", "sgot (ast)"],
  ALT: ["alt", "alanine aminotransferase", "sgpt", "alt (sgpt)", "sgpt (alt)"],
  Insuline: ["insuline", "insulin", "fasting insulin", "insuline nuchter", "insulin fasting"]
};

export const MARKER_ALIAS_LOOKUP = Object.entries(RAW_ALIASES).reduce(
  (acc, [canonical, aliases]) => {
    aliases.forEach((alias) => {
      acc[alias] = canonical;
    });
    return acc;
  },
  {} as Record<string, string>
);

export const TAB_ITEMS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "checkIns", label: "Wellbeing" },
  { key: "protocol", label: "Protocols" },
  { key: "supplements", label: "Supplements" },
  { key: "doseResponse", label: "Dose Simulator" },
  { key: "analysis", label: "AI Lab Analysis" },
  { key: "protocolImpact", label: "Protocol Impact" },
  { key: "alerts", label: "Alerts" },
  { key: "reports", label: "All Reports" },
  { key: "settings", label: "Settings" }
] as const;


