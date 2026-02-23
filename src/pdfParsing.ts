import * as pdfjsLib from "pdfjs-dist";
import * as Tesseract from "tesseract.js";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import tesseractWorker from "tesseract.js/dist/worker.min.js?url";
import tesseractCore from "tesseract.js-core/tesseract-core.wasm.js?url";
import { PRIMARY_MARKERS } from "./constants";
import {
  AIConsentDecision,
  AICostMode,
  ExtractionAIReason,
  ExtractionDebugInfo,
  ExtractionDraft,
  ExtractionRoute,
  ExtractionWarningCode,
  ParserUncertaintyAssessment,
  MarkerValue,
  ParserStage,
  ParserDebugMode
} from "./types";
import {
  resolveCanonicalMarker,
  setMarkerAliasOverrides
} from "./markerNormalization";
import { canonicalizeMarker, normalizeMarkerMeasurement } from "./unitConversion";
import { createId, deriveAbnormalFlag, safeNumber } from "./utils";
import { sanitizeParserTextForAI } from "./privacy/sanitizeForAI";

(pdfjsLib as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc =
  pdfWorker;

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

interface GeminiExtractionResponse {
  model?: string;
  testDate?: string;
  markers?: RawMarker[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  cacheHit?: boolean;
  error?: {
    code?: string;
    message?: string;
    detail?: string;
  };
}

interface ExtractLabDataOptions {
  costMode?: AICostMode;
  aiAutoImproveEnabled?: boolean;
  forceAi?: boolean;
  preferAiResultWhenForced?: boolean;
  externalAiAllowed?: boolean;
  parserDebugMode?: ParserDebugMode;
  markerAliasOverrides?: Record<string, string>;
  aiConsent?: AIConsentDecision | null;
  onStageChange?: (stage: ParserStage) => void;
}

interface GeminiRequestOptions {
  mode: "text_only" | "pdf_rescue";
  fileHash: string;
  traceId: string;
  allowPdfAttachment?: boolean;
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

interface PdfSpatialItem {
  x: number;
  text: string;
}

interface PdfSpatialRow {
  page: number;
  y: number;
  items: PdfSpatialItem[];
}

interface PdfTextExtractionResult {
  text: string;
  pageCount: number;
  textItemCount: number;
  lineCount: number;
  nonWhitespaceChars: number;
  spatialRows: PdfSpatialRow[];
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
  /^(?:nuchter|hematology|clinical chemistry|general chemistry|hormones|vitamins|tumor markers|tumour markers|cardial markers|lipids|muscle enzymes|random urine chemistry|urine \(micro\)albumin|adrenal function|reproductive and gonadal|serum proteins|hemoglobin a1c|haemoglobin a1c|differential|hematologie|klinische chemie|proteine-diagnostiek|endocrinologie|schildklier-diagnostiek|bloedbeeld klein|hematologie bloedbeeld klein)\s+/i;
const INDEXED_ROW_PREFIX_PATTERN = /^\d{1,3}\/\d{2,3}\s+A?\s+/i;
const METHOD_SUFFIX_PATTERN = /\b(?:ECLIA|PHOT|ENZ|NEPH|ISSAM)\b$/i;
const UNIT_TOKEN_PATTERN = /^(?:10(?:\^|\*|x|×)?(?:9|12)\/l|[A-Za-z%µμ/][A-Za-z0-9%µμ/.*^\-²]*)$/i;
const STRICT_NUMERIC_TOKEN_PATTERN = /^[<>≤≥]?\s*[+-]?\d+(?:[.,]\d+)?$/;
const LEADING_UNIT_FRAGMENT_PATTERN =
  /^(?:mmol|nmol|pmol|pg|ng|g|mg|µmol|umol|u|mu|miu|fl|fmol|l)\s*\/\s*[a-z0-9µμ%]+\s*/i;
const IMPORTANT_MARKERS = new Set([
  "Testosterone",
  "Free Testosterone",
  "Estradiol",
  "Hematocrit",
  "SHBG"
]);
const DATE_CONTEXT_HINT_PATTERN =
  /\b(?:sample\s*(?:draw|collection|date)|collection\s*times?|date\s*collected|collected|afname(?:datum)?|monster\s*afname|materiaal\s*afname|sample\s*taken)\b/i;
const RECEIPT_CONTEXT_HINT_PATTERN = /\b(?:arrival|received|ontvangst|materiaal\s*ontvangst)\b/i;
const REPORT_CONTEXT_HINT_PATTERN =
  /\b(?:report\s*date|print\s*date|datum\s*afdruk|issued|validated|result\s*date)\b/i;
const STATUS_TOKEN_PATTERN = /^(?:H|L|HIGH|LOW|Within(?:\s+range)?|Above(?:\s+range)?|Below(?:\s+range)?)$/i;
const DASH_TOKEN_PATTERN = /^[-–]$/;
const HORMONE_SIGNAL_PATTERN =
  /\b(?:testosterone|testosteron|free\s+testosterone|estradiol|shbg|dht|dihydrotestosterone|fsh|lh|hormone)\b/i;
const MARKER_ANCHOR_PATTERN =
  /\b(?:testosterone|testosteron|estradiol|shbg|hematocrit|hematocriet|lh|fsh|prolactin|prolactine|psa|tsh|cholesterol|hdl|ldl|non hdl|triglycerides?|triglyceriden|creatinine|urine creatinine|glucose|hemoglobine|hemoglobin|hematology|albumine|albumin|mchc|mch|mcv|wbc|platelets?|thrombocyten|leukocyten|leucocyten|lymphocytes?|eosinophils?|basophils?|neutrophils?|monocytes?|free androgen index|dihydrotestosteron|dihydrotestosterone|vitamin b12|vitamine b12|urea|ureum|uric acid|calcium|bilirubin|alkaline phosphatase|gamma gt|alt|ast|ferritin|ferritine|egfr|ck|ckd-epi|acr|cortisol|dhea|dhea sulphate|dhea sulfate|sex hormone binding globulin|c reactive protein|crp|igf-?1(?:\s*sds)?|somatomedine|homocysteine|transferrine|transferrin|transferrine saturatie|transferrin saturation|ijzer|iron)\b/i;
const COMMENTARY_FRAGMENT_PATTERN =
  /\b(?:for intermediate and high risk individuals|low risk individuals|please interpret results with caution|if dexamethasone has been given|for further information please contact|new method effective|shown to interfere|changes in serial psa levels|this high sensitivity crp method is sensitive to|in presence of significant hypoalbuminemia|is suitable for coronary artery disease assessment)\b/i;
const GUIDANCE_RESULT_PATTERN =
  /\b(?:for\s+(?:intermediate|high|low)\s+risk\s+individuals|individuals?\s+with\s+ldl\s+cholesterol|if\s+dexamethasone\s+has\s+been\s+given|this\s+high\s+sensitivity\s+crp\s+method\s+is\s+sensitive\s+to|for\s+further\s+information\s+please\s+contact)\b/i;
const COMMENTARY_GUARD_PATTERN =
  /\b(?:high\s+risk\s+individuals?|low\s+risk\s+individuals?|sensitive\s+to|for\s+further\s+information|target\s+reduction|please\s+interpret|new\s+method\s+effective)\b/i;
const HISTORY_CALCULATOR_NOISE_PATTERN =
  /\b(?:balance\s*my\s*hormones|tru-?t\.org|issam|free-?testosterone-?calculator|free\s+testosterone\s*-\s*calculated|known\s+labcorp\s+unit\s+issue|labcorp\s+test|international\s+society\s+for\s+the\s+study\s+of\s+the\s+aging\s+male|roche\s*cobas\s*assay|calculated\s+value)\b|https?:\/\/|www\./i;
const SPATIAL_PRIORITY_MARKER_PATTERN =
  /\b(?:testosterone|testosteron|free\s+testosterone|bioavailable\s+testosterone|estradiol|oestradiol|shbg|hematocrit|hematocriet|haemoglobin|hemoglobin|rbc|wbc|platelets?|neutrophils?|lymphocytes?|monocytes?|eosinophils?|basophils?|lh|fsh|dht|dihydrotestosterone|prolactin|progesterone|psa|tsh|t3|t4|glucose|creatinine|egfr|bilirubin|alkaline\s+phosphatase|alt|ast|ggt|albumin|globulin|protein|cholesterol|hdl|ldl|triglycerides?|ferritin|transferrin|iron|vitamin\s*d|dhea|igf-?1)\b/i;
const SINGLE_TOKEN_MARKER_STOPWORDS = new Set([
  "is",
  "to",
  "for",
  "with",
  "and",
  "of",
  "this",
  "that",
  "method",
  "interpretation",
  "new",
  "volume"
]);
const SHORT_MARKER_ALLOWLIST = new Set([
  "WBC",
  "RBC",
  "MCV",
  "MCH",
  "MCHC",
  "RDW",
  "ALT",
  "AST",
  "CK",
  "PSA",
  "TSH",
  "LH",
  "FSH",
  "DHT",
  "CRP"
]);
const EDGE_NOISE_TOKEN_BLOCKLIST = new Set([
  "ref",
  "range",
  "result",
  "results",
  "value",
  "values",
  "lab",
  "labs",
  "nz",
  "us",
  "usa",
  "boa",
  "dv",
  "tet",
  "tfl",
  "oe",
  "wee",
  "il",
  "l",
  "r"
]);
const EDGE_NOISE_TOKEN_ALLOWLIST = new Set([
  ...Array.from(SHORT_MARKER_ALLOWLIST),
  "SHBG",
  "GGT",
  "A/G",
  "T3",
  "T4",
  "E2",
  "IGF-1",
  "BUN",
  "EGFR",
  "HBA1C",
  "MPV"
]);
const ALLOWED_RATIO_MARKER_PATTERN =
  /\b(?:chol(?:esterol)?\s*\/\s*h(?:dl|dh)|ldl\s*\/\s*hdl|a\/g|albumin\s*\/\s*globulin|free androgen index)\b/i;
const HISTORY_CANONICAL_COLLAPSE_UNITS: Record<string, string[]> = {
  Testosterone: ["nmol/L", "ng/dL", "ng/mL"],
  "Free Testosterone": ["pmol/L", "pg/mL", "ng/dL", "nmol/L"],
  "Bioavailable Testosterone": ["nmol/L", "ng/dL", "pg/mL", "%"],
  SHBG: ["nmol/L"],
  "Dihydrotestosteron (DHT)": ["ng/dL", "nmol/L", "pg/mL", "pmol/L", "µg/dL"],
  FSH: ["mIU/mL", "IU/L", "U/L", "mU/L"],
  LH: ["mIU/mL", "IU/L", "U/L", "mU/L"]
};

const MARKER_CONTINUATION_SUFFIX_PATTERN = /\b(?:volume|distribution(?:\s+width)?|width|count|ratio|index|percentage)\b/i;

const shouldAppendContinuationToPreviousMarker = (continuationLine: string, previousMarkerName: string): boolean => {
  const continuation = cleanWhitespace(continuationLine).toLowerCase();
  const previous = cleanWhitespace(previousMarkerName).toLowerCase();

  // Safe, explicit case: MPV split over two lines -> "MPV-Mean Platelet" + "Volume".
  if (continuation === "volume" && /mpv-mean platelet$/.test(previous)) {
    return true;
  }
  // Safe, explicit case: Vitamin D marker suffix split to next line.
  if (continuation === "(d3+d2)" && /25-oh-?\s+vitamin\s+d$/i.test(previous)) {
    return true;
  }

  return false;
};
const LIFELABS_TABLE_HEADER_PATTERN = /\bTest\s+Flag\s+Result\s+Reference\s+Range\s*-\s*Units\b/i;
const LIFELABS_TABLE_END_PATTERN =
  /^(?:FINAL RESULTS|This report contains confidential information intended for view|Note to physicians:|Note to patients:)\b/i;
const LIFELABS_CONTINUATION_PATTERN =
  /^(?:for|if|this|that|see|indicates|therapeutic|units for|kidney function|assumption|clinical state|accuracy|adults?:|children:|persistently|target reduction|new method|changes in serial|interpretation:|no reference range|a1c\s*[<>]=?)\b/i;
type MarkerCandidateSource = "fallback" | "claude";
const OCR_LANGS = "eng+nld";
const OCR_MAX_PAGES = 12;
const OCR_RENDER_SCALE = 2;
const OCR_RETRY_RENDER_SCALE = 1.4;
const OCR_REMOTE_WORKER_PATH = "https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/worker.min.js";
const OCR_REMOTE_CORE_PATH = "https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/tesseract-core.wasm.js";
const OCR_REMOTE_TESSERACT_BUNDLE = "https://cdn.jsdelivr.net/npm/tesseract.js@v7.0.0/dist/tesseract.min.js";
const OCR_REMOTE_LANG_PATH = "https://tessdata.projectnaptha.com/4.0.0";
const OCR_REMOTE_LANG_PATH_ALT = "https://cdn.jsdelivr.net/npm/@tesseract.js-data";
const OCR_MAX_INIT_ATTEMPTS = 2;
const OCR_INIT_BACKOFF_MS = 250;
const OCR_PAGE_TIMEOUT_MS = 15_000;
const OCR_TOTAL_TIMEOUT_MS = 75_000;
const OCR_LANG_FALLBACK = "eng";
const LOCAL_AI_EXTRACTION_CACHE_KEY = "labtracker_ai_extraction_cache_v1";
const LOCAL_AI_EXTRACTION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LOCAL_AI_EXTRACTION_CACHE_MAX_ENTRIES = 30;
const MAX_PDF_RESCUE_BYTES = 7_000_000;
const GEMINI_MODEL_CANDIDATES = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash"
] as const;
const SPATIAL_ROW_Y_GROUP_TOLERANCE = 2;
const SPATIAL_CLUSTER_GAP = 42;
const SPATIAL_COLUMN_BAND_WIDTH = 120;

interface OcrResult {
  text: string;
  used: boolean;
  pagesAttempted: number;
  pagesSucceeded: number;
  pagesFailed: number;
  initFailed: boolean;
  timedOut: boolean;
}

interface DedupeDiagnostics {
  parsedRowCount: number;
  keptRows: number;
  rejectedRows: number;
  topRejectReasons: Record<string, number>;
}

interface FallbackExtractOutcome {
  draft: ExtractionDraft;
  diagnostics: DedupeDiagnostics;
}
const DEFAULT_PROFILE: ParserProfile = {
  id: "adaptive",
  requireUnit: true,
  enableKeywordRangeParser: false,
  lineNoisePattern: /\b(?:patient details|requesting physician|clinical history|interpretation|notes?)\b/i
};

const extractPdfText = async (arrayBuffer: ArrayBuffer): Promise<PdfTextExtractionResult> => {
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const chunks: string[] = [];
  const spatialRows: PdfSpatialRow[] = [];
  let textItemCount = 0;
  let lineCount = 0;

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
      textItemCount += 1;

      const transform = Array.isArray(textItem.transform) ? textItem.transform : [];
      const x = typeof transform[4] === "number" ? transform[4] : 0;
      const y = typeof transform[5] === "number" ? transform[5] : 0;

      const existing = rows.find((row) => Math.abs(row.y - y) <= SPATIAL_ROW_Y_GROUP_TOLERANCE);
      if (existing) {
        existing.items.push({ x, text: lineText });
      } else {
        rows.push({ y, items: [{ x, text: lineText }] });
      }
    }

    const pageLines = rows
      .sort((a, b) => {
        if (Math.abs(b.y - a.y) > SPATIAL_ROW_Y_GROUP_TOLERANCE) {
          return b.y - a.y;
        }
        return (a.items[0]?.x ?? 0) - (b.items[0]?.x ?? 0);
      })
      .map((row) => {
        const orderedItems = [...row.items].sort((a, b) => a.x - b.x);
        spatialRows.push({
          page: pageNum,
          y: row.y,
          items: orderedItems.map((item) => ({ x: item.x, text: item.text }))
        });
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

    lineCount += pageLines.length;
    chunks.push(pageLines.join("\n"));
  }

  const mergedText = chunks.join("\n");
  return {
    text: mergedText,
    pageCount: doc.numPages,
    textItemCount,
    lineCount,
    nonWhitespaceChars: mergedText.replace(/\s+/g, "").length,
    spatialRows
  };
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

const isBrowserRuntime = (): boolean => typeof window !== "undefined" && typeof document !== "undefined";

const shouldUseOcrFallback = (textResult: PdfTextExtractionResult, fallbackDraft: ExtractionDraft): boolean => {
  const importantCoverage = new Set(
    fallbackDraft.markers
      .map((marker) => marker.canonicalMarker)
      .filter((canonical) => IMPORTANT_MARKERS.has(canonical))
  ).size;
  const historyLayoutSignal = looksLikeHistorySheetLayout(textResult.text);
  const complexMultiPageSignal =
    textResult.pageCount >= 3 && textResult.textItemCount >= textResult.pageCount * 120;
  const lowYieldForComplex = fallbackDraft.markers.length < Math.max(10, textResult.pageCount * 3);
  const veryLowYieldForComplex = fallbackDraft.markers.length < Math.max(8, textResult.pageCount * 2);
  const lowImportantCoverageForComplex = importantCoverage < Math.max(2, Math.min(4, textResult.pageCount));

  if (
    (historyLayoutSignal && fallbackDraft.markers.length < 12) ||
    (complexMultiPageSignal && (veryLowYieldForComplex || (lowYieldForComplex && lowImportantCoverageForComplex)))
  ) {
    return true;
  }

  const broadButLowCoverage = fallbackDraft.markers.length >= 5 && importantCoverage < 2;
  if (fallbackDraft.markers.length >= 6 && fallbackDraft.extraction.confidence >= 0.72 && !broadButLowCoverage) {
    return false;
  }

  const sparseTextLayer = textResult.textItemCount < Math.max(40, textResult.pageCount * 18);
  const sparseCharacters = textResult.nonWhitespaceChars < Math.max(260, textResult.pageCount * 120);
  const sparseLines = textResult.lineCount < Math.max(16, textResult.pageCount * 8);

  return sparseTextLayer || (sparseCharacters && sparseLines);
};

const countImportantCoverage = (markers: MarkerValue[]): number =>
  new Set(markers.map((marker) => marker.canonicalMarker).filter((canonical) => IMPORTANT_MARKERS.has(canonical))).size;

const scoreFallbackDraft = (draft: ExtractionDraft): number => {
  const unitCount = draft.markers.filter((marker) => marker.unit).length;
  const importantCoverage = countImportantCoverage(draft.markers);
  const noisyPenalty = draft.markers.length >= 5 && importantCoverage === 0 ? 6 : 0;
  return draft.markers.length * 2.5 + unitCount * 1.5 + importantCoverage * 4 + draft.extraction.confidence - noisyPenalty;
};

const chooseBetterFallbackDraft = (base: ExtractionDraft, candidate: ExtractionDraft): ExtractionDraft => {
  const baseScore = scoreFallbackDraft(base);
  const candidateScore = scoreFallbackDraft(candidate);

  return candidateScore > baseScore ? candidate : base;
};

interface LocalQualityMetrics {
  markerCount: number;
  unitCoverage: number;
  importantCoverage: number;
  confidence: number;
}

const getLocalQualityMetrics = (draft: ExtractionDraft): LocalQualityMetrics => {
  const markerCount = draft.markers.length;
  const unitCoverage = markerCount > 0 ? draft.markers.filter((marker) => marker.unit).length / markerCount : 0;
  const importantCoverage = countImportantCoverage(draft.markers);
  return {
    markerCount,
    unitCoverage,
    importantCoverage,
    confidence: draft.extraction.confidence
  };
};

const isLocalQualityHighEnough = (metrics: LocalQualityMetrics): boolean =>
  metrics.markerCount >= 14 && metrics.importantCoverage >= 2 && metrics.unitCoverage >= 0.7 && metrics.confidence >= 0.62;

const isLocalDraftGoodEnough = (draft: ExtractionDraft): boolean => {
  const markerCount = draft.markers.length;
  const importantCount = countImportantCoverage(draft.markers);
  const confidence = draft.extraction.confidence;

  if (markerCount >= 8 && confidence >= 0.65) {
    return true;
  }
  if (markerCount >= 6 && confidence >= 0.72 && importantCount >= 2) {
    return true;
  }
  if (markerCount >= 4 && confidence >= 0.8 && importantCount >= 2) {
    return true;
  }
  return false;
};

interface AutoPdfRescueDecision {
  shouldRescue: boolean;
  reason: string;
}

const shouldAutoPdfRescue = (params: {
  costMode: AICostMode;
  forceAi: boolean;
  localMetrics: LocalQualityMetrics;
  textItems: number;
  compactTextLength: number;
  ocrResult: OcrResult;
  aiTextOnlySucceeded: boolean;
}): AutoPdfRescueDecision => {
  if (params.aiTextOnlySucceeded) {
    return { shouldRescue: false, reason: "text_only_sufficient" };
  }

  if (params.forceAi) {
    return { shouldRescue: true, reason: "manual_force_ai" };
  }

  if (params.costMode === "ultra_low_cost") {
    return { shouldRescue: false, reason: "cost_mode_ultra_low" };
  }

  const localQualityLow = params.localMetrics.markerCount < 6 || params.localMetrics.confidence < 0.62;
  if (!localQualityLow) {
    return { shouldRescue: false, reason: "local_quality_not_low" };
  }

  const weakTextInput =
    params.textItems === 0 ||
    params.compactTextLength < 220 ||
    params.ocrResult.initFailed ||
    params.ocrResult.timedOut ||
    (params.ocrResult.used && params.ocrResult.pagesSucceeded === 0);

  if (!weakTextInput) {
    return { shouldRescue: false, reason: "text_context_not_weak" };
  }

  return { shouldRescue: true, reason: "low_quality_and_weak_text_context" };
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
  let timeoutHandle: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (typeof timeoutHandle === "number") {
      window.clearTimeout(timeoutHandle);
    }
  }
};

const normalizeOcrText = (value: string): string =>
  value
    .replace(/\u00a0/g, " ")
    .replace(NOISE_SYMBOL_PATTERN, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .map((line) =>
      line
        .replace(/([0-9])(?=(?:Uw waarde:|Normale waarde:|Datum:))/g, "$1 ")
        .replace(/([µμ])\s+g\s*\/\s*l/gi, "µg/L")
        .replace(/([µμ])\s+mol\s*\/\s*l/gi, "µmol/L")
        .replace(/u?mol\s*\/\s*l/gi, (entry) => (/^umol/i.test(entry.replace(/\s+/g, "")) ? "umol/L" : entry))
        .replace(/ug\s*\/\s*l/gi, "ug/L")
        .replace(/ug\s*\/\s*dl/gi, "ug/dL")
        .replace(/mcg\s*\/\s*dl/gi, "mcg/dL")
        .replace(/mcg\s*\/\s*ml/gi, "mcg/mL")
        .replace(/ng\s*\/\s*ml/gi, "ng/mL")
        .replace(/ng\s*\/\s*dl/gi, "ng/dL")
        .replace(/ng\s*\/\s*mg/gi, "ng/mg")
        .replace(/pg\s*\/\s*ml/gi, "pg/mL")
        .replace(/pg\s*\/\s*mg/gi, "pg/mg")
        .replace(/10\s*[x×*]\s*9\s*\/\s*l/gi, "10^9/L")
        .replace(/10\s*[x×*]\s*12\s*\/\s*l/gi, "10^12/L")
    )
    .filter(Boolean)
    .join("\n");

const isLikelyLabDataLine = (line: string): boolean => {
  const normalized = cleanWhitespace(line);
  if (!normalized || normalized.length < 6) {
    return false;
  }
  const hasNumeric = /\b\d+(?:[.,]\d+)?\b/.test(normalized);
  const hasUnitHint = /(mmol\/L|nmol\/L|pmol\/L|pg\/mL|ng\/dL|g\/L|mg\/L|µg\/L|umol\/L|U\/L|mU\/L|IU\/L|%|10\*9\/L|10\*12\/L)/i.test(
    normalized
  );
  const hasRange = /(?:<|>|<=|>=|\d+\s*[-–]\s*\d+)/.test(normalized);
  const looksNarrative = /(guideline|interpretation|individuals|sensitive to|for further information|target reduction|http|www\.)/i.test(normalized);
  return (hasNumeric && (hasUnitHint || hasRange)) && !looksNarrative;
};

const compactTextForAi = (pdfText: string): string => {
  const rows = pdfText
    .split(/\r?\n/)
    .map((line) => cleanWhitespace(line))
    .filter(Boolean)
    .filter((line) => isLikelyLabDataLine(line))
    .slice(0, 250);
  return rows.join("\n");
};

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const hashArrayBuffer = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
    return toHex(digest);
  }
  const bytes = new Uint8Array(arrayBuffer);
  let hash = 2166136261;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 16777619);
  }
  return `fnv-${Math.abs(hash)}`;
};

