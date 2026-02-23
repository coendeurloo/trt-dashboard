/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExtractionComparisonModal from "../components/ExtractionComparisonModal";
import { ExtractionDiffSummary } from "../types";

const summary: ExtractionDiffSummary = {
  local: {
    markerCount: 4,
    confidence: 0.58,
    warnings: ["PDF_LOW_CONFIDENCE_LOCAL"]
  },
  ai: {
    markerCount: 6,
    confidence: 0.74,
    warnings: []
  },
  localTestDate: "2026-02-19",
  aiTestDate: "2026-02-20",
  testDateChanged: true,
  added: [
    {
      canonicalMarker: "SHBG",
      marker: "SHBG",
      ai: {
        marker: "SHBG",
        canonicalMarker: "SHBG",
        value: 33,
        unit: "nmol/L",
        referenceMin: 10,
        referenceMax: 70,
        confidence: 0.85
      }
    }
  ],
  removed: [
    {
      canonicalMarker: "Ferritine",
      marker: "Ferritine",
      local: {
        marker: "Ferritine",
        canonicalMarker: "Ferritine",
        value: 120,
        unit: "ug/L",
        referenceMin: 20,
        referenceMax: 300,
        confidence: 0.7
      }
    }
  ],
  changed: [
    {
      canonicalMarker: "Testosterone",
      marker: "Testosterone",
      changedFields: ["value", "referenceMax"],
      local: {
        marker: "Testosterone",
        canonicalMarker: "Testosterone",
        value: 18,
        unit: "nmol/L",
        referenceMin: 8,
        referenceMax: 30,
        confidence: 0.6
      },
      ai: {
        marker: "Testosterone",
        canonicalMarker: "Testosterone",
        value: 21,
        unit: "nmol/L",
        referenceMin: 8,
        referenceMax: 29,
        confidence: 0.87
      }
    }
  ],
  hasChanges: true
};

describe("ExtractionComparisonModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders local vs AI summary and marker differences", () => {
    render(
      <ExtractionComparisonModal
        open
        language="en"
        summary={summary}
        onKeepLocal={vi.fn()}
        onApplyAi={vi.fn()}
      />
    );

    expect(screen.getByText(/Compare local result with AI result/i)).toBeTruthy();
    expect(screen.getByText(/^Added$/i)).toBeTruthy();
    expect(screen.getByText(/^Changed$/i)).toBeTruthy();
    expect(screen.getByText(/^Removed$/i)).toBeTruthy();
    expect(screen.getByText(/SHBG/i)).toBeTruthy();
    expect(screen.getAllByText(/Testosterone/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Ferritine/i)).toBeTruthy();
  });

  it("invokes keep/apply callbacks", () => {
    const onKeepLocal = vi.fn();
    const onApplyAi = vi.fn();

    render(
      <ExtractionComparisonModal
        open
        language="en"
        summary={summary}
        onKeepLocal={onKeepLocal}
        onApplyAi={onApplyAi}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Keep current version/i })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /Apply AI result/i })[0]);

    expect(onKeepLocal).toHaveBeenCalledTimes(1);
    expect(onApplyAi).toHaveBeenCalledTimes(1);
  });
});
