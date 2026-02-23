import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../constants";
import { buildShareSubsetData, buildShareToken, parseShareToken, ShareOptions, SHARE_REPORT_CAP_SEQUENCE } from "../share";
import { StoredAppData } from "../types";

const makeSampleData = (): StoredAppData => ({
  schemaVersion: 4,
  settings: {
    ...DEFAULT_SETTINGS,
    language: "en",
    unitSystem: "us",
    theme: "light"
  },
  markerAliasOverrides: {
    testo: "Testosterone"
  },
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
  supplementTimeline: [
    {
      id: "s1",
      name: "Fish Oil",
      dose: "2 g",
      frequency: "daily",
      startDate: "2026-01-01",
      endDate: null
    }
  ],
  checkIns: [
    {
      id: "c1",
      date: "2026-01-14",
      energy: 4,
      libido: 3,
      mood: 4,
      sleep: 3,
      motivation: 4,
      notes: "stable"
    }
  ],
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

const LEGACY_OPTIONS: ShareOptions = {
  hideNotes: false,
  hideProtocol: false,
  hideSymptoms: false
};

const buildLegacyV1Token = (data: StoredAppData, options: ShareOptions): string => {
  const payload = {
    schemaVersion: 5,
    generatedAt: "2026-01-20T10:00:00.000Z",
    options,
    data
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
};

describe("share token format", () => {
  it("builds a v2 token and roundtrips core report data", () => {
    const token = buildShareToken(makeSampleData(), LEGACY_OPTIONS);
    expect(token.startsWith("s2.")).toBe(true);

    const parsed = parseShareToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed?.data.reports).toHaveLength(1);
    expect(parsed?.data.reports[0]?.markers[0]?.canonicalMarker).toBe("Testosterone");
    expect(parsed?.data.reports[0]?.annotations.protocol).toBe("Protocol A");
    expect(parsed?.data.protocols).toHaveLength(0);
    expect(parsed?.data.supplementTimeline).toHaveLength(0);
    expect(parsed?.data.checkIns).toHaveLength(0);
  });

  it("preserves hideProtocol/hideSymptoms/hideNotes in v2", () => {
    const token = buildShareToken(makeSampleData(), {
      hideNotes: true,
      hideProtocol: true,
      hideSymptoms: true
    });

    const parsed = parseShareToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed?.data.reports[0]?.annotations.protocol).toBe("");
    expect(parsed?.data.reports[0]?.annotations.notes).toBe("");
    expect(parsed?.data.reports[0]?.annotations.symptoms).toBe("");
  });

  it("keeps backward compatibility for legacy v1 links", () => {
    const legacyToken = buildLegacyV1Token(makeSampleData(), LEGACY_OPTIONS);
    const parsed = parseShareToken(legacyToken);

    expect(parsed).not.toBeNull();
    expect(parsed?.data.protocols).toHaveLength(1);
    expect(parsed?.data.reports[0]?.annotations.protocol).toBe("Protocol A");
  });

  it("produces a much shorter token than legacy base64 JSON", () => {
    const sample = makeSampleData();
    const v2 = buildShareToken(sample, LEGACY_OPTIONS);
    const legacy = buildLegacyV1Token(sample, LEGACY_OPTIONS);

    expect(v2.length).toBeLessThan(legacy.length * 0.75);
  });

  it("uses the expected fallback cap sequence for short-link generation", () => {
    expect(Array.from(SHARE_REPORT_CAP_SEQUENCE)).toEqual([8, 6, 4, 2, 1]);
  });

  it("buildShareSubsetData keeps only most recent reports by date while preserving original order", () => {
    const sample = makeSampleData();
    sample.reports = [
      { ...sample.reports[0], id: "r-1", testDate: "2025-01-01", createdAt: "2025-01-01T08:00:00.000Z" },
      { ...sample.reports[0], id: "r-2", testDate: "2025-03-01", createdAt: "2025-03-01T08:00:00.000Z" },
      { ...sample.reports[0], id: "r-3", testDate: "2025-04-01", createdAt: "2025-04-01T08:00:00.000Z" },
      { ...sample.reports[0], id: "r-4", testDate: "2025-06-01", createdAt: "2025-06-01T08:00:00.000Z" }
    ];

    const subset = buildShareSubsetData(sample, 2);
    expect(subset.reports).toHaveLength(2);
    expect(subset.reports.map((report) => report.id)).toEqual(["r-3", "r-4"]);
  });
});