interface CachedAiExtractionEntry {
  createdAt: number;
  fileHash: string;
  mode: GeminiRequestOptions["mode"];
  response: GeminiExtractionResponse;
}

const readAiExtractionCache = (): CachedAiExtractionEntry[] => {
  try {
    const raw = window.localStorage.getItem(LOCAL_AI_EXTRACTION_CACHE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as CachedAiExtractionEntry[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    const cutoff = Date.now() - LOCAL_AI_EXTRACTION_CACHE_TTL_MS;
    return parsed
      .filter((entry) => entry && typeof entry === "object")
      .filter((entry) => typeof entry.createdAt === "number" && entry.createdAt >= cutoff)
      .slice(0, LOCAL_AI_EXTRACTION_CACHE_MAX_ENTRIES);
  } catch {
    return [];
  }
};

const writeAiExtractionCache = (entries: CachedAiExtractionEntry[]): void => {
  try {
    window.localStorage.setItem(
      LOCAL_AI_EXTRACTION_CACHE_KEY,
      JSON.stringify(entries.slice(0, LOCAL_AI_EXTRACTION_CACHE_MAX_ENTRIES))
    );
  } catch {
    // ignore storage errors
  }
};

const getCachedAiExtraction = (fileHash: string, mode: GeminiRequestOptions["mode"]): GeminiExtractionResponse | null => {
  const entries = readAiExtractionCache();
  const match = entries.find((entry) => entry.fileHash === fileHash && entry.mode === mode);
  if (!match) {
    return null;
  }
  return {
    ...match.response,
    cacheHit: true
  };
};

const putCachedAiExtraction = (fileHash: string, mode: GeminiRequestOptions["mode"], response: GeminiExtractionResponse): void => {
  const entries = readAiExtractionCache();
  const next: CachedAiExtractionEntry = {
    createdAt: Date.now(),
    fileHash,
    mode,
    response: {
      ...response,
      cacheHit: false
    }
  };
  const deduped = [next, ...entries.filter((entry) => !(entry.fileHash === fileHash && entry.mode === mode))];
  writeAiExtractionCache(deduped);
};

const buildAiExtractionPrompt = (fileName: string, pdfText: string): string =>
  [
    "Extract blood lab data from this report and return ONLY valid JSON in the exact shape below:",
    '{"testDate":"YYYY-MM-DD","markers":[{"marker":"string","value":0,"unit":"string","referenceMin":null,"referenceMax":null,"confidence":0.0}]}',
    "Hard rules:",
    "- Extract only true lab result rows (marker + value + unit context).",
    "- Ignore narrative/guideline/commentary text (e.g. recommendations, risk notes, interpretation paragraphs, method caveats).",
    "- Do NOT create markers from sentence fragments like 'is', 'sensitive to', 'high risk individuals', or similar prose.",
    "- Use sample collection date when available; avoid print/report timestamps.",
    "- Keep values numeric only (no comparators or symbols in value).",
    "- If reference range is missing, use null.",
    "- confidence must be between 0.0 and 1.0.",
    `Source filename: ${fileName}`,
    "LAB TEXT START",
    pdfText,
    "LAB TEXT END"
  ].join("\n");

const sanitizeMarkerName = (rawMarker: string): string => applyProfileMarkerFixes(cleanMarkerName(rawMarker));

const scoreMarkerCandidate = (
  markerName: string,
  unit: string,
  referenceMin: number | null,
  referenceMax: number | null
): number => {
  const marker = cleanWhitespace(markerName);
  if (!marker) {
    return 0;
  }

  let score = 45;
  const tokens = marker.split(" ").filter(Boolean);
  const lower = marker.toLowerCase();

  if (MARKER_ANCHOR_PATTERN.test(marker)) {
    score += 30;
  } else {
    score -= 15;
  }

  if (unit) {
    score += 15;
  }
  if (referenceMin !== null || referenceMax !== null) {
    score += 10;
  }

  if (COMMENTARY_GUARD_PATTERN.test(marker) || GUIDANCE_RESULT_PATTERN.test(marker)) {
    score -= 70;
  }

  if (tokens.length === 1) {
    const token = lower.trim();
    if (SINGLE_TOKEN_MARKER_STOPWORDS.has(token)) {
      score -= 80;
    }
    if (tokens[0].length <= 2 && !SHORT_MARKER_ALLOWLIST.has(tokens[0].toUpperCase())) {
      score -= 40;
    }
  }

  if (/^(?:for|if|this|that|please|interpret|new)\b/i.test(marker)) {
    score -= 35;
  }

  if (tokens.length >= 8 && !MARKER_ANCHOR_PATTERN.test(marker)) {
    score -= 35;
  }

  if (/\b(?:individuals?|guidelines?|sensitive\s+to|further\s+information|target\s+reduction)\b/i.test(marker)) {
    score -= 40;
  }

  return Math.max(0, Math.min(100, score));
};

const isAcceptableMarkerCandidate = (
  markerName: string,
  unit: string,
  referenceMin: number | null,
  referenceMax: number | null,
  source: MarkerCandidateSource
): boolean => {
  const marker = sanitizeMarkerName(markerName);
  if (!marker) {
    return false;
  }

  if (looksLikeNoiseMarker(marker)) {
    return false;
  }

  const tokens = marker.split(" ").filter(Boolean);
  if (tokens.length === 1) {
    const token = tokens[0];
    if (SINGLE_TOKEN_MARKER_STOPWORDS.has(token.toLowerCase())) {
      return false;
    }
    if (token.length <= 2 && !SHORT_MARKER_ALLOWLIST.has(token.toUpperCase())) {
      return false;
    }
  }

  const score = scoreMarkerCandidate(marker, unit, referenceMin, referenceMax);
  const knownMarker = MARKER_ANCHOR_PATTERN.test(marker) || SHORT_MARKER_ALLOWLIST.has(marker.toUpperCase());
  const hasStrongStructure = Boolean(unit) && (referenceMin !== null || referenceMax !== null);

  if (source === "claude" && !knownMarker && !hasStrongStructure) {
    return false;
  }

  const threshold = source === "claude" ? (knownMarker ? 50 : 72) : knownMarker ? 36 : 54;
  return score >= threshold;
};

const extractPdfTextViaOcr = async (arrayBuffer: ArrayBuffer): Promise<OcrResult> => {
  if (!isBrowserRuntime()) {
    return {
      text: "",
      used: false,
      pagesAttempted: 0,
      pagesSucceeded: 0,
      pagesFailed: 0,
      initFailed: true,
      timedOut: false
    };
  }

  type OcrWorker = {
    recognize: (image: HTMLCanvasElement) => Promise<{ data?: { text?: string } }>;
    setParameters?: (params: Record<string, string>) => Promise<unknown>;
    terminate: () => Promise<unknown>;
  };
  type TesseractModule = {
    createWorker?: (...args: unknown[]) => Promise<OcrWorker>;
    recognize?: (
      image: HTMLCanvasElement,
      langs?: string,
      options?: Record<string, unknown>
    ) => Promise<{ data?: { text?: string } }>;
    default?: {
      createWorker?: (...args: unknown[]) => Promise<OcrWorker>;
      recognize?: (
        image: HTMLCanvasElement,
        langs?: string,
        options?: Record<string, unknown>
      ) => Promise<{ data?: { text?: string } }>;
    };
  };

  const resolveTesseractBindings = (moduleLike: unknown): {
    createWorker?: TesseractModule["createWorker"];
    recognizeDirect?: TesseractModule["recognize"];
  } => {
    if (!moduleLike || typeof moduleLike !== "object") {
      return {};
    }
    const module = moduleLike as TesseractModule;
    return {
      createWorker: module.createWorker ?? module.default?.createWorker,
      recognizeDirect: module.recognize ?? module.default?.recognize
    };
  };

  const loadTesseractCdnBundle = async (): Promise<void> => {
    if (!isBrowserRuntime()) {
      return;
    }
    const existing = document.querySelector('script[data-labtracker-tesseract="1"]') as HTMLScriptElement | null;
    if (existing?.dataset.ready === "1") {
      return;
    }
    if (existing) {
      await new Promise<void>((resolve, reject) => {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Failed to load Tesseract bundle")), { once: true });
      });
      return;
    }
    const script = document.createElement("script");
    script.src = OCR_REMOTE_TESSERACT_BUNDLE;
    script.async = true;
    script.dataset.labtrackerTesseract = "1";
    await new Promise<void>((resolve, reject) => {
      script.onload = () => {
        script.dataset.ready = "1";
        resolve();
      };
      script.onerror = () => reject(new Error("Failed to load Tesseract bundle"));
      document.head.appendChild(script);
    });
  };

  let createWorker: TesseractModule["createWorker"];
  let recognizeDirect: TesseractModule["recognize"];
  const staticBindings = resolveTesseractBindings(Tesseract);
  createWorker = staticBindings.createWorker;
  recognizeDirect = staticBindings.recognizeDirect;

  if (!createWorker && !recognizeDirect) {
    const globalBindings = resolveTesseractBindings((window as unknown as { Tesseract?: unknown }).Tesseract);
    createWorker = globalBindings.createWorker;
    recognizeDirect = globalBindings.recognizeDirect;
  }

  if (!createWorker && !recognizeDirect) {
    try {
      await loadTesseractCdnBundle();
      const cdnBindings = resolveTesseractBindings((window as unknown as { Tesseract?: unknown }).Tesseract);
      createWorker = cdnBindings.createWorker;
      recognizeDirect = cdnBindings.recognizeDirect;
    } catch (error) {
      console.warn("PDF OCR CDN fallback failed", error);
    }
  }

  if (!createWorker && !recognizeDirect) {
    return {
      text: "",
      used: true,
      pagesAttempted: 0,
      pagesSucceeded: 0,
      pagesFailed: 0,
      initFailed: true,
      timedOut: false
    };
  }

  let doc: unknown;
  try {
    doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  } catch (error) {
    console.warn("PDF OCR document load failed", error);
    return {
      text: "",
      used: true,
      pagesAttempted: 0,
      pagesSucceeded: 0,
      pagesFailed: 0,
      initFailed: true,
      timedOut: false
    };
  }

  const pageLimit = Math.min((doc as { numPages: number }).numPages, OCR_MAX_PAGES);
  if (pageLimit === 0) {
    return {
      text: "",
      used: true,
      pagesAttempted: 0,
      pagesSucceeded: 0,
      pagesFailed: 0,
      initFailed: true,
      timedOut: false
    };
  }

  let worker: OcrWorker | null = null;
  const workerInitAttempts: Array<Record<string, unknown>> = [
    {
      workerPath: tesseractWorker,
      corePath: tesseractCore,
      langPath: OCR_REMOTE_LANG_PATH,
      cacheMethod: "none",
      workerBlobURL: true
    },
    {
      workerPath: tesseractWorker,
      corePath: tesseractCore,
      langPath: OCR_REMOTE_LANG_PATH,
      cacheMethod: "none",
      workerBlobURL: false
    },
    {
      workerPath: tesseractWorker,
      corePath: tesseractCore,
      langPath: OCR_REMOTE_LANG_PATH_ALT,
      cacheMethod: "none",
      workerBlobURL: true
    },
    {
      workerPath: OCR_REMOTE_WORKER_PATH,
      corePath: OCR_REMOTE_CORE_PATH,
      langPath: OCR_REMOTE_LANG_PATH,
      cacheMethod: "none",
      workerBlobURL: true
    },
    {
      workerPath: OCR_REMOTE_WORKER_PATH,
      corePath: OCR_REMOTE_CORE_PATH,
      langPath: OCR_REMOTE_LANG_PATH_ALT,
      cacheMethod: "none",
      workerBlobURL: false
    },
    {
      cacheMethod: "none",
      workerBlobURL: true
    }
  ];
  const languageAttempts = OCR_LANGS.includes("+") ? [OCR_LANGS, OCR_LANG_FALLBACK] : [OCR_LANGS];

  if (createWorker) {
    for (const lang of languageAttempts) {
      for (const options of workerInitAttempts) {
        for (let attempt = 1; attempt <= OCR_MAX_INIT_ATTEMPTS; attempt += 1) {
          try {
            worker = await createWorker(lang, 1, options);
            break;
          } catch (error) {
            console.warn(
              `PDF OCR worker init attempt failed (${attempt}/${OCR_MAX_INIT_ATTEMPTS}) for langs=${lang}`,
              error
            );
            if (attempt < OCR_MAX_INIT_ATTEMPTS) {
              await sleep(OCR_INIT_BACKOFF_MS * attempt);
            }
          }
        }
        if (worker) {
          break;
        }
      }
      if (worker) {
        break;
      }
    }
  }

  const chunks: string[] = [];
  let pagesSucceeded = 0;
  let pagesFailed = 0;
  let timedOut = false;

  const getPageCanvas = async (pageNumber: number, scale: number): Promise<HTMLCanvasElement | null> => {
    const page = await (doc as { getPage: (page: number) => Promise<unknown> }).getPage(pageNumber);
    const pdfPage = page as {
      getViewport: (options: { scale: number }) => { width: number; height: number };
      render: (options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => {
        promise: Promise<unknown>;
      };
    };
    const viewport = pdfPage.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return null;
    }
    await pdfPage.render({ canvasContext: context, viewport }).promise;
    return canvas;
  };

  const runPageOcr = async (pageNumber: number, scale: number): Promise<string> => {
    const canvas = await getPageCanvas(pageNumber, scale);
    if (!canvas) {
      return "";
    }

    if (worker) {
      const recognized = await worker.recognize(canvas);
      return normalizeOcrText(recognized.data?.text ?? "");
    }

    if (!recognizeDirect) {
      return "";
    }

    for (const lang of languageAttempts) {
      try {
        const recognized = await recognizeDirect(canvas, lang);
        const defaultText = normalizeOcrText(recognized.data?.text ?? "");
        if (defaultText) {
          return defaultText;
        }
      } catch (error) {
        console.warn(`PDF OCR direct recognize failed (default config) for langs=${lang}`, error);
      }

      try {
        const recognized = await recognizeDirect(canvas, lang, {
          workerPath: OCR_REMOTE_WORKER_PATH,
          corePath: OCR_REMOTE_CORE_PATH,
          langPath: OCR_REMOTE_LANG_PATH,
          cacheMethod: "none",
          workerBlobURL: false
        });
        const configuredText = normalizeOcrText(recognized.data?.text ?? "");
        if (configuredText) {
          return configuredText;
        }
      } catch (error) {
        console.warn(`PDF OCR direct recognize failed (configured) for langs=${lang}`, error);
      }
    }

    return "";
  };

  if (worker) {
    try {
      await worker.setParameters?.({
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: "6"
      });
    } catch (error) {
      console.warn("PDF OCR worker setParameters failed", error);
    }
  }

  try {
    for (let pageNum = 1; pageNum <= pageLimit; pageNum += 1) {
      let ocrText = "";
      try {
        ocrText = await withTimeout(runPageOcr(pageNum, OCR_RENDER_SCALE), OCR_PAGE_TIMEOUT_MS, `OCR timeout on page ${pageNum}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (/timeout/i.test(message)) {
          timedOut = true;
        }
      }

      if (!ocrText) {
        try {
          ocrText = await withTimeout(
            runPageOcr(pageNum, OCR_RETRY_RENDER_SCALE),
            OCR_PAGE_TIMEOUT_MS,
            `OCR retry timeout on page ${pageNum}`
          );
        } catch (retryError) {
          const retryMessage = retryError instanceof Error ? retryError.message : "";
          if (/timeout/i.test(retryMessage)) {
            timedOut = true;
          }
        }
      }

      if (ocrText) {
        chunks.push(ocrText);
        pagesSucceeded += 1;
      } else {
        pagesFailed += 1;
        console.warn(`PDF OCR page failed (${pageNum})`);
      }
    }
  } catch (error) {
    console.warn("PDF OCR fallback failed", error);
    pagesFailed = Math.max(pagesFailed, pageLimit - pagesSucceeded);
  } finally {
    if (worker) {
      await worker.terminate().catch(() => undefined);
    }
  }

  if (chunks.length === 0 && pagesSucceeded === 0 && pagesFailed === 0) {
    pagesFailed = pageLimit;
  }

  return {
    text: chunks.join("\n"),
    used: true,
    pagesAttempted: pageLimit,
    pagesSucceeded,
    pagesFailed,
    initFailed: false,
    timedOut
  };
};

const normalizeMarker = (raw: RawMarker): MarkerValue | null => {
  const value = safeNumber(raw.value);
  if (value === null || !raw.marker) {
    return null;
  }

  const cleanedMarker = sanitizeMarkerName(raw.marker);
  const unit = raw.unit?.trim() || "";
  const referenceMin = safeNumber(raw.referenceMin ?? null);
  const referenceMax = safeNumber(raw.referenceMax ?? null);

  if (!cleanedMarker || !isAcceptableMarkerCandidate(cleanedMarker, unit, referenceMin, referenceMax, "claude")) {
    return null;
  }
  if (GUIDANCE_RESULT_PATTERN.test(raw.marker) || GUIDANCE_RESULT_PATTERN.test(cleanedMarker)) {
    return null;
  }

  const resolved = resolveCanonicalMarker({
    rawName: cleanedMarker,
    unit,
    contextText: raw.marker,
    mode: "balanced"
  });
  const canonicalMarker = resolved.canonicalMarker;
  const normalized = normalizeMarkerMeasurement({
    canonicalMarker,
    value,
    unit,
    referenceMin,
    referenceMax
  });

  return {
    id: createId(),
    marker: cleanedMarker,
    canonicalMarker,
    value: normalized.value,
    unit: normalized.unit,
    referenceMin: normalized.referenceMin,
    referenceMax: normalized.referenceMax,
    rawValue: value,
    rawUnit: unit,
    rawReferenceMin: referenceMin,
    rawReferenceMax: referenceMax,
    abnormal: deriveAbnormalFlag(normalized.value, normalized.referenceMin, normalized.referenceMax),
    confidence:
      typeof raw.confidence === "number"
        ? Math.min(1, Math.max(0, raw.confidence))
        : Math.max(0.45, Math.min(0.92, resolved.confidence))
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
    .replace(/ng\s*\/\s*a[l1]/gi, "ng/dL")
    .replace(/w[gu]\s*\/\s*a[l1]/gi, "ug/dL")
    .replace(/u[gq]\s*\/\s*a[l1]/gi, "ug/dL")
    .replace(/ng\s*\/\s*mg/gi, "ng/mg")
    .replace(/pg\s*\/\s*ml/gi, "pg/mL")
    .replace(/pg\s*\/\s*mg/gi, "pg/mg")
    .replace(/10\s*[x×*]\s*9\s*\/\s*l/gi, "10^9/L")
    .replace(/10\s*[x×*]\s*12\s*\/\s*l/gi, "10^12/L");
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
  if (/^10(?:\^|\*|x|×)?9\/l$/i.test(compact)) {
    return "10^9/L";
  }
  if (/^10(?:\^|\*|x|×)?12\/l$/i.test(compact)) {
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
  const compact = token.replace(/\s+/g, "").replace(/μ/g, "µ");
  if (/^10(?:\^|\*|x|×)?(?:9|12)\/l$/i.test(compact)) {
    return true;
  }

  if (!UNIT_TOKEN_PATTERN.test(token)) {
    return false;
  }

  if (token.includes("/") || token.includes("%")) {
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
  const normalizedForKeywordDetection = haystack.replace(
    /([0-9])(?=(?:Uw waarde:|Normale waarde:|Datum:))/gi,
    "$1 "
  );
  const keywordStyleHits = Array.from(
    normalizedForKeywordDetection.matchAll(/\b(?:uw|your)\s+waarde:\s*[<>]?\s*\d+(?:[.,]\d+)?/gi)
  ).length;
  const normalRangeHits = Array.from(
    normalizedForKeywordDetection.matchAll(/\b(?:normale\s+waarde|normal\s+range|reference\s+range)\s*:/gi)
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
  const normalizeEdgeToken = (token: string): string => token.replace(/^[^A-Za-z0-9/%+.-]+|[^A-Za-z0-9/%+.-]+$/g, "");
  const shouldTrimEdgeToken = (token: string): boolean => {
    const normalized = normalizeEdgeToken(token);
    if (!normalized) {
      return true;
    }
    const upper = normalized.toUpperCase();
    const lower = normalized.toLowerCase();
    if (EDGE_NOISE_TOKEN_ALLOWLIST.has(upper)) {
      return false;
    }
    if (EDGE_NOISE_TOKEN_BLOCKLIST.has(lower)) {
      return true;
    }
    if (/^[|`~]+$/.test(token)) {
      return true;
    }
    if (/^[A-Za-z]{1,4}\)$/.test(token)) {
      return true;
    }
    if (normalized.length <= 2 && !SHORT_MARKER_ALLOWLIST.has(upper) && !EDGE_NOISE_TOKEN_ALLOWLIST.has(upper)) {
      return true;
    }
    return false;
  };
  const trimEdgeNoiseTokens = (value: string): string => {
    const tokens = value.split(/\s+/).filter(Boolean);
    while (tokens.length > 1 && shouldTrimEdgeToken(tokens[0])) {
      tokens.shift();
    }
    while (tokens.length > 1 && shouldTrimEdgeToken(tokens[tokens.length - 1])) {
      tokens.pop();
    }
    return tokens.join(" ");
  };

  let marker = cleanWhitespace(rawMarker)
    .replace(/[|`~]+/g, " ")
    .replace(/[•·]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[^A-Za-zÀ-ž]+/, "")
    .replace(/^(?:A|H|L)\s+(?=[A-Za-zÀ-ž0-9])/i, "")
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
    .replace(/^interval\s+/i, "")
    .replace(/^zie\s*opm\.?\s*/i, "")
    .trim();

  if (LEADING_UNIT_FRAGMENT_PATTERN.test(marker)) {
    marker = marker.replace(LEADING_UNIT_FRAGMENT_PATTERN, "").trim();
  }

  while (SECTION_PREFIX_PATTERN.test(marker)) {
    marker = marker.replace(SECTION_PREFIX_PATTERN, "").trim();
  }

  marker = marker.replace(METHOD_SUFFIX_PATTERN, "").trim();
  marker = marker.replace(/\s*[=<>]+\s*$/g, "").trim();
  // Drop flattened carry-over content from indexed lab rows (e.g. "... 54/58 A TSH ...").
  marker = marker.replace(/\s+\d{1,3}\/\d{2,3}\s+A?\b.*$/i, "").trim();
  marker = marker.replace(/\b(?:nz|us|usa)\s+ref(?:erence)?(?:\s*range|\s+[a-z]{1,4})*\b.*$/i, "").trim();
  marker = marker.replace(/\bref(?:erence)?\s*(?:r(?:ange)?)?\b.*$/i, "").trim();
  marker = marker.replace(/\b(?:discounted|dicounted)\s+lab'?s?\b.*$/i, "").trim();
  marker = marker.replace(/\b[A-Za-z]{1,4}\)(?=\s|$)/g, "").replace(/\s+/g, " ").trim();
  marker = trimEdgeNoiseTokens(marker);
  marker = marker.replace(/\s+\b[a-z]{1,3}\b\s*$/g, "").trim();

  if (
    /\b(langere tijd tussen (?:bloed)?afname en analyse|longer time between blood collection and analysis)\b/i.test(marker)
  ) {
    return "MCH";
  }

  const anchor = marker.match(MARKER_ANCHOR_PATTERN);
  if (anchor && anchor.index !== undefined && anchor.index > 0) {
    const prefix = marker.slice(0, anchor.index);
    const prefixTokens = prefix.split(/\s+/).filter(Boolean);
    const shortPrefixNoise = prefixTokens.length >= 2 && prefixTokens.every((token) => token.length <= 3);
    if (
      prefix.length > 20 ||
      shortPrefixNoise ||
      /\b(?:risk|risico|report|resultaat|patient|uitslag|diagnostiek|caution|interpret|method|given|individuals|effective|assessment|presence)\b/i.test(
        prefix
      )
    ) {
      marker = marker.slice(anchor.index).trim();
    }
  }

  if (marker.split(" ").length > 10) {
    marker = marker.split(" ").slice(-6).join(" ");
  }

  return trimEdgeNoiseTokens(marker.replace(/[.,;:]+$/, "").trim());
};

const applyProfileMarkerFixes = (markerName: string): string => {
  let marker = markerName;

  marker = marker.replace(/^Result\s+/i, "");
  marker = marker.replace(/\bT otal\b/g, "Total");
  marker = marker.replace(/^Cortisol\s+AM\s+Cortisol$/i, "Cortisol (AM)");
  marker = marker.replace(/^AM\s+Cortisol$/i, "Cortisol (AM)");
  marker = marker.replace(/^Cortisol\s+AM$/i, "Cortisol (AM)");
  marker = marker.replace(/^.*\bSex Hormone Binding Globulin\b/i, "SHBG");
  marker = marker.replace(/^Sex Horm Binding Glob(?:,?\s*Serum)?$/i, "SHBG");
  marker = marker.replace(/^Sex Hormone Binding Globulin$/i, "SHBG");
  marker = marker.replace(/^Testosterons(?:,\s*Serum)?$/i, "Testosterone");
  marker = marker.replace(/^Testosterone,\s*Serum$/i, "Testosterone");
  marker = marker.replace(/^Dibya?rotestosterone$/i, "Dihydrotestosterone");
  marker = marker.replace(/^Dihyarotestosterone$/i, "Dihydrotestosterone");
  marker = marker.replace(/^Dhea-?Sul[£f]ate$/i, "DHEA Sulfate");
  marker = marker.replace(/^Dhea-?Sulfes?$/i, "DHEA Sulfate");
  marker = marker.replace(/^Eatradiol(?:,\s*Sensitive)?$/i, "Estradiol");
  marker = marker.replace(/^Estradiol,\s*Sensitive$/i, "Estradiol");
  marker = marker.replace(/^Prost(?:ate)?\.?\s*Spec(?:ific)?\s*(?:Ag|A)(?:,\s*Serum)?$/i, "PSA");
  marker = marker.replace(/^Posta?\s*Spec\s*4\s*Sem'?$/i, "PSA");

  marker = marker.replace(/^Ratio:\s*T\/SHBG.*$/i, "SHBG");
  marker = marker.replace(/^MPV-Mean Platelet$/i, "MPV-Mean Platelet Volume");
  marker = marker.replace(/^IGF-?1\s*SDS\s*\*?\)?$/i, "IGF-1 SDS");
  marker = marker.replace(/^IGF-?1\s*\(somatomedine\s*C\)\s*CLIA$/i, "IGF-1 (somatomedine C)");
  marker = marker.replace(/^25-?OH-?\s*Vitamin D\s*\(D3\s*\+\s*D2\)$/i, "25-OH- Vitamin D (D3+D2)");
  marker = marker.replace(/^25-?OH-?\s*Vitamin D$/i, "25-OH- Vitamin D (D3+D2)");
  marker = marker.replace(/\s*\(volgens\s*$/i, "").trim();
  marker = marker.replace(/\s+\($/, "").trim();
  marker = marker.replace(/\s{2,}/g, " ").trim();

  return marker;
};

const looksLikeNoiseMarker = (marker: string): boolean => {
  if (!marker || marker.length < 2) {
    return true;
  }

  const tokens = marker.split(" ").filter(Boolean);
  if (tokens.length === 1) {
    const token = tokens[0];
    if (SINGLE_TOKEN_MARKER_STOPWORDS.has(token.toLowerCase())) {
      return true;
    }
    if (token.length <= 2 && !SHORT_MARKER_ALLOWLIST.has(token.toUpperCase())) {
      return true;
    }
  }

  if (!/[A-Za-zÀ-ž]{2}/.test(marker)) {
    return true;
  }

  if (/^\d/.test(marker)) {
    if (/^25-?oh-?\s*vitamin\s*d\b/i.test(marker)) {
      return false;
    }
    return true;
  }
  if (/\b\d{1,3}\/\d{2,3}\s+A?\b/i.test(marker)) {
    return true;
  }

  if (/\b(?:fsh|lh)\s*&\s*(?:fsh|lh)\b/i.test(marker)) {
    return true;
  }

  if (/\b\d+(?:[.,]\d+)?\s*-\s*$/i.test(marker)) {
    return true;
  }

  if (/[=<>]/.test(marker)) {
    return true;
  }
  if (/\b\d+(?:[.,]\d+)?\s*[-–]\s*\d+(?:[.,]\d+)?\b/.test(marker)) {
    return true;
  }

  if (isLikelyUnit(marker) || (/^[A-Za-z%µμ/().-]+$/.test(marker) && marker.includes("/"))) {
    return true;
  }

  if (HISTORY_CALCULATOR_NOISE_PATTERN.test(marker)) {
    return true;
  }

  if (COMMENTARY_FRAGMENT_PATTERN.test(marker) && !MARKER_ANCHOR_PATTERN.test(marker)) {
    return true;
  }

  if (GUIDANCE_RESULT_PATTERN.test(marker)) {
    return true;
  }

  if (COMMENTARY_GUARD_PATTERN.test(marker) && !MARKER_ANCHOR_PATTERN.test(marker)) {
    return true;
  }

  if (/^(?:voor\s+interpretatie|risicomanag\w*)\b/i.test(marker)) {
    return true;
  }

  if (/\b(?:individuals?|guideline|guidelines?)\b/i.test(marker)) {
    return true;
  }

  if (/\b(?:per\s+week|baseline|various\s+protocols?|roche\s*(?:cobas\s*)?assay)\b/i.test(marker)) {
    return true;
  }

  if (
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.test(marker) &&
    /\d/.test(marker)
  ) {
    return true;
  }

  if (/^(?:[A-Za-zµμ%]+\/[A-Za-z0-9µμ%]+\s+){2,}/.test(marker)) {
    return true;
  }

  if (/^[A-Za-zµμ%]+\/[A-Za-z0-9µμ%]+\s*[<>]?$/.test(marker)) {
    return true;
  }

  if (
    /^(?:hematology|clinical chemistry|biochemistry|hormones?|vitamins?|lipids?|differential|tumou?r markers?|cardial markers?|leukocyte differential count)$/i.test(
      marker
    )
  ) {
    return true;
  }
  if (/^interval\s+(?:hematology|clinical chemistry|biochemistry|hormones?|vitamins?|lipids?)$/i.test(marker)) {
    return true;
  }

  if (/^(?:morning|afternoon|evening|night)\s+hours?$/i.test(marker)) {
    return true;
  }

  const tokenCount = tokens.length;
  if (tokenCount >= 8 && !MARKER_ANCHOR_PATTERN.test(marker)) {
    return true;
  }

  if (
    /^(?:for|if|this|that|please|interpret|new|changes|when|in)\b/i.test(marker) &&
    tokenCount > 3 &&
    !MARKER_ANCHOR_PATTERN.test(marker)
  ) {
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
  return STRICT_NUMERIC_TOKEN_PATTERN.test(token.trim());
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

  if (GUIDANCE_RESULT_PATTERN.test(cleanedRow)) {
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
  const cleanedInput = cleanWhitespace(rawRow);
  if (GUIDANCE_RESULT_PATTERN.test(cleanedInput)) {
    return null;
  }

  const rightAnchored = parseRowByRightAnchoredUnit(rawRow, confidence + 0.04, profile);
  if (rightAnchored) {
    return rightAnchored;
  }

  const cleanedRow = cleanedInput;
  if (!cleanedRow) {
    return null;
  }

  const baseMatch = cleanedRow.match(/^(.+?)\s+([<>≤≥]?\s*[+-]?\d+(?:[.,]\d+)?)(?:\s+|$)(.*)$/);
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

  if (HISTORY_CALCULATOR_NOISE_PATTERN.test(line)) {
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
  if (!isAcceptableMarkerCandidate(row.markerName, row.unit, row.referenceMin, row.referenceMax, "fallback")) {
    return false;
  }

  if (GUIDANCE_RESULT_PATTERN.test(row.markerName)) {
    return false;
  }

  if (/\b(?:individuals?|guideline|guidelines?)\b/i.test(row.markerName) && !MARKER_ANCHOR_PATTERN.test(row.markerName)) {
    return false;
  }

  if (COMMENTARY_FRAGMENT_PATTERN.test(row.markerName) && !MARKER_ANCHOR_PATTERN.test(row.markerName)) {
    return false;
  }

  if (/^(?:for|if|this|that|please|interpret|new|changes)\b/i.test(row.markerName) && !MARKER_ANCHOR_PATTERN.test(row.markerName)) {
    return false;
  }

  if (
    /\b(?:in patients|in men with|according to|values obtained|comparison of serial|cannot be used interchangeably|performed using|developed and validated|educational purposes|methodology|reference interval is based on|psa below|psa above)\b/i.test(
      row.markerName
    )
  ) {
    return false;
  }

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

  if (/\bvalue\b$/i.test(row.markerName)) {
    return false;
  }

  if (/\bratio\b/i.test(row.markerName) && !ALLOWED_RATIO_MARKER_PATTERN.test(row.markerName)) {
    return false;
  }

  if (row.markerName.split(/\s+-\s+/).filter(Boolean).length >= 3) {
    return false;
  }

  if (profile.requireUnit && !row.unit) {
    if (!/^IGF-?1\s*SDS\b/i.test(row.markerName)) {
      return false;
    }
  }

  if (row.unit || row.referenceMin !== null || row.referenceMax !== null) {
    return true;
  }
  if (/^IGF-?1\s*SDS\b/i.test(row.markerName)) {
    return true;
  }
  const canonical = canonicalizeMarker(row.markerName, { unit: row.unit, mode: "balanced" });
  return IMPORTANT_MARKERS.has(canonical);
};

const parseLifeLabsTableRows = (text: string, profile: ParserProfile): ParsedFallbackRow[] => {
  if (!LIFELABS_TABLE_HEADER_PATTERN.test(text)) {
    return [];
  }

  const rows: ParsedFallbackRow[] = [];
  const lines = text
    .split("\n")
    .map((line) => cleanWhitespace(line))
    .filter(Boolean);

  let inTable = false;
  for (const line of lines) {
    if (LIFELABS_TABLE_HEADER_PATTERN.test(line)) {
      inTable = true;
      continue;
    }
    if (!inTable) {
      continue;
    }
    if (LIFELABS_TABLE_END_PATTERN.test(line)) {
      inTable = false;
      continue;
    }
    if (!/\d/.test(line)) {
      continue;
    }
    if (LIFELABS_CONTINUATION_PATTERN.test(line) || /https?:\/\/|www\./i.test(line)) {
      continue;
    }

    const strictMatch = line.match(
      /^([A-Za-zÀ-ž][A-Za-zÀ-ž0-9(),.%+\-/ ]{1,90}?)\s+(?:(?:A|H|L)\s+)?([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s+((?:[<>≤≥]\s*-?\d+(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?\s*[-–]\s*-?\d+(?:[.,]\d+)?))\s+([A-Za-z%µμ0-9*^/.\-]+)$/i
    );

    if (strictMatch) {
      const markerName = sanitizeMarkerName(strictMatch[1]);
      const value = safeNumber(strictMatch[2]);
      const unit = normalizeUnit(strictMatch[4]);
      const parsedReference = extractReferenceAndUnit(`${strictMatch[3]} ${strictMatch[4]}`);

      if (
        value !== null &&
        isAcceptableMarkerCandidate(markerName, unit, parsedReference.referenceMin, parsedReference.referenceMax, "fallback")
      ) {
        rows.push({
          markerName,
          value,
          unit,
          referenceMin: parsedReference.referenceMin,
          referenceMax: parsedReference.referenceMax,
          confidence: 0.8
        });
        continue;
      }
    }

    const parsed = parseSingleRow(line, 0.77, profile);
    if (parsed && shouldKeepParsedRow(parsed, profile)) {
      rows.push(parsed);
    }
  }

  return rows;
};

const parseTwoLineRow = (line: string, nextLine: string, profile: ParserProfile): ParsedFallbackRow | null => {
  const lineWithoutIndex = cleanWhitespace(line).replace(INDEXED_ROW_PREFIX_PATTERN, "").trim();
  const markerAndValue = lineWithoutIndex.match(/^(.+?)\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)$/);
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

  if (/\d/.test(lineWithoutIndex)) {
    return null;
  }

  const markerName = applyProfileMarkerFixes(cleanMarkerName(lineWithoutIndex));
  if (looksLikeNoiseMarker(markerName)) {
    return null;
  }

  const compactNext = cleanWhitespace(nextLine);
  const normalizedNext = compactNext.replace(
    /^(?:result(?:\s+(?:normal|high|low))?|normal|abnormal|in\s+range|out\s+of\s+range|value)\s+/i,
    ""
  );
  const indexedStrippedNext = normalizedNext.replace(INDEXED_ROW_PREFIX_PATTERN, "");
  const dequalifiedNext = indexedStrippedNext.replace(/^\(?[A-Z]{2,}(?:\/[A-Z]{2,})?\)?\s+/, "");
  const directNext = parseSingleRow(`${markerName} ${dequalifiedNext}`, 0.64, profile);
  if (directNext) {
    return directNext;
  }

  const nextMatch = dequalifiedNext.match(
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
    const nextLine = lines[index + 1];
    const lineWithoutIndex = line.replace(INDEXED_ROW_PREFIX_PATTERN, "").trim();

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

    if (!nextLine) {
      continue;
    }

    // Prevent orphan suffix fragments ("Distribution Width", "Volume", etc.) from stealing the next row's value.
    if (
      rows.length > 0 &&
      INDEXED_ROW_PREFIX_PATTERN.test(nextLine) &&
      !/\d/.test(lineWithoutIndex) &&
      lineWithoutIndex.split(" ").filter(Boolean).length <= 4 &&
      !MARKER_ANCHOR_PATTERN.test(lineWithoutIndex) &&
      !/\bdifferential\b/i.test(lineWithoutIndex) &&
      MARKER_CONTINUATION_SUFFIX_PATTERN.test(lineWithoutIndex)
    ) {
      const previousRow = rows[rows.length - 1];
      if (previousRow) {
        const suffix = cleanWhitespace(lineWithoutIndex);
        if (
          suffix &&
          shouldAppendContinuationToPreviousMarker(suffix, previousRow.markerName) &&
          !previousRow.markerName.toLowerCase().includes(suffix.toLowerCase())
        ) {
          previousRow.markerName = applyProfileMarkerFixes(cleanMarkerName(`${previousRow.markerName} ${suffix}`));
        }
      }
      consumed.add(index);
      continue;
    }

    const thirdLine = lines[index + 2];
    const nextLineWithoutIndex = nextLine.replace(INDEXED_ROW_PREFIX_PATTERN, "").trim();
    if (thirdLine && !/\d/.test(lineWithoutIndex) && !/\d/.test(nextLineWithoutIndex) && /\d/.test(thirdLine)) {
      const combinedMarker = applyProfileMarkerFixes(cleanMarkerName(`${lineWithoutIndex} ${nextLineWithoutIndex}`));
      if (!looksLikeNoiseMarker(combinedMarker)) {
        const threeLine = parseSingleRow(`${combinedMarker} ${thirdLine}`, 0.63, profile);
        if (threeLine && shouldKeepParsedRow(threeLine, profile)) {
          rows.push(threeLine);
          consumed.add(index + 1);
          consumed.add(index + 2);
          continue;
        }
      }
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

interface SpatialCluster {
  xStart: number;
  xEnd: number;
  text: string;
}

interface HistoryMarkerConfig {
  canonicalMarker: "Testosterone" | "Free Testosterone" | "SHBG";
  markerName: string;
  headingPattern: RegExp;
  rejectHeadingPattern?: RegExp;
  valueRejectPattern?: RegExp;
  allowedUnits: string[];
  xTolerance: number;
}

const getSpatialBand = (x: number): number => Math.max(0, Math.floor(x / SPATIAL_COLUMN_BAND_WIDTH));

const clusterSpatialRowItems = (items: PdfSpatialItem[]): SpatialCluster[] => {
  const ordered = [...items].sort((a, b) => a.x - b.x);
  const clusters: SpatialCluster[] = [];

  for (const item of ordered) {
    const text = cleanWhitespace(item.text);
    if (!text) {
      continue;
    }

    const current = clusters[clusters.length - 1];
    if (!current || item.x - current.xEnd > SPATIAL_CLUSTER_GAP) {
      clusters.push({
        xStart: item.x,
        xEnd: item.x,
        text
      });
      continue;
    }

    current.text = cleanWhitespace(`${current.text} ${text}`);
    current.xEnd = item.x;
  }

  return clusters;
};

const looksLikeMarkerLabelSegment = (rawText: string): boolean => {
  const text = cleanWhitespace(rawText);
  if (!text || looksLikeNoiseMarker(text) || looksLikeNonResultLine(text)) {
    return false;
  }
  if (!/[A-Za-zÀ-ž]/.test(text)) {
    return false;
  }
  if (/^(?:=|<|>|≤|≥)?\s*-?\d+(?:[.,]\d+)?(?:\s+[A-Za-z%µμ/][A-Za-z0-9%µμ/.\-²]*)?$/i.test(text)) {
    return false;
  }
  if (text.split(" ").length > 9) {
    return false;
  }

  const numericTokenCount = text
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => isNumericToken(part)).length;

  return numericTokenCount <= 1;
};

const looksLikeResultSegment = (rawText: string): boolean => {
  const text = cleanWhitespace(rawText);
  if (!text || looksLikeNonResultLine(text)) {
    return false;
  }
  if (!/\d/.test(text)) {
    return false;
  }
  if (/^\d{1,2}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{2,4}$/.test(text)) {
    return false;
  }
  return true;
};

const isPlausibleSpatialMeasurement = (canonicalMarker: string, unit: string, value: number): boolean => {
  const normalizedUnit = normalizeUnit(unit);
  if (!normalizedUnit) {
    return false;
  }

  if (canonicalMarker === "Testosterone") {
    if (normalizedUnit === "nmol/L") {
      return value >= 0.5 && value <= 120;
    }
    if (normalizedUnit === "ng/dL") {
      return value >= 20 && value <= 3500;
    }
    if (normalizedUnit === "ng/mL") {
      return value >= 0.2 && value <= 35;
    }
    return false;
  }
  if (canonicalMarker === "Free Testosterone") {
    if (normalizedUnit === "pmol/L") {
      return value >= 10 && value <= 2000;
    }
    if (normalizedUnit === "pg/mL") {
      return value >= 1 && value <= 600;
    }
    if (normalizedUnit === "ng/dL") {
      return value >= 0.1 && value <= 60;
    }
    if (normalizedUnit === "nmol/L") {
      return value >= 0.01 && value <= 5;
    }
    return false;
  }
  if (canonicalMarker === "Estradiol") {
    if (normalizedUnit === "pmol/L") {
      return value >= 5 && value <= 10000;
    }
    if (normalizedUnit === "pg/mL") {
      return value >= 1 && value <= 3000;
    }
    return false;
  }
  if (canonicalMarker === "SHBG") {
    return normalizedUnit === "nmol/L" && value >= 1 && value <= 300;
  }
  if (canonicalMarker === "Hematocrit") {
    if (normalizedUnit === "%") {
      return value >= 10 && value <= 70;
    }
    if (normalizedUnit === "L/L") {
      return value >= 0.1 && value <= 0.7;
    }
    return false;
  }

  return value > 0 && value <= 5000;
};

const isPlausibleNonSpatialMeasurement = (canonicalMarker: string, unit: string, value: number): boolean => {
  if (!Number.isFinite(value) || value <= 0 || value > 20000) {
    return false;
  }

  const normalizedUnit = normalizeUnit(unit);
  if (!normalizedUnit) {
    return true;
  }

  const canonical = canonicalMarker.toLowerCase();
  if (
    canonical === "testosterone" ||
    canonical === "free testosterone" ||
    canonical === "estradiol" ||
    canonical === "shbg" ||
    canonical === "hematocrit"
  ) {
    return isPlausibleSpatialMeasurement(canonicalMarker, normalizedUnit, value);
  }
  if (canonical === "fsh" || canonical === "lh") {
    return ["mIU/mL", "IU/L", "U/L", "mU/L"].includes(normalizedUnit) && value <= 300;
  }

  if (canonical === "prolactin") {
    return ["ng/mL", "mIU/L", "µg/L"].includes(normalizedUnit) && value <= 4000;
  }

  if (canonical === "dhea sulfate" || canonical === "dhea-sulfate") {
    return ["mcg/dL", "µg/dL", "ng/mL", "µmol/L"].includes(normalizedUnit) && value <= 5000;
  }

  if (canonical === "psa") {
    return ["ng/mL", "µg/L", "%"].includes(normalizedUnit) && value <= 100;
  }

  if (canonical === "bioavailable testosterone") {
    return ["ng/dL", "nmol/L", "pg/mL", "%"].includes(normalizedUnit) && value <= 2000;
  }

  if (canonical.includes("dihydrotestoster") || canonical === "dht") {
    if (["ng/dL", "pg/mL", "nmol/L", "pmol/L", "µg/dL"].includes(normalizedUnit)) {
      if (normalizedUnit === "ng/dL") {
        return value <= 800;
      }
      if (normalizedUnit === "pg/mL") {
        return value <= 8000;
      }
      if (normalizedUnit === "nmol/L") {
        return value <= 30;
      }
      if (normalizedUnit === "pmol/L") {
        return value <= 30000;
      }
      return value <= 20;
    }
    return false;
  }

  return true;
};

const parseSpatialRows = (rows: PdfSpatialRow[], profile: ParserProfile): ParsedFallbackRow[] => {
  const parsedRows: ParsedFallbackRow[] = [];
  const activeMarkerByBand = new Map<number, string>();
  const orderedRows = [...rows].sort((a, b) => {
    if (a.page !== b.page) {
      return a.page - b.page;
    }
    if (Math.abs(a.y - b.y) > SPATIAL_ROW_Y_GROUP_TOLERANCE) {
      return b.y - a.y;
    }
    return (a.items[0]?.x ?? 0) - (b.items[0]?.x ?? 0);
  });
  const rowBundles = orderedRows
    .map((row) => ({
      row,
      clusters: clusterSpatialRowItems(row.items)
    }))
    .filter((bundle) => bundle.clusters.length > 0);
  const labelAnchors = rowBundles.flatMap((bundle) =>
    bundle.clusters
      .filter((cluster) => looksLikeMarkerLabelSegment(cluster.text))
      .map((cluster) => ({
        page: bundle.row.page,
        y: bundle.row.y,
        x: (cluster.xStart + cluster.xEnd) / 2,
        band: getSpatialBand((cluster.xStart + cluster.xEnd) / 2),
        marker: applyProfileMarkerFixes(cleanMarkerName(cluster.text))
      }))
      .filter((anchor) => !looksLikeNoiseMarker(anchor.marker))
  );

  const pushIfValid = (candidate: ParsedFallbackRow | null) => {
    if (!candidate) {
      return;
    }
    if (shouldKeepParsedRow(candidate, profile)) {
      const canonicalMarker = canonicalizeMarker(candidate.markerName, { unit: candidate.unit, mode: "balanced" });
      if (!IMPORTANT_MARKERS.has(canonicalMarker) && !SPATIAL_PRIORITY_MARKER_PATTERN.test(candidate.markerName)) {
        return;
      }
      const markerTokens = candidate.markerName
        .toLowerCase()
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean);
      if (markerTokens.length >= 4 && new Set(markerTokens).size <= 2) {
        return;
      }
      if (!isPlausibleSpatialMeasurement(canonicalMarker, candidate.unit, candidate.value)) {
        return;
      }
      if (candidate.value <= 0 || candidate.value > 10000) {
        return;
      }
      parsedRows.push(candidate);
    }
  };

  for (const bundle of rowBundles) {
    const { row, clusters } = bundle;

    for (const cluster of clusters) {
      if (!looksLikeMarkerLabelSegment(cluster.text)) {
        continue;
      }
      const marker = applyProfileMarkerFixes(cleanMarkerName(cluster.text));
      if (looksLikeNoiseMarker(marker)) {
        continue;
      }
      activeMarkerByBand.set(getSpatialBand((cluster.xStart + cluster.xEnd) / 2), marker);
    }

    for (let index = 0; index < clusters.length; index += 1) {
      const cluster = clusters[index];
      pushIfValid(parseSingleRow(cluster.text, 0.7, profile));

      if (!looksLikeResultSegment(cluster.text)) {
        continue;
      }

      const centerX = (cluster.xStart + cluster.xEnd) / 2;
      const resultBand = getSpatialBand(centerX);

      const leftMarkerCluster = [...clusters]
        .slice(0, index)
        .reverse()
        .find(
          (candidate) =>
            looksLikeMarkerLabelSegment(candidate.text) && centerX - (candidate.xStart + candidate.xEnd) / 2 <= 260
        );

      const markerCandidates = new Set<string>();
      if (leftMarkerCluster) {
        markerCandidates.add(applyProfileMarkerFixes(cleanMarkerName(leftMarkerCluster.text)));
      }
      [resultBand, resultBand - 1, resultBand + 1].forEach((band) => {
        const marker = activeMarkerByBand.get(band);
        if (marker) {
          markerCandidates.add(marker);
        }
      });
      labelAnchors
        .filter(
          (anchor) =>
            anchor.page === row.page && Math.abs(anchor.band - resultBand) <= 1 && Math.abs(anchor.y - row.y) <= 220
        )
        .sort((a, b) => {
          const aDistance = Math.abs(a.y - row.y) + Math.abs(a.band - resultBand) * 50;
          const bDistance = Math.abs(b.y - row.y) + Math.abs(b.band - resultBand) * 50;
          return aDistance - bDistance;
        })
        .slice(0, 3)
        .forEach((anchor) => markerCandidates.add(anchor.marker));
      labelAnchors
        .filter((anchor) => anchor.page === row.page && Math.abs(anchor.x - centerX) <= 62)
        .sort((a, b) => {
          const aDistance = Math.abs(a.x - centerX) + Math.abs(a.y - row.y) * 0.15;
          const bDistance = Math.abs(b.x - centerX) + Math.abs(b.y - row.y) * 0.15;
          return aDistance - bDistance;
        })
        .slice(0, 2)
        .forEach((anchor) => markerCandidates.add(anchor.marker));

      const trailing = clusters[index + 1];
      for (const marker of markerCandidates) {
        if (looksLikeNoiseMarker(marker)) {
          continue;
        }
        const baseCandidate = parseSingleRow(`${marker} ${cluster.text}`, 0.78, profile);
        pushIfValid(baseCandidate);

        if (trailing && trailing.xStart - cluster.xEnd <= 120 && looksLikeResultSegment(trailing.text)) {
          pushIfValid(parseSingleRow(`${marker} ${cluster.text} ${trailing.text}`, 0.79, profile));
        }
      }
    }
  }

  return parsedRows;
};

const looksLikeHistorySheetLayout = (text: string): boolean => {
  const normalized = cleanWhitespace(text).toLowerCase();
  const hasBaseline = /\bbaseline\b/.test(normalized);
  const hasPerWeekOrProtocols = /\bper\s+week\b/.test(normalized) || /\bprotocols?\b/.test(normalized);
  const hasFreeTestosteroneCalculated = /\bfree\s+testosterone\b/.test(normalized) && /\bcalculated\b/.test(normalized);
  const hasKnownLabcorpIssue = /\bknown\s+labcorp\s+unit\s+issue\b/.test(normalized);
  return hasBaseline && hasPerWeekOrProtocols && (hasFreeTestosteroneCalculated || hasKnownLabcorpIssue);
};

const HISTORY_MARKER_CONFIGS: HistoryMarkerConfig[] = [
  {
    canonicalMarker: "Testosterone",
    markerName: "Testosterone (Total)",
    headingPattern: /\btestosterone\b/i,
    rejectHeadingPattern: /\b(?:free|calculated|bioavailable)\b/i,
    valueRejectPattern: /\b(?:range|ref|baseline|per\s+week|assay|calculator|bioavailable|balance|https?:\/\/|www\.)\b/i,
    allowedUnits: ["nmol/L", "ng/dL", "ng/mL"],
    xTolerance: 95
  },
  {
    canonicalMarker: "Free Testosterone",
    markerName: "Free Testosterone",
    headingPattern: /\b(?:free\s+testosterone|testosterone\s*,?\s*free)\b/i,
    rejectHeadingPattern: /\b(?:calculated|bioavailable)\b/i,
    valueRejectPattern: /\b(?:range|ref|baseline|per\s+week|calculator|bioavailable|balance|https?:\/\/|www\.)\b/i,
    allowedUnits: ["pmol/L", "ng/dL", "pg/mL", "nmol/L"],
    xTolerance: 95
  },
  {
    canonicalMarker: "SHBG",
    markerName: "SHBG",
    headingPattern: /\bshbg\b/i,
    valueRejectPattern: /\b(?:range|ref|baseline|per\s+week|calculator|https?:\/\/|www\.)\b/i,
    allowedUnits: ["nmol/L"],
    xTolerance: 82
  }
];

const unitPriorityScore = (unit: string, allowedUnits: string[]): number => {
  const normalized = normalizeUnit(unit);
  const rank = allowedUnits.findIndex((allowed) => normalizeUnit(allowed) === normalized);
  return rank === -1 ? -40 : Math.max(0, (allowedUnits.length - rank) * 14);
};

const parseHistoryCurrentColumnRows = (rows: PdfSpatialRow[], text: string, profile: ParserProfile): ParsedFallbackRow[] => {
  if (!looksLikeHistorySheetLayout(text) || rows.length === 0) {
    return [];
  }

  const rowBundles = [...rows]
    .sort((a, b) => {
      if (a.page !== b.page) {
        return a.page - b.page;
      }
      if (Math.abs(a.y - b.y) > SPATIAL_ROW_Y_GROUP_TOLERANCE) {
        return b.y - a.y;
      }
      return (a.items[0]?.x ?? 0) - (b.items[0]?.x ?? 0);
    })
    .map((row) => ({
      row,
      clusters: clusterSpatialRowItems(row.items)
    }))
    .filter((bundle) => bundle.clusters.length > 0);

  const parsedRows: ParsedFallbackRow[] = [];

  for (const config of HISTORY_MARKER_CONFIGS) {
    const headingXs: number[] = [];
    for (const bundle of rowBundles) {
      for (const cluster of bundle.clusters) {
        const headingText = cleanWhitespace(cluster.text);
        if (!headingText || /\d/.test(headingText)) {
          continue;
        }
        if (!config.headingPattern.test(headingText)) {
          continue;
        }
        if (config.rejectHeadingPattern?.test(headingText)) {
          continue;
        }
        if (looksLikeNoiseMarker(headingText)) {
          continue;
        }
        headingXs.push((cluster.xStart + cluster.xEnd) / 2);
      }
    }

    if (headingXs.length === 0) {
      continue;
    }

    headingXs.sort((a, b) => a - b);
    const headingX = headingXs[Math.floor(headingXs.length / 2)];

    let best: { row: ParsedFallbackRow; score: number } | null = null;
    for (const bundle of rowBundles) {
      for (const cluster of bundle.clusters) {
        const textValue = cleanWhitespace(cluster.text);
        if (!textValue || !/\d/.test(textValue)) {
          continue;
        }
        if (config.valueRejectPattern?.test(textValue)) {
          continue;
        }

        const centerX = (cluster.xStart + cluster.xEnd) / 2;
        if (Math.abs(centerX - headingX) > config.xTolerance) {
          continue;
        }

        // Special case for compact conversion notation like "38.1 = 1098 ng/dL".
        if (config.canonicalMarker === "Testosterone") {
          const eqMatch = textValue.match(/(-?\d+(?:[.,]\d+)?)\s*=\s*(-?\d+(?:[.,]\d+)?)\s*(ng\/dL)/i);
          const left = safeNumber(eqMatch?.[1] ?? "");
          const right = safeNumber(eqMatch?.[2] ?? "");
          if (eqMatch && left !== null && right !== null && right !== 0) {
            const converted = left * 28.84;
            const ratioDelta = Math.abs(converted - right) / right;
            if (ratioDelta < 0.08) {
              const inferred: ParsedFallbackRow = {
                markerName: config.markerName,
                value: left,
                unit: "nmol/L",
                referenceMin: null,
                referenceMax: null,
                confidence: 0.9
              };
              const score = bundle.row.y + 45;
              if (!best || score > best.score) {
                best = { row: inferred, score };
              }
            }
          }
        }

        const pairMatches = Array.from(
          textValue.matchAll(/([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*(nmol\/L|pmol\/L|ng\/dL|pg\/mL|ng\/mL|mIU\/mL|IU\/L|%|L\/L)/gi)
        );
        for (const match of pairMatches) {
          const value = safeNumber(match[1].replace(/\s+/g, ""));
          const unit = normalizeUnit(match[2]);
          if (value === null) {
            continue;
          }
          if (!config.allowedUnits.some((allowed) => normalizeUnit(allowed) === unit)) {
            continue;
          }
          if (!isPlausibleSpatialMeasurement(config.canonicalMarker, unit, value)) {
            continue;
          }

          const candidate: ParsedFallbackRow = {
            markerName: config.markerName,
            value,
            unit,
            referenceMin: null,
            referenceMax: null,
            confidence: 0.89
          };
          if (!shouldKeepParsedRow(candidate, profile)) {
            continue;
          }

          const score = bundle.row.y + unitPriorityScore(unit, config.allowedUnits);
          if (!best || score > best.score) {
            best = { row: candidate, score };
          }
        }
      }
    }

    if (best) {
      parsedRows.push(best.row);
    }
  }

  return parsedRows;
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

const pushTemplateRow = (
  rows: ParsedFallbackRow[],
  profile: ParserProfile,
  markerName: string,
  rawValue: string,
  unit: string,
  referenceMin: number | null = null,
  referenceMax: number | null = null,
  confidence = 0.78
) => {
  const value = safeNumber(rawValue);
  if (value === null) {
    return;
  }
  const row: ParsedFallbackRow = {
    markerName: applyProfileMarkerFixes(cleanMarkerName(markerName)),
    value,
    unit: normalizeUnit(unit),
    referenceMin,
    referenceMax,
    confidence
  };
  if (shouldKeepParsedRow(row, profile)) {
    rows.push(row);
  }
};

const parseGenovaHormoneRows = (text: string, profile: ParserProfile): ParsedFallbackRow[] => {
  if (!/\b(?:genova diagnostics|male hormonal health|mhh1\.)\b/i.test(text)) {
    return [];
  }
  const rows: ParsedFallbackRow[] = [];

  const dheaMatch = text.match(/([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s+DHEA\s*Sulfate\s*\(serum\)/i);
  if (dheaMatch) {
    pushTemplateRow(rows, profile, "DHEA Sulfate", dheaMatch[1], "mcg/dL", 85, 690, 0.83);
  }

  const shbgMatch = text.match(/([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s+Sex Hormone Binding Globulin,?\s*SHBG/i);
  if (shbgMatch) {
    pushTemplateRow(rows, profile, "SHBG", shbgMatch[1], "nmol/L", 13.3, 89.5, 0.83);
  }

  const estradiolMatch = text.match(/Estradiol\s*\(serum\)\s*([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)/i);
  if (estradiolMatch) {
    pushTemplateRow(rows, profile, "Estradiol", estradiolMatch[1], "pg/mL", 15, 32, 0.82);
  }

  const freeTMatch = text.match(/Free Testosterone\s*\(serum\)\s*([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)/i);
  if (freeTMatch) {
    pushTemplateRow(rows, profile, "Free Testosterone", freeTMatch[1], "pg/mL", 5, 253, 0.82);
  }

  const psaMatch = text.match(/([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s+Prostate Specific Antigen,?\s*PSA\s*\(serum\)/i);
  if (psaMatch) {
    pushTemplateRow(rows, profile, "PSA", psaMatch[1], "ng/mL", null, 4, 0.82);
  }

  const fshMatch = text.match(/Follicular Stimulating Hormone,?\s*FSH\s*\(serum\)\s*([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)/i);
  if (fshMatch) {
    pushTemplateRow(rows, profile, "FSH", fshMatch[1], "mIU/mL", 1.5, 12.4, 0.8);
  }

  const lhMatch = text.match(/Luteinizing Hormone\s*\(serum\)\s*([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)/i);
  if (lhMatch) {
    pushTemplateRow(rows, profile, "LH", lhMatch[1], "mIU/mL", 1.7, 8.6, 0.8);
  }

  const prolactinMatch = text.match(/Prolactin\s*\(serum\)\s*([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)/i);
  if (prolactinMatch) {
    pushTemplateRow(rows, profile, "Prolactin", prolactinMatch[1], "ng/mL", 2.64, 13.13, 0.8);
  }

  return rows;
};

const parseZrtCompactRows = (text: string, profile: ParserProfile): ParsedFallbackRow[] => {
  if (!/\b(?:comprehensive male profile ii|zrt laboratory)\b/i.test(text)) {
    return [];
  }
  const rows: ParsedFallbackRow[] = [];

  const cortisolPattern =
    /Cortisol\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)(?:\s+(?:H|L))?\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)\s*ng\/mL\s*\((morning|noon|evening|night)\)/gi;
  for (const match of text.matchAll(cortisolPattern)) {
    pushTemplateRow(
      rows,
      profile,
      `Cortisol (${match[4]})`,
      match[1],
      "ng/mL",
      safeNumber(match[2]),
      safeNumber(match[3]),
      0.8
    );
  }

  const estradiolPattern =
    /Estradiol\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)(?:\s+(?:H|L))?\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)\s*pg\/mL/i;
  const estradiolMatch = text.match(estradiolPattern);
  if (estradiolMatch) {
    pushTemplateRow(
      rows,
      profile,
      "Estradiol",
      estradiolMatch[1],
      "pg/mL",
      safeNumber(estradiolMatch[2]),
      safeNumber(estradiolMatch[3]),
      0.82
    );
  }

  const testosteronePattern =
    /Testosterone\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)(?:\s+(?:H|L))?\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)\s*ng\/dL/i;
  const testosteroneMatch = text.match(testosteronePattern);
  if (testosteroneMatch) {
    pushTemplateRow(
      rows,
      profile,
      "Testosterone",
      testosteroneMatch[1],
      "ng/dL",
      safeNumber(testosteroneMatch[2]),
      safeNumber(testosteroneMatch[3]),
      0.82
    );
  }

  const shbgPattern =
    /SHBG\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)(?:\s+(?:H|L))?\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)\s*nmol\/L/i;
  const shbgMatch = text.match(shbgPattern);
  if (shbgMatch) {
    pushTemplateRow(
      rows,
      profile,
      "SHBG",
      shbgMatch[1],
      "nmol/L",
      safeNumber(shbgMatch[2]),
      safeNumber(shbgMatch[3]),
      0.82
    );
  }

  const dheasPattern =
    /DHEAS\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)(?:\s+(?:H|L))?\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)\s*[μµu]g\/dL/i;
  const dheasMatch = text.match(dheasPattern);
  if (dheasMatch) {
    pushTemplateRow(
      rows,
      profile,
      "DHEA Sulfate",
      dheasMatch[1],
      "ug/dL",
      safeNumber(dheasMatch[2]),
      safeNumber(dheasMatch[3]),
      0.8
    );
  }

  const psaPattern = /PSA\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*[<≤]?\s*(-?\d+(?:[.,]\d+)?)?\s*[-–]?\s*(-?\d+(?:[.,]\d+)?)?\s*ng\/mL/i;
  const psaMatch = text.match(psaPattern);
  if (psaMatch) {
    pushTemplateRow(rows, profile, "PSA", psaMatch[1], "ng/mL", safeNumber(psaMatch[2]), safeNumber(psaMatch[3]), 0.8);
  }

  const freeT4Pattern =
    /Free\s*T4\*?\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)(?:\s+(?:H|L))?\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)\s*ng\/dL/i;
  const freeT4Match = text.match(freeT4Pattern);
  if (freeT4Match) {
    pushTemplateRow(
      rows,
      profile,
      "Free T4",
      freeT4Match[1],
      "ng/dL",
      safeNumber(freeT4Match[2]),
      safeNumber(freeT4Match[3]),
      0.8
    );
  }

  const freeT3Pattern =
    /Free\s*T3\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)(?:\s+(?:H|L))?\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)\s*pg\/mL/i;
  const freeT3Match = text.match(freeT3Pattern);
  if (freeT3Match) {
    pushTemplateRow(
      rows,
      profile,
      "Free T3",
      freeT3Match[1],
      "pg/mL",
      safeNumber(freeT3Match[2]),
      safeNumber(freeT3Match[3]),
      0.8
    );
  }

  const tshPattern =
    /TSH\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)(?:\s+(?:H|L))?\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)\s*(?:μU\/mL|uIU\/mL|mIU\/mL|mU\/L)/i;
  const tshMatch = text.match(tshPattern);
  if (tshMatch) {
    pushTemplateRow(
      rows,
      profile,
      "TSH",
      tshMatch[1],
      "uIU/mL",
      safeNumber(tshMatch[2]),
      safeNumber(tshMatch[3]),
      0.8
    );
  }

  return rows;
};

const parseWardeTesbRows = (text: string, profile: ParserProfile): ParsedFallbackRow[] => {
  if (!/\b(?:testosterone,\s*free,\s*bioavailable and total|warde medical)\b/i.test(text)) {
    return [];
  }
  const rows: ParsedFallbackRow[] = [];

  const totalMatch = text.match(
    /Testosterone,\s*Total(?:,\s*LC\/MS\/MS)?[^\d]{0,40}([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)(?:\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?))?\s*ng\/dL/i
  );
  if (totalMatch) {
    pushTemplateRow(
      rows,
      profile,
      "Testosterone",
      totalMatch[1],
      "ng/dL",
      safeNumber(totalMatch[2]),
      safeNumber(totalMatch[3]),
      0.82
    );
  }

  const freeMatch = text.match(
    /Testosterone,\s*Free[^\d]{0,40}([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)(?:\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?))?\s*pg\/mL/i
  );
  if (freeMatch) {
    pushTemplateRow(
      rows,
      profile,
      "Free Testosterone",
      freeMatch[1],
      "pg/mL",
      safeNumber(freeMatch[2]),
      safeNumber(freeMatch[3]),
      0.82
    );
  }

  const bioMatch = text.match(
    /Testosterone,\s*Bioavail[a-z]*[^\d]{0,40}([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)(?:\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?))?\s*ng\/dL/i
  );
  if (bioMatch) {
    pushTemplateRow(
      rows,
      profile,
      "Bioavailable Testosterone",
      bioMatch[1],
      "ng/dL",
      safeNumber(bioMatch[2]),
      safeNumber(bioMatch[3]),
      0.82
    );
  }

  const shbgMatch = text.match(
    /Sex Hormone Binding Globulin\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)\s*nmol\/L/i
  );
  if (shbgMatch) {
    pushTemplateRow(
      rows,
      profile,
      "SHBG",
      shbgMatch[1],
      "nmol/L",
      safeNumber(shbgMatch[2]),
      safeNumber(shbgMatch[3]),
      0.82
    );
  }

  const albuminMatch = text.match(
    /Albumin\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)\s*g\/dL/i
  );
  if (albuminMatch) {
    pushTemplateRow(
      rows,
      profile,
      "Albumine",
      albuminMatch[1],
      "g/dL",
      safeNumber(albuminMatch[2]),
      safeNumber(albuminMatch[3]),
      0.82
    );
  }

  return rows;
};

const parseLatvianIndexedRows = (text: string, profile: ParserProfile): ParsedFallbackRow[] => {
  if (!/\b(?:e\.\s*gulbja laboratorija|request complete|test title)\b/i.test(text)) {
    return [];
  }

  const rows: ParsedFallbackRow[] = [];
  const normalized = cleanWhitespace(text);
  const rowPattern =
    /(?:^|\s)\d{1,3}\/\d{2,3}\s+A?\s+([A-Za-z0-9][A-Za-z0-9(),.%+\-/ ]{2,80}?)\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s+(?:[ñò⇧⇩↑↓]\s+)?((?:[<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*[-–]\s*(?:-?\d+(?:[.,]\d+)?))(?:\s+([A-Za-z%µμ][A-Za-z%µμ0-9*^/.\-]*))?(?=(?:\s+\(D3\s*\+\s*D2\))?\s+\d{1,3}\/\d{2,3}\s+A?\s+|$)/gi;

  for (const match of normalized.matchAll(rowPattern)) {
    let markerName = applyProfileMarkerFixes(cleanMarkerName(match[1] ?? ""));
    if (/^volume$/i.test(markerName)) {
      markerName = "PCT-plateletcrit";
    }
    if (looksLikeNoiseMarker(markerName)) {
      continue;
    }

    const value = safeNumber(match[2]);
    if (value === null) {
      continue;
    }

    const unit = normalizeUnit(match[4] ?? "");
    const parsedReference = extractReferenceAndUnit(`${match[3] ?? ""} ${unit}`);

    const row: ParsedFallbackRow = {
      markerName,
      value,
      unit,
      referenceMin: parsedReference.referenceMin,
      referenceMax: parsedReference.referenceMax,
      confidence: 0.86
    };
    if (shouldKeepParsedRow(row, profile)) {
      rows.push(row);
    }
  }

  // Some Latvia rows (notably Free Androgen Index) may omit the unit column.
  const freeAndrogenPattern =
    /\b\d{1,3}\/\d{2,3}\s+A?\s+Free Androgen Index\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s+(?:[ñò⇧⇩↑↓]\s+)?(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)(?=\s+\d{1,3}\/\d{2,3}\s+A?\s+|$)/i;
  const freeAndrogenMatch = normalized.match(freeAndrogenPattern);
  if (freeAndrogenMatch) {
    const value = safeNumber(freeAndrogenMatch[1]);
    const referenceMin = safeNumber(freeAndrogenMatch[2]);
    const referenceMax = safeNumber(freeAndrogenMatch[3]);
    if (value !== null) {
      const row: ParsedFallbackRow = {
        markerName: "Free Androgen Index",
        value,
        unit: "",
        referenceMin,
        referenceMax,
        confidence: 0.86
      };
      if (
        shouldKeepParsedRow(row, profile) &&
        !rows.some(
          (item) =>
            item.markerName.toLowerCase() === "free androgen index" &&
            Math.abs(item.value - value) < 0.0001 &&
            (item.referenceMin ?? null) === (referenceMin ?? null) &&
            (item.referenceMax ?? null) === (referenceMax ?? null)
        )
      ) {
        rows.push(row);
      }
    }
  }

  const pctPattern =
    /\b\d{1,3}\/\d{2,3}\s+A?\s+PCT-plateletcrit\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s+(?:[ñò⇧⇩↑↓]\s+)?(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)\s*%/i;
  const pctMatch = normalized.match(pctPattern);
  if (pctMatch) {
    const value = safeNumber(pctMatch[1]);
    const referenceMin = safeNumber(pctMatch[2]);
    const referenceMax = safeNumber(pctMatch[3]);
    if (value !== null) {
      const row: ParsedFallbackRow = {
        markerName: "PCT-plateletcrit",
        value,
        unit: "%",
        referenceMin,
        referenceMax,
        confidence: 0.86
      };
      if (
        shouldKeepParsedRow(row, profile) &&
        !rows.some(
          (item) =>
            item.markerName.toLowerCase() === "pct-plateletcrit" &&
            Math.abs(item.value - value) < 0.0001 &&
            item.unit === "%"
        )
      ) {
        rows.push(row);
      }
    }
  }

  return rows;
};

const parseLondonDoctorSummaryRows = (text: string, profile: ParserProfile): ParsedFallbackRow[] => {
  if (!/\b(?:results for your doctor|londonmedicallaboratory\.com)\b/i.test(text)) {
    return [];
  }

  const sectionStart = text.search(/\bResults for your Doctor\b/i);
  const section = sectionStart >= 0 ? text.slice(sectionStart) : text;
  const rows: ParsedFallbackRow[] = [];

  const pushRange = (
    markerName: string,
    pattern: RegExp,
    unit: string,
    confidence = 0.84
  ) => {
    const match = section.match(pattern);
    if (!match) {
      return;
    }
    pushTemplateRow(
      rows,
      profile,
      markerName,
      match[1],
      unit,
      safeNumber(match[2]),
      safeNumber(match[3]),
      confidence
    );
  };

  const pushUpperBound = (
    markerName: string,
    pattern: RegExp,
    unit: string,
    confidence = 0.84
  ) => {
    const match = section.match(pattern);
    if (!match) {
      return;
    }
    pushTemplateRow(rows, profile, markerName, match[1], unit, null, safeNumber(match[2]), confidence);
  };

  const pushLowerBound = (
    markerName: string,
    pattern: RegExp,
    unit: string,
    confidence = 0.84
  ) => {
    const match = section.match(pattern);
    if (!match) {
      return;
    }
    pushTemplateRow(rows, profile, markerName, match[1], unit, safeNumber(match[2]), null, confidence);
  };

  pushRange("Hemoglobin", /Haemoglobin\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*g\/L\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "g/L");
  pushRange("Red Blood Cells", /Red Cell Count\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*X10\^?12\/L\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "10^12/L");
  pushRange("Hematocrit", /Haematocrit\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*L\/L\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "L/L");
  pushRange("MCV", /Mean Corpuscular Volume\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*%\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "%");
  pushRange("MCH", /Mean Cell Haemoglobin\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*pg\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "pg");
  pushRange("MCHC", /Mean Cell Haemoglobin Concentration\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*g\/L\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "g/L");
  pushRange("RDW-CV", /Red Cell Distribution Width\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*%\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "%");
  pushRange("Platelets", /Platelet Count\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*X10\^?9\/L\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "10^9/L");
  pushRange("Leukocyten", /White Cell Count\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*X10\^?9\/L\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "10^9/L");
  pushRange("Neutrophils Abs.", /Neutrophils\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*X10\^?9\/L\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "10^9/L");
  pushRange("Lymphocytes Abs.", /Lymphocytes\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*X10\^?9\/L\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "10^9/L");
  pushRange("Monocytes Abs.", /Monocytes\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*(?:X10\^?9\/L|g\/L)\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "10^9/L");
  pushRange("Eosinophils Abs.", /Eosinophils\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*X10\^?9\/L\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "10^9/L");
  pushRange("Basophils Abs.", /Basophils\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*X10\^?9\/L\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "10^9/L");

  pushRange("Albumine", /Albumin\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*g\/L\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "g/L");
  pushRange("Ferritine", /Ferritin\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*ng\/mL\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "ng/mL");
  pushRange("Transferrine Saturatie", /Transferrin Saturation\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*%\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "%");
  pushRange("Ureum", /Urea\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*mmol\/L\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "mmol/L");
  pushRange("Creatinine", /Creatinine\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*umol\/L\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "umol/L");
  pushLowerBound(
    "eGFR",
    /estimated Glomerular Filtration Rate\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*mL\/min\/\s*1\.73m2\s*[>≥]\s*(-?\d+(?:[.,]\d+)?)/i,
    "mL/min/1.73m2"
  );

  pushRange("Free T4", /Free T4 \(thyroxine\)\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*pmol\/L\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "pmol/L");
  pushRange(
    "TSH",
    /Thyroid Stimulating Hormone\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*uIU\/ML\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i,
    "uIU/mL"
  );

  pushUpperBound("LDL Cholesterol", /Low Density Lipoprotein\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*mmol\/L\s*[<≤]\s*(-?\d+(?:[.,]\d+)?)/i, "mmol/L");
  pushUpperBound("Triglyceriden", /Triglyceride\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*mmol\/L\s*[<≤]\s*(-?\d+(?:[.,]\d+)?)/i, "mmol/L");
  pushUpperBound("Cholesterol", /Total Cholesterol\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*mmol\/L\s*[<≤]\s*(-?\d+(?:[.,]\d+)?)/i, "mmol/L");
  pushRange(
    "Non-HDL Cholesterol",
    /Non-HDL-Cholesterol\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*mmol\/L\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i,
    "mmol/L"
  );
  pushUpperBound(
    "Cholesterol/HDL Ratio",
    /Total Cholesterol:\s*HDL Ratio\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*mmol\/L\s*[<≤]\s*(-?\d+(?:[.,]\d+)?)/i,
    "ratio"
  );
  pushRange(
    "HDL Cholesterol",
    /High Density Lipoprotein\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*mmol\/L\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i,
    "mmol/L"
  );

  pushRange("Foliumzuur", /Folate\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*nmol\/L\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "nmol/L");
  pushRange(
    "Vitamin D (D3+D2) OH",
    /Vitamin D\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*nmol\/L\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i,
    "nmol/L"
  );
  pushRange("Vitamine B12", /Vitamin B12\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*pmol\/L\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "pmol/L");
  pushRange("Testosterone", /Hormones\s+Testosterone\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*nmol\/L\s+(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)/i, "nmol/L");
  pushUpperBound(
    "CRP",
    /High Sensitivity C-Reactive Protein\s+([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)\s*mg\/L\s*[<≤]\s*(-?\d+(?:[.,]\d+)?)/i,
    "mg/L"
  );

  return rows;
};

const incrementReason = (reasons: Map<string, number>, reason: string) => {
  reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
};

const summarizeReasons = (reasons: Map<string, number>): Record<string, number> =>
  Object.fromEntries(
    Array.from(reasons.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
  );

const dedupeRowsDetailed = (rows: ParsedFallbackRow[]): { markers: MarkerValue[]; diagnostics: DedupeDiagnostics } => {
  const byKey = new Map<string, MarkerValue>();
  const rejectionReasons = new Map<string, number>();

  for (const row of rows) {
    const canonicalMarker = canonicalizeMarker(row.markerName, { unit: row.unit, mode: "balanced" });
    const normalized = normalizeMarkerMeasurement({
      canonicalMarker,
      value: row.value,
      unit: row.unit,
      referenceMin: row.referenceMin,
      referenceMax: row.referenceMax
    });
    if (!isAcceptableMarkerCandidate(row.markerName, normalized.unit, normalized.referenceMin, normalized.referenceMax, "fallback")) {
      incrementReason(rejectionReasons, "quality_filter");
      continue;
    }
    if (!isPlausibleNonSpatialMeasurement(canonicalMarker, normalized.unit, normalized.value)) {
      incrementReason(rejectionReasons, "implausible_measurement");
      continue;
    }
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
      rawValue: row.value,
      rawUnit: row.unit,
      rawReferenceMin: row.referenceMin,
      rawReferenceMax: row.referenceMax,
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
    if (!existing) {
      byKey.set(key, markerRecord);
      continue;
    }

    if (markerRecord.confidence > existing.confidence) {
      byKey.set(key, markerRecord);
      incrementReason(rejectionReasons, "duplicate_replaced");
      continue;
    }

    incrementReason(rejectionReasons, "duplicate_dropped");
  }

  const markers = Array.from(byKey.values());
  return {
    markers,
    diagnostics: {
      parsedRowCount: rows.length,
      keptRows: markers.length,
      rejectedRows: Math.max(0, rows.length - markers.length),
      topRejectReasons: summarizeReasons(rejectionReasons)
    }
  };
};

const dedupeRows = (rows: ParsedFallbackRow[]): MarkerValue[] => dedupeRowsDetailed(rows).markers;

const filterMarkerValuesForQuality = (rows: MarkerValue[]): MarkerValue[] =>
  rows.filter((row) => {
    if (!isAcceptableMarkerCandidate(row.marker, row.unit, row.referenceMin, row.referenceMax, "fallback")) {
      return false;
    }
    return isPlausibleNonSpatialMeasurement(row.canonicalMarker, row.unit, row.value);
  });

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

const mergeDedupeReasons = (...reasonMaps: Array<Record<string, number>>): Record<string, number> => {
  const merged = new Map<string, number>();
  reasonMaps.forEach((reasonMap) => {
    Object.entries(reasonMap).forEach(([reason, count]) => {
      merged.set(reason, (merged.get(reason) ?? 0) + count);
    });
  });
  return Object.fromEntries(
    Array.from(merged.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
  );
};

const buildMergedLocalDraft = (
  textDraft: ExtractionDraft,
  ocrDraft: ExtractionDraft,
  sourceText: string,
  sourceFileName: string
): ExtractionDraft => {
  const mergedMarkers = orderMarkersBySourceText(mergeMarkerSets(textDraft.markers, ocrDraft.markers), sourceText);
  const averageConfidence =
    mergedMarkers.length > 0 ? mergedMarkers.reduce((sum, marker) => sum + marker.confidence, 0) / mergedMarkers.length : 0;
  const unitCoverage = mergedMarkers.length > 0 ? mergedMarkers.filter((marker) => marker.unit).length / mergedMarkers.length : 0;
  const referenceCoverage =
    mergedMarkers.length > 0
      ? mergedMarkers.filter((marker) => marker.referenceMin !== null || marker.referenceMax !== null).length / mergedMarkers.length
      : 0;
  const confidenceBase = averageConfidence * 0.62 + unitCoverage * 0.23 + referenceCoverage * 0.15;
  const confidence =
    mergedMarkers.length > 0
      ? Math.min(0.92, Math.max(textDraft.extraction.confidence, ocrDraft.extraction.confidence, confidenceBase))
      : Math.max(textDraft.extraction.confidence, ocrDraft.extraction.confidence);

  return {
    sourceFileName,
    testDate: textDraft.testDate || ocrDraft.testDate || extractDateCandidate(sourceText),
    markers: mergedMarkers,
    extraction: {
      provider: "fallback",
      model: "fallback-merged:text+ocr",
      confidence,
      needsReview: confidence < 0.7 || mergedMarkers.length < 6 || unitCoverage < 0.6
    }
  };
};

const normalizeMarkerOrderLookupText = (value: string): string =>
  cleanWhitespace(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const normalizeMarkerOrderLookupTextLoose = (value: string): string =>
  normalizeMarkerOrderLookupText(value)
    .replace(/[()[\]{}]/g, " ")
    .replace(/[+]/g, " ")
    .replace(/[-_/.,:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildMarkerOrderCandidates = (marker: MarkerValue): string[] => {
  const raw = cleanWhitespace(marker.marker);
  const cleaned = cleanMarkerName(raw);
  const profileFixed = applyProfileMarkerFixes(cleaned);
  const canonical = cleanWhitespace(marker.canonicalMarker);
  const withoutParentheses = profileFixed.replace(/\([^)]*\)/g, " ");
  const uppercaseToken = profileFixed.toUpperCase();

  const candidates = [raw, cleaned, profileFixed, canonical, withoutParentheses]
    .flatMap((candidate) => [normalizeMarkerOrderLookupText(candidate), normalizeMarkerOrderLookupTextLoose(candidate)])
    .filter((candidate) => {
      if (!candidate || looksLikeNoiseMarker(candidate)) {
        return false;
      }
      if (candidate.length >= 3) {
        return true;
      }
      return SHORT_MARKER_ALLOWLIST.has(uppercaseToken) || SHORT_MARKER_ALLOWLIST.has(candidate.toUpperCase());
    });

  return Array.from(new Set(candidates));
};

const orderMarkersBySourceText = (markers: MarkerValue[], sourceText: string): MarkerValue[] => {
  if (markers.length < 2) {
    return markers;
  }

  const haystack = normalizeMarkerOrderLookupText(sourceText);
  const haystackLoose = normalizeMarkerOrderLookupTextLoose(sourceText);
  if (!haystack) {
    return markers;
  }

  const indexCache = new Map<string, number>();
  const indexLooseCache = new Map<string, number>();
  const findFirstIndex = (candidate: string): number => {
    const cached = indexCache.get(candidate);
    if (typeof cached === "number") {
      return cached;
    }
    const index = haystack.indexOf(candidate);
    indexCache.set(candidate, index);
    return index;
  };
  const findFirstIndexLoose = (candidate: string): number => {
    const cached = indexLooseCache.get(candidate);
    if (typeof cached === "number") {
      return cached;
    }
    const index = haystackLoose.indexOf(candidate);
    indexLooseCache.set(candidate, index);
    return index;
  };

  return markers
    .map((marker, originalIndex) => {
      const firstSeenIndex = buildMarkerOrderCandidates(marker)
        .map((candidate) => {
          const strictIndex = findFirstIndex(candidate);
          if (strictIndex >= 0) {
            return strictIndex;
          }
          return findFirstIndexLoose(candidate);
        })
        .filter((index) => index >= 0)
        .reduce((smallest, index) => Math.min(smallest, index), Number.POSITIVE_INFINITY);

      return {
        marker,
        originalIndex,
        firstSeenIndex: Number.isFinite(firstSeenIndex) ? firstSeenIndex : Number.POSITIVE_INFINITY
      };
    })
    .sort((left, right) => {
      if (left.firstSeenIndex !== right.firstSeenIndex) {
        return left.firstSeenIndex - right.firstSeenIndex;
      }
      return left.originalIndex - right.originalIndex;
    })
    .map((entry) => entry.marker);
};

const scoreHistoryMarkerCandidate = (marker: MarkerValue, index: number): number => {
  const preferredUnits = HISTORY_CANONICAL_COLLAPSE_UNITS[marker.canonicalMarker] ?? [];
  const normalizedUnit = normalizeUnit(marker.unit);
  const unitRank = preferredUnits.findIndex((unit) => normalizeUnit(unit) === normalizedUnit);
  const unitScore = unitRank >= 0 ? (preferredUnits.length - unitRank) * 0.12 : 0;
  const hasReference = marker.referenceMin !== null || marker.referenceMax !== null;
  const referenceScore = hasReference ? 0.2 : 0;
  return marker.confidence + unitScore + referenceScore + index * 0.0001;
};

const collapseHistorySheetMarkers = (markers: MarkerValue[]): MarkerValue[] => {
  if (markers.length === 0) {
    return markers;
  }

  const grouped = new Map<string, Array<{ marker: MarkerValue; index: number }>>();
  markers.forEach((marker, index) => {
    const list = grouped.get(marker.canonicalMarker) ?? [];
    list.push({ marker, index });
    grouped.set(marker.canonicalMarker, list);
  });

  const collapsed: MarkerValue[] = [];
  markers.forEach((marker, index) => {
    const targetUnits = HISTORY_CANONICAL_COLLAPSE_UNITS[marker.canonicalMarker];
    if (!targetUnits) {
      collapsed.push(marker);
      return;
    }
    const group = grouped.get(marker.canonicalMarker) ?? [];
    if (group.length <= 1) {
      collapsed.push(marker);
      return;
    }
    const best = group.reduce((currentBest, candidate) => {
      if (!currentBest) {
        return candidate;
      }
      const bestScore = scoreHistoryMarkerCandidate(currentBest.marker, currentBest.index);
      const candidateScore = scoreHistoryMarkerCandidate(candidate.marker, candidate.index);
      return candidateScore > bestScore ? candidate : currentBest;
    }, null as { marker: MarkerValue; index: number } | null);
    if (best?.index === index) {
      collapsed.push(marker);
    }
  });

  return collapsed;
};

const fallbackExtractDetailed = (text: string, fileName: string, spatialRows: PdfSpatialRow[] = []): FallbackExtractOutcome => {
  const profile = detectParserProfile(text, fileName);
  const genovaRows = parseGenovaHormoneRows(text, profile);
  const zrtRows = parseZrtCompactRows(text, profile);
  const wardeRows = parseWardeTesbRows(text, profile);
  const latvianRows = parseLatvianIndexedRows(text, profile);
  const londonRows = parseLondonDoctorSummaryRows(text, profile);
  const lifeLabsRows = parseLifeLabsTableRows(text, profile);
  const historyRows = parseHistoryCurrentColumnRows(spatialRows, text, profile);
  const columnRows = parseColumnRows(text, profile);
  const lineRows = parseLineRows(text, profile);
  const indexedRowsRaw = parseIndexedRows(text, profile);
  const indexedRows = latvianRows.length > 0 ? [] : indexedRowsRaw;
  const looseRows = lineRows.length + columnRows.length < 6 ? parseLooseRows(text, profile) : [];
  const huisartsRows = profile.enableKeywordRangeParser ? parseMijnGezondheidRows(text) : [];

  const nonSpatialRows =
    indexedRows.length > 0
      ? [
          ...genovaRows,
          ...zrtRows,
          ...wardeRows,
          ...latvianRows,
          ...londonRows,
          ...lifeLabsRows,
          ...columnRows,
          ...lineRows,
          ...indexedRows,
          ...looseRows,
          ...huisartsRows
        ]
      : [
          ...genovaRows,
          ...zrtRows,
          ...wardeRows,
          ...latvianRows,
          ...londonRows,
          ...lifeLabsRows,
          ...columnRows,
          ...lineRows,
          ...looseRows,
          ...huisartsRows
        ];
  const nonSpatialDedupe = dedupeRowsDetailed(nonSpatialRows);
  const nonSpatialMarkers = nonSpatialDedupe.markers;
  const nonSpatialImportantCoverage = countImportantCoverage(nonSpatialMarkers);
  const shouldApplySpatialBoost =
    spatialRows.length > 0 &&
    (nonSpatialImportantCoverage < 2 || nonSpatialMarkers.length < 8 || nonSpatialMarkers.length / Math.max(text.split("\n").length, 1) < 0.03);

  const spatialParsedRows = shouldApplySpatialBoost ? parseSpatialRows(spatialRows, profile) : [];
  const combinedRows = [...historyRows, ...nonSpatialRows, ...spatialParsedRows];
  const combinedDedupe = dedupeRowsDetailed(combinedRows);
  const orderedMarkers = orderMarkersBySourceText(combinedDedupe.markers, text);
  const markers = looksLikeHistorySheetLayout(text) ? collapseHistorySheetMarkers(orderedMarkers) : orderedMarkers;

  const averageConfidence =
    markers.length > 0 ? markers.reduce((sum, marker) => sum + marker.confidence, 0) / markers.length : 0;
  const unitCoverage = markers.length > 0 ? markers.filter((marker) => marker.unit).length / markers.length : 0;
  const referenceCoverage =
    markers.length > 0
      ? markers.filter((marker) => marker.referenceMin !== null || marker.referenceMax !== null).length / markers.length
      : 0;
  const uniqueCanonicalCount = new Set(markers.map((marker) => marker.canonicalMarker)).size;
  const canonicalDiversity = markers.length > 0 ? uniqueCanonicalCount / markers.length : 0;
  const importantCoverage = countImportantCoverage(markers);
  const hormoneSignal = HORMONE_SIGNAL_PATTERN.test(text);
  const duplicatePenalty =
    markers.length >= 12 && canonicalDiversity < 0.72 ? (0.72 - canonicalDiversity) * 0.45 : 0;
  const sparseReferencePenalty =
    markers.length >= 8 && referenceCoverage < 0.25 ? (0.25 - referenceCoverage) * 0.35 : 0;
  const historyLayoutPenalty = looksLikeHistorySheetLayout(text) && markers.length >= 8 ? 0.06 : 0;
  const unitSignal = profile.requireUnit ? unitCoverage : Math.max(unitCoverage, 0.35);
  const confidenceBase = averageConfidence * 0.64 + unitSignal * 0.2 + referenceCoverage * 0.16;
  const confidence =
    markers.length > 0
      ? Math.max(0.1, Math.min(0.9, confidenceBase - duplicatePenalty - sparseReferencePenalty - historyLayoutPenalty))
      : 0.1;

  return {
    draft: {
      sourceFileName: fileName,
      testDate: extractDateCandidate(text),
      markers,
      extraction: {
        provider: "fallback",
        model: `fallback-layered:${profile.id}`,
        confidence,
        needsReview:
          confidence < 0.7 ||
          markers.length === 0 ||
          (profile.requireUnit && unitCoverage < 0.7) ||
          (markers.length >= 8 && referenceCoverage < 0.2) ||
          (hormoneSignal && importantCoverage < 2)
      }
    },
    diagnostics: {
      parsedRowCount: combinedRows.length,
      keptRows: combinedDedupe.diagnostics.keptRows,
      rejectedRows: combinedDedupe.diagnostics.rejectedRows,
      topRejectReasons:
        Object.keys(combinedDedupe.diagnostics.topRejectReasons).length > 0
          ? combinedDedupe.diagnostics.topRejectReasons
          : nonSpatialDedupe.diagnostics.topRejectReasons
    }
  };
};

const fallbackExtract = (text: string, fileName: string, spatialRows: PdfSpatialRow[] = []): ExtractionDraft =>
  fallbackExtractDetailed(text, fileName, spatialRows).draft;

interface GeminiExtractionAttemptResult {
  draft: ExtractionDraft | null;
  warningCode?: ExtractionWarningCode;
  aiReason?: ExtractionAIReason;
  usage?: { inputTokens: number; outputTokens: number };
  cacheHit?: boolean;
}

const callGeminiExtraction = async (
  pdfText: string,
  fileName: string,
  rawPdfBuffer: ArrayBuffer,
  requestOptions: GeminiRequestOptions
): Promise<GeminiExtractionAttemptResult> => {
  const compactText = compactTextForAi(pdfText);
  const sanitizedInput = sanitizeParserTextForAI(compactText, fileName);
  const shouldAttachPdf =
    requestOptions.mode === "pdf_rescue" &&
    Boolean(requestOptions.allowPdfAttachment) &&
    rawPdfBuffer.byteLength > 0 &&
    rawPdfBuffer.byteLength <= MAX_PDF_RESCUE_BYTES;
  const pdfBase64 = shouldAttachPdf ? arrayBufferToBase64(rawPdfBuffer) : null;

  const cached = getCachedAiExtraction(requestOptions.fileHash, requestOptions.mode);
  if (cached?.markers?.length) {
    const rawMarkers = Array.isArray(cached.markers) ? cached.markers : [];
    const cachedMarkers = orderMarkersBySourceText(
      filterMarkerValuesForQuality(
      rawMarkers
        .map(normalizeMarker)
        .filter((row): row is MarkerValue => Boolean(row))
        .filter((row) => isAcceptableMarkerCandidate(row.marker, row.unit, row.referenceMin, row.referenceMax, "claude"))
      ),
      pdfText
    );
    if (cachedMarkers.length > 0) {
      const confidence = cachedMarkers.reduce((sum, row) => sum + row.confidence, 0) / Math.max(cachedMarkers.length, 1);
      return {
        draft: {
          sourceFileName: fileName,
          testDate: cached.testDate && /^\d{4}-\d{2}-\d{2}$/.test(cached.testDate) ? cached.testDate : extractDateCandidate(pdfText),
          markers: cachedMarkers,
          extraction: {
            provider: "gemini",
            model: `${cached.model ?? "gemini-2.5-flash-lite"}+api`,
            confidence,
            needsReview: confidence < 0.7 || cachedMarkers.length < 4
          }
        },
        aiReason: "cache_hit",
        cacheHit: true,
        usage: {
          inputTokens: cached.usage?.inputTokens ?? 0,
          outputTokens: cached.usage?.outputTokens ?? 0
        }
      };
    }
  }

  const payload = {
    fileName: sanitizedInput.fileName,
    pdfText: sanitizedInput.text,
    pdfBase64,
    mode: requestOptions.mode,
    fileHash: requestOptions.fileHash,
    traceId: requestOptions.traceId
  };

  const fetchGeminiRoute = async (): Promise<{ body: GeminiExtractionResponse | null; warningCode?: ExtractionWarningCode }> => {
    let response: Response | null = null;
    try {
      response = await fetch("/api/gemini/extract", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    } catch {
      return { body: null };
    }

    const contentType = response.headers.get("content-type") ?? "";
    const canParseJson = /application\/json/i.test(contentType);
    const body = canParseJson ? ((await response.json()) as GeminiExtractionResponse) : null;
    if (response.ok) {
      return { body };
    }

    if (response.status === 429 && body?.error?.code === "AI_BUDGET_EXCEEDED") {
      return { body: null, warningCode: "PDF_AI_SKIPPED_BUDGET" };
    }
    if (response.status === 503 && body?.error?.code === "AI_LIMITS_UNAVAILABLE") {
      return { body: null, warningCode: "PDF_AI_LIMITS_UNAVAILABLE" };
    }
    if (response.status === 429) {
      return { body: null, warningCode: "PDF_AI_SKIPPED_RATE_LIMIT" };
    }
    if (response.status === 422 && body?.error?.code === "AI_EMPTY_MARKERS") {
      return {
        body: null,
        warningCode: requestOptions.mode === "text_only" ? "PDF_AI_TEXT_ONLY_INSUFFICIENT" : "PDF_AI_PDF_RESCUE_FAILED"
      };
    }
    return { body: null };
  };

  const callGeminiDirect = async (): Promise<GeminiExtractionResponse | null> => {
    if (!import.meta.env.DEV) {
      return null;
    }
    const directGeminiKey = String(import.meta.env.VITE_GEMINI_API_KEY ?? "").trim();
    if (!directGeminiKey) {
      return null;
    }

    const parts: Array<Record<string, unknown>> = [{ text: buildAiExtractionPrompt(sanitizedInput.fileName, sanitizedInput.text) }];
    if (pdfBase64) {
      parts.push({
        inline_data: {
          mime_type: "application/pdf",
          data: pdfBase64
        }
      });
    }

    for (const model of GEMINI_MODEL_CANDIDATES) {
      let directResponse: Response;
      try {
        directResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(directGeminiKey)}`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({
              generationConfig: {
                temperature: 0,
                maxOutputTokens: 900,
                responseMimeType: "application/json"
              },
              contents: [
                {
                  role: "user",
                  parts
                }
              ]
            })
          }
        );
      } catch {
        continue;
      }

      if (!directResponse.ok) {
        if (directResponse.status === 404) {
          continue;
        }
        break;
      }

      let rawBody: unknown;
      try {
        rawBody = await directResponse.json();
      } catch {
        continue;
      }

      const candidateText =
        (rawBody as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const jsonBlock = extractJsonBlock(candidateText);
      if (!jsonBlock) {
        continue;
      }
      try {
        const parsed = JSON.parse(jsonBlock) as GeminiExtractionResponse;
        if (Array.isArray(parsed.markers) && parsed.markers.length > 0) {
          return {
            model,
            testDate: parsed.testDate,
            markers: parsed.markers
          };
        }
      } catch {
        continue;
      }
    }

    return null;
  };

  const routeResult = await fetchGeminiRoute();
  let body = routeResult.body;
  if (!body) {
    body = await callGeminiDirect();
  }

  if (!body) {
    return {
      draft: null,
      warningCode: routeResult.warningCode
    };
  }

  const rawMarkers = Array.isArray(body.markers) ? body.markers : [];
  const geminiMarkers = rawMarkers
    .map(normalizeMarker)
    .filter((row): row is MarkerValue => Boolean(row))
    .filter((row) => isAcceptableMarkerCandidate(row.marker, row.unit, row.referenceMin, row.referenceMax, "claude"));

  const markers = orderMarkersBySourceText(filterMarkerValuesForQuality(geminiMarkers), pdfText);
  if (markers.length === 0) {
    return {
      draft: null,
      warningCode: routeResult.warningCode
    };
  }

  const confidence = markers.reduce((sum, row) => sum + row.confidence, 0) / Math.max(markers.length, 1);
  const usage = {
    inputTokens: Math.max(0, Math.round(body.usage?.inputTokens ?? 0)),
    outputTokens: Math.max(0, Math.round(body.usage?.outputTokens ?? 0))
  };

  putCachedAiExtraction(requestOptions.fileHash, requestOptions.mode, {
    ...body,
    usage
  });

  return {
    draft: {
      sourceFileName: fileName,
      testDate: body.testDate && /^\d{4}-\d{2}-\d{2}$/.test(body.testDate) ? body.testDate : extractDateCandidate(pdfText),
      markers,
      extraction: {
        provider: "gemini",
        model: `${body.model ?? "gemini-2.5-flash-lite"}+api`,
        confidence,
        needsReview: confidence < 0.7 || markers.length < 4
      }
    },
    aiReason: body.cacheHit ? "cache_hit" : "auto_low_quality",
    usage,
    cacheHit: Boolean(body.cacheHit)
  };
};

