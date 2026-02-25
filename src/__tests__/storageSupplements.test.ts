import { describe, expect, it } from "vitest";
import { coerceStoredAppData } from "../storage";

describe("storage supplement schema", () => {
  it("fills missing supplementTimeline/checkIns with defaults", () => {
    const data = coerceStoredAppData({
      schemaVersion: 4,
      reports: [],
      protocols: []
    });
    expect(data.supplementTimeline).toEqual([]);
    expect(data.checkIns).toEqual([]);
  });

  it("drops legacy protocol supplements and keeps report overrides", () => {
    const data = coerceStoredAppData({
      schemaVersion: 3,
      reports: [
        {
          id: "r1",
          sourceFileName: "a.pdf",
          testDate: "2025-01-01",
          createdAt: "2025-01-01T10:00:00.000Z",
          markers: [
            {
              id: "m1",
              marker: "Testosterone",
              canonicalMarker: "Testosterone",
              value: 20,
              unit: "nmol/L",
              referenceMin: null,
              referenceMax: null,
              abnormal: "unknown",
              confidence: 1
            }
          ],
          annotations: {
            protocolId: "p1",
            protocol: "Legacy",
            supplementOverrides: [
              {
                id: "o1",
                name: "NAC",
                dose: "600 mg",
                frequency: "daily",
                startDate: "2025-01-01",
                endDate: "2025-01-01"
              }
            ],
            symptoms: "",
            notes: "",
            samplingTiming: "unknown"
          },
          extraction: { provider: "fallback", model: "x", confidence: 1, needsReview: false }
        }
      ],
      protocols: [
        {
          id: "p1",
          name: "Legacy protocol",
          compounds: [{ name: "Testosterone Enanthate", doseMg: "120", frequency: "2x/week", route: "IM" }],
          supplements: [{ name: "Old", dose: "1", frequency: "daily" }],
          notes: "",
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z"
        }
      ]
    });

    expect((data.protocols[0] as unknown as Record<string, unknown>)?.supplements).toBeUndefined();
    expect(data.reports[0]?.annotations.supplementOverrides?.[0]?.name).toBe("NAC");
    expect(data.reports[0]?.annotations.supplementAnchorState).toBe("anchor");
  });

  it("infers supplement anchor state from legacy overrides when missing", () => {
    const data = coerceStoredAppData({
      reports: [
        {
          id: "r-inherit",
          sourceFileName: "a.pdf",
          testDate: "2025-01-01",
          createdAt: "2025-01-01T10:00:00.000Z",
          markers: [
            {
              id: "m-1",
              marker: "Testosterone",
              canonicalMarker: "Testosterone",
              value: 20,
              unit: "nmol/L",
              referenceMin: null,
              referenceMax: null,
              abnormal: "unknown",
              confidence: 1
            }
          ],
          annotations: {
            protocolId: null,
            protocol: "",
            supplementOverrides: null,
            symptoms: "",
            notes: "",
            samplingTiming: "unknown"
          },
          extraction: { provider: "fallback", model: "x", confidence: 1, needsReview: false }
        },
        {
          id: "r-none",
          sourceFileName: "b.pdf",
          testDate: "2025-01-02",
          createdAt: "2025-01-02T10:00:00.000Z",
          markers: [
            {
              id: "m-2",
              marker: "Testosterone",
              canonicalMarker: "Testosterone",
              value: 21,
              unit: "nmol/L",
              referenceMin: null,
              referenceMax: null,
              abnormal: "unknown",
              confidence: 1
            }
          ],
          annotations: {
            protocolId: null,
            protocol: "",
            supplementOverrides: [],
            symptoms: "",
            notes: "",
            samplingTiming: "unknown"
          },
          extraction: { provider: "fallback", model: "x", confidence: 1, needsReview: false }
        }
      ]
    });

    expect(data.reports.find((report) => report.id === "r-inherit")?.annotations.supplementAnchorState).toBe("inherit");
    expect(data.reports.find((report) => report.id === "r-none")?.annotations.supplementAnchorState).toBe("none");
  });
});
