import { describe, expect, it } from "vitest";
import { __pdfParsingInternals } from "../pdfParsing";

const genericProfile = __pdfParsingInternals.detectParserProfile("", "random-report.pdf");

describe("pdfParsing fallback layers", () => {
  it("detects parser profile for known report families", () => {
    const dutch = __pdfParsingInternals.detectParserProfile("Precision Analytical Collection Times", "x.pdf");
    const uk = __pdfParsingInternals.detectParserProfile("Results for your Doctor", "x.pdf");
    const huisarts = __pdfParsingInternals.detectParserProfile("Uw metingen", "x.pdf");

    expect(dutch.id).toBe("dutch_hormone");
    expect(uk.id).toBe("uk_results");
    expect(huisarts.id).toBe("mijn_gezondheid");
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
});
