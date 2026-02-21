import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { __pdfParsingInternals } from "../pdfParsing";

interface FixtureExpectation {
  minimumConfidence: number;
  requiredMarkers: Array<{
    canonicalMarker: string;
    unit?: string;
    referenceMin?: number;
    referenceMax?: number;
  }>;
}

const fixtureRoot = path.resolve(process.cwd(), "tests/parser-fixtures/text");
const fixtureNames = readdirSync(fixtureRoot).filter((entry) => !entry.startsWith("."));

describe("parser fixtures", () => {
  for (const fixtureName of fixtureNames) {
    it(`parses fixture: ${fixtureName}`, () => {
      const base = path.join(fixtureRoot, fixtureName);
      const input = readFileSync(path.join(base, "input.txt"), "utf8");
      const expected = JSON.parse(readFileSync(path.join(base, "expected.json"), "utf8")) as FixtureExpectation;

      const result = __pdfParsingInternals.fallbackExtractDetailed(input, `${fixtureName}.txt`);

      expect(result.draft.markers.length).toBeGreaterThan(0);
      expect(result.draft.extraction.confidence).toBeGreaterThanOrEqual(expected.minimumConfidence);

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
