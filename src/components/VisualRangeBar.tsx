import { CSSProperties } from "react";
import { RangeType } from "../data/markerDatabase";

interface VisualRangeBarProps {
  value: number;
  rangeType: RangeType;
  min?: number;
  max?: number;
  optimalMin?: number;
  optimalMax?: number;
  unit?: string;
}

const RED_ZONE = "rgba(239, 68, 68, 0.15)";
const GREEN_ZONE = "rgba(34, 197, 94, 0.2)";
const OPTIMAL_ZONE = "rgba(34, 197, 94, 0.35)";
const GRAY_ZONE = "rgba(148, 163, 184, 0.25)";

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

function getDisplayBounds(rangeType: RangeType, min: number | undefined, max: number | undefined, value: number) {
  if (rangeType === "min-max" && min !== undefined && max !== undefined) {
    const range = max - min;
    const displayMin = Math.max(0, min - range * 0.35);
    const displayMax = max + range * 0.35;
    return { displayMin, displayMax };
  }
  if (rangeType === "max-only" && max !== undefined) {
    return { displayMin: 0, displayMax: Math.max(max * 1.6, value * 1.2) };
  }
  if (rangeType === "min-only" && min !== undefined) {
    return { displayMin: 0, displayMax: Math.max(min * 3.5, value * 1.4) };
  }
  return { displayMin: 0, displayMax: value * 2 || 10 };
}

const toPercent = (value: number, displayMin: number, displayMax: number): number => {
  if (displayMax <= displayMin) {
    return 0;
  }
  return ((value - displayMin) / (displayMax - displayMin)) * 100;
};

const toGradient = (normalStart: number, normalEnd: number, optimalStart?: number, optimalEnd?: number): string => {
  const start = clamp(normalStart, 0, 100);
  const end = clamp(normalEnd, 0, 100);

  if (optimalStart !== undefined && optimalEnd !== undefined && optimalEnd > optimalStart) {
    const oStart = clamp(optimalStart, start, end);
    const oEnd = clamp(optimalEnd, start, end);
    return `linear-gradient(to right, ${RED_ZONE} 0%, ${RED_ZONE} ${start}%, ${GREEN_ZONE} ${start}%, ${GREEN_ZONE} ${oStart}%, ${OPTIMAL_ZONE} ${oStart}%, ${OPTIMAL_ZONE} ${oEnd}%, ${GREEN_ZONE} ${oEnd}%, ${GREEN_ZONE} ${end}%, ${RED_ZONE} ${end}%, ${RED_ZONE} 100%)`;
  }

  return `linear-gradient(to right, ${RED_ZONE} 0%, ${RED_ZONE} ${start}%, ${GREEN_ZONE} ${start}%, ${GREEN_ZONE} ${end}%, ${RED_ZONE} ${end}%, ${RED_ZONE} 100%)`;
};

const getMarkerColor = (rangeType: RangeType, value: number, min?: number, max?: number): string => {
  if (rangeType === "none") {
    return "#94a3b8";
  }

  if (rangeType === "min-max" && min !== undefined && max !== undefined) {
    if (value >= min && value <= max) {
      return "#22c55e";
    }
    const span = Math.max(max - min, 1e-6);
    const distance = value < min ? min - value : value - max;
    return distance / span <= 0.15 ? "#f59e0b" : "#ef4444";
  }

  if (rangeType === "max-only" && max !== undefined) {
    if (value <= max) {
      return "#22c55e";
    }
    const span = Math.max(max, 1e-6);
    return (value - max) / span <= 0.15 ? "#f59e0b" : "#ef4444";
  }

  if (rangeType === "min-only" && min !== undefined) {
    if (value >= min) {
      return "#22c55e";
    }
    const span = Math.max(min, 1e-6);
    return (min - value) / span <= 0.15 ? "#f59e0b" : "#ef4444";
  }

  return "#94a3b8";
};

