import { ReactNode, useEffect, useId } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface ChartSettingsDrawerProps {
  id?: string;
  open: boolean;
  title: string;
  closeLabel: string;
  isDarkTheme: boolean;
  onClose: () => void;
  children: ReactNode;
}

const ChartSettingsDrawer = ({ id, open, title, closeLabel, isDarkTheme, onClose, children }: ChartSettingsDrawerProps) => {
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const drawerId = id || `${generatedId}-drawer`;

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
          className="fixed inset-0 z-[86] bg-slate-950/70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 flex items-end justify-end lg:items-stretch">
            <motion.section
              id={drawerId}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={{ y: 20, opacity: 0.96 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0.96 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={(event) => event.stopPropagation()}
              className={
                isDarkTheme
                  ? "w-full max-h-[92vh] overflow-hidden rounded-t-2xl border border-slate-700/80 bg-slate-950/95 shadow-2xl lg:h-full lg:max-h-none lg:w-[min(92vw,34rem)] lg:rounded-none lg:border-y-0 lg:border-r-0 lg:border-l"
                  : "w-full max-h-[92vh] overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl lg:h-full lg:max-h-none lg:w-[min(92vw,34rem)] lg:rounded-none lg:border-y-0 lg:border-r-0 lg:border-l"
              }
            >
              <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-500/40 lg:hidden" aria-hidden />
              <header className={isDarkTheme ? "flex items-center justify-between border-b border-slate-700/70 px-4 py-3" : "flex items-center justify-between border-b border-slate-200 px-4 py-3"}>
                <h3 id={titleId} className={isDarkTheme ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900"}>
                  {title}
                </h3>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={closeLabel}
                  className={
                    isDarkTheme
                      ? "inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500 hover:text-slate-100"
                      : "inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
                  }
                >
                  <X className="h-4 w-4" />
                </button>
              </header>
              <div className="h-[calc(92vh-3.5rem)] overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:h-[calc(100vh-3.5rem)]">
                {children}
              </div>
            </motion.section>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

export default ChartSettingsDrawer;
