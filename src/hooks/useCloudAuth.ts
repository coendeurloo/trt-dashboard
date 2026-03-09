import { useEffect, useMemo, useState } from "react";
import { AppMode } from "../types";
import {
  buildGoogleOAuthUrl,
  CloudSession,
  loadStoredSession,
  parseOAuthHashSession,
  persistSession,
  refreshSession,
  signInWithPassword,
  signOutSession,
  signUpWithPassword
} from "../cloud/authClient";
import {
  CLOUD_MODE_STORAGE_KEY,
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
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

type PendingSignupConsent = {
  payload: CloudConsentPayload;
  createdAt: string;
};

const CLOUD_SESSION_EXPIRY_SKEW_SECONDS = 30;

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

const normalizeConsentStatus = (
  consent: CloudConsentState | null
): CloudConsentStatus => {
  if (!consent) {
    return "required";
  }
  return consent.hasConsent ? "granted" : "required";
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

  const hydrateConsent = async (nextSession: CloudSession): Promise<CloudConsentState> => {
    setConsentStatus("loading");
    const nextConsent = await fetchCloudConsent(nextSession.accessToken);
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
        let nextSession = loadStoredSession();
        const hasStoredPreference = hasStoredCloudEnabledPref();
        let usedOAuthReturn = false;
        if (typeof window !== "undefined") {
          const hashSession = await parseOAuthHashSession(window.location.hash);
          if (hashSession) {
            nextSession = hashSession;
            usedOAuthReturn = true;
            const cleanUrl = `${window.location.pathname}${window.location.search}`;
            window.history.replaceState({}, document.title, cleanUrl);
          }
        }

        if (!nextSession) {
          if (!cancelled) {
            setSession(null);
            persistSession(null);
            setConsent(null);
            setConsentStatus("required");
            setStatus("unauthenticated");
          }
          return;
        }

        const now = Math.floor(Date.now() / 1000);
        if (nextSession.expiresAt <= now + CLOUD_SESSION_EXPIRY_SKEW_SECONDS) {
          nextSession = await refreshSession(nextSession);
        }

        if (cancelled) {
          return;
        }

        setSession(nextSession);
        persistSession(nextSession);
        setStatus("authenticated");
        if (usedOAuthReturn || !hasStoredPreference) {
          setCloudEnabled(true);
        }

        const pendingSignupConsent = loadPendingSignupConsent();
        if (pendingSignupConsent) {
          try {
            const savedConsent = await submitCloudConsent(
              nextSession.accessToken,
              pendingSignupConsent.payload
            );
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
          await hydrateConsent(nextSession);
        }
      } catch (authError) {
        if (!cancelled) {
          setSession(null);
          persistSession(null);
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
    const nextConsent = await submitCloudConsent(session.accessToken, payload);
    setConsent(nextConsent);
    setConsentStatus(normalizeConsentStatus(nextConsent));
    setCloudEnabled(true);
  };

  const signInEmailHandler = async (email: string, password: string) => {
    setError(null);
    setConsentStatus("loading");
    const nextSession = await signInWithPassword(email.trim(), password);
    const nextConsent = await fetchCloudConsent(nextSession.accessToken);
    setSession(nextSession);
    persistSession(nextSession);
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
    setConsentStatus("loading");
    const nextSession = await signUpWithPassword(email.trim(), password);
    setSession(nextSession);
    persistSession(nextSession);
    setStatus("authenticated");
    setCloudEnabled(true);

    try {
      const nextConsent = await submitCloudConsent(nextSession.accessToken, payload);
      setConsent(nextConsent);
      setConsentStatus(normalizeConsentStatus(nextConsent));
      persistPendingSignupConsent(null);
    } catch (consentError) {
      setConsent(null);
      setConsentStatus("required");
      throw consentError instanceof Error
        ? consentError
        : new Error("Could not save consent after signup.");
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
    window.location.assign(buildGoogleOAuthUrl(redirectTo));
  };

  const signOut = async () => {
    const activeSession = session;
    setError(null);
    if (activeSession) {
      try {
        await signOutSession(activeSession.accessToken);
      } catch {
        // Ignore API sign-out failure and clear local session anyway.
      }
    }
    setSession(null);
    setConsent(null);
    setConsentStatus("required");
    persistSession(null);
    persistPendingSignupConsent(null);
    setCloudEnabled(false);
    setStatus("unauthenticated");
  };

  const deleteAccount = async () => {
    if (!session) {
      throw new Error("Not authenticated");
    }
    const response = await fetch("/api/cloud/delete-account", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`
      }
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
