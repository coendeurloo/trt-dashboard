import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeLabDataWithClaude, generateAnalystMemory } from "../aiAnalysis";
import { LabReport, SupplementPeriod } from "../types";
import { AnalystMemory } from "../types/analystMemory";

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

const extractPromptTextFromPayload = (payload: unknown): string => {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const typedPayload = payload as {
    system?: string | Array<{ type?: string; text?: string }>;
    messages?: Array<{
      content?: string | Array<{ type?: string; text?: string }>;
    }>;
  };
  const systemText = typeof typedPayload.system === "string"
    ? typedPayload.system
    : Array.isArray(typedPayload.system)
      ? typedPayload.system
          .filter((block) => block?.type === "text" && typeof block.text === "string")
          .map((block) => block.text ?? "")
          .join("\n")
      : "";
  const userText = Array.isArray(typedPayload.messages)
    ? typedPayload.messages
        .flatMap((message) => {
          const content = message?.content;
          if (typeof content === "string") {
            return [content];
          }
          if (!Array.isArray(content)) {
            return [];
          }
          return content
            .filter((block) => block?.type === "text" && typeof block.text === "string")
            .map((block) => block.text ?? "");
        })
        .join("\n")
    : "";

  return [systemText, userText].filter((part) => part.length > 0).join("\n");
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

  it("streams Claude text deltas progressively when streaming is enabled", async () => {
    const streamedEvents = [
      "event: content_block_delta",
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}',
      "",
      "event: message_delta",
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}',
      "",
      "event: message_stop",
      'data: {"type":"message_stop"}',
      ""
    ].join("\n");
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(streamedEvents));
        controller.close();
      }
    });

    const fetchMock = vi.fn(async () => {
      return new Response(stream, {
        status: 200,
        headers: {
          "content-type": "text/event-stream"
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const deltas: string[] = [];
    const result = await analyzeLabDataWithClaude({
      reports: [sampleReport],
      protocols: [],
      supplementTimeline: [],
      unitSystem: "eu",
      language: "en",
      externalAiAllowed: true,
      onStreamEvent: (event) => {
        if (event.type === "delta" && event.delta) {
          deltas.push(event.delta);
        }
      }
    });

    expect(deltas.join("")).toContain("Hello world");
    expect(result.text).toContain("Hello world");
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
      const prompt = extractPromptTextFromPayload(body?.payload);
      prompts.push(prompt);
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

  it("injects custom user question into the full-analysis prompt", async () => {
    let capturedPrompt = "";
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      capturedPrompt = extractPromptTextFromPayload(body?.payload);
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
      reports: [sampleReport],
      protocols: [],
      supplementTimeline: [],
      unitSystem: "eu",
      language: "en",
      externalAiAllowed: true,
      customQuestion: "Why is my testosterone stable but energy still low?"
    });

    expect(capturedPrompt).toContain("USER QUESTION:");
    expect(capturedPrompt).toContain("Why is my testosterone stable but energy still low?");
    expect(capturedPrompt).toContain("Scope: answer the user question first.");
    expect(capturedPrompt).toContain("Question-first rules:");
    expect(capturedPrompt).not.toContain("Tell the story of how decisions led to outcomes.");
    const data = extractDataBlock(capturedPrompt);
    expect(data.userQuestion).toBe("Why is my testosterone stable but energy still low?");
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
      capturedPrompt = extractPromptTextFromPayload(body?.payload);
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
    const latestReportEvidence = data.latestReportEvidence as { latestDate?: string; presence?: Record<string, boolean> } | undefined;
    expect(promptReports).toHaveLength(3);
    expect(latestReportEvidence?.latestDate).toBe("2026-02-04");
    expect(latestReportEvidence?.presence?.Testosterone).toBe(true);
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

  it("adds current supplement stack context with dose change history to avoid duplicate increase advice", async () => {
    const latestReport: LabReport = {
      ...sampleReport,
      id: "r2",
      testDate: "2026-02-21",
      createdAt: "2026-02-21T10:00:00.000Z"
    };
    const supplementTimeline: SupplementPeriod[] = [
      {
        id: "s1",
        name: "Omega-3",
        dose: "1000 mg",
        frequency: "daily",
        startDate: "2025-08-01",
        endDate: "2025-11-30"
      },
      {
        id: "s2",
        name: "Omega-3",
        dose: "2000 mg",
        frequency: "daily",
        startDate: "2025-12-01",
        endDate: null
      }
    ];

    let capturedPrompt = "";
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      capturedPrompt = extractPromptTextFromPayload(body?.payload);
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
      reports: [sampleReport, latestReport],
      protocols: [],
      supplementTimeline,
      unitSystem: "eu",
      language: "en",
      externalAiAllowed: true
    });

    expect(capturedPrompt).toContain("currentSupplements = current truth.");
    const data = extractDataBlock(capturedPrompt);
    const currentSupplements = data.currentSupplements as
      | {
          activeAtLatestTestDate?: string;
          activeToday?: string;
          recentDoseOrFrequencyChanges?: Array<{ supplement?: string; from?: string; to?: string }>;
        }
      | undefined;

    expect(currentSupplements?.activeAtLatestTestDate).toContain("Omega-3 2000 mg daily");
    expect(currentSupplements?.activeToday).toContain("Omega-3 2000 mg daily");
    expect(currentSupplements?.recentDoseOrFrequencyChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          supplement: "Omega-3",
          from: "1000 mg daily",
          to: "2000 mg daily"
        })
      ])
    );
  });

  it("uses the most comparable previous report in latest comparison when immediate previous has low marker overlap", async () => {
    const reports: LabReport[] = [
      {
        ...sampleReport,
        id: "r-old",
        testDate: "2025-10-01",
        createdAt: "2025-10-01T10:00:00.000Z",
        markers: [
          {
            ...sampleReport.markers[0],
            id: "m-old",
            marker: "Testosterone",
            canonicalMarker: "Testosterone",
            value: 18.2
          }
        ]
      },
      {
        ...sampleReport,
        id: "r-mid",
        testDate: "2025-11-01",
        createdAt: "2025-11-01T10:00:00.000Z",
        markers: [
          {
            ...sampleReport.markers[0],
            id: "m-mid",
            marker: "CRP",
            canonicalMarker: "CRP",
            value: 2.1,
            unit: "mg/L",
            referenceMin: 0,
            referenceMax: 5
          }
        ]
      },
      {
        ...sampleReport,
        id: "r-latest",
        testDate: "2025-12-01",
        createdAt: "2025-12-01T10:00:00.000Z",
        markers: [
          {
            ...sampleReport.markers[0],
            id: "m-latest",
            marker: "Testosterone",
            canonicalMarker: "Testosterone",
            value: 21.4
          }
        ]
      }
    ];

    let capturedPrompt = "";
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      capturedPrompt = extractPromptTextFromPayload(body?.payload);
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
      analysisType: "latestComparison",
      externalAiAllowed: true
    });

    const data = extractDataBlock(capturedPrompt);
    const latestComparison = data.latestComparison as { previousDate?: string; latestDate?: string } | undefined;
    const promptReports = data.reports as Array<{ date?: string }> | undefined;
    expect(latestComparison?.previousDate).toBe("2025-10-01");
    expect(latestComparison?.latestDate).toBe("2025-12-01");
    expect(promptReports?.map((report) => report.date)).toEqual(["2025-10-01", "2025-12-01"]);
  });

  it("uses no-supplement prompt contract when no actions are needed", async () => {
    let capturedPrompt = "";
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      capturedPrompt = extractPromptTextFromPayload(body?.payload);
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
      "If the current stack looks appropriate given the data, say so briefly and explain which signals confirm it."
    );
    expect(result.actionsNeeded).toBe(false);
    expect(result.supplementActionsNeeded).toBe(false);
    expect(result.supplementAdviceIncluded).toBe(false);
  });

  it("uses supplement prompt contract and retains supplement section when actions are needed", async () => {
    let capturedPrompt = "";
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      capturedPrompt = extractPromptTextFromPayload(body?.payload);
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

    expect(capturedPrompt).toContain("## Supplement tweaks");
    expect(result.actionsNeeded).toBe(true);
    expect(result.supplementActionsNeeded).toBe(true);
    expect(result.supplementAdviceIncluded).toBe(true);
    expect(result.actionReasons.length).toBeGreaterThan(0);
  });

  it("injects analyst memory context before DATA START from the second analysis onward", async () => {
    const memory: AnalystMemory = {
      version: 1,
      lastUpdated: "2026-02-20",
      analysisCount: 3,
      responderProfile: {
        testosteroneResponse: "moderate",
        aromatizationTendency: "high",
        hematocritSensitivity: "unknown",
        notes: "Clear trough sensitivity."
      },
      personalBaselines: {
        Testosterone: {
          mean: 18.4,
          sd: 1.2,
          unit: "nmol/L",
          basedOnN: 4
        }
      },
      supplementHistory: [],
      protocolHistory: [],
      watchList: [],
      analystNotes: "Responds well to steadier frequency."
    };

    let capturedPrompt = "";
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      capturedPrompt = extractPromptTextFromPayload(body?.payload);
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
      reports: [sampleReport],
      protocols: [],
      supplementTimeline: [],
      unitSystem: "eu",
      language: "en",
      externalAiAllowed: true,
      memory
    });

    expect(capturedPrompt).toContain("## Analyst memory");
    expect(capturedPrompt).toContain("Memory contains 3 prior analyses, last updated 2026-02-20.");
    expect(capturedPrompt).toContain("Do NOT list or repeat the memory contents.");
    expect(capturedPrompt.indexOf("## Analyst memory")).toBeLessThan(capturedPrompt.indexOf("DATA START"));
  });

  it("builds byte-identical cached blocks for identical full-analysis inputs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T08:00:00.000Z"));

    const capturedBlocks: Array<{ system: unknown; dataBlock: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        capturedBlocks.push({
          system: body?.payload?.system,
          dataBlock: body?.payload?.messages?.[0]?.content?.[0]
        });
        return new Response(
          JSON.stringify({
            content: [{ type: "text", text: "ok" }],
            stop_reason: "end_turn"
          }),
          { status: 200 }
        );
      })
    );

    const input = {
      reports: [sampleReport],
      protocols: [],
      supplementTimeline: [] as SupplementPeriod[],
      unitSystem: "eu" as const,
      language: "en" as const,
      externalAiAllowed: true
    };

    await analyzeLabDataWithClaude(input);
    await analyzeLabDataWithClaude(input);

    expect(capturedBlocks).toHaveLength(2);
    expect(JSON.stringify(capturedBlocks[0].system)).toBe(JSON.stringify(capturedBlocks[1].system));
    expect(JSON.stringify(capturedBlocks[0].dataBlock)).toBe(JSON.stringify(capturedBlocks[1].dataBlock));
  });

  it("skips memory generation call when compact memory input hash is unchanged", async () => {
    const storageMap = new Map<string, string>();
    const mockStorage: Storage = {
      get length() {
        return storageMap.size;
      },
      clear: () => storageMap.clear(),
      getItem: (key: string) => storageMap.get(key) ?? null,
      key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
      removeItem: (key: string) => {
        storageMap.delete(key);
      },
      setItem: (key: string, value: string) => {
        storageMap.set(key, value);
      }
    };
    vi.stubGlobal("window", {
      storage: mockStorage,
      localStorage: mockStorage
    });

    const memoryJson = {
      version: 1,
      lastUpdated: "2026-04-10",
      analysisCount: 1,
      responderProfile: {
        testosteroneResponse: "unknown",
        aromatizationTendency: "unknown",
        hematocritSensitivity: "unknown",
        notes: ""
      },
      personalBaselines: {},
      supplementHistory: [],
      protocolHistory: [],
      watchList: [],
      analystNotes: ""
    };

    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: JSON.stringify(memoryJson) }],
          stop_reason: "end_turn"
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const options = {
      reports: [sampleReport],
      protocols: [],
      supplementTimeline: [] as SupplementPeriod[],
      unitSystem: "eu" as const,
      profile: "trt" as const,
      currentMemory: null,
      analysisResult: "## Summary\nStable trend.",
      aiConsent: {
        includeSymptoms: false,
        includeNotes: false
      }
    };

    const first = await generateAnalystMemory(options);
    const second = await generateAnalystMemory(options);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCallInit = (((fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] ?? [])[1] ?? {}) as RequestInit;
    const firstCallBody = JSON.parse(String(firstCallInit.body ?? "{}"));
    expect(firstCallBody?.payload?.model).toBe("claude-haiku-4-5");
  });

  it("includes marker presence inventory across scope and full latest-report marker list", async () => {
    const olderReport: LabReport = {
      ...sampleReport,
      id: "r-old",
      testDate: "2025-08-12",
      createdAt: "2025-08-12T10:00:00.000Z",
      markers: [
        {
          ...sampleReport.markers[0],
          id: "m-vitd",
          marker: "Vitamin D",
          canonicalMarker: "Vitamin D",
          unit: "nmol/L",
          value: 82
        },
        {
          ...sampleReport.markers[0],
          id: "m-crp",
          marker: "CRP",
          canonicalMarker: "CRP",
          unit: "mg/L",
          value: 1.1
        },
        {
          ...sampleReport.markers[0],
          id: "m-ins",
          marker: "Insulin",
          canonicalMarker: "Insulin",
          unit: "mIU/L",
          value: 6.4
        }
      ]
    };
    const latestReport: LabReport = {
      ...sampleReport,
      id: "r-new",
      testDate: "2026-02-04",
      createdAt: "2026-02-04T10:00:00.000Z",
      markers: [
        {
          ...sampleReport.markers[0],
          id: "m-test-latest",
          marker: "Testosterone",
          canonicalMarker: "Testosterone",
          value: 22.3
        }
      ]
    };

    let capturedPrompt = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        capturedPrompt = extractPromptTextFromPayload(body?.payload);
        return new Response(
          JSON.stringify({
            content: [{ type: "text", text: "ok" }],
            stop_reason: "end_turn"
          }),
          { status: 200 }
        );
      })
    );

    await analyzeLabDataWithClaude({
      reports: [olderReport, latestReport],
      protocols: [],
      supplementTimeline: [],
      unitSystem: "eu",
      language: "en",
      externalAiAllowed: true
    });

    const data = extractDataBlock(capturedPrompt);
    const markerPresenceAcrossScope = data.markerPresenceAcrossScope as
      | Record<string, { everSeen: boolean; latestSeenDate: string | null; countReportsSeen: number }>
      | undefined;
    const latestReportAllMarkers = data.latestReportAllMarkers as string[] | undefined;

    expect(markerPresenceAcrossScope?.["Vitamin D"]?.everSeen).toBe(true);
    expect(markerPresenceAcrossScope?.["Vitamin D (D3+D2) OH"]?.everSeen).toBe(true);
    expect(markerPresenceAcrossScope?.["Vitamin D"]?.latestSeenDate).toBe("2025-08-12");
    expect(markerPresenceAcrossScope?.["CRP"]?.everSeen).toBe(true);
    expect(markerPresenceAcrossScope?.["Insulin"]?.countReportsSeen).toBe(1);
    expect(latestReportAllMarkers).toEqual(["Testosterone"]);
  });

  it("adds alias entries for app-canonical markers like Vitamin D and Insuline in prompt inventory", async () => {
    const report: LabReport = {
      ...sampleReport,
      markers: [
        {
          ...sampleReport.markers[0],
          id: "m-vitd",
          marker: "Vitamin D (D3+D2) OH",
          canonicalMarker: "Vitamin D (D3+D2) OH",
          unit: "ng/mL",
          value: 60.1
        },
        {
          ...sampleReport.markers[0],
          id: "m-ins",
          marker: "Insuline",
          canonicalMarker: "Insuline",
          unit: "mIU/L",
          value: 7.2
        }
      ]
    };

    let capturedPrompt = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        capturedPrompt = extractPromptTextFromPayload(body?.payload);
        return new Response(
          JSON.stringify({
            content: [{ type: "text", text: "ok" }],
            stop_reason: "end_turn"
          }),
          { status: 200 }
        );
      })
    );

    await analyzeLabDataWithClaude({
      reports: [report],
      protocols: [],
      supplementTimeline: [],
      unitSystem: "eu",
      language: "en",
      externalAiAllowed: true
    });

    const data = extractDataBlock(capturedPrompt);
    const markerPresenceAcrossScope = data.markerPresenceAcrossScope as Record<string, { everSeen: boolean }> | undefined;
    const latestReportAllMarkers = data.latestReportAllMarkers as string[] | undefined;

    expect(markerPresenceAcrossScope?.["Vitamin D"]?.everSeen).toBe(true);
    expect(markerPresenceAcrossScope?.["Vitamin D (D3+D2) OH"]?.everSeen).toBe(true);
    expect(markerPresenceAcrossScope?.Insulin?.everSeen).toBe(true);
    expect(markerPresenceAcrossScope?.Insuline?.everSeen).toBe(true);
    expect(latestReportAllMarkers).toContain("Vitamin D");
    expect(latestReportAllMarkers).toContain("Vitamin D (D3+D2) OH");
    expect(latestReportAllMarkers).toContain("Insulin");
    expect(latestReportAllMarkers).toContain("Insuline");
  });

  it("includes personal context and derives ageYears from date of birth", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-22T12:00:00.000Z"));

    let capturedPrompt = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        capturedPrompt = extractPromptTextFromPayload(body?.payload);
        return new Response(
          JSON.stringify({
            content: [{ type: "text", text: "ok" }],
            stop_reason: "end_turn"
          }),
          { status: 200 }
        );
      })
    );

    await analyzeLabDataWithClaude({
      reports: [sampleReport],
      protocols: [],
      supplementTimeline: [],
      unitSystem: "eu",
      language: "en",
      externalAiAllowed: true,
      personalInfo: {
        dateOfBirth: "1990-05-10",
        weightKg: 82,
        heightCm: 183
      }
    });

    const data = extractDataBlock(capturedPrompt);
    const personalContext = data.personalContext as { ageYears: number | null; weightKg: number | null; heightCm: number | null };
    expect(personalContext).toEqual({
      ageYears: 35,
      weightKg: 82,
      heightCm: 183
    });
  });

  it("uses null personal context fields when values are missing or invalid", async () => {
    let capturedPrompt = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        capturedPrompt = extractPromptTextFromPayload(body?.payload);
        return new Response(
          JSON.stringify({
            content: [{ type: "text", text: "ok" }],
            stop_reason: "end_turn"
          }),
          { status: 200 }
        );
      })
    );

    await analyzeLabDataWithClaude({
      reports: [sampleReport],
      protocols: [],
      supplementTimeline: [],
      unitSystem: "eu",
      language: "en",
      externalAiAllowed: true,
      personalInfo: {
        dateOfBirth: "invalid-date",
        weightKg: -2,
        heightCm: null
      }
    });

    const data = extractDataBlock(capturedPrompt);
    const personalContext = data.personalContext as { ageYears: number | null; weightKg: number | null; heightCm: number | null };
    expect(personalContext).toEqual({
      ageYears: null,
      weightKg: null,
      heightCm: null
    });
  });

  it("uses Dutch section headings when the run language is Dutch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            content: [
              {
                type: "text",
                text: "## Direct antwoord\nKort antwoord.\n\n## Waarom dit past bij jouw data\nUitleg.\n\n## Wat nu te volgen\nPunt.\n\n## Voorgestelde volgende stap\nStap."
              }
            ],
            stop_reason: "end_turn"
          }),
          { status: 200 }
        );
      })
    );

    const result = await analyzeLabDataWithClaude({
      reports: [sampleReport],
      protocols: [],
      supplementTimeline: [],
      unitSystem: "eu",
      language: "nl",
      externalAiAllowed: true,
      customQuestion: "Welke marker mis ik nog?"
    });

    expect(result.text).toContain("## Direct antwoord");
    expect(result.text).toContain("## Waarom dit past bij jouw data");
    expect(result.text).toContain("## Wat nu te volgen");
    expect(result.text).toContain("## Voorgestelde volgende stap");
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
    expect(result.text).toContain("What to focus on");
  });
});
