import { useEffect, useMemo, useState } from "react";
import { AppMode } from "../types";
import {
  buildGoogleOAuthUrl,
  CloudSession,
  fetchCurrentSession,
  parseOAuthHashSession,
  requestPasswordResetEmail as requestPasswordResetEmailClient,
  requestVerificationEmail as requestVerificationEmailClient,
  requestUnlockEmail as requestUnlockEmailClient,
  resetPasswordWithRecovery,
  signInWithPassword,
  signOutSession,
  signUpWithPassword
} from "../cloud/authClient";
import {
  CLOUD_MODE_STORAGE_KEY,
  CLOUD_OAUTH_STATE_STORAGE_KEY,
  CLOUD_PENDING_SIGNUP_CONSENT_STORAGE_KEY,
  CLOUD_PRIVACY_POLICY_VERSION,
  isSupabaseConfigured
} from "../cloud/constants";
import {
  CloudConsentPayload,
  CloudConsentState,
  fetchCloudConsent,
  submitCloudConsent
} from "../cloud/consentClient";

type CloudAuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";
type CloudConsentStatus = "loading" | "granted" | "required" | "error";
type GoogleAuthIntent = "signin" | "signup";

interface UseCloudAuthResult {
  configured: boolean;
  status: CloudAuthStatus;
  consentStatus: CloudConsentStatus;
  consent: CloudConsentState | null;
  session: CloudSession | null;
  error: string | null;
  cloudEnabled: boolean;
  appMode: AppMode;
  setCloudEnabled: (enabled: boolean) => void;
  completeConsent: (payload: CloudConsentPayload) => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string, payload: CloudConsentPayload) => Promise<void>;
  signInGoogle: (intent?: GoogleAuthIntent, payload?: CloudConsentPayload) => Promise<void>;
  requestVerificationEmail: (email: string) => Promise<void>;
  requestPasswordResetEmail: (email: string) => Promise<void>;
  requestUnlockEmail: (email: string) => Promise<void>;
  resetPassword: (accessToken: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

type PendingSignupConsent = {
  payload: CloudConsentPayload;
  createdAt: string;
};

type PendingOAuthState = {
  state: string;
  intent: GoogleAuthIntent;
  createdAt: string;
};

const OAUTH_STATE_MAX_AGE_MS = 15 * 60 * 1000;

const loadCloudEnabledPref = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(CLOUD_MODE_STORAGE_KEY) === "1";
};

const hasStoredCloudEnabledPref = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(CLOUD_MODE_STORAGE_KEY) !== null;
};

const loadPendingSignupConsent = (): PendingSignupConsent | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(CLOUD_PENDING_SIGNUP_CONSENT_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as PendingSignupConsent;
    if (
      parsed?.payload?.acceptPrivacyPolicy === true &&
      parsed?.payload?.acceptHealthDataConsent === true &&
      typeof parsed.payload.privacyPolicyVersion === "string"
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
};

const persistPendingSignupConsent = (pending: PendingSignupConsent | null): void => {
  if (typeof window === "undefined") {
    return;
  }
  if (!pending) {
    window.localStorage.removeItem(CLOUD_PENDING_SIGNUP_CONSENT_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(CLOUD_PENDING_SIGNUP_CONSENT_STORAGE_KEY, JSON.stringify(pending));
};

const createOAuthState = (): string => {
  if (typeof window === "undefined" || !window.crypto || typeof window.crypto.getRandomValues !== "function") {
    throw new Error("AUTH_OAUTH_STATE_UNAVAILABLE");
  }
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
};

const clearPendingOAuthState = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(CLOUD_OAUTH_STATE_STORAGE_KEY);
};

const loadPendingOAuthState = (): PendingOAuthState | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(CLOUD_OAUTH_STATE_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as PendingOAuthState;
    const normalizedState = String(parsed.state ?? "").trim();
    const createdAtMs = Date.parse(String(parsed.createdAt ?? ""));
    if (
      (parsed.intent !== "signin" && parsed.intent !== "signup") ||
      !/^[a-f0-9]{48}$/i.test(normalizedState) ||
      !Number.isFinite(createdAtMs) ||
      Date.now() - createdAtMs > OAUTH_STATE_MAX_AGE_MS
    ) {
      clearPendingOAuthState();
      return null;
    }
    return {
      state: normalizedState,
      intent: parsed.intent,
      createdAt: new Date(createdAtMs).toISOString()
    };
  } catch {
    clearPendingOAuthState();
    return null;
  }
};

const persistPendingOAuthState = (intent: GoogleAuthIntent): string => {
  if (typeof window === "undefined") {
    throw new Error("AUTH_OAUTH_STATE_UNAVAILABLE");
  }
  const state = createOAuthState();
  const pending: PendingOAuthState = {
    state,
    intent,
    createdAt: new Date().toISOString()
  };
  window.localStorage.setItem(CLOUD_OAUTH_STATE_STORAGE_KEY, JSON.stringify(pending));
  return state;
};

const hasOAuthTokensInHash = (hash: string): boolean => {
  const cleanHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!cleanHash) {
    return false;
  }
  const params = new URLSearchParams(cleanHash);
  return Boolean(params.get("access_token") || params.get("refresh_token"));
};

