import { AlertTriangle, ShieldCheck } from "lucide-react";
import { trLocale } from "../i18n";
import { AppLanguage, ParserUncertaintyAssessment } from "../types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ParserUncertaintyModalProps {
  open: boolean;
  language: AppLanguage;
  assessment: ParserUncertaintyAssessment | null;
  onUseAi: () => void;
  onSkip: () => void;
}

const ParserUncertaintyModal = ({ open, language, assessment, onUseAi, onSkip }: ParserUncertaintyModalProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  if (!open || !assessment) {
    return null;
  }

  const reasonLabel = (reason: ParserUncertaintyAssessment["reasons"][number]): string => {
    if (reason === "warning_unknown_layout") {
      return tr("Onbekend documentformat gedetecteerd.", "Unknown document layout detected.");
    }
    if (reason === "warning_text_extraction_failed") {
      return tr("Tekstlaag uitlezen is mislukt.", "Text extraction failed.");
    }
    if (reason === "warning_ocr_init_failed") {
      return tr("OCR kon niet goed starten.", "OCR could not initialize.");
    }
    if (reason === "warning_text_layer_empty") {
      return tr("PDF heeft geen bruikbare tekstlaag.", "PDF has no usable text layer.");
    }
    if (reason === "marker_count_low") {
      return tr("Er zijn weinig biomarkers gevonden.", "Only a few biomarkers were found.");
    }
    if (reason === "confidence_very_low") {
      return tr("Parser confidence is erg laag.", "Parser confidence is very low.");
    }
    return tr(
      "Confidence en unitdekking zijn laag.",
      "Confidence and unit coverage are low."
    );
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2">
              <AlertTriangle className="h-5 w-5 text-amber-300" />
            </div>
            <div>
              <DialogTitle>
                {tr("Parser is onzeker over dit rapport", "Parser is uncertain about this report")}
              </DialogTitle>
              <p className="mt-1 text-sm text-slate-300">
                {tr(
                  "Je kunt doorgaan met lokaal resultaat, of AI een extra poging laten doen.",
                  "You can continue with the local result, or let AI try an extra pass."
                )}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-xl border border-slate-700 bg-slate-950/45 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">{tr("Waarom onzeker?", "Why uncertain?")}</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-200">
            {assessment.reasons.map((reason) => (
              <li key={reason}>• {reasonLabel(reason)}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-400">
            {tr("Biomarkers", "Biomarkers")}: {assessment.markerCount} · {tr("Confidence", "Confidence")}:{" "}
            {Math.round(assessment.confidence * 100)}% · {tr("Unitdekking", "Unit coverage")}:{" "}
            {Math.round(assessment.unitCoverage * 100)}%
          </p>
        </div>

        <Alert variant="info">
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            {tr(
              "Er wordt niets extern verstuurd totdat je daar in de volgende stap expliciet toestemming voor geeft.",
              "Nothing is sent externally until you explicitly grant consent in the next step."
            )}
          </AlertDescription>
        </Alert>

        <DialogFooter className="flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={onSkip}
          >
            {tr("Niet nu (lokaal houden)", "Not now (keep local)")}
          </Button>
          <Button
            onClick={onUseAi}
          >
            {tr("Gebruik AI", "Use AI")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ParserUncertaintyModal;
