const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\b(?:\+?\d[\d().\-\s]{7,}\d)\b/g;
const SSN_PATTERN = /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g;
const ID_LABEL_PATTERN = /\b(?:patient\s*id|patient\s*number|mrn|member\s*id|account\s*(?:no|number)|client\s*id|bsn)\b\s*[:#-]?\s*[A-Z0-9\-]{3,}/gi;
const DOB_PATTERN = /\b(?:dob|date\s*of\s*birth|birth\s*date|geboortedatum)\b\s*[:#-]?\s*\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4}\b/gi;
const ADDRESS_LINE_PATTERN = /^(?=.*\d)(?=.*\b(?:street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|lane|ln\.?|drive|dr\.?|way|court|ct\.?|zip|postal)\b).+$/gim;
const EXTRA_WHITESPACE_PATTERN = /[ \t]{2,}/g;

const replacePattern = (input: string, pattern: RegExp, replacement: string): { text: string; replacements: number } => {
  let replacements = 0;
  const text = input.replace(pattern, () => {
    replacements += 1;
    return replacement;
  });
  return { text, replacements };
};

const sanitizeFreeText = (value: string): { text: string; redactions: number } => {
  if (!value) {
    return { text: "", redactions: 0 };
  }

  let text = value;
  let redactions = 0;

  const apply = (pattern: RegExp, replacement: string) => {
    const result = replacePattern(text, pattern, replacement);
    text = result.text;
    redactions += result.replacements;
  };

  apply(EMAIL_PATTERN, "[REDACTED_EMAIL]");
  apply(DOB_PATTERN, "[REDACTED_DOB]");
  apply(SSN_PATTERN, "[REDACTED_ID]");
  apply(ID_LABEL_PATTERN, "[REDACTED_ID]");
  apply(PHONE_PATTERN, "[REDACTED_PHONE]");
  apply(ADDRESS_LINE_PATTERN, "[REDACTED_ADDRESS]");

  return {
    text: text.replace(EXTRA_WHITESPACE_PATTERN, " ").trim(),
    redactions
  };
};

const sanitizeFileName = (fileName: string): string => {
  const trimmed = String(fileName ?? "").trim();
  if (!trimmed) {
    return "document.pdf";
  }

  const dotIndex = trimmed.lastIndexOf(".");
  const hasExtension = dotIndex > 0 && dotIndex < trimmed.length - 1;
  const base = hasExtension ? trimmed.slice(0, dotIndex) : trimmed;
  const extension = hasExtension ? trimmed.slice(dotIndex) : ".pdf";
  const sanitizedBase = sanitizeFreeText(base).text.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const safeBase = sanitizedBase || "document";
  return `${safeBase}${extension}`.slice(0, 120);
};

export const sanitizeParserTextForAI = (text: string, fileName: string): {
  text: string;
  fileName: string;
  redactionCount: number;
} => {
  const sanitizedText = sanitizeFreeText(text);
  return {
    text: sanitizedText.text,
    fileName: sanitizeFileName(fileName),
    redactionCount: sanitizedText.redactions
  };
};

type AnalysisPayloadRow = {
  ann: {
    compound: string;
    frequency: string;
    protocol: string;
    supps: string;
    symptoms: string;
    notes: string;
  };
};

export const sanitizeAnalysisPayloadForAI = <T extends AnalysisPayloadRow>(
  payload: T[],
  options: { includeSymptoms?: boolean; includeNotes?: boolean } = {}
): T[] => {
  const includeSymptoms = Boolean(options.includeSymptoms);
  const includeNotes = Boolean(options.includeNotes);

  return payload.map((report) => {
    const sanitizedCompound = sanitizeFreeText(report.ann.compound).text;
    const sanitizedFrequency = sanitizeFreeText(report.ann.frequency).text;
    const sanitizedProtocol = sanitizeFreeText(report.ann.protocol).text;
    const sanitizedSupps = sanitizeFreeText(report.ann.supps).text;
    const sanitizedSymptoms = includeSymptoms ? sanitizeFreeText(report.ann.symptoms).text : "";
    const sanitizedNotes = includeNotes ? sanitizeFreeText(report.ann.notes).text : "";

    return {
      ...report,
      ann: {
        ...report.ann,
        compound: sanitizedCompound,
        frequency: sanitizedFrequency,
        protocol: sanitizedProtocol,
        supps: sanitizedSupps,
        symptoms: sanitizedSymptoms,
        notes: sanitizedNotes
      }
    };
  });
};
