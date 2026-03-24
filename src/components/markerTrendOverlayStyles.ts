type OverlayLayerKey = "reference" | "trt" | "longevity";
export type ThemeKey = "dark" | "light";

interface OverlayStyle {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeOpacity: number;
  strokeWidth: number;
}

const OVERLAY_STYLES: Record<ThemeKey, Record<OverlayLayerKey, OverlayStyle>> = {
  dark: {
    reference: {
      fill: "#22c55e",
      fillOpacity: 0.1,
      stroke: "#22c55e",
      strokeOpacity: 0.45,
      strokeWidth: 1
    },
    trt: {
      fill: "#0ea5e9",
      fillOpacity: 0.12,
      stroke: "#0ea5e9",
      strokeOpacity: 0.5,
      strokeWidth: 1
    },
    longevity: {
      fill: "#a855f7",
      fillOpacity: 0.12,
      stroke: "#a855f7",
      strokeOpacity: 0.52,
      strokeWidth: 1
    }
  },
  light: {
    reference: {
      fill: "#16a34a",
      fillOpacity: 0.14,
      stroke: "#15803d",
      strokeOpacity: 0.68,
      strokeWidth: 1.2
    },
    trt: {
      fill: "#0284c7",
      fillOpacity: 0.16,
      stroke: "#0369a1",
      strokeOpacity: 0.75,
      strokeWidth: 1.25
    },
    longevity: {
      fill: "#9333ea",
      fillOpacity: 0.15,
      stroke: "#7e22ce",
      strokeOpacity: 0.76,
      strokeWidth: 1.25
    }
  }
};

export const resolveMarkerOverlayStyle = (theme: ThemeKey, layer: OverlayLayerKey): OverlayStyle => OVERLAY_STYLES[theme][layer];

