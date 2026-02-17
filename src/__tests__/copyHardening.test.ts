import { describe, expect, it } from "vitest";
import { t, trLocale } from "../i18n";
import { translateFromEnglish } from "../locales/enToExtraLocales";

describe("pre-launch copy hardening", () => {
  it("uses hormone-stability wording instead of TRT-stability wording", () => {
    expect(t("en", "trtStabilityShort")).toBe("Hormone stability");
    expect(t("nl", "trtStabilityShort")).toBe("Hormonale stabiliteit");
  });

  it("has translatable optimal-zone wording for extra locales", () => {
    const english = trLocale("en", "Doelzone", "Optimal zone");
    expect(english).toBe("Optimal zone");
    expect(translateFromEnglish("es", english)).toBe("Zona óptima");
    expect(translateFromEnglish("pt", english)).toBe("Zona ideal");
    expect(translateFromEnglish("de", english)).toBe("Optimale Zone");
  });
});
