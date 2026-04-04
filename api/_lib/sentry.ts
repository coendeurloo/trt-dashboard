import * as Sentry from "@sentry/node";
import type { Event, SeverityLevel } from "@sentry/node";
import { sanitizeMonitoringRecord, sanitizeMonitoringText, sanitizeMonitoringUrl, sanitizeMonitoringValue } from "../../src/monitoring/sanitize.js";

type MonitoringTagValue = string | number | boolean | null | undefined;
type MonitoringSpanAttributes = Record<
  string,
  | string
  | number
  | boolean
  | Array<null | undefined | string>
  | Array<null | undefined | number>
  | Array<null | undefined | boolean>
  | undefined
>;
type MonitoringFrame = { filename?: string };
type MonitoringExceptionValue = {
  value?: string;
  stacktrace?: { frames?: MonitoringFrame[] };
};
type MonitoringBreadcrumb = {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
};

interface MonitoringContext {
  tags?: Record<string, MonitoringTagValue>;
  extra?: Record<string, unknown>;
  fingerprint?: string[];
  level?: SeverityLevel;
}

interface MonitoringSpanOptions {
  name: string;
  op: string;
  attributes?: MonitoringSpanAttributes;
  forceTransaction?: boolean;
}

let sentryInitialized = false;

const getServerDsn = (): string => String(process.env.SENTRY_DSN ?? "").trim();

const normalizeSampleRate = (raw: string | undefined, fallback: number): number => {
  const parsed = Number(raw ?? "");
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return fallback;
  }
  return parsed;
};

const sanitizeTags = (tags: Record<string, MonitoringTagValue> | undefined): Record<string, string> => {
  if (!tags) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(tags)
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim().length > 0)
      .map(([key, value]) => [key, sanitizeMonitoringText(String(value))])
  );
};

const sanitizeSpanAttributes = (
  attributes: MonitoringSpanAttributes | undefined
): MonitoringSpanAttributes | undefined => {
  if (!attributes) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => {
      if (typeof value === "string") {
        const sanitizedValue = key.toLowerCase().includes("url")
          ? sanitizeMonitoringUrl(value)
          : sanitizeMonitoringText(value);
        return [key, sanitizedValue];
      }

      if (Array.isArray(value)) {
        return [
          key,
          value.map((entry) =>
            typeof entry === "string" ? sanitizeMonitoringText(entry) : entry
          ) as MonitoringSpanAttributes[string]
        ];
      }

      return [key, value];
    })
  ) as MonitoringSpanAttributes;
};

const sanitizeEventCommon = <T extends Event>(event: T): T => {
  const nextEvent = { ...event };

  if (nextEvent.request) {
    nextEvent.request = {
      ...nextEvent.request,
      url: nextEvent.request.url ? sanitizeMonitoringUrl(nextEvent.request.url) : nextEvent.request.url,
      headers: undefined,
      cookies: undefined,
      data:
        nextEvent.request.data && typeof nextEvent.request.data === "object"
          ? sanitizeMonitoringValue(nextEvent.request.data)
          : undefined
    };
  }

  if (nextEvent.user) {
    nextEvent.user = {};
  }

  if (nextEvent.server_name) {
    nextEvent.server_name = sanitizeMonitoringText(nextEvent.server_name);
  }

  if (nextEvent.tags) {
    nextEvent.tags = Object.fromEntries(
      Object.entries(nextEvent.tags).map(([key, value]) => [key, sanitizeMonitoringText(String(value))])
    );
  }

  if (nextEvent.extra) {
    nextEvent.extra = sanitizeMonitoringRecord(nextEvent.extra);
  }

  if (nextEvent.contexts) {
    nextEvent.contexts = sanitizeMonitoringValue(nextEvent.contexts) as typeof nextEvent.contexts;
  }

  if (nextEvent.exception?.values) {
    nextEvent.exception = {
      ...nextEvent.exception,
      values: nextEvent.exception.values.map((value: MonitoringExceptionValue) => ({
        ...value,
        value: value.value ? sanitizeMonitoringText(value.value) : value.value,
        stacktrace: value.stacktrace
          ? {
              ...value.stacktrace,
              frames: value.stacktrace.frames?.map((frame: MonitoringFrame) => ({
                ...frame,
                filename: frame.filename ? sanitizeMonitoringUrl(frame.filename) : frame.filename
              }))
            }
          : value.stacktrace
      }))
    };
  }

  if (nextEvent.breadcrumbs) {
    nextEvent.breadcrumbs = nextEvent.breadcrumbs.map((breadcrumb: MonitoringBreadcrumb) => ({
      ...breadcrumb,
      category: breadcrumb.category ? sanitizeMonitoringText(breadcrumb.category) : breadcrumb.category,
      message: breadcrumb.message ? sanitizeMonitoringText(breadcrumb.message) : breadcrumb.message,
      data: breadcrumb.data ? sanitizeMonitoringValue(breadcrumb.data) as typeof breadcrumb.data : breadcrumb.data
    }));
  }

  return nextEvent;
};

