import { IncomingMessage, ServerResponse } from "node:http";
import { getTrustedClientIp } from "./clientIp.js";
import { applyApiSecurityHeaders } from "./httpSecurity.js";

export const PARSER_IMPROVEMENT_MAX_PDF_BYTES = 15 * 1024 * 1024;
export const PARSER_IMPROVEMENT_MAX_MULTIPART_BYTES = PARSER_IMPROVEMENT_MAX_PDF_BYTES + 256 * 1024;
export const PARSER_IMPROVEMENT_NOTE_MAX_LENGTH = 1000;
export const PARSER_IMPROVEMENT_COUNTRY_MAX_LENGTH = 80;
export const PARSER_IMPROVEMENT_LANGUAGE_MAX_LENGTH = 80;
export const PARSER_IMPROVEMENT_METADATA_MAX_LENGTH = 120;
export const PARSER_IMPROVEMENT_DEBUG_SUMMARY_MAX_LENGTH = 750;
export const PARSER_IMPROVEMENT_EMAIL_MAX_LENGTH = 254;

export interface ParserImprovementSubmissionPayload {
  fileName: string;
  fileSize: number;
  fileBuffer: Buffer;
  consent: true;
  email: string;
  sourceFileName: string;
  note?: string;
  country?: string;
  labProvider?: string;
  language?: string;
  confidence?: number;
  unitCoverage?: number;
  markerCount?: number;
  warningCodes: string[];
  uncertaintyReasons: string[];
  extractionRoute?: string;
  pageCount?: number;
  debugSummary?: string;
}

type RouteError = Error & {
  code?: string;
  statusCode?: number;
};

const createRouteError = (message: string, code: string, statusCode: number): RouteError => {
  const error = new Error(message) as RouteError;
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

export const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  applyApiSecurityHeaders(res);
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
};

export const sanitizeText = (value: string, maxLength: number): string =>
  value
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const readRawBody = async (req: IncomingMessage, maxBytes: number): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bufferChunk.length;
    if (total > maxBytes) {
      throw createRouteError("Uploaded PDF is too large.", "FILE_TOO_LARGE", 413);
    }
    chunks.push(bufferChunk);
  }

  return Buffer.concat(chunks);
};

const readMultipartFormData = async (req: IncomingMessage): Promise<FormData> => {
  const contentTypeHeader = req.headers["content-type"];
  const contentType = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] ?? "" : contentTypeHeader ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw createRouteError("Expected multipart/form-data request.", "INVALID_CONTENT_TYPE", 400);
  }

  const rawBody = await readRawBody(req, PARSER_IMPROVEMENT_MAX_MULTIPART_BYTES);
  const response = new Response(new Uint8Array(rawBody), {
    headers: {
      "content-type": contentType
    }
  });
  return response.formData();
};

const parseNumberField = (value: FormDataEntryValue | null, options?: { min?: number; max?: number }): number | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  const min = options?.min ?? Number.NEGATIVE_INFINITY;
  const max = options?.max ?? Number.POSITIVE_INFINITY;
  return Math.min(max, Math.max(min, parsed));
};

const parseStringArrayField = (value: FormDataEntryValue | null): string[] => {
  if (typeof value !== "string") {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => sanitizeText(String(entry ?? ""), 80))
      .filter(Boolean)
      .slice(0, 12);
  } catch {
    return [];
  }
};

const isPdfMagicHeader = (fileBuffer: Buffer): boolean => fileBuffer.subarray(0, 5).toString("utf8") === "%PDF-";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const getClientIp = (req: IncomingMessage): string => {
  return getTrustedClientIp(req);
};