const buildLocalExtractionWarnings = (
  textResult: PdfTextExtractionResult,
  textExtractionFailed: boolean,
  ocrResult: OcrResult,
  draft: ExtractionDraft,
  aiWarnings: ExtractionWarningCode[] = []
): { warningCode?: ExtractionWarningCode; warnings: string[] } => {
  const warnings: string[] = [];
  let warningCode: ExtractionWarningCode | undefined;

  const pushWarning = (code: ExtractionWarningCode) => {
    warnings.push(code);
    if (!warningCode) {
      warningCode = code;
    }
  };

  if (textExtractionFailed) {
    pushWarning("PDF_TEXT_EXTRACTION_FAILED");
  }

  if (textResult.textItemCount === 0) {
    pushWarning("PDF_TEXT_LAYER_EMPTY");
  }

  if (ocrResult.initFailed) {
    pushWarning("PDF_OCR_INIT_FAILED");
  } else if (ocrResult.used && ocrResult.pagesFailed > 0) {
    pushWarning("PDF_OCR_PARTIAL");
  }

  const markerCount = draft.markers.length;
  const referenceCoverage =
    markerCount > 0
      ? draft.markers.filter((marker) => marker.referenceMin !== null || marker.referenceMax !== null).length / markerCount
      : 0;
  const canonicalDiversity =
    markerCount > 0 ? new Set(draft.markers.map((marker) => marker.canonicalMarker)).size / markerCount : 0;
  const duplicateHeavy = markerCount >= 12 && canonicalDiversity < 0.72;
  const sparseReferences = markerCount >= 8 && referenceCoverage < 0.28;
  const historyLikeLayout = looksLikeHistorySheetLayout(textResult.text);
  const historySparseSignal =
    historyLikeLayout && markerCount >= 8 && referenceCoverage < 0.3 && draft.extraction.confidence < 0.7;

  const likelyUnknownLayout =
    (textResult.textItemCount > 0 || ocrResult.used) &&
    (
      (markerCount <= 3 && draft.extraction.confidence < 0.55) ||
      ((duplicateHeavy && sparseReferences) && (draft.extraction.confidence < 0.8 || historyLikeLayout)) ||
      historySparseSignal
    );
  if (likelyUnknownLayout) {
    pushWarning("PDF_UNKNOWN_LAYOUT");
  }

  if (draft.extraction.confidence < 0.65 || draft.markers.length < 6) {
    pushWarning("PDF_LOW_CONFIDENCE_LOCAL");
  }

  aiWarnings.forEach((code) => pushWarning(code));

  return {
    warningCode,
    warnings: Array.from(new Set(warnings))
  };
};

