import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import tesseractWorker from "tesseract.js/dist/worker.min.js?url";
import tesseractCore from "tesseract.js-core/tesseract-core.wasm.js?url";
import { PRIMARY_MARKERS } from "./constants";
import { ExtractionDebugInfo, ExtractionDraft, ExtractionWarningCode, MarkerValue } from "./types";
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

interface GeminiExtractionResponse {
  model?: string;
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
const METHOD_SUFFIX_PATTERN = /\b(?:ECLIA|PHOT|ENZ|NEPH|ISSAM)\b$/i;
const UNIT_TOKEN_PATTERN = /^(?:10(?:\^|\*|x|×)?(?:9|12)\/l|[A-Za-z%µμ/][A-Za-z0-9%µμ/.*^\-²]*)$/i;
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
const HORMONE_SIGNAL_PATTERN =
  /\b(?:testosterone|testosteron|free\s+testosterone|estradiol|shbg|dht|dihydrotestosterone|fsh|lh|hormone)\b/i;
const MARKER_ANCHOR_PATTERN =
  /\b(?:testosterone|testosteron|estradiol|shbg|hematocrit|hematocriet|lh|fsh|prolactin|prolactine|psa|tsh|cholesterol|hdl|ldl|non hdl|triglycerides?|creatinine|urine creatinine|glucose|hemoglobine|hemoglobin|hematology|albumine|albumin|mchc|mch|mcv|wbc|platelets?|thrombocyten|leukocyten|leucocyten|lymphocytes?|eosinophils?|basophils?|neutrophils?|monocytes?|free androgen index|dihydrotestosteron|dihydrotestosterone|vitamin b12|vitamine b12|urea|ureum|uric acid|calcium|bilirubin|alkaline phosphatase|gamma gt|alt|ast|ferritin|ferritine|egfr|ck|ckd-epi|acr|cortisol|dhea|dhea sulphate|dhea sulfate|sex hormone binding globulin|c reactive protein|crp)\b/i;
const COMMENTARY_FRAGMENT_PATTERN =
  /\b(?:for intermediate and high risk individuals|low risk individuals|please interpret results with caution|if dexamethasone has been given|for further information please contact|new method effective|shown to interfere|changes in serial psa levels|this high sensitivity crp method is sensitive to|in presence of significant hypoalbuminemia|is suitable for coronary artery disease assessment)\b/i;
const GUIDANCE_RESULT_PATTERN =
  /\b(?:for\s+(?:intermediate|high|low)\s+risk\s+individuals|individuals?\s+with\s+ldl\s+cholesterol|if\s+dexamethasone\s+has\s+been\s+given|this\s+high\s+sensitivity\s+crp\s+method\s+is\s+sensitive\s+to|for\s+further\s+information\s+please\s+contact)\b/i;
const COMMENTARY_GUARD_PATTERN =
  /\b(?:high\s+risk\s+individuals?|low\s+risk\s+individuals?|sensitive\s+to|for\s+further\s+information|target\s+reduction|please\s+interpret|new\s+method\s+effective)\b/i;
const HISTORY_CALCULATOR_NOISE_PATTERN =
  /\b(?:balance\s*my\s*hormones|tru-?t\.org|issam|free-?testosterone-?calculator|free\s+testosterone\s*-\s*calculated|known\s+labcorp\s+unit\s+issue|labcorp\s+test|international\s+society\s+for\s+the\s+study\s+of\s+the\s+aging\s+male|roche\s*cobas\s*assay|calculated\s+value)\b|https?:\/\/|www\./i;
const SPATIAL_PRIORITY_MARKER_PATTERN =
  /\b(?:testosterone|testosteron|estradiol|shbg|hematocrit|hematocriet|lh|fsh|dht|dihydrotestosterone|prolactin|psa)\b/i;
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
  "new"
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
const OCR_REMOTE_LANG_PATH = "https://tessdata.projectnaptha.com/4.0.0";
const OCR_REMOTE_LANG_PATH_ALT = "https://cdn.jsdelivr.net/npm/@tesseract.js-data";
const OCR_MAX_INIT_ATTEMPTS = 2;
const OCR_INIT_BACKOFF_MS = 250;
const OCR_PAGE_TIMEOUT_MS = 15_000;
const OCR_TOTAL_TIMEOUT_MS = 75_000;
const OCR_LANG_FALLBACK = "eng";
const GEMINI_MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
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

const buildClaudeExtractionPrompt = (fileName: string, pdfText: string): string =>
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

