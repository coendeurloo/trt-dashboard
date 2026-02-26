import { describe, expect, it } from "vitest";
import { buildBaselineReportByMarker, findBaselineOverlapMarkers, normalizeBaselineFlagsByMarkerOverlap } from "../baselineUtils";
import { LabReport } from "../types";

const makeReport = (
  id: string,
  markerNames: string[],
  isBaseline: boolean
): LabReport => ({
  id,
  sourceFileName: `${id}.pdf`,
  testDate: "2026-01-01",
  createdAt: "2026-01-01T10:00:00.000Z",
  isBaseline,
  annotations: {
    protocolId: null,
    protocol: "",
    supplementOverrides: null,
    symptoms: "",
    notes: "",
    samplingTiming: "trough"
  },
  markers: markerNames.map((marker, index) => ({
    id: `${id}-${index}`,
    marker,
    canonicalMarker: marker,
    value: 1,
    unit: "unit",
    referenceMin: null,
    referenceMax: null,
    abnormal: "unknown",
    confidence: 1
  })),
  extraction: {
    provider: "fallback",
    model: "fallback",
    confidence: 1,
    needsReview: false
  }
});

describe("baselineUtils", () => {
  it("finds overlap markers against existing baseline reports", () => {
    const baseline = makeReport("a", ["Testosterone", "SHBG"], true);
    const candidate = makeReport("b", ["Estradiol", "SHBG"], false);
    const overlaps = findBaselineOverlapMarkers(candidate, [baseline, candidate]);
    expect(overlaps).toEqual(["SHBG"]);
  });

  it("normalizes baseline flags to remove marker-overlapping baseline reports", () => {
    const first = makeReport("a", ["Testosterone"], true);
    const second = makeReport("b", ["Testosterone", "Estradiol"], true);
    const third = makeReport("c", ["Apolipoprotein B"], true);
    const normalized = normalizeBaselineFlagsByMarkerOverlap([first, second, third]);

    expect(normalized.find((report) => report.id === "a")?.isBaseline).toBe(true);
    expect(normalized.find((report) => report.id === "b")?.isBaseline).toBe(false);
    expect(normalized.find((report) => report.id === "c")?.isBaseline).toBe(true);
  });

  it("builds marker-to-baseline map", () => {
    const first = makeReport("a", ["Testosterone"], true);
    const second = makeReport("b", ["Estradiol"], true);
    const nonBaseline = makeReport("c", ["SHBG"], false);
    const byMarker = buildBaselineReportByMarker([first, second, nonBaseline]);

    expect(byMarker.get("Testosterone")?.id).toBe("a");
    expect(byMarker.get("Estradiol")?.id).toBe("b");
    expect(byMarker.has("SHBG")).toBe(false);
  });
});
