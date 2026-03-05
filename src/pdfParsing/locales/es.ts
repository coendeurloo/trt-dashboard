import { ParserLanguagePack } from "./types";

export const ES_PARSER_LANGUAGE_PACK: ParserLanguagePack = {
  id: "es",
  ocrLang: "spa",
  detectionPattern:
    /\b(?:su\svalor|rango normal|rango de referencia|resultados anteriores|interpretaci(?:\u00F3|o)n|hemoglobina|colesterol|testosterona)\b/i,
  lineNoiseTerms: [
    "interpretaci\u00F3n",
    "interpretacion",
    "comentario",
    "resultados anteriores"
  ],
  markerFixes: [
    { pattern: /\s*\(seg(?:\u00FA|u)n\s*$/i, replace: "" },
    { pattern: /\s+\($/, replace: "" }
  ],
  keywordRange: {
    id: "es_keyword",
    sectionStarts: ["Sus mediciones", "Sus resultados"],
    sectionEnds: ["Resultados anteriores", "Interpretaci\u00F3n", "Interpretacion", "Imprimir", "Aviso legal"],
    valueLabels: ["Su valor", "Valor"],
    normalRangeLabels: ["Rango normal", "Rango de referencia", "Intervalo de referencia"],
    dateLabels: ["Fecha"],
    lowerBoundTerms: ["Mayor que", "Por encima de", "M\u00E1s de", "Mas de", "Superior a"],
    upperBoundTerms: ["Menor que", "Por debajo de", "Inferior a"]
  }
};
