import { existsSync, readFileSync, readdirSync } from "node:fs";
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
  skipFixture?: boolean;
  requiredMarkers: Array<{
    canonicalMarker: string;
    unit?: string;
    referenceMin?: number;
    referenceMax?: number;
  }>;
}

const fixtureRoots = [
  path.resolve(process.cwd(), "tests/parser-fixtures/text"),
  path.resolve(process.cwd(), "tests/parser-fixtures/drafts")
];

const collectFixtureDirs = (baseDir: string): string[] => {
  if (!existsSync(baseDir)) {
    return [];
  }
  const dirs: string[] = [];
  const walk = (currentDir: string) => {
    const entries = readdirSync(currentDir, { withFileTypes: true }).filter((entry) => !entry.name.startsWith("."));
    const hasInput = entries.some((entry) => entry.isFile() && entry.name === "input.txt");
    const hasExpected = entries.some((entry) => entry.isFile() && entry.name === "expected.json");
    if (hasInput && hasExpected) {
      dirs.push(currentDir);
      return;
    }
    entries
      .filter((entry) => entry.isDirectory())
      .forEach((entry) => walk(path.join(currentDir, entry.name)));
  };
  walk(baseDir);
  return dirs;
};

const fixtureDirs = fixtureRoots.flatMap((root) => collectFixtureDirs(root)).sort((a, b) => a.localeCompare(b));
const CORE_MARKERS = new Set(["Testosterone", "Free Testosterone", "Estradiol", "SHBG", "Hematocrit"]);
const STRICT_DRAFT_FIXTURES = process.env.STRICT_DRAFT_FIXTURES === "1";

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
  for (const fixtureDir of fixtureDirs) {
    const fixtureName = path.relative(process.cwd(), fixtureDir).replace(/\\/g, "/");
    it(`parses fixture: ${fixtureName}`, () => {
      const input = readFileSync(path.join(fixtureDir, "input.txt"), "utf8");
      const expected = JSON.parse(readFileSync(path.join(fixtureDir, "expected.json"), "utf8")) as FixtureExpectation;
      const isDraftFixture = fixtureName.includes("tests/parser-fixtures/drafts/");
      const strictFixture = !isDraftFixture || STRICT_DRAFT_FIXTURES;
      const skipFixture = strictFixture && expected.skipFixture === true;

      expect(input.trim().length).toBeGreaterThan(30);
      if (skipFixture) {
        return;
      }

      const result = __pdfParsingInternals.fallbackExtractDetailed(input, `${fixtureName}.txt`);

      if (strictFixture) {
        expect(result.draft.markers.length).toBeGreaterThan(0);
      }
      if (strictFixture || result.draft.markers.length > 0) {
        expect(result.draft.extraction.confidence).toBeGreaterThanOrEqual(expected.minimumConfidence);
      }
      if (expected.expectedStrategy) {
        expect(
          deriveStrategy(result.draft.extraction.model, result.draft.extraction.provider),
          `Unexpected strategy for fixture: ${fixtureName}`
        ).toBe(expected.expectedStrategy);
      }
      if (strictFixture && expected.expectedDate) {
        expect(result.draft.testDate).toBe(expected.expectedDate);
      }
      if (strictFixture && typeof expected.maxMissingFields === "number") {
        const missing = deriveMissingFields(result);
        expect(
          missing.length,
          `Too many missing fields for fixture: ${fixtureName} (${missing.join(", ") || "none"})`
        ).toBeLessThanOrEqual(expected.maxMissingFields);
      }
      if (strictFixture && expected.forbiddenMarkers && expected.forbiddenMarkers.length > 0) {
        const forbiddenSet = new Set(expected.forbiddenMarkers.map((marker) => marker.toLowerCase()));
        const hit = result.draft.markers.find((marker) => {
          const raw = marker.marker.trim().toLowerCase();
          const canonical = marker.canonicalMarker.trim().toLowerCase();
          return forbiddenSet.has(raw) || forbiddenSet.has(canonical);
        });
        expect(hit, `Forbidden marker parsed in fixture ${fixtureName}: ${hit?.marker ?? hit?.canonicalMarker ?? ""}`).toBeUndefined();
      }

      if (!strictFixture) {
        return;
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
