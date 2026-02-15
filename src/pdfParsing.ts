import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PRIMARY_MARKERS } from "./constants";
import { ExtractionDraft, MarkerValue } from "./types";
import { canonicalizeMarker, normalizeMarkerMeasurement } from "./unitConversion";
import { createId, deriveAbnormalFlag, safeNumber } from "./utils";

(pdfjsLib as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc =
  pdfWorker;

interface ClaudeResponse {
  content?: Array<{ type: string; text?: string }>;
  error?: {
    message?: string;
  };
}

interface RawMarker {
  marker: string;
  value: number | string;
  unit?: string;
  referenceMin?: number | string | null;
  referenceMax?: number | string | null;
  confidence?: number;
}

interface ClaudeExtraction {
  testDate?: string;
  markers?: RawMarker[];
}

interface ParsedFallbackRow {
  markerName: string;
  value: number;
  unit: string;
  referenceMin: number | null;
  referenceMax: number | null;
  confidence: number;
}

interface ParsedReference {
  referenceMin: number | null;
  referenceMax: number | null;
  unit: string;
}

interface DateScore {
  score: number;
  count: number;
  firstIndex: number;
}

type ParserProfileId = "adaptive";

interface ParserProfile {
  id: ParserProfileId;
  requireUnit: boolean;
  enableKeywordRangeParser: boolean;
  lineNoisePattern?: RegExp;
}

const NOISE_SYMBOL_PATTERN = /[ñò↑↓]/g;
const SECTION_PREFIX_PATTERN =
  /^(?:nuchter|hematology|clinical chemistry|hormones|vitamins|tumor markers|cardial markers|hematologie|klinische chemie|proteine-diagnostiek|endocrinologie|schildklier-diagnostiek|bloedbeeld klein|hematologie bloedbeeld klein)\s+/i;
const METHOD_SUFFIX_PATTERN = /\b(?:ECLIA|PHOT|ENZ|NEPH|ISSAM)\b$/i;
const UNIT_TOKEN_PATTERN = /^[A-Za-z%µμ/][A-Za-z0-9%µμ/.\-²]*$/;
const LEADING_UNIT_FRAGMENT_PATTERN =
  /^(?:mmol|nmol|pmol|pg|ng|g|mg|µmol|umol|u|mu|miu|fl|fmol|l)\s*\/\s*[a-z0-9µμ%]+\s*/i;
const IMPORTANT_MARKERS = new Set([
  "Testosterone",
  "Free Testosterone",
  "Estradiol",
  "Hematocrit",
  "SHBG"
]);
const EXTRACTION_MODEL_CANDIDATES = [
  "claude-sonnet-4-20250514",
  "claude-3-7-sonnet-20250219",
  "claude-3-7-sonnet-latest",
  "claude-3-5-sonnet-latest"
] as const;

const DATE_CONTEXT_HINT_PATTERN =
  /\b(?:sample\s*(?:draw|collection|date)|collection\s*times?|date\s*collected|collected|afname(?:datum)?|monster\s*afname|materiaal\s*afname|sample\s*taken)\b/i;
const RECEIPT_CONTEXT_HINT_PATTERN = /\b(?:arrival|received|ontvangst|materiaal\s*ontvangst)\b/i;
const REPORT_CONTEXT_HINT_PATTERN =
  /\b(?:report\s*date|print\s*date|datum\s*afdruk|issued|validated|result\s*date)\b/i;
const STATUS_TOKEN_PATTERN = /^(?:H|L|HIGH|LOW|Within(?:\s+range)?|Above(?:\s+range)?|Below(?:\s+range)?)$/i;
const DASH_TOKEN_PATTERN = /^[-–]$/;
const DEFAULT_PROFILE: ParserProfile = {
  id: "adaptive",
  requireUnit: true,
  enableKeywordRangeParser: false,
  lineNoisePattern: /\b(?:patient details|requesting physician|clinical history|interpretation|notes?)\b/i
};

const extractPdfText = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const chunks: string[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const text = await page.getTextContent();
    const rows: Array<{ y: number; items: Array<{ x: number; text: string }> }> = [];

    for (const item of text.items) {
      const textItem = item as { str?: string; transform?: number[] };
      const lineText = cleanWhitespace(textItem.str ?? "");
      if (!lineText) {
        continue;
      }

      const transform = Array.isArray(textItem.transform) ? textItem.transform : [];
      const x = typeof transform[4] === "number" ? transform[4] : 0;
      const y = typeof transform[5] === "number" ? transform[5] : 0;

      const existing = rows.find((row) => Math.abs(row.y - y) <= 2);
      if (existing) {
        existing.items.push({ x, text: lineText });
      } else {
        rows.push({ y, items: [{ x, text: lineText }] });
      }
    }

    const pageLines = rows
      .sort((a, b) => {
        if (Math.abs(b.y - a.y) > 2) {
          return b.y - a.y;
        }
        return (a.items[0]?.x ?? 0) - (b.items[0]?.x ?? 0);
      })
      .map((row) => {
        const orderedItems = row.items.sort((a, b) => a.x - b.x);
        let output = "";
        let previousX: number | null = null;
        for (const part of orderedItems) {
          if (!output) {
            output = part.text;
            previousX = part.x;
            continue;
          }
          const gap = previousX === null ? 0 : part.x - previousX;
          output += `${gap > 18 ? "  " : " "}${part.text}`;
          previousX = part.x;
        }
        return cleanWhitespace(output);
      })
      .filter(Boolean);

    chunks.push(pageLines.join("\n"));
  }

  return chunks.join("\n");
};

const extractJsonBlock = (input: string): string | null => {
  const fenced = input.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = input.indexOf("{");
  const end = input.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return input.slice(start, end + 1);
};

const normalizeMarker = (raw: RawMarker): MarkerValue | null => {
  const value = safeNumber(raw.value);
  if (value === null || !raw.marker) {
    return null;
  }

  const canonicalMarker = canonicalizeMarker(raw.marker);
  const referenceMin = safeNumber(raw.referenceMin ?? null);
  const referenceMax = safeNumber(raw.referenceMax ?? null);
  const normalized = normalizeMarkerMeasurement({
    canonicalMarker,
    value,
    unit: raw.unit?.trim() || "",
    referenceMin,
    referenceMax
  });

  return {
    id: createId(),
    marker: raw.marker.trim(),
    canonicalMarker,
    value: normalized.value,
    unit: normalized.unit,
    referenceMin: normalized.referenceMin,
    referenceMax: normalized.referenceMax,
    abnormal: deriveAbnormalFlag(normalized.value, normalized.referenceMin, normalized.referenceMax),
    confidence: typeof raw.confidence === "number" ? Math.min(1, Math.max(0, raw.confidence)) : 0.7
  };
};

