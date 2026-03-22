import { describe, expect, it } from "vitest";
import { resolveMarkerOverlayStyle } from "../components/MarkerTrendChart";

describe("resolveMarkerOverlayStyle", () => {
  it("returns distinct styles for each layer in light mode", () => {
    const reference = resolveMarkerOverlayStyle("light", "reference");
    const trt = resolveMarkerOverlayStyle("light", "trt");
    const longevity = resolveMarkerOverlayStyle("light", "longevity");

    expect(reference.fill).toBe("#16a34a");
    expect(trt.fill).toBe("#0284c7");
    expect(longevity.fill).toBe("#9333ea");

    expect(reference.fillOpacity).toBeGreaterThan(0.1);
    expect(trt.strokeWidth).toBeGreaterThan(reference.strokeWidth);
    expect(longevity.strokeOpacity).toBeGreaterThan(0.7);
  });

  it("returns a calmer but still visible set in dark mode", () => {
    const reference = resolveMarkerOverlayStyle("dark", "reference");
    const trt = resolveMarkerOverlayStyle("dark", "trt");
    const longevity = resolveMarkerOverlayStyle("dark", "longevity");

    expect(reference.fillOpacity).toBeLessThan(0.12);
    expect(trt.fillOpacity).toBeGreaterThanOrEqual(0.12);
    expect(longevity.strokeOpacity).toBeGreaterThan(0.5);
  });
});
