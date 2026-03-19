import { describe, expect, it } from "vitest";
import { DEFAULT_PERSONAL_INFO, DEFAULT_SETTINGS } from "../constants";
import { restoreCheckInsPatch, restoreProtocolsPatch, restoreReportsPatch, restoreSupplementsPatch } from "../deleteUndo";
import { StoredAppData } from "../types";

const baseData: StoredAppData = {
  schemaVersion: 6,
  reports: [],
  interventions: [],
  protocols: [],
  supplementTimeline: [],
  wellbeingEntries: [],
  checkIns: [],
  markerAliasOverrides: {},
  settings: DEFAULT_SETTINGS,
  personalInfo: DEFAULT_PERSONAL_INFO
};

describe("deleteUndo patches", () => {
  it("restores reports snapshot (single and bulk)", () => {
    const snapshotReports = [
      {
        id: "r-1",
        sourceFileName: "a.pdf",
        testDate: "2026-01-01",
        createdAt: "2026-01-01T08:00:00.000Z",
        markers: [],
        annotations: {
          protocolId: null,
          protocol: "",
          supplementOverrides: null,
          symptoms: "",
          notes: "",
          samplingTiming: "unknown" as const
        },
        extraction: {
          provider: "fallback" as const,
          model: "test",
          confidence: 1,
          needsReview: false
        }
      },
      {
        id: "r-2",
        sourceFileName: "b.pdf",
        testDate: "2026-02-01",
        createdAt: "2026-02-01T08:00:00.000Z",
        markers: [],
        annotations: {
          protocolId: null,
          protocol: "",
          supplementOverrides: null,
          symptoms: "",
          notes: "",
          samplingTiming: "unknown" as const
        },
        extraction: {
          provider: "fallback" as const,
          model: "test",
          confidence: 1,
          needsReview: false
        }
      }
    ];
    const current: StoredAppData = {
      ...baseData,
      reports: [snapshotReports[1]]
    };

    const restored = restoreReportsPatch(snapshotReports)(current);
    expect(restored.reports).toEqual(snapshotReports);
  });

  it("restores supplement timeline snapshot", () => {
    const supplements = [
      {
        id: "s-1",
        name: "Vitamin D3",
        dose: "2000 IU",
        frequency: "daily",
        startDate: "2026-01-01",
        endDate: null
      }
    ];
    const current: StoredAppData = {
      ...baseData,
      supplementTimeline: []
    };

    const restored = restoreSupplementsPatch(supplements)(current);
    expect(restored.supplementTimeline).toEqual(supplements);
  });

  it("restores protocols + interventions snapshot", () => {
    const protocols = [
      {
        id: "p-1",
        name: "TRT Base",
        items: [],
        compounds: [],
        notes: "",
        createdAt: "2026-01-01T08:00:00.000Z",
        updatedAt: "2026-01-01T08:00:00.000Z"
      }
    ];
    const current: StoredAppData = {
      ...baseData,
      protocols: [],
      interventions: []
    };

    const restored = restoreProtocolsPatch(protocols, protocols)(current);
    expect(restored.protocols).toEqual(protocols);
    expect(restored.interventions).toEqual(protocols);
  });

  it("restores check-ins snapshot to both aliases", () => {
    const checkIns = [
      {
        id: "c-1",
        date: "2026-01-01",
        profileAtEntry: "trt" as const,
        notes: "",
        values: { energy: 7 }
      }
    ];
    const current: StoredAppData = {
      ...baseData,
      checkIns: [],
      wellbeingEntries: []
    };

    const restored = restoreCheckInsPatch(checkIns)(current);
    expect(restored.checkIns).toEqual(checkIns);
    expect(restored.wellbeingEntries).toEqual(checkIns);
  });
});