const cleanWhitespace = (value: string): string => {
  const compact = value.replace(/\u00a0/g, " ").replace(NOISE_SYMBOL_PATTERN, " ").replace(/\s+/g, " ").trim();

  // Some Dutch reports split micro-units as "μ g/l", which breaks row parsing.
  return compact
    .replace(/([0-9])(?=(?:Uw waarde:|Normale waarde:|Datum:))/g, "$1 ")
    .replace(/([µμ])\s+g\s*\/\s*l/gi, "µg/L")
    .replace(/([µμ])\s+mol\s*\/\s*l/gi, "µmol/L")
    .replace(/u?mol\s*\/\s*l/gi, (value) => (/^umol/i.test(value.replace(/\s+/g, "")) ? "umol/L" : value))
    .replace(/ug\s*\/\s*l/gi, "ug/L")
    .replace(/ug\s*\/\s*dl/gi, "ug/dL")
    .replace(/mcg\s*\/\s*dl/gi, "mcg/dL")
    .replace(/mcg\s*\/\s*ml/gi, "mcg/mL")
    .replace(/ng\s*\/\s*ml/gi, "ng/mL")
    .replace(/ng\s*\/\s*dl/gi, "ng/dL")
    .replace(/ng\s*\/\s*mg/gi, "ng/mg")
    .replace(/pg\s*\/\s*ml/gi, "pg/mL")
    .replace(/pg\s*\/\s*mg/gi, "pg/mg");
};

const normalizeUnit = (unit: string): string => {
  const compact = unit.replace(/\s+/g, "").replace(/μ/g, "µ");
  if (/^mmol\/l$/i.test(compact)) {
    return "mmol/L";
  }
  if (/^nmol\/l$/i.test(compact)) {
    return "nmol/L";
  }
  if (/^pmol\/l$/i.test(compact)) {
    return "pmol/L";
  }
  if (/^pg\/ml$/i.test(compact)) {
    return "pg/mL";
  }
  if (/^pg\/mg$/i.test(compact)) {
    return "pg/mg";
  }
  if (/^ng\/ml$/i.test(compact)) {
    return "ng/mL";
  }
  if (/^ng\/mg$/i.test(compact)) {
    return "ng/mg";
  }
  if (/^ng\/dl$/i.test(compact)) {
    return "ng/dL";
  }
  if (/^mcg\/dl$/i.test(compact)) {
    return "mcg/dL";
  }
  if (/^mcg\/ml$/i.test(compact)) {
    return "mcg/mL";
  }
  if (/^µmol\/l$/i.test(compact)) {
    return "µmol/L";
  }
  if (/^umol\/l$/i.test(compact)) {
    return "µmol/L";
  }
  if (/^µg\/l$/i.test(compact)) {
    return "µg/L";
  }
  if (/^ug\/l$/i.test(compact)) {
    return "µg/L";
  }
  if (/^ug\/dl$/i.test(compact)) {
    return "µg/dL";
  }
  if (/^g\/l$/i.test(compact)) {
    return "g/L";
  }
  if (/^g\/dl$/i.test(compact)) {
    return "g/dL";
  }
  if (/^iu\/l$/i.test(compact)) {
    return "IU/L";
  }
  if (/^iu\/ml$/i.test(compact)) {
    return "IU/mL";
  }
  if (/^u\/ml$/i.test(compact)) {
    return "U/mL";
  }
  if (/^10\^?9\/l$/i.test(compact) || /^10\*9\/l$/i.test(compact)) {
    return "10^9/L";
  }
  if (/^10\^?12\/l$/i.test(compact) || /^10\*12\/l$/i.test(compact)) {
    return "10^12/L";
  }
  if (/^u\/l$/i.test(compact)) {
    return "U/L";
  }
  if (/^mu\/l$/i.test(compact)) {
    return "mU/L";
  }
  if (/^miu\/l$/i.test(compact)) {
    return "mIU/L";
  }
  if (/^fl$/i.test(compact)) {
    return "fL";
  }
  if (/^pg$/i.test(compact)) {
    return "pg";
  }
  if (/^mm\/hr$/i.test(compact)) {
    return "mm/hr";
  }
  if (/^l\/l$/i.test(compact)) {
    return "L/L";
  }
  return compact;
};

const isLikelyUnit = (token: string): boolean => {
  if (!UNIT_TOKEN_PATTERN.test(token)) {
    return false;
  }

  if (token.includes("/") || token.includes("%") || token.startsWith("10x")) {
    return true;
  }

  return /^(?:mmol|nmol|pmol|pg|ng|mU|mIU|U|IU|mg|g|µg|ug|µmol|umol|fL|fl|fmol|ratio|l\/l|mm\/hr)$/i.test(
    token
  );
};

const toIsoDate = (day: string, month: string, year: string): string | null => {
  const d = Number(day);
  const m = Number(month);
  if (!Number.isFinite(d) || !Number.isFinite(m) || d < 1 || d > 31 || m < 1 || m > 12) {
    return null;
  }

  let y = Number(year);
  if (!Number.isFinite(y)) {
    return null;
  }

  if (year.length === 2) {
    y += y >= 70 ? 1900 : 2000;
  }

  if (y < 1900 || y > 2100) {
    return null;
  }

  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return iso;
};

const toIsoYmd = (year: string, month: string, day: string): string | null => {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) {
    return null;
  }
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : iso;
};

const extractDateByPattern = (text: string, pattern: RegExp): string | null => {
  const match = text.match(pattern);
  if (!match) {
    return null;
  }
  return toIsoDate(match[1], match[2], match[3]);
};

