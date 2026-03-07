/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import UploadPanel from "../components/UploadPanel";

describe("UploadPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders accessible dropzone guidance in idle state", () => {
    render(
      <UploadPanel
        isProcessing={false}
        processingStage={null}
        onFileSelected={vi.fn()}
        onUploadIntent={vi.fn()}
        language="en"
      />
    );

    expect(screen.queryByText("Processing steps")).toBeNull();
    expect(screen.getByText("Text PDFs work best. Scanned file? We'll use OCR.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Upload area for lab PDF/i })).toBeTruthy();
  });

  it("announces active processing stage and marks dropzone as busy", () => {
    render(
      <UploadPanel
        isProcessing
        processingStage="running_ocr"
        onFileSelected={vi.fn()}
        onUploadIntent={vi.fn()}
        language="en"
      />
    );

    const dropzone = screen.getByRole("button", {
      name: /PDF processing in progress\. Upload temporarily disabled\./i
    });
    expect(dropzone.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText(/Running local OCR on scans/i)).toBeTruthy();
  });
});
