import { ParserLanguagePack } from "./types";

export const NL_PARSER_LANGUAGE_PACK: ParserLanguagePack = {
  id: "nl",
  ocrLang: "nld",
  detectionPattern: /\b(?:uw waarde|normale waarde|uw metingen|uitslagen uit het verleden|afname|testosteron|triglyceriden|hemoglobine)\b/i,
  lineNoiseTerms: [
    "interpretatie",
    "toelichting",
    "uitslagen uit het verleden"
  ],
  markerFixes: [
    { pattern: /^Testosterons(?:,\s*Serum)?$/i, replace: "Testosterone" },
    { pattern: /\s*\(volgens\s*$/i, replace: "" },
    { pattern: /\s+\($/, replace: "" }
  ],
  keywordRange: {
    id: "nl_keyword",
    sectionStarts: ["Uw metingen"],
    sectionEnds: ["Uitslagen uit het verleden", "Toelichting", "Print", "Disclaimer"],
    valueLabels: ["Uw waarde"],
    normalRangeLabels: ["Normale waarde"],
    dateLabels: ["Datum"],
    lowerBoundTerms: ["Hoger dan"],
    upperBoundTerms: ["Lager dan"]
  }
};