export const parseParserImprovementSubmission = async (
  req: IncomingMessage
): Promise<ParserImprovementSubmissionPayload> => {
  const formData = await readMultipartFormData(req);
  const consentRaw = formData.get("consent");
  const consent = typeof consentRaw === "string" && consentRaw.trim().toLowerCase() === "true";
  if (!consent) {
    throw createRouteError("Consent is required before sending the PDF.", "CONSENT_REQUIRED", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw createRouteError("A PDF file is required.", "PDF_REQUIRED", 400);
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  if (fileBuffer.length === 0) {
    throw createRouteError("A PDF file is required.", "PDF_REQUIRED", 400);
  }
  if (fileBuffer.length > PARSER_IMPROVEMENT_MAX_PDF_BYTES) {
    throw createRouteError("Uploaded PDF is too large.", "FILE_TOO_LARGE", 413);
  }

  const fileName = sanitizeText(file.name || "report.pdf", PARSER_IMPROVEMENT_METADATA_MAX_LENGTH);
  const looksLikePdf =
    (file.type === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) && isPdfMagicHeader(fileBuffer);
  if (!looksLikePdf) {
    throw createRouteError("Uploaded file must be a valid PDF.", "INVALID_PDF", 400);
  }

  const sourceFileName = sanitizeText(
    typeof formData.get("sourceFileName") === "string" ? String(formData.get("sourceFileName")) : fileName,
    PARSER_IMPROVEMENT_METADATA_MAX_LENGTH
  );
  const email = sanitizeText(
    typeof formData.get("email") === "string" ? String(formData.get("email")) : "",
    PARSER_IMPROVEMENT_EMAIL_MAX_LENGTH
  ).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw createRouteError("A valid email address is required.", "EMAIL_REQUIRED", 400);
  }

  return {
    fileName,
    fileSize: fileBuffer.length,
    fileBuffer,
    consent: true,
    email,
    sourceFileName,
    note: (() => {
      const value = typeof formData.get("note") === "string" ? sanitizeText(String(formData.get("note")), PARSER_IMPROVEMENT_NOTE_MAX_LENGTH) : "";
      return value || undefined;
    })(),
    country: (() => {
      const value =
        typeof formData.get("country") === "string"
          ? sanitizeText(String(formData.get("country")), PARSER_IMPROVEMENT_COUNTRY_MAX_LENGTH)
          : "";
      return value || undefined;
    })(),
    labProvider: (() => {
      const value =
        typeof formData.get("labProvider") === "string"
          ? sanitizeText(String(formData.get("labProvider")), PARSER_IMPROVEMENT_METADATA_MAX_LENGTH)
          : "";
      return value || undefined;
    })(),
    language: (() => {
      const value =
        typeof formData.get("language") === "string"
          ? sanitizeText(String(formData.get("language")), PARSER_IMPROVEMENT_LANGUAGE_MAX_LENGTH)
          : "";
      return value || undefined;
    })(),
    confidence: parseNumberField(formData.get("confidence"), { min: 0, max: 1 }),
    unitCoverage: parseNumberField(formData.get("unitCoverage"), { min: 0, max: 1 }),
    markerCount: parseNumberField(formData.get("markerCount"), { min: 0, max: 500 }),
    warningCodes: parseStringArrayField(formData.get("warningCodes")),
    uncertaintyReasons: parseStringArrayField(formData.get("uncertaintyReasons")),
    extractionRoute:
      typeof formData.get("extractionRoute") === "string"
        ? sanitizeText(String(formData.get("extractionRoute")), PARSER_IMPROVEMENT_METADATA_MAX_LENGTH) || undefined
        : undefined,
    pageCount: parseNumberField(formData.get("pageCount"), { min: 0, max: 500 }),
    debugSummary:
      typeof formData.get("debugSummary") === "string"
        ? sanitizeText(String(formData.get("debugSummary")), PARSER_IMPROVEMENT_DEBUG_SUMMARY_MAX_LENGTH) || undefined
        : undefined
  };
};

export const getRouteErrorDetails = (error: unknown): { code: string; message: string; statusCode: number } => {
  if (error && typeof error === "object") {
    const routeError = error as RouteError;
    if (typeof routeError.code === "string" && typeof routeError.statusCode === "number") {
      return {
        code: routeError.code,
        message: routeError.message,
        statusCode: routeError.statusCode
      };
    }
  }

  return {
    code: "EMAIL_SEND_FAILED",
    message: error instanceof Error ? error.message : "Unexpected server error",
    statusCode: 500
  };
};
