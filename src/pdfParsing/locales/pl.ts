import { ParserLanguagePack } from "./types";

export const PL_PARSER_LANGUAGE_PACK: ParserLanguagePack = {
  id: "pl",
  ocrLang: "pol",
  detectionPattern:
    /\b(?:twoja warto(?:\u015B|s)\u0107|zakres referencyjny|wyniki poprzednie|interpretacja|hemoglobina|cholesterol|testosteron)\b/i,
  lineNoiseTerms: [
    "interpretacja",
    "komentarz",
    "wyniki poprzednie"
  ],
  markerFixes: [
    { pattern: /\s*\(wed(?:\u0142|l)ug\s*$/i, replace: "" },
    { pattern: /\s+\($/, replace: "" }
  ],
  keywordRange: {
    id: "pl_keyword",
    sectionStarts: ["Twoje wyniki", "Twoje pomiary"],
    sectionEnds: ["Wyniki poprzednie", "Interpretacja", "Drukuj", "Zastrze\u017Cenie"],
    valueLabels: ["Twoja warto\u015B\u0107", "Twoja wartosc", "Warto\u015B\u0107", "Wartosc"],
    normalRangeLabels: ["Zakres referencyjny", "Warto\u015B\u0107 referencyjna", "Wartosc referencyjna", "Zakres normy"],
    dateLabels: ["Data"],
    lowerBoundTerms: ["Powy\u017Cej", "Powyzej", "Wi\u0119cej ni\u017C", "Wiecej niz", "Wy\u017Cszy ni\u017C", "Wyzszy niz"],
    upperBoundTerms: ["Poni\u017Cej", "Ponizej", "Mniej ni\u017C", "Mniej niz", "Ni\u017Cszy ni\u017C", "Nizszy niz"]
  }
};
