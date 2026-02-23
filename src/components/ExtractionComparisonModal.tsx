import { CheckCircle2, Sparkles } from "lucide-react";
import { trLocale } from "../i18n";
import { AppLanguage, ExtractionDiffRowSnapshot, ExtractionDiffSummary } from "../types";

interface ExtractionComparisonModalProps {
  open: boolean;
  language: AppLanguage;
  summary: ExtractionDiffSummary | null;
  onKeepLocal: () => void;
  onApplyAi: () => void;
}

const renderSnapshot = (row: ExtractionDiffRowSnapshot): string => {
  const range =
    row.referenceMin !== null || row.referenceMax !== null
      ? ` (ref ${row.referenceMin ?? "-"}-${row.referenceMax ?? "-"})`
      : "";
  return `${row.marker}: ${row.value} ${row.unit || ""}${range}`.trim();
};

const ExtractionComparisonModal = ({ open, language, summary, onKeepLocal, onApplyAi }: ExtractionComparisonModalProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  if (!open || !summary) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[89] flex items-center justify-center bg-slate-950/75 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl rounded-2xl border border-cyan-500/30 bg-slate-900 p-5 shadow-soft">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-2">
            <Sparkles className="h-5 w-5 text-cyan-300" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              {tr("Vergelijk lokaal resultaat met AI-resultaat", "Compare local result with AI result")}
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              {tr(
                "Bekijk wat AI extra vond of wijzigde, en kies daarna welke versie je wilt behouden.",
                "Review what AI found or changed, then choose which version you want to keep."
              )}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-700 bg-slate-950/45 p-3 text-sm text-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-400">{tr("Lokaal", "Local")}</p>
            <p className="mt-1">{tr("Markers", "Markers")}: {summary.local.markerCount}</p>
            <p>{tr("Confidence", "Confidence")}: {Math.round(summary.local.confidence * 100)}%</p>
            <p>{tr("Waarschuwingen", "Warnings")}: {summary.local.warnings.length}</p>
          </div>
          <div className="rounded-lg border border-cyan-500/35 bg-cyan-500/5 p-3 text-sm text-slate-200">
            <p className="text-xs uppercase tracking-wide text-cyan-300">{tr("AI kandidaat", "AI candidate")}</p>
            <p className="mt-1">{tr("Markers", "Markers")}: {summary.ai.markerCount}</p>
            <p>{tr("Confidence", "Confidence")}: {Math.round(summary.ai.confidence * 100)}%</p>
            <p>{tr("Waarschuwingen", "Warnings")}: {summary.ai.warnings.length}</p>
          </div>
        </div>

        {summary.testDateChanged ? (
          <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
            {tr("Testdatum gewijzigd", "Test date changed")}: {summary.localTestDate || "-"} → {summary.aiTestDate || "-"}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
            <p className="text-xs uppercase tracking-wide text-emerald-200">{tr("Toegevoegd", "Added")}</p>
            {summary.added.length === 0 ? (
              <p className="mt-2 text-xs text-slate-300">{tr("Geen", "None")}</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs text-slate-100">
                {summary.added.map((change) => (
                  <li key={`added-${change.canonicalMarker}-${change.marker}`}>• {change.ai ? renderSnapshot(change.ai) : change.marker}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-xs uppercase tracking-wide text-amber-200">{tr("Gewijzigd", "Changed")}</p>
            {summary.changed.length === 0 ? (
              <p className="mt-2 text-xs text-slate-300">{tr("Geen", "None")}</p>
            ) : (
              <ul className="mt-2 space-y-2 text-xs text-slate-100">
                {summary.changed.map((change) => (
                  <li key={`changed-${change.canonicalMarker}-${change.marker}`}>
                    <p>{change.marker}</p>
                    <p className="text-slate-300">{change.local ? renderSnapshot(change.local) : "-"}</p>
                    <p className="text-slate-300">{change.ai ? renderSnapshot(change.ai) : "-"}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
            <p className="text-xs uppercase tracking-wide text-rose-200">{tr("Verwijderd", "Removed")}</p>
            {summary.removed.length === 0 ? (
              <p className="mt-2 text-xs text-slate-300">{tr("Geen", "None")}</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs text-slate-100">
                {summary.removed.map((change) => (
                  <li key={`removed-${change.canonicalMarker}-${change.marker}`}>• {change.local ? renderSnapshot(change.local) : change.marker}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {!summary.hasChanges ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-500/35 bg-emerald-500/10 p-2 text-xs text-emerald-100">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5" />
            <p>{tr("AI gaf geen inhoudelijke wijzigingen t.o.v. lokaal resultaat.", "AI produced no meaningful changes compared to the local result.")}</p>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
            onClick={onKeepLocal}
          >
            {tr("Huidige versie houden", "Keep current version")}
          </button>
          <button
            type="button"
            className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-100"
            onClick={onApplyAi}
          >
            {tr("AI-resultaat toepassen", "Apply AI result")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExtractionComparisonModal;
