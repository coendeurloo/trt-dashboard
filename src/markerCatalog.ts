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
  MPV: "hematology",
  Leukocyten: "hematology",
  Platelets: "hematology",
  Neutrophils: "hematology",
  Lymphocytes: "hematology",
  Monocytes: "hematology",
  Eosinophils: "hematology",
  Basophils: "hematology",
  "Neutrophils Abs.": "hematology",
  "Lymphocytes Abs.": "hematology",
  "Monocytes Abs.": "hematology",
  "Eosinophils Abs.": "hematology",
  "Basophils Abs.": "hematology",
  "Immature Granulocytes": "hematology",
  "Immature Grans (Abs)": "hematology",
  Creatinine: "kidney",
  eGFR: "kidney",
  Ureum: "kidney",
  "Creatinine Urine": "kidney",
  "Urine ACR": "kidney",
  "Albumine Urine": "kidney",
  "BUN/Creatinine Ratio": "kidney",
  Sodium: "electrolytes",
  Potassium: "electrolytes",
  Chloride: "electrolytes",
  "Carbon Dioxide": "electrolytes",
  Calcium: "electrolytes",
  "Total Protein": "metabolic",
  Globulin: "metabolic",
  "Albumin/Globulin Ratio": "metabolic",
  "Total Bilirubin": "metabolic",
  "Alkaline Phosphatase": "metabolic",
  AST: "metabolic",
  ALT: "metabolic",
  Cholesterol: "lipids",
  "LDL Cholesterol": "lipids",
  "HDL Cholesterol": "lipids",
  "Non-HDL Cholesterol": "lipids",
  Triglyceriden: "lipids",
  "Apolipoprotein B": "lipids",
  "Lipoprotein (a)": "lipids",
  "LDL Particle Number": "lipids",
  "LDL Small": "lipids",
  "LDL Medium": "lipids",
  "HDL Large": "lipids",
  "LDL Peak Size": "lipids",
  "LDL Pattern": "lipids",
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
  "Neutrophils Abs.": { eu: "cells/uL", us: "cells/uL" },
  "Lymphocytes Abs.": { eu: "cells/uL", us: "cells/uL" },
  "Monocytes Abs.": { eu: "cells/uL", us: "cells/uL" },
  "Eosinophils Abs.": { eu: "cells/uL", us: "cells/uL" },
  "Basophils Abs.": { eu: "cells/uL", us: "cells/uL" },
  "Immature Granulocytes": { eu: "%", us: "%" },
  "Immature Grans (Abs)": { eu: "x10E3/uL", us: "x10E3/uL" },
  MPV: { eu: "fL", us: "fL" },
  Sodium: { eu: "mmol/L", us: "mmol/L" },
  Potassium: { eu: "mmol/L", us: "mmol/L" },
  Chloride: { eu: "mmol/L", us: "mmol/L" },
  "Carbon Dioxide": { eu: "mmol/L", us: "mmol/L" },
  Calcium: { eu: "mg/dL", us: "mg/dL" },
  "Total Protein": { eu: "g/dL", us: "g/dL" },
  Globulin: { eu: "g/dL", us: "g/dL" },
  "Albumin/Globulin Ratio": { eu: "ratio", us: "ratio" },
  "Total Bilirubin": { eu: "mg/dL", us: "mg/dL" },
  "Alkaline Phosphatase": { eu: "U/L", us: "U/L" },
  AST: { eu: "U/L", us: "U/L" },
  ALT: { eu: "U/L", us: "U/L" },
  "LDL Cholesterol": { eu: "mmol/L", us: "mg/dL" },
  "HDL Cholesterol": { eu: "mmol/L", us: "mg/dL" },
  Cholesterol: { eu: "mmol/L", us: "mg/dL" },
  Triglyceriden: { eu: "mmol/L", us: "mg/dL" },
  "Apolipoprotein B": { eu: "g/L", us: "mg/dL" },
  "Lipoprotein (a)": { eu: "nmol/L", us: "nmol/L" },
  "LDL Particle Number": { eu: "nmol/L", us: "nmol/L" },
  "LDL Small": { eu: "nmol/L", us: "nmol/L" },
  "LDL Medium": { eu: "nmol/L", us: "nmol/L" },
  "HDL Large": { eu: "nmol/L", us: "nmol/L" },
  "LDL Peak Size": { eu: "Angstrom", us: "Angstrom" },
  Ferritine: { eu: "ug/L", us: "ng/mL" },
  CRP: { eu: "mg/L", us: "mg/L" },
  PSA: { eu: "ug/L", us: "ng/mL" },
  Creatinine: { eu: "umol/L", us: "mg/dL" },
  eGFR: { eu: "mL/min/1.73", us: "mL/min/1.73" },
  "BUN/Creatinine Ratio": { eu: "ratio", us: "ratio" },
  "LDL Pattern": { eu: "pattern", us: "pattern" },
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
