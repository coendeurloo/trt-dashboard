import { ParserLanguagePack } from "./types";

export const PT_BR_PARSER_LANGUAGE_PACK: ParserLanguagePack = {
  id: "pt-br",
  ocrLang: "por",
  detectionPattern:
    /\b(?:seu valor|faixa normal|faixa de refer(?:\u00EA|e)ncia|resultados anteriores|interpreta(?:\u00E7|\u00E7\u00E3|c|ca)o|hemoglobina|colesterol|testosterona)\b/i,
  lineNoiseTerms: [
    "interpreta\u00E7\u00E3o",
    "interpretacao",
    "coment\u00E1rio",
    "comentario",
    "resultados anteriores"
  ],
  markerFixes: [
    { pattern: /\s*\(conforme\s*$/i, replace: "" },
    { pattern: /\s+\($/, replace: "" }
  ],
  keywordRange: {
    id: "pt_br_keyword",
    sectionStarts: ["Seus resultados", "Suas medi\u00E7\u00F5es", "Suas medicoes"],
    sectionEnds: ["Resultados anteriores", "Interpreta\u00E7\u00E3o", "Interpretacao", "Imprimir", "Aviso legal"],
    valueLabels: ["Seu valor", "Valor"],
    normalRangeLabels: ["Faixa normal", "Faixa de refer\u00EAncia", "Faixa de referencia", "Valor de refer\u00EAncia", "Valor de referencia"],
    dateLabels: ["Data"],
    lowerBoundTerms: ["Maior que", "Acima de", "Superior a"],
    upperBoundTerms: ["Menor que", "Abaixo de", "Inferior a"]
  }
};
