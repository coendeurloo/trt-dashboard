import { DA_PARSER_LANGUAGE_PACK } from "./da";
import { DE_PARSER_LANGUAGE_PACK } from "./de";
import { EN_PARSER_LANGUAGE_PACK } from "./en";
import { ES_PARSER_LANGUAGE_PACK } from "./es";
import { FR_PARSER_LANGUAGE_PACK } from "./fr";
import { NL_PARSER_LANGUAGE_PACK } from "./nl";
import { PL_PARSER_LANGUAGE_PACK } from "./pl";
import { PT_BR_PARSER_LANGUAGE_PACK } from "./pt-br";
import { ParserKeywordRangeLocale, ParserLanguagePack, ParserMarkerFix } from "./types";

const ALL_LANGUAGE_PACKS: ParserLanguagePack[] = [
  EN_PARSER_LANGUAGE_PACK,
  NL_PARSER_LANGUAGE_PACK,
  DA_PARSER_LANGUAGE_PACK,
  DE_PARSER_LANGUAGE_PACK,
  ES_PARSER_LANGUAGE_PACK,
  PT_BR_PARSER_LANGUAGE_PACK,
  FR_PARSER_LANGUAGE_PACK,
  PL_PARSER_LANGUAGE_PACK
];
const KEYWORD_LOCALES: ParserKeywordRangeLocale[] = ALL_LANGUAGE_PACKS
  .map((pack) => pack.keywordRange)
  .filter((locale): locale is ParserKeywordRangeLocale => Boolean(locale));

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toPhrasePattern = (value: string): string => escapeRegex(value.trim()).replace(/\s+/g, "\\s+");

const uniq = (values: string[]): string[] => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

const toAlternation = (values: string[]): string =>
  uniq(values)
    .sort((left, right) => right.length - left.length)
    .map((value) => toPhrasePattern(value))
    .join("|");

const allKeywordSpacingLabels = KEYWORD_LOCALES.flatMap((locale) => [
  ...locale.valueLabels,
  ...locale.normalRangeLabels,
  ...locale.dateLabels
]);
const keywordSpacingAlternation = toAlternation(allKeywordSpacingLabels);

const allLineNoiseTerms = ALL_LANGUAGE_PACKS.flatMap((pack) => pack.lineNoiseTerms);
const lineNoiseAlternation = toAlternation(allLineNoiseTerms);
const OCR_FALLBACK_PRIORITY = ["nld", "dan", "deu", "spa", "fra", "por", "pol"] as const;
const MAX_OCR_LANGS_PER_RUN = 3;
const MIN_PARSER_LANGUAGE_SIGNAL_SCORE = 6;
const MULTI_LANGUAGE_SCORE_MARGIN = 2;
const LANGUAGE_DIACRITIC_HINTS: Partial<Record<string, string[]>> = {
  da: ["æ", "ø", "å"],
  de: ["ä", "ö", "ü", "ß"],
  es: ["á", "é", "í", "ó", "ú", "ñ"],
  fr: ["à", "â", "ç", "é", "è", "ê", "ë", "î", "ï", "ô", "ù", "û", "ü", "œ"],
  "pt-br": ["ã", "õ", "á", "â", "ç", "é", "ê", "í", "ó", "ô", "ú"],
  pl: ["ą", "ć", "ę", "ł", "ń", "ó", "ś", "ź", "ż"]
};

export const KEYWORD_INSERT_SPACE_PATTERN =
  keywordSpacingAlternation.length > 0
    ? new RegExp(`([0-9])(?=(?:${keywordSpacingAlternation})\\s*:)`, "gi")
    : /$^/g;

export const PARSER_LINE_NOISE_PATTERN =
  lineNoiseAlternation.length > 0
    ? new RegExp(`\\b(?:${lineNoiseAlternation})\\b`, "i")
    : /$^/;

const countMatchesByLabels = (input: string, labels: string[]): number => {
  const alternation = toAlternation(labels);
  if (!alternation) {
    return 0;
  }
  return Array.from(input.matchAll(new RegExp(`(?:^|[^\\p{L}\\p{N}_])(?:${alternation})(?=\\s*:)`, "giu"))).length;
};

