import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("AI model policy", () => {
  it("does not keep deprecated model ids in AI selection code", () => {
    const projectRoot = process.cwd();
    const selectionFiles = [
      "src/aiAnalysis.ts",
      "src/pdfParsing.ts",
      "server/gemini/extract.ts",
      "scripts/vite-claude-proxy.mjs",
      "scripts/serve-dist.mjs"
    ];
    const selectionCode = selectionFiles
      .map((filePath) => readFileSync(path.join(projectRoot, filePath), "utf8"))
      .join("\n");

    expect(selectionCode).toContain("claude-sonnet-4-6");
    expect(selectionCode).toContain("gemini-2.5-flash");
    expect(selectionCode).not.toContain("claude-3-7-sonnet");
    expect(selectionCode).not.toContain("claude-3-5-sonnet");
    expect(selectionCode).not.toContain("gemini-2.0-flash");
  });
});
