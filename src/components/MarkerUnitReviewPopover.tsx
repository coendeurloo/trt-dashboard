import { RefObject, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, X } from "lucide-react";
import { trLocale } from "../i18n";
import { AppLanguage } from "../types";
import { MarkerUnitReview } from "../utils/unitReview";

const POPOVER_EDGE_PADDING = 12;
const POPOVER_MIN_WIDTH = 300;
const POPOVER_MAX_WIDTH = 360;
const POPOVER_GAP = 10;

interface MarkerUnitReviewPopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  language: AppLanguage;
  open: boolean;
  unitReview: MarkerUnitReview;
  selectedUnit: string;
  onSelectedUnitChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

const MarkerUnitReviewPopover = ({
  anchorRef,
  language,
  open,
  unitReview,
  selectedUnit,
  onSelectedUnitChange,
  onConfirm,
  onClose
}: MarkerUnitReviewPopoverProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open || !anchorRef.current || typeof window === "undefined") {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      if (!anchorRef.current) {
        return;
      }
      const rect = anchorRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(
        POPOVER_MAX_WIDTH,
        Math.max(POPOVER_MIN_WIDTH, viewportWidth - POPOVER_EDGE_PADDING * 2)
      );
      const maxLeft = Math.max(POPOVER_EDGE_PADDING, viewportWidth - width - POPOVER_EDGE_PADDING);
      const left = Math.max(
        POPOVER_EDGE_PADDING,
        Math.min(rect.left + rect.width / 2 - width / 2, maxLeft)
      );
      const popoverHeight = popoverRef.current?.getBoundingClientRect().height ?? 240;
      const showBelow = rect.bottom + POPOVER_GAP + popoverHeight <= viewportHeight - POPOVER_EDGE_PADDING;
      const top = showBelow
        ? rect.bottom + POPOVER_GAP
        : Math.max(POPOVER_EDGE_PADDING, rect.top - popoverHeight - POPOVER_GAP);
      setPosition({ top, left, width });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, open, selectedUnit, unitReview]);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (popoverRef.current?.contains(target) || anchorRef.current?.contains(target)) {
        return;
      }
      onClose();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [anchorRef, onClose, open]);

  const suggestionReason = useMemo(() => {
    const suggestion = unitReview.suggestion;
    if (!suggestion) {
      return tr(
        "Geen veilige suggestie gevonden. Kies hieronder handmatig een gangbare unit.",
        "No safe suggestion was found. Choose a common unit manually below."
      );
    }
    if (suggestion.matchedBy.referenceMin || suggestion.matchedBy.referenceMax) {
      return tr(
        "Deze suggestie past bij de marker, waarde en het referentiebereik.",
        "This suggestion fits the marker, value, and reference range."
      );
    }
    return tr(
      "Deze suggestie past bij de marker en waarde.",
      "This suggestion fits the marker and value."
    );
  }, [tr, unitReview.suggestion]);

  if (!open || !position || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={popoverRef}
      className="review-tooltip fixed z-[140] rounded-xl border border-slate-700 bg-slate-900/96 p-4 text-sm text-slate-100 shadow-2xl"
      style={{ top: position.top, left: position.left, width: position.width }}
      role="dialog"
      aria-modal="false"
      aria-label={tr("Unit controleren", "Review unit")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-50">{tr("Ontbrekende unit", "Missing unit")}</p>
          <p className="mt-1 text-xs leading-5 text-slate-300">{suggestionReason}</p>
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          onClick={onClose}
          aria-label={tr("Sluiten", "Close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {unitReview.suggestion ? (
        <div className="mt-3 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-200">
            {tr("Voorgesteld", "Suggested")}
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-100">
            <CheckCircle2 className="h-4 w-4" />
            {unitReview.suggestion.unit}
          </p>
        </div>
      ) : null}

      <label className="mt-3 block text-xs text-slate-300">
        <span className="mb-1.5 block">{tr("Kies unit", "Choose unit")}</span>
        <select
          className="w-full rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
          value={selectedUnit}
          onChange={(event) => onSelectedUnitChange(event.target.value)}
        >
          <option value="">{tr("Selecteer een unit", "Select a unit")}</option>
          {unitReview.options.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-500 hover:text-slate-50"
          onClick={onClose}
        >
          {tr("Annuleren", "Cancel")}
        </button>
        <button
          type="button"
          className="rounded-lg border border-cyan-500/45 bg-cyan-500/15 px-3 py-1.5 text-sm font-medium text-cyan-100 transition hover:border-cyan-400/70 hover:bg-cyan-500/22 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!selectedUnit.trim()}
          onClick={onConfirm}
        >
          {tr("Bevestigen", "Confirm")}
        </button>
      </div>
    </div>,
    document.body
  );
};

export default MarkerUnitReviewPopover;
