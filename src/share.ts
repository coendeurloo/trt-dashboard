import { APP_SCHEMA_VERSION, DEFAULT_SETTINGS } from "./constants";
import { LabReport, StoredAppData } from "./types";
import { coerceStoredAppData } from "./storage";

export interface ShareOptions {
  hideNotes: boolean;
  hideProtocol: boolean;
  hideSymptoms: boolean;
}

interface SharedSnapshotPayload {
  schemaVersion: number;
  generatedAt: string;
  options: ShareOptions;
  data: StoredAppData;
}

const encodeBase64 = (value: string): string => {
  if (typeof window === "undefined") {
    return "";
  }
  return window.btoa(unescape(encodeURIComponent(value)));
};

const decodeBase64 = (value: string): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return decodeURIComponent(escape(window.atob(value)));
  } catch {
    return null;
  }
};

const sanitizeReportForShare = (report: LabReport, options: ShareOptions): LabReport => ({
  ...report,
  annotations: {
    ...report.annotations,
    protocolId: options.hideProtocol ? null : report.annotations.protocolId,
    protocol: options.hideProtocol ? "" : report.annotations.protocol,
    supplementOverrides: options.hideProtocol ? null : report.annotations.supplementOverrides,
    symptoms: options.hideSymptoms ? "" : report.annotations.symptoms,
    notes: options.hideNotes ? "" : report.annotations.notes
  }
});

export const buildShareToken = (data: StoredAppData, options: ShareOptions): string => {
  const sanitizedData: StoredAppData = {
    schemaVersion: APP_SCHEMA_VERSION,
    reports: data.reports.map((report) => sanitizeReportForShare(report, options)),
    protocols: options.hideProtocol ? [] : data.protocols,
    supplementTimeline: options.hideProtocol ? [] : data.supplementTimeline,
    checkIns: options.hideProtocol ? [] : data.checkIns,
    markerAliasOverrides: data.markerAliasOverrides,
    settings: {
      ...DEFAULT_SETTINGS,
      ...data.settings
    }
  };

  const payload: SharedSnapshotPayload = {
    schemaVersion: APP_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    options,
    data: sanitizedData
  };

  return encodeBase64(JSON.stringify(payload));
};

export const parseShareToken = (
  token: string
): { data: StoredAppData; generatedAt: string | null; options: ShareOptions } | null => {
  const decoded = decodeBase64(token);
  if (!decoded) {
    return null;
  }

  try {
    const parsed = JSON.parse(decoded) as Partial<SharedSnapshotPayload>;
    const options: ShareOptions = {
      hideNotes: Boolean(parsed.options?.hideNotes),
      hideProtocol: Boolean(parsed.options?.hideProtocol),
      hideSymptoms: Boolean(parsed.options?.hideSymptoms)
    };
    const data = coerceStoredAppData(parsed.data);
    return {
      data,
      generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : null,
      options
    };
  } catch {
    return null;
  }
};
