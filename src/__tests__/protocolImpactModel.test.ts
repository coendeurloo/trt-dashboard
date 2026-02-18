import { describe, expect, it } from "vitest";
import { buildProtocolImpactDoseEvents } from "../analytics";
import { LabReport, Protocol, SamplingTiming, SupplementEntry } from "../types";

const mkProtocol = (
  id: string,
  options: {
    doseMg: number;
    frequency: string;
    compound?: string;
    supplements?: SupplementEntry[];
  }
): Protocol => ({
  id,
  name: id,
  compounds: [
    {
      name: options.compound ?? "Testosterone Enanthate",
      doseMg: String(options.doseMg),
      frequency: options.frequency,
      route: "IM"
    }
  ],
  supplements: options.supplements ?? [],
  notes: "",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z"
});

const mkReport = (
  id: string,
  date: string,
  protocolId: string,
  markers: Array<{ marker: string; value: number; unit: string }>,
  samplingTiming: SamplingTiming = "trough",
  symptoms = "",
  isBaseline = false
): LabReport => ({
  id,
  sourceFileName: `${id}.pdf`,
  testDate: date,
  createdAt: `${date}T08:00:00.000Z`,
  markers: markers.map((item, index) => ({
    id: `${id}-${index}`,
    marker: item.marker,
    canonicalMarker: item.marker,
    value: item.value,
    unit: item.unit,
    referenceMin: null,
    referenceMax: null,
    abnormal: "unknown",
    confidence: 1,
    source: "measured"
  })),
  annotations: {
    protocolId,
    protocol: "",
    symptoms,
    notes: "",
    samplingTiming
  },
  isBaseline,
  extraction: {
    provider: "fallback",
    model: "unit-test",
    confidence: 1,
    needsReview: false
  }
});