const detectParserProfile = (text: string, fileName: string): ParserProfile => {
  const haystack = `${fileName}\n${text.slice(0, 10000)}`;
  const keywordStyleHits = Array.from(
    haystack.matchAll(/\b(?:uw|your)\s+waarde:\s*[<>]?\s*\d+(?:[.,]\d+)?/gi)
  ).length;
  const normalRangeHits = Array.from(
    haystack.matchAll(/\b(?:normale\s+waarde|normal\s+range|reference\s+range)\s*:/gi)
  ).length;
  const keywordRangeStyle = keywordStyleHits > 0 && normalRangeHits > 0;

  return {
    id: "adaptive",
    requireUnit: !keywordRangeStyle,
    enableKeywordRangeParser: keywordRangeStyle,
    lineNoisePattern: /\b(?:patient details|requesting physician|clinical history|interpretation|notes?|daily free cortisol pattern)\b/i
  };
};

const isPlausibleLabDate = (iso: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return false;
  }
  if (iso < "1990-01-01") {
    return false;
  }
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const maxIso = tomorrow.toISOString().slice(0, 10);
  return iso <= maxIso;
};

const collectAllDates = (text: string): string[] => {
  const result = new Set<string>();

  const ymdMatches = text.matchAll(/\b(20\d{2})\s*[./-]\s*(0?[1-9]|1[0-2])\s*[./-]\s*(0?[1-9]|[12]\d|3[01])\b/g);
  for (const match of ymdMatches) {
    const iso = toIsoYmd(match[1], match[2], match[3]);
    if (iso && isPlausibleLabDate(iso)) {
      result.add(iso);
    }
  }

  const dateMatches = text.matchAll(
    /\b([0-3]?\d)\s*[./-]\s*([01]?\d)\s*[./-]\s*(\d{2,4})\b/g
  );

  for (const match of dateMatches) {
    const iso = toIsoDate(match[1], match[2], match[3]);
    if (iso && isPlausibleLabDate(iso)) {
      result.add(iso);
    }
  }

  return Array.from(result);
};

const scoreDateCandidate = (
  scores: Map<string, DateScore>,
  isoDate: string,
  weight: number,
  lineIndex: number
) => {
  if (!isPlausibleLabDate(isoDate)) {
    return;
  }
  const existing = scores.get(isoDate);
  if (existing) {
    existing.score += weight;
    existing.count += 1;
    if (lineIndex < existing.firstIndex) {
      existing.firstIndex = lineIndex;
    }
    return;
  }
  scores.set(isoDate, { score: weight, count: 1, firstIndex: lineIndex });
};

const extractDateByContext = (text: string): string | null => {
  const lines = text
    .split("\n")
    .map((line) => cleanWhitespace(line))
    .filter(Boolean);

  const scores = new Map<string, DateScore>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    for (const match of line.matchAll(
      /\b(?:date\s*collected|collected|sample\s*(?:draw|collection|date)|collection\s*times?|afname(?:datum)?|monster\s*afname|materiaal\s*afname)\b[^0-9]{0,30}([0-9][0-9\s./-]{6,20})/gi
    )) {
      const chunkDates = collectAllDates(match[1]);
      if (chunkDates.length > 0) {
        scoreDateCandidate(scores, chunkDates[0], 8, index);
      }
    }

    for (const match of line.matchAll(
      /\b(?:arrival|arrival\s*date|received|ontvangst|materiaal\s*ontvangst)\b[^0-9]{0,30}([0-9][0-9\s./-]{6,20})/gi
    )) {
      const chunkDates = collectAllDates(match[1]);
      if (chunkDates.length > 0) {
        scoreDateCandidate(scores, chunkDates[0], 4, index);
      }
    }

    const lineDates = collectAllDates(line);
    if (lineDates.length === 0) {
      continue;
    }

    if (/\bdatum\s*:\b/i.test(line) && lineDates.length >= 2) {
      const sorted = [...lineDates].sort();
      scoreDateCandidate(scores, sorted[sorted.length - 1], 6, index);
      continue;
    }

    if (DATE_CONTEXT_HINT_PATTERN.test(line)) {
      lineDates.forEach((date) => scoreDateCandidate(scores, date, 5, index));
    } else if (RECEIPT_CONTEXT_HINT_PATTERN.test(line)) {
      lineDates.forEach((date) => scoreDateCandidate(scores, date, 2, index));
    } else if (REPORT_CONTEXT_HINT_PATTERN.test(line)) {
      lineDates.forEach((date) => scoreDateCandidate(scores, date, -3, index));
    }
  }

  const winner = Array.from(scores.entries()).sort((a, b) => {
    const aScore = a[1];
    const bScore = b[1];
    if (bScore.score !== aScore.score) {
      return bScore.score - aScore.score;
    }
    if (bScore.count !== aScore.count) {
      return bScore.count - aScore.count;
    }
    if (aScore.firstIndex !== bScore.firstIndex) {
      return aScore.firstIndex - bScore.firstIndex;
    }
    return b[0].localeCompare(a[0]);
  })[0];

  return winner?.[0] ?? null;
};

const extractDateCandidate = (text: string): string => {
  const fromContext = extractDateByContext(text);
  if (fromContext) {
    return fromContext;
  }

  const normalized = cleanWhitespace(text);

  const priorityPatterns = [
    /(?:sample\s*draw|date\s*collected|monster\s*afname|monster\s*afname:|afname|sample\s*collection|collection\s*date)[^0-9]{0,40}([0-3]?\d)\s*[./-]\s*([01]?\d)\s*[./-]\s*(\d{2,4})/i,
    /(?:arrival\s*date,?\s*time|arrival\s*date|materiaal\s*ontvangst|ontvangst)[^0-9]{0,40}([0-3]?\d)\s*[./-]\s*([01]?\d)\s*[./-]\s*(\d{2,4})/i
  ];

  for (const pattern of priorityPatterns) {
    const found = extractDateByPattern(normalized, pattern);
    if (found) {
      return found;
    }
  }

  const allDates = collectAllDates(text).sort();
  if (allDates.length > 0) {
    const counts = new Map<string, number>();
    allDates.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      return b[0].localeCompare(a[0]);
    })[0][0];
  }

  const iso = normalized.match(/\b(20\d{2})\s*[-/.]\s*(0[1-9]|1[0-2])\s*[-/.]\s*(0[1-9]|[12]\d|3[01])\b/);
  if (iso?.[0]) {
    return iso[0].replace(/\s+/g, "").replace(/[/.]/g, "-");
  }

  return new Date().toISOString().slice(0, 10);
};

