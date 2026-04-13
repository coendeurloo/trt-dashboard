import * as Sentry from "@sentry/react";
import type { Event, SeverityLevel } from "@sentry/react";
import { sanitizeMonitoringRecord, sanitizeMonitoringText, sanitizeMonitoringUrl, sanitizeMonitoringValue } from "./sanitize";

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

export interface MonitoringContext {
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

const CLIENT_DSN = String(import.meta.env.VITE_SENTRY_DSN ?? "").trim();

let sentryInitialized = false;

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

export const isSentryClientEnabled = (): boolean => CLIENT_DSN.length > 0;

export const initSentry = (): void => {
  if (sentryInitialized || !isSentryClientEnabled()) {
    return;
  }

  Sentry.init({
    dsn: CLIENT_DSN,
    enabled: true,
    sendDefaultPii: false,
    environment:
      String(import.meta.env.VITE_SENTRY_ENVIRONMENT ?? "").trim() ||
      import.meta.env.MODE ||
      undefined,
    release: String(import.meta.env.VITE_SENTRY_RELEASE ?? "").trim() || undefined,
    tracesSampleRate: normalizeSampleRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE, 0.12),
    integrations: [Sentry.browserTracingIntegration()],
    ignoreErrors: [
      "AI_REQUEST_ABORTED",
      "Cannot read properties of null (reading 'postMessage')"
    ],
    beforeSend: (event) => sanitizeEventCommon(event),
    beforeSendTransaction: (event) => sanitizeEventCommon(event),
    beforeSendSpan: (span) => sanitizeSpan(span),
    initialScope: {
      tags: {
        app: "labtracker",
        surface: "web"
      }
    }
  });

  sentryInitialized = true;
};

export const captureAppException = (error: unknown, context?: MonitoringContext): string | undefined => {
  if (!isSentryClientEnabled()) {
    return undefined;
  }

  return Sentry.withScope((scope) => {
    applyScopeContext(scope, context);
    return Sentry.captureException(
      error instanceof Error ? error : new Error(sanitizeMonitoringText(String(error ?? "Unknown error")))
    );
  });
};

export const captureAppMessage = (
  message: string,
  context?: MonitoringContext
): string | undefined => {
  if (!isSentryClientEnabled()) {
    return undefined;
  }

  return Sentry.withScope((scope) => {
    applyScopeContext(scope, context);
    return Sentry.captureMessage(sanitizeMonitoringText(message));
  });
};

export const withMonitoringSpan = async <T>(
  options: MonitoringSpanOptions,
  callback: () => Promise<T>
): Promise<T> => {
  if (!isSentryClientEnabled()) {
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
