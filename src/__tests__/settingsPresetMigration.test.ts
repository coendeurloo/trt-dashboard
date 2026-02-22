import { describe, expect, it } from "vitest";
import { coerceStoredAppData } from "../storage";
import { AppSettings } from "../types";

const withSettings = (settings: Partial<AppSettings>) =>
  ({
    settings
  }) as unknown as Parameters<typeof coerceStoredAppData>[0];

describe("dashboard preset migration", () => {
  it("maps legacy conflicting overlay combo to clinical preset", () => {
    const coerced = coerceStoredAppData(
      withSettings({
        showReferenceRanges: true,
        showAbnormalHighlights: true,
        showAnnotations: true,
        showTrtTargetZone: true,
        showLongevityTargetZone: false,
        yAxisMode: "zero"
      })
    );

    expect(coerced.settings.dashboardChartPreset).toBe("clinical");
  });

  it("infers protocol preset from matching visual settings", () => {
    const coerced = coerceStoredAppData(
      withSettings({
        showReferenceRanges: false,
        showAbnormalHighlights: true,
        showAnnotations: true,
        showTrtTargetZone: false,
        showLongevityTargetZone: false,
        yAxisMode: "data"
      })
    );

    expect(coerced.settings.dashboardChartPreset).toBe("protocol");
  });

  it("keeps non-preset combinations as custom", () => {
    const coerced = coerceStoredAppData(
      withSettings({
        showReferenceRanges: true,
        showAbnormalHighlights: false,
        showAnnotations: true,
        showTrtTargetZone: false,
        showLongevityTargetZone: false,
        yAxisMode: "zero"
      })
    );

    expect(coerced.settings.dashboardChartPreset).toBe("custom");
  });
});
