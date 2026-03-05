import { ParserLanguagePack } from "./types";

export const DE_PARSER_LANGUAGE_PACK: ParserLanguagePack = {
  id: "de",
  ocrLang: "deu",
  detectionPattern:
    /\b(?:ihr\swert|normalbereich|referenzbereich|fr(?:\u00FC|ue)here ergebnisse|interpretation|h(?:\u00E4|ae)moglobin|cholesterin|testosteron)\b/i,
  lineNoiseTerms: [
    "interpretation",
    "kommentar",
    "fr\u00FChere ergebnisse",
    "fruehere ergebnisse"
  ],
  markerFixes: [
    { pattern: /\s*\(laut\s*$/i, replace: "" },
    { pattern: /\s+\($/, replace: "" }
  ],
  keywordRange: {
    id: "de_keyword",
    sectionStarts: ["Ihre Messwerte", "Ihre Ergebnisse", "Ihre Messungen"],
    sectionEnds: ["Fr\u00FChere Ergebnisse", "Fruehere Ergebnisse", "Interpretation", "Druck", "Haftungsausschluss"],
    valueLabels: ["Ihr Wert", "Wert"],
    normalRangeLabels: ["Normalbereich", "Referenzbereich", "Normbereich"],
    dateLabels: ["Datum"],
    lowerBoundTerms: ["H\u00F6her als", "Hoeher als", "Gr\u00F6\u00DFer als", "Groesser als", "\u00DCber", "Mehr als"],
    upperBoundTerms: ["Niedriger als", "Weniger als", "Unter"]
  }
};
