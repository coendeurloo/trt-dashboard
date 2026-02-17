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
        nonWhitespaceChars: 18,
        spatialRows: []
      },
      draft
    );

    expect(shouldUseOcr).toBe(true);
  });

  it("does not force OCR when text layer is dense, even with low primary coverage", () => {
    const shouldUseOcr = __pdfParsingInternals.shouldUseOcrFallback(
      {
        text: "Testosterone follow-up with mixed history tables and calculator rows",
        pageCount: 1,
        textItemCount: 160,
        lineCount: 72,
        nonWhitespaceChars: 1600,
        spatialRows: []
      },
      {
        sourceFileName: "history-table.pdf",
        testDate: "2022-01-12",
        markers: [
          {
            id: "m-1",
            marker: "Baseline value",
            canonicalMarker: "Baseline Value",
            value: 1,
            unit: "nmol/L",
            referenceMin: null,
            referenceMax: null,
            abnormal: "unknown",
            confidence: 0.7
          },
          {
            id: "m-2",
            marker: "Protocol note",
            canonicalMarker: "Protocol Note",
            value: 2,
            unit: "nmol/L",
            referenceMin: null,
            referenceMax: null,
            abnormal: "unknown",
            confidence: 0.7
          },
          {
            id: "m-3",
            marker: "Balance My Hormones",
            canonicalMarker: "Balance My Hormones",
            value: 3,
            unit: "ng/dL",
            referenceMin: null,
            referenceMax: null,
            abnormal: "unknown",
            confidence: 0.7
          },
          {
            id: "m-4",
            marker: "Some calc row",
            canonicalMarker: "Some Calc Row",
            value: 4,
            unit: "nmol/L",
            referenceMin: null,
            referenceMax: null,
            abnormal: "unknown",
            confidence: 0.7
          },
          {
            id: "m-5",
            marker: "Another calc row",
            canonicalMarker: "Another Calc Row",
            value: 5,
            unit: "ng/dL",
            referenceMin: null,
            referenceMax: null,
            abnormal: "unknown",
            confidence: 0.7
          }
        ],
        extraction: {
          provider: "fallback",
          model: "fallback-layered:adaptive",
          confidence: 0.78,
          needsReview: false
        }
      }
    );

    expect(shouldUseOcr).toBe(false);
  });

  it("parses split marker/value cells from spatial x/y rows", () => {
    const rows = __pdfParsingInternals.parseSpatialRows(
      [
        {
          page: 1,
          y: 410,
          items: [
            { x: 90, text: "Testosterone (Total)" },
            { x: 320, text: "38.1" },
            { x: 360, text: "nmol/L" },
            { x: 430, text: "6.7 - 26.0" }
          ]
        }
      ],
      genericProfile
    );

    expect(rows.length).toBeGreaterThan(0);
    const best = rows.find((row) => row.markerName === "Testosterone (Total)" && row.value === 38.1);
    expect(best).toBeDefined();
    expect(best?.unit).toBe("nmol/L");
  });

  it("extracts current-column marker rows in history-sheet layout", () => {
    const rows = __pdfParsingInternals.parseHistoryCurrentColumnRows(
      [
        {
          page: 1,
          y: 120,
          items: [
            { x: 120, text: "Testosterone (Total)" },
            { x: 220, text: "Free Testosterone - Blood Test" },
            { x: 410, text: "SHBG" }
          ]
        },
        {
          page: 1,
          y: 640,
          items: [
            { x: 130, text: "38.1 = 1098 ng/dL" },
            { x: 220, text: "1108 pmol/L = 319 pg/mL" },
            { x: 420, text: "26 nmol/L" }
          ]
        }
      ],
      "Baseline 02-Jan-20 Per Week 12-Jan-22 Free Testosterone - Calculated",
      genericProfile
    );

    const totalT = rows.find((row) => row.markerName === "Testosterone (Total)");
    const freeT = rows.find((row) => row.markerName === "Free Testosterone");
    const shbg = rows.find((row) => row.markerName === "SHBG");

    expect(totalT).toBeDefined();
    expect(totalT?.value).toBeCloseTo(38.1, 2);
    expect(totalT?.unit).toBe("nmol/L");

    expect(freeT).toBeDefined();
    expect(freeT?.value).toBeCloseTo(1108, 0);
    expect(freeT?.unit).toBe("pmol/L");

    expect(shbg).toBeDefined();
    expect(shbg?.value).toBe(26);
    expect(shbg?.unit).toBe("nmol/L");
  });

  it("drops calculator and url noise rows while keeping real lab markers", () => {
    const rows = __pdfParsingInternals.parseLineRows(
      [
        "Balance My Hormones 7.11 ng/dL = 2.01 %",
        "https://tru-t.org/ 1.43 nmol/L",
        "Testosterone (Total) 38.1 nmol/L 6.7 - 26.0"
      ].join("\n"),
      genericProfile
    );

    const markerNames = rows.map((row) => row.markerName);
    expect(markerNames).not.toContain("Balance My Hormones");
    expect(markerNames).not.toContain("https://tru-t.org/");
    expect(markerNames).toContain("Testosterone (Total)");
  });

  it("parses three-line marker labels for split lab rows", () => {
    const rows = __pdfParsingInternals.parseLineRows(
      [
        "Sex Horm Binding Glob,",
        "Serum",
        "34.7 nmol/L 19.3 - 76.4"
      ].join("\n"),
      genericProfile
    );

    const parsed = rows.find((row) => row.markerName.includes("Sex Horm Binding Glob"));
    expect(parsed).toBeDefined();
    expect(parsed?.value).toBeCloseTo(34.7, 2);
    expect(parsed?.unit).toBe("nmol/L");
    expect(parsed?.referenceMin).toBe(19.3);
    expect(parsed?.referenceMax).toBe(76.4);
  });

  it("filters implausible unit-marker combinations during fallback dedupe", () => {
    const draft = __pdfParsingInternals.fallbackExtract(
      [
        "Collected: 03/11/2025",
        "FSH 65 g/L 1.5 - 12.4",
        "Testosterone 22.5 nmol/L 8 - 29",
        "SHBG 36 nmol/L 18 - 54",
        "Estradiol 95 pmol/L 40 - 160",
        "Hematocrit 0.48 L/L 0.40 - 0.54"
      ].join("\n"),
      "mixed-quality.pdf"
    );

    const canonicalMarkers = new Set(draft.markers.map((marker) => marker.canonicalMarker));
    expect(canonicalMarkers.has("FSH")).toBe(false);
    expect(canonicalMarkers.has("Testosterone")).toBe(true);
    expect(canonicalMarkers.has("SHBG")).toBe(true);
  });
});