const EXTRACTION_WARNING_CODE_SET: ReadonlySet<ExtractionWarningCode> = new Set<ExtractionWarningCode>([
  "PDF_TEXT_LAYER_EMPTY",
  "PDF_TEXT_EXTRACTION_FAILED",
  "PDF_OCR_INIT_FAILED",
  "PDF_OCR_PARTIAL",
  "PDF_LOW_CONFIDENCE_LOCAL",
  "PDF_UNKNOWN_LAYOUT",
  "PDF_AI_TEXT_ONLY_INSUFFICIENT",
  "PDF_AI_PDF_RESCUE_SKIPPED_COST_MODE",
  "PDF_AI_PDF_RESCUE_SKIPPED_SIZE",
  "PDF_AI_PDF_RESCUE_FAILED",
  "PDF_AI_SKIPPED_COST_MODE",
  "PDF_AI_SKIPPED_BUDGET",
  "PDF_AI_SKIPPED_RATE_LIMIT",
  "PDF_AI_LIMITS_UNAVAILABLE",
  "PDF_AI_CONSENT_REQUIRED",
  "PDF_AI_DISABLED_BY_PARSER_MODE"
]);

const collectDraftWarningCodes = (draft: ExtractionDraft): ExtractionWarningCode[] =>
  Array.from(
    new Set([...(draft.extraction.warnings ?? []), ...(draft.extraction.warningCode ? [draft.extraction.warningCode] : [])])
  ).filter((code): code is ExtractionWarningCode => EXTRACTION_WARNING_CODE_SET.has(code as ExtractionWarningCode));

