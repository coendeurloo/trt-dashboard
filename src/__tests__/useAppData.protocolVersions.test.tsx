// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import useAppData from "../hooks/useAppData";
import { getReportProtocol } from "../protocolUtils";
import { coerceStoredAppData } from "../storage";
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

describe("useAppData protocol editing", () => {
  it("creates a new protocol id when editing a linked protocol in create_new mode", () => {
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
      }, "create_new");
    });

    expect(result.current.appData.protocols).toHaveLength(2);
    const oldProtocol = result.current.appData.protocols.find((protocol) => protocol.id === "protocol-1");
    const newProtocol = result.current.appData.protocols.find((protocol) => protocol.id !== "protocol-1");
    expect(oldProtocol?.compounds.some((entry) => entry.name.includes("HGH"))).toBe(false);
    expect(newProtocol?.compounds.some((entry) => entry.name.includes("HGH"))).toBe(true);
    expect(newProtocol?.versions?.[0]?.effectiveFrom).toBe(today);

    const oldReport = result.current.appData.reports.find((report) => report.id === "report-old");
    const todayReport = result.current.appData.reports.find((report) => report.id === "report-today");
    const oldResolved = oldReport ? getReportProtocol(oldReport, result.current.appData.protocols) : null;
    const todayResolved = todayReport ? getReportProtocol(todayReport, result.current.appData.protocols) : null;

    expect(oldResolved?.compounds.some((entry) => entry.name.includes("HGH"))).toBe(false);
    expect(todayResolved?.compounds.some((entry) => entry.name.includes("HGH"))).toBe(false);
  });

  it("replaces existing protocol and clears report snapshots in replace_existing mode", () => {
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
          id: "report-1",
          sourceFileName: "first.pdf",
          testDate: "2025-02-01",
          createdAt: "2025-02-01T08:00:00.000Z",
          markers: [makeMarker("m-1")],
          annotations: {
            interventionId: "protocol-1",
            interventionLabel: "TRT base",
            interventionVersionId: "version-old",
            interventionSnapshot: {
              interventionId: "protocol-1",
              versionId: "version-old",
              name: "TRT base custom",
              items: [{ name: "Testosterone Enanthate", dose: "90 mg/week", frequency: "2x_week", route: "SubQ" }],
              compounds: [{ name: "Testosterone Enanthate", dose: "90 mg/week", frequency: "2x_week", route: "SubQ" }],
              notes: "custom snapshot",
              effectiveFrom: "2025-01-01"
            },
            protocolId: "protocol-1",
            protocolVersionId: "version-old",
            protocol: "TRT base custom",
            supplementOverrides: null,
            symptoms: "",
            notes: "",
            samplingTiming: "trough"
          },
          extraction: { provider: "fallback", model: "unit-test", confidence: 1, needsReview: false }
        },
        {
          id: "report-2",
          sourceFileName: "second.pdf",
          testDate: "2025-03-01",
          createdAt: "2025-03-01T08:00:00.000Z",
          markers: [makeMarker("m-2")],
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
        name: "TRT base + HGH",
        items: [
          { name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" },
          { name: "Human Growth Hormone (HGH)", dose: "1 IU/day", frequency: "daily", route: "SubQ" }
        ],
        compounds: [
          { name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" },
          { name: "Human Growth Hormone (HGH)", dose: "1 IU/day", frequency: "daily", route: "SubQ" }
        ],
        notes: "retroactive update",
        effectiveFrom: "2025-03-02"
      }, "replace_existing");
    });

    expect(result.current.appData.protocols).toHaveLength(1);
    expect(result.current.appData.protocols[0]?.id).toBe("protocol-1");
    expect(result.current.appData.protocols[0]?.name).toBe("TRT base + HGH");
    expect(result.current.appData.protocols[0]?.compounds.some((entry) => entry.name.includes("HGH"))).toBe(true);

    result.current.appData.reports.forEach((entry) => {
      expect(entry.annotations.interventionId).toBe("protocol-1");
      expect(entry.annotations.protocolId).toBe("protocol-1");
      expect(entry.annotations.interventionLabel).toBe("TRT base + HGH");
      expect(entry.annotations.protocol).toBe("TRT base + HGH");
      expect(entry.annotations.interventionSnapshot).toBeNull();
      expect(entry.annotations.interventionVersionId).toBeNull();
      expect(entry.annotations.protocolVersionId).toBeNull();
    });

    const resolvedProtocols = result.current.appData.reports.map((entry) => getReportProtocol(entry, result.current.appData.protocols));
    expect(resolvedProtocols.every((entry) => entry?.name === "TRT base + HGH")).toBe(true);
    expect(resolvedProtocols.every((entry) => entry?.compounds.some((compound) => compound.name.includes("HGH")))).toBe(true);
  });

  it("updates protocol in place when no reports are linked", () => {
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
      reports: []
    });

    const { result } = renderHook(() =>
      useAppData({
        sharedData: initial,
        isShareMode: false
      })
    );

    act(() => {
      result.current.updateProtocol("protocol-1", {
        name: "TRT updated",
        items: [{ name: "Human Growth Hormone (HGH)", dose: "1 IU/day", frequency: "daily", route: "SubQ" }],
        compounds: [{ name: "Human Growth Hormone (HGH)", dose: "1 IU/day", frequency: "daily", route: "SubQ" }],
        notes: "updated",
        effectiveFrom: "2025-02-01"
      });
    });

    expect(result.current.appData.protocols).toHaveLength(1);
    const updatedProtocol = result.current.appData.protocols.find((protocol) => protocol.id === "protocol-1");
    expect(updatedProtocol?.versions).toHaveLength(1);
    expect(updatedProtocol?.name).toBe("TRT updated");
    expect(updatedProtocol?.compounds.some((entry) => entry.name.includes("HGH"))).toBe(true);
  });
});
