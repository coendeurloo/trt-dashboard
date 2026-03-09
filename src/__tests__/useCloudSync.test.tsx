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

describe("useCloudSync", () => {
  beforeEach(() => {
    fetchSnapshotMock.mockReset();
    replaceAllMock.mockReset();
    applyPatchMock.mockReset();
  });

  it("blocks sync when cloud schema version mismatches local schema", async () => {
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
      expect(result.current.actionRequired).toBe("upload_local");
    });

    await act(async () => {
      await result.current.uploadLocalData();
    });

    await waitFor(() => {
      expect(result.current.conflictDetected).toBe(true);
      expect(result.current.actionRequired).toBe("choose_source");
      expect(result.current.syncStatus).toBe("pending");
    });
  });
});
