import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { __pdfParsingInternals } from "../pdfParsing";

type RegistryRow = {
  fileId: string;
  label: string;
  batch: string;
  sourceType: string;
  vendor: string;
  status: string;
  fixturePath: string;
  notes: string;
};

type FixtureExpected = {
  minimumConfidence: number;
  expectedStrategy?: "template" | "heuristic" | "ai_fallback";
  expectedDate?: string;
  forbiddenMarkers?: string[];
  maxMissingFields?: number;
  requiredMarkers: Array<{
    canonicalMarker: string;
    unit?: string;
    referenceMin?: number;
    referenceMax?: number;
  }>;
};

const REGISTRY_PATH = path.resolve(process.cwd(), "docs/parser-batch-registry.md");
const batch = process.env.PARSER_BATCH_ID ?? "B01";
const shouldWriteReport = process.env.PARSER_BATCH_REPORT_WRITE === "1";
const outputPath =
  process.env.PARSER_BATCH_REPORT_OUT ?? path.resolve(process.cwd(), "docs", `parser-batch-report-${batch.toLowerCase()}.json`);

const splitCells = (line: string): string[] => line.split("|").map((cell) => cell.trim()).slice(1, -1);

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
    .map((line) => splitCells(line))
    .filter((cells) => cells.length === 8)
    .map((cells) => ({
      fileId: cells[0] ?? "",
      label: cells[1] ?? "",
      batch: cells[2] ?? "",
      sourceType: cells[3] ?? "",
      vendor: cells[4] ?? "",
      status: cells[5] ?? "",
      fixturePath: cells[6] ?? "",
      notes: cells[7] ?? ""
    }));
};

const toPercent = (value: number): string => `${(value * 100).toFixed(1)}%`;