const clearOAuthHashFromUrl = (): void => {
  if (typeof window === "undefined" || !window.location.hash) {
    return;
  }
  const cleanUrl = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState({}, document.title, cleanUrl);
};

const normalizeConsentStatus = (
  consent: CloudConsentState | null
): CloudConsentStatus => {
  if (!consent) {
    return "required";
  }
  return consent.hasConsent ? "granted" : "required";
};

const shouldHandleOAuthHashFromPath = (pathname: string): boolean => {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  return (
    normalizedPath !== "/auth/confirm" &&
    normalizedPath !== "/auth/verified" &&
    normalizedPath !== "/auth/reset"
  );
};

export const useCloudAuth = (isShareMode: boolean): UseCloudAuthResult => {
  const configured = isSupabaseConfigured();
  const [status, setStatus] = useState<CloudAuthStatus>(configured ? "loading" : "unauthenticated");
  const [consentStatus, setConsentStatus] = useState<CloudConsentStatus>("required");
  const [consent, setConsent] = useState<CloudConsentState | null>(null);
  const [session, setSession] = useState<CloudSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cloudEnabled, setCloudEnabledState] = useState<boolean>(() => loadCloudEnabledPref());

  const setCloudEnabled = (enabled: boolean) => {
    setCloudEnabledState(enabled);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CLOUD_MODE_STORAGE_KEY, enabled ? "1" : "0");
    }
  };

  const hydrateConsent = async (): Promise<CloudConsentState> => {
    setConsentStatus("loading");
    const nextConsent = await fetchCloudConsent();
    setConsent(nextConsent);
    setConsentStatus(normalizeConsentStatus(nextConsent));
    return nextConsent;
  };

  useEffect(() => {
    if (!configured) {
      setStatus("unauthenticated");
      setSession(null);
      setConsent(null);
      setConsentStatus("required");
      setError(null);
      return;
    }

    let cancelled = false;
    const hydrate = async () => {
      setStatus("loading");
      setError(null);
      try {
        const hasStoredPreference = hasStoredCloudEnabledPref();
        let oauthErrorMessage: string | null = null;
        let usedOAuthReturn = false;
        let nextSession: CloudSession | null = null;

        if (typeof window !== "undefined") {
          if (shouldHandleOAuthHashFromPath(window.location.pathname)) {
            const pendingOAuthState = loadPendingOAuthState();
            const containsOAuthHash = hasOAuthTokensInHash(window.location.hash);

            if (pendingOAuthState) {
              try {
                const hashSession = await parseOAuthHashSession(window.location.hash, pendingOAuthState.state);
                if (hashSession) {
                  nextSession = hashSession;
                  usedOAuthReturn = true;
                }
              } catch (oauthError) {
                oauthErrorMessage = oauthError instanceof Error ? oauthError.message : "AUTH_OAUTH_STATE_INVALID";
              } finally {
                clearPendingOAuthState();
                clearOAuthHashFromUrl();
              }
            } else if (containsOAuthHash) {
              oauthErrorMessage = "AUTH_OAUTH_STATE_INVALID";
              clearOAuthHashFromUrl();
            }
          }
        }

        if (!nextSession) {
          nextSession = await fetchCurrentSession();
        }

        if (!nextSession) {
          if (!cancelled) {
            setSession(null);
            setConsent(null);
            setConsentStatus("required");
            setStatus("unauthenticated");
            setError(oauthErrorMessage);
          }
          return;
        }

        if (cancelled) {
          return;
        }

        setSession(nextSession);
        setStatus("authenticated");
        setError(oauthErrorMessage);
        if (usedOAuthReturn || !hasStoredPreference) {
          setCloudEnabled(true);
        }

        const pendingSignupConsent = loadPendingSignupConsent();
        if (pendingSignupConsent) {
          try {
            const savedConsent = await submitCloudConsent(pendingSignupConsent.payload);
            if (cancelled) {
              return;
            }
            setConsent(savedConsent);
            setConsentStatus(normalizeConsentStatus(savedConsent));
            persistPendingSignupConsent(null);
          } catch (consentError) {
            if (cancelled) {
              return;
            }
            setConsent(null);
            setConsentStatus("required");
            setError(
              consentError instanceof Error
                ? consentError.message
                : "Could not save signup consent."
            );
          }
        } else {
          await hydrateConsent();
        }
      } catch (authError) {
        if (!cancelled) {
          setSession(null);
          setConsent(null);
          setConsentStatus("error");
          setStatus("error");
          setError(authError instanceof Error ? authError.message : "Auth bootstrap failed");
        }
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [configured]);

  const completeConsent = async (payload: CloudConsentPayload) => {
    if (!session) {
      throw new Error("Not authenticated");
    }
    setError(null);
    setConsentStatus("loading");
    const nextConsent = await submitCloudConsent(payload);
    setConsent(nextConsent);
    setConsentStatus(normalizeConsentStatus(nextConsent));
    setCloudEnabled(true);
  };

  const signInEmailHandler = async (email: string, password: string) => {
    setError(null);
    setConsentStatus("loading");
    clearPendingOAuthState();
    const nextSession = await signInWithPassword(email.trim(), password);
    const pendingSignupConsent = loadPendingSignupConsent();
    let nextConsent: CloudConsentState;
    if (pendingSignupConsent) {
      nextConsent = await submitCloudConsent(pendingSignupConsent.payload);
      persistPendingSignupConsent(null);
    } else {
      nextConsent = await fetchCloudConsent();
    }
    setSession(nextSession);
    setConsent(nextConsent);
    setConsentStatus(normalizeConsentStatus(nextConsent));
    setStatus("authenticated");
    setCloudEnabled(true);
  };

  const signUpEmailHandler = async (
    email: string,
    password: string,
    payload: CloudConsentPayload
  ) => {
    setError(null);
    setConsentStatus("required");
    clearPendingOAuthState();
    persistPendingSignupConsent({
      payload,
      createdAt: new Date().toISOString()
    });
    try {
      await signUpWithPassword(email.trim(), password);
    } catch (signupError) {
      if (
        signupError instanceof Error &&
        signupError.message === "AUTH_EMAIL_VERIFICATION_REQUIRED"
      ) {
        throw signupError;
      }
      persistPendingSignupConsent(null);
      throw signupError;
    }
  };

  const signInGoogle = async (
    intent: GoogleAuthIntent = "signin",
    payload?: CloudConsentPayload
  ) => {
    if (typeof window === "undefined") {
      return;
    }

    if (intent === "signup") {
      if (
        payload?.acceptPrivacyPolicy !== true ||
        payload?.acceptHealthDataConsent !== true ||
        !payload.privacyPolicyVersion
      ) {
        throw new Error("Consent is required before creating an account.");
      }
      persistPendingSignupConsent({
        payload,
        createdAt: new Date().toISOString()
      });
    } else {
      persistPendingSignupConsent(null);
    }

    const redirectTo = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    const oauthState = persistPendingOAuthState(intent);
    window.location.assign(buildGoogleOAuthUrl(redirectTo, oauthState));
  };

  const requestUnlockEmail = async (email: string) => {
    setError(null);
    await requestUnlockEmailClient(email.trim());
  };

  const requestPasswordResetEmail = async (email: string) => {
    setError(null);
    await requestPasswordResetEmailClient(email.trim());
  };

  const requestVerificationEmail = async (email: string) => {
    setError(null);
    await requestVerificationEmailClient(email.trim());
  };

  const resetPassword = async (accessToken: string, password: string) => {
    setError(null);
    return resetPasswordWithRecovery(accessToken, password);
  };

  const signOut = async () => {
    setError(null);
    try {
      await signOutSession();
    } catch {
      // Ignore API sign-out failure and clear local state anyway.
    }
    setSession(null);
    setConsent(null);
    setConsentStatus("required");
    persistPendingSignupConsent(null);
    clearPendingOAuthState();
    setCloudEnabled(false);
    setStatus("unauthenticated");
  };

  const deleteAccount = async () => {
    if (!session) {
      throw new Error("Not authenticated");
    }
    const response = await fetch("/api/cloud/delete-account", {
      method: "POST"
    });
    if (!response.ok) {
      let message = "Account deletion failed";
      try {
        const body = (await response.json()) as { error?: { message?: string } };
        message = body.error?.message || message;
      } catch {
        // Ignore parse error and use fallback message.
      }
      throw new Error(message);
    }
    await signOut();
  };

  const appMode = useMemo<AppMode>(() => {
    if (isShareMode) {
      return "share";
    }
    if (status === "authenticated" && cloudEnabled && consentStatus === "granted") {
      return "cloud";
    }
    return "local";
  }, [cloudEnabled, consentStatus, isShareMode, status]);

  return {
    configured,
    status,
    consentStatus,
    consent,
    session,
    error,
    cloudEnabled,
    appMode,
    setCloudEnabled,
    completeConsent,
    signInEmail: signInEmailHandler,
    signUpEmail: signUpEmailHandler,
    signInGoogle,
    requestVerificationEmail,
    requestPasswordResetEmail,
    requestUnlockEmail,
    resetPassword,
    signOut,
    deleteAccount
  };
};

export type {
  CloudAuthStatus,
  CloudConsentStatus,
  GoogleAuthIntent,
  UseCloudAuthResult
};
export { CLOUD_PRIVACY_POLICY_VERSION };
