export interface ParserMarkerFix {
  pattern: RegExp;
  replace: string;
}

export interface ParserKeywordRangeLocale {
  id: string;
  sectionStarts: string[];
  sectionEnds: string[];
  valueLabels: string[];
  normalRangeLabels: string[];
  dateLabels: string[];
  lowerBoundTerms: string[];
  upperBoundTerms: string[];
}

export interface ParserLanguagePack {
  id: string;
  ocrLang: string | null;
  detectionPattern: RegExp;
  lineNoiseTerms: string[];
  markerFixes: ParserMarkerFix[];
  keywordRange?: ParserKeywordRangeLocale;
}