describe("parser batch report", () => {
  it(`computes scorecard metrics for ${batch}`, () => {
    const rows = parseRegistryRows().filter((row) => row.batch === batch && row.status !== "skipped");
    expect(rows.length).toBeGreaterThan(0);

    const aggregate = {
      files: rows.length,
      requiredTotal: 0,
      requiredFound: 0,
      unitsTotal: 0,
      unitsCorrect: 0,
      rangesTotal: 0,
      rangesCorrect: 0,
      datesTotal: 0,
      datesCorrect: 0,
      forbiddenHits: 0,
      parsedMarkersTotal: 0,
      unknownLayoutCount: 0
    };

    const fileBreakdown = rows.map((row) => {
      const fixtureDir = path.resolve(process.cwd(), row.fixturePath);
      const input = readFileSync(path.join(fixtureDir, "input.txt"), "utf8");
      const expected = JSON.parse(readFileSync(path.join(fixtureDir, "expected.json"), "utf8")) as FixtureExpected;
      const parsed = __pdfParsingInternals.fallbackExtractDetailed(input, `${row.label}.txt`).draft;

      const parsedMarkers = parsed.markers;
      const parsedByCanonical = new Map(parsedMarkers.map((marker) => [marker.canonicalMarker, marker]));
      const foundCanonicalMarkers = Array.from(new Set(parsedMarkers.map((marker) => marker.canonicalMarker))).sort((a, b) =>
        a.localeCompare(b)
      );
      const missingRequiredMarkers = expected.requiredMarkers
        .map((marker) => marker.canonicalMarker)
        .filter((canonicalMarker) => !parsedByCanonical.has(canonicalMarker));
      const requiredFound = expected.requiredMarkers.filter((marker) => parsedByCanonical.has(marker.canonicalMarker)).length;
      const forbiddenSet = new Set((expected.forbiddenMarkers ?? []).map((marker) => marker.toLowerCase()));
      const forbiddenHits = parsedMarkers.filter((marker) => {
        const raw = marker.marker.trim().toLowerCase();
        const canonical = marker.canonicalMarker.trim().toLowerCase();
        return forbiddenSet.has(raw) || forbiddenSet.has(canonical);
      }).length;

      const unitExpected = expected.requiredMarkers.filter((marker) => typeof marker.unit === "string" && marker.unit.length > 0);
      const unitCorrect = unitExpected.filter((marker) => {
        const parsedMarker = parsedByCanonical.get(marker.canonicalMarker);
        return parsedMarker?.unit === marker.unit;
      }).length;

      const rangeExpected = expected.requiredMarkers.filter(
        (marker) => typeof marker.referenceMin === "number" || typeof marker.referenceMax === "number"
      );
      const rangeCorrect = rangeExpected.filter((marker) => {
        const parsedMarker = parsedByCanonical.get(marker.canonicalMarker);
        if (!parsedMarker) {
          return false;
        }
        const minOk =
          typeof marker.referenceMin !== "number" || Math.abs((parsedMarker.referenceMin ?? Number.NaN) - marker.referenceMin) < 1e-3;
        const maxOk =
          typeof marker.referenceMax !== "number" || Math.abs((parsedMarker.referenceMax ?? Number.NaN) - marker.referenceMax) < 1e-3;
        return minOk && maxOk;
      }).length;

      const warningCodes = (parsed.extraction.warnings ?? [])
        .map((warning) => (typeof warning === "string" ? warning : warning?.code ?? ""))
        .filter(Boolean);
      const unknownLayout = warningCodes.includes("PDF_UNKNOWN_LAYOUT");
      const dateExpected = typeof expected.expectedDate === "string" && expected.expectedDate.length > 0;
      const dateCorrect = dateExpected ? parsed.testDate === expected.expectedDate : false;

      aggregate.requiredTotal += expected.requiredMarkers.length;
      aggregate.requiredFound += requiredFound;
      aggregate.unitsTotal += unitExpected.length;
      aggregate.unitsCorrect += unitCorrect;
      aggregate.rangesTotal += rangeExpected.length;
      aggregate.rangesCorrect += rangeCorrect;
      aggregate.datesTotal += dateExpected ? 1 : 0;
      aggregate.datesCorrect += dateCorrect ? 1 : 0;
      aggregate.forbiddenHits += forbiddenHits;
      aggregate.parsedMarkersTotal += parsedMarkers.length;
      aggregate.unknownLayoutCount += unknownLayout ? 1 : 0;

      return {
        fileId: row.fileId,
        label: row.label,
        status: row.status,
        requiredMarkers: expected.requiredMarkers.length,
        requiredFound,
        parsedMarkers: parsedMarkers.length,
        foundCanonicalMarkers,
        missingRequiredMarkers,
        confidence: Number(parsed.extraction.confidence.toFixed(3)),
        unknownLayout,
        forbiddenHits
      };
    });

    const requiredRecall = aggregate.requiredTotal > 0 ? aggregate.requiredFound / aggregate.requiredTotal : 1;
    const unitAccuracy = aggregate.unitsTotal > 0 ? aggregate.unitsCorrect / aggregate.unitsTotal : null;
    const rangeAccuracy = aggregate.rangesTotal > 0 ? aggregate.rangesCorrect / aggregate.rangesTotal : null;
    const dateAccuracy = aggregate.datesTotal > 0 ? aggregate.datesCorrect / aggregate.datesTotal : null;
    const falsePositiveRate = aggregate.parsedMarkersTotal > 0 ? aggregate.forbiddenHits / aggregate.parsedMarkersTotal : 0;
    const unknownLayoutRate = aggregate.files > 0 ? aggregate.unknownLayoutCount / aggregate.files : 0;

    const report = {
      batch,
      generatedAt: new Date().toISOString(),
      aggregate: {
        files: aggregate.files,
        requiredMarkerRecall: {
          value: requiredRecall,
          display: toPercent(requiredRecall),
          numerator: aggregate.requiredFound,
          denominator: aggregate.requiredTotal
        },
        unitAccuracy: unitAccuracy === null ? null : { value: unitAccuracy, display: toPercent(unitAccuracy) },
        referenceRangeAccuracy: rangeAccuracy === null ? null : { value: rangeAccuracy, display: toPercent(rangeAccuracy) },
        dateAccuracy: dateAccuracy === null ? null : { value: dateAccuracy, display: toPercent(dateAccuracy) },
        falsePositiveRate: {
          value: falsePositiveRate,
          display: toPercent(falsePositiveRate),
          numerator: aggregate.forbiddenHits,
          denominator: aggregate.parsedMarkersTotal
        },
        unknownLayoutRate: {
          value: unknownLayoutRate,
          display: toPercent(unknownLayoutRate),
          numerator: aggregate.unknownLayoutCount,
          denominator: aggregate.files
        }
      },
      files: fileBreakdown
    };

    if (shouldWriteReport) {
      mkdirSync(path.dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    }

    // Keep test green; this test is for reporting, not gating.
    expect(report.aggregate.files).toBe(rows.length);
  });
});