const hasAnyPhrase = (input: string, phrases: string[]): boolean => {
  const alternation = toAlternation(phrases);
  if (!alternation) {
    return false;
  }
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_])(?:${alternation})(?=$|[^\\p{L}\\p{N}_])`, "iu").test(input);
};

const countPhraseMatches = (input: string, phrases: string[]): number => {
  const alternation = toAlternation(phrases);
  if (!alternation) {
    return 0;
  }
  return Array.from(input.matchAll(new RegExp(`(?:^|[^\\p{L}\\p{N}_])(?:${alternation})(?=$|[^\\p{L}\\p{N}_])`, "giu"))).length;
};

const countRegexMatches = (input: string, pattern: RegExp): number => {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return Array.from(input.matchAll(new RegExp(pattern.source, flags))).length;
};

const countDiacriticHits = (input: string, chars: string[]): number => {
  const lower = input.toLowerCase();
  return chars.reduce((count, char) => count + (lower.split(char).length - 1), 0);
};

interface ParserPackSignal {
  pack: ParserLanguagePack;
  keywordHits: number;
  sectionStartHits: number;
  sectionEndHits: number;
  detectionHits: number;
  diacriticHits: number;
  score: number;
}

const getParserPackSignal = (haystack: string, pack: ParserLanguagePack): ParserPackSignal => {
  const keywordHits = pack.keywordRange
    ? countPhraseMatches(haystack, [
        ...pack.keywordRange.valueLabels,
        ...pack.keywordRange.normalRangeLabels,
        ...pack.keywordRange.dateLabels
      ])
    : 0;
  const sectionStartHits = pack.keywordRange ? countPhraseMatches(haystack, pack.keywordRange.sectionStarts) : 0;
  const sectionEndHits = pack.keywordRange ? countPhraseMatches(haystack, pack.keywordRange.sectionEnds) : 0;
  const detectionHits = countRegexMatches(haystack, pack.detectionPattern);
  const diacriticHits = countDiacriticHits(haystack, LANGUAGE_DIACRITIC_HINTS[pack.id] ?? []);
  const score =
    keywordHits * 5 +
    sectionStartHits * 3 +
    sectionEndHits * 2 +
    Math.min(2, detectionHits) +
    Math.min(2, diacriticHits);
  return {
    pack,
    keywordHits,
    sectionStartHits,
    sectionEndHits,
    detectionHits,
    diacriticHits,
    score
  };
};

const chooseDetectedPacks = (signals: ParserPackSignal[]): ParserLanguagePack[] => {
  if (signals.length === 0) {
    return [];
  }
  const ranked = [...signals].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    if (right.keywordHits !== left.keywordHits) {
      return right.keywordHits - left.keywordHits;
    }
    return left.pack.id.localeCompare(right.pack.id);
  });
  const topSignal = ranked[0];
  if (!topSignal || topSignal.score < MIN_PARSER_LANGUAGE_SIGNAL_SCORE) {
    return [];
  }

  const chosen: ParserPackSignal[] = [topSignal];
  for (const signal of ranked.slice(1)) {
    if (chosen.length >= MAX_OCR_LANGS_PER_RUN - 1) {
      break;
    }
    if (signal.score < MIN_PARSER_LANGUAGE_SIGNAL_SCORE) {
      break;
    }
    const closeToTop = topSignal.score - signal.score <= MULTI_LANGUAGE_SCORE_MARGIN;
    const structuralSignal = signal.keywordHits > 0 || signal.sectionStartHits > 0;
    if (closeToTop && structuralSignal) {
      chosen.push(signal);
    }
  }

  return chosen.map((signal) => signal.pack);
};

const sortOcrLangsByPriority = (langs: string[]): string[] =>
  uniq(langs).sort((left, right) => {
    const leftIndex = OCR_FALLBACK_PRIORITY.indexOf(left as (typeof OCR_FALLBACK_PRIORITY)[number]);
    const rightIndex = OCR_FALLBACK_PRIORITY.indexOf(right as (typeof OCR_FALLBACK_PRIORITY)[number]);
    const leftScore = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const rightScore = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
    return leftScore === rightScore ? left.localeCompare(right) : leftScore - rightScore;
  });

export const detectActiveParserLanguagePacks = (text: string, fileName: string): ParserLanguagePack[] => {
  const haystack = `${fileName}\n${text.slice(0, 10000)}`;
  const active: ParserLanguagePack[] = [EN_PARSER_LANGUAGE_PACK];
  const detectedPacks = chooseDetectedPacks(
    ALL_LANGUAGE_PACKS.filter((pack) => pack.id !== EN_PARSER_LANGUAGE_PACK.id).map((pack) =>
      getParserPackSignal(haystack, pack)
    )
  );
  active.push(...detectedPacks);
  return active;
};

export const resolveParserOcrLangs = (text: string, fileName: string): string => {
  const langs = new Set<string>(["eng"]);
  const activePacks = detectActiveParserLanguagePacks(text, fileName);
  const detectedOcrLangs = sortOcrLangsByPriority(
    activePacks
      .filter((pack) => pack.id !== EN_PARSER_LANGUAGE_PACK.id)
      .map((pack) => pack.ocrLang ?? "")
      .filter((lang): lang is string => lang.length > 0)
  );
  for (const lang of detectedOcrLangs) {
    if (langs.size >= MAX_OCR_LANGS_PER_RUN) {
      break;
    }
    langs.add(lang);
  }

  return Array.from(langs).join("+");
};

const MARKER_FIXES: ParserMarkerFix[] = ALL_LANGUAGE_PACKS.flatMap((pack) => pack.markerFixes);

export const applyParserMarkerFixes = (markerName: string): string => {
  let marker = markerName;
  MARKER_FIXES.forEach((fix) => {
    marker = marker.replace(fix.pattern, fix.replace);
  });
  return marker;
};

export const detectKeywordRangeLocale = (text: string, fileName: string): ParserKeywordRangeLocale | null => {
  const haystack = `${fileName}\n${text.slice(0, 10000)}`;
  const normalized = haystack.replace(KEYWORD_INSERT_SPACE_PATTERN, "$1 ");
  let best: { locale: ParserKeywordRangeLocale; score: number } | null = null;

  for (const locale of KEYWORD_LOCALES) {
    const valueHits = countMatchesByLabels(normalized, locale.valueLabels);
    const normalRangeHits = countMatchesByLabels(normalized, locale.normalRangeLabels);
    if (valueHits === 0 || normalRangeHits === 0) {
      continue;
    }

    let score = valueHits + normalRangeHits;
    if (hasAnyPhrase(normalized, locale.sectionStarts)) {
      score += 3;
    }

    if (!best || score > best.score) {
      best = { locale, score };
    }
  }

  if (!best || best.score <= 0) {
    return null;
  }
  return best.locale;
};

export const getKeywordRangeLocaleById = (id: string): ParserKeywordRangeLocale | null =>
  KEYWORD_LOCALES.find((locale) => locale.id === id) ?? null;

export const buildPhraseAlternation = (phrases: string[]): string => toAlternation(phrases);
