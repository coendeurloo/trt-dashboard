import { describe, expect, it } from "vitest";
import { matchMarker } from "../utils/markerMatcher";

describe("markerMatcher", () => {
  it("matches exact canonical names first", () => {
    const result = matchMarker("TSH");
    expect(result.confidence).toBe("exact");
    expect(result.canonical?.id).toBe("tsh");
    expect(result.score).toBe(1);
  });

  it("matches aliases and token overlap", () => {
    const aliasResult = matchMarker("thyroid stimulating hormone");
    expect(aliasResult.confidence).toBe("alias");
    expect(aliasResult.canonical?.id).toBe("tsh");

    const shbgResult = matchMarker("SHBG (sex.horm.bind. gl.)");
    expect(["alias", "normalized", "token"]).toContain(shbgResult.confidence);
    expect(shbgResult.canonical?.id).toBe("shbg");

    const tokenResult = matchMarker("absolute eosinophils count");
    expect(["token", "normalized", "alias"]).toContain(tokenResult.confidence);
    expect(tokenResult.canonical?.id).toBe("eosinophils-abs");
  });

  it("matches common lab-report variants that previously caused false errors", () => {
    const dheas = matchMarker("Dhea - So4");
    expect(["alias", "normalized", "token"]).toContain(dheas.confidence);
    expect(dheas.canonical?.id).toBe("dhea-s");

    const egfr = matchMarker("Glomerular Filtration");
    expect(["alias", "normalized", "token"]).toContain(egfr.confidence);
    expect(egfr.canonical?.id).toBe("egfr");

    const magnesium = matchMarker("Magnesium (serum)");
    expect(["alias", "normalized", "token"]).toContain(magnesium.confidence);
    expect(magnesium.canonical?.id).toBe("magnesium");

    const plateletcrit = matchMarker("Pct-plateletcrit");
    expect(["alias", "normalized", "token"]).toContain(plateletcrit.confidence);
    expect(plateletcrit.canonical?.id).toBe("plateletcrit");

    const psa = matchMarker("PSA");
    expect(["alias", "normalized", "token"]).toContain(psa.confidence);
    expect(psa.canonical?.id).toBe("psa-total");

    const sgot = matchMarker("Sgot (ast)");
    expect(["alias", "normalized", "token"]).toContain(sgot.confidence);
    expect(sgot.canonical?.id).toBe("asat");

    const sgpt = matchMarker("Sgpt (alt)");
    expect(["alias", "normalized", "token"]).toContain(sgpt.confidence);
    expect(sgpt.canonical?.id).toBe("alat");

    const te2 = matchMarker("T/E2 ratio");
    expect(["exact", "alias", "normalized", "token"]).toContain(te2.confidence);
    expect(te2.canonical?.id).toBe("testosterone-estradiol-ratio");

    const mpv = matchMarker("M.P.V.");
    expect(["exact", "alias", "normalized", "token", "fuzzy"]).toContain(mpv.confidence);
    expect(mpv.canonical?.id).toBe("mpv");

    const carbonDioxide = matchMarker("CO2 Total");
    expect(["exact", "alias", "normalized", "token"]).toContain(carbonDioxide.confidence);
    expect(carbonDioxide.canonical?.id).toBe("carbon-dioxide");

    const bicarbonate = matchMarker("Bicarbonate");
    expect(["exact", "alias", "normalized", "token"]).toContain(bicarbonate.confidence);
    expect(bicarbonate.canonical?.id).toBe("carbon-dioxide");

    const igf1 = matchMarker("IGF-1 (somatomedine C)");
    expect(["exact", "alias", "normalized", "token"]).toContain(igf1.confidence);
    expect(igf1.canonical?.id).toBe("igf-1");

    const igf1Sds = matchMarker("IGF-1 SDS");
    expect(["exact", "alias", "normalized", "token"]).toContain(igf1Sds.confidence);
    expect(igf1Sds.canonical?.id).toBe("igf-1-sds");
  });

  it("matches Cardio IQ particle markers from Quest layouts", () => {
    const ldlParticleNumber = matchMarker("LDL PARTICLE NUMBER");
    expect(["exact", "alias", "normalized", "token"]).toContain(ldlParticleNumber.confidence);
    expect(ldlParticleNumber.canonical?.id).toBe("ldl-particle-number");

    const ldlSmall = matchMarker("LDL SMALL");
    expect(["exact", "alias", "normalized", "token"]).toContain(ldlSmall.confidence);
    expect(ldlSmall.canonical?.id).toBe("ldl-small");

    const ldlMedium = matchMarker("LDL MEDIUM");
    expect(["exact", "alias", "normalized", "token"]).toContain(ldlMedium.confidence);
    expect(ldlMedium.canonical?.id).toBe("ldl-medium");

    const hdlLarge = matchMarker("HDL LARGE");
    expect(["exact", "alias", "normalized", "token"]).toContain(hdlLarge.confidence);
    expect(hdlLarge.canonical?.id).toBe("hdl-large");

    const ldlPeakSize = matchMarker("LDL PEAK SIZE");
    expect(["exact", "alias", "normalized", "token"]).toContain(ldlPeakSize.confidence);
    expect(ldlPeakSize.canonical?.id).toBe("ldl-peak-size");

    const ldlPattern = matchMarker("LDL PATTERN");
    expect(["exact", "alias", "normalized", "token"]).toContain(ldlPattern.confidence);
    expect(ldlPattern.canonical?.id).toBe("ldl-pattern");

    const lpa = matchMarker("LIPOPROTEIN (a)");
    expect(["exact", "alias", "normalized", "token"]).toContain(lpa.confidence);
    expect(lpa.canonical?.id).toBe("lipoprotein-a");

    const cholHdlcRatio = matchMarker("CHOL/HDLC RATIO");
    expect(["exact", "alias", "normalized", "token"]).toContain(cholHdlcRatio.confidence);
    expect(cholHdlcRatio.canonical?.id).toBe("total-cholesterol-hdl-ratio");
  });

  it("falls back to fuzzy when typo is close enough", () => {
    const result = matchMarker("ferritne");
    expect(["fuzzy", "alias", "normalized"]).toContain(result.confidence);
    expect(result.canonical?.id).toBe("ferritin");
  });

  it("returns unmatched when no candidate passes thresholds", () => {
    const result = matchMarker("completely made up marker name");
    expect(result.confidence).toBe("unmatched");
    expect(result.canonical).toBeNull();
    expect(result.score).toBe(0);
  });
});
