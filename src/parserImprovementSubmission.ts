import { ExtractionDraft, ParserUncertaintyAssessment } from "./types";

export const PARSER_IMPROVEMENT_ENDPOINT = "/api/parser-improvement/submit";
export const PARSER_IMPROVEMENT_MAX_PDF_BYTES = 15 * 1024 * 1024;
export const PARSER_IMPROVEMENT_NOTE_MAX_LENGTH = 1000;
export const PARSER_IMPROVEMENT_METADATA_MAX_LENGTH = 120;
export const PARSER_IMPROVEMENT_LANGUAGE_MAX_LENGTH = 80;
export const PARSER_IMPROVEMENT_COUNTRY_MAX_LENGTH = 80;
export const PARSER_IMPROVEMENT_DEBUG_SUMMARY_MAX_LENGTH = 750;
export const PARSER_IMPROVEMENT_EMAIL_MAX_LENGTH = 254;

export interface ParserImprovementFormValues {
  consent: boolean;
  email: string;
  note: string;
  country: string;
  labProvider: string;
  language: string;
}

export class ParserImprovementSubmissionError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = "PARSER_IMPROVEMENT_REQUEST_FAILED", status = 0) {
    super(message);
    this.name = "ParserImprovementSubmissionError";
    this.code = code;
    this.status = status;
  }
}

const sanitizeText = (value: string, maxLength: number): string =>
  value
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const collectWarningCodes = (draft: ExtractionDraft): string[] =>
  Array.from(new Set([...(draft.extraction.warnings ?? []), ...(draft.extraction.warningCode ? [draft.extraction.warningCode] : [])]));

export const buildParserImprovementDebugSummary = (draft: ExtractionDraft): string => {
  const debug = draft.extraction.debug;
  if (!debug) {
    return "";
  }

  const parts = [
    typeof debug.pageCount === "number" ? `pages=${debug.pageCount}` : "",
    typeof debug.textItems === "number" ? `textItems=${debug.textItems}` : "",
    typeof debug.ocrUsed === "boolean" ? `ocrUsed=${debug.ocrUsed ? "yes" : "no"}` : "",
    typeof debug.ocrPages === "number" ? `ocrPages=${debug.ocrPages}` : "",
    typeof debug.keptRows === "number" ? `keptRows=${debug.keptRows}` : "",
    typeof debug.rejectedRows === "number" ? `rejectedRows=${debug.rejectedRows}` : "",
    debug.extractionRoute ? `route=${debug.extractionRoute}` : "",
    debug.routing?.primaryLanguage ? `primaryLanguage=${debug.routing.primaryLanguage}` : "",
    debug.routing?.selectedParsers?.length ? `parsers=${debug.routing.selectedParsers.join(",")}` : "",
    debug.routing?.selectedOcrLangs?.length ? `ocrLangs=${debug.routing.selectedOcrLangs.join(",")}` : "",
    debug.aiRescueReason ? `aiRescueReason=${debug.aiRescueReason}` : ""
  ].filter(Boolean);

  return sanitizeText(parts.join(" | "), PARSER_IMPROVEMENT_DEBUG_SUMMARY_MAX_LENGTH);
};

export const buildParserImprovementFormData = (params: {
  file: File;
  draft: ExtractionDraft;
  assessment: ParserUncertaintyAssessment;
  values: ParserImprovementFormValues;
}): FormData => {
  const { file, draft, assessment, values } = params;
  const formData = new FormData();

  formData.append("file", file, file.name);
  formData.append("consent", values.consent ? "true" : "false");
  formData.append("email", sanitizeText(values.email, PARSER_IMPROVEMENT_EMAIL_MAX_LENGTH).toLowerCase());
  formData.append("sourceFileName", sanitizeText(draft.sourceFileName, PARSER_IMPROVEMENT_METADATA_MAX_LENGTH));
  formData.append("confidence", String(draft.extraction.confidence));
  formData.append("unitCoverage", String(assessment.unitCoverage));
  formData.append("markerCount", String(draft.markers.length));
  formData.append("warningCodes", JSON.stringify(collectWarningCodes(draft)));
  formData.append("uncertaintyReasons", JSON.stringify(assessment.reasons));

  if (draft.extraction.debug?.extractionRoute) {
    formData.append("extractionRoute", draft.extraction.debug.extractionRoute);
  }
  if (typeof draft.extraction.debug?.pageCount === "number" && Number.isFinite(draft.extraction.debug.pageCount)) {
    formData.append("pageCount", String(Math.max(0, Math.round(draft.extraction.debug.pageCount))));
  }

  const debugSummary = buildParserImprovementDebugSummary(draft);
  if (debugSummary) {
    formData.append("debugSummary", debugSummary);
  }

  const note = sanitizeText(values.note, PARSER_IMPROVEMENT_NOTE_MAX_LENGTH);
  if (note) {
    formData.append("note", note);
  }

  const country = sanitizeText(values.country, PARSER_IMPROVEMENT_COUNTRY_MAX_LENGTH);
  if (country) {
    formData.append("country", country);
  }

  const labProvider = sanitizeText(values.labProvider, PARSER_IMPROVEMENT_METADATA_MAX_LENGTH);
  if (labProvider) {
    formData.append("labProvider", labProvider);
  }

  const language = sanitizeText(values.language, PARSER_IMPROVEMENT_LANGUAGE_MAX_LENGTH);
  if (language) {
    formData.append("language", language);
  }

  return formData;
};

const parseError = async (response: Response): Promise<ParserImprovementSubmissionError> => {
  let payload: unknown = null;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    payload = null;
  }

  const errorBlock =
    payload && typeof payload === "object" && "error" in payload
      ? (payload as { error?: { code?: unknown; message?: unknown } }).error
      : null;

  const code = typeof errorBlock?.code === "string" && errorBlock.code.trim() ? errorBlock.code.trim() : "PARSER_IMPROVEMENT_REQUEST_FAILED";
  const message =
    typeof errorBlock?.message === "string" && errorBlock.message.trim()
      ? errorBlock.message.trim()
      : `Parser improvement request failed with status ${response.status}`;

  return new ParserImprovementSubmissionError(message, code, response.status);
};

export const submitParserImprovementSample = async (params: {
  file: File;
  draft: ExtractionDraft;
  assessment: ParserUncertaintyAssessment;
  values: ParserImprovementFormValues;
}): Promise<void> => {
  const formData = buildParserImprovementFormData(params);

  let response: Response;
  try {
    response = await fetch(PARSER_IMPROVEMENT_ENDPOINT, {
      method: "POST",
      body: formData
    });
  } catch {
    throw new ParserImprovementSubmissionError("Parser improvement service unreachable", "PARSER_IMPROVEMENT_UNREACHABLE", 0);
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  const payload = (await response.json()) as { ok?: boolean };
  if (!payload?.ok) {
    throw new ParserImprovementSubmissionError("Parser improvement request did not complete", "PARSER_IMPROVEMENT_INVALID_RESPONSE", response.status);
  }
};
