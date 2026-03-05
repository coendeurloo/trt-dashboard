import { ParserLanguagePack } from "./types";

export const DA_PARSER_LANGUAGE_PACK: ParserLanguagePack = {
  id: "da",
  ocrLang: "dan",
  detectionPattern:
    /\b(?:din\sv(?:\u00E6|ae)rdi|normalomr(?:\u00E5|aa)de|dine\sm(?:\u00E5|aa)linger|tidligere resultater|fortolkning|h(?:\u00E6|ae)moglobin|kolesterol|testosteron)\b/i,
  lineNoiseTerms: [
    "fortolkning",
    "kommentar",
    "tidligere resultater"
  ],
  markerFixes: [
    { pattern: /\s*\(if(?:\u00F8|oe)lge\s*$/i, replace: "" },
    { pattern: /\s+\($/, replace: "" }
  ],
  keywordRange: {
    id: "da_keyword",
    sectionStarts: ["Dine m\u00E5linger", "Dine maalinger", "Dine resultater"],
    sectionEnds: ["Tidligere resultater", "Fortolkning", "Print", "Disclaimer"],
    valueLabels: ["Din v\u00E6rdi", "Din vaerdi", "V\u00E6rdi", "Vaerdi"],
    normalRangeLabels: [
      "Normalomr\u00E5de",
      "Normalomraade",
      "Referenceomr\u00E5de",
      "Referenceomraade",
      "Normal v\u00E6rdi",
      "Normal vaerdi"
    ],
    dateLabels: ["Dato"],
    lowerBoundTerms: ["H\u00F8jere end", "Hoejere end", "Over", "Mere end", "St\u00F8rre end", "Stoerre end"],
    upperBoundTerms: ["Lavere end", "Under", "Mindre end"]
  }
};
