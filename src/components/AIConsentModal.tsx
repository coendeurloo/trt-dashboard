import { useEffect, useState } from "react";
import { AlertTriangle, FileText, ShieldCheck } from "lucide-react";
import { trLocale } from "../i18n";
import { AIConsentAction, AIConsentDecision, AppLanguage } from "../types";

interface AIConsentModalProps {
  open: boolean;
  action: AIConsentAction;
  language: AppLanguage;
  onDecide: (decision: AIConsentDecision) => void;
  onClose: () => void;
}

const AIConsentModal = ({ open, action, language, onDecide, onClose }: AIConsentModalProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const [parserRescueEnabled, setParserRescueEnabled] = useState(true);
  const [includeSymptoms, setIncludeSymptoms] = useState(false);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [allowPdfAttachment, setAllowPdfAttachment] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setParserRescueEnabled(true);
    setIncludeSymptoms(false);
    setIncludeNotes(false);
    setAllowPdfAttachment(false);
  }, [open, action]);

  if (!open) {
    return null;
  }

  const commonDecision = (scope: "once" | "always"): AIConsentDecision => ({
    action,
    scope,
    allowExternalAi: true,
    parserRescueEnabled,
    includeSymptoms,
    includeNotes,
    allowPdfAttachment
  });

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/75 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-soft">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-2">
            <ShieldCheck className="h-5 w-5 text-cyan-300" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              {tr("Toestemming voor externe AI", "Consent for external AI")}
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              {action === "analysis"
                ? tr(
                    "Je data blijft lokaal tenzij je hieronder toestemming geeft. Kies wat je wilt meesturen voor AI-analyse.",
                    "Your data stays local unless you grant consent below. Choose what to include for AI analysis."
                  )
                : tr(
                    "Je data blijft lokaal tenzij je hieronder toestemming geeft. Kies wat we extern mogen gebruiken om deze PDF beter uit te lezen.",
                    "Your data stays local unless you grant consent below. Choose what we may send externally to improve extraction for this PDF."
                  )}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3 rounded-xl border border-slate-700 bg-slate-950/45 p-3 text-sm text-slate-200">
          <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
            <FileText className="h-3.5 w-3.5" />
            {tr("Wat sturen we?", "What do we send?")}
          </p>

          {action === "parser_rescue" ? (
            <>
              <label className="flex items-center justify-between gap-3 rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2">
                <span>{tr("AI gebruiken om extractie te verbeteren", "Use AI to improve extraction")}</span>
                <input
                  type="checkbox"
                  checked={parserRescueEnabled}
                  onChange={(event) => setParserRescueEnabled(event.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2">
                <span>{tr("Volledig PDF-bestand meesturen (alleen deze run)", "Send full PDF too (this run only)")}</span>
                <input
                  type="checkbox"
                  checked={allowPdfAttachment}
                  onChange={(event) => setAllowPdfAttachment(event.target.checked)}
                  disabled={!parserRescueEnabled}
                />
              </label>
              <p className="text-xs text-slate-400">
                {tr(
                  "Standaard sturen we alleen geanonimiseerde tekst. Het volledige PDF-bestand meesturen is optioneel en geldt alleen voor deze ene poging.",
                  "By default we send only redacted text. Sending the full PDF is optional and applies only to this one attempt."
                )}
              </p>
            </>
          ) : (
            <>
              <label className="flex items-center justify-between gap-3 rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2">
                <span>{tr("Symptomen meesturen", "Include symptoms")}</span>
                <input type="checkbox" checked={includeSymptoms} onChange={(event) => setIncludeSymptoms(event.target.checked)} />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2">
                <span>{tr("Notities meesturen", "Include notes")}</span>
                <input type="checkbox" checked={includeNotes} onChange={(event) => setIncludeNotes(event.target.checked)} />
              </label>
              <p className="text-xs text-slate-400">
                {tr(
                  "Symptomen en notities staan standaard uit en worden alleen meegestuurd als je ze hier aanzet.",
                  "Symptoms and notes are off by default and only sent if you enable them here."
                )}
              </p>
            </>
          )}

          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
            <p>
              {tr(
                "Zonder toestemming wordt er niets extern verstuurd.",
                "Without consent, nothing is sent externally."
              )}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
            onClick={onClose}
          >
            {tr("Sluiten", "Close")}
          </button>
          <button
            type="button"
            className="rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-1.5 text-sm text-rose-100"
            onClick={() =>
              onDecide({
                action,
                scope: "once",
                allowExternalAi: false,
                parserRescueEnabled: false,
                includeSymptoms: false,
                includeNotes: false,
                allowPdfAttachment: false
              })
            }
          >
            {tr("Niet toestaan", "Do not allow")}
          </button>
          <button
            type="button"
            className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-100"
            onClick={() => onDecide(commonDecision("once"))}
            disabled={action === "parser_rescue" && !parserRescueEnabled}
          >
            {tr("Alleen deze keer", "Only this time")}
          </button>
          <button
            type="button"
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-100"
            onClick={() => onDecide(commonDecision("always"))}
            disabled={action === "parser_rescue" && !parserRescueEnabled}
          >
            {tr("Altijd toestaan", "Always allow")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIConsentModal;
