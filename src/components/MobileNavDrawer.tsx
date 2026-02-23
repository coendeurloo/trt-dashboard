import { ReactNode, useEffect, useId, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface MobileNavDrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

const MobileNavDrawer = ({ open, title, onClose, children }: MobileNavDrawerProps) => {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    closeButtonRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[55] bg-slate-950/70 lg:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          data-testid="mobile-nav-overlay"
        >
          <motion.div
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="mobile-menu-shell h-full w-[min(88vw,360px)] border-r border-slate-700/70 bg-slate-900/95 p-3 shadow-soft"
            initial={{ x: -24, opacity: 0.96 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -24, opacity: 0.96 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 id={titleId} className="text-sm font-semibold text-slate-100">
                {title}
              </h2>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="Close navigation"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-600 bg-slate-900/80 text-slate-200 hover:border-cyan-500/60 hover:text-cyan-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="h-[calc(100%-2.5rem)] overflow-y-auto pr-1">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

export default MobileNavDrawer;
