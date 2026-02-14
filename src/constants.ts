import { AppSettings } from "./types";

export const APP_STORAGE_KEY = "trt_lab_tracker_v1";
export const APP_SCHEMA_VERSION = 2;

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

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  unitSystem: "eu",
  language: "en",
  enableSamplingControls: false,
  showReferenceRanges: true,
  showAbnormalHighlights: true,
  showAnnotations: true,
  showTrtTargetZone: true,
  showLongevityTargetZone: false,
  yAxisMode: "zero",
  samplingFilter: "all",
  compareToBaseline: false,
  comparisonScale: "absolute",
  timeRange: "12m",
  customRangeStart: "",
  customRangeEnd: "",
  claudeApiKey: ""
};

const RAW_ALIASES: Record<string, string[]> = {
  Testosterone: [
    "testosterone",
    "total testosterone",
    "testosteron",
    "testosterone total",
    "totale testosteron",
    "totaal testosteron"
  ],
  "Free Testosterone": [
    "free testosterone",
    "vrij testosteron",
    "vrije testosteron",
    "testosterone free",
    "testosteron vrij",
    "testosteron, vrij",
    "testosterone, free",
    "free test",
    "free t",
    "testosterone free calculated"
  ],
  Estradiol: ["estradiol", "e2", "oestradiol", "oestrodiol"],
  Hematocrit: ["hematocrit", "hematokriet", "hematocriet", "hct"],
  SHBG: ["shbg", "sex hormone binding globulin", "sex horm bind gl", "sex horm bind glob"],
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
  "Red Blood Cells": ["red blood cells", "red blood cell", "erythrocyten", "erytrocyten", "rbc"],
  eGFR: ["egfr", "e g f r", "ckd-epi", "ckd epi", "ckd-epi egfr", "ckd-epi, egfr"],
  TSH: ["tsh", "thyrotropin", "thyroid stimulating hormone", "thyroïd stimulerend hormoon"],
  "Free T4": ["free t4", "ft4", "vrij t4", "vrije t4", "vrije thyroxine"],
  "Free T3": ["free t3", "ft3", "vrij t3", "vrije t3", "vrije trijodothyronine"],
  Creatinine: ["creatinine", "creatinine serum", "serum creatinine", "kreatinine", "creatinine bloed"],
  CRP: ["crp", "c-reactive protein", "c reactive protein", "c-reactief proteine", "c reactief proteine"],
  Cholesterol: ["cholesterol", "cholesterol totaal", "total cholesterol", "cholesterol total"],
  "Cholesterol/HDL Ratio": [
    "cholesterol/hdl-cholesterol ratio",
    "cholesterol/hdl cholesterol ratio",
    "cholesterol/hdl ratio",
    "cholesterol hdl ratio"
  ],
  "Non-HDL Cholesterol": ["non hdl cholesterol", "non-hdl cholesterol", "non-hdl-cholesterol", "non hdl"],
  Triglyceriden: ["triglyceriden", "triglycerides", "hoog risico triglyceriden", "high risk triglycerides"],
  "Vitamine B12": ["vitamine b12", "vitamin b12", "vit b12", "b12", "cobalamin", "cobalamine"],
  Foliumzuur: ["foliumzuur", "folate", "folic acid"],
  "Glucose Nuchter": [
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
  Ureum: ["ureum", "urea"],
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
  Platelets: ["platelets", "platelet", "thrombocytes", "thrombocyten", "trombocyten", "bloedplaatjes"],
  "Monocytes Abs.": ["monocytes abs", "monocytes abs.", "monocyten abs", "monocyten abs.", "absolute monocytes"],
  "Basophils Abs.": ["basophils abs", "basophils abs.", "basofylen abs", "basofielen abs", "absolute basophils"],
  "Lymphocytes Abs.": [
    "lymphocytes abs",
    "lymphocytes abs.",
    "lymfocyten abs",
    "lymfocyten abs.",
    "absolute lymphocytes"
  ],
  "Eosinophils Abs.": [
    "eosinophils abs",
    "eosinophils abs.",
    "eosinofielen abs",
    "eosinofielen abs.",
    "absolute eosinophils"
  ],
  "Neutrophils Abs.": [
    "neutrophils abs",
    "neutrophils abs.",
    "neutrofielen abs",
    "neutrofielen abs.",
    "absolute neutrophils"
  ],
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
  { key: "doseResponse", label: "Dose Response" },
  { key: "analysis", label: "AI Lab Analysis" },
  { key: "protocolImpact", label: "Protocol Impact" },
  { key: "alerts", label: "Alerts" },
  { key: "reports", label: "All Reports" },
  { key: "settings", label: "Settings" }
] as const;
