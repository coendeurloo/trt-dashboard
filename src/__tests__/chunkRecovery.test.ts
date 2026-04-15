import { describe, expect, it } from "vitest";
import { isLikelyChunkLoadError } from "../chunkRecovery";

describe("isLikelyChunkLoadError", () => {
  it("detects dynamic import fetch failures", () => {
    expect(
      isLikelyChunkLoadError(new TypeError("Failed to fetch dynamically imported module: /assets/ReportsView.js"))
    ).toBe(true);
  });

  it("detects module script import failures", () => {
    expect(isLikelyChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
  });

  it("detects react lazy fallback errors for undefined default export", () => {
    const error = new TypeError("Cannot read properties of undefined (reading 'default')");
    error.stack = "TypeError: ...\n at T (react.production.min.js:1:1)";
    expect(isLikelyChunkLoadError(error)).toBe(true);
  });

  it("does not classify normal runtime errors as chunk load failures", () => {
    expect(isLikelyChunkLoadError(new Error("Network request failed: 500"))).toBe(false);
  });
});

