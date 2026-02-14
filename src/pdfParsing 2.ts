import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ExtractionDraft, MarkerValue } from "./types";
import { canonicalizeMarker } from "./unitConversion";
import { createId, deriveAbnormalFlag, safeNumber } from "./utils";

(pdfjsLib as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc =
  pdfWorker;

interface ClaudeResponse {
  content?: Array<{ type: string; text?: string }>;
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

  const referenceMin = safeNumber(raw.referenceMin ?? null);
  const referenceMax = safeNumber(raw.referenceMax ?? null);
  return {
    id: createId(),
    marker: raw.marker.trim(),
    canonicalMarker: canonicalizeMarker(raw.marker),
    value,
    unit: raw.unit?.trim() || "",
    referenceMin,
    referenceMax,
    abnormal: deriveAbnormalFlag(value, referenceMin, referenceMax),
    confidence: typeof raw.confidence === "number" ? Math.min(1, Math.max(0, raw.confidence)) : 0.7
  };
};

const extractDateCandidate = (text: string): string => {
  const iso = text.match(/\b(20\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b/);
  if (iso?.[0]) {
    return iso[0].replace(/[/.]/g, "-");
  }

  const eu = text.match(/\b(0[1-9]|[12]\d|3[01])[./-](0[1-9]|1[0-2])[./-](20\d{2})\b/);
  if (eu?.[0]) {
    const [d, m, y] = eu[0].split(/[./-]/);
    return `${y}-${m}-${d}`;
  }

  return new Date().toISOString().slice(0, 10);
};

const fallbackExtract = (text: string, fileName: string): ExtractionDraft => {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const markers: MarkerValue[] = [];
  const linePattern =
    /^([A-Za-zÀ-ž0-9(),.%+\-/ ]{2,}?)\s+([<>]?\d+(?:[.,]\d+)?)\s*([A-Za-z%µμ/]+)?(?:\s+(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?))?/;

  for (const line of lines) {
    const match = line.match(linePattern);
    if (!match) {
      continue;
    }

    const markerName = match[1]?.trim();
    if (!markerName || markerName.length < 2) {
      continue;
    }

    const value = safeNumber(match[2]);
    if (value === null) {
      continue;
    }

    const referenceMin = safeNumber(match[4] ?? null);
    const referenceMax = safeNumber(match[5] ?? null);

    markers.push({
      id: createId(),
      marker: markerName,
      canonicalMarker: canonicalizeMarker(markerName),
      value,
      unit: match[3]?.trim() ?? "",
      referenceMin,
      referenceMax,
      abnormal: deriveAbnormalFlag(value, referenceMin, referenceMax),
      confidence: 0.45
    });
  }

  return {
    sourceFileName: fileName,
    testDate: extractDateCandidate(text),
    markers,
    extraction: {
      provider: "fallback",
      model: "regex-fallback",
      confidence: markers.length > 0 ? 0.45 : 0.1,
      needsReview: true
    }
  };
};

const callClaudeExtraction = async (
  pdfText: string,
  apiKey: string,
  fileName: string
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
    "- Do not include explanations.",
    `Source filename: ${fileName}`,
    "LAB TEXT START",
    pdfText,
    "LAB TEXT END"
  ].join("\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1800,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    throw new Error(`Claude extraction failed with status ${response.status}`);
  }

  const body = (await response.json()) as ClaudeResponse;
  const textContent = body.content?.find((block) => block.type === "text")?.text;
  if (!textContent) {
    throw new Error("Claude response did not include text content");
  }

  const json = extractJsonBlock(textContent);
  if (!json) {
    throw new Error("Could not find JSON block in Claude response");
  }

  const parsed = JSON.parse(json) as ClaudeExtraction;
  const rawMarkers = Array.isArray(parsed.markers) ? parsed.markers : [];
  const markers = rawMarkers.map(normalizeMarker).filter((row): row is MarkerValue => Boolean(row));

  const confidence =
    markers.length > 0
      ? markers.reduce((sum, row) => sum + row.confidence, 0) / Math.max(markers.length, 1)
      : 0;

  return {
    sourceFileName: fileName,
    testDate: parsed.testDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.testDate) ? parsed.testDate : extractDateCandidate(pdfText),
    markers,
    extraction: {
      provider: "claude",
      model: "claude-3-5-sonnet-20241022",
      confidence,
      needsReview: confidence < 0.65 || markers.length === 0
    }
  };
};

export const extractLabData = async (file: File, apiKey: string): Promise<ExtractionDraft> => {
  const pdfText = await extractPdfText(file);

  if (!apiKey.trim()) {
    return fallbackExtract(pdfText, file.name);
  }

  try {
    return await callClaudeExtraction(pdfText, apiKey.trim(), file.name);
  } catch {
    return fallbackExtract(pdfText, file.name);
  }
};
