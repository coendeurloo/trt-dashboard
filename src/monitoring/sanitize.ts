const FALLBACK_ORIGIN = "https://labtracker.local";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const SHARE_PATH_PATTERN = /\/s\/[A-Za-z0-9_-]{6,}/g;
const TOKEN_PAIR_PATTERN = /\b(access_token|refresh_token|token|authorization|cookie)=([^&\s]+)/gi;
const SENSITIVE_QUERY_PARAM_PATTERN =
  /(^|[?&\s])(share|s|cloudEmail|confirmation_url|recovery_url)=([^&\s]+)/gi;

const SENSITIVE_KEY_PATTERNS = [
  /^access_?token$/i,
  /^refresh_?token$/i,
  /^token$/i,
  /^authorization$/i,
  /^cookie$/i,
  /^email$/i,
  /^filename$/i,
  /^fileName$/i,
  /^source_?filename$/i,
  /^sourceFileName$/i,
  /^rawPdfBuffer$/i,
  /^rawText$/i,
  /^pdfText$/i,
  /^notes?$/i,
  /^symptoms?$/i,
  /^payload$/i,
  /^reports?$/i,
  /^markers?$/i,
  /^check_?ins?$/i,
  /^supplementTimeline$/i,
  /^protocols?$/i,
  /^personalInfo$/i
];

const isSensitiveKey = (key: string): boolean => SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const sanitizePathname = (pathname: string): string => pathname.replace(SHARE_PATH_PATTERN, "/s/[redacted]");

export const sanitizeMonitoringText = (value: string): string => {
  if (!value) {
    return value;
  }

  return value
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(SHARE_PATH_PATTERN, "/s/[redacted]")
    .replace(TOKEN_PAIR_PATTERN, (_match, key: string) => `${key}=[redacted]`)
    .replace(
      SENSITIVE_QUERY_PARAM_PATTERN,
      (_match, prefix: string, key: string) => `${prefix}${key}=[redacted]`
    );
};

export const sanitizeMonitoringUrl = (value: string): string => {
  if (!value) {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const looksLikeUrl =
    trimmed.startsWith("/") ||
    trimmed.startsWith("?") ||
    /^[a-z][a-z\d+.-]*:/i.test(trimmed);

  if (!looksLikeUrl) {
    return sanitizeMonitoringText(trimmed);
  }

  try {
    const parsed = new URL(trimmed, FALLBACK_ORIGIN);
    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = sanitizePathname(parsed.pathname);

    if (trimmed.startsWith("/") || trimmed.startsWith("?")) {
      return parsed.pathname;
    }

    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return sanitizeMonitoringText(trimmed);
  }
};

export const sanitizeMonitoringValue = (value: unknown, key?: string): unknown => {
  if (typeof key === "string" && isSensitiveKey(key)) {
    return "[redacted]";
  }

  if (typeof value === "string") {
    return sanitizeMonitoringText(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeMonitoringValue(entry));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeMonitoringValue(entryValue, entryKey)
      ])
    );
  }

  return sanitizeMonitoringText(String(value));
};

export const sanitizeMonitoringRecord = (
  value: Record<string, unknown>
): Record<string, unknown> => sanitizeMonitoringValue(value) as Record<string, unknown>;
