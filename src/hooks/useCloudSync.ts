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
      localAtInitRef.current = null;
      lastSyncedHashRef.current = "";
      lastSyncedPayloadRef.current = null;
      lastRevisionRef.current = null;
      return;
    }
    if (!localAtInitRef.current) {
      localAtInitRef.current = coerceStoredAppData(appData);
    }
  }, [appData, enabled, session]);

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
    } catch (loadError) {
      setSyncStatus("error");
      setError(loadError instanceof Error ? loadError.message : "Cloud load failed");
      setInitialized(true);
      setBootstrapped(false);
    }
  }, [adapter, appData, isShareMode, setAppData]);

  useEffect(() => {
    if (!adapter || initialized || isShareMode) {
      return;
    }
    void loadFromCloud();
  }, [adapter, initialized, isShareMode, loadFromCloud]);

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
    } catch (replaceError) {
      setError(replaceError instanceof Error ? replaceError.message : "Upload failed");
      if (detectRevisionConflict(replaceError)) {
        setConflictDetected(true);
        setActionRequired("choose_source");
        setSyncStatus("pending");
        return;
      }
      setSyncStatus("error");
    }
  }, [appData, replaceCloudWithData]);

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
  }, [actionRequired, adapter, enabled, isShareMode, uploadLocalData]);

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
      } catch (syncError) {
        setError(syncError instanceof Error ? syncError.message : "Cloud sync failed");
        if (detectRevisionConflict(syncError)) {
          setConflictDetected(true);
          setActionRequired("choose_source");
          setSyncStatus("pending");
          return;
        }
        setSyncStatus("error");
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
  ]);

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