describe("protocol impact model", () => {
  it("detects dose-only events", () => {
    const protocols = [
      mkProtocol("p-a", { doseMg: 100, frequency: "2x/week" }),
      mkProtocol("p-b", { doseMg: 130, frequency: "2x/week" })
    ];
    const reports = [
      mkReport("r1", "2025-01-01", "p-a", [{ marker: "Testosterone", value: 520, unit: "ng/dL" }]),
      mkReport("r2", "2025-02-15", "p-b", [{ marker: "Testosterone", value: 560, unit: "ng/dL" }])
    ];

    const events = buildProtocolImpactDoseEvents(reports, "us", 45, protocols);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("dose");
    expect(events[0]?.triggerStrength ?? 0).toBeGreaterThan(0);
  });

  it("detects frequency-only events", () => {
    const protocols = [
      mkProtocol("p-a", { doseMg: 120, frequency: "1x/week" }),
      mkProtocol("p-b", { doseMg: 120, frequency: "3x/week" })
    ];
    const reports = [
      mkReport("r1", "2025-01-01", "p-a", [{ marker: "Testosterone", value: 510, unit: "ng/dL" }]),
      mkReport("r2", "2025-02-15", "p-b", [{ marker: "Testosterone", value: 540, unit: "ng/dL" }])
    ];

    const events = buildProtocolImpactDoseEvents(reports, "us", 45, protocols);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("frequency");
  });

  it("detects compound-only events", () => {
    const protocols = [
      mkProtocol("p-a", { doseMg: 120, frequency: "2x/week", compound: "Testosterone Enanthate" }),
      mkProtocol("p-b", { doseMg: 120, frequency: "2x/week", compound: "Testosterone Cypionate" })
    ];
    const reports = [
      mkReport("r1", "2025-01-01", "p-a", [{ marker: "Testosterone", value: 510, unit: "ng/dL" }]),
      mkReport("r2", "2025-02-15", "p-b", [{ marker: "Testosterone", value: 540, unit: "ng/dL" }])
    ];

    const events = buildProtocolImpactDoseEvents(reports, "us", 45, protocols);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("compound");
  });

  it("applies lag-aware windows per marker category", () => {
    const protocols = [
      mkProtocol("p-a", { doseMg: 100, frequency: "2x/week" }),
      mkProtocol("p-b", { doseMg: 140, frequency: "2x/week" })
    ];
    const reports = [
      mkReport("r1", "2025-01-20", "p-a", [{ marker: "LDL Cholesterol", value: 100, unit: "mg/dL" }]),
      mkReport("r2", "2025-02-01", "p-b", [{ marker: "LDL Cholesterol", value: 105, unit: "mg/dL" }]),
      mkReport("r3", "2025-02-10", "p-b", [{ marker: "LDL Cholesterol", value: 220, unit: "mg/dL" }]),
      mkReport("r4", "2025-03-10", "p-b", [{ marker: "LDL Cholesterol", value: 140, unit: "mg/dL" }])
    ];

    const events = buildProtocolImpactDoseEvents(reports, "us", 45, protocols);
    const event = events[0];
    const ldlRow = event?.rows.find((row) => row.marker === "LDL Cholesterol");

    expect(ldlRow).toBeDefined();
    expect(ldlRow?.lagDays).toBe(28);
    expect(ldlRow?.nAfter).toBe(1);
    expect(ldlRow?.afterAvg).toBe(140);
  });

  it("uses baseline fallback when pre-window is empty", () => {
    const protocols = [
      mkProtocol("p-a", { doseMg: 0, frequency: "0x/week" }),
      mkProtocol("p-b", { doseMg: 125, frequency: "2x/week" })
    ];
    const reports = [
      mkReport("base", "2024-01-01", "p-a", [{ marker: "Testosterone", value: 320, unit: "ng/dL" }], "trough", "", true),
      mkReport("r1", "2025-02-01", "p-a", [{ marker: "SHBG", value: 32, unit: "nmol/L" }]),
      mkReport("r2", "2025-03-20", "p-b", [{ marker: "Testosterone", value: 500, unit: "ng/dL" }]),
      mkReport("r3", "2025-04-12", "p-b", [{ marker: "Testosterone", value: 690, unit: "ng/dL" }])
    ];

    const event = buildProtocolImpactDoseEvents(reports, "us", 45, protocols)[0];
    const row = event?.rows.find((item) => item.marker === "Testosterone");

    expect(row?.beforeSource).toBe("baseline");
    expect(row?.beforeAvg).toBe(320);
    expect(row?.nBefore).toBe(1);
  });

  it("does not use baseline fallback when pre-window already has data", () => {
    const protocols = [
      mkProtocol("p-a", { doseMg: 0, frequency: "0x/week" }),
      mkProtocol("p-b", { doseMg: 125, frequency: "2x/week" })
    ];
    const reports = [
      mkReport("base", "2024-01-01", "p-a", [{ marker: "Testosterone", value: 320, unit: "ng/dL" }], "trough", "", true),
      mkReport("r1", "2025-03-05", "p-a", [{ marker: "Testosterone", value: 490, unit: "ng/dL" }]),
      mkReport("r2", "2025-03-20", "p-b", [{ marker: "Testosterone", value: 520, unit: "ng/dL" }]),
      mkReport("r3", "2025-04-12", "p-b", [{ marker: "Testosterone", value: 690, unit: "ng/dL" }])
    ];

    const event = buildProtocolImpactDoseEvents(reports, "us", 45, protocols)[0];
    const row = event?.rows.find((item) => item.marker === "Testosterone");

    expect(row?.beforeSource).toBe("window");
    expect(row?.beforeAvg).toBe(490);
  });

  it("reduces confidence score when baseline is older", () => {
    const protocols = [
      mkProtocol("p-a", { doseMg: 0, frequency: "0x/week" }),
      mkProtocol("p-b", { doseMg: 125, frequency: "2x/week" })
    ];

    const recentBaselineReports = [
      mkReport("base", "2025-01-15", "p-a", [{ marker: "Testosterone", value: 320, unit: "ng/dL" }], "trough", "", true),
      mkReport("r1", "2025-02-01", "p-a", [{ marker: "SHBG", value: 32, unit: "nmol/L" }]),
      mkReport("r2", "2025-03-20", "p-b", [{ marker: "Testosterone", value: 500, unit: "ng/dL" }]),
      mkReport("r3", "2025-04-12", "p-b", [{ marker: "Testosterone", value: 690, unit: "ng/dL" }])
    ];

    const oldBaselineReports = [
      mkReport("base", "2024-01-01", "p-a", [{ marker: "Testosterone", value: 320, unit: "ng/dL" }], "trough", "", true),
      mkReport("r1", "2025-02-01", "p-a", [{ marker: "SHBG", value: 32, unit: "nmol/L" }]),
      mkReport("r2", "2025-03-20", "p-b", [{ marker: "Testosterone", value: 500, unit: "ng/dL" }]),
      mkReport("r3", "2025-04-12", "p-b", [{ marker: "Testosterone", value: 690, unit: "ng/dL" }])
    ];

    const recentScore =
      buildProtocolImpactDoseEvents(recentBaselineReports, "us", 45, protocols)[0]?.rows.find((row) => row.marker === "Testosterone")
        ?.confidenceScore ?? 0;
    const oldScore =
      buildProtocolImpactDoseEvents(oldBaselineReports, "us", 45, protocols)[0]?.rows.find((row) => row.marker === "Testosterone")
        ?.confidenceScore ?? 0;

    expect(oldScore).toBeLessThan(recentScore);
  });

  it("fills recommended next test date when waiting for post-window data", () => {
    const protocols = [
      mkProtocol("p-a", { doseMg: 0, frequency: "0x/week" }),
      mkProtocol("p-b", { doseMg: 125, frequency: "2x/week" })
    ];
    const reports = [
      mkReport("base", "2025-01-15", "p-a", [{ marker: "Testosterone", value: 320, unit: "ng/dL" }], "trough", "", true),
      mkReport("r1", "2025-03-05", "p-a", [{ marker: "Testosterone", value: 490, unit: "ng/dL" }]),
      mkReport("r2", "2025-03-20", "p-b", [{ marker: "Testosterone", value: 520, unit: "ng/dL" }])
    ];

    const event = buildProtocolImpactDoseEvents(reports, "us", 45, protocols)[0];
    const row = event?.rows.find((item) => item.marker === "Testosterone");

    expect(row?.readinessStatus).toBe("waiting_post");
    expect(row?.recommendedNextTestDate).toBe("2025-04-13");
  });

  it("sets readiness status for different data-availability cases", () => {
    const protocols = [
      mkProtocol("p-a", { doseMg: 100, frequency: "2x/week" }),
      mkProtocol("p-b", { doseMg: 150, frequency: "2x/week" })
    ];

    const reports = [
      mkReport("r0", "2025-02-20", "p-a", [
        { marker: "Hematocrit", value: 46, unit: "%" },
        { marker: "Testosterone", value: 510, unit: "ng/dL" }
      ]),
      mkReport("r1", "2025-03-20", "p-b", [
        { marker: "CRP", value: 1.1, unit: "mg/L" },
        { marker: "Testosterone", value: 540, unit: "ng/dL" }
      ]),
      mkReport("r2", "2025-04-15", "p-b", [{ marker: "Estradiol", value: 32, unit: "pg/mL" }])
    ];

    const event = buildProtocolImpactDoseEvents(reports, "us", 45, protocols)[0];

    expect(event?.rows.find((row) => row.marker === "Hematocrit")?.readinessStatus).toBe("waiting_post");
    expect(event?.rows.find((row) => row.marker === "Estradiol")?.readinessStatus).toBe("waiting_pre");
    expect(event?.rows.find((row) => row.marker === "CRP")?.readinessStatus).toBe("waiting_both");
  });

  it("keeps top-4 effects sorted by impact score", () => {
    const protocols = [
      mkProtocol("p-a", { doseMg: 100, frequency: "2x/week" }),
      mkProtocol("p-b", { doseMg: 160, frequency: "2x/week" })
    ];
    const reports = [
      mkReport("r1", "2025-01-01", "p-a", [
        { marker: "Testosterone", value: 500, unit: "ng/dL" },
        { marker: "Free Testosterone", value: 12, unit: "pg/mL" },
        { marker: "Estradiol", value: 22, unit: "pg/mL" },
        { marker: "Hematocrit", value: 46, unit: "%" },
        { marker: "LDL Cholesterol", value: 118, unit: "mg/dL" },
        { marker: "CRP", value: 1.1, unit: "mg/L" }
      ]),
      mkReport("r2", "2025-01-20", "p-a", [
        { marker: "Testosterone", value: 520, unit: "ng/dL" },
        { marker: "Free Testosterone", value: 13, unit: "pg/mL" },
        { marker: "Estradiol", value: 24, unit: "pg/mL" },
        { marker: "Hematocrit", value: 47, unit: "%" },
        { marker: "LDL Cholesterol", value: 120, unit: "mg/dL" },
        { marker: "CRP", value: 1.2, unit: "mg/L" }
      ]),
      mkReport("r3", "2025-02-05", "p-b", [
        { marker: "Testosterone", value: 530, unit: "ng/dL" },
        { marker: "Free Testosterone", value: 13.5, unit: "pg/mL" },
        { marker: "Estradiol", value: 25, unit: "pg/mL" },
        { marker: "Hematocrit", value: 47, unit: "%" },
        { marker: "LDL Cholesterol", value: 122, unit: "mg/dL" },
        { marker: "CRP", value: 1.2, unit: "mg/L" }
      ]),
      mkReport("r4", "2025-02-25", "p-b", [
        { marker: "Testosterone", value: 700, unit: "ng/dL" },
        { marker: "Free Testosterone", value: 20, unit: "pg/mL" },
        { marker: "Estradiol", value: 39, unit: "pg/mL" },
        { marker: "Hematocrit", value: 50, unit: "%" },
        { marker: "LDL Cholesterol", value: 142, unit: "mg/dL" },
        { marker: "CRP", value: 3.1, unit: "mg/L" }
      ]),
      mkReport("r5", "2025-03-10", "p-b", [
        { marker: "Testosterone", value: 730, unit: "ng/dL" },
        { marker: "Free Testosterone", value: 21, unit: "pg/mL" },
        { marker: "Estradiol", value: 42, unit: "pg/mL" },
        { marker: "Hematocrit", value: 51, unit: "%" },
        { marker: "LDL Cholesterol", value: 145, unit: "mg/dL" },
        { marker: "CRP", value: 3.4, unit: "mg/L" }
      ])
    ];

    const events = buildProtocolImpactDoseEvents(reports, "us", 45, protocols);
    const event = events[0];

    expect(event?.topImpacts).toHaveLength(4);
    expect(event?.topImpacts.every((row) => !row.insufficientData)).toBe(true);
    expect((event?.topImpacts[0]?.impactScore ?? 0) >= (event?.topImpacts[1]?.impactScore ?? 0)).toBe(true);
    expect((event?.topImpacts[1]?.impactScore ?? 0) >= (event?.topImpacts[2]?.impactScore ?? 0)).toBe(true);
  });

  it("returns a human narrative for insufficient post-window data", () => {
    const protocols = [
      mkProtocol("p-a", { doseMg: 100, frequency: "2x/week" }),
      mkProtocol("p-b", { doseMg: 130, frequency: "2x/week" })
    ];
    const reports = [
      mkReport("r1", "2025-01-01", "p-a", [{ marker: "Testosterone", value: 500, unit: "ng/dL" }]),
      mkReport("r2", "2025-02-15", "p-b", [{ marker: "Testosterone", value: 540, unit: "ng/dL" }])
    ];

    const event = buildProtocolImpactDoseEvents(reports, "us", 45, protocols)[0];
    const row = event?.rows.find((item) => item.marker === "Testosterone");

    expect(row?.insufficientData).toBe(true);
    expect(row?.narrative.toLowerCase()).toContain("post window");
  });

  it("creates factual observed story plus cautious interpretation story", () => {
    const protocols = [
      mkProtocol("p-a", { doseMg: 100, frequency: "2x/week" }),
      mkProtocol("p-b", { doseMg: 130, frequency: "2x/week" })
    ];
    const reports = [
      mkReport("r1", "2025-01-01", "p-a", [{ marker: "Testosterone", value: 500, unit: "ng/dL" }]),
      mkReport("r2", "2025-02-15", "p-b", [{ marker: "Testosterone", value: 540, unit: "ng/dL" }])
    ];

    const event = buildProtocolImpactDoseEvents(reports, "us", 45, protocols)[0];
    expect(event?.headlineNarrative).toContain("dose change");
    expect(event?.headlineNarrative).toContain("on");
    expect(event?.storyObserved).toBeTruthy();
    expect(event?.storyObserved.toLowerCase()).not.toContain("likely");
    expect(event?.storyObserved.toLowerCase()).not.toContain("observed:");
    expect(event?.storyInterpretation).toBeTruthy();
    expect(event?.storyInterpretation.toLowerCase()).toContain("signal");
    expect(event?.storyChange).toBeTruthy();
    expect(event?.storyEffect).toBeTruthy();
    expect(event?.storyReliability).toBeTruthy();
    expect(event?.storySummary.includes("r=")).toBe(false);
    expect(event?.storySummary.toLowerCase().includes("impactscore")).toBe(false);
  });

  it("maps signal status from sparse to stronger evidence", () => {
    const protocols = [
      mkProtocol("p-a", { doseMg: 100, frequency: "2x/week" }),
      mkProtocol("p-b", { doseMg: 130, frequency: "2x/week" })
    ];

    const sparseReports = [
      mkReport("r1", "2025-01-01", "p-a", [{ marker: "Testosterone", value: 500, unit: "ng/dL" }]),
      mkReport("r2", "2025-02-15", "p-b", [{ marker: "Testosterone", value: 540, unit: "ng/dL" }])
    ];
    const sparseEvent = buildProtocolImpactDoseEvents(sparseReports, "us", 45, protocols)[0];

    const mediumReports = [
      mkReport("r1", "2025-01-01", "p-a", [{ marker: "Testosterone", value: 490, unit: "ng/dL" }]),
      mkReport("r2", "2025-01-20", "p-a", [{ marker: "Testosterone", value: 500, unit: "ng/dL" }]),
      mkReport("r3", "2025-02-15", "p-b", [{ marker: "Testosterone", value: 560, unit: "ng/dL" }]),
      mkReport("r4", "2025-03-05", "p-b", [{ marker: "Testosterone", value: 575, unit: "ng/dL" }])
    ];
    const mediumEvent = buildProtocolImpactDoseEvents(mediumReports, "us", 45, protocols)[0];

    const strongReports = [
      mkReport("r1", "2024-11-01", "p-a", [
        { marker: "Testosterone", value: 450, unit: "ng/dL" },
        { marker: "Estradiol", value: 18, unit: "pg/mL" }
      ]),
      mkReport("r2", "2024-12-05", "p-a", [
        { marker: "Testosterone", value: 470, unit: "ng/dL" },
        { marker: "Estradiol", value: 20, unit: "pg/mL" }
      ]),
      mkReport("r3", "2024-12-20", "p-a", [
        { marker: "Testosterone", value: 480, unit: "ng/dL" },
        { marker: "Estradiol", value: 22, unit: "pg/mL" }
      ]),
      mkReport("r4", "2025-01-15", "p-b", [
        { marker: "Testosterone", value: 560, unit: "ng/dL" },
        { marker: "Estradiol", value: 28, unit: "pg/mL" }
      ]),
      mkReport("r5", "2025-02-10", "p-b", [
        { marker: "Testosterone", value: 590, unit: "ng/dL" },
        { marker: "Estradiol", value: 33, unit: "pg/mL" }
      ]),
      mkReport("r6", "2025-03-05", "p-b", [
        { marker: "Testosterone", value: 610, unit: "ng/dL" },
        { marker: "Estradiol", value: 36, unit: "pg/mL" }
      ]),
      mkReport("r7", "2025-03-25", "p-b", [
        { marker: "Testosterone", value: 620, unit: "ng/dL" },
        { marker: "Estradiol", value: 38, unit: "pg/mL" }
      ])
    ];
    const strongEvent = buildProtocolImpactDoseEvents(strongReports, "us", 45, protocols)[0];

    expect(sparseEvent?.signalStatus).toBe("early_signal");
    expect(mediumEvent?.signalStatus === "building_signal" || mediumEvent?.signalStatus === "established_pattern").toBe(true);
    expect(strongEvent?.signalStatus).toBe("established_pattern");
  });
});