  let createWorker: TesseractModule["createWorker"];
  let recognizeDirect: TesseractModule["recognize"];
  try {
    const module = (await import("tesseract.js")) as TesseractModule;
    createWorker = module.createWorker ?? module.default?.createWorker;
    recognizeDirect = module.recognize ?? module.default?.recognize;
  } catch {
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

  if (!createWorker) {
    recognizeDirect = undefined;
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
      return cleanWhitespace(recognized.data?.text ?? "");
    }

    if (!recognizeDirect) {
      return "";
    }

    for (const lang of languageAttempts) {
      try {
        const recognized = await recognizeDirect(canvas, lang, {
          workerPath: OCR_REMOTE_WORKER_PATH,
          corePath: OCR_REMOTE_CORE_PATH,
          langPath: OCR_REMOTE_LANG_PATH,
          cacheMethod: "none",
          workerBlobURL: false
        });
        const text = cleanWhitespace(recognized.data?.text ?? "");
        if (text) {
          return text;
        }
      } catch (error) {
        console.warn(`PDF OCR direct recognize failed for langs=${lang}`, error);
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

  const canonicalMarker = canonicalizeMarker(cleanedMarker);
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
  marker = marker.replace(/\s*[=<>]+\s*$/g, "").trim();

  if (
    /\b(langere tijd tussen (?:bloed)?afname en analyse|longer time between blood collection and analysis)\b/i.test(marker)
  ) {
    return "MCH";
  }

  const anchor = marker.match(MARKER_ANCHOR_PATTERN);
  if (anchor && anchor.index !== undefined && anchor.index > 0) {
    const prefix = marker.slice(0, anchor.index);
    if (
      prefix.length > 20 ||
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

  return marker.replace(/[.,;:]+$/, "").trim();
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

  marker = marker.replace(/^Ratio:\s*T\/SHBG.*$/i, "SHBG");
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
    return true;
  }

  if (/[=<>]/.test(marker)) {
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

  if (profile.requireUnit && !row.unit) {
    return false;
  }

  if (row.unit || row.referenceMin !== null || row.referenceMax !== null) {
    return true;
  }
  const canonical = canonicalizeMarker(row.markerName);
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

    const thirdLine = lines[index + 2];
    if (thirdLine && !/\d/.test(line) && !/\d/.test(nextLine) && /\d/.test(thirdLine)) {
      const combinedMarker = applyProfileMarkerFixes(cleanMarkerName(`${line} ${nextLine}`));
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
      const canonicalMarker = canonicalizeMarker(candidate.markerName);
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
  return (
    /\bbaseline\b/i.test(text) &&
    /\bper\s+week\b/i.test(text) &&
    /\bfree\s+testosterone\s*-\s*calculated\b/i.test(text)
  );
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
    const canonicalMarker = canonicalizeMarker(row.markerName);
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

const fallbackExtractDetailed = (text: string, fileName: string, spatialRows: PdfSpatialRow[] = []): FallbackExtractOutcome => {
  const profile = detectParserProfile(text, fileName);
  const lifeLabsRows = parseLifeLabsTableRows(text, profile);
  const historyRows = parseHistoryCurrentColumnRows(spatialRows, text, profile);
  const columnRows = parseColumnRows(text, profile);
  const lineRows = parseLineRows(text, profile);
  const indexedRows = parseIndexedRows(text, profile);
  const looseRows = lineRows.length + columnRows.length < 6 ? parseLooseRows(text, profile) : [];
  const huisartsRows = profile.enableKeywordRangeParser ? parseMijnGezondheidRows(text) : [];

  const nonSpatialRows =
    indexedRows.length > 0
      ? [...lifeLabsRows, ...columnRows, ...lineRows, ...indexedRows, ...looseRows, ...huisartsRows]
      : [...lifeLabsRows, ...columnRows, ...lineRows, ...looseRows, ...huisartsRows];
  const nonSpatialDedupe = dedupeRowsDetailed(nonSpatialRows);
  const nonSpatialMarkers = nonSpatialDedupe.markers;
  const nonSpatialImportantCoverage = countImportantCoverage(nonSpatialMarkers);
  const shouldApplySpatialBoost =
    spatialRows.length > 0 &&
    (nonSpatialImportantCoverage < 2 || nonSpatialMarkers.length < 8 || nonSpatialMarkers.length / Math.max(text.split("\n").length, 1) < 0.03);

  const spatialParsedRows = shouldApplySpatialBoost ? parseSpatialRows(spatialRows, profile) : [];
  const combinedRows = [...historyRows, ...nonSpatialRows, ...spatialParsedRows];
  const combinedDedupe = dedupeRowsDetailed(combinedRows);
  const markers = combinedDedupe.markers;

  const averageConfidence =
    markers.length > 0 ? markers.reduce((sum, marker) => sum + marker.confidence, 0) / markers.length : 0;
  const unitCoverage = markers.length > 0 ? markers.filter((marker) => marker.unit).length / markers.length : 0;
  const importantCoverage = countImportantCoverage(markers);
  const hormoneSignal = HORMONE_SIGNAL_PATTERN.test(text);
  const confidence = markers.length > 0 ? Math.min(0.9, averageConfidence * 0.8 + unitCoverage * 0.2) : 0.1;

  return {
    draft: {
      sourceFileName: fileName,
      testDate: extractDateCandidate(text),
      markers,
      extraction: {
        provider: "fallback",
        model: `fallback-layered:${profile.id}`,
        confidence,
        needsReview: confidence < 0.7 || markers.length === 0 || unitCoverage < 0.7 || (hormoneSignal && importantCoverage < 2)
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

const callGeminiExtraction = async (
  pdfText: string,
  fileName: string,
  rawPdfBuffer: ArrayBuffer
): Promise<ExtractionDraft | null> => {
  const shouldAttachPdf = rawPdfBuffer.byteLength > 0 && rawPdfBuffer.byteLength <= 7_000_000;
  const routePayload = {
    fileName,
    pdfText,
    pdfBase64: shouldAttachPdf ? arrayBufferToBase64(rawPdfBuffer) : null
  };

  let response: Response | null = null;
  try {
    response = await fetch("/api/gemini/extract", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(routePayload)
    });
  } catch {
    response = null;
  }

  let body: GeminiExtractionResponse = {};
  if (response?.ok) {
    try {
      body = (await response.json()) as GeminiExtractionResponse;
    } catch {
      body = {};
    }
  } else {
    const directGeminiKey = String(import.meta.env.VITE_GEMINI_API_KEY ?? "").trim();
    if (!directGeminiKey) {
      return null;
    }

    const parts: Array<Record<string, unknown>> = [{ text: buildClaudeExtractionPrompt(fileName, pdfText) }];
    if (routePayload.pdfBase64) {
      parts.push({
        inline_data: {
          mime_type: "application/pdf",
          data: routePayload.pdfBase64
        }
      });
    }

    let parsedBody: GeminiExtractionResponse | null = null;
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
                temperature: 0.1,
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
        return null;
      }

      let rawBody: unknown;
      try {
        rawBody = await directResponse.json();
      } catch {
        continue;
      }

      const candidateText =
        (rawBody as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0]?.content?.parts?.[0]?.text ??
        "";
      const jsonBlock = extractJsonBlock(candidateText);
      if (!jsonBlock) {
        continue;
      }
      try {
        const parsed = JSON.parse(jsonBlock) as GeminiExtractionResponse;
        parsedBody = {
          model,
          testDate: parsed.testDate,
          markers: Array.isArray(parsed.markers) ? parsed.markers : []
        };
        break;
      } catch {
        continue;
      }
    }

    if (!parsedBody) {
      return null;
    }
    body = parsedBody;
  }

  const rawMarkers = Array.isArray(body.markers) ? body.markers : [];
  const geminiMarkers = rawMarkers
    .map(normalizeMarker)
    .filter((row): row is MarkerValue => Boolean(row))
    .filter((row) =>
      isAcceptableMarkerCandidate(row.marker, row.unit, row.referenceMin, row.referenceMax, "claude")
    );

  const markers = filterMarkerValuesForQuality(geminiMarkers);
  if (markers.length === 0) {
    return null;
  }

  const confidence =
    markers.length > 0
      ? markers.reduce((sum, row) => sum + row.confidence, 0) / Math.max(markers.length, 1)
      : 0;

  return {
    sourceFileName: fileName,
    testDate:
      body.testDate && /^\d{4}-\d{2}-\d{2}$/.test(body.testDate)
        ? body.testDate
        : extractDateCandidate(pdfText),
    markers,
    extraction: {
      provider: "gemini",
      model: `${body.model ?? "gemini-2.0-flash"}+api`,
      confidence,
      needsReview: confidence < 0.7 || markers.length < 4
    }
  };
};

const buildLocalExtractionWarnings = (
  textResult: PdfTextExtractionResult,
  textExtractionFailed: boolean,
  ocrResult: OcrResult,
  draft: ExtractionDraft
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

  if (draft.extraction.confidence < 0.65 || draft.markers.length < 6) {
    pushWarning("PDF_LOW_CONFIDENCE_LOCAL");
  }

  return {
    warningCode,
    warnings: Array.from(new Set(warnings))
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

export const extractLabData = async (file: File): Promise<ExtractionDraft> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    let textResult: PdfTextExtractionResult;
    let textExtractionFailed = false;
    try {
      textResult = await extractPdfText(arrayBuffer);
    } catch (error) {
      textExtractionFailed = true;
      console.warn("PDF text extraction failed; continuing with OCR-only fallback.", error);
      textResult = {
        text: "",
        pageCount: 0,
        textItemCount: 0,
        lineCount: 0,
        nonWhitespaceChars: 0,
        spatialRows: []
      };
    }

    let extractionText = textResult.text;
    let ocrResult: OcrResult = {
      text: "",
      used: false,
      pagesAttempted: 0,
      pagesSucceeded: 0,
      pagesFailed: 0,
      initFailed: false,
      timedOut: false
    };

    const shouldAttemptOcr =
      textResult.pageCount === 0 ||
      textResult.textItemCount === 0 ||
      (textResult.nonWhitespaceChars < Math.max(600, textResult.pageCount * 180) &&
        textResult.lineCount < Math.max(20, textResult.pageCount * 10));

    if (shouldAttemptOcr) {
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
        extractPdfTextViaOcr(arrayBuffer),
        OCR_TOTAL_TIMEOUT_MS,
        "OCR total timeout"
      ).catch((error) => {
        console.warn("PDF OCR total timeout or crash", error);
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

      if (ocrResult.text) {
        extractionText = `${extractionText}\n${ocrResult.text}`.trim();
      }
    }

    const geminiDraft = await callGeminiExtraction(extractionText, file.name, arrayBuffer);
    const parsingDraft: ExtractionDraft =
      geminiDraft ??
      {
        sourceFileName: file.name,
        testDate: extractDateCandidate(extractionText),
        markers: [],
        extraction: {
          provider: "fallback",
          model: "gemini-empty-response",
          confidence: 0,
          needsReview: true
        }
      };

    const warningMeta = buildLocalExtractionWarnings(textResult, textExtractionFailed, ocrResult, parsingDraft);
    const debugMeta: ExtractionDebugInfo = {
      textItems: textResult.textItemCount,
      ocrUsed: ocrResult.used,
      ocrPages: ocrResult.pagesSucceeded,
      keptRows: parsingDraft.markers.length,
      rejectedRows: 0,
      topRejectReasons: {}
    };

    return withExtractionMetadata(
      {
        ...parsingDraft,
        extraction: {
          ...parsingDraft.extraction,
          needsReview: parsingDraft.extraction.needsReview || warningMeta.warnings.length > 0 || parsingDraft.markers.length === 0
        }
      },
      warningMeta,
      debugMeta
    );
  } catch (error) {
    console.warn("Unexpected PDF parsing failure", error);
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
        debug: {
          textItems: 0,
          ocrUsed: false,
          ocrPages: 0,
          keptRows: 0,
          rejectedRows: 0,
          topRejectReasons: {}
        }
      }
    };
  }
};

export const __pdfParsingInternals = {
  detectParserProfile,
  extractDateCandidate,
  shouldUseOcrFallback,
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
  buildLocalExtractionWarnings
};