const parseMijnGezondheidRows = (text: string): ParsedFallbackRow[] => {
  const normalized = cleanWhitespace(text);
  if (!/\bUw metingen\b/i.test(normalized)) {
    return [];
  }

  const sectionStart = normalized.search(/\bUw metingen\b/i);
  let section = normalized.slice(sectionStart);
  const sectionEnd = section.search(/\b(?:Uitslagen uit het verleden|Toelichting|Print|Disclaimer)\b/i);
  if (sectionEnd > 0) {
    section = section.slice(0, sectionEnd);
  }

  section = section.replace(/([0-9])(?=(?:Uw waarde:|Normale waarde:|Datum:))/g, "$1 ");
  const rows: ParsedFallbackRow[] = [];

  const pattern =
    /([A-Za-zÀ-ž][A-Za-zÀ-ž0-9(),.%+\-/ ]{2,140}?)\s+Uw waarde:\s*([<>]?\d+(?:[.,]\d+)?)\s+Normale waarde:\s*((?:Hoger dan|Lager dan)\s*-?\d+(?:[.,]\d+)?(?:\s*-\s*(?:Hoger dan|Lager dan)\s*-?\d+(?:[.,]\d+)?)?)/gi;

  for (const match of section.matchAll(pattern)) {
    const markerName = applyProfileMarkerFixes(cleanMarkerName(match[1]));
    if (looksLikeNoiseMarker(markerName)) {
      continue;
    }

    const value = safeNumber(match[2]);
    if (value === null) {
      continue;
    }

    const referenceText = cleanWhitespace(match[3] ?? "").trim();
    let referenceMin: number | null = null;
    let referenceMax: number | null = null;

    const betweenRange = referenceText.match(
      /hoger dan\s*(-?\d+(?:[.,]\d+)?)\s*-\s*lager dan\s*(-?\d+(?:[.,]\d+)?)/i
    );
    if (betweenRange) {
      referenceMin = safeNumber(betweenRange[1]);
      referenceMax = safeNumber(betweenRange[2]);
    } else {
      const reverseRange = referenceText.match(
        /lager dan\s*(-?\d+(?:[.,]\d+)?)\s*-\s*hoger dan\s*(-?\d+(?:[.,]\d+)?)/i
      );
      if (reverseRange) {
        referenceMax = safeNumber(reverseRange[1]);
        referenceMin = safeNumber(reverseRange[2]);
      }
    }

    if (referenceMin === null) {
      const lowerOnly = referenceText.match(/hoger dan\s*(-?\d+(?:[.,]\d+)?)/i);
      if (lowerOnly) {
        referenceMin = safeNumber(lowerOnly[1]);
      }
    }

    if (referenceMax === null) {
      const upperOnly = referenceText.match(/lager dan\s*(-?\d+(?:[.,]\d+)?)/i);
      if (upperOnly) {
        referenceMax = safeNumber(upperOnly[1]);
      }
    }

    rows.push({
      markerName,
      value,
      unit: "",
      referenceMin,
      referenceMax,
      confidence: 0.62
    });
  }

  return rows;
};

const cleanMarkerName = (rawMarker: string): string => {
  let marker = cleanWhitespace(rawMarker)
    .replace(/^[^A-Za-zÀ-ž]+/, "")
    .replace(/\s*\([^)]*dr\.[^)]*\)$/i, "")
    .replace(/\b(?:within|above|below)\s+(?:luteal|follicular|optimal|reference)?\s*range\b/gi, "")
    .trim();

  // Remove flattened row prefixes like "15.5 % 8/58 A " or "Nmol/l 53/58 A ".
  marker = marker
    .replace(/^\d+(?:[.,]\d+)?\s*%?\s+\d{1,3}\/\d{2,3}\s+A?\s+/i, "")
    .replace(/^[A-Za-zµμ%]+\/[A-Za-z0-9µμ%]+\s+\d{1,3}\/\d{2,3}\s+A?\s+/i, "")
    .replace(/^\d{1,3}\/\d{2,3}\s+A?\s+/i, "")
    .replace(/^[A-Za-zµμ%]+\/[A-Za-z0-9µμ%]+\s*[-–]\s*-?\d+(?:[.,]\d+)?\s+-?\d+(?:[.,]\d+)?\s+/i, "")
    .replace(/^[A-Za-zµμ%]+\/[A-Za-z0-9µμ%]+\s*(?:<|>|≤|≥)\s*-?\d+(?:[.,]\d+)?\s+/i, "")
    .replace(/^uw metingen\s+/i, "")
    .replace(/^zie\s*opm\.?\s*/i, "")
    .trim();

  if (LEADING_UNIT_FRAGMENT_PATTERN.test(marker)) {
    marker = marker.replace(LEADING_UNIT_FRAGMENT_PATTERN, "").trim();
  }

  while (SECTION_PREFIX_PATTERN.test(marker)) {
    marker = marker.replace(SECTION_PREFIX_PATTERN, "").trim();
  }

  marker = marker.replace(METHOD_SUFFIX_PATTERN, "").trim();

  if (
    /\b(langere tijd tussen (?:bloed)?afname en analyse|longer time between blood collection and analysis)\b/i.test(marker)
  ) {
    return "MCH";
  }

  const anchor = marker.match(
    /\b(testosterone|testosteron|estradiol|shbg|hematocrit|hematocriet|lh|fsh|prolactin|psa|tsh|cholesterol|creatinine|glucose|hemoglobine|hemoglobin|albumine|albumin|mchc|mch|mcv|hdl|ldl|platelets?|thrombocyten|leukocyten|leucocyten|lymphocytes?|eosinophils?|basophils?|neutrophils?|monocytes?|free androgen index|dihydrotestosteron|dihydrotestosterone|vitamin b12|vitamine b12|urea|ureum|triglycerides?|red blood cells?|erythrocyten|ferritin|ferritine|egfr|ckd-epi|foliumzuur|homocysteine|transferrin|transferrine|non hdl)\b/i
  );
  if (anchor && anchor.index !== undefined && anchor.index > 0) {
    const prefix = marker.slice(0, anchor.index);
    if (prefix.length > 20 || /\b(?:risk|risico|report|resultaat|patient|uitslag|diagnostiek)\b/i.test(prefix)) {
      marker = marker.slice(anchor.index).trim();
    }
  }

  if (marker.split(" ").length > 10) {
    marker = marker.split(" ").slice(-6).join(" ");
  }

  return marker.replace(/[.,;:]+$/, "").trim();
};