const getBackground = (
  rangeType: RangeType,
  displayMin: number,
  displayMax: number,
  min?: number,
  max?: number,
  optimalMin?: number,
  optimalMax?: number
): string => {
  if (rangeType === "none") {
    return GRAY_ZONE;
  }

  if (rangeType === "min-max" && min !== undefined && max !== undefined) {
    const normalStart = toPercent(min, displayMin, displayMax);
    const normalEnd = toPercent(max, displayMin, displayMax);
    if (optimalMin !== undefined && optimalMax !== undefined) {
      return toGradient(
        normalStart,
        normalEnd,
        toPercent(optimalMin, displayMin, displayMax),
        toPercent(optimalMax, displayMin, displayMax)
      );
    }
    return toGradient(normalStart, normalEnd);
  }

  if (rangeType === "max-only" && max !== undefined) {
    const normalEnd = toPercent(max, displayMin, displayMax);
    if (optimalMax !== undefined) {
      return toGradient(0, normalEnd, 0, toPercent(optimalMax, displayMin, displayMax));
    }
    return toGradient(0, normalEnd);
  }

  if (rangeType === "min-only" && min !== undefined) {
    const normalStart = toPercent(min, displayMin, displayMax);
    if (optimalMin !== undefined) {
      return toGradient(normalStart, 100, toPercent(optimalMin, displayMin, displayMax), 100);
    }
    return toGradient(normalStart, 100);
  }

  return GRAY_ZONE;
};

const VisualRangeBar = ({ value, rangeType, min, max, optimalMin, optimalMax, unit }: VisualRangeBarProps) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return <span className="text-slate-500">-</span>;
  }

  const hasAnyRange =
    (rangeType === "min-max" && min !== undefined && max !== undefined) ||
    (rangeType === "max-only" && max !== undefined) ||
    (rangeType === "min-only" && min !== undefined);

  const { displayMin, displayMax } = getDisplayBounds(rangeType, min, max, numericValue);
  const rawPercent = toPercent(numericValue, displayMin, displayMax);
  const markerPercent = clamp(rawPercent, 2, 98);
  const overflowLeft = rawPercent < 0;
  const overflowRight = rawPercent > 100;

  const markerColor = getMarkerColor(rangeType, numericValue, min, max);
  const barBackground = hasAnyRange
    ? getBackground(rangeType, displayMin, displayMax, min, max, optimalMin, optimalMax)
    : GRAY_ZONE;

  const markerStyle: CSSProperties = {
    position: "absolute",
    left: `${markerPercent}%`,
    top: "50%",
    width: 12,
    height: 12,
    borderRadius: "9999px",
    transform: "translate(-50%, -50%)",
    backgroundColor: markerColor,
    border: "2px solid rgba(15, 23, 42, 0.9)",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.55)"
  };

  const arrowStyle: CSSProperties = {
    position: "absolute",
    top: "50%",
    width: 0,
    height: 0,
    transform: "translateY(-50%)",
    borderTop: "4px solid transparent",
    borderBottom: "4px solid transparent"
  };

  const leftArrowStyle: CSSProperties = {
    ...arrowStyle,
    left: -8,
    borderRight: "6px solid #f59e0b"
  };

  const rightArrowStyle: CSSProperties = {
    ...arrowStyle,
    right: -8,
    borderLeft: "6px solid #f59e0b"
  };

  return (
    <div className="mx-auto flex w-full min-w-[120px] max-w-[170px] items-center justify-center">
      <div
        className="relative h-2 w-full rounded-full"
        style={{
          background: barBackground,
          border: "1px solid rgba(148, 163, 184, 0.25)",
          overflow: "visible"
        }}
        aria-label={
          unit
            ? `Range bar (${rangeType}) value ${numericValue} ${unit}`
            : `Range bar (${rangeType}) value ${numericValue}`
        }
      >
        {overflowLeft ? <span aria-hidden style={leftArrowStyle} /> : null}
        {overflowRight ? <span aria-hidden style={rightArrowStyle} /> : null}
        <span style={markerStyle} />
      </div>
    </div>
  );
};

export default VisualRangeBar;
