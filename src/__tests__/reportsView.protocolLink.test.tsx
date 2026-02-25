/* @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../constants";
import ReportsView from "../views/ReportsView";
import { AppSettings, LabReport, Protocol, ReportAnnotations } from "../types";

const defaultAnnotations: ReportAnnotations = {
  protocolId: null,
  protocol: "",
  supplementOverrides: null,
  symptoms: "",
  notes: "",
  samplingTiming: "unknown"
};

const report: LabReport = {
  id: "r-1",
  sourceFileName: "labrapport.pdf",
  testDate: "2024-03-19",
  createdAt: "2024-03-19T08:00:00.000Z",
  markers: [],
  annotations: defaultAnnotations,
  extraction: {
    provider: "fallback",
    model: "manual",
    confidence: 1,
    needsReview: false
  }
};

const renderView = (protocols: Protocol[]) => {
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    language: "en"
  };
  const onOpenProtocolTab = vi.fn();
  render(
    <ReportsView
      reports={[report]}
      protocols={protocols}
      supplementTimeline={[]}
      settings={settings}
      language="en"
      samplingControlsEnabled={false}
      isShareMode={false}
      onDeleteReport={vi.fn()}
      onDeleteReports={vi.fn()}
      onUpdateReportAnnotations={vi.fn()}
      onSetBaseline={vi.fn()}
      onRenameMarker={vi.fn()}
      onOpenProtocolTab={onOpenProtocolTab}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "Expand" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit details" }));

  return { onOpenProtocolTab };
};

describe("ReportsView protocol linking", () => {
  it("shows a protocol dropdown and clear guidance when no protocol exists", () => {
    const { onOpenProtocolTab } = renderView([]);

    expect(screen.getByRole("option", { name: "No linked protocol" })).toBeTruthy();
    expect(screen.getByText(/No protocol exists yet\./i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open Protocols" }));
    expect(onOpenProtocolTab).toHaveBeenCalledTimes(1);
  });

  it("includes existing protocols as selectable options", () => {
    renderView([
      {
        id: "p-1",
        name: "TRT Cypionate 120mg",
        compounds: [],
        notes: "",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z"
      }
    ]);

    expect(screen.getByRole("option", { name: "TRT Cypionate 120mg" })).toBeTruthy();
  });
});
