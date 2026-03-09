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
  isSupabaseConfigured
} from "../cloud/constants";

type CloudAuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

interface UseCloudAuthResult {
  configured: boolean;
  status: CloudAuthStatus;
  session: CloudSession | null;
  error: string | null;
  cloudEnabled: boolean;
  appMode: AppMode;
  setCloudEnabled: (enabled: boolean) => void;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string) => Promise<void>;
  signInGoogle: () => void;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

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

export const useCloudAuth = (isShareMode: boolean): UseCloudAuthResult => {
  const configured = isSupabaseConfigured();
  const [status, setStatus] = useState<CloudAuthStatus>(configured ? "loading" : "unauthenticated");
  const [session, setSession] = useState<CloudSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cloudEnabled, setCloudEnabledState] = useState<boolean>(() => loadCloudEnabledPref());

  useEffect(() => {
    if (!configured) {
      setStatus("unauthenticated");
      setSession(null);
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

        if (nextSession) {
          const now = Math.floor(Date.now() / 1000);
          if (nextSession.expiresAt <= now + CLOUD_SESSION_EXPIRY_SKEW_SECONDS) {
            nextSession = await refreshSession(nextSession);
          }
          if (!cancelled) {
            setSession(nextSession);
            persistSession(nextSession);
            setStatus("authenticated");
            if (usedOAuthReturn) {
              setCloudEnabled(true);
            } else if (!hasStoredPreference) {
              setCloudEnabled(true);
            }
          }
          return;
        }

        if (!cancelled) {
          setSession(null);
          persistSession(null);
          setStatus("unauthenticated");
        }
      } catch (authError) {
        if (!cancelled) {
          setSession(null);
          persistSession(null);
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

  const setCloudEnabled = (enabled: boolean) => {
    setCloudEnabledState(enabled);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CLOUD_MODE_STORAGE_KEY, enabled ? "1" : "0");
    }
  };

  const signInEmailHandler = async (email: string, password: string) => {
    setError(null);
    const nextSession = await signInWithPassword(email.trim(), password);
    setSession(nextSession);
    persistSession(nextSession);
    setStatus("authenticated");
    setCloudEnabled(true);
  };

  const signUpEmailHandler = async (email: string, password: string) => {
    setError(null);
    const nextSession = await signUpWithPassword(email.trim(), password);
    setSession(nextSession);
    persistSession(nextSession);
    setStatus("authenticated");
    setCloudEnabled(true);
  };

  const signInGoogle = () => {
    if (typeof window === "undefined") {
      return;
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
    persistSession(null);
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
    if (status === "authenticated" && cloudEnabled) {
      return "cloud";
    }
    return "local";
  }, [cloudEnabled, isShareMode, status]);

  return {
    configured,
    status,
    session,
    error,
    cloudEnabled,
    appMode,
    setCloudEnabled,
    signInEmail: signInEmailHandler,
    signUpEmail: signUpEmailHandler,
    signInGoogle,
    signOut,
    deleteAccount
  };
};

export type { CloudAuthStatus, UseCloudAuthResult };
