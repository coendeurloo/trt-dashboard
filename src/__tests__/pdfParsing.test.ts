import { describe, expect, it } from "vitest";
import { __pdfParsingInternals } from "../pdfParsing";

const genericProfile = __pdfParsingInternals.detectParserProfile("", "random-report.pdf");

describe("pdfParsing fallback layers", () => {
  it("uses one adaptive profile and toggles behavior from text signals", () => {
    const defaultProfile = __pdfParsingInternals.detectParserProfile("Results for your Doctor", "x.pdf");
    const keywordRangeProfile = __pdfParsingInternals.detectParserProfile(
      "Uw waarde: 5.1 Normale waarde: Hoger dan 3.5",
      "x.pdf"
    );

    expect(defaultProfile.id).toBe("adaptive");
    expect(defaultProfile.requireUnit).toBe(true);
    expect(defaultProfile.enableKeywordRangeParser).toBe(false);

    expect(keywordRangeProfile.id).toBe("adaptive");
    expect(keywordRangeProfile.requireUnit).toBe(false);
    expect(keywordRangeProfile.enableKeywordRangeParser).toBe(true);
  });

  it("parses right-anchored rows where range is before unit", () => {
    const row = __pdfParsingInternals.parseSingleRow(
      "Testosterone, Total, LC/MS/MS 300 250 - 1100 ng/dL",
      0.7,
      genericProfile
    );

    expect(row).not.toBeNull();
    expect(row?.markerName).toBe("Testosterone, Total, LC/MS/MS");
    expect(row?.value).toBe(300);
    expect(row?.unit).toBe("ng/dL");
    expect(row?.referenceMin).toBe(250);
    expect(row?.referenceMax).toBe(1100);
  });

  it("parses right-anchored rows where range is after unit", () => {
    const row = __pdfParsingInternals.parseSingleRow("Haemoglobin 147 g/L 130 - 170", 0.7, genericProfile);

    expect(row).not.toBeNull();
    expect(row?.markerName).toBe("Haemoglobin");
    expect(row?.value).toBe(147);
    expect(row?.unit).toBe("g/L");
    expect(row?.referenceMin).toBe(130);
    expect(row?.referenceMax).toBe(170);
  });

  it("parses two-line rows with marker header + result line", () => {
    const row = __pdfParsingInternals.parseTwoLineRow("Estradiol", "Result Normal 96 H 12 - 56 pg/mL", genericProfile);

    expect(row).not.toBeNull();
    expect(row?.markerName).toBe("Estradiol");
    expect(row?.value).toBe(96);
    expect(row?.unit).toBe("pg/mL");
    expect(row?.referenceMin).toBe(12);
    expect(row?.referenceMax).toBe(56);
  });

  it("prefers collected date over report date", () => {
    const text = [
      "Report Date: 05/11/2025",
      "Collected: 03/11/2025 07:58",
      "Testosterone, Total, LC/MS/MS 300 250 - 1100 ng/dL"
    ].join("\n");

    expect(__pdfParsingInternals.extractDateCandidate(text)).toBe("2025-11-03");
  });

  it("requires units in generic profile for retained fallback markers", () => {
    const rows = __pdfParsingInternals.parseLineRows(
      [
        "Collected: 03/11/2025",
        "Platelet Count 340 130 - 400",
        "Haemoglobin 147 g/L 130 - 170"
      ].join("\n"),
      genericProfile
    );

    const markerNames = rows.map((row) => row.markerName);
    expect(markerNames).toContain("Haemoglobin");
    expect(markerNames).not.toContain("Platelet Count");
  });

  it("flags sparse text-layer PDFs for OCR fallback", () => {
    const draft = __pdfParsingInternals.fallbackExtract("Testosterone 12 ng/mL", "sparse.pdf");
    const shouldUseOcr = __pdfParsingInternals.shouldUseOcrFallback(
      {
        text: "Testosterone 12 ng/mL",
        pageCount: 2,
        textItemCount: 8,
        lineCount: 2,
        nonWhitespaceChars: 18
      },
      draft
    );

    expect(shouldUseOcr).toBe(true);
  });
});
