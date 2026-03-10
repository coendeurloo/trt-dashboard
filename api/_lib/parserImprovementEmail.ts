import { Resend } from "resend";
import { ParserImprovementSubmissionPayload } from "./parserImprovement.js";

type ConfigError = Error & {
  code?: string;
  statusCode?: number;
};

type EmailSendError = Error & {
  code?: string;
  statusCode?: number;
};

const createConfigError = (message: string): ConfigError => {
  const error = new Error(message) as ConfigError;
  error.code = "RESEND_NOT_CONFIGURED";
  error.statusCode = 500;
  return error;
};

const createEmailSendError = (message: string): EmailSendError => {
  const error = new Error(message) as EmailSendError;
  error.code = "EMAIL_SEND_FAILED";
  error.statusCode = 502;
  return error;
};

const resolveSender = (): string => {
  const preferred =
    process.env.LABTRACKER_REPORTS_FROM?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM?.trim();
  return preferred || "LabTracker Beta <onboarding@resend.dev>";
};

const formatMaybeNumber = (value: number | undefined): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
};

const formatList = (values: string[]): string => (values.length > 0 ? values.join(", ") : "none");

const buildEmailBody = (payload: ParserImprovementSubmissionPayload): string =>
  [
    "LabTracker beta parser-improvement submission",
    "",
    `Received at: ${new Date().toISOString()}`,
    `Original file name: ${payload.fileName}`,
    `Uploaded file size: ${payload.fileSize} bytes`,
    `Reported source file name: ${payload.sourceFileName}`,
    "",
    "Parser metadata",
    `Confidence: ${formatMaybeNumber(payload.confidence)}`,
    `Unit coverage: ${formatMaybeNumber(payload.unitCoverage)}`,
    `Marker count: ${formatMaybeNumber(payload.markerCount)}`,
    `Extraction route: ${payload.extractionRoute ?? "n/a"}`,
    `Page count: ${formatMaybeNumber(payload.pageCount)}`,
    `Warning codes: ${formatList(payload.warningCodes)}`,
    `Uncertainty reasons: ${formatList(payload.uncertaintyReasons)}`,
    `Debug summary: ${payload.debugSummary ?? "n/a"}`,
    "",
    "User metadata",
    `Country: ${payload.country ?? "n/a"}`,
    `Lab / provider: ${payload.labProvider ?? "n/a"}`,
    `Language: ${payload.language ?? "n/a"}`,
    "",
    "User note",
    payload.note ?? "n/a"
  ].join("\n");

export const sendParserImprovementEmail = async (payload: ParserImprovementSubmissionPayload): Promise<void> => {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.LABTRACKER_REPORTS_TO?.trim();
  if (!apiKey || !to) {
    throw createConfigError("Resend API key or LabTracker reports inbox is not configured.");
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: resolveSender(),
    to,
    subject: "[LabTracker Beta] Low-quality parser PDF submission",
    text: buildEmailBody(payload),
    attachments: [
      {
        filename: payload.fileName,
        content: payload.fileBuffer
      }
    ]
  });

  if (result.error) {
    throw createEmailSendError(result.error.message || "Resend rejected the parser-improvement email.");
  }
};
