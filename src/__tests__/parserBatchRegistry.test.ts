import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type RegistryStatus = "selected" | "clustered" | "templated" | "fixture_done" | "validated" | "skipped";

interface RegistryRow {
  fileId: string;
  label: string;
  batch: string;
  sourceType: string;
  vendor: string;
  status: RegistryStatus;
  fixturePath: string;
  notes: string;
}

const REGISTRY_PATH = path.resolve(process.cwd(), "docs/parser-batch-registry.md");
const VALID_STATUSES = new Set<RegistryStatus>(["selected", "clustered", "templated", "fixture_done", "validated", "skipped"]);

const parseRegistryRows = (): RegistryRow[] => {
  const text = readFileSync(REGISTRY_PATH, "utf8");
  const lines = text.split(/\r?\n/);
  const sectionIndex = lines.findIndex((line) => line.trim() === "## Registry Entries");
  if (sectionIndex < 0) {
    throw new Error("Registry section '## Registry Entries' not found.");
  }

  const tableLines = lines
    .slice(sectionIndex + 1)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));

  if (tableLines.length < 3) {
    throw new Error("Registry table is empty or malformed.");
  }

  return tableLines
    .slice(2)
    .map((line) => line.split("|").map((cell) => cell.trim()).slice(1, -1))
    .filter((cells) => cells.length === 8)
    .map((cells) => ({
      fileId: cells[0] ?? "",
      label: cells[1] ?? "",
      batch: cells[2] ?? "",
      sourceType: cells[3] ?? "",
      vendor: cells[4] ?? "",
      status: (cells[5] ?? "") as RegistryStatus,
      fixturePath: cells[6] ?? "",
      notes: cells[7] ?? ""
    }));
};

describe("parser batch registry", () => {
  const rows = parseRegistryRows();

  it("uses valid row shape and status values", () => {
    expect(rows.length).toBeGreaterThan(0);

    rows.forEach((row) => {
      expect(row.fileId).toMatch(/^[a-f0-9]{12}$/);
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.batch).toMatch(/^B\d{2}$/);
      expect(row.sourceType.length).toBeGreaterThan(0);
      expect(row.vendor.length).toBeGreaterThan(0);
      expect(VALID_STATUSES.has(row.status)).toBe(true);
      expect(row.fixturePath.length).toBeGreaterThan(0);
    });
  });

  it("enforces no duplicate active file_id across batches", () => {
    const byFileId = new Map<string, RegistryRow[]>();
    rows.forEach((row) => {
      const current = byFileId.get(row.fileId) ?? [];
      current.push(row);
      byFileId.set(row.fileId, current);
    });

    byFileId.forEach((group, fileId) => {
      if (group.length === 1) {
        return;
      }
      const active = group.filter((row) => row.status !== "skipped");
      const skipped = group.filter((row) => row.status === "skipped");
      expect(active.length, `file_id ${fileId} appears multiple times with active statuses`).toBe(1);
      skipped.forEach((row) => {
        expect(row.notes, `Skipped duplicate ${fileId} must include a reason in notes`).not.toBe("-");
      });
    });
  });

  it("keeps active batch size within the 12-file protocol", () => {
    const activeByBatch = new Map<string, number>();
    rows
      .filter((row) => row.status !== "skipped")
      .forEach((row) => {
        activeByBatch.set(row.batch, (activeByBatch.get(row.batch) ?? 0) + 1);
      });

    activeByBatch.forEach((count, batch) => {
      expect(count, `Batch ${batch} exceeds 12 active files`).toBeLessThanOrEqual(12);
    });
  });
});
