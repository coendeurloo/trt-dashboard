// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, beforeEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { APP_SCHEMA_VERSION } from "../constants";
import { coerceStoredAppData } from "../storage";
import { toCloudSyncPayload } from "../cloud/mapping";
import type { CloudSession } from "../cloud/authClient";

const fetchSnapshotMock = vi.fn();
const replaceAllMock = vi.fn();
const applyPatchMock = vi.fn();

vi.mock("../cloud/deviceId", () => ({
  getOrCreateCloudDeviceId: () => "device-test"
}));

vi.mock("../cloud/syncAdapter", () => {
  class SupabaseCloudAdapter {
    fetchSnapshot = fetchSnapshotMock;
    replaceAll = replaceAllMock;
    applyPatch = applyPatchMock;
  }
  return {
    SupabaseCloudAdapter
  };
});

import { useCloudSync } from "../hooks/useCloudSync";

const session: CloudSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: "user-1",
    email: "test@example.com"
  }
};

const makeEmptyData = () => coerceStoredAppData({});

const makeLocalDataWithReport = () =>
  coerceStoredAppData({
    reports: [
      {
        id: "report-1",
        sourceFileName: "lab.pdf",
        testDate: "2026-01-11",
        createdAt: "2026-01-11T10:00:00.000Z",
        markers: [
          {
            id: "marker-1",
            marker: "Testosterone",
            canonicalMarker: "Testosterone",
            value: 18.5,
            unit: "nmol/L",
            referenceMin: 8,
            referenceMax: 29,
            abnormal: "normal",
            confidence: 0.95
          }
        ],
        annotations: {
          interventionId: null,
          interventionLabel: "",
          protocolId: null,
          protocol: "",
          supplementAnchorState: "inherit",
          supplementOverrides: null,
          symptoms: "",
          notes: "",
          samplingTiming: "unknown"
        },
        extraction: {
          provider: "fallback",
          model: "unit-test",
          confidence: 0.8,
          needsReview: false
        }
      }
    ]
  });

const withPersonalInfo = (
  data: ReturnType<typeof makeLocalDataWithReport>,
  overrides: Partial<ReturnType<typeof makeLocalDataWithReport>["personalInfo"]>
) =>
  coerceStoredAppData({
    ...data,
    personalInfo: {
      ...data.personalInfo,
      ...overrides
    }
  });

