import { DA_PARSER_LANGUAGE_PACK } from "./da";
import { EN_PARSER_LANGUAGE_PACK } from "./en";
import { NL_PARSER_LANGUAGE_PACK } from "./nl";
import { ParserKeywordRangeLocale, ParserLanguagePack, ParserMarkerFix } from "./types";

const ALL_LANGUAGE_PACKS: ParserLanguagePack[] = [EN_PARSER_LANGUAGE_PACK, NL_PARSER_LANGUAGE_PACK, DA_PARSER_LANGUAGE_PACK];
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
  return Array.from(input.matchAll(new RegExp(`\\b(?:${alternation})\\b\\s*:`, "gi"))).length;
};

const hasAnyPhrase = (input: string, phrases: string[]): boolean => {
  const alternation = toAlternation(phrases);
  if (!alternation) {
    return false;
  }
  return new RegExp(`\\b(?:${alternation})\\b`, "i").test(input);
};

export const detectActiveParserLanguagePacks = (text: string, fileName: string): ParserLanguagePack[] => {
  const haystack = `${fileName}\n${text.slice(0, 10000)}`;
  const active: ParserLanguagePack[] = [EN_PARSER_LANGUAGE_PACK];
  ALL_LANGUAGE_PACKS.forEach((pack) => {
    if (pack.id !== EN_PARSER_LANGUAGE_PACK.id && pack.detectionPattern.test(haystack)) {
      active.push(pack);
    }
  });
  return active;
};

export const resolveParserOcrLangs = (text: string, fileName: string): string => {
  const langs = new Set<string>(["eng"]);
  detectActiveParserLanguagePacks(text, fileName).forEach((pack) => {
    if (pack.ocrLang) {
      langs.add(pack.ocrLang);
    }
  });
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