const applyProfileMarkerFixes = (markerName: string): string => {
  let marker = markerName;

  marker = marker.replace(/^Result\s+/i, "");
  marker = marker.replace(/\bT otal\b/g, "Total");

  marker = marker.replace(/^Ratio:\s*T\/SHBG.*$/i, "SHBG");
  marker = marker.replace(/\s{2,}/g, " ").trim();

  return marker;
};

const looksLikeNoiseMarker = (marker: string): boolean => {
  if (!marker || marker.length < 2) {
    return true;
  }

  if (!/[A-Za-zÀ-ž]{2}/.test(marker)) {
    return true;
  }

  if (/^\d/.test(marker)) {
    return true;
  }

  if (isLikelyUnit(marker) || (/^[A-Za-z%µμ/().-]+$/.test(marker) && marker.includes("/"))) {
    return true;
  }

  return /^(?:testing report|first name|arrival date|request complete|resultaat nummer|rapport|pagina|receiver|email|phone|fax|validated|end of report|sample date|collection times?|patient|doctor|laboratory|specimen|requesting physician|units?|result normal|age reference range|daily free cortisol pattern|precision analytical|report date|date of birth|dob|sample material|requested test|request within|low limit high limit|that values below|this is a laboratory calculation|lower ground|muster|to|over|years?|www\.)\b/i.test(
    marker
  );
};

const extractReferenceAndUnit = (rawValue: string): ParsedReference => {
  const cleaned = cleanWhitespace(rawValue);
  let referenceMin: number | null = null;
  let referenceMax: number | null = null;
  let unit = "";

  const rangeMatches = Array.from(cleaned.matchAll(/(?:<|>|≤|≥)?\s*(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/g));
  if (rangeMatches.length > 0) {
    const last = rangeMatches[rangeMatches.length - 1];
    referenceMin = safeNumber(last[1]);
    referenceMax = safeNumber(last[2]);
  }

  if (referenceMin === null && referenceMax === null) {
    const upperMatch = cleaned.match(/(?:^|\s)(?:<|≤)\s*(-?\d+(?:[.,]\d+)?)(?:\s|$)/i);
    if (upperMatch) {
      referenceMax = safeNumber(upperMatch[1]);
    }
  }

  if (referenceMin === null && referenceMax === null) {
    const lowerMatch = cleaned.match(/(?:^|\s)(?:>|≥)\s*(-?\d+(?:[.,]\d+)?)(?:\s|$)/i);
    if (lowerMatch) {
      referenceMin = safeNumber(lowerMatch[1]);
    }
  }

  const tokens = cleaned
    .split(" ")
    .map((token) => token.trim().replace(/[),;]+$/, ""))
    .filter(Boolean);
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (isLikelyUnit(tokens[index])) {
      unit = normalizeUnit(tokens[index]);
      break;
    }
  }

  return {
    referenceMin,
    referenceMax,
    unit
  };
};

const isNumericToken = (token: string): boolean => {
  return safeNumber(token) !== null;
};

const parseRowByRightAnchoredUnit = (
  rawRow: string,
  confidence: number,
  profile: ParserProfile
): ParsedFallbackRow | null => {
  const cleanedRow = cleanWhitespace(rawRow);
  if (!cleanedRow) {
    return null;
  }

  const tokens = cleanedRow
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length < 3) {
    return null;
  }

  let unitIndex = -1;
  for (let index = tokens.length - 1; index >= 1; index -= 1) {
    if (!isLikelyUnit(tokens[index])) {
      continue;
    }
    unitIndex = index;
    break;
  }

  if (unitIndex < 0 && profile.requireUnit) {
    return null;
  }

  const valueSearchEnd = unitIndex > 0 ? unitIndex - 1 : tokens.length - 1;
  let valueIndex = -1;
  for (let index = 1; index <= valueSearchEnd; index += 1) {
    if (!isNumericToken(tokens[index])) {
      continue;
    }

    if (index + 2 <= valueSearchEnd && DASH_TOKEN_PATTERN.test(tokens[index + 1]) && isNumericToken(tokens[index + 2])) {
      continue;
    }

    valueIndex = index;
    break;
  }

  if (valueIndex < 1) {
    return null;
  }

  const markerName = applyProfileMarkerFixes(cleanMarkerName(tokens.slice(0, valueIndex).join(" ")));
  if (looksLikeNoiseMarker(markerName)) {
    return null;
  }

  const value = safeNumber(tokens[valueIndex]);
  if (value === null) {
    return null;
  }

  const explicitUnit = unitIndex >= 0 ? normalizeUnit(tokens[unitIndex]) : "";
  const middleTokens = tokens.slice(valueIndex + 1, unitIndex >= 0 ? unitIndex : tokens.length);
  const trailingTokens = unitIndex >= 0 ? tokens.slice(unitIndex + 1) : [];
  const parsedReference = extractReferenceAndUnit([...middleTokens, ...trailingTokens].join(" "));

  return {
    markerName,
    value,
    unit: explicitUnit || parsedReference.unit,
    referenceMin: parsedReference.referenceMin,
    referenceMax: parsedReference.referenceMax,
    confidence
  };
};

const parseSingleRow = (
  rawRow: string,
  confidence: number,
  profile: ParserProfile = DEFAULT_PROFILE
): ParsedFallbackRow | null => {
  const rightAnchored = parseRowByRightAnchoredUnit(rawRow, confidence + 0.04, profile);
  if (rightAnchored) {
    return rightAnchored;
  }

  const cleanedRow = cleanWhitespace(rawRow);
  if (!cleanedRow) {
    return null;
  }

  const baseMatch = cleanedRow.match(/^(.+?)\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)(?:\s+|$)(.*)$/);
  if (!baseMatch) {
    return null;
  }

  const markerName = applyProfileMarkerFixes(cleanMarkerName(baseMatch[1]));
  if (looksLikeNoiseMarker(markerName)) {
    return null;
  }

  const value = safeNumber(baseMatch[2].replace(/\s+/g, ""));
  if (value === null) {
    return null;
  }

  const rest = cleanWhitespace(baseMatch[3] ?? "");
  const parsedReference = extractReferenceAndUnit(rest);

  return {
    markerName,
    value,
    unit: parsedReference.unit,
    referenceMin: parsedReference.referenceMin,
    referenceMax: parsedReference.referenceMax,
    confidence
  };
};

