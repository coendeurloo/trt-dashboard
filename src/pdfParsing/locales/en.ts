import { ParserLanguagePack } from "./types";

export const EN_PARSER_LANGUAGE_PACK: ParserLanguagePack = {
  id: "en",
  ocrLang: null,
  detectionPattern: /\b(?:results|reference range|normal range|patient details|clinical history|hemoglobin|cholesterol|testosterone)\b/i,
  lineNoiseTerms: [
    "patient details",
    "requesting physician",
    "clinical history",
    "interpretation",
    "notes",
    "daily free cortisol pattern"
  ],
  markerFixes: [
    { pattern: /^Result\s+/i, replace: "" },
    { pattern: /\bT otal\b/g, replace: "Total" },
    { pattern: /^Cortisol\s+AM\s+Cortisol$/i, replace: "Cortisol (AM)" },
    { pattern: /^AM\s+Cortisol$/i, replace: "Cortisol (AM)" },
    { pattern: /^Cortisol\s+AM$/i, replace: "Cortisol (AM)" },
    { pattern: /^.*\bSex Hormone Binding Globulin\b/i, replace: "SHBG" },
    { pattern: /^Sex Horm Binding Glob(?:,?\s*Serum)?$/i, replace: "SHBG" },
    { pattern: /^Sex Hormone Binding Globulin$/i, replace: "SHBG" },
    { pattern: /^Testosterone,\s*Serum$/i, replace: "Testosterone" },
    { pattern: /^Dibya?rotestosterone$/i, replace: "Dihydrotestosterone" },
    { pattern: /^Dihyarotestosterone$/i, replace: "Dihydrotestosterone" },
    { pattern: /^Dhea-?Sul[Â£f]ate$/i, replace: "DHEA Sulfate" },
    { pattern: /^Dhea-?Sulfes?$/i, replace: "DHEA Sulfate" },
    { pattern: /^Eatradiol(?:,\s*Sensitive)?$/i, replace: "Estradiol" },
    { pattern: /^Estradiol,\s*Sensitive$/i, replace: "Estradiol" },
    { pattern: /^Prost(?:ate)?\.?\s*Spec(?:ific)?\s*(?:Ag|A)(?:,\s*Serum)?$/i, replace: "PSA" },
    { pattern: /^Posta?\s*Spec\s*4\s*Sem'?$/i, replace: "PSA" },
    { pattern: /^Ratio:\s*T\/SHBG.*$/i, replace: "SHBG" },
    { pattern: /^MPV-Mean Platelet$/i, replace: "MPV-Mean Platelet Volume" },
    { pattern: /^IGF-?1\s*SDS\s*\*?\)?$/i, replace: "IGF-1 SDS" },
    { pattern: /^IGF-?1\s*\(somatomedine\s*C\)$/i, replace: "IGF-1 (somatomedine C)" },
    { pattern: /^IGF-?1\s*\(somatomedine\s*C\)\s*CLIA$/i, replace: "IGF-1 (somatomedine C)" },
    { pattern: /^Reactive Protein\s*\(High Sensitivity\)$/i, replace: "C Reactive Protein (High Sensitivity)" },
    { pattern: /^Reactive Protein$/i, replace: "C Reactive Protein" },
    { pattern: /^25-?OH-?\s*Vitamin D\s*\(D3\s*\+\s*D2\)$/i, replace: "25-OH- Vitamin D (D3+D2)" },
    { pattern: /^25-?OH-?\s*Vitamin D$/i, replace: "25-OH- Vitamin D (D3+D2)" }
  ],
  keywordRange: {
    id: "en_keyword",
    sectionStarts: ["Your measurements", "Your results"],
    sectionEnds: ["Past results", "Explanation", "Print", "Disclaimer"],
    valueLabels: ["Your value", "Value"],
    normalRangeLabels: ["Normal range", "Reference range"],
    dateLabels: ["Date"],
    lowerBoundTerms: ["Higher than", "Greater than", "More than", "Above"],
    upperBoundTerms: ["Lower than", "Less than", "Under", "Below"]
  }
};
