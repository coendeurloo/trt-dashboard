import { ParserLanguagePack } from "./types";

export const FR_PARSER_LANGUAGE_PACK: ParserLanguagePack = {
  id: "fr",
  ocrLang: "fra",
  detectionPattern:
    /\b(?:votre valeur|valeur de r(?:\u00E9|e)f(?:\u00E9|e)rence|r(?:\u00E9|e)sultats ant(?:\u00E9|e)rieurs|interpr(?:\u00E9|e)tation|h(?:\u00E9|e)moglobine|cholest(?:\u00E9|e)rol|testost(?:\u00E9|e)rone)\b/i,
  lineNoiseTerms: [
    "interpr\u00E9tation",
    "interpretation",
    "commentaire",
    "r\u00E9sultats ant\u00E9rieurs",
    "resultats anterieurs"
  ],
  markerFixes: [
    { pattern: /\s*\(selon\s*$/i, replace: "" },
    { pattern: /\s+\($/, replace: "" }
  ],
  keywordRange: {
    id: "fr_keyword",
    sectionStarts: ["Vos mesures", "Vos r\u00E9sultats", "Vos resultats"],
    sectionEnds: ["R\u00E9sultats ant\u00E9rieurs", "Resultats anterieurs", "Interpr\u00E9tation", "Interpretation", "Imprimer", "Avertissement"],
    valueLabels: ["Votre valeur", "Valeur"],
    normalRangeLabels: ["Valeur de r\u00E9f\u00E9rence", "Valeur de reference", "Intervalle de r\u00E9f\u00E9rence", "Intervalle de reference", "Plage normale"],
    dateLabels: ["Date"],
    lowerBoundTerms: ["Sup\u00E9rieur \u00E0", "Superieur a", "Plus de", "Au-dessus de"],
    upperBoundTerms: ["Inf\u00E9rieur \u00E0", "Inferieur a", "Moins de", "En dessous de"]
  }
};