const looksLikeNonResultLine = (line: string): boolean => {
  if (!line || line.length < 3) {
    return true;
  }

  if (
    /^(?:page|pagina)\s+\d+\b/i.test(line) ||
    /\b(?:reference range|units?|resultaat|report|laboratory|specimen|sample type|patient|address|telephone|fax)\b/i.test(line)
  ) {
    return true;
  }

  if (
    /\b(?:collected|received|report date|sample date|collection times?|date of birth|dob)\b/i.test(line) &&
    /\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{2,4}/.test(line)
  ) {
    return true;
  }

  return false;
};

const shouldKeepParsedRow = (row: ParsedFallbackRow, profile: ParserProfile = DEFAULT_PROFILE): boolean => {
  if (
    /\b(?:report|sample|date|patient|doctor|laboratory|result|normal|range|collection|precision analytical|daily free cortisol pattern|described|section|comment|defines|followed by|levels below)\b/i.test(
      row.markerName
    )
  ) {
    return false;
  }

  if (/\bN\/A\b/i.test(row.markerName) || /\bwww\./i.test(row.markerName)) {
    return false;
  }

  if (profile.requireUnit && !row.unit) {
    return false;
  }

  if (row.unit || row.referenceMin !== null || row.referenceMax !== null) {
    return true;
  }
  const canonical = canonicalizeMarker(row.markerName);
  return IMPORTANT_MARKERS.has(canonical);
};

const parseTwoLineRow = (line: string, nextLine: string, profile: ParserProfile): ParsedFallbackRow | null => {
  const markerAndValue = line.match(/^(.+?)\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)$/);
  if (markerAndValue) {
    const leftTokens = cleanWhitespace(markerAndValue[1]).split(" ").filter(Boolean);
    const leftNumericCount = leftTokens.filter((token) => isNumericToken(token)).length;
    const probablyRangeTail =
      leftNumericCount >= 2 ||
      (leftTokens.length >= 2 && DASH_TOKEN_PATTERN.test(leftTokens[leftTokens.length - 1])) ||
      /(?:\d+\s*[-–]\s*$)/.test(markerAndValue[1]);

    if (!probablyRangeTail) {
      const markerName = applyProfileMarkerFixes(cleanMarkerName(markerAndValue[1]));
      const value = safeNumber(markerAndValue[2]);
      if (value !== null && !looksLikeNoiseMarker(markerName)) {
        const parsedReference = extractReferenceAndUnit(nextLine);
        if (parsedReference.referenceMin !== null || parsedReference.referenceMax !== null || parsedReference.unit) {
          return {
            markerName,
            value,
            unit: parsedReference.unit,
            referenceMin: parsedReference.referenceMin,
            referenceMax: parsedReference.referenceMax,
            confidence: 0.64
          };
        }
      }
    }
  }

  if (/\d/.test(line)) {
    return null;
  }

  const markerName = applyProfileMarkerFixes(cleanMarkerName(line));
  if (looksLikeNoiseMarker(markerName)) {
    return null;
  }

  const compactNext = cleanWhitespace(nextLine);
  const normalizedNext = compactNext.replace(
    /^(?:result(?:\s+(?:normal|high|low))?|normal|abnormal|in\s+range|out\s+of\s+range|value)\s+/i,
    ""
  );
  const directNext = parseSingleRow(`${markerName} ${normalizedNext}`, 0.64, profile);
  if (directNext) {
    return directNext;
  }

  const nextMatch = normalizedNext.match(
    /^([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)(?:\s+(H|L|HIGH|LOW|Within(?:\s+range)?|Above(?:\s+range)?|Below(?:\s+range)?))?\s*(.*)$/i
  );
  if (!nextMatch) {
    return null;
  }

  const value = safeNumber(nextMatch[1]);
  if (value === null) {
    return null;
  }

  const trailing = STATUS_TOKEN_PATTERN.test(nextMatch[2] ?? "")
    ? cleanWhitespace(nextMatch[3] ?? "")
    : cleanWhitespace(`${nextMatch[2] ?? ""} ${nextMatch[3] ?? ""}`);
  const parsedReference = extractReferenceAndUnit(trailing);

  if (parsedReference.referenceMin === null && parsedReference.referenceMax === null && !parsedReference.unit) {
    return null;
  }

  return {
    markerName,
    value,
    unit: parsedReference.unit,
    referenceMin: parsedReference.referenceMin,
    referenceMax: parsedReference.referenceMax,
    confidence: 0.62
  };
};

const parseLineRows = (text: string, profile: ParserProfile): ParsedFallbackRow[] => {
  const lines = text
    .split("\n")
    .map((line) => cleanWhitespace(line))
    .filter(Boolean);
  const rows: ParsedFallbackRow[] = [];
  const consumed = new Set<number>();

  for (let index = 0; index < lines.length; index += 1) {
    if (consumed.has(index)) {
      continue;
    }
    const line = lines[index];
    if (looksLikeNonResultLine(line)) {
      continue;
    }
    if (profile.lineNoisePattern?.test(line)) {
      continue;
    }

    const direct = parseSingleRow(line, 0.68, profile);
    if (direct && shouldKeepParsedRow(direct, profile)) {
      rows.push(direct);
      continue;
    }

    const nextLine = lines[index + 1];
    if (!nextLine) {
      continue;
    }

    const twoLine = parseTwoLineRow(line, nextLine, profile);
    if (twoLine && shouldKeepParsedRow(twoLine, profile)) {
      rows.push(twoLine);
      consumed.add(index + 1);
    }
  }

  return rows;
};

