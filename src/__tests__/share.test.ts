import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../constants";
import { buildShareToken, parseShareToken } from "../share";
import { StoredAppData } from "../types";

const makeSampleData = (): StoredAppData => ({
  schemaVersion: 4,
  settings: DEFAULT_SETTINGS,
  markerAliasOverrides: {},
  protocols: [
    {
      id: "p1",
      name: "Protocol A",
      compounds: [{ name: "Testosterone Enanthate", doseMg: "120 mg/week", frequency: "2x_week", route: "SubQ" }],
      notes: "Protocol note",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  ],
  supplementTimeline: [],
  checkIns: [],
  reports: [
    {
      id: "r1",
      sourceFileName: "report.pdf",
      testDate: "2026-01-15",
      createdAt: "2026-01-15T08:00:00.000Z",
      markers: [
        {
          id: "m1",
          marker: "Testosterone",
          canonicalMarker: "Testosterone",
          value: 22,
          unit: "nmol/L",
          referenceMin: 8,
          referenceMax: 29,
          abnormal: "normal",
          confidence: 1,
          source: "measured"
        }
      ],
      annotations: {
        protocolId: "p1",
        protocol: "Protocol A",
        supplementOverrides: null,
        symptoms: "Stable mood",
        notes: "Doing fine",
        samplingTiming: "trough"
      },
      extraction: {
        provider: "fallback",
        model: "unit-test",
        confidence: 1,
        needsReview: false
      }
    }
  ]
});

const originalWindow = globalThis.window;

const setWindowBase64 = () => {
  (globalThis as { window?: Window }).window = {
    ...((originalWindow ?? {}) as Window),
    btoa: (value: string) => Buffer.from(value, "utf8").toString("base64"),
    atob: (value: string) => Buffer.from(value, "base64").toString("utf8")
  } as Window;
};

afterEach(() => {
  (globalThis as { window?: Window }).window = originalWindow;
});

describe("share token protocol visibility", () => {
  it("keeps protocol data when hideProtocol is false", () => {
    setWindowBase64();
    const token = buildShareToken(makeSampleData(), {
      hideNotes: false,
      hideProtocol: false,
      hideSymptoms: false
    });

    const parsed = parseShareToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed?.data.protocols).toHaveLength(1);
    expect(parsed?.data.reports[0]?.annotations.protocolId).toBe("p1");
    expect(parsed?.data.reports[0]?.annotations.protocol).toBe("Protocol A");
  });

  it("removes protocol data when hideProtocol is true", () => {
    setWindowBase64();
    const token = buildShareToken(makeSampleData(), {
      hideNotes: false,
      hideProtocol: true,
      hideSymptoms: false
    });

    const parsed = parseShareToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed?.data.protocols).toHaveLength(0);
    expect(parsed?.data.reports[0]?.annotations.protocolId).toBeNull();
    expect(parsed?.data.reports[0]?.annotations.protocol).toBe("");
  });
});
