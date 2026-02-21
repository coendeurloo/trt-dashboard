import { describe, expect, it } from "vitest";
import { __pdfParsingInternals } from "../pdfParsing";
import { ExtractionDraft } from "../types";

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

  it("parses hematology rows with 10*9/L and 10*12/L units", () => {
    const wbc = __pdfParsingInternals.parseSingleRow("WBC 6.9 4.0-10.0 10*9/L", 0.7, genericProfile);
    const rbc = __pdfParsingInternals.parseSingleRow("RBC 5.19 4.20-5.40 10*12/L", 0.7, genericProfile);

    expect(wbc).not.toBeNull();
    expect(wbc?.markerName).toBe("WBC");
    expect(wbc?.value).toBeCloseTo(6.9, 2);
    expect(wbc?.unit).toBe("10^9/L");
    expect(wbc?.referenceMin).toBe(4);
    expect(wbc?.referenceMax).toBe(10);

    expect(rbc).not.toBeNull();
    expect(rbc?.markerName).toBe("RBC");
    expect(rbc?.value).toBeCloseTo(5.19, 2);
    expect(rbc?.unit).toBe("10^12/L");
    expect(rbc?.referenceMin).toBe(4.2);
    expect(rbc?.referenceMax).toBe(5.4);
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

  it("drops narrative risk/caution fragments from LifeLabs-style commentary lines", () => {
    const rows = __pdfParsingInternals.parseLineRows(
      [
        "for intermediate and high risk individuals is 2 mmol/L.",
        "low risk individuals with LDL cholesterol 5 mmol/L",
        "if dexamethasone has been given 130 nmol/L.",
        "This high sensitivity CRP method is sensitive to 0.3 mg/L",
        "DHEA Sulphate 5.1 umol/L <15.0",
        "LDL Cholesterol 3.36 mmol/L 1.50-3.00",
        "Sex Hormone Binding Globulin 44.1 nmol/L 10.0-70.0"
      ].join("\n"),
      genericProfile
    );

    const markerNames = rows.map((row) => row.markerName);
    expect(markerNames).toContain("DHEA Sulphate");
    expect(markerNames).toContain("SHBG");
    expect(markerNames).toContain("LDL Cholesterol");
    expect(markerNames).not.toContain("is");
    expect(markerNames.some((name) => /intermediate and high risk individuals/i.test(name))).toBe(false);
    expect(markerNames.some((name) => /low risk individuals/i.test(name))).toBe(false);
    expect(markerNames.some((name) => /if dexamethasone has been given/i.test(name))).toBe(false);
    expect(markerNames.some((name) => /CRP method is sensitive to/i.test(name))).toBe(false);
  });

  it("drops single-token stopword markers like is", () => {
    const rows = __pdfParsingInternals.parseLineRows(
      ["is 2.00 mmol/L", "LDL Cholesterol 3.36 mmol/L 1.50-3.00"].join("\n"),
      genericProfile
    );

    const markerNames = rows.map((row) => row.markerName);
    expect(markerNames).not.toContain("is");
    expect(markerNames).toContain("LDL Cholesterol");
  });

  it("keeps real CRP marker but drops CRP narrative sensitivity fragment", () => {
    const rows = __pdfParsingInternals.parseLineRows(
      [
        "This high sensitivity CRP method is sensitive to 0.3 mg/L and is suitable",
        "C Reactive Protein (High Sensitivity) 1.0 mg/L <4.8"
      ].join("\n"),
      genericProfile
    );

    const markerNames = rows.map((row) => row.markerName);
    expect(markerNames.some((name) => /CRP method is sensitive to/i.test(name))).toBe(false);
    expect(markerNames).toContain("C Reactive Protein (High Sensitivity)");
  });

  it("keeps first-page differential markers with 10*9/L units", () => {
    const rows = __pdfParsingInternals.parseLineRows(
      [
        "Neutrophils 3.3 2.0-7.5 10*9/L",
        "Monocytes 0.5 0.1-0.8 10*9/L",
        "Eosinophils 0.3 0.0-0.7 10*9/L"
      ].join("\n"),
      genericProfile
    );

    const markers = rows.map((row) => row.markerName);
    expect(markers).toContain("Neutrophils");
    expect(markers).toContain("Monocytes");
    expect(markers).toContain("Eosinophils");
    rows.forEach((row) => {
      expect(row.unit).toBe("10^9/L");
    });
  });

  it("parses LifeLabs first-page hematology block without dropping WBC differential rows", () => {
    const draft = __pdfParsingInternals.fallbackExtract(
      [
        "Collected on: Oct 20 2018 07:10",
        "Hematology",
        "WBC 6.9 4.0-10.0 10*9/L",
        "RBC 5.19 4.20-5.40 10*12/L",
        "Hemoglobin 157 135-170 g/L",
        "Hematocrit 0.47 0.40-0.50 L/L",
        "Platelet Count A 137 150-400 10*9/L",
        "Differential",
        "Neutrophils 3.3 2.0-7.5 10*9/L",
        "Lymphocytes 2.7 1.0-4.0 10*9/L",
        "Monocytes 0.5 0.1-0.8 10*9/L",
        "Eosinophils 0.3 0.0-0.7 10*9/L",
        "Basophils 0.1 0.0-0.2 10*9/L"
      ].join("\n"),
      "Bloodwork 6 - clean.pdf"
    );

    const names = draft.markers.map((marker) => marker.marker);
    expect(names).toContain("WBC");
    expect(names).toContain("Monocytes");
    expect(names).toContain("Neutrophils");
    expect(names.some((name) => name.includes("Platelet Count"))).toBe(true);
    expect(draft.markers.some((marker) => marker.unit === "10^9/L")).toBe(true);
  });

  it("parses LifeLabs table rows while dropping commentary fragments", () => {
    const rows = __pdfParsingInternals.parseLifeLabsTableRows(
      [
        "Test Flag Result Reference Range - Units",
        "WBC 6.9 4.0-10.0 10*9/L",
        "Monocytes 0.5 0.1-0.8 10*9/L",
        "LDL Cholesterol A 3.36 1.50-3.00 mmol/L",
        "The optimal LDL cholesterol level for intermediate and high risk individuals is <= 2.00 mmol/L.",
        "This high sensitivity CRP method is sensitive to 0.3 mg/L and is suitable",
        "TSH 2.09 0.32-5.04 mU/L",
        "Estradiol 113 <157 pmol/L",
        "DHEA Sulphate 5.1 <15.0 umol/L",
        "Sex Hormone Binding Globulin 44.1 10.0-70.0 nmol/L"
      ].join("\n"),
      genericProfile
    );

    const names = rows.map((row) => row.markerName);
    expect(names).toContain("WBC");
    expect(names).toContain("Monocytes");
    expect(names).toContain("LDL Cholesterol");
    expect(names).toContain("TSH");
    expect(names).toContain("Estradiol");
    expect(names).toContain("DHEA Sulphate");
    expect(names).toContain("SHBG");
    expect(names).not.toContain("is");
    expect(names.some((name) => /high risk individuals/i.test(name))).toBe(false);
    expect(names.some((name) => /CRP method is sensitive to/i.test(name))).toBe(false);
  });

  it("trims long caution prefixes when a real marker appears at the end", () => {
    const rows = __pdfParsingInternals.parseLineRows(
      ["tions, please interpret results with caution DHEA Sulphate 5.1 umol/L <15.0"].join("\n"),
      genericProfile
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.markerName).toBe("DHEA Sulphate");
    expect(rows[0]?.value).toBeCloseTo(5.1, 2);
  });

  it("renames hypoalbuminemia-prefixed SHBG row to SHBG", () => {
    const rows = __pdfParsingInternals.parseLineRows(
      ["caution in presence of significant hypoalbuminemia Sex Hormone Binding Globulin 44.1 nmol/L 10.0-70.0"].join("\n"),
      genericProfile
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.markerName).toBe("SHBG");
    expect(rows[0]?.value).toBeCloseTo(44.1, 2);
  });

  it("normalizes Cortisol AM Cortisol to Cortisol (AM)", () => {
    const rows = __pdfParsingInternals.parseLineRows(
      ["Cortisol AM Cortisol 449 nmol/L 125-536"].join("\n"),
      genericProfile
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.markerName).toBe("Cortisol (AM)");
    expect(rows[0]?.value).toBe(449);
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

    const parsed = rows.find((row) => row.markerName === "SHBG");
    expect(parsed).toBeDefined();
    expect(parsed?.value).toBeCloseTo(34.7, 2);
    expect(parsed?.unit).toBe("nmol/L");
    expect(parsed?.referenceMin).toBe(19.3);
    expect(parsed?.referenceMax).toBe(76.4);
  });

  it("parses Latvian indexed hematology rows without corrupting first values", () => {
    const draft = __pdfParsingInternals.fallbackExtract(
      [
        "E. Gulbja Laboratorija Testing Report Nr. 26862432 /2/Request complete",
        "Test title Result Reference interval Units Prev. Result/ date",
        "Hematology",
        "1/58 A Red blood cells 5.8 4.5 - 5.9 10x12/L",
        "2/58 A Hemoglobin 172 132 - 175 g/L",
        "3/58 A Hematocrit 52 40 - 51 %"
      ].join("\n"),
      "labrapport-250812-lab-latvia.pdf"
    );

    const rbc = draft.markers.find((marker) => marker.canonicalMarker === "Red Blood Cells");
    const hgb = draft.markers.find((marker) => marker.canonicalMarker === "Hemoglobin");

    expect(rbc).toBeDefined();
    expect(rbc?.rawValue).toBeCloseTo(5.8, 2);
    expect(rbc?.rawUnit).toBe("10^12/L");
    expect(rbc?.value).toBeCloseTo(5.8, 2);
    expect(rbc?.unit).toBe("10^12/L");
    expect(rbc?.referenceMin).toBe(4.5);
    expect(rbc?.referenceMax).toBe(5.9);

    expect(hgb).toBeDefined();
    expect(hgb?.rawValue).toBe(172);
    expect(hgb?.rawUnit).toBe("g/L");
    expect(hgb?.rawReferenceMin).toBe(132);
    expect(hgb?.rawReferenceMax).toBe(175);
  });

  it("parses Latvian rows with B12 and clinical chemistry without index pollution", () => {
    const draft = __pdfParsingInternals.fallbackExtract(
      [
        "E. Gulbja Laboratorija Testing Report Nr. 26862432 /2/Request complete",
        "23/58 A ESR 2 1 - 15 mm/h",
        "24/58 A Ferritin 27.6 22 - 322 ng/mL",
        "25/58 A Active B12 (Holotranscobalamin) 96.74 27.24-169.62 pmol/L",
        "Clinical Chemistry",
        "26/58 A Urea 4.6 3.2 - 8.2 mmol/L",
        "27/58 A Creatinine 97 53-97 µmol/L"
      ].join("\n"),
      "labrapport-250812-lab-latvia.pdf"
    );

    const activeB12 = draft.markers.find((marker) => marker.marker.toLowerCase().includes("active b12"));
    const urea = draft.markers.find((marker) => marker.canonicalMarker === "Ureum");
    const polluted = draft.markers.find((marker) => /interval clinical chemistry|clinical chemistry/i.test(marker.marker));

    expect(activeB12).toBeDefined();
    expect(activeB12?.rawValue).toBeCloseTo(96.74, 2);
    expect(activeB12?.rawUnit).toBe("pmol/L");
    expect(activeB12?.rawReferenceMin).toBeCloseTo(27.24, 2);
    expect(activeB12?.rawReferenceMax).toBeCloseTo(169.62, 2);

    expect(urea).toBeDefined();
    expect(urea?.rawValue).toBe(4.6);
    expect(urea?.rawUnit).toBe("mmol/L");
    expect(polluted).toBeUndefined();
  });

  it("drops Latvian section/index bleed-through rows while keeping real markers", () => {
    const draft = __pdfParsingInternals.fallbackExtract(
      [
        "E. Gulbja Laboratorija Testing Report Nr. 26862432 /2/Request complete",
        "9/58 A MPV-Mean Platelet Volume 9.5 9.1-12.6 fL",
        "10/58 A PCT-plateletcrit 0.260 0.12-0.39 %",
        "11/58 A PDW-Platelet Distribution Width 11.3 9.30-16.70 fL",
        "12/58 A White blood cells 7.05 4.0 - 9.8 10x9/L",
        "Vitamins",
        "45/58 A 25-OH- Vitamin D 60.10 30 - 100 ng/mL",
        "(D3+D2)",
        "Tumor Markers",
        "46/58 A PSA 0.424 <4.0 ng/mL",
        "53/58 A Free Androgen Index 101.83 14.8 - 95.0",
        "54/58 A TSH 2.2 0.55 - 4.78 mU/L",
        "56/58 A Cortisol 538.0 - nmol/L",
        "Morning hours 6.00-10.00 166-507 nmol/L.",
        "Afternoon hours 16.00 līdz 20.00 73.8-291 nmol/L"
      ].join("\n"),
      "labrapport-250812-lab-latvia.pdf"
    );

    const tsh = draft.markers.find((marker) => marker.canonicalMarker === "TSH");
    const vitaminD = draft.markers.find((marker) => /25-oh-?\s+vitamin\s+d/i.test(marker.marker));
    const hasNoiseMarker = draft.markers.some((marker) =>
      /\b(?:tumou?r markers?|cardial markers?|afternoon hours|morning hours|interval vitamins|12\/58|54\/58)\b/i.test(marker.marker)
    );

    expect(tsh).toBeDefined();
    expect(tsh?.rawValue).toBeCloseTo(2.2, 2);
    expect(vitaminD).toBeDefined();
    expect(vitaminD?.marker).toBe("25-OH- Vitamin D (D3+D2)");
    expect(hasNoiseMarker).toBe(false);
  });

  it("keeps MPV as one marker and preserves PCT-plateletcrit in Latvian rows", () => {
    const draft = __pdfParsingInternals.fallbackExtract(
      [
        "E. Gulbja Laboratorija Testing Report Nr. 26862432 /2/Request complete",
        "8/58 A Platelets 272 150 - 410 10x9/L",
        "9/58 A MPV-Mean Platelet",
        "Volume 9.5 9.1-12.6 fL",
        "10/58 A PCT-plateletcrit 0.260 0.12-0.39 %",
        "11/58 A PDW-Platelet 11.3 9.30-16.70 fL",
        "Distribution Width",
        "12/58 A White blood cells 7.05 4.0 - 9.8 10x9/L"
      ].join("\n"),
      "labrapport-250812-lab-latvia.pdf"
    );

    const mpv = draft.markers.find((marker) => /mpv-mean platelet volume/i.test(marker.marker));
    const pct = draft.markers.find((marker) => /pct-plateletcrit/i.test(marker.marker));
    const pdw = draft.markers.find((marker) => /pdw-platelet/i.test(marker.marker));
    const whiteBloodCells = draft.markers.find((marker) => marker.canonicalMarker === "Leukocyten");
    const hasLooseVolume = draft.markers.some((marker) => marker.marker.trim().toLowerCase() === "volume");
    const hasLooseDistributionWidth = draft.markers.some((marker) => marker.marker.trim().toLowerCase() === "distribution width");
    const hasIntervalHematology = draft.markers.some((marker) => /interval hematology/i.test(marker.marker));

    expect(mpv).toBeDefined();
    expect(mpv?.rawValue).toBeCloseTo(9.5, 2);
    expect(pct).toBeDefined();
    expect(pct?.rawValue).toBeCloseTo(0.26, 3);
    expect(pdw).toBeDefined();
    expect(pdw?.rawValue).toBeCloseTo(11.3, 2);
    expect(pdw?.marker.toLowerCase()).toBe("pdw-platelet");
    expect(whiteBloodCells).toBeDefined();
    expect(whiteBloodCells?.rawValue).toBeCloseTo(7.05, 2);
    expect(hasLooseVolume).toBe(false);
    expect(hasLooseDistributionWidth).toBe(false);
    expect(hasIntervalHematology).toBe(false);
  });

  it("keeps Dutch marker labels in review and trims dangling '(volgens' fragment", () => {
    const draft = __pdfParsingInternals.fallbackExtract(
      [
        "estradiol (17-beta-estradiol) ECLIA 216.9 pmol/l 41.5 - 158.5",
        "testosteron ECLIA 39.6 nmol/l 8.64 - 29.00",
        "testosteron, vrij (volgens",
        "ISSAM) 0.961 nmol/l > 0.125",
        "SHBG (sex.horm.bind. gl.) ECLIA 33.1 nmol/l 18.3 - 54.1"
      ].join("\n"),
      "labrapport-240319-lab-nl.pdf"
    );

    const testosterone = draft.markers.find((marker) => marker.marker.toLowerCase() === "testosteron");
    const free = draft.markers.find((marker) => marker.marker.toLowerCase().includes("testosteron, vrij"));

    expect(testosterone).toBeDefined();
    expect(testosterone?.marker).toBe("testosteron");
    expect(free).toBeDefined();
    expect(free?.marker).toBe("testosteron, vrij");
    expect(free?.rawValue).toBeCloseTo(0.961, 3);
  });

  it("drops Dutch cardiovascular risk commentary prefix and keeps triglyceriden marker clean", () => {
    const rows = __pdfParsingInternals.parseLineRows(
      [
        "Non-HDL-Cholesterol 3.96 mmol/l",
        "Voor interpretatie, zie NHG richtlijn cardiovasculair risicomanagement.",
        "triglyceriden 0.49 mmol/l < 2.28",
        "ASAT (GOT) 27 U/l < 50"
      ].join("\n"),
      genericProfile
    );

    const markerNames = rows.map((row) => row.markerName.toLowerCase());
    expect(markerNames).toContain("triglyceriden");
    expect(markerNames.some((name) => name.includes("risicomanagement triglyceriden"))).toBe(false);
    expect(markerNames.some((name) => name.includes("risicomanagement"))).toBe(false);
  });

  it("parses IGF-1 and IGF-1 SDS as separate markers in Dutch endocrine block", () => {
    const draft = __pdfParsingInternals.fallbackExtract(
      [
        "Groeihormoon en mediatoren",
        "IGF-1 (somatomedine C) CLIA 21.0 nmol/l 9.7 - 28.1",
        "IGF-1 SDS *) +0.7"
      ].join("\n"),
      "labrapport-260219-lab-nl.pdf"
    );

    const igf1 = draft.markers.find((marker) => /^igf-1\s+\(somatomedine c\)$/i.test(marker.marker));
    const igf1Sds = draft.markers.find((marker) => /^igf-1 sds$/i.test(marker.marker));

    expect(igf1).toBeDefined();
    expect(igf1?.rawValue).toBeCloseTo(21.0, 1);
    expect(igf1?.rawUnit).toBe("nmol/L");

    expect(igf1Sds).toBeDefined();
    expect(igf1Sds?.rawValue).toBeCloseTo(0.7, 2);
    expect(igf1Sds?.rawUnit ?? "").toBe("");
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

  it("filters noisy Claude rows while keeping structured marker rows", () => {
    const normalized = [
      __pdfParsingInternals.normalizeMarker({
        marker: "is",
        value: "2.0",
        unit: "mmol/L",
        referenceMin: null,
        referenceMax: null,
        confidence: 0.8
      }),
      __pdfParsingInternals.normalizeMarker({
        marker: "This high sensitivity CRP method is sensitive to",
        value: "0.3",
        unit: "mg/L",
        referenceMin: null,
        referenceMax: null,
        confidence: 0.8
      }),
      __pdfParsingInternals.normalizeMarker({
        marker: "Testosterone",
        value: "22.5",
        unit: "nmol/L",
        referenceMin: 8.4,
        referenceMax: 28.8,
        confidence: 0.8
      }),
      __pdfParsingInternals.normalizeMarker({
        marker: "Sex Hormone Binding Globulin",
        value: "44.1",
        unit: "nmol/L",
        referenceMin: 10,
        referenceMax: 70,
        confidence: 0.8
      })
    ].filter((row): row is NonNullable<typeof row> => row !== null);

    const cleaned = __pdfParsingInternals.filterMarkerValuesForQuality(normalized);
    const markers = cleaned.map((row) => row.marker);
    expect(markers).toContain("Testosterone");
    expect(markers).toContain("SHBG");
    expect(markers).not.toContain("is");
    expect(markers.some((name) => /CRP method is sensitive to/i.test(name))).toBe(false);
  });

  it("produces fallback diagnostics with rejection reasons", () => {
    const outcome = __pdfParsingInternals.fallbackExtractDetailed(
      [
        "Collected: 03/11/2025",
        "Testosterone 22.5 nmol/L 8.4 - 28.8",
        "is 2.0 mmol/L",
        "This high sensitivity CRP method is sensitive to 0.3 mg/L",
        "SHBG 44.1 nmol/L 10 - 70"
      ].join("\n"),
      "diagnostic.pdf"
    );

    expect(outcome.draft.markers.length).toBeGreaterThanOrEqual(2);
    expect(outcome.diagnostics.parsedRowCount).toBeGreaterThanOrEqual(outcome.diagnostics.keptRows);
    expect(outcome.diagnostics.rejectedRows).toBeGreaterThanOrEqual(0);
    expect(typeof outcome.diagnostics.topRejectReasons).toBe("object");
  });

  it("adds warning codes for empty text layer and OCR initialization failure", () => {
    const warningMeta = __pdfParsingInternals.buildLocalExtractionWarnings(
      {
        text: "",
        pageCount: 3,
        textItemCount: 0,
        lineCount: 0,
        nonWhitespaceChars: 0,
        spatialRows: []
      },
      true,
      {
        text: "",
        used: true,
        pagesAttempted: 3,
        pagesSucceeded: 0,
        pagesFailed: 3,
        initFailed: true,
        timedOut: false
      },
      {
        sourceFileName: "empty.pdf",
        testDate: "2025-01-01",
        markers: [],
        extraction: {
          provider: "fallback",
          model: "fallback-layered:adaptive",
          confidence: 0.2,
          needsReview: true
        }
      }
    );

    expect(warningMeta.warningCode).toBe("PDF_TEXT_EXTRACTION_FAILED");
    expect(warningMeta.warnings).toContain("PDF_TEXT_LAYER_EMPTY");
    expect(warningMeta.warnings).toContain("PDF_OCR_INIT_FAILED");
    expect(warningMeta.warnings).toContain("PDF_LOW_CONFIDENCE_LOCAL");
  });

  it("adds partial OCR warning when some pages fail", () => {
    const warningMeta = __pdfParsingInternals.buildLocalExtractionWarnings(
      {
        text: "some text",
        pageCount: 3,
        textItemCount: 42,
        lineCount: 12,
        nonWhitespaceChars: 300,
        spatialRows: []
      },
      false,
      {
        text: "marker text",
        used: true,
        pagesAttempted: 3,
        pagesSucceeded: 2,
        pagesFailed: 1,
        initFailed: false,
        timedOut: false
      },
      {
        sourceFileName: "partial.pdf",
        testDate: "2025-01-01",
        markers: [
          {
            id: "m1",
            marker: "Testosterone",
            canonicalMarker: "Testosterone",
            value: 20,
            unit: "nmol/L",
            referenceMin: 8,
            referenceMax: 30,
            abnormal: "normal",
            confidence: 0.7
          }
        ],
        extraction: {
          provider: "fallback",
          model: "fallback-layered:adaptive",
          confidence: 0.7,
          needsReview: false
        }
      }
    );

    expect(warningMeta.warnings).toContain("PDF_OCR_PARTIAL");
  });

  it("enables smart auto-rescue when local quality is low and text context is weak", () => {
    const decision = __pdfParsingInternals.shouldAutoPdfRescue({
      costMode: "balanced",
      forceAi: false,
      localMetrics: {
        markerCount: 2,
        unitCoverage: 0.5,
        importantCoverage: 0,
        confidence: 0.4
      },
      textItems: 0,
      compactTextLength: 80,
      ocrResult: {
        text: "",
        used: true,
        pagesAttempted: 3,
        pagesSucceeded: 0,
        pagesFailed: 3,
        initFailed: true,
        timedOut: false
      },
      aiTextOnlySucceeded: false
    });

    expect(decision.shouldRescue).toBe(true);
    expect(decision.reason).toBe("low_quality_and_weak_text_context");
  });

  it("skips smart auto-rescue in ultra low cost mode", () => {
    const decision = __pdfParsingInternals.shouldAutoPdfRescue({
      costMode: "ultra_low_cost",
      forceAi: false,
      localMetrics: {
        markerCount: 1,
        unitCoverage: 0.2,
        importantCoverage: 0,
        confidence: 0.25
      },
      textItems: 0,
      compactTextLength: 20,
      ocrResult: {
        text: "",
        used: true,
        pagesAttempted: 2,
        pagesSucceeded: 0,
        pagesFailed: 2,
        initFailed: false,
        timedOut: true
      },
      aiTextOnlySucceeded: false
    });

    expect(decision.shouldRescue).toBe(false);
    expect(decision.reason).toBe("cost_mode_ultra_low");
  });

  it("includes AI text-only insufficient warning code when passed by parser", () => {
    const warningMeta = __pdfParsingInternals.buildLocalExtractionWarnings(
      {
        text: "marker row",
        pageCount: 1,
        textItemCount: 40,
        lineCount: 20,
        nonWhitespaceChars: 300,
        spatialRows: []
      },
      false,
      {
        text: "",
        used: false,
        pagesAttempted: 0,
        pagesSucceeded: 0,
        pagesFailed: 0,
        initFailed: false,
        timedOut: false
      },
      {
        sourceFileName: "ai-warning.pdf",
        testDate: "2025-01-01",
        markers: [],
        extraction: {
          provider: "fallback",
          model: "fallback-layered:adaptive",
          confidence: 0.1,
          needsReview: true
        }
      },
      ["PDF_AI_TEXT_ONLY_INSUFFICIENT"]
    );

    expect(warningMeta.warnings).toContain("PDF_AI_TEXT_ONLY_INSUFFICIENT");
  });
});

describe("isLocalDraftGoodEnough", () => {
  const { isLocalDraftGoodEnough } = __pdfParsingInternals;

  const makeDraft = (markers: number, confidence: number, importantMarkers: string[] = []): ExtractionDraft => ({
    sourceFileName: "test.pdf",
    testDate: "2025-01-01",
    markers: [
      ...importantMarkers.map((name, index) => ({
        id: `imp-${index}`,
        marker: name,
        canonicalMarker: name,
        value: 10,
        unit: "nmol/L",
        referenceMin: 5,
        referenceMax: 30,
        abnormal: "normal" as const,
        confidence
      })),
      ...Array.from({ length: Math.max(0, markers - importantMarkers.length) }, (_, index) => ({
        id: `reg-${index}`,
        marker: `Marker ${index}`,
        canonicalMarker: `Marker ${index}`,
        value: 10,
        unit: "mmol/L",
        referenceMin: 3,
        referenceMax: 20,
        abnormal: "normal" as const,
        confidence
      }))
    ],
    extraction: {
      provider: "fallback",
      model: "test",
      confidence,
      needsReview: false
    }
  });

  it("accepts 8+ markers with 0.65+ confidence", () => {
    expect(isLocalDraftGoodEnough(makeDraft(10, 0.75))).toBe(true);
  });

  it("accepts 6 markers with 0.72+ confidence and 2 important markers", () => {
    expect(isLocalDraftGoodEnough(makeDraft(6, 0.75, ["Testosterone", "Hematocrit"]))).toBe(true);
  });

  it("accepts 4 markers with 0.80+ confidence and 2 important markers", () => {
    expect(isLocalDraftGoodEnough(makeDraft(4, 0.85, ["Testosterone", "Estradiol"]))).toBe(true);
  });

  it("rejects 3 markers even with high confidence", () => {
    expect(isLocalDraftGoodEnough(makeDraft(3, 0.95, ["Testosterone", "Estradiol"]))).toBe(false);
  });

  it("rejects 6 markers with low confidence", () => {
    expect(isLocalDraftGoodEnough(makeDraft(6, 0.5))).toBe(false);
  });

  it("rejects empty draft", () => {
    expect(isLocalDraftGoodEnough(makeDraft(0, 0))).toBe(false);
  });
});
