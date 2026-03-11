import { AlertTriangle, CheckCircle2, Send, X } from "lucide-react";
import { trLocale } from "../i18n";
import { AppLanguage } from "../types";

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
    return count === 1 ? "1 marker gevonden" : `${count} markers gevonden`;
  }
  return count === 1 ? "1 marker found" : `${count} markers found`;
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

  const isLowQualityUpload = summary.kind === "upload" && summary.needsReview;
  const icon = isLowQualityUpload ? (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2">
      <AlertTriangle className="h-5 w-5 text-amber-300" />
    </div>
  ) : (
    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-2">
      <CheckCircle2 className="h-5 w-5 text-emerald-300" />
    </div>
  );

  const title =
    summary.kind === "ai_rescue"
      ? tr("AI-rescue voltooid", "AI rescue completed")
      : summary.markerCount > 0
        ? formatMarkerCountLabel(summary.markerCount, language)
        : tr("Geen markers gevonden", "No markers found");

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
            "Controleer de markers en sla het rapport op wanneer je klaar bent.",
            "Review the markers and save the report when you're ready."
          );

  const routeText =
    summary.kind === "ai_rescue"
      ? `${summary.baselineRouteLabel} -> ${summary.finalRouteLabel}`
      : summary.routeLabel;

  const warningText =
    summary.kind === "ai_rescue"
      ? summary.warnings > 0
        ? tr(
            "Parserwaarschuwingen blijven zichtbaar in het review-scherm. Controleer de markers zorgvuldig.",
            "Parser warnings remain in the review screen. Check the markers carefully."
          )
        : tr(
            "Bekijk de gevonden markers nog even voordat je opslaat.",
            "Take one more look at the extracted markers before saving."
          )
      : summary.needsReview
        ? summary.warnings > 0
          ? tr(
              "Er zijn parserwaarschuwingen gevonden. Controleer de gevonden markers zorgvuldig voordat je opslaat.",
              "Parser warnings were detected. Review the extracted markers carefully before saving."
            )
          : tr(
              "Er zijn maar weinig markers gevonden. Controleer de gevonden markers zorgvuldig voordat je opslaat.",
              "Only a few markers were found. Review the extracted markers carefully before saving."
            )
        : summary.warnings > 0
          ? tr(
              "Er zijn parserwaarschuwingen gevonden. Controleer de markers nog even voordat je opslaat.",
              "Parser warnings were detected. Give the markers a quick review before saving."
            )
          : "";

  return (
    <div className="fixed inset-0 z-[91] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true">
      <div
        className="w-full max-w-2xl rounded-2xl border border-cyan-500/35 bg-gradient-to-br from-slate-900 to-slate-950 p-5 shadow-soft"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {icon}
            <div>
              <h3 className="text-2xl font-semibold text-slate-100">{title}</h3>
              <p className="mt-1 text-sm text-slate-300">{summary.fileName}</p>
              <p className="mt-2 text-sm text-slate-200">{subtitle}</p>
              <p className="mt-2 text-xs text-slate-400">
                {tr("Route", "Route")}: {routeText}
                {summary.kind === "ai_rescue"
                  ? ` | ${tr("Markers", "Markers")}: ${summary.baselineMarkerCount} -> ${summary.finalMarkerCount}`
                  : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:border-slate-500"
            onClick={onContinue}
          >
            <span className="sr-only">{tr("Sluiten", "Close")}</span>
            <X className="h-4 w-4" />
          </button>
        </div>

        {warningText ? (
          <div className="mt-4 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            {warningText}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {summary.kind === "upload" && summary.needsReview && summary.canSendPdf ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-cyan-500/40 hover:text-cyan-100"
              onClick={onOpenParserImprovement}
            >
              <Send className="h-4 w-4" />
              Send PDF to improve parser
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-md border border-cyan-500/60 bg-cyan-500/15 px-3 py-1.5 text-sm font-medium text-cyan-100 hover:border-cyan-400 hover:bg-cyan-500/20"
            onClick={onContinue}
          >
            {tr("Controleer markers", "Review markers")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ParserUploadSummaryModal;

