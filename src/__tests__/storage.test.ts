import { describe, expect, it } from "vitest";
import { coerceStoredAppData } from "../storage";

describe("storage.coerceStoredAppData", () => {
  it("returns defaults for null/malformed input", () => {
    expect(coerceStoredAppData(null)).toMatchObject({ schemaVersion: expect.any(Number), reports: [] });
    expect(coerceStoredAppData(undefined)).toMatchObject({ schemaVersion: expect.any(Number), reports: [] });
    expect(coerceStoredAppData({})).toMatchObject({ schemaVersion: expect.any(Number), reports: [] });
  });

  it("normalizes reports, deduplicates markers, and keeps single baseline", () => {
    const coerced = coerceStoredAppData({
      reports: [
        {
          id: "a",
          sourceFileName: "a.pdf",
          testDate: "2025-01-01",
          createdAt: "2025-01-01T10:00:00.000Z",
          isBaseline: true,
          annotations: {
            dosageMgPerWeek: null,
            protocol: "",
            supplements: "",
            symptoms: "",
            notes: "",
            samplingTiming: "unknown"
          },
          markers: [
            {
              id: "m1",
              marker: "Hematocriet",
              canonicalMarker: "Hematocrit",
              value: 0.52,
              unit: "l/l",
              referenceMin: 0.4,
              referenceMax: 0.52,
              abnormal: "unknown",
              confidence: 0.7
            },
            {
              id: "m1-dup",
              marker: "Hematocriet",
              canonicalMarker: "Hematocrit",
              value: 0.52,
              unit: "l/l",
              referenceMin: 0.4,
              referenceMax: 0.52,
              abnormal: "unknown",
              confidence: 0.9
            }
          ],
          extraction: { provider: "fallback", model: "x", confidence: 1, needsReview: false }
        },
        {
          id: "b",
          sourceFileName: "b.pdf",
          testDate: "2025-02-01",
          createdAt: "2025-02-01T10:00:00.000Z",
          isBaseline: true,
          annotations: {
            dosageMgPerWeek: null,
            protocol: "",
            supplements: "",
            symptoms: "",
            notes: "",
            samplingTiming: "unknown"
          },
          markers: [
            {
              id: "m2",
              marker: "Testosterone",
              canonicalMarker: "Testosterone",
              value: 25,
              unit: "nmol/L",
              referenceMin: null,
              referenceMax: null,
              abnormal: "unknown",
              confidence: 1
            }
          ],
          extraction: { provider: "claude", model: "x", confidence: 1, needsReview: false }
        }
      ]
    });

    expect(coerced.reports).toHaveLength(2);
    const baselineCount = coerced.reports.filter((report) => report.isBaseline).length;
    expect(baselineCount).toBe(1);

    const firstMarkers = coerced.reports[0]?.markers ?? [];
    expect(firstMarkers).toHaveLength(1);
    expect(firstMarkers[0]?.canonicalMarker).toBe("Hematocrit");
    expect(firstMarkers[0]?.value).toBe(52);
    expect(firstMarkers[0]?.unit).toBe("%");
  });
});