export const assessParserUncertainty = (draft: ExtractionDraft): ParserUncertaintyAssessment => {
  const warnings = collectDraftWarningCodes(draft);
  const reasons = new Set<ParserUncertaintyAssessment["reasons"][number]>();
  const markerCount = draft.markers.length;
  const confidence = draft.extraction.confidence;
  const unitCoverage = markerCount > 0 ? draft.markers.filter((marker) => marker.unit.trim().length > 0).length / markerCount : 0;

  if (warnings.includes("PDF_UNKNOWN_LAYOUT")) {
    reasons.add("warning_unknown_layout");
  }
  if (warnings.includes("PDF_TEXT_EXTRACTION_FAILED")) {
    reasons.add("warning_text_extraction_failed");
  }
  if (warnings.includes("PDF_OCR_INIT_FAILED")) {
    reasons.add("warning_ocr_init_failed");
  }
  if (warnings.includes("PDF_TEXT_LAYER_EMPTY")) {
    reasons.add("warning_text_layer_empty");
  }
  if (markerCount < 4) {
    reasons.add("marker_count_low");
  }
  if (confidence < 0.55) {
    reasons.add("confidence_very_low");
  }
  if (confidence < 0.62 && unitCoverage < 0.55) {
    reasons.add("confidence_and_unit_coverage_low");
  }

  return {
    isUncertain: reasons.size > 0,
    reasons: Array.from(reasons),
    markerCount,
    confidence,
    unitCoverage,
    warnings
  };
};

