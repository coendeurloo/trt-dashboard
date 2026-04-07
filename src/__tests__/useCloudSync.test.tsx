// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
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

  it("treats patch revision conflicts as pending without surfacing a sync error", async () => {
    const localData = makeLocalDataWithReport();
    fetchSnapshotMock.mockResolvedValue({
      data: localData,
      rawPayload: toCloudSyncPayload(localData),
      schemaVersion: APP_SCHEMA_VERSION,
      revision: 9
    });
    applyPatchMock.mockRejectedValue(new Error("revision_mismatch:revision mismatch"));

    const { result } = renderHook(() => {
      const [data, setData] = useState(localData);
      const sync = useCloudSync({
        enabled: true,
        session,
        isShareMode: false,
        appData: data,
        setAppData: setData
      });
      return { data, setData, sync };
    });

    await waitFor(() => {
      expect(result.current.sync.syncStatus).toBe("idle");
    });

    act(() => {
      result.current.setData((current) =>
        withPersonalInfo(current, {
          name: "Conflict Trigger"
        })
      );
    });

    await waitFor(
      () => {
        expect(result.current.sync.conflictDetected).toBe(true);
        expect(result.current.sync.actionRequired).toBe("choose_source");
        expect(result.current.sync.syncStatus).toBe("pending");
        expect(result.current.sync.error).toBeNull();
      },
      { timeout: 5000 }
    );
  });

  it("auto-merges cloud and local changes after patch revision conflict", async () => {
    const localData = makeLocalDataWithReport();
    const cloudDataWithExtraReport = coerceStoredAppData({
      ...localData,
      reports: [
        ...localData.reports,
        {
          id: "report-2",
          sourceFileName: "lab-remote.pdf",
          testDate: "2026-01-15",
          createdAt: "2026-01-15T09:00:00.000Z",
          markers: [
            {
              id: "marker-2",
              marker: "Estradiol",
              canonicalMarker: "Estradiol",
              value: 110,
              unit: "pmol/L",
              referenceMin: 40,
              referenceMax: 160,
              abnormal: "normal",
              confidence: 0.92
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
            confidence: 0.82,
            needsReview: false
          }
        }
      ]
    });

    fetchSnapshotMock
      .mockResolvedValueOnce({
        data: localData,
        rawPayload: toCloudSyncPayload(localData),
        schemaVersion: APP_SCHEMA_VERSION,
        revision: 4
      })
      .mockResolvedValueOnce({
        data: cloudDataWithExtraReport,
        rawPayload: toCloudSyncPayload(cloudDataWithExtraReport),
        schemaVersion: APP_SCHEMA_VERSION,
        revision: 5
      });

    applyPatchMock
      .mockRejectedValueOnce(new Error("REVISION_MISMATCH:revision mismatch"))
      .mockResolvedValueOnce({
        revision: 6,
        lastSyncedAt: "2026-03-11T10:30:00.000Z"
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
      return { data, setData, sync };
    });

    await waitFor(() => {
      expect(result.current.sync.syncStatus).toBe("idle");
    });

    act(() => {
      result.current.setData((current) =>
        withPersonalInfo(current, {
          name: "Local Update"
        })
      );
    });

    await waitFor(
      () => {
        expect(applyPatchMock).toHaveBeenCalledTimes(2);
        expect(result.current.sync.actionRequired).toBe("none");
        expect(result.current.sync.conflictDetected).toBe(false);
        expect(result.current.sync.syncStatus).toBe("idle");
        expect(result.current.sync.error).toBeNull();
        expect(result.current.data.personalInfo.name).toBe("Local Update");
        expect(result.current.data.reports.some((report) => report.id === "report-2")).toBe(true);
      },
      { timeout: 7000 }
    );
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

    expect(applyPatchMock.mock.calls[0]?.[0]).toBeTruthy();
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

    expect(applyPatchMock.mock.calls.length).toBeLessThanOrEqual(1);
    expect(replaceAllMock).not.toHaveBeenCalled();
  });
});
