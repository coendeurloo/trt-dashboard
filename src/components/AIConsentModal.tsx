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
  const isAnalysisAction = action === "analysis";
  const [parserRescueEnabled, setParserRescueEnabled] = useState(true);
  const [allowPdfAttachment, setAllowPdfAttachment] = useState(action === "parser_rescue");

  useEffect(() => {
    if (!open) {
      return;
    }
    setParserRescueEnabled(true);
    setAllowPdfAttachment(action === "parser_rescue");
  }, [open, action]);

  if (!open) {
    return null;
  }

  const commonDecision = (scope: "once" | "always"): AIConsentDecision => ({
    action,
    scope,
    allowExternalAi: true,
    parserRescueEnabled: action === "parser_rescue" ? parserRescueEnabled : false,
    includeSymptoms: false,
    includeNotes: false,
    allowPdfAttachment: action === "parser_rescue" ? allowPdfAttachment : false
  });

  return (
    <div className="app-modal-overlay" role="dialog" aria-modal="true">
      <div className="app-modal-shell ai-consent-modal w-full max-w-xl bg-slate-900 p-5 shadow-soft">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-2">
            <ShieldCheck className="h-5 w-5 text-cyan-300" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              {tr("Toestemming voor externe AI", "Consent for external AI")}
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              {isAnalysisAction
                ? tr(
                    "Je data blijft lokaal totdat je AI Coach gebruikt. Met jouw toestemming sturen we alleen relevante context naar een externe AI-provider.",
                    "Your data stays local until you use AI Coach. With your consent, we only send relevant context to an external AI provider."
                  )
                : tr(
                    "Je data blijft lokaal tenzij je hieronder toestemming geeft. Kies wat we extern mogen gebruiken om deze PDF beter uit te lezen.",
                    "Your data stays local unless you grant consent below. Choose what we may send externally to improve extraction for this PDF."
                  )}
            </p>
          </div>
        </div>

        <div className="ai-consent-panel mt-4 space-y-3 rounded-xl border border-slate-700 bg-slate-950/45 p-3 text-sm text-slate-200">
          <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
            <FileText className="h-3.5 w-3.5" />
            {tr("Wat sturen we?", "What do we send?")}
          </p>

          {action === "parser_rescue" ? (
            <>
              <label className="ai-consent-option flex items-center justify-between gap-3 rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2">
                <span>{tr("AI gebruiken om extractie te verbeteren", "Use AI to improve extraction")}</span>
                <input
                  type="checkbox"
                  checked={parserRescueEnabled}
                  onChange={(event) => setParserRescueEnabled(event.target.checked)}
                  className="ai-consent-checkbox h-5 w-5 rounded border border-slate-500 bg-slate-800 text-cyan-400"
                />
              </label>
              <label className="ai-consent-option flex items-center justify-between gap-3 rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2">
                <span>{tr("Volledig PDF-bestand meesturen voor parser-rescue", "Send full PDF for parser rescue")}</span>
                <input
                  type="checkbox"
                  checked={allowPdfAttachment}
                  onChange={(event) => setAllowPdfAttachment(event.target.checked)}
                  disabled={!parserRescueEnabled}
                  className="ai-consent-checkbox h-5 w-5 rounded border border-slate-500 bg-slate-800 text-cyan-400 disabled:opacity-40"
                />
              </label>
              <p className="text-xs text-slate-400">
                {tr(
                  "Voor parser-rescue staat het meesturen van het volledige PDF-bestand standaard aan. Dit kan helpen bij lastige scans, maar verbetering is niet gegarandeerd. Je kunt dit uitzetten als je dat liever niet wilt.",
                  "For parser rescue, sending the full PDF is enabled by default. This can help on difficult scans, but improvement is not guaranteed. You can turn this off if you prefer."
                )}
              </p>
            </>
          ) : (
            <>
              <div className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-slate-200">
                {tr(
                  "Voor AI Coach sturen we alleen relevante lab-context die nodig is om je vraag of analyse te beantwoorden.",
                  "For AI Coach, we only send relevant lab context needed to answer your question or analysis."
                )}
              </div>
              <p className="text-xs text-slate-400">
                {tr(
                  "Je kunt deze keuze later altijd aanpassen in Instellingen.",
                  "You can always change this choice later in Settings."
                )}
              </p>
            </>
          )}

          <div className="ai-consent-warning flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-100">
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
          {isAnalysisAction ? (
            <button
              type="button"
              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-100"
              onClick={() => onDecide(commonDecision("always"))}
            >
              {tr("AI Coach toestaan", "Allow AI Coach")}
            </button>
          ) : (
            <>
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
                {tr("Altijd toestaan voor parser-rescue", "Always allow parser rescue")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIConsentModal;
