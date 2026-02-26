import { describe, expect, it } from "vitest";
import { LabReport, SupplementPeriod } from "../types";
import {
  getActiveSupplementsAtDate,
  getCurrentInheritedSupplementContext,
  getEffectiveSupplements,
  resolveReportSupplementContexts,
  supplementPeriodsToText
} from "../supplementUtils";

const timeline: SupplementPeriod[] = [
  {
    id: "s1",
    name: "Vitamin D3",
    dose: "4000 IU",
    frequency: "daily",
    startDate: "2025-01-01",
    endDate: null
  },
  {
    id: "s2",
    name: "Zinc",
    dose: "25 mg",
    frequency: "daily",
    startDate: "2025-01-15",
    endDate: "2025-03-01"
  }
];

const mkReport = (input: {
  id: string;
  date: string;
  anchorState?: "inherit" | "anchor" | "none" | "unknown";
  overrides?: SupplementPeriod[] | null;
}): LabReport => ({
  id: input.id,
  sourceFileName: "test.pdf",
  testDate: input.date,
  createdAt: `${input.date}T08:00:00.000Z`,
  markers: [],
  annotations: {
    protocolId: null,
    protocol: "",
    supplementAnchorState: input.anchorState ?? "inherit",
    supplementOverrides: input.overrides ?? null,
    symptoms: "",
    notes: "",
    samplingTiming: "unknown"
  },
  extraction: {
    provider: "fallback",
    model: "unit-test",
    confidence: 1,
    needsReview: false
  }
});

describe("supplement utils", () => {
  it("matches active supplements on date boundaries", () => {
    expect(getActiveSupplementsAtDate(timeline, "2025-01-01").map((item) => item.name)).toEqual(["Vitamin D3"]);
    expect(getActiveSupplementsAtDate(timeline, "2025-02-01").map((item) => item.name)).toEqual(["Vitamin D3", "Zinc"]);
    expect(getActiveSupplementsAtDate(timeline, "2025-03-02").map((item) => item.name)).toEqual(["Vitamin D3"]);
  });

  it("resolves report supplement contexts from timeline by test date unless explicitly overridden", () => {
    const reports: LabReport[] = [
      mkReport({ id: "r1", date: "2025-02-10", anchorState: "inherit" }),
      mkReport({
        id: "r2",
        date: "2025-03-10",
        anchorState: "anchor",
        overrides: [
          {
            id: "o1",
            name: "NAC",
            dose: "600 mg",
            frequency: "daily",
            startDate: "2025-03-10",
            endDate: "2025-03-10"
          }
        ]
      }),
      mkReport({ id: "r3", date: "2025-04-10", anchorState: "inherit" }),
      mkReport({ id: "r4", date: "2025-05-10", anchorState: "none", overrides: [] }),
      mkReport({ id: "r5", date: "2025-06-10", anchorState: "inherit" }),
      mkReport({ id: "r6", date: "2025-07-10", anchorState: "unknown" }),
      mkReport({ id: "r7", date: "2025-08-10", anchorState: "inherit" })
    ];

    const contexts = resolveReportSupplementContexts(reports, timeline);

    expect(contexts["r1"]?.effectiveSupplements.map((item) => item.name)).toEqual(["Vitamin D3", "Zinc"]);
    expect(contexts["r2"]?.effectiveSupplements.map((item) => item.name)).toEqual(["NAC"]);
    expect(contexts["r3"]?.effectiveSupplements.map((item) => item.name)).toEqual(["Vitamin D3"]);
    expect(contexts["r4"]?.effectiveSupplements).toEqual([]);
    expect(contexts["r5"]?.effectiveSupplements.map((item) => item.name)).toEqual(["Vitamin D3"]);
    expect(contexts["r6"]?.effectiveState).toBe("unknown");
    expect(contexts["r7"]?.effectiveSupplements.map((item) => item.name)).toEqual(["Vitamin D3"]);
  });

  it("uses resolved report context when asking effective supplements", () => {
    const reports: LabReport[] = [
      mkReport({
        id: "ra",
        date: "2025-02-10",
        anchorState: "anchor",
        overrides: [
          {
            id: "oa",
            name: "NAC",
            dose: "600 mg",
            frequency: "daily",
            startDate: "2025-02-10",
            endDate: "2025-02-10"
          }
        ]
      }),
      mkReport({ id: "rb", date: "2025-03-10", anchorState: "inherit" })
    ];

    expect(getEffectiveSupplements(reports[1], timeline, reports).map((item) => item.name)).toEqual(["Vitamin D3"]);
  });

  it("returns the inherited context that will be used for the next report", () => {
    const reports: LabReport[] = [
      mkReport({ id: "r1", date: "2025-02-10", anchorState: "inherit" }),
      mkReport({
        id: "r2",
        date: "2025-03-10",
        anchorState: "anchor",
        overrides: [
          {
            id: "o1",
            name: "NAC",
            dose: "600 mg",
            frequency: "daily",
            startDate: "2025-03-10",
            endDate: "2025-03-10"
          }
        ]
      })
    ];

    const next = getCurrentInheritedSupplementContext(reports, timeline);
    expect(next.effectiveSupplements.map((item) => item.name)).toEqual(["Vitamin D3"]);
    expect(next.sourceAnchorReportId).toBeNull();
  });

  it("updates report supplements retroactively when supplement timeline changes", () => {
    const reports: LabReport[] = [mkReport({ id: "r1", date: "2025-02-20", anchorState: "inherit" })];
    const oldTimeline: SupplementPeriod[] = [
      {
        id: "s1",
        name: "Vitamin D3",
        dose: "2000 IU",
        frequency: "daily",
        startDate: "2025-01-01",
        endDate: null
      }
    ];
    const updatedTimeline: SupplementPeriod[] = [
      {
        id: "s1",
        name: "Vitamin D3",
        dose: "4000 IU",
        frequency: "daily",
        startDate: "2025-01-15",
        endDate: null
      }
    ];

    expect(getEffectiveSupplements(reports[0], oldTimeline, reports).map((item) => item.dose)).toEqual(["2000 IU"]);
    expect(getEffectiveSupplements(reports[0], updatedTimeline, reports).map((item) => item.dose)).toEqual(["4000 IU"]);
  });

  it("formats supplement text as readable stack string", () => {
    const report = mkReport({ id: "r-text", date: "2025-02-10", anchorState: "inherit" });
    const text = supplementPeriodsToText(getEffectiveSupplements(report, timeline, [report]));
    expect(text).toContain("Vitamin D3");
  });
});