const parseColumnRows = (text: string, profile: ParserProfile): ParsedFallbackRow[] => {
  const rows: ParsedFallbackRow[] = [];
  const lines = text
    .split("\n")
    .map((line) => line.replace(/\u00a0/g, " ").trim())
    .filter(Boolean);

  for (const rawLine of lines) {
    const columns = rawLine.split(/\s{2,}/).map((column) => cleanWhitespace(column)).filter(Boolean);
    if (columns.length < 2) {
      continue;
    }

    const merged = cleanWhitespace(`${columns[0]} ${columns.slice(1).join(" ")}`);
    const parsed = parseSingleRow(merged, 0.74, profile);
    if (parsed && shouldKeepParsedRow(parsed, profile)) {
      rows.push(parsed);
    }
  }

  return rows;
};

const parseIndexedRows = (text: string, profile: ParserProfile): ParsedFallbackRow[] => {
  const normalized = cleanWhitespace(text);
  const rows: ParsedFallbackRow[] = [];
  const rowPattern = /\b\d{1,3}\/\d{2,3}\s+A?\s+([\s\S]*?)(?=\b\d{1,3}\/\d{2,3}\s+A?\s+|$)/g;

  for (const match of normalized.matchAll(rowPattern)) {
    const row = parseSingleRow(match[1], 0.72, profile);
    if (row) {
      rows.push(row);
    }
  }

  return rows;
};

const parseLooseRows = (text: string, profile: ParserProfile): ParsedFallbackRow[] => {
  const normalized = cleanWhitespace(text);
  const rows: ParsedFallbackRow[] = [];

  const rowPattern =
    /([A-Za-zÀ-ž][A-Za-zÀ-ž0-9(),.%+\-/ ]{2,120}?)\s+(?:[A-Z]{2,8}\s+)?(?:[ñò↑↓]\s+)?([<>]?\d+(?:[.,]\d+)?)\s+([A-Za-z%µμ/][A-Za-z%µμ/0-9.\-²]*)\s+(?:-\s*(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)|([<>≤≥])\s*(\d+(?:[.,]\d+)?))/g;

  for (const match of normalized.matchAll(rowPattern)) {
    const markerName = applyProfileMarkerFixes(cleanMarkerName(match[1]));
    if (looksLikeNoiseMarker(markerName)) {
      continue;
    }

    const value = safeNumber(match[2]);
    if (value === null) {
      continue;
    }

    const unit = normalizeUnit(match[3]);

    let referenceMin: number | null = null;
    let referenceMax: number | null = null;

    if (match[4] && match[5]) {
      referenceMin = safeNumber(match[4]);
      referenceMax = safeNumber(match[5]);
    }

    if (match[6] && match[7]) {
      const bound = safeNumber(match[7]);
      if (bound !== null) {
        if (match[6] === "<" || match[6] === "≤") {
          referenceMax = bound;
        } else {
          referenceMin = bound;
        }
      }
    }

    const row: ParsedFallbackRow = {
      markerName,
      value,
      unit,
      referenceMin,
      referenceMax,
      confidence: 0.58
    };

    if (!shouldKeepParsedRow(row, profile)) {
      continue;
    }

    rows.push(row);
  }

  return rows;
};

const dedupeRows = (rows: ParsedFallbackRow[]): MarkerValue[] => {
  const byKey = new Map<string, MarkerValue>();

  for (const row of rows) {
    const canonicalMarker = canonicalizeMarker(row.markerName);
    const normalized = normalizeMarkerMeasurement({
      canonicalMarker,
      value: row.value,
      unit: row.unit,
      referenceMin: row.referenceMin,
      referenceMax: row.referenceMax
    });
    const confidence = IMPORTANT_MARKERS.has(canonicalMarker)
      ? Math.min(1, row.confidence + 0.12)
      : row.confidence;

    const markerRecord: MarkerValue = {
      id: createId(),
      marker: row.markerName,
      canonicalMarker,
      value: normalized.value,
      unit: normalized.unit,
      referenceMin: normalized.referenceMin,
      referenceMax: normalized.referenceMax,
      abnormal: deriveAbnormalFlag(normalized.value, normalized.referenceMin, normalized.referenceMax),
      confidence
    };

    const key = [
      canonicalMarker,
      markerRecord.value,
      markerRecord.unit,
      markerRecord.referenceMin ?? "",
      markerRecord.referenceMax ?? ""
    ].join("|");

    const existing = byKey.get(key);
    if (!existing || markerRecord.confidence > existing.confidence) {
      byKey.set(key, markerRecord);
    }
  }

  return Array.from(byKey.values());
};

const mergeMarkerSets = (primary: MarkerValue[], secondary: MarkerValue[]): MarkerValue[] => {
  const byKey = new Map<string, MarkerValue>();

  const upsert = (marker: MarkerValue) => {
    const key = [
      marker.canonicalMarker,
      marker.value,
      marker.unit,
      marker.referenceMin ?? "",
      marker.referenceMax ?? ""
    ].join("|");
    const existing = byKey.get(key);
    if (!existing || marker.confidence > existing.confidence) {
      byKey.set(key, marker);
    }
  };

  primary.forEach(upsert);
  secondary.forEach(upsert);

  return Array.from(byKey.values());
};

const fallbackExtract = (text: string, fileName: string): ExtractionDraft => {
  const profile = detectParserProfile(text, fileName);
  const columnRows = parseColumnRows(text, profile);
  const lineRows = parseLineRows(text, profile);
  const indexedRows = parseIndexedRows(text, profile);
  const looseRows = lineRows.length + columnRows.length < 6 ? parseLooseRows(text, profile) : [];
  const huisartsRows = profile.enableKeywordRangeParser ? parseMijnGezondheidRows(text) : [];

  const combinedRows =
    indexedRows.length > 0
      ? [...columnRows, ...lineRows, ...indexedRows, ...looseRows, ...huisartsRows]
      : [...columnRows, ...lineRows, ...looseRows, ...huisartsRows];
  const markers = dedupeRows(combinedRows);

  const averageConfidence =
    markers.length > 0 ? markers.reduce((sum, marker) => sum + marker.confidence, 0) / markers.length : 0;
  const unitCoverage = markers.length > 0 ? markers.filter((marker) => marker.unit).length / markers.length : 0;
  const confidence = markers.length > 0 ? Math.min(0.9, averageConfidence * 0.8 + unitCoverage * 0.2) : 0.1;

  return {
    sourceFileName: fileName,
    testDate: extractDateCandidate(text),
    markers,
    extraction: {
      provider: "fallback",
      model: `fallback-layered:${profile.id}`,
      confidence,
      needsReview: confidence < 0.7 || markers.length === 0 || unitCoverage < 0.7
    }
  };
};

