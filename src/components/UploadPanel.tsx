import { motion } from "framer-motion";
import { Loader2, UploadCloud } from "lucide-react";
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
  const stageText = (() => {
    if (processingStage === "reading_text_layer") {
      return tr("Tekstlaag lezen...", "Reading text layer...");
    }
    if (processingStage === "running_ocr") {
      return tr("OCR uitvoeren op scans...", "Running OCR on scans...");
    }
    if (processingStage === "running_ai_text") {
      return tr("AI parser op geanonimiseerde tekst...", "Running AI parser on redacted text...");
    }
    if (processingStage === "running_ai_pdf_rescue") {
      return tr("AI PDF-rescue uitvoeren...", "Running AI PDF rescue...");
    }
    if (processingStage === "failed") {
      return tr("Extractie mislukt.", "Extraction failed.");
    }
    return tr("PDF wordt verwerkt en labwaarden worden uitgelezen...", "Processing PDF and extracting lab values...");
  })();
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
        {...getRootProps()}
        className="upload-panel-dropzone flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl px-4 py-9 text-center"
        onMouseEnter={onUploadIntent}
        onFocusCapture={onUploadIntent}
        onTouchStart={onUploadIntent}
      >
        <input {...getInputProps()} />
        {isProcessing ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-cyan-300" />
            <p className="text-sm text-slate-200">
              {stageText}
            </p>
          </>
        ) : (
          <>
            <UploadCloud className="h-9 w-9 text-cyan-300" />
            <div>
              <p className="text-base font-semibold text-slate-100">
                {tr(
                  "Upload een lab-PDF (tekst-PDF werkt het best).",
                  "Upload a lab PDF (text PDFs work best)."
                )}
              </p>
              <p className="mt-1 text-sm text-slate-300">
                {tr(
                  "Is het een gescand document? Dan proberen we OCR.",
                  "Is it a scanned document? We'll try OCR."
                )}
              </p>
              <p className="mt-1 text-sm text-slate-300">{tr("Sleep hierheen of klik om te bladeren", "Drag here or click to browse files")}</p>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default UploadPanel;
