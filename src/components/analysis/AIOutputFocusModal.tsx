import { format, parseISO } from "date-fns";
import { FileText, Loader2, X } from "lucide-react";
import { Suspense, lazy, useEffect } from "react";

const AnalysisMarkdownBlock = lazy(() => import("../AnalysisMarkdownBlock"));

interface AIOutputFocusModalProps {
  open: boolean;
  analysisRequestState: "idle" | "preparing" | "streaming" | "completed" | "error";
  title: string;
  questionLabel: string;
  questionValue: string | null;
  analysisRawText: string;
  analysisResultDisplay: string;
  analysisGeneratedAt: string | null;
  analysisCopied: boolean;
  isDarkTheme: boolean;
  copyLabel: string;
  copiedLabel: string;
  closeLabel: string;
  lastRunLabel: string;
  loadingFormatLabel: string;
  preparingStatusLabel: string;
  streamingStatusLabel: string;
  onClose: () => void;
  onCopyAnalysis: () => void;
}

const formatTimestamp = (value: string): string => {
  try {
    return format(parseISO(value), "dd MMM yyyy HH:mm");
  } catch {
    return value;
  }
};

const AIOutputFocusModal = ({
  open,
  analysisRequestState,
  title,
  questionLabel,
  questionValue,
  analysisRawText,
  analysisResultDisplay,
  analysisGeneratedAt,
  analysisCopied,
  isDarkTheme,
  copyLabel,
  copiedLabel,
  closeLabel,
  lastRunLabel,
  loadingFormatLabel,
  preparingStatusLabel,
  streamingStatusLabel,
  onClose,
  onCopyAnalysis
}: AIOutputFocusModalProps) => {
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

  if (!open) {
    return null;
  }

  const isPreparing = analysisRequestState === "preparing";
  const isStreaming = analysisRequestState === "streaming";
  const showLiveOutput = (isPreparing || isStreaming) && analysisRawText.length > 0;
  const showLoadingCard = (isPreparing || isStreaming) && analysisRawText.length === 0;

  return (
    <div className="app-modal-overlay z-[86] p-3 sm:p-6" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={
          isDarkTheme
            ? "app-modal-shell w-full max-w-4xl bg-slate-900 shadow-soft"
            : "app-modal-shell w-full max-w-4xl bg-white shadow-soft"
        }
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={
            isDarkTheme
              ? "flex items-start justify-between gap-3 border-b border-slate-700/70 px-4 py-3 sm:px-5"
              : "flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5"
          }
        >
          <div className="space-y-1">
            <h3 className={isDarkTheme ? "text-base font-semibold text-slate-100" : "text-base font-semibold text-slate-900"}>{title}</h3>
            {questionValue ? (
              <p className={isDarkTheme ? "text-xs text-slate-400" : "text-xs text-slate-600"}>
                {questionLabel} {questionValue}
              </p>
            ) : null}
            {analysisGeneratedAt ? (
              <p className={isDarkTheme ? "text-xs text-slate-500" : "text-xs text-slate-500"}>
                {lastRunLabel}: {formatTimestamp(analysisGeneratedAt)}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={
                isDarkTheme
                  ? "inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                  : "inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
              }
              onClick={onCopyAnalysis}
              disabled={!analysisRawText || isPreparing || isStreaming}
            >
              <FileText className="h-4 w-4" /> {analysisCopied ? copiedLabel : copyLabel}
            </button>
            <button
              type="button"
              className={
                isDarkTheme
                  ? "inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                  : "inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
              }
              onClick={onClose}
            >
              <X className="h-4 w-4" /> {closeLabel}
            </button>
          </div>
        </div>
        <div className={isDarkTheme ? "max-h-[72vh] overflow-y-auto p-4 sm:p-5" : "max-h-[72vh] overflow-y-auto p-4 sm:p-5"}>
          {showLoadingCard ? (
            <div className={isDarkTheme ? "rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-300" : "rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"}>
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                {preparingStatusLabel}
              </span>
            </div>
          ) : null}

          {showLiveOutput ? (
            <div
              className={
                isDarkTheme
                  ? "rounded-xl border border-cyan-500/25 bg-slate-950/70 p-4 text-sm text-slate-100"
                  : "rounded-xl border border-cyan-300/70 bg-cyan-50/80 p-4 text-sm text-slate-800"
              }
            >
              <p className={isDarkTheme ? "mb-2 text-xs uppercase tracking-wide text-cyan-200" : "mb-2 text-xs uppercase tracking-wide text-cyan-700"}>
                {streamingStatusLabel}
              </p>
              <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed">{analysisRawText}</pre>
              <span className={isDarkTheme ? "mt-2 inline-flex h-4 w-[2px] animate-pulse bg-current text-slate-300" : "mt-2 inline-flex h-4 w-[2px] animate-pulse bg-current text-slate-600"} />
            </div>
          ) : null}

          {analysisRawText && !showLiveOutput ? (
            <div className={isDarkTheme ? "prose-premium-dark" : "prose-premium-light"}>
              <Suspense
                fallback={
                  <div className={isDarkTheme ? "rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-300" : "rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"}>
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                      {loadingFormatLabel}
                    </span>
                  </div>
                }
              >
                <AnalysisMarkdownBlock content={analysisResultDisplay} isDarkTheme={isDarkTheme} />
              </Suspense>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default AIOutputFocusModal;
