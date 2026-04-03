import { createHash } from "node:crypto";
import {
  deleteKey,
  getCounter,
  getString,
  incrementCounterWindow,
  setStringWindow
} from "./redisStore.js";

export interface VerificationFunnelCounts {
  signupStarted: number;
  verificationEmailsSent: number;
  verificationResends: number;
  confirmPageViews: number;
  verifiedCompletions: number;
  firstVerifiedSignIns: number;
}

export interface VerificationFunnelSnapshot {
  storeAvailable: boolean;
  last7d: VerificationFunnelCounts;
  last30d: VerificationFunnelCounts;
}

type VerificationFunnelMetric =
  | "signupStarted"
  | "verificationEmailsSent"
  | "verificationResends"
  | "confirmPageViews"
  | "verifiedCompletions"
  | "firstVerifiedSignIns";

const WINDOW_7D_SECONDS = 7 * 24 * 60 * 60;
const WINDOW_30D_SECONDS = 30 * 24 * 60 * 60;
const PENDING_FIRST_SIGNIN_TTL_SECONDS = 30 * 24 * 60 * 60;

const WINDOW_CONFIG = [
  { key: "last7d", ttlSeconds: WINDOW_7D_SECONDS },
  { key: "last30d", ttlSeconds: WINDOW_30D_SECONDS }
] as const;

const METRIC_KEY_MAP: Record<VerificationFunnelMetric, string> = {
  signupStarted: "signup_started",
  verificationEmailsSent: "verification_emails_sent",
  verificationResends: "verification_resends",
  confirmPageViews: "confirm_page_views",
  verifiedCompletions: "verified_completions",
  firstVerifiedSignIns: "first_verified_signins"
};

const emptyCounts = (): VerificationFunnelCounts => ({
  signupStarted: 0,
  verificationEmailsSent: 0,
  verificationResends: 0,
  confirmPageViews: 0,
  verifiedCompletions: 0,
  firstVerifiedSignIns: 0
});

const normalizeEmail = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase();

const isEmailFormatValid = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const emailHash = (email: string): string =>
  createHash("sha256").update(normalizeEmail(email)).digest("hex");

const metricCounterKey = (
  metric: VerificationFunnelMetric,
  windowKey: (typeof WINDOW_CONFIG)[number]["key"]
): string => `cloud:auth:funnel:${METRIC_KEY_MAP[metric]}:${windowKey}`;

const pendingVerifiedSigninKey = (email: string): string =>
  `cloud:auth:funnel:pending-first-signin:${emailHash(email)}`;

const incrementMetric = async (metric: VerificationFunnelMetric): Promise<void> => {
  await Promise.all(
    WINDOW_CONFIG.map((window) =>
      incrementCounterWindow(metricCounterKey(metric, window.key), window.ttlSeconds, 1)
    )
  );
};

const readWindowCounts = async (
  windowKey: (typeof WINDOW_CONFIG)[number]["key"]
): Promise<VerificationFunnelCounts> => {
  const metrics = Object.keys(METRIC_KEY_MAP) as VerificationFunnelMetric[];
  const values = await Promise.all(
    metrics.map((metric) => getCounter(metricCounterKey(metric, windowKey)))
  );
  return metrics.reduce<VerificationFunnelCounts>((result, metric, index) => {
    result[metric] = values[index] ?? 0;
    return result;
  }, emptyCounts());
};

export const getVerificationFunnelSnapshot = async (): Promise<VerificationFunnelSnapshot> => {
  try {
    const [last7d, last30d] = await Promise.all([
      readWindowCounts("last7d"),
      readWindowCounts("last30d")
    ]);
    return {
      storeAvailable: true,
      last7d,
      last30d
    };
  } catch {
    return {
      storeAvailable: false,
      last7d: emptyCounts(),
      last30d: emptyCounts()
    };
  }
};

export const recordVerificationSignupStarted = async (): Promise<void> => {
  try {
    await incrementMetric("signupStarted");
  } catch {
    // Metrics are best effort and must never block auth.
  }
};

export const recordVerificationEmailSent = async (): Promise<void> => {
  try {
    await incrementMetric("verificationEmailsSent");
  } catch {
    // Metrics are best effort and must never block auth.
  }
};

export const recordVerificationResendRequested = async (): Promise<void> => {
  try {
    await incrementMetric("verificationResends");
  } catch {
    // Metrics are best effort and must never block auth.
  }
};

export const recordVerificationConfirmOpened = async (): Promise<void> => {
  try {
    await incrementMetric("confirmPageViews");
  } catch {
    // Metrics are best effort and must never block auth.
  }
};

export const markVerificationCompleted = async (email: string | null | undefined): Promise<void> => {
  const normalizedEmail = normalizeEmail(email);
  if (!isEmailFormatValid(normalizedEmail)) {
    return;
  }
  try {
    await incrementMetric("verifiedCompletions");
    await setStringWindow(
      pendingVerifiedSigninKey(normalizedEmail),
      new Date().toISOString(),
      PENDING_FIRST_SIGNIN_TTL_SECONDS
    );
  } catch {
    // Metrics are best effort and must never block auth.
  }
};

export const consumeVerifiedSigninMarker = async (
  email: string | null | undefined
): Promise<boolean> => {
  const normalizedEmail = normalizeEmail(email);
  if (!isEmailFormatValid(normalizedEmail)) {
    return false;
  }
  try {
    const markerKey = pendingVerifiedSigninKey(normalizedEmail);
    const pending = await getString(markerKey);
    if (!pending) {
      return false;
    }
    await deleteKey(markerKey);
    await incrementMetric("firstVerifiedSignIns");
    return true;
  } catch {
    return false;
  }
};
