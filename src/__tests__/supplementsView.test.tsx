/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SupplementsView from "../views/SupplementsView";
import { LabReport, SupplementPeriod } from "../types";

if (!("scrollIntoView" in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: () => undefined
  });
}

const baseReport: LabReport = {
  id: "r-1",
  sourceFileName: "demo.pdf",
  testDate: "2026-01-25",
  createdAt: "2026-01-25T08:00:00.000Z",
  markers: [],
  annotations: {
    protocolId: null,
    protocol: "",
    supplementOverrides: null,
    symptoms: "",
    notes: "",
    samplingTiming: "unknown"
  },
  extraction: {
    provider: "fallback",
    model: "demo-data",
    confidence: 1,
    needsReview: false
  }
};

const buildProps = (timeline: SupplementPeriod[] = []) => ({
  language: "en" as const,
  reports: [baseReport],
  timeline,
  resolvedSupplementContexts: {},
  isShareMode: false,
  onAddSupplementPeriod: vi.fn(),
  onUpdateSupplementPeriod: vi.fn(),
  onStopSupplement: vi.fn(),
  onDeleteSupplementPeriod: vi.fn(),
  onOpenReportForSupplementBackfill: vi.fn()
});

describe("SupplementsView UX feedback", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("focuses add form, validates required fields, and shows success feedback on save", () => {
    const props = buildProps();
    const scrollSpy = vi.spyOn(HTMLElement.prototype, "scrollIntoView");
    vi.useFakeTimers();
    render(<SupplementsView {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Add supplement" }));
    vi.runAllTimers();

    const nameInput = screen.getByPlaceholderText("Search or type supplement");
    expect(scrollSpy).toHaveBeenCalled();
    expect(document.activeElement).toBe(nameInput);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Please enter a supplement name.")).toBeTruthy();
    expect(props.onAddSupplementPeriod).not.toHaveBeenCalled();

    fireEvent.change(nameInput, {
      target: { value: "Vitamin D3" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(props.onAddSupplementPeriod).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Vitamin D3 added to your active stack.")).toBeTruthy();
  });

  it("asks for a stop date when deleting from the active list", () => {
    const timeline: SupplementPeriod[] = [
      {
        id: "supp-1",
        name: "Vitamin D3",
        dose: "2000 IU",
        frequency: "daily",
        startDate: "2026-01-01",
        endDate: null
      }
    ];
    const props = buildProps(timeline);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T09:00:00.000Z"));
    render(<SupplementsView {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(screen.getByText("Stop supplement")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop on selected date" }));

    expect(props.onStopSupplement).toHaveBeenCalledWith("supp-1", "2026-03-15");
    expect(props.onDeleteSupplementPeriod).not.toHaveBeenCalled();
  });

  it("supports editing rows in supplement history", () => {
    const timeline: SupplementPeriod[] = [
      {
        id: "supp-hist-1",
        name: "Vitamin D3",
        dose: "2000 IU",
        frequency: "daily",
        startDate: "2026-01-01",
        endDate: "2026-02-15"
      }
    ];
    const props = buildProps(timeline);
    render(<SupplementsView {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByPlaceholderText("Dose"), {
      target: { value: "3000 IU" }
    });
    fireEvent.change(screen.getByDisplayValue("2026-02-15"), {
      target: { value: "2026-02-20" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(props.onUpdateSupplementPeriod).toHaveBeenCalledWith("supp-hist-1", {
      dose: "3000 IU",
      frequency: "daily",
      startDate: "2026-01-01",
      endDate: "2026-02-20"
    });
  });

  it("shows a labeled cancel action while editing a supplement", () => {
    const timeline: SupplementPeriod[] = [
      {
        id: "supp-1",
        name: "Vitamin D3",
        dose: "2000 IU",
        frequency: "daily",
        startDate: "2026-01-01",
        endDate: null
      }
    ];
    const props = buildProps(timeline);
    render(<SupplementsView {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit dose" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });
});