const withExtractionMetadata = (
  draft: ExtractionDraft,
  warningMeta: { warningCode?: ExtractionWarningCode; warnings: string[] },
  debug: ExtractionDebugInfo
): ExtractionDraft => ({
  ...draft,
  extraction: {
    ...draft.extraction,
    warningCode: warningMeta.warningCode,
    warnings: warningMeta.warnings.length > 0 ? warningMeta.warnings : undefined,
    debug
  }
});

const buildNormalizationSummary = (
  markers: MarkerValue[]
): NonNullable<ExtractionDebugInfo["normalizationSummary"]> => {
  return markers.reduce(
    (summary, marker) => {
      const resolved = resolveCanonicalMarker({
        rawName: marker.marker,
        unit: marker.unit,
        mode: "balanced"
      });
      if (resolved.method === "override") {
        summary.overridesHit += 1;
      }
      if (resolved.canonicalMarker === "Unknown Marker") {
        summary.unknownCount += 1;
      }
      if (resolved.confidence < 0.6) {
        summary.lowConfidenceCount += 1;
      }
      return summary;
    },
    {
      overridesHit: 0,
      unknownCount: 0,
      lowConfidenceCount: 0
    }
  );
};

export const extractLabData = async (file: File, options: ExtractLabDataOptions = {}): Promise<ExtractionDraft> => {
  try {
    const onStageChange = options.onStageChange ?? (() => {});
    const emitStage = (stage: ParserStage) => {
      try {
        onStageChange(stage);
      } catch {
        // Stage callback is best-effort and should never break parsing.
      }
    };
    emitStage("reading_text_layer");

    setMarkerAliasOverrides(options.markerAliasOverrides ?? null);
    const costMode: AICostMode = options.costMode ?? "balanced";
    const aiAutoImproveEnabled = options.aiAutoImproveEnabled ?? false;
    const externalAiAllowed = options.externalAiAllowed ?? false;
    const consent = options.aiConsent ?? null;
    const preferAiResultWhenForced = options.preferAiResultWhenForced ?? false;
    const parserDebugMode: ParserDebugMode = options.parserDebugMode ?? "text_ocr_ai";
    const allowOcr = parserDebugMode !== "text_only";
    const allowAiByMode = parserDebugMode === "text_ocr_ai";
    const allowAi = allowAiByMode && externalAiAllowed && Boolean(consent?.allowExternalAi) && Boolean(consent?.parserRescueEnabled);
    const forceAi = Boolean(options.forceAi) && allowAi;
    const forceAiRequested = Boolean(options.forceAi);
    const originalArrayBuffer = await file.arrayBuffer();
    const sourceBytes = new Uint8Array(originalArrayBuffer);
    const cloneArrayBuffer = (): ArrayBuffer => sourceBytes.slice().buffer as ArrayBuffer;
    const fileHash = await hashArrayBuffer(cloneArrayBuffer());
    const traceId = createId();

    const makeEmptyDraft = (model: string): ExtractionDraft => ({
      sourceFileName: file.name,
      testDate: "",
      markers: [],
      extraction: {
        provider: "fallback",
        model,
        confidence: 0,
        needsReview: true
      }
    });

    const emptyDiagnostics = (): DedupeDiagnostics => ({
      parsedRowCount: 0,
      keptRows: 0,
      rejectedRows: 0,
      topRejectReasons: {}
    });

    let textResult: PdfTextExtractionResult;
    let textExtractionFailed = false;
    try {
      textResult = await extractPdfText(cloneArrayBuffer());
    } catch (error) {
      textExtractionFailed = true;
      console.warn("[extractLabData] PDF text extraction failed; continuing with OCR-only fallback.", error);
      textResult = {
        text: "",
        pageCount: 0,
        textItemCount: 0,
        lineCount: 0,
        nonWhitespaceChars: 0,
        spatialRows: []
      };
    }

    let textFallback: FallbackExtractOutcome | null = null;
    let ocrFallback: FallbackExtractOutcome | null = null;

    let ocrResult: OcrResult = {
      text: "",
      used: false,
      pagesAttempted: 0,
      pagesSucceeded: 0,
      pagesFailed: 0,
      initFailed: false,
      timedOut: false
    };

    if (textResult.textItemCount > 0 && textResult.text.trim().length > 0) {
      textFallback = fallbackExtractDetailed(textResult.text, file.name, textResult.spatialRows);
      console.info(
        `[extractLabData] Local text parse: ${textFallback.draft.markers.length} markers, confidence ${textFallback.draft.extraction.confidence.toFixed(2)}, important ${countImportantCoverage(textFallback.draft.markers)}`
      );
      if (isLocalDraftGoodEnough(textFallback.draft) && !forceAi && costMode !== "max_accuracy") {
        console.info("[extractLabData] Route: local-text (good enough)");
        const warningMeta = buildLocalExtractionWarnings(textResult, textExtractionFailed, ocrResult, textFallback.draft);
        emitStage("done");
        return withExtractionMetadata(
          {
            ...textFallback.draft,
            extraction: {
              ...textFallback.draft.extraction,
              costMode,
              aiUsed: false,
              aiReason: "local_high_quality",
              needsReview: textFallback.draft.extraction.needsReview || warningMeta.warnings.length > 0
            }
          },
          warningMeta,
          {
            textItems: textResult.textItemCount,
            ocrUsed: false,
            ocrPages: 0,
            keptRows: textFallback.diagnostics.keptRows,
            rejectedRows: textFallback.diagnostics.rejectedRows,
            topRejectReasons: textFallback.diagnostics.topRejectReasons,
            extractionRoute: "local-text"
          }
        );
      }
    }

    const emptyDraft = makeEmptyDraft("fallback-empty");
    const pickBestLocalCandidate = (): { draft: ExtractionDraft; route: ExtractionRoute; diagnostics: DedupeDiagnostics } => {
      if (textFallback && ocrFallback) {
        const mergedDraft = buildMergedLocalDraft(
          textFallback.draft,
          ocrFallback.draft,
          [textResult.text, ocrResult.text].filter(Boolean).join("\n"),
          file.name
        );
        const mergedDiagnostics: DedupeDiagnostics = {
          parsedRowCount: textFallback.diagnostics.parsedRowCount + ocrFallback.diagnostics.parsedRowCount,
          keptRows: mergedDraft.markers.length,
          rejectedRows: Math.max(
            0,
            textFallback.diagnostics.parsedRowCount + ocrFallback.diagnostics.parsedRowCount - mergedDraft.markers.length
          ),
          topRejectReasons: mergeDedupeReasons(textFallback.diagnostics.topRejectReasons, ocrFallback.diagnostics.topRejectReasons)
        };
        const candidates: Array<{ draft: ExtractionDraft; route: ExtractionRoute; diagnostics: DedupeDiagnostics }> = [
          {
            draft: textFallback.draft,
            route: "local-text",
            diagnostics: textFallback.diagnostics
          },
          {
            draft: ocrFallback.draft,
            route: "local-ocr",
            diagnostics: ocrFallback.diagnostics
          },
          {
            draft: mergedDraft,
            route: "local-text-ocr-merged",
            diagnostics: mergedDiagnostics
          }
        ];
        return candidates.reduce((best, candidate) =>
          scoreFallbackDraft(candidate.draft) > scoreFallbackDraft(best.draft) ? candidate : best
        );
      }
      if (ocrFallback) {
        return {
          draft: ocrFallback.draft,
          route: "local-ocr",
          diagnostics: ocrFallback.diagnostics
        };
      }
      if (textFallback) {
        return {
          draft: textFallback.draft,
          route: "local-text",
          diagnostics: textFallback.diagnostics
        };
      }
      return {
        draft: emptyDraft,
        route: "empty",
        diagnostics: emptyDiagnostics()
      };
    };

    const baseDraft = textFallback?.draft ?? emptyDraft;
    const needsOcr = allowOcr && (textExtractionFailed || shouldUseOcrFallback(textResult, baseDraft));
    const canRunOcr = needsOcr && isBrowserRuntime();

    if (canRunOcr) {
      emitStage("running_ocr");
      console.info("[extractLabData] Attempting OCR fallback...");
      ocrResult = {
        text: "",
        used: true,
        pagesAttempted: textResult.pageCount > 0 ? Math.min(textResult.pageCount, OCR_MAX_PAGES) : 0,
        pagesSucceeded: 0,
        pagesFailed: 0,
        initFailed: false,
        timedOut: false
      };
      ocrResult = await withTimeout(
        extractPdfTextViaOcr(cloneArrayBuffer()),
        OCR_TOTAL_TIMEOUT_MS,
        "OCR total timeout"
      ).catch((error) => {
        console.warn("[extractLabData] OCR timeout or crash", error);
        return {
          text: "",
          used: true,
          pagesAttempted: textResult.pageCount > 0 ? Math.min(textResult.pageCount, OCR_MAX_PAGES) : 0,
          pagesSucceeded: 0,
          pagesFailed: textResult.pageCount > 0 ? Math.min(textResult.pageCount, OCR_MAX_PAGES) : 0,
          initFailed: false,
          timedOut: true
        } satisfies OcrResult;
      });

      console.info(
        `[extractLabData] OCR result: ${ocrResult.pagesSucceeded}/${ocrResult.pagesAttempted} pages, ${ocrResult.text.length} chars, initFailed=${ocrResult.initFailed}, timedOut=${ocrResult.timedOut}`
      );

      if (ocrResult.text.trim().length > 0) {
        ocrFallback = fallbackExtractDetailed(ocrResult.text, file.name);
        console.info(
          `[extractLabData] Local OCR parse: ${ocrFallback.draft.markers.length} markers, confidence ${ocrFallback.draft.extraction.confidence.toFixed(2)}, important ${countImportantCoverage(ocrFallback.draft.markers)}`
        );

        const bestLocalCandidate = pickBestLocalCandidate();
        const bestLocal = bestLocalCandidate.draft;
        const bestRoute = bestLocalCandidate.route;
        const bestDiagnostics = bestLocalCandidate.diagnostics;

        if (isLocalDraftGoodEnough(bestLocal) && !forceAi && costMode !== "max_accuracy") {
          console.info(`[extractLabData] Route: ${bestRoute} (good enough)`);
          const warningMeta = buildLocalExtractionWarnings(textResult, textExtractionFailed, ocrResult, bestLocal);
          emitStage("done");
          return withExtractionMetadata(
            {
              ...bestLocal,
              extraction: {
                ...bestLocal.extraction,
                costMode,
                aiUsed: false,
                aiReason: "local_high_quality",
                needsReview: bestLocal.extraction.needsReview || warningMeta.warnings.length > 0
              }
            },
            warningMeta,
            {
              textItems: textResult.textItemCount,
              ocrUsed: true,
              ocrPages: ocrResult.pagesSucceeded,
              keptRows: bestDiagnostics.keptRows,
              rejectedRows: bestDiagnostics.rejectedRows,
              topRejectReasons: bestDiagnostics.topRejectReasons,
              extractionRoute: bestRoute
            }
          );
        }
      }
    }

    const aiRawPdfBuffer = cloneArrayBuffer();

    const combinedText = [textResult.text, ocrResult.text].filter(Boolean).join("\n").trim();
    const bestLocalCandidate = pickBestLocalCandidate();
    const bestLocalDraft = bestLocalCandidate.draft;
    const bestLocalRoute = bestLocalCandidate.route;
    const bestLocalDiagnostics = bestLocalCandidate.diagnostics;

    let parsingDraft: ExtractionDraft = bestLocalDraft;
    let extractionRoute: ExtractionRoute = bestLocalRoute;
    const localMetrics = getLocalQualityMetrics(bestLocalDraft);
    const localQualityGood = isLocalQualityHighEnough(localMetrics);
    const compactAiText = compactTextForAi(combinedText);
    const consentBlocksAi = allowAiByMode && (!externalAiAllowed || !Boolean(consent?.allowExternalAi) || !Boolean(consent?.parserRescueEnabled));

    const aiWarnings: ExtractionWarningCode[] = [];
    let aiReason: ExtractionAIReason = localQualityGood
      ? "local_high_quality"
      : consentBlocksAi
        ? "disabled_by_consent"
        : "disabled_by_cost_mode";
    let aiInputTokens = 0;
    let aiOutputTokens = 0;
    let aiCacheHit = false;
    const aiAttemptedModes: Array<GeminiRequestOptions["mode"]> = [];
    let aiRescueTriggered = false;
    let aiRescueReason = "";

    const hardLowYieldScannedPdf =
      textResult.textItemCount === 0 &&
      ocrResult.used &&
      parsingDraft.markers.length < 6 &&
      parsingDraft.extraction.confidence < 0.75;
    const shouldAutoUseAi =
      costMode === "max_accuracy" ||
      (costMode === "balanced" && !localQualityGood && (aiAutoImproveEnabled || hardLowYieldScannedPdf));
    const mustUseAiRescue =
      !forceAi &&
      allowAi &&
      costMode !== "ultra_low_cost" &&
      textResult.textItemCount === 0 &&
      ocrResult.used &&
      ocrResult.initFailed;
    const shouldUseAi = allowAi && (forceAi || shouldAutoUseAi || mustUseAiRescue);

    if (!allowAi && (forceAiRequested || !localQualityGood)) {
      if (consentBlocksAi) {
        aiWarnings.push("PDF_AI_CONSENT_REQUIRED");
        aiReason = "disabled_by_consent";
      } else {
        aiWarnings.push("PDF_AI_DISABLED_BY_PARSER_MODE");
      }
    } else if (!shouldUseAi && !localQualityGood) {
      aiWarnings.push("PDF_AI_SKIPPED_COST_MODE");
    }

    if (shouldUseAi) {
      emitStage("running_ai_text");
      const registerAttempt = (result: GeminiExtractionAttemptResult) => {
        aiInputTokens += result.usage?.inputTokens ?? 0;
        aiOutputTokens += result.usage?.outputTokens ?? 0;
        aiCacheHit = aiCacheHit || Boolean(result.cacheHit);
      };

      aiAttemptedModes.push("text_only");
      const textOnlyResult = await callGeminiExtraction(combinedText, file.name, aiRawPdfBuffer, {
        mode: "text_only",
        fileHash,
        traceId,
        allowPdfAttachment: false
      });
      let aiResult = textOnlyResult;
      registerAttempt(textOnlyResult);
      const textOnlyInsufficient = textOnlyResult.warningCode === "PDF_AI_TEXT_ONLY_INSUFFICIENT";
      const aiTextOnlyPoorResult =
        !textOnlyResult.draft ||
        textOnlyResult.draft.markers.length < 6 ||
        textOnlyResult.draft.extraction.confidence < 0.65;

      if (textOnlyResult.warningCode && textOnlyResult.warningCode !== "PDF_AI_TEXT_ONLY_INSUFFICIENT") {
        aiWarnings.push(textOnlyResult.warningCode);
      }

      const rescueDecision = shouldAutoPdfRescue({
        costMode,
        forceAi,
        localMetrics,
        textItems: textResult.textItemCount,
        compactTextLength: compactAiText.length,
        ocrResult,
        aiTextOnlySucceeded: !aiTextOnlyPoorResult
      });

      if (!textOnlyResult.draft) {
        if (rescueDecision.shouldRescue) {
          aiRescueTriggered = true;
          aiRescueReason = rescueDecision.reason;
          if (!Boolean(consent?.allowPdfAttachment)) {
            aiRescueReason = "pdf_rescue_not_consented";
          } else if (aiRawPdfBuffer.byteLength > MAX_PDF_RESCUE_BYTES) {
            aiWarnings.push("PDF_AI_PDF_RESCUE_SKIPPED_SIZE");
          } else {
            emitStage("running_ai_pdf_rescue");
            aiAttemptedModes.push("pdf_rescue");
            const rescueResult = await callGeminiExtraction(combinedText, file.name, aiRawPdfBuffer, {
              mode: "pdf_rescue",
              fileHash,
              traceId,
              allowPdfAttachment: Boolean(consent?.allowPdfAttachment)
            });
            registerAttempt(rescueResult);
            if (rescueResult.draft) {
              aiResult = rescueResult;
            } else if (rescueResult.warningCode) {
              aiWarnings.push(rescueResult.warningCode);
            } else {
              aiWarnings.push("PDF_AI_PDF_RESCUE_FAILED");
            }
          }
        } else {
          aiRescueReason = rescueDecision.reason;
          if (rescueDecision.reason === "cost_mode_ultra_low") {
            aiWarnings.push("PDF_AI_PDF_RESCUE_SKIPPED_COST_MODE");
          }
        }
      }

      if (textOnlyInsufficient && !aiResult.draft) {
        aiWarnings.push("PDF_AI_TEXT_ONLY_INSUFFICIENT");
      } else if (aiResult.warningCode && aiResult.warningCode !== "PDF_AI_TEXT_ONLY_INSUFFICIENT") {
        aiWarnings.push(aiResult.warningCode);
      }

      if (aiResult.draft) {
        parsingDraft = forceAi && preferAiResultWhenForced ? aiResult.draft : chooseBetterFallbackDraft(bestLocalDraft, aiResult.draft);
        extractionRoute =
          parsingDraft.extraction.provider === "gemini"
            ? ocrResult.used
              ? "gemini-with-ocr"
              : combinedText.length > 0
                ? "gemini-with-text"
                : "gemini-vision-only"
            : bestLocalRoute;
        aiReason = forceAi
          ? "manual_improve"
          : mustUseAiRescue
            ? "auto_low_quality"
            : aiResult.aiReason ?? (parsingDraft.extraction.provider === "gemini" ? "auto_low_quality" : "local_high_quality");
      } else if (aiResult.warningCode === "PDF_AI_SKIPPED_BUDGET") {
        aiReason = "disabled_by_budget";
      } else if (costMode === "ultra_low_cost" && !forceAi) {
        aiReason = "disabled_by_cost_mode";
      } else if (localQualityGood) {
        aiReason = "local_high_quality";
      } else {
        aiReason = "auto_low_quality";
      }
    }

    if (parsingDraft.markers.length > 0 && extractionRoute === "empty") {
      extractionRoute = bestLocalRoute;
    }

    const warningMeta = buildLocalExtractionWarnings(textResult, textExtractionFailed, ocrResult, parsingDraft, aiWarnings);
    const normalizationSummary = buildNormalizationSummary(parsingDraft.markers);
    const debugMeta: ExtractionDebugInfo = {
      textItems: textResult.textItemCount,
      ocrUsed: ocrResult.used,
      ocrPages: ocrResult.pagesSucceeded,
      keptRows:
        parsingDraft.extraction.provider === "gemini"
          ? Math.max(parsingDraft.markers.length, bestLocalDiagnostics.keptRows)
          : bestLocalDiagnostics.keptRows,
      rejectedRows: bestLocalDiagnostics.rejectedRows,
      topRejectReasons: bestLocalDiagnostics.topRejectReasons,
      normalizationSummary,
      aiInputTokens,
      aiOutputTokens,
      aiCacheHit,
      aiAttemptedModes: aiAttemptedModes.length > 0 ? aiAttemptedModes : undefined,
      aiRescueTriggered: aiRescueTriggered || undefined,
      aiRescueReason: aiRescueReason || undefined,
      extractionRoute
    };

    emitStage("done");
    return withExtractionMetadata(
      {
        ...parsingDraft,
        extraction: {
          ...parsingDraft.extraction,
          needsReview: parsingDraft.extraction.needsReview || warningMeta.warnings.length > 0 || parsingDraft.markers.length === 0,
          costMode,
          aiUsed: parsingDraft.extraction.provider === "gemini",
          aiReason
        }
      },
      warningMeta,
      debugMeta
    );
  } catch (error) {
    console.warn("Unexpected PDF parsing failure", error);
    try {
      options.onStageChange?.("failed");
    } catch {
      // no-op
    }
    return {
      sourceFileName: file.name,
      testDate: new Date().toISOString().slice(0, 10),
      markers: [],
      extraction: {
        provider: "fallback",
        model: "fallback-unexpected-error",
        confidence: 0,
        needsReview: true,
        warningCode: "PDF_TEXT_EXTRACTION_FAILED",
        warnings: ["PDF_TEXT_EXTRACTION_FAILED"],
        costMode: options.costMode ?? "balanced",
        aiUsed: false,
        aiReason: "disabled_by_cost_mode",
        debug: {
          textItems: 0,
          ocrUsed: false,
          ocrPages: 0,
          keptRows: 0,
          rejectedRows: 0,
          topRejectReasons: {},
          normalizationSummary: {
            overridesHit: 0,
            unknownCount: 0,
            lowConfidenceCount: 0
          },
          extractionRoute: "empty"
        }
      }
    };
  }
};

export const __pdfParsingInternals = {
  detectParserProfile,
  extractDateCandidate,
  shouldUseOcrFallback,
  cleanMarkerName,
  scoreMarkerCandidate,
  isAcceptableMarkerCandidate,
  parseSingleRow,
  parseTwoLineRow,
  parseLineRows,
  parseLifeLabsTableRows,
  parseColumnRows,
  parseSpatialRows,
  parseHistoryCurrentColumnRows,
  fallbackExtractDetailed,
  fallbackExtract,
  normalizeMarker,
  filterMarkerValuesForQuality,
  buildLocalExtractionWarnings,
  assessParserUncertainty,
  isLocalDraftGoodEnough,
  shouldAutoPdfRescue
};
