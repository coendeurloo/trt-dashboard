import { describe, expect, it } from "vitest";
import { getMostRecentlyUpdatedProtocolId, getReportProtocol } from "../protocolUtils";
import { LabReport, Protocol } from "../types";

const protocol: Protocol = {
  id: "protocol-1",
  name: "TRT base",
  items: [{ name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" }],
  compounds: [{ name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" }],
  versions: [
    {
      id: "version-1",
      name: "TRT base",
      effectiveFrom: "2026-01-01",
      items: [{ name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" }],
      compounds: [{ name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" }],
      notes: "base",
      createdAt: "2026-01-01T08:00:00.000Z"
    },
    {
      id: "version-2",
      name: "TRT base + HGH",
      effectiveFrom: "2026-03-01",
      items: [
        { name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" },
        { name: "Human Growth Hormone (HGH)", dose: "1 IU/day", frequency: "daily", route: "SubQ" }
      ],
      compounds: [
        { name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" },
        { name: "Human Growth Hormone (HGH)", dose: "1 IU/day", frequency: "daily", route: "SubQ" }
      ],
      notes: "added HGH",
      createdAt: "2026-03-01T08:00:00.000Z"
    }
  ],
  notes: "base",
  createdAt: "2026-01-01T08:00:00.000Z",
  updatedAt: "2026-03-01T08:00:00.000Z"
};

const makeReport = (id: string, testDate: string, annotationOverrides?: Partial<LabReport["annotations"]>): LabReport => ({
  id,
  sourceFileName: `${id}.pdf`,
  testDate,
  createdAt: `${testDate}T08:00:00.000Z`,
  markers: [
    {
      id: `${id}-m1`,
      marker: "Testosterone",
      canonicalMarker: "Testosterone",
      value: 20,
      unit: "nmol/L",
      referenceMin: null,
      referenceMax: null,
      abnormal: "normal",
      confidence: 1
    }
  ],
  annotations: {
    interventionId: "protocol-1",
    interventionLabel: "TRT base",
    interventionVersionId: null,
    interventionSnapshot: null,
    protocolId: "protocol-1",
    protocolVersionId: null,
    protocol: "TRT base",
    supplementOverrides: null,
    supplementAnchorState: "inherit",
    symptoms: "",
    notes: "",
    samplingTiming: "trough",
    ...annotationOverrides
  },
  extraction: {
    provider: "fallback",
    model: "unit-test",
    confidence: 1,
    needsReview: false
  }
});

describe("protocolUtils version resolution", () => {
  it("resolves active protocol id from most recently updated protocol", () => {
    const activeId = getMostRecentlyUpdatedProtocolId([
      {
        ...protocol,
        id: "protocol-old",
        createdAt: "2025-01-01T08:00:00.000Z",
        updatedAt: "2025-02-01T08:00:00.000Z"
      },
      {
        ...protocol,
        id: "protocol-new",
        createdAt: "2025-03-01T08:00:00.000Z",
        updatedAt: "2025-03-15T08:00:00.000Z"
      }
    ]);

    expect(activeId).toBe("protocol-new");
  });

  it("resolves protocol version by report test date", () => {
    const reportBefore = makeReport("report-before", "2026-02-15");
    const reportAfter = makeReport("report-after", "2026-03-10");

    const beforeProtocol = getReportProtocol(reportBefore, [protocol]);
    const afterProtocol = getReportProtocol(reportAfter, [protocol]);

    expect(beforeProtocol?.name).toBe("TRT base");
    expect(afterProtocol?.name).toBe("TRT base + HGH");
    expect(beforeProtocol?.compounds.some((entry) => entry.name.includes("HGH"))).toBe(false);
    expect(afterProtocol?.compounds.some((entry) => entry.name.includes("HGH"))).toBe(true);
  });

  it("uses immutable intervention snapshot before linked protocol versions", () => {
    const snapshotReport = makeReport("report-snapshot", "2026-03-20", {
      interventionVersionId: "version-1",
      protocolVersionId: "version-1",
      interventionSnapshot: {
        interventionId: "protocol-1",
        versionId: "version-1",
        name: "TRT base",
        items: [{ name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" }],
        compounds: [{ name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" }],
        notes: "snapshot base",
        effectiveFrom: "2026-01-01"
      }
    });

    const resolved = getReportProtocol(snapshotReport, [protocol]);
    expect(resolved?.notes).toBe("snapshot base");
    expect(resolved?.compounds.some((entry) => entry.name.includes("HGH"))).toBe(false);
  });
});
