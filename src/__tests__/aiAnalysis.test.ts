import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeLabDataWithClaude } from "../aiAnalysis";
import { LabReport } from "../types";

const sampleReport: LabReport = {
  id: "r1",
  sourceFileName: "report.pdf",
  testDate: "2026-01-21",
  createdAt: "2026-01-21T10:00:00.000Z",
  markers: [
    {
      id: "m1",
      marker: "Testosterone",
      canonicalMarker: "Testosterone",
      value: 20.7,
      unit: "nmol/L",
      referenceMin: 8,
      referenceMax: 29,
      abnormal: "normal",
      confidence: 1
    }
  ],
  annotations: {
    protocolId: null,
    protocol: "",
    supplementOverrides: null,
    symptoms: "",
    notes: "",
    samplingTiming: "trough"
  },
  extraction: {
    provider: "fallback",
    model: "fallback",
    confidence: 0.9,
    needsReview: false
  }
};

describe("analyzeLabDataWithClaude", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not make an extra retry call when response is cut at max_tokens", async () => {
    const requests: Array<{ payload?: { max_tokens?: number } }> = [];

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      requests.push(body);

      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "## Partial analysis\n- cut" }],
          stop_reason: "max_tokens"
        }),
        { status: 200 }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeLabDataWithClaude({
      reports: [sampleReport],
      protocols: [],
      supplementTimeline: [],
      unitSystem: "eu",
      language: "en"
    });

    expect(result).toContain("Partial analysis");
    expect(result).toContain("output may be incomplete");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requests[0]?.payload?.max_tokens).toBe(2400);
  });
});
