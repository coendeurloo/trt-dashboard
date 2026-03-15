// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import useAppData from "../hooks/useAppData";
import { coerceStoredAppData } from "../storage";
import { getReportProtocol } from "../protocolUtils";
import { todayIsoDate } from "../protocolVersions";

const makeMarker = (id: string) => ({
  id,
  marker: "Testosterone",
  canonicalMarker: "Testosterone",
  value: 20,
  unit: "nmol/L",
  referenceMin: null,
  referenceMax: null,
  abnormal: "normal" as const,
  confidence: 1
});

describe("useAppData protocol versions", () => {
  it("creates a new protocol version on edit with default effectiveFrom=today and keeps history date-aware", () => {
    const today = todayIsoDate();
    const initial = coerceStoredAppData({
      interventions: [
        {
          id: "protocol-1",
          name: "TRT base",
          items: [{ name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" }],
          compounds: [{ name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" }],
          notes: "base",
          createdAt: "2025-01-01T08:00:00.000Z",
          updatedAt: "2025-01-01T08:00:00.000Z"
        }
      ],
      reports: [
        {
          id: "report-old",
          sourceFileName: "old.pdf",
          testDate: "2025-02-01",
          createdAt: "2025-02-01T08:00:00.000Z",
          markers: [makeMarker("m-old")],
          annotations: {
            interventionId: "protocol-1",
            interventionLabel: "TRT base",
            protocolId: "protocol-1",
            protocol: "TRT base",
            supplementOverrides: null,
            symptoms: "",
            notes: "",
            samplingTiming: "trough"
          },
          extraction: { provider: "fallback", model: "unit-test", confidence: 1, needsReview: false }
        },
        {
          id: "report-today",
          sourceFileName: "today.pdf",
          testDate: today,
          createdAt: `${today}T08:00:00.000Z`,
          markers: [makeMarker("m-today")],
          annotations: {
            interventionId: "protocol-1",
            interventionLabel: "TRT base",
            protocolId: "protocol-1",
            protocol: "TRT base",
            supplementOverrides: null,
            symptoms: "",
            notes: "",
            samplingTiming: "trough"
          },
          extraction: { provider: "fallback", model: "unit-test", confidence: 1, needsReview: false }
        }
      ]
    });

    const { result } = renderHook(() =>
      useAppData({
        sharedData: initial,
        isShareMode: false
      })
    );

    act(() => {
      result.current.updateProtocol("protocol-1", {
        items: [
          { name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" },
          { name: "Human Growth Hormone (HGH)", dose: "1 IU/day", frequency: "daily", route: "SubQ" }
        ],
        compounds: [
          { name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" },
          { name: "Human Growth Hormone (HGH)", dose: "1 IU/day", frequency: "daily", route: "SubQ" }
        ],
        notes: "added HGH"
      });
    });

    const updatedProtocol = result.current.appData.protocols.find((protocol) => protocol.id === "protocol-1");
    expect(updatedProtocol?.versions).toHaveLength(2);
    expect(updatedProtocol?.versions?.[1]?.effectiveFrom).toBe(today);

    const oldReport = result.current.appData.reports.find((report) => report.id === "report-old");
    const todayReport = result.current.appData.reports.find((report) => report.id === "report-today");
    const oldResolved = oldReport ? getReportProtocol(oldReport, result.current.appData.protocols) : null;
    const todayResolved = todayReport ? getReportProtocol(todayReport, result.current.appData.protocols) : null;

    expect(oldResolved?.compounds.some((entry) => entry.name.includes("HGH"))).toBe(false);
    expect(todayResolved?.compounds.some((entry) => entry.name.includes("HGH"))).toBe(true);
  });
});
