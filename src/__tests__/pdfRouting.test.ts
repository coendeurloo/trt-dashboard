import { describe, expect, it } from "vitest";
import { buildRoutingDecision } from "../pdfRouting";

describe("pdfRouting", () => {
  it("routes LifeLabs reports to the LifeLabs parser and keeps OCR attempts bounded", () => {
    const decision = buildRoutingDecision({
      fileName: "lifelabs-report.pdf",
      text:
        "Test Flag Result Reference Range - Units\nFINAL RESULTS\nLifeLabs\nHematology\nDate collected: 2025-10-20\nHemoglobin 157 135-170 g/L",
      textItems: 220,
      pageCount: 2,
      nonWhitespaceChars: 520,
      lineCount: 24
    });

    expect(decision.primaryLanguage).toBe("eng");
    expect(decision.selectedParsers).toContain("lifelabs");
    expect(decision.ocrPlan.languageAttempts.length).toBeLessThanOrEqual(2);
    expect(decision.ocrPlan.primaryLang).toBe("eng");
  });

  it("detects MijnGezondheid style docs as Dutch and selects that template", () => {
    const decision = buildRoutingDecision({
      fileName: "huisarts-uitslag.pdf",
      text:
        "Uw metingen\nTestosteron Uw waarde: 21.3 Normale waarde: Hoger dan 8.6 - Lager dan 29.0\nAfname 18.02.26 Ontvangst 19.02.26",
      textItems: 120,
      pageCount: 1,
      nonWhitespaceChars: 310,
      lineCount: 12
    });

    expect(decision.primaryLanguage).toBe("nld");
    expect(decision.selectedParsers).toContain("mijngezondheid");
    expect(decision.ocrPlan.primaryLang === "eng+nld" || decision.ocrPlan.primaryLang === "eng").toBe(true);
  });

  it("detects Latvia indexed template", () => {
    const decision = buildRoutingDecision({
      fileName: "riga-lab.pdf",
      text:
        "Request complete Test title\n1/58 A Hematocrit 52 40 - 51 %\n2/58 A Hemoglobin 172 132 - 175 g/L\nE. Gulbja laboratorija",
      textItems: 140,
      pageCount: 1,
      nonWhitespaceChars: 330,
      lineCount: 10
    });

    expect(decision.selectedParsers).toContain("latvia_indexed");
  });

  it("never selects more than two parser templates and two OCR attempts", () => {
    const decision = buildRoutingDecision({
      fileName: "mixed-layout.pdf",
      text:
        "LifeLabs Test Flag Result Reference Range - Units\nresults for your doctor londonmedicallaboratory.com\nDate collected 2024-11-20",
      textItems: 160,
      pageCount: 1,
      nonWhitespaceChars: 280,
      lineCount: 8
    });

    expect(decision.selectedParsers.length).toBeLessThanOrEqual(2);
    expect(decision.ocrPlan.languageAttempts.length).toBeLessThanOrEqual(2);
  });

  it("uses preview OCR text to steer language routing when the text layer is sparse", () => {
    const decision = buildRoutingDecision({
      fileName: "scan.pdf",
      text: "",
      textItems: 0,
      pageCount: 1,
      nonWhitespaceChars: 0,
      lineCount: 0,
      previewOcrText: "Uw metingen Afname Ontvangst Testosteron Hematocriet"
    });

    expect(decision.primaryLanguage).toBe("nld");
    expect(decision.ocrPlan.primaryLang === "eng+nld" || decision.ocrPlan.primaryLang === "eng").toBe(true);
  });
});