describe("useCloudSync", () => {
  beforeEach(() => {
    fetchSnapshotMock.mockReset();
    replaceAllMock.mockReset();
    applyPatchMock.mockReset();
  });

  it("blocks sync when cloud schema version is newer than local schema", async () => {
    const emptyData = makeEmptyData();
    fetchSnapshotMock.mockResolvedValue({
      data: emptyData,
      rawPayload: toCloudSyncPayload(emptyData),
      schemaVersion: APP_SCHEMA_VERSION + 1,
      revision: 3
    });

    const { result } = renderHook(() => {
      const [data, setData] = useState(emptyData);
      return useCloudSync({
        enabled: true,
        session,
        isShareMode: false,
        appData: data,
        setAppData: setData
      });
    });

    await waitFor(() => {
      expect(result.current.syncStatus).toBe("error");
    });
    expect(result.current.schemaVersionCompatible).toBe(false);
    expect(result.current.error).toContain("schema version");
  });

  it("accepts older cloud schema versions and continues syncing", async () => {
    const emptyData = makeEmptyData();
    fetchSnapshotMock.mockResolvedValue({
      data: emptyData,
      rawPayload: toCloudSyncPayload(emptyData),
      schemaVersion: APP_SCHEMA_VERSION - 1,
      revision: 2
    });

    const { result } = renderHook(() => {
      const [data, setData] = useState(emptyData);
      return useCloudSync({
        enabled: true,
        session,
        isShareMode: false,
        appData: data,
        setAppData: setData
      });
    });

    await waitFor(() => {
      expect(result.current.schemaVersionCompatible).toBe(true);
      expect(result.current.syncStatus).toBe("idle");
    });
    expect(result.current.error).toBeNull();
    expect(replaceAllMock).not.toHaveBeenCalled();
    expect(applyPatchMock).not.toHaveBeenCalled();
  });

  it("flags revision conflict when initial upload hits mismatch", async () => {
    const localData = makeLocalDataWithReport();
    const emptyData = makeEmptyData();
    fetchSnapshotMock.mockResolvedValue({
      data: emptyData,
      rawPayload: toCloudSyncPayload(emptyData),
      schemaVersion: APP_SCHEMA_VERSION,
      revision: 5
    });
    replaceAllMock.mockRejectedValue(new Error("REVISION_MISMATCH"));

    const { result } = renderHook(() => {
      const [data, setData] = useState(localData);
      return useCloudSync({
        enabled: true,
        session,
        isShareMode: false,
        appData: data,
        setAppData: setData
      });
    });

    await waitFor(() => {
      expect(result.current.conflictDetected).toBe(true);
      expect(result.current.actionRequired).toBe("choose_source");
      expect(result.current.syncStatus).toBe("pending");
    });
  });

  it("automatically uploads local data when cloud is empty", async () => {
    const localData = makeLocalDataWithReport();
    const emptyData = makeEmptyData();
    fetchSnapshotMock.mockResolvedValue({
      data: emptyData,
      rawPayload: toCloudSyncPayload(emptyData),
      schemaVersion: APP_SCHEMA_VERSION,
      revision: 2
    });
    replaceAllMock.mockResolvedValue({
      revision: 3,
      lastSyncedAt: "2026-03-09T15:00:00.000Z"
    });

    const { result } = renderHook(() => {
      const [data, setData] = useState(localData);
      return useCloudSync({
        enabled: true,
        session,
        isShareMode: false,
        appData: data,
        setAppData: setData
      });
    });

    await waitFor(() => {
      expect(replaceAllMock).toHaveBeenCalledTimes(1);
      expect(result.current.actionRequired).toBe("none");
      expect(result.current.syncStatus).toBe("idle");
      expect(result.current.lastRevision).toBe(3);
    });
  });

  it("keeps local personal info when cloud personal info is empty and syncs it back", async () => {
    const localData = withPersonalInfo(makeLocalDataWithReport(), {
      name: "Coen",
      dateOfBirth: "1983-06-02",
      biologicalSex: "male",
      heightCm: 177,
      weightKg: 90
    });
    const cloudData = makeLocalDataWithReport();
    fetchSnapshotMock.mockResolvedValue({
      data: cloudData,
      rawPayload: toCloudSyncPayload(cloudData),
      schemaVersion: APP_SCHEMA_VERSION,
      revision: 7
    });
    applyPatchMock.mockResolvedValue({
      revision: 8,
      lastSyncedAt: "2026-03-10T10:00:00.000Z"
    });

    const { result } = renderHook(() => {
      const [data, setData] = useState(localData);
      const sync = useCloudSync({
        enabled: true,
        session,
        isShareMode: false,
        appData: data,
        setAppData: setData
      });
      return { data, sync };
    });

    await waitFor(() => {
      expect(result.current.data.personalInfo.name).toBe("Coen");
    });

    await waitFor(
      () => {
        expect(applyPatchMock).toHaveBeenCalledTimes(1);
      },
      { timeout: 4000 }
    );

    const patch = applyPatchMock.mock.calls[0]?.[0];
    expect(patch.settingsChanged).toBe(true);
    expect(patch.personalInfo.name).toBe("Coen");
  });

  it("keeps cloud personal info as source of truth when both sides are filled and differ", async () => {
    const localData = withPersonalInfo(makeLocalDataWithReport(), {
      name: "Local Coen",
      dateOfBirth: "1983-06-02",
      biologicalSex: "male",
      heightCm: 177,
      weightKg: 90
    });
    const cloudData = withPersonalInfo(makeLocalDataWithReport(), {
      name: "Cloud Coen",
      dateOfBirth: "1983-06-03",
      biologicalSex: "male",
      heightCm: 178,
      weightKg: 91
    });
    fetchSnapshotMock.mockResolvedValue({
      data: cloudData,
      rawPayload: toCloudSyncPayload(cloudData),
      schemaVersion: APP_SCHEMA_VERSION,
      revision: 11
    });

    const { result } = renderHook(() => {
      const [data, setData] = useState(localData);
      const sync = useCloudSync({
        enabled: true,
        session,
        isShareMode: false,
        appData: data,
        setAppData: setData
      });
      return { data, sync };
    });

    await waitFor(() => {
      expect(result.current.data.personalInfo.name).toBe("Cloud Coen");
      expect(result.current.sync.syncStatus).toBe("idle");
    });

    expect(applyPatchMock).not.toHaveBeenCalled();
    expect(replaceAllMock).not.toHaveBeenCalled();
  });
});
