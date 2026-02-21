import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { __pdfParsingInternals } from "../pdfParsing";

type ParserFixtureStrategy = "template" | "heuristic" | "ai_fallback";

interface FixtureExpectation {
  minimumConfidence: number;
  expectedStrategy?: ParserFixtureStrategy;
  expectedDate?: string;
  forbiddenMarkers?: string[];
  maxMissingFields?: number;
  requiredMarkers: Array<{
    canonicalMarker: string;
    unit?: string;
    referenceMin?: number;
    referenceMax?: number;
  }>;
}

const fixtureRoot = path.resolve(process.cwd(), "tests/parser-fixtures/text");
const fixtureNames = readdirSync(fixtureRoot).filter((entry) => !entry.startsWith("."));
const CORE_MARKERS = new Set(["Testosterone", "Free Testosterone", "Estradiol", "SHBG", "Hematocrit"]);

const deriveStrategy = (model: string, provider: string): ParserFixtureStrategy => {
  if (provider === "gemini") {
    return "ai_fallback";
  }
  const normalizedModel = model.trim().toLowerCase();
  if (normalizedModel.startsWith("template:") || normalizedModel.includes("template-")) {
    return "template";
  }
  return "heuristic";
};

const deriveMissingFields = (result: ReturnType<typeof __pdfParsingInternals.fallbackExtractDetailed>): string[] => {
  const missing: string[] = [];
  const markers = result.draft.markers;

  if (!result.draft.testDate) {
    missing.push("missing_test_date");
  }

  if (markers.length === 0) {
    missing.push("missing_all_markers");
    return missing;
  }

  const unitCoverage = markers.filter((marker) => marker.unit.trim().length > 0).length / markers.length;
  if (unitCoverage < 0.85) {
    missing.push("missing_units");
  }

  const referenceCoverage =
    markers.filter((marker) => marker.referenceMin !== null || marker.referenceMax !== null).length / markers.length;
  if (referenceCoverage < 0.5) {
    missing.push("missing_reference_ranges");
  }

  const coreCount = markers.filter((marker) => CORE_MARKERS.has(marker.canonicalMarker)).length;
  if (coreCount < 2) {
    missing.push("missing_core_markers");
  }

  return missing;
};

describe("parser fixtures", () => {
  for (const fixtureName of fixtureNames) {
    it(`parses fixture: ${fixtureName}`, () => {
      const base = path.join(fixtureRoot, fixtureName);
      const input = readFileSync(path.join(base, "input.txt"), "utf8");
      const expected = JSON.parse(readFileSync(path.join(base, "expected.json"), "utf8")) as FixtureExpectation;

      const result = __pdfParsingInternals.fallbackExtractDetailed(input, `${fixtureName}.txt`);

      expect(result.draft.markers.length).toBeGreaterThan(0);
      expect(result.draft.extraction.confidence).toBeGreaterThanOrEqual(expected.minimumConfidence);
      if (expected.expectedStrategy) {
        expect(
          deriveStrategy(result.draft.extraction.model, result.draft.extraction.provider),
          `Unexpected strategy for fixture: ${fixtureName}`
        ).toBe(expected.expectedStrategy);
      }
      if (expected.expectedDate) {
        expect(result.draft.testDate).toBe(expected.expectedDate);
      }
      if (typeof expected.maxMissingFields === "number") {
        const missing = deriveMissingFields(result);
        expect(
          missing.length,
          `Too many missing fields for fixture: ${fixtureName} (${missing.join(", ") || "none"})`
        ).toBeLessThanOrEqual(expected.maxMissingFields);
      }
      if (expected.forbiddenMarkers && expected.forbiddenMarkers.length > 0) {
        const forbiddenSet = new Set(expected.forbiddenMarkers.map((marker) => marker.toLowerCase()));
        const hit = result.draft.markers.find((marker) => {
          const raw = marker.marker.trim().toLowerCase();
          const canonical = marker.canonicalMarker.trim().toLowerCase();
          return forbiddenSet.has(raw) || forbiddenSet.has(canonical);
        });
        expect(hit, `Forbidden marker parsed in fixture ${fixtureName}: ${hit?.marker ?? hit?.canonicalMarker ?? ""}`).toBeUndefined();
      }

      for (const markerExpectation of expected.requiredMarkers) {
        const parsedMarker = result.draft.markers.find((marker) => marker.canonicalMarker === markerExpectation.canonicalMarker);
        expect(parsedMarker, `Missing marker: ${markerExpectation.canonicalMarker}`).toBeDefined();

        if (!parsedMarker) {
          continue;
        }

        if (markerExpectation.unit) {
          expect(parsedMarker.unit).toBe(markerExpectation.unit);
        }
        if (typeof markerExpectation.referenceMin === "number") {
          expect(parsedMarker.referenceMin).not.toBeNull();
          expect(parsedMarker.referenceMin ?? 0).toBeCloseTo(markerExpectation.referenceMin, 3);
        }
        if (typeof markerExpectation.referenceMax === "number") {
          expect(parsedMarker.referenceMax).not.toBeNull();
          expect(parsedMarker.referenceMax ?? 0).toBeCloseTo(markerExpectation.referenceMax, 3);
        }
      }
    });
  }
});
