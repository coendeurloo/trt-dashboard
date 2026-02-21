import { MARKER_ALIAS_LOOKUP } from "./constants";
import { UnitSystem } from "./types";

export interface CanonicalMarkerCatalogEntry {
  canonicalKey: string;
  aliases: string[];
  preferredUnitBySystem: Partial<Record<UnitSystem, string>>;
  category: string;
  mustContain?: string[];
  mustNotContain?: string[];
}

const CATEGORY_HINTS: Record<string, string> = {
  Testosterone: "hormones",
  "Free Testosterone": "hormones",
  Estradiol: "hormones",
  SHBG: "hormones",
  FSH: "hormones",
  LH: "hormones",
  Prolactin: "hormones",
  Cortisol: "hormones",
  "DHEA Sulfate": "hormones",
  "Dihydrotestosteron (DHT)": "hormones",
  Hematocrit: "hematology",
  Hemoglobin: "hematology",
  MCV: "hematology",
  MCH: "hematology",
  MCHC: "hematology",
  "RDW-CV": "hematology",
  Leukocyten: "hematology",
  Platelets: "hematology",
  Creatinine: "kidney",
  eGFR: "kidney",
  "Creatinine Urine": "kidney",
  "Urine ACR": "kidney",
  "Albumine Urine": "kidney",
  Cholesterol: "lipids",
  "LDL Cholesterol": "lipids",
  "HDL Cholesterol": "lipids",
  "Non-HDL Cholesterol": "lipids",
  Triglyceriden: "lipids",
  "Apolipoprotein B": "lipids",
  Ferritine: "iron",
  CRP: "inflammation",
  PSA: "prostate",
  "Vitamin D (D3+D2) OH": "vitamins",
  "Vitamine B12": "vitamins",
  Foliumzuur: "vitamins",
  "Glucose Nuchter": "metabolic",
  Insuline: "metabolic"
};

const UNIT_HINTS: Record<string, Partial<Record<UnitSystem, string>>> = {
  Testosterone: { eu: "nmol/L", us: "ng/dL" },
  "Free Testosterone": { eu: "nmol/L", us: "pg/mL" },
  Estradiol: { eu: "pmol/L", us: "pg/mL" },
  SHBG: { eu: "nmol/L", us: "nmol/L" },
  Hematocrit: { eu: "%", us: "%" },
  Hemoglobin: { eu: "mmol/L", us: "g/dL" },
  "LDL Cholesterol": { eu: "mmol/L", us: "mg/dL" },
  "HDL Cholesterol": { eu: "mmol/L", us: "mg/dL" },
  Cholesterol: { eu: "mmol/L", us: "mg/dL" },
  Triglyceriden: { eu: "mmol/L", us: "mg/dL" },
  "Apolipoprotein B": { eu: "g/L", us: "mg/dL" },
  Ferritine: { eu: "ug/L", us: "ng/mL" },
  CRP: { eu: "mg/L", us: "mg/L" },
  PSA: { eu: "ug/L", us: "ng/mL" },
  Creatinine: { eu: "umol/L", us: "mg/dL" },
  eGFR: { eu: "mL/min/1.73", us: "mL/min/1.73" },
  TSH: { eu: "mU/L", us: "uIU/mL" }
};

const MUST_CONTAIN_HINTS: Record<string, string[]> = {
  "Free Testosterone": ["free", "testosterone"],
  Testosterone: ["testosterone"],
  "DHEA Sulfate": ["dhea"],
  SHBG: ["shbg"]
};

const MUST_NOT_CONTAIN_HINTS: Record<string, string[]> = {
  Testosterone: ["free testosterone", "bioavailable testosterone"],
  "Free Testosterone": ["bioavailable testosterone"]
};

const normalizeAliasKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildAliasesByCanonical = (): Record<string, string[]> => {
  const grouped: Record<string, string[]> = {};
  for (const [alias, canonical] of Object.entries(MARKER_ALIAS_LOOKUP)) {
    if (!grouped[canonical]) {
      grouped[canonical] = [];
    }
    grouped[canonical].push(alias);
  }
  return grouped;
};

const aliasesByCanonical = buildAliasesByCanonical();

const markerKeys = Array.from(
  new Set<string>([
    ...Object.values(MARKER_ALIAS_LOOKUP),
    ...Object.keys(CATEGORY_HINTS),
    ...Object.keys(UNIT_HINTS),
    "Bioavailable Testosterone"
  ])
).sort((left, right) => left.localeCompare(right));

export const CANONICAL_MARKERS: CanonicalMarkerCatalogEntry[] = markerKeys
  .filter((key) => key !== "Unknown Marker")
  .map((canonicalKey) => {
    const aliases = Array.from(new Set([canonicalKey, ...(aliasesByCanonical[canonicalKey] ?? [])])).filter(Boolean);
    return {
      canonicalKey,
      aliases,
      preferredUnitBySystem: UNIT_HINTS[canonicalKey] ?? {},
      category: CATEGORY_HINTS[canonicalKey] ?? "other",
      mustContain: MUST_CONTAIN_HINTS[canonicalKey],
      mustNotContain: MUST_NOT_CONTAIN_HINTS[canonicalKey]
    };
  });

export const buildAliasLookup = (): Record<string, string> => {
  const lookup: Record<string, string> = {};
  for (const entry of CANONICAL_MARKERS) {
    for (const alias of entry.aliases) {
      const normalized = normalizeAliasKey(alias);
      if (!normalized) {
        continue;
      }
      lookup[normalized] = entry.canonicalKey;
    }
  }
  return lookup;
};

export const getCanonicalKeys = (): string[] => CANONICAL_MARKERS.map((entry) => entry.canonicalKey);