const meetsQualityThreshold = (draft: ExtractionDraft): boolean => {
  const hasEnoughMarkers = draft.markers.length >= 5;
  const hasConfidence = draft.extraction.confidence >= 0.65;
  const primaryMatches = new Set(
    draft.markers
      .map((marker) => marker.canonicalMarker)
      .filter((canonical) => (PRIMARY_MARKERS as readonly string[]).includes(canonical))
  ).size;
  const hasPrimaryCoverage = primaryMatches >= 2;
  const todayIso = new Date().toISOString().slice(0, 10);
  const hasValidDate = /^\d{4}-\d{2}-\d{2}$/.test(draft.testDate) && draft.testDate !== todayIso;
  return hasEnoughMarkers && hasConfidence && hasPrimaryCoverage && hasValidDate;
};

const callClaudeExtraction = async (
  pdfText: string,
  fileName: string,
  fallbackDraft: ExtractionDraft
): Promise<ExtractionDraft> => {
  const prompt = [
    "Extract blood lab data from the text below.",
    "Return ONLY valid JSON in this exact shape:",
    '{"testDate":"YYYY-MM-DD","markers":[{"marker":"string","value":0,"unit":"string","referenceMin":null,"referenceMax":null,"confidence":0.0}]}',
    "Rules:",
    "- Include one marker object per result line.",
    "- Keep values numeric only.",
    "- If reference range missing, use null.",
    "- confidence is 0.0 to 1.0 per row.",
    "- Detect sample collection date, not report print date.",
    "- Do not include explanations.",
    `Source filename: ${fileName}`,
    "LAB TEXT START",
    pdfText,
    "LAB TEXT END"
  ].join("\n");

  const tryModel = async (
    model: string
  ): Promise<{
    status: number;
    body: ClaudeResponse;
  }> => {
    let response: Response;
    try {
      response = await fetch("/api/claude/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          requestType: "extraction",
          payload: {
            model,
            max_tokens: 1800,
            messages: [{ role: "user", content: prompt }]
          }
        })
      });
    } catch {
      throw new Error("PROXY_UNREACHABLE");
    }

    const text = await response.text();
    let body: ClaudeResponse = {};
    try {
      body = text ? (JSON.parse(text) as ClaudeResponse) : {};
    } catch {
      body = {};
    }
    return { status: response.status, body };
  };

  let body: ClaudeResponse | null = null;
  let selectedModel = "unknown";
  let lastStatus = 0;
  let lastErrorMessage = "";

  for (const model of EXTRACTION_MODEL_CANDIDATES) {
    let result: { status: number; body: ClaudeResponse };
    try {
      result = await tryModel(model);
    } catch (error) {
      if (error instanceof Error && error.message === "PROXY_UNREACHABLE") {
        throw new Error("PDF_PROXY_UNREACHABLE");
      }
      throw error;
    }

    lastStatus = result.status;
    if (result.status >= 200 && result.status < 300) {
      body = result.body;
      selectedModel = model;
      break;
    }

    const errorMessage = result.body.error?.message ?? "";
    if (result.status === 429) {
      const retryAfterRaw = (result.body as { retryAfter?: number })?.retryAfter;
      const retryAfter = typeof retryAfterRaw === "number" && Number.isFinite(retryAfterRaw) ? Math.max(1, Math.round(retryAfterRaw)) : 0;
      throw new Error(`PDF_RATE_LIMITED:${retryAfter}`);
    }
    lastErrorMessage = errorMessage;
    const missingModel = result.status === 404 || (result.status === 400 && /model/i.test(errorMessage));
    if (missingModel) {
      continue;
    }
    throw new Error(`PDF_EXTRACTION_FAILED:${result.status}:${errorMessage || ""}`);
  }

  if (!body) {
    throw new Error(`PDF_EXTRACTION_FAILED:${lastStatus}:${lastErrorMessage || ""}`);
  }

  const textContent = body.content?.find((block) => block.type === "text")?.text;
  if (!textContent) {
    throw new Error("PDF_EMPTY_RESPONSE");
  }

  const json = extractJsonBlock(textContent);
  if (!json) {
    throw new Error("Could not find JSON block in Claude response");
  }

  const parsed = JSON.parse(json) as ClaudeExtraction;
  const rawMarkers = Array.isArray(parsed.markers) ? parsed.markers : [];
  const claudeMarkers = rawMarkers.map(normalizeMarker).filter((row): row is MarkerValue => Boolean(row));
  const markers = mergeMarkerSets(claudeMarkers, fallbackDraft.markers);

  const confidence =
    markers.length > 0
      ? markers.reduce((sum, row) => sum + row.confidence, 0) / Math.max(markers.length, 1)
      : 0;

  return {
    sourceFileName: fileName,
    testDate:
      parsed.testDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.testDate)
        ? parsed.testDate
        : fallbackDraft.testDate,
    markers,
    extraction: {
      provider: "claude",
      model: `${selectedModel}+fallback-merge`,
      confidence,
      needsReview: confidence < 0.65 || markers.length === 0
    }
  };
};

export const extractLabData = async (file: File): Promise<ExtractionDraft> => {
  const pdfText = await extractPdfText(file);
  const fallbackDraft = fallbackExtract(pdfText, file.name);

  if (meetsQualityThreshold(fallbackDraft)) {
    return {
      ...fallbackDraft,
      extraction: {
        ...fallbackDraft.extraction,
        provider: "fallback",
        needsReview: true
      }
    };
  }

  try {
    return await callClaudeExtraction(pdfText, file.name, fallbackDraft);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PDF_RATE_LIMITED")) {
      const retryAfter = Number(error.message.split(":")[1] ?? "0");
      const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 0;
      // Keep extraction resilient for users: when throttled, continue with local parser.
      console.warn(`Claude extraction rate-limited; falling back to local parser${seconds ? ` for ~${seconds}s` : ""}.`);
    }
    return fallbackDraft;
  }
};

export const __pdfParsingInternals = {
  detectParserProfile,
  extractDateCandidate,
  parseSingleRow,
  parseTwoLineRow,
  parseLineRows,
  parseColumnRows,
  fallbackExtract
};
