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

const extractDataBlock = (prompt: string): Record<string, unknown> => {
  const start = prompt.indexOf("DATA START\n");
  const end = prompt.indexOf("\nDATA END");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Could not locate DATA block in AI prompt.");
  }
  const json = prompt.slice(start + "DATA START\n".length, end).trim();
  return JSON.parse(json) as Record<string, unknown>;
};

describe("analyzeLabDataWithClaude", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not make an extra retry call when response is cut at max_tokens", async () => {
    const requests: Array<{ payload?: { max_tokens?: number } }> = [];
    let callIndex = 0;

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      requests.push(body);
      callIndex += 1;

      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: callIndex === 1 ? "## Partial analysis\n- cut" : "continued and completed" }],
          stop_reason: callIndex === 1 ? "max_tokens" : "end_turn"
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

    expect(result.text).toContain("Partial analysis");
    expect(result.text).toContain("continued and completed");
    expect(result.text).not.toContain("output may be incomplete");
    expect(result.model).toBeTruthy();
    expect(result.provider).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it("retries overloaded responses with backoff before succeeding", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        return new Response(
          JSON.stringify({
            error: {
              message: "Overloaded"
            }
          }),
          { status: 529 }
        );
      }
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "Recovered analysis" }],
          stop_reason: "end_turn"
        }),
        { status: 200 }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const pending = analyzeLabDataWithClaude({
      reports: [sampleReport],
      protocols: [],
      supplementTimeline: [],
      unitSystem: "eu",
      language: "en",
      externalAiAllowed: true
    });
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.text).toContain("Recovered analysis");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("includes wellbeing summary and keeps full selected report set in full analysis payload", async () => {
    const reports: LabReport[] = [
      sampleReport,
      {
        ...sampleReport,
        id: "r2",
        testDate: "2026-01-28",
        createdAt: "2026-01-28T10:00:00.000Z"
      },
      {
        ...sampleReport,
        id: "r3",
        testDate: "2026-02-04",
        createdAt: "2026-02-04T10:00:00.000Z"
      }
    ];

    let capturedPrompt = "";
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      capturedPrompt = String(body?.payload?.messages?.[0]?.content ?? "");
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
      reports,
      protocols: [],
      supplementTimeline: [],
      unitSystem: "eu",
      language: "en",
      externalAiAllowed: true,
      analysisType: "full",
      context: {
        samplingFilter: "all",
        protocolImpact: {
          events: [],
          insights: []
        },
        alerts: [],
        trendByMarker: {},
        trtStability: {
          score: null,
          components: {}
        },
        dosePredictions: [],
        wellbeingSummary: {
          windowStart: "2026-01-21",
          windowEnd: "2026-02-04",
          count: 2,
          latestDate: "2026-02-01",
          latestAverage: 7,
          metricAverages: {
            energy: 7,
            mood: 7,
            sleep: 6,
            libido: 6,
            motivation: 8
          },
          metricTrends: {
            energy: "rising",
            mood: "stable",
            sleep: "stable",
            libido: "stable",
            motivation: "rising"
          },
          recentPoints: [
            {
              date: "2026-01-25",
              energy: 6,
              mood: 7,
              sleep: 6,
              libido: 6,
              motivation: 7
            },
            {
              date: "2026-02-01",
              energy: 8,
              mood: 7,
              sleep: 6,
              libido: 6,
              motivation: 9
            }
          ]
        }
      }
    });

    const data = extractDataBlock(capturedPrompt);
    const promptReports = data.reports as unknown[] | undefined;
    const promptSignals = data.signals as { wellbeing?: unknown } | undefined;
    expect(promptReports).toHaveLength(3);
    expect(promptSignals?.wellbeing).toEqual({
      windowStart: "2026-01-21",
      windowEnd: "2026-02-04",
      count: 2,
      latestDate: "2026-02-01",
      latestAverage: 7,
      metricAverages: {
        energy: 7,
        mood: 7,
        sleep: 6,
        libido: 6,
        motivation: 8
      },
      metricTrends: {
        energy: "rising",
        mood: "stable",
        sleep: "stable",
        libido: "stable",
        motivation: "rising"
      },
      recentPoints: [
        {
          date: "2026-01-25",
          energy: 6,
          mood: 7,
          sleep: 6,
          libido: 6,
          motivation: 7
        },
        {
          date: "2026-02-01",
          energy: 8,
          mood: 7,
          sleep: 6,
          libido: 6,
          motivation: 9
        }
      ]
    });
  });

  it("uses no-supplement prompt contract when no actions are needed", async () => {
    let capturedPrompt = "";
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      capturedPrompt = String(body?.payload?.messages?.[0]?.content ?? "");
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "## Clinical Story\nStable." }],
          stop_reason: "end_turn"
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

    expect(capturedPrompt).toContain(
      "Do NOT include any 'Supplement Changes' section when no supplement action is needed."
    );
    expect(result.actionsNeeded).toBe(false);
    expect(result.supplementActionsNeeded).toBe(false);
    expect(result.supplementAdviceIncluded).toBe(false);
  });

  it("uses supplement prompt contract and retains supplement section when actions are needed", async () => {
    let capturedPrompt = "";
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      capturedPrompt = String(body?.payload?.messages?.[0]?.content ?? "");
      return new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: "## Clinical Story\nRisk signs.\n\n## Supplement Advice (for doctor discussion)\n- Consider dose adjustment."
            }
          ],
          stop_reason: "end_turn"
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
      externalAiAllowed: true,
      context: {
        samplingFilter: "all",
        protocolImpact: {
          events: [],
          insights: []
        },
        alerts: [
          {
            id: "a1",
            marker: "Hematocrit",
            type: "threshold",
            severity: "medium",
            tone: "attention",
            actionNeeded: true,
            message: "Hematocrit trend needs follow-up",
            suggestion: "Discuss interventions",
            date: "2026-01-21"
          }
        ],
        trendByMarker: {},
        trtStability: {
          score: null,
          components: {}
        },
        dosePredictions: [],
        wellbeingSummary: null
      }
    });

    expect(capturedPrompt).toContain("## Supplement Changes (for doctor discussion)");
    expect(result.actionsNeeded).toBe(true);
    expect(result.supplementActionsNeeded).toBe(true);
    expect(result.supplementAdviceIncluded).toBe(true);
    expect(result.actionReasons.length).toBeGreaterThan(0);
  });

  it("strips supplement section when output includes it but actions are not needed", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: "## Clinical Story\nStable context.\n\n## Supplement Advice (for doctor discussion)\n- Keep everything unchanged.\n\n## What Matters Most Now\nNo urgent issues."
            }
          ],
          stop_reason: "end_turn"
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

    expect(result.actionsNeeded).toBe(false);
    expect(result.supplementActionsNeeded).toBe(false);
    expect(result.supplementAdviceIncluded).toBe(false);
    expect(result.text.toLowerCase()).not.toContain("supplement advice");
    expect(result.text.toLowerCase()).not.toContain("supplement changes");
    expect(result.text).toContain("What Matters Most Now");
  });
});
