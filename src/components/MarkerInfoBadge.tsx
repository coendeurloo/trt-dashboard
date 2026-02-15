import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { AppLanguage } from "../types";
import { getMarkerMeta } from "../i18n";
import { clampNumber } from "../chartHelpers";

export interface MarkerInfoBadgeProps {
  marker: string;
  language: AppLanguage;
}

const MarkerInfoBadge = ({ marker, language }: MarkerInfoBadgeProps) => {
  const meta = getMarkerMeta(marker, language);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!isOpen || !triggerRef.current || typeof window === "undefined") {
      return;
    }

    const TOOLTIP_WIDTH = 288;
    const TOOLTIP_HEIGHT_ESTIMATE = 230;
    const GAP = 10;
    const EDGE_PADDING = 10;

    const updatePosition = () => {
      if (!triggerRef.current) {
        return;
      }
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const maxLeft = Math.max(EDGE_PADDING, viewportWidth - TOOLTIP_WIDTH - EDGE_PADDING);
      const left = clampNumber(rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2, EDGE_PADDING, maxLeft);
      const placeBelow = rect.bottom + GAP + TOOLTIP_HEIGHT_ESTIMATE <= viewportHeight - EDGE_PADDING;
      const top = placeBelow
        ? rect.bottom + GAP
        : Math.max(EDGE_PADDING, rect.top - TOOLTIP_HEIGHT_ESTIMATE - GAP);

      setTooltipPosition({ top, left });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  const tooltip = isOpen && tooltipPosition && typeof document !== "undefined"
    ? createPortal(
        <div
          className="marker-info-tooltip pointer-events-none fixed z-[120] w-72 rounded-xl border border-slate-600 bg-slate-950/95 p-3 text-left text-xs text-slate-200 shadow-xl"
          style={{ top: tooltipPosition.top, left: tooltipPosition.left }}
        >
          <p className="font-semibold text-slate-100">{meta.title}</p>
          <p className="mt-1">{meta.what}</p>
          <p className="mt-1 text-slate-300">
            <strong>{language === "nl" ? "Waarom meten:" : "Why measured:"}</strong> {meta.why}
          </p>
          <p className="mt-1 text-slate-300">
            <strong>{language === "nl" ? "Bij tekort/laag:" : "If low:"}</strong> {meta.low}
          </p>
          <p className="mt-1 text-slate-300">
            <strong>{language === "nl" ? "Bij teveel/hoog:" : "If high:"}</strong> {meta.high}
          </p>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="inline-flex">
      <button
        type="button"
        ref={triggerRef}
        className="rounded-full p-0.5 text-slate-400 transition hover:text-cyan-200"
        aria-label={meta.title}
        aria-expanded={isOpen}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {tooltip}
    </div>
  );
};

export default MarkerInfoBadge;
