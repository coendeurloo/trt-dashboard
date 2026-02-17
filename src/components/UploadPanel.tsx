import { motion } from "framer-motion";
import { Loader2, UploadCloud } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { trLocale } from "../i18n";
import { AppLanguage } from "../types";

export interface UploadPanelProps {
  isProcessing: boolean;
  onFileSelected: (file: File) => void;
  language: AppLanguage;
}

const UploadPanel = ({ isProcessing, onFileSelected, language }: UploadPanelProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
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
      >
        <input {...getInputProps()} />
        {isProcessing ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-cyan-300" />
            <p className="text-sm text-slate-200">
              {tr("PDF wordt verwerkt en labwaarden worden uitgelezen...", "Processing PDF and extracting lab values...")}
            </p>
          </>
        ) : (
          <>
            <UploadCloud className="h-9 w-9 text-cyan-300" />
            <div>
              <p className="text-base font-semibold text-slate-100">
                {tr("Sleep je lab-PDF hierheen", "Drag and drop your lab PDF here")}
              </p>
              <p className="mt-1 text-sm text-slate-300">{tr("of klik om te bladeren", "or click to browse files")}</p>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default UploadPanel;
