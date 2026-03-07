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
  const stageId = useId();
  const stageText = (() => {
    if (processingStage === "reading_text_layer") {
      return tr("Tekstlaag lokaal lezen (nog geen externe AI)...", "Reading text layer locally (no external AI yet)...");
    }
    if (processingStage === "running_ocr") {
      return tr(
        "Lokale OCR uitvoeren op scans (kan tot ongeveer 2 minuten duren, nog geen externe AI)...",
        "Running local OCR on scans (can take up to about 2 minutes, no external AI yet)..."
      );
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
      className={`upload-panel-shell rounded-2xl border border-dashed p-2.5 transition ${
        isDragActive
          ? "border-cyan-400 bg-cyan-500/10"
          : "border-slate-600/50 bg-slate-900/30 hover:border-cyan-500/50"
      }`}
    >
      <div
        {...getRootProps({
          role: "button",
          "aria-label": dropzoneLabel,
          "aria-describedby": stageId,
          "aria-busy": isProcessing
        })}
        className="upload-panel-dropzone flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-center"
        onMouseEnter={onUploadIntent}
        onFocusCapture={onUploadIntent}
        onTouchStart={onUploadIntent}
      >
        <input {...getInputProps()} />
        {isProcessing ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
            <p id={stageId} role="status" aria-live="polite" className="text-xs text-slate-200">
              {stageText}
            </p>
          </>
        ) : (
          <>
            <UploadCloud className="h-6 w-6 text-cyan-300" />
            <div className="max-w-xs">
              <p className="text-sm font-semibold text-slate-100">{tr("Upload lab-PDF", "Upload lab PDF")}</p>
              <p className="mt-0.5 text-xs text-slate-300">{tr("Tekst-PDF werkt het best. Scan? Dan gebruiken we OCR.", "Text PDFs work best. Scanned file? We'll use OCR.")}</p>
              <p className="mt-1 inline-flex items-center rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-0.5 text-[11px] font-medium text-cyan-200">
                {tr("Klik of sleep PDF hier", "Click or drop PDF here")}
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
