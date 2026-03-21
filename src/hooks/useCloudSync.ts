import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APP_SCHEMA_VERSION } from "../constants";
import { getOrCreateCloudDeviceId } from "../cloud/deviceId";
import {
  CloudSyncPayload,
  buildIncrementalPatch,
  hasIncrementalPatchOperations,
  hasMeaningfulData,
  isPersonalInfoEmpty,
  toCloudSyncPayload
} from "../cloud/mapping";
import { SupabaseCloudAdapter } from "../cloud/syncAdapter";
import { coerceStoredAppData } from "../storage";
import { StoredAppData } from "../types";
import { CloudSession } from "../cloud/authClient";

type CloudSyncStatus = "idle" | "loading" | "syncing" | "pending" | "error";
type CloudSyncAction = "none" | "upload_local" | "choose_source";
type RetryChannel = "load" | "upload" | "patch";

interface UseCloudSyncOptions {
  enabled: boolean;
  session: CloudSession | null;
  isShareMode: boolean;
  appData: StoredAppData;
  setAppData: Dispatch<SetStateAction<StoredAppData>>;
}

interface UseCloudSyncResult {
  schemaVersionCompatible: boolean;
  syncStatus: CloudSyncStatus;
  lastSyncedAt: string | null;
  error: string | null;
  actionRequired: CloudSyncAction;
  conflictDetected: boolean;
  lastRevision: number | null;
  uploadLocalData: () => Promise<void>;
  useCloudCopy: () => void;
  replaceCloudWithLocal: () => Promise<void>;
  refreshFromCloud: () => Promise<void>;
}

const detectRevisionConflict = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  return /REVISION_MISMATCH|P0001|409/.test(error.message);
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === "string" ? error : "";

const getErrorCode = (error: unknown): string => {
  const message = getErrorMessage(error).trim();
  if (!message) {
    return "";
  }
  const separator = message.indexOf(":");
  return (separator >= 0 ? message.slice(0, separator) : message).trim().toUpperCase();
};

const isNetworkFailure = (error: unknown): boolean => {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("timeout")
  );
};

const isAuthFailure = (error: unknown): boolean => {
  const code = getErrorCode(error);
  if (code === "AUTH_REQUIRED" || code === "SUPABASE_HTTP_401" || code === "SUPABASE_HTTP_403" || code === "AUTH_UNAUTHORIZED") {
    return true;
  }
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("jwt") && message.includes("expired");
};

const isTransientFailure = (error: unknown): boolean => {
  if (detectRevisionConflict(error) || isAuthFailure(error)) {
    return false;
  }
  if (isNetworkFailure(error)) {
    return true;
  }
  const code = getErrorCode(error);
  if (code === "SUPABASE_HTTP_429") {
    return true;
  }
  if (/^SUPABASE_HTTP_5\d\d$/.test(code)) {
    return true;
  }
  if (code === "CLOUD_PATCH_FAILED" || code === "CLOUD_PATCH_UNEXPECTED" || code === "CLOUD_REPLACE_FAILED" || code === "CLOUD_REPLACE_UNEXPECTED") {
    return true;
  }
  return false;
};

const hashPayload = (payload: CloudSyncPayload): string => JSON.stringify(payload);

