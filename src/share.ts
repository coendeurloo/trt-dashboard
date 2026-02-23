import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { APP_SCHEMA_VERSION, DEFAULT_SETTINGS } from "./constants";
import { LabReport, MarkerValue, StoredAppData } from "./types";
import { coerceStoredAppData } from "./storage";
import { createId } from "./utils";

export interface ShareOptions {
  hideNotes: boolean;
  hideProtocol: boolean;
  hideSymptoms: boolean;
}

interface SharedSnapshotPayloadV1 {
  schemaVersion: number;
  generatedAt: string;
  options: ShareOptions;
  data: StoredAppData;
}

interface SharedSnapshotPayloadV2 {
  v: 2;
  g: string;
  o: ShareOptions;
  s: {
    u: StoredAppData["settings"]["unitSystem"];
    l: StoredAppData["settings"]["language"];
    t: StoredAppData["settings"]["theme"];
  };
  r: Array<{
    d: string;
    c: string;
    f: string;
    t: LabReport["annotations"]["samplingTiming"];
    an: {
      p: string;
      sy: string;
      n: string;
    };
    m: Array<{
      m: string;
      v: number;
      u: string;
      n: number | null;
      x: number | null;
      a: MarkerValue["abnormal"];
    }>;
  }>;
}

const SHARE_TOKEN_V2_PREFIX = "s2.";
export const SHARE_REPORT_CAP_SEQUENCE = [8, 6, 4, 2, 1] as const;

const encodeBase64 = (value: string): string => {
  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    return window.btoa(unescape(encodeURIComponent(value)));
  }
  const bufferCtor = (globalThis as { Buffer?: { from: (input: string, encoding?: string) => { toString: (encoding?: string) => string } } }).Buffer;
  if (bufferCtor) {
    return bufferCtor.from(value, "utf8").toString("base64");
  }
  return "";
};