const sanitizeSpan = <T extends { description?: string; data: MonitoringSpanAttributes }>(span: T): T => ({
  ...span,
  description: span.description ? sanitizeMonitoringText(span.description) : span.description,
  data: sanitizeSpanAttributes(span.data) ?? span.data
});

const applyScopeContext = (scope: Sentry.Scope, context?: MonitoringContext) => {
  const sanitizedTags = sanitizeTags(context?.tags);
  Object.entries(sanitizedTags).forEach(([key, value]) => {
    scope.setTag(key, value);
  });

  if (context?.extra) {
    scope.setExtras(sanitizeMonitoringRecord(context.extra));
  }

  if (context?.fingerprint?.length) {
    scope.setFingerprint(context.fingerprint.map((entry) => sanitizeMonitoringText(entry)));
  }

  if (context?.level) {
    scope.setLevel(context.level);
  }
};

export const isServerSentryEnabled = (): boolean => getServerDsn().length > 0;

export const initServerSentry = (): boolean => {
  if (sentryInitialized) {
    return true;
  }

  if (!isServerSentryEnabled()) {
    return false;
  }

  Sentry.init({
    dsn: getServerDsn(),
    enabled: true,
    sendDefaultPii: false,
    environment:
      String(process.env.SENTRY_ENVIRONMENT ?? "").trim() ||
      String(process.env.VERCEL_ENV ?? "").trim() ||
      String(process.env.NODE_ENV ?? "").trim() ||
      undefined,
    release:
      String(process.env.SENTRY_RELEASE ?? "").trim() ||
      String(process.env.VERCEL_GIT_COMMIT_SHA ?? "").trim() ||
      undefined,
    tracesSampleRate: normalizeSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
    beforeSend: (event) => sanitizeEventCommon(event),
    beforeSendTransaction: (event) => sanitizeEventCommon(event),
    beforeSendSpan: (span) => sanitizeSpan(span),
    initialScope: {
      tags: {
        app: "labtracker",
        surface: "api"
      }
    }
  });

  sentryInitialized = true;
  return true;
};

export const captureServerException = async (
  error: unknown,
  context?: MonitoringContext
): Promise<string | undefined> => {
  if (!initServerSentry()) {
    return undefined;
  }

  const eventId = Sentry.withScope((scope) => {
    applyScopeContext(scope, context);
    return Sentry.captureException(
      error instanceof Error ? error : new Error(sanitizeMonitoringText(String(error ?? "Unknown server error")))
    );
  });

  await Sentry.flush(2000);
  return eventId;
};

export const withServerMonitoringSpan = async <T>(
  options: MonitoringSpanOptions,
  callback: () => Promise<T>
): Promise<T> => {
  if (!initServerSentry()) {
    return callback();
  }

  return Sentry.startSpan(
    {
      name: options.name,
      op: options.op,
      forceTransaction: options.forceTransaction,
      attributes: sanitizeSpanAttributes(options.attributes)
    },
    callback
  );
};

export const withServerMonitor = async <T>(
  monitorSlug: string,
  callback: () => Promise<T>,
  monitorConfig: Parameters<typeof Sentry.withMonitor>[2]
): Promise<T> => {
  if (!initServerSentry()) {
    return callback();
  }

  return Sentry.withMonitor(monitorSlug, callback, monitorConfig);
};