export const useCloudSync = ({
  enabled,
  session,
  isShareMode,
  appData,
  setAppData
}: UseCloudSyncOptions): UseCloudSyncResult => {
  const [schemaVersionCompatible, setSchemaVersionCompatible] = useState(true);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionRequired, setActionRequired] = useState<CloudSyncAction>("none");
  const [conflictDetected, setConflictDetected] = useState(false);
  const [lastRevision, setLastRevision] = useState<number | null>(null);
  const [cloudCandidateData, setCloudCandidateData] = useState<StoredAppData | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [loadRetryTick, setLoadRetryTick] = useState(0);
  const [uploadRetryTick, setUploadRetryTick] = useState(0);
  const [patchRetryTick, setPatchRetryTick] = useState(0);

  const deviceId = useMemo(() => getOrCreateCloudDeviceId(), []);
  const adapter = useMemo(() => {
    if (!enabled || !session) {
      return null;
    }
    return new SupabaseCloudAdapter(session.accessToken, session.user.id, deviceId);
  }, [deviceId, enabled, session]);

  const localAtInitRef = useRef<StoredAppData | null>(null);
  const lastSyncedHashRef = useRef<string>("");
  const lastSyncedPayloadRef = useRef<CloudSyncPayload | null>(null);
  const lastRevisionRef = useRef<number | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptsRef = useRef<Record<RetryChannel, number>>({
    load: 0,
    upload: 0,
    patch: 0
  });
  const retryTimersRef = useRef<Record<RetryChannel, ReturnType<typeof setTimeout> | null>>({
    load: null,
    upload: null,
    patch: null
  });

  const clearRetryTimer = useCallback((channel: RetryChannel) => {
    const timer = retryTimersRef.current[channel];
    if (timer) {
      clearTimeout(timer);
      retryTimersRef.current[channel] = null;
    }
  }, []);

  const resetRetryState = useCallback((channel?: RetryChannel) => {
    if (channel) {
      retryAttemptsRef.current[channel] = 0;
      clearRetryTimer(channel);
      return;
    }
    (["load", "upload", "patch"] as RetryChannel[]).forEach((entry) => {
      retryAttemptsRef.current[entry] = 0;
      clearRetryTimer(entry);
    });
  }, [clearRetryTimer]);

  const scheduleRetry = useCallback((channel: RetryChannel, reason: unknown): boolean => {
    if (!isTransientFailure(reason)) {
      return false;
    }
    const attempts = retryAttemptsRef.current[channel];
    if (attempts >= 6) {
      return false;
    }
    const nextAttempt = attempts + 1;
    retryAttemptsRef.current[channel] = nextAttempt;
    clearRetryTimer(channel);
    const delayMs = Math.min(30_000, 1_500 * 2 ** (nextAttempt - 1));
    setSyncStatus("syncing");
    setError(null);
    retryTimersRef.current[channel] = setTimeout(() => {
      retryTimersRef.current[channel] = null;
      if (channel === "load") {
        setLoadRetryTick((current) => current + 1);
        return;
      }
      if (channel === "upload") {
        setUploadRetryTick((current) => current + 1);
        return;
      }
      setPatchRetryTick((current) => current + 1);
    }, delayMs);
    return true;
  }, [clearRetryTimer]);

  useEffect(() => {
    if (!enabled || !session) {
      setSchemaVersionCompatible(true);
      setSyncStatus("idle");
      setLastSyncedAt(null);
      setError(null);
      setActionRequired("none");
      setConflictDetected(false);
      setLastRevision(null);
      setCloudCandidateData(null);
      setInitialized(false);
      setBootstrapped(false);
      setLoadRetryTick(0);
      setUploadRetryTick(0);
      setPatchRetryTick(0);
      localAtInitRef.current = null;
      lastSyncedHashRef.current = "";
      lastSyncedPayloadRef.current = null;
      lastRevisionRef.current = null;
      resetRetryState();
      return;
    }
    if (!localAtInitRef.current) {
      localAtInitRef.current = coerceStoredAppData(appData);
    }
  }, [appData, enabled, resetRetryState, session]);

  const loadFromCloud = useCallback(async () => {
    if (!adapter || isShareMode) {
      return;
    }
    setSyncStatus("loading");
    setError(null);
    try {
      const snapshot = await adapter.fetchSnapshot();
      const snapshotRevision = snapshot.revision;
      const schemaVersion = snapshot.schemaVersion || APP_SCHEMA_VERSION;

      setLastRevision(snapshotRevision);
      lastRevisionRef.current = snapshotRevision;

      if (schemaVersion !== APP_SCHEMA_VERSION) {
        setSchemaVersionCompatible(false);
        setSyncStatus("error");
        setError(
          `Cloud schema version ${schemaVersion} mismatch (expected ${APP_SCHEMA_VERSION}).`
        );
        setInitialized(true);
        setBootstrapped(false);
        return;
      }

      setSchemaVersionCompatible(true);
      const localData = localAtInitRef.current ?? coerceStoredAppData(appData);
      const cloudData = snapshot.data;
      const localHasData = hasMeaningfulData(localData);
      const cloudHasData = hasMeaningfulData(cloudData);
      const localPayload = toCloudSyncPayload(localData);
      const cloudPayload = snapshot.rawPayload;
      const localHash = hashPayload(localPayload);
      const cloudHash = hashPayload(cloudPayload);

      if (!cloudHasData && localHasData) {
        lastSyncedPayloadRef.current = snapshot.rawPayload;
        setActionRequired("upload_local");
        setSyncStatus("pending");
        setBootstrapped(false);
        setCloudCandidateData(null);
        setInitialized(true);
        return;
      }

      if (cloudHasData && !localHasData) {
        setAppData(cloudData);
        lastSyncedHashRef.current = cloudHash;
        lastSyncedPayloadRef.current = cloudPayload;
        setActionRequired("none");
        setSyncStatus("idle");
        setBootstrapped(true);
        setCloudCandidateData(cloudData);
        setInitialized(true);
        return;
      }

      if (cloudHasData && localHasData && cloudHash !== localHash) {
        const cloudPersonalInfoIsEmpty = isPersonalInfoEmpty(cloudData.personalInfo);
        const localPersonalInfoIsEmpty = isPersonalInfoEmpty(localData.personalInfo);
        if (cloudPersonalInfoIsEmpty && !localPersonalInfoIsEmpty) {
          const mergedData: StoredAppData = {
            ...cloudData,
            personalInfo: { ...localData.personalInfo }
          };
          setAppData(mergedData);
          lastSyncedHashRef.current = cloudHash;
          lastSyncedPayloadRef.current = cloudPayload;
          setActionRequired("none");
          setSyncStatus("idle");
          setBootstrapped(true);
          setCloudCandidateData(mergedData);
          setInitialized(true);
          return;
        }
        // Auto-resolve: cloud is the authoritative source for signed-in users.
        // Silently adopt the cloud copy, matching how most sync services behave.
        setAppData(cloudData);
        lastSyncedHashRef.current = cloudHash;
        lastSyncedPayloadRef.current = cloudPayload;
        setActionRequired("none");
        setSyncStatus("idle");
        setBootstrapped(true);
        setCloudCandidateData(cloudData);
        setInitialized(true);
        return;
      }

      lastSyncedHashRef.current = localHash;
      lastSyncedPayloadRef.current = cloudPayload;
      setActionRequired("none");
      setSyncStatus("idle");
      setBootstrapped(true);
      setCloudCandidateData(cloudData);
      setInitialized(true);
      resetRetryState("load");
    } catch (loadError) {
      if (!scheduleRetry("load", loadError)) {
        setSyncStatus("error");
        setError(loadError instanceof Error ? loadError.message : "Cloud load failed");
      }
      setInitialized(true);
      setBootstrapped(false);
    }
  }, [adapter, appData, isShareMode, resetRetryState, scheduleRetry, setAppData]);

  useEffect(() => {
    if (!adapter || initialized || isShareMode) {
      return;
    }
    void loadFromCloud();
  }, [adapter, initialized, isShareMode, loadFromCloud]);

  useEffect(() => {
    if (!adapter || isShareMode || loadRetryTick === 0) {
      return;
    }
    void loadFromCloud();
  }, [adapter, isShareMode, loadRetryTick, loadFromCloud]);

  const replaceCloudWithData = useCallback(
    async (nextData: StoredAppData) => {
      if (!adapter) {
        return;
      }
      setSyncStatus("syncing");
      setError(null);
      const result = await adapter.replaceAll(nextData, lastRevisionRef.current);
      const nextPayload = toCloudSyncPayload(nextData);
      setLastRevision(result.revision);
      lastRevisionRef.current = result.revision;
      setLastSyncedAt(result.lastSyncedAt);
      lastSyncedHashRef.current = hashPayload(nextPayload);
      lastSyncedPayloadRef.current = nextPayload;
      setConflictDetected(false);
      setActionRequired("none");
      setBootstrapped(true);
      setSyncStatus("idle");
    },
    [adapter]
  );

  const uploadLocalData = useCallback(async () => {
    try {
      await replaceCloudWithData(coerceStoredAppData(appData));
      setCloudCandidateData(coerceStoredAppData(appData));
      resetRetryState("upload");
    } catch (replaceError) {
      setError(replaceError instanceof Error ? replaceError.message : "Upload failed");
      if (detectRevisionConflict(replaceError)) {
        setConflictDetected(true);
        setActionRequired("choose_source");
        setSyncStatus("pending");
        return;
      }
      if (!scheduleRetry("upload", replaceError)) {
        setSyncStatus("error");
      }
    }
  }, [appData, replaceCloudWithData, resetRetryState, scheduleRetry]);

  const useCloudCopy = useCallback(() => {
    if (!cloudCandidateData) {
      return;
    }
    setAppData(cloudCandidateData);
    const nextPayload = toCloudSyncPayload(cloudCandidateData);
    lastSyncedHashRef.current = hashPayload(nextPayload);
    lastSyncedPayloadRef.current = nextPayload;
    setActionRequired("none");
    setConflictDetected(false);
    setSyncStatus("idle");
    setBootstrapped(true);
  }, [cloudCandidateData, setAppData]);

  const replaceCloudWithLocal = useCallback(async () => {
    await uploadLocalData();
  }, [uploadLocalData]);

  const refreshFromCloud = useCallback(async () => {
    setInitialized(false);
    setBootstrapped(false);
    localAtInitRef.current = coerceStoredAppData(appData);
    await loadFromCloud();
  }, [appData, loadFromCloud]);

  useEffect(() => {
    if (!adapter || !enabled || isShareMode) {
      return;
    }
    if (actionRequired !== "upload_local") {
      return;
    }

    void uploadLocalData();
  }, [actionRequired, adapter, enabled, isShareMode, uploadLocalData, uploadRetryTick]);

  useEffect(() => {
    if (!adapter || !enabled || isShareMode) {
      return;
    }
    if (!bootstrapped || actionRequired !== "none" || !schemaVersionCompatible) {
      return;
    }

    const normalizedData = coerceStoredAppData(appData);
    const nextPayload = toCloudSyncPayload(normalizedData);
    const currentHash = hashPayload(nextPayload);
    if (currentHash === lastSyncedHashRef.current) {
      return;
    }

    const previousPayload = lastSyncedPayloadRef.current;
    if (!previousPayload) {
      return;
    }

    const patch = buildIncrementalPatch(previousPayload, nextPayload);
    if (!hasIncrementalPatchOperations(patch)) {
      lastSyncedHashRef.current = currentHash;
      lastSyncedPayloadRef.current = nextPayload;
      return;
    }

    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = setTimeout(async () => {
      try {
        setSyncStatus("syncing");
        setError(null);
        const result = await adapter.applyPatch(patch, lastRevisionRef.current);
        setLastRevision(result.revision);
        lastRevisionRef.current = result.revision;
        setLastSyncedAt(result.lastSyncedAt);
        lastSyncedHashRef.current = currentHash;
        lastSyncedPayloadRef.current = nextPayload;
        setConflictDetected(false);
        setActionRequired("none");
        setSyncStatus("idle");
        resetRetryState("patch");
      } catch (syncError) {
        setError(syncError instanceof Error ? syncError.message : "Cloud sync failed");
        if (detectRevisionConflict(syncError)) {
          setConflictDetected(true);
          setActionRequired("choose_source");
          setSyncStatus("pending");
          return;
        }
        if (!scheduleRetry("patch", syncError)) {
          setSyncStatus("error");
        }
      }
    }, 1200);

    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
    };
  }, [
    actionRequired,
    adapter,
    appData,
    bootstrapped,
    enabled,
    isShareMode,
    schemaVersionCompatible
    ,
    patchRetryTick,
    resetRetryState,
    scheduleRetry
  ]);

  useEffect(() => () => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    resetRetryState();
  }, [resetRetryState]);

  return {
    schemaVersionCompatible,
    syncStatus,
    lastSyncedAt,
    error,
    actionRequired,
    conflictDetected,
    lastRevision,
    uploadLocalData,
    useCloudCopy,
    replaceCloudWithLocal,
    refreshFromCloud
  };
};

export type { CloudSyncAction, CloudSyncStatus, UseCloudSyncResult };
