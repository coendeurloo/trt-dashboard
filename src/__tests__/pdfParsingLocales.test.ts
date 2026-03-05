import { describe, expect, it } from "vitest";
import { detectActiveParserLanguagePacks, resolveParserOcrLangs } from "../pdfParsing/locales";

describe("pdfParsing locale OCR language resolution", () => {
  it("caps sparse fallback OCR languages using configured priority", () => {
    const langs = resolveParserOcrLangs("", "scan-2026-03-05.pdf").split("+");

    expect(langs).toEqual(["eng"]);
  });

  it("keeps detected locale language and fills to cap for sparse text", () => {
    const langs = resolveParserOcrLangs("Din værdi: 5.1 Normalområde: Højere end 3.5", "report.pdf").split("+");

    expect(langs).toContain("eng");
    expect(langs).toContain("dan");
    expect(langs).toHaveLength(2);
  });

  it("does not add non-english OCR packs on generic english terms", () => {
    const langs = resolveParserOcrLangs("Interpretation: Testosterone 18.2 Reference range: 8.6 - 29", "report.pdf").split("+");

    expect(langs).toEqual(["eng"]);
  });
});

describe("pdfParsing locale detection", () => {
  it("detects Danish parser pack", () => {
    const packs = detectActiveParserLanguagePacks("Din værdi: 5.1 Normalområde: Højere end 3.5", "da-report.pdf");
    expect(packs.map((pack) => pack.id)).toContain("da");
  });

  it("detects German parser pack", () => {
    const packs = detectActiveParserLanguagePacks("Ihr Wert: 12,4 Normalbereich: Höher als 8,0", "de-bericht.pdf");
    expect(packs.map((pack) => pack.id)).toContain("de");
  });

  it("detects Spanish parser pack", () => {
    const packs = detectActiveParserLanguagePacks("Su valor: 12,4 Rango normal: Mayor que 8,0", "es-informe.pdf");
    expect(packs.map((pack) => pack.id)).toContain("es");
  });

  it("detects Portuguese parser pack", () => {
    const packs = detectActiveParserLanguagePacks("Seu valor: 12,4 Faixa normal: Maior que 8,0", "pt-br-relatorio.pdf");
    expect(packs.map((pack) => pack.id)).toContain("pt-br");
  });

  it("detects French parser pack", () => {
    const packs = detectActiveParserLanguagePacks("Votre valeur: 12,4 Valeur de référence: Supérieur à 8,0", "fr-rapport.pdf");
    expect(packs.map((pack) => pack.id)).toContain("fr");
  });

  it("detects Polish parser pack", () => {
    const packs = detectActiveParserLanguagePacks("Twoja wartość: 12,4 Zakres referencyjny: Powyżej 8,0", "pl-raport.pdf");
    expect(packs.map((pack) => pack.id)).toContain("pl");
  });
});

