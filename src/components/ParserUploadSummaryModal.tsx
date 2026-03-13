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

  const isReviewState = summary.kind === "upload" ? summary.needsReview : summary.warnings > 0;

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
              "Parserkwaliteitssignalen geven aan dat dit rapport extra controle nodig heeft voordat je opslaat.",
              "Parser quality signals indicate this report needs extra review before saving."
            )
        : summary.warnings > 0
          ? tr(
              "Er zijn parserwaarschuwingen gevonden. Controleer de markers nog even voordat je opslaat.",
              "Parser warnings were detected. Give the markers a quick review before saving."
            )
          : "";
  const footerHint =
    summary.kind === "upload" && summary.needsReview
      ? tr(
          "Je kunt nu alle markers controleren en aanpassen voordat je opslaat.",
          "You can now review and edit all markers before saving."
        )
      : tr(
          "Controleer de markers en ga verder wanneer je klaar bent.",
          "Review the markers and continue when you're ready."
        );

  return (
    <div className="app-modal-overlay z-[91]" role="dialog" aria-modal="true">
      <div
        className="app-modal-shell w-full max-w-2xl border-cyan-500/35 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-soft"
        onClick={(event) => event.stopPropagation()}
      >
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
                <h3 className="text-4xl font-semibold leading-tight text-slate-100">{title}</h3>
                <p className="mt-1 truncate text-sm text-slate-300">{summary.fileName}</p>
                <p className="mt-2 text-base text-slate-200">{subtitle}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span
                className={`rounded-full border px-2.5 py-1 ${
                  isReviewState
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                }`}
              >
                {isReviewState ? tr("Controle nodig", "Needs review") : tr("Klaar om te controleren", "Ready to review")}
              </span>
              <span className="rounded-full border border-slate-600/80 bg-slate-900/70 px-2.5 py-1 text-slate-300">
                {tr("Route", "Route")}: {routeText}
              </span>
              {summary.kind === "ai_rescue" ? (
                <span className="rounded-full border border-slate-600/80 bg-slate-900/70 px-2.5 py-1 text-slate-300">
                  {tr("Markers", "Markers")}: {summary.baselineMarkerCount} {"->"} {summary.finalMarkerCount}
                </span>
              ) : null}
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
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            {warningText}
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 border-t border-slate-700/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400">{footerHint}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {summary.kind === "upload" && summary.needsReview && summary.canSendPdf ? (
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:border-cyan-500/40 hover:text-cyan-100"
                onClick={onOpenParserImprovement}
              >
                <Send className="h-4 w-4" />
                Send PDF to improve parser
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-md border border-cyan-500/60 bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-100 hover:border-cyan-400 hover:bg-cyan-500/20"
              onClick={onContinue}
            >
              {tr("Controleer markers", "Review markers")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParserUploadSummaryModal;

