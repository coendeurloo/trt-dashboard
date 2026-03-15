/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProtocolView from "../views/ProtocolView";
import { LabReport, Protocol } from "../types";
import { todayIsoDate } from "../protocolVersions";

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

const renderProtocolView = (onUpdateProtocol = vi.fn()) =>
  render(
    <ProtocolView
      protocols={[protocol]}
      reports={[report]}
      language="en"
      userProfile="trt"
      isShareMode={false}
      onAddProtocol={vi.fn()}
      onUpdateProtocol={onUpdateProtocol}
      onDeleteProtocol={vi.fn(() => true)}
      getProtocolUsageCount={vi.fn(() => 1)}
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

  it("sends default effectiveFrom=today when saving an edit", () => {
    const onUpdateProtocol = vi.fn();
    renderProtocolView(onUpdateProtocol);

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onUpdateProtocol).toHaveBeenCalledTimes(1);
    expect(onUpdateProtocol.mock.calls[0]?.[0]).toBe("protocol-1");
    expect(onUpdateProtocol.mock.calls[0]?.[1]).toMatchObject({
      effectiveFrom: todayIsoDate()
    });
    expect(screen.queryByRole("heading", { name: "How do you want to save?" })).toBeNull();
  });
});
