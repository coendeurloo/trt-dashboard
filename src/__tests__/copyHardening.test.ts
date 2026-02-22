import { describe, expect, it } from "vitest";
import { t, trLocale } from "../i18n";
import { translateFromEnglish } from "../locales/enToExtraLocales";

describe("pre-launch copy hardening", () => {
  it("uses hormone-stability wording instead of TRT-stability wording", () => {
    expect(t("en", "trtStabilityShort")).toBe("Hormone stability");
    expect(t("nl", "trtStabilityShort")).toBe("Hormonale stabiliteit");
  });

  it("has translatable TRT-target-zone wording for extra locales", () => {
    const english = trLocale("en", "TRT-streefzone", "TRT target zone");
    expect(english).toBe("TRT target zone");
    expect(translateFromEnglish("es", english)).toBe("Zona objetivo TRT");
    expect(translateFromEnglish("pt", english)).toBe("Zona-alvo TRT");
    expect(translateFromEnglish("de", english)).toBe("TRT-Zielbereich");
  });

  it("has translatable compare-2-markers wording for extra locales", () => {
    const english = trLocale("en", "Vergelijk 2 markers", "Compare 2 markers");
    expect(english).toBe("Compare 2 markers");
    expect(translateFromEnglish("es", english)).toBe("Comparar 2 marcadores");
    expect(translateFromEnglish("pt", english)).toBe("Comparar 2 marcadores");
    expect(translateFromEnglish("de", english)).toBe("2 Marker vergleichen");
  });
});
