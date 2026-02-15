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

const extractPdfText = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const chunks: string[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const text = await page.getTextContent();
    const pageText = text.items
      .map((item) => {
        const textItem = item as { str?: string };
        return textItem.str ?? "";
      })
      .join(" ");
    chunks.push(pageText);
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
    .replace(/ng\s*\/\s*ml/gi, "ng/mL")
    .replace(/ng\s*\/\s*dl/gi, "ng/dL")
    .replace(/pg\s*\/\s*ml/gi, "pg/mL");
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
  if (/^ng\/ml$/i.test(compact)) {
    return "ng/mL";
  }
  if (/^ng\/dl$/i.test(compact)) {
    return "ng/dL";
  }
  if (/^µmol\/l$/i.test(compact)) {
    return "µmol/L";
  }
  if (/^µg\/l$/i.test(compact)) {
    return "µg/L";
  }
  if (/^g\/l$/i.test(compact)) {
    return "g/L";
  }
  if (/^g\/dl$/i.test(compact)) {
    return "g/dL";
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

  return /^(?:mmol|nmol|pmol|pg|ng|mU|mIU|U|mg|g|µg|µmol|fL|fl|fmol|ratio|l\/l)$/i.test(token);
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

const collectAllDates = (text: string): string[] => {
  const result: string[] = [];

  const ymdMatches = text.matchAll(/\b(20\d{2})[./-](0?[1-9]|1[0-2])[./-](0?[1-9]|[12]\d|3[01])\b/g);
  for (const match of ymdMatches) {
    const iso = toIsoYmd(match[1], match[2], match[3]);
    if (iso) {
      result.push(iso);
    }
  }

  const dateMatches = text.matchAll(/\b([0-3]?\d)[./-]([01]?\d)[./-](\d{2,4})\b/g);

  for (const match of dateMatches) {
    const iso = toIsoDate(match[1], match[2], match[3]);
    if (iso) {
      result.push(iso);
    }
  }

  return result;
};

const extractDateCandidate = (text: string): string => {
  const normalized = cleanWhitespace(text);

  // MijnGezondheid reports often include two timeline dates in one line (e.g. 2023-05-02 2025-11-12)
  // while the listed "Uw waarde" reflects the most recent measurement.
  if (/\bdatum\s*:/i.test(normalized)) {
    const timelineDates = collectAllDates(normalized)
      .filter((value) => value >= "2000-01-01")
      .sort();
    if (timelineDates.length >= 2) {
      return timelineDates[timelineDates.length - 1];
    }
  }

  const priorityPatterns = [
    /(?:sample\s*draw|monster\s*afname|monster\s*afname:|afname|sample\s*collection|collection\s*date)[^0-9]{0,40}([0-3]?\d)[./-]([01]?\d)[./-](\d{2,4})/i,
    /(?:arrival\s*date,?\s*time|arrival\s*date|materiaal\s*ontvangst|ontvangst)[^0-9]{0,40}([0-3]?\d)[./-]([01]?\d)[./-](\d{2,4})/i
  ];

  for (const pattern of priorityPatterns) {
    const found = extractDateByPattern(normalized, pattern);
    if (found) {
      return found;
    }
  }

  const allDates = collectAllDates(normalized)
    .filter((value) => value >= "2000-01-01")
    .sort();
  if (allDates.length > 0) {
    return allDates[0];
  }

  const iso = normalized.match(/\b(20\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b/);
  if (iso?.[0]) {
    return iso[0].replace(/[/.]/g, "-");
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
    const markerName = cleanMarkerName(match[1]);
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

const looksLikeNoiseMarker = (marker: string): boolean => {
  if (!marker || marker.length < 2) {
    return true;
  }

  return /^(?:testing report|first name|arrival date|request complete|resultaat nummer|rapport|pagina|receiver|email|phone|fax|validated|end of report)\b/i.test(
    marker
  );
};

const parseSingleRow = (rawRow: string, confidence: number): ParsedFallbackRow | null => {
  const cleanedRow = cleanWhitespace(rawRow);
  if (!cleanedRow) {
    return null;
  }

  const baseMatch = cleanedRow.match(/^(.+?)\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)(?:\s+|$)(.*)$/);
  if (!baseMatch) {
    return null;
  }

  let markerName = cleanMarkerName(baseMatch[1]);
  if (looksLikeNoiseMarker(markerName)) {
    return null;
  }

  const value = safeNumber(baseMatch[2].replace(/\s+/g, ""));
  if (value === null) {
    return null;
  }

  const rest = cleanWhitespace(baseMatch[3] ?? "");
  let referenceMin: number | null = null;
  let referenceMax: number | null = null;
  let unit = "";

  const rangeMatch = rest.match(/(?:^|\s)(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)(?:\s+([A-Za-z%µμ/][A-Za-z0-9%µμ/.\-²]*))?/i);
  if (rangeMatch) {
    referenceMin = safeNumber(rangeMatch[1]);
    referenceMax = safeNumber(rangeMatch[2]);
    if (rangeMatch[3]) {
      unit = normalizeUnit(rangeMatch[3]);
    }
  }

  const upperMatch = rest.match(/(?:^|\s)(?:<|≤)\s*(-?\d+(?:[.,]\d+)?)(?:\s+([A-Za-z%µμ/][A-Za-z0-9%µμ/.\-²]*))?/i);
  if (upperMatch && referenceMax === null) {
    referenceMax = safeNumber(upperMatch[1]);
    if (!unit && upperMatch[2]) {
      unit = normalizeUnit(upperMatch[2]);
    }
  }

  const lowerMatch = rest.match(/(?:^|\s)(?:>|≥)\s*(-?\d+(?:[.,]\d+)?)(?:\s+([A-Za-z%µμ/][A-Za-z0-9%µμ/.\-²]*))?/i);
  if (lowerMatch && referenceMin === null) {
    referenceMin = safeNumber(lowerMatch[1]);
    if (!unit && lowerMatch[2]) {
      unit = normalizeUnit(lowerMatch[2]);
    }
  }

  if (!unit) {
    const unitToken = rest
      .split(" ")
      .map((token) => token.trim())
      .find((token) => isLikelyUnit(token));
    if (unitToken) {
      unit = normalizeUnit(unitToken);
    }
  }

  return {
    markerName,
    value,
    unit,
    referenceMin,
    referenceMax,
    confidence
  };
};

const parseIndexedRows = (text: string): ParsedFallbackRow[] => {
  const normalized = cleanWhitespace(text);
  const rows: ParsedFallbackRow[] = [];
  const rowPattern = /\b\d{1,3}\/\d{2,3}\s+A?\s+([\s\S]*?)(?=\b\d{1,3}\/\d{2,3}\s+A?\s+|$)/g;

  for (const match of normalized.matchAll(rowPattern)) {
    const row = parseSingleRow(match[1], 0.72);
    if (row) {
      rows.push(row);
    }
  }

  return rows;
};

const parseLooseRows = (text: string): ParsedFallbackRow[] => {
  const normalized = cleanWhitespace(text);
  const rows: ParsedFallbackRow[] = [];

  const rowPattern =
    /([A-Za-zÀ-ž][A-Za-zÀ-ž0-9(),.%+\-/ ]{2,120}?)\s+(?:[A-Z]{2,8}\s+)?(?:[ñò↑↓]\s+)?([<>]?\d+(?:[.,]\d+)?)\s+([A-Za-z%µμ/0-9.\-²]+)\s+(?:-\s*(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)|([<>≤≥])\s*(\d+(?:[.,]\d+)?))/g;

  for (const match of normalized.matchAll(rowPattern)) {
    const markerName = cleanMarkerName(match[1]);
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

    rows.push({
      markerName,
      value,
      unit,
      referenceMin,
      referenceMax,
      confidence: 0.58
    });
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
  const indexedRows = parseIndexedRows(text);
  const looseRows = parseLooseRows(text);
  const huisartsRows = parseMijnGezondheidRows(text);

  const combinedRows = indexedRows.length > 0 ? [...indexedRows, ...looseRows, ...huisartsRows] : [...looseRows, ...huisartsRows];
  const markers = dedupeRows(combinedRows);

  const confidence =
    markers.length > 0
      ? Math.min(0.82, markers.reduce((sum, marker) => sum + marker.confidence, 0) / markers.length)
      : 0.1;

  return {
    sourceFileName: fileName,
    testDate: extractDateCandidate(text),
    markers,
    extraction: {
      provider: "fallback",
      model: "regex-indexed+keyword-fallback",
      confidence,
      needsReview: confidence < 0.7 || markers.length === 0
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
