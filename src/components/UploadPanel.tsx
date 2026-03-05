import { motion } from "framer-motion";
import { Loader2, UploadCloud } from "lucide-react";
import { useId } from "react";
import { useDropzone } from "react-dropzone";
import { trLocale } from "../i18n";
import { AppLanguage, ParserStage } from "../types";

export interface UploadPanelProps {
  isProcessing: boolean;
  processingStage?: ParserStage | null;
  onFileSelected: (file: File) => void;
  onUploadIntent?: () => void;
  language: AppLanguage;
}

const UploadPanel = ({ isProcessing, processingStage = null, onFileSelected, onUploadIntent, language }: UploadPanelProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const hintId = useId();
  const stageId = useId();
  const flowLabelId = useId();
  const stageText = (() => {
    if (processingStage === "reading_text_layer") {
      return tr("Tekstlaag lokaal lezen (nog geen externe AI)...", "Reading text layer locally (no external AI yet)...");
    }
    if (processingStage === "running_ocr") {
      return tr("Lokale OCR uitvoeren op scans (nog geen externe AI)...", "Running local OCR on scans (no external AI yet)...");
    }
    if (processingStage === "running_ai_text") {
      return tr("Geanonimiseerde tekst naar AI sturen...", "Sending redacted text to AI...");
    }
    if (processingStage === "running_ai_pdf_rescue") {
      return tr("PDF naar AI sturen voor parser-rescue...", "Sending PDF to AI for parser rescue...");
    }
    if (processingStage === "failed") {
      return tr("Extractie mislukt.", "Extraction failed.");
    }
    return tr("PDF wordt verwerkt en labwaarden worden uitgelezen...", "Processing PDF and extracting lab values...");
  })();
  const stageFlow = (() => {
    const steps = [
      { key: "upload", label: tr("Upload", "Upload"), state: "done" as const },
      { key: "text", label: tr("Tekstlaag", "Text layer"), state: "pending" as const },
      { key: "ocr", label: tr("OCR", "OCR"), state: "pending" as const },
      { key: "ai", label: tr("AI rescue", "AI rescue"), state: "pending" as const }
    ];

    if (!isProcessing && processingStage !== "done") {
      return steps;
    }
    if (processingStage === "reading_text_layer") {
      return steps.map((step) => (step.key === "text" ? { ...step, state: "active" as const } : step));
    }
    if (processingStage === "running_ocr") {
      return steps.map((step) => {
        if (step.key === "text") {
          return { ...step, state: "done" as const };
        }
        if (step.key === "ocr") {
          return { ...step, state: "active" as const };
        }
        return step;
      });
    }
    if (processingStage === "running_ai_text" || processingStage === "running_ai_pdf_rescue") {
      return steps.map((step) => {
        if (step.key === "text" || step.key === "ocr") {
          return { ...step, state: "done" as const };
        }
        if (step.key === "ai") {
          return { ...step, state: "active" as const };
        }
        return step;
      });
    }
    if (processingStage === "done") {
      return steps.map((step) => ({ ...step, state: "done" as const }));
    }
    if (processingStage === "failed") {
      return steps.map((step) => (step.key === "text" ? { ...step, state: "error" as const } : step));
    }
    return steps;
  })();
  const dropzoneLabel = isProcessing
    ? tr("PDF verwerking bezig. Upload tijdelijk uitgeschakeld.", "PDF processing in progress. Upload temporarily disabled.")
    : tr("Uploadgebied voor lab PDF. Klik of sleep bestand hier.", "Upload area for lab PDF. Click or drop file here.");
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "application/pdf": [".pdf"]
    },
    maxFiles: 1,
    disabled: isProcessing,
    onDrop: (files) => {
      const file = files[0];
      if (!file) {
        return;
      }
      onFileSelected(file);
    }
  });

  return (
    <motion.div
      layout
      className={`upload-panel-shell rounded-2xl border border-dashed p-5 transition ${
        isDragActive
          ? "border-cyan-400 bg-cyan-500/10"
          : "border-slate-600/50 bg-slate-900/30 hover:border-cyan-500/50"
      }`}
    >
      <div
        {...getRootProps({
          role: "button",
          "aria-label": dropzoneLabel,
          "aria-describedby": `${hintId} ${stageId}`,
          "aria-busy": isProcessing
        })}
        className="upload-panel-dropzone flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl px-4 py-9 text-center"
        onMouseEnter={onUploadIntent}
        onFocusCapture={onUploadIntent}
        onTouchStart={onUploadIntent}
      >
        <input {...getInputProps()} />
        <div className="w-full max-w-xs" aria-labelledby={flowLabelId}>
          <p id={flowLabelId} className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {tr("Verwerkingsstappen", "Processing steps")}
          </p>
          <ol className="mt-2 grid grid-cols-2 gap-1 text-left text-[11px]">
            {stageFlow.map((step) => (
              <li
                key={step.key}
                className={`rounded border px-2 py-1 ${
                  step.state === "done"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                    : step.state === "active"
                      ? "border-cyan-500/45 bg-cyan-500/12 text-cyan-100"
                      : step.state === "error"
                        ? "border-rose-500/45 bg-rose-500/12 text-rose-100"
                        : "border-slate-700 bg-slate-900/40 text-slate-400"
                }`}
              >
                {step.label}
              </li>
            ))}
          </ol>
        </div>
        {isProcessing ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-cyan-300" />
            <p id={stageId} role="status" aria-live="polite" className="text-sm text-slate-200">
              {stageText}
            </p>
          </>
        ) : (
          <>
            <UploadCloud className="h-10 w-10 text-cyan-300" />
            <div className="max-w-xs">
              <p className="text-lg font-semibold text-slate-100">{tr("Upload lab-PDF", "Upload lab PDF")}</p>
              <p className="mt-1 text-sm text-slate-300">{tr("Tekst-PDF werkt het best. Scan? Dan gebruiken we OCR.", "Text PDFs work best. Scanned file? We'll use OCR.")}</p>
              <p className="mt-3 inline-flex items-center rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-200">
                {tr("Klik of sleep PDF hier", "Click or drop PDF here")}
              </p>
              <p id={hintId} className="mt-2 text-xs text-slate-400">
                {tr("Mobiel werkt ook: tik om een PDF te kiezen.", "Mobile also works: tap to choose a PDF.")}
              </p>
              <p id={stageId} className="sr-only">
                {tr("Upload gereed.", "Upload ready.")}
              </p>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default UploadPanel;
