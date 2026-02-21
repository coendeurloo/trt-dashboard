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
      language: "en",
      externalAiAllowed: true
    });

    expect(result).toContain("Partial analysis");
    expect(result).toContain("output may be incomplete");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requests[0]?.payload?.max_tokens).toBe(2400);
  });

  it("keeps symptoms/notes out unless explicitly opted in", async () => {
    const reportWithContext: LabReport = {
      ...sampleReport,
      annotations: {
        ...sampleReport.annotations,
        symptoms: "Headache on peak day",
        notes: "Reach me via test@example.com"
      }
    };

    const prompts: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const prompt = body?.payload?.messages?.[0]?.content ?? "";
      prompts.push(String(prompt));
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "ok" }],
          stop_reason: "end_turn"
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await analyzeLabDataWithClaude({
      reports: [reportWithContext],
      protocols: [],
      supplementTimeline: [],
      unitSystem: "eu",
      language: "en",
      externalAiAllowed: true
    });
    await analyzeLabDataWithClaude({
      reports: [reportWithContext],
      protocols: [],
      supplementTimeline: [],
      unitSystem: "eu",
      language: "en",
      externalAiAllowed: true,
      aiConsent: {
        includeSymptoms: true,
        includeNotes: true
      }
    });

    expect(prompts[0]).not.toContain("Headache on peak day");
    expect(prompts[0]).not.toContain("test@example.com");
    expect(prompts[1]).toContain("Headache on peak day");
    expect(prompts[1]).toContain("[REDACTED_EMAIL]");
  });
});