const decodeBase64 = (value: string): string | null => {
  if (typeof window !== "undefined" && typeof window.atob === "function") {
    try {
      return decodeURIComponent(escape(window.atob(value)));
    } catch {
      return null;
    }
  }
  const bufferCtor = (globalThis as { Buffer?: { from: (input: string, encoding?: string) => { toString: (encoding?: string) => string } } }).Buffer;
  if (bufferCtor) {
    try {
      return bufferCtor.from(value, "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  return null;
};

const sanitizeReportForShare = (report: LabReport, options: ShareOptions): LabReport => ({
  ...report,
  annotations: {
    ...report.annotations,
    protocolId: options.hideProtocol ? null : report.annotations.protocolId,
    protocol: options.hideProtocol ? "" : report.annotations.protocol,
    supplementOverrides: null,
    symptoms: options.hideSymptoms ? "" : report.annotations.symptoms,
    notes: options.hideNotes ? "" : report.annotations.notes
  }
});

const compareReportsByRecency = (left: LabReport, right: LabReport): number => {
  const byTestDate = right.testDate.localeCompare(left.testDate);
  if (byTestDate !== 0) {
    return byTestDate;
  }
  return right.createdAt.localeCompare(left.createdAt);
};

export const buildShareSubsetData = (data: StoredAppData, reportCap: number): StoredAppData => {
  if (!Number.isFinite(reportCap) || reportCap <= 0 || data.reports.length <= reportCap) {
    return data;
  }

  const recentIds = new Set(
    [...data.reports]
      .sort(compareReportsByRecency)
      .slice(0, Math.max(1, Math.round(reportCap)))
      .map((report) => report.id)
  );

  return {
    ...data,
    reports: data.reports.filter((report) => recentIds.has(report.id))
  };
};

const buildLegacyShareToken = (data: StoredAppData, options: ShareOptions): string => {
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

  const payload: SharedSnapshotPayloadV1 = {
    schemaVersion: APP_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    options,
    data: sanitizedData
  };

  return encodeBase64(JSON.stringify(payload));
};

const toCompactV2 = (data: StoredAppData, options: ShareOptions): SharedSnapshotPayloadV2 => {
  const reports = data.reports.map((report) => {
    const sanitized = sanitizeReportForShare(report, options);
    return {
      d: sanitized.testDate,
      c: sanitized.createdAt,
      f: sanitized.sourceFileName,
      t: sanitized.annotations.samplingTiming,
      an: {
        p: sanitized.annotations.protocol,
        sy: sanitized.annotations.symptoms,
        n: sanitized.annotations.notes
      },
      m: sanitized.markers.map((marker) => ({
        m: marker.canonicalMarker,
        v: marker.value,
        u: marker.unit,
        n: marker.referenceMin,
        x: marker.referenceMax,
        a: marker.abnormal
      }))
    };
  });

  return {
    v: 2,
    g: new Date().toISOString(),
    o: options,
    s: {
      u: data.settings.unitSystem,
      l: data.settings.language,
      t: data.settings.theme
    },
    r: reports
  };
};

const parseV2Snapshot = (
  token: string
): { data: StoredAppData; generatedAt: string | null; options: ShareOptions } | null => {
  if (!token.startsWith(SHARE_TOKEN_V2_PREFIX)) {
    return null;
  }

  const encoded = token.slice(SHARE_TOKEN_V2_PREFIX.length);
  const decoded = decompressFromEncodedURIComponent(encoded);
  if (!decoded) {
    return null;
  }

  try {
    const parsed = JSON.parse(decoded) as Partial<SharedSnapshotPayloadV2>;
    if (parsed.v !== 2 || !Array.isArray(parsed.r)) {
      return null;
    }

    const options: ShareOptions = {
      hideNotes: Boolean(parsed.o?.hideNotes),
      hideProtocol: Boolean(parsed.o?.hideProtocol),
      hideSymptoms: Boolean(parsed.o?.hideSymptoms)
    };

    const reports: LabReport[] = parsed.r.map((report, reportIndex) => {
      const testDate = typeof report.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(report.d) ? report.d : "";
      const createdAt = typeof report.c === "string" && report.c.trim().length > 0 ? report.c : new Date().toISOString();
      const markers = Array.isArray(report.m)
        ? report.m
            .map((marker, markerIndex): MarkerValue | null => {
              const markerValue = Number(marker.v);
              if (!Number.isFinite(markerValue)) {
                return null;
              }
              const canonicalMarker = typeof marker.m === "string" && marker.m.trim().length > 0 ? marker.m.trim() : "Unknown Marker";
              const unit = typeof marker.u === "string" ? marker.u : "";
              const referenceMin = marker.n === null || marker.n === undefined ? null : Number(marker.n);
              const referenceMax = marker.x === null || marker.x === undefined ? null : Number(marker.x);
              const abnormal = marker.a === "high" || marker.a === "low" || marker.a === "normal" || marker.a === "unknown" ? marker.a : "unknown";
              return {
                id: `${reportIndex}-${markerIndex}-${createId()}`,
                marker: canonicalMarker,
                canonicalMarker,
                value: markerValue,
                unit,
                referenceMin: Number.isFinite(referenceMin) ? referenceMin : null,
                referenceMax: Number.isFinite(referenceMax) ? referenceMax : null,
                abnormal,
                confidence: 1,
                source: "measured"
              };
            })
            .filter((marker): marker is MarkerValue => Boolean(marker))
        : [];

      return {
        id: createId(),
        sourceFileName: typeof report.f === "string" && report.f.trim() ? report.f.trim() : "shared-report.pdf",
        testDate,
        createdAt,
        markers,
        annotations: {
          protocolId: null,
          protocol: typeof report.an?.p === "string" ? report.an.p : "",
          supplementOverrides: null,
          symptoms: typeof report.an?.sy === "string" ? report.an.sy : "",
          notes: typeof report.an?.n === "string" ? report.an.n : "",
          samplingTiming:
            report.t === "unknown" || report.t === "trough" || report.t === "mid" || report.t === "peak" ? report.t : "unknown"
        },
        extraction: {
          provider: "fallback",
          model: "share-v2",
          confidence: 1,
          needsReview: false
        }
      };
    });

    const data = coerceStoredAppData({
      schemaVersion: APP_SCHEMA_VERSION,
      reports,
      protocols: [],
      supplementTimeline: [],
      checkIns: [],
      markerAliasOverrides: {},
      settings: {
        ...DEFAULT_SETTINGS,
        unitSystem: parsed.s?.u ?? DEFAULT_SETTINGS.unitSystem,
        language: parsed.s?.l ?? DEFAULT_SETTINGS.language,
        theme: parsed.s?.t ?? DEFAULT_SETTINGS.theme,
        aiExternalConsent: false,
        aiAutoImproveEnabled: false
      }
    });

    return {
      data,
      generatedAt: typeof parsed.g === "string" ? parsed.g : null,
      options
    };
  } catch {
    return null;
  }
};

const parseV1Snapshot = (
  token: string
): { data: StoredAppData; generatedAt: string | null; options: ShareOptions } | null => {
  const decoded = decodeBase64(token);
  if (!decoded) {
    return null;
  }

  try {
    const parsed = JSON.parse(decoded) as Partial<SharedSnapshotPayloadV1>;
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

export const buildShareToken = (data: StoredAppData, options: ShareOptions): string => {
  const v2Payload = toCompactV2(data, options);
  const compressed = compressToEncodedURIComponent(JSON.stringify(v2Payload));
  if (compressed) {
    return `${SHARE_TOKEN_V2_PREFIX}${compressed}`;
  }
  return buildLegacyShareToken(data, options);
};

export const parseShareToken = (
  token: string
): { data: StoredAppData; generatedAt: string | null; options: ShareOptions } | null => {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return null;
  }

  if (normalizedToken.startsWith(SHARE_TOKEN_V2_PREFIX)) {
    return parseV2Snapshot(normalizedToken);
  }

  return parseV1Snapshot(normalizedToken);
};
