import { AlertTriangle, CheckCircle2, Send, X } from "lucide-react";
import { trLocale } from "../i18n";
import { AppLanguage } from "../types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

export type ParserUploadSummaryModalData =
  | {
      kind: "upload";
      fileName: string;
      markerCount: number;
      warnings: number;
      routeLabel: string;
      needsReview: boolean;
      canSendPdf: boolean;
    }
  | {
      kind: "ai_rescue";
      fileName: string;
      baselineMarkerCount: number;
      baselineRouteLabel: string;
      finalMarkerCount: number;
      finalRouteLabel: string;
      warnings: number;
      aiApplied: boolean;
    };

interface ParserUploadSummaryModalProps {
  open: boolean;
  language: AppLanguage;
  summary: ParserUploadSummaryModalData | null;
  onContinue: () => void;
  onOpenParserImprovement: () => void;
}

const formatMarkerCountLabel = (count: number, language: AppLanguage): string => {
  if (language === "nl") {
    return count === 1 ? "1 biomarker gevonden" : `${count} biomarkers gevonden`;
  }
  return count === 1 ? "1 biomarker found" : `${count} biomarkers found`;
};

const ParserUploadSummaryModal = ({
  open,
  language,
  summary,
  onContinue,
  onOpenParserImprovement
}: ParserUploadSummaryModalProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  if (!open || !summary) {
    return null;
  }

  const isReviewState = summary.kind === "upload" ? summary.needsReview : summary.warnings > 0;

  const title =
    summary.kind === "ai_rescue"
      ? tr("AI-rescue voltooid", "AI rescue completed")
      : summary.markerCount > 0
        ? formatMarkerCountLabel(summary.markerCount, language)
        : tr("Geen biomarkers gevonden", "No biomarkers found");

  const subtitle =
    summary.kind === "ai_rescue"
      ? summary.aiApplied
        ? tr(
            "Het AI-resultaat is toegepast omdat het meer bruikbare data vond.",
            "The AI result was applied because it found more usable data."
          )
        : tr(
            "De AI-check is afgerond en het lokale resultaat is behouden.",
            "The AI check completed and the local result was kept."
          )
      : summary.needsReview
        ? tr(
            "Dit rapport heeft controle nodig voordat je het opslaat.",
            "This report needs review before saving."
          )
        : tr(
            "Controleer de biomarkers en sla het rapport op wanneer je klaar bent.",
            "Review the biomarkers and save the report when you're ready."
          );

  const routeText =
    summary.kind === "ai_rescue"
      ? `${summary.baselineRouteLabel} -> ${summary.finalRouteLabel}`
      : summary.routeLabel;

  const warningText =
    summary.kind === "ai_rescue"
      ? summary.warnings > 0
        ? tr(
            "Parserwaarschuwingen blijven zichtbaar in het review-scherm. Controleer de biomarkers zorgvuldig.",
            "Parser warnings remain in the review screen. Check the biomarkers carefully."
          )
        : tr(
            "Bekijk de gevonden biomarkers nog even voordat je opslaat.",
            "Take one more look at the extracted biomarkers before saving."
          )
      : summary.needsReview
        ? summary.warnings > 0
          ? tr(
              "Er zijn parserwaarschuwingen gevonden. Controleer de gevonden biomarkers zorgvuldig voordat je opslaat.",
              "Parser warnings were detected. Review the extracted biomarkers carefully before saving."
            )
          : tr(
              "Parserkwaliteitssignalen geven aan dat dit rapport extra controle nodig heeft voordat je opslaat.",
              "Parser quality signals indicate this report needs extra review before saving."
            )
        : summary.warnings > 0
          ? tr(
              "Er zijn parserwaarschuwingen gevonden. Controleer de biomarkers nog even voordat je opslaat.",
              "Parser warnings were detected. Give the biomarkers a quick review before saving."
            )
          : "";
  const footerHint =
    summary.kind === "upload" && summary.needsReview
      ? tr(
          "Je kunt nu alle biomarkers controleren en aanpassen voordat je opslaat.",
          "You can now review and edit all biomarkers before saving."
        )
      : tr(
          "Controleer de biomarkers en ga verder wanneer je klaar bent.",
          "Review the biomarkers and continue when you're ready."
        );

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onContinue()}>
      <DialogContent className="max-w-2xl bg-gradient-to-br from-slate-900 to-slate-950">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 rounded-xl border p-2.5 ${
                    isReviewState
                      ? "border-amber-500/40 bg-amber-500/10"
                      : "border-emerald-500/40 bg-emerald-500/10"
                  }`}
                >
                  {isReviewState ? (
                    <AlertTriangle className="h-5 w-5 text-amber-300" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                  )}
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-4xl font-semibold leading-tight">{title}</DialogTitle>
                  <p className="mt-1 truncate text-sm text-slate-300">{summary.fileName}</p>
                  <p className="mt-2 text-base text-slate-200">{subtitle}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <Badge variant={isReviewState ? "amber" : "emerald"}>
                  {isReviewState ? tr("Controle nodig", "Needs review") : tr("Klaar om te controleren", "Ready to review")}
                </Badge>
                <Badge variant="slate">
                  {tr("Route", "Route")}: {routeText}
                </Badge>
                {summary.kind === "ai_rescue" ? (
                  <Badge variant="slate">
                    {tr("Biomarkers", "Biomarkers")}: {summary.baselineMarkerCount} {"->"} {summary.finalMarkerCount}
                  </Badge>
                ) : null}
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onContinue}
              aria-label={tr("Sluiten", "Close")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {warningText ? (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{warningText}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-slate-700/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400">{footerHint}</p>
          <DialogFooter className="flex-wrap gap-2">
            {summary.kind === "upload" && summary.needsReview && summary.canSendPdf ? (
              <Button
                type="button"
                variant="outline"
                onClick={onOpenParserImprovement}
              >
                <Send className="h-4 w-4" />
                Send PDF to improve parser
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={onContinue}
            >
              {tr("Controleer biomarkers", "Review biomarkers")}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ParserUploadSummaryModal;

