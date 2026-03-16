/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { todayIsoDate } from "../protocolVersions";
import { LabReport, Protocol, ProtocolUpdateMode } from "../types";
import ProtocolView from "../views/ProtocolView";

const protocol: Protocol = {
  id: "protocol-1",
  name: "TRT base",
  items: [{ name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" }],
  compounds: [{ name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" }],
  versions: [
    {
      id: "version-1",
      name: "TRT base",
      effectiveFrom: "2025-01-01",
      items: [{ name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" }],
      compounds: [{ name: "Testosterone Enanthate", dose: "105 mg/week", frequency: "2x_week", route: "SubQ" }],
      notes: "base",
      createdAt: "2025-01-01T08:00:00.000Z"
    }
  ],
  notes: "base",
  createdAt: "2025-01-01T08:00:00.000Z",
  updatedAt: "2025-01-01T08:00:00.000Z"
};

const report: LabReport = {
  id: "report-1",
  sourceFileName: "lab.pdf",
  testDate: "2025-02-01",
  createdAt: "2025-02-01T08:00:00.000Z",
  markers: [
    {
      id: "m-1",
      marker: "Testosterone",
      canonicalMarker: "Testosterone",
      value: 20,
      unit: "nmol/L",
      referenceMin: null,
      referenceMax: null,
      abnormal: "normal",
      confidence: 1
    }
  ],
  annotations: {
    interventionId: "protocol-1",
    interventionLabel: "TRT base",
    protocolId: "protocol-1",
    protocol: "TRT base",
    supplementAnchorState: "inherit",
    supplementOverrides: null,
    symptoms: "",
    notes: "",
    samplingTiming: "trough"
  },
  extraction: {
    provider: "fallback",
    model: "unit-test",
    confidence: 1,
    needsReview: false
  }
};

const renderProtocolView = ({
  onUpdateProtocol,
  protocols = [protocol],
  reports = [report],
  usageCount = 1
}: {
  onUpdateProtocol?: (
    id: string,
    updates: Partial<Protocol> & { effectiveFrom?: string },
    mode?: ProtocolUpdateMode
  ) => void;
  protocols?: Protocol[];
  reports?: LabReport[];
  usageCount?: number;
} = {}) =>
  render(
    <ProtocolView
      protocols={protocols}
      reports={reports}
      language="en"
      userProfile="trt"
      isShareMode={false}
      onAddProtocol={vi.fn()}
      onUpdateProtocol={onUpdateProtocol ?? vi.fn()}
      onDeleteProtocol={vi.fn(() => true)}
      getProtocolUsageCount={vi.fn(() => usageCount)}
    />
  );

describe("ProtocolView modal behavior", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not close the protocol editor on outside click", () => {
    renderProtocolView();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(screen.getByRole("heading", { name: "Edit protocol" })).toBeTruthy();

    const overlay = document.querySelector(".app-modal-overlay");
    expect(overlay).toBeTruthy();
    if (overlay) {
      fireEvent.click(overlay);
    }

    expect(screen.getByRole("heading", { name: "Edit protocol" })).toBeTruthy();
  });

  it("asks confirmation on close when draft is dirty", () => {
    renderProtocolView();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    fireEvent.change(screen.getByLabelText("Protocol name"), {
      target: { value: "TRT adjusted" }
    });

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Edit protocol" })).toBeTruthy();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Edit protocol" })).toBeNull();
    confirmSpy.mockRestore();
  });

  it("shows save warning with linked reports and defaults to create_new", () => {
    const onUpdateProtocol = vi.fn();
    renderProtocolView({ onUpdateProtocol, usageCount: 1, reports: [report] });

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("heading", { name: "This protocol is already in use" })).toBeTruthy();
    expect(screen.getByText("lab.pdf")).toBeTruthy();
    const saveChoiceModal = document.querySelector(".protocol-save-choice-modal");
    expect(saveChoiceModal).toBeTruthy();
    expect(saveChoiceModal?.classList.contains("app-modal-shell")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Create new protocol" }));
    expect(onUpdateProtocol).toHaveBeenCalledTimes(1);
    expect(onUpdateProtocol.mock.calls[0]?.[0]).toBe("protocol-1");
    expect(onUpdateProtocol.mock.calls[0]?.[1]).toMatchObject({
      effectiveFrom: todayIsoDate()
    });
    expect(onUpdateProtocol.mock.calls[0]?.[2]).toBe("create_new");
  });

  it("updates in-place immediately when there are no linked reports", () => {
    const onUpdateProtocol = vi.fn();
    renderProtocolView({ onUpdateProtocol, usageCount: 0, reports: [] });

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.queryByRole("heading", { name: "This protocol is already in use" })).toBeNull();
    expect(onUpdateProtocol).toHaveBeenCalledTimes(1);
    expect(onUpdateProtocol.mock.calls[0]?.[2]).toBe("replace_existing");
  });
});

describe("ProtocolView ordering", () => {
  afterEach(() => {
    cleanup();
  });

  it("uses newest protocol as active, shows a single active badge, and keeps oldest last", () => {
    const protocols: Protocol[] = [
      {
        ...protocol,
        id: "older",
        name: "Older protocol",
        createdAt: "2025-01-10T08:00:00.000Z",
        updatedAt: "2025-01-10T08:00:00.000Z"
      },
      {
        ...protocol,
        id: "active-newest",
        name: "Newest protocol",
        createdAt: "2025-03-10T08:00:00.000Z",
        updatedAt: "2025-03-10T08:00:00.000Z"
      },
      {
        ...protocol,
        id: "oldest",
        name: "Oldest protocol",
        createdAt: "2024-01-10T08:00:00.000Z",
        updatedAt: "2024-01-10T08:00:00.000Z"
      }
    ];

    renderProtocolView({
      protocols,
      reports: [],
      usageCount: 0
    });

    const headings = screen.getAllByRole("heading", { level: 4 }).map((node) => node.textContent?.trim());
    expect(headings[0]).toBe("Newest protocol");
    expect(headings[headings.length - 1]).toBe("Oldest protocol");

    const activeBadges = screen.getAllByText("Active");
    expect(activeBadges).toHaveLength(1);
  });
});
