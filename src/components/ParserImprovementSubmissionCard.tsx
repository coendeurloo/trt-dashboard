import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Send, ShieldCheck } from "lucide-react";
import { trLocale } from "../i18n";
import { ParserImprovementFormValues } from "../parserImprovementSubmission";
import { AppLanguage, ExtractionDraft, ParserUncertaintyAssessment } from "../types";

interface ParserImprovementSubmissionCardProps {
  language: AppLanguage;
  draft: ExtractionDraft;
  assessment: ParserUncertaintyAssessment;
  status: "idle" | "dismissed" | "submitting" | "success" | "error";
  errorMessage: string;
  onSubmit: (values: ParserImprovementFormValues) => Promise<void>;
  onDismiss: () => void;
}

const EMPTY_VALUES: ParserImprovementFormValues = {
  consent: false,
  note: "",
  country: "",
  labProvider: "",
  language: ""
};

const ParserImprovementSubmissionCard = ({
  language,
  draft,
  assessment,
  status,
  errorMessage,
  onSubmit,
  onDismiss
}: ParserImprovementSubmissionCardProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const [values, setValues] = useState<ParserImprovementFormValues>(EMPTY_VALUES);
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    if (status === "idle") {
      setValues(EMPTY_VALUES);
      setValidationError("");
    }
  }, [status]);

  const isSubmitting = status === "submitting";
  const isSuccess = status === "success";
  const combinedError = validationError || errorMessage;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!values.consent) {
      setValidationError(
        tr(
          "Vink eerst aan dat je toestemming geeft om dit PDF-bestand met ons te delen voor parserverbetering.",
          "Please confirm consent before sending this PDF to help improve the parser."
        )
      );
      return;
    }

    setValidationError("");
    await onSubmit(values);
  };

  if (isSuccess) {
    return (
      <div className="mb-4 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4 text-sm text-emerald-100">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-300" />
          </div>
          <div>
            <p className="font-semibold">{tr("PDF verstuurd voor parserverbetering", "PDF sent for parser improvement")}</p>
            <p className="mt-1 text-sm text-emerald-100/90">
              {tr(
                "Bedankt. Je kunt gewoon doorgaan met het controleren en opslaan van dit rapport.",
                "Thanks. You can keep reviewing and saving this report as usual."
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      className="mb-4 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 shadow-soft"
      onSubmit={handleSubmit}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2">
          <AlertTriangle className="h-5 w-5 text-amber-300" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-100">
            {tr("Dit rapport is niet goed uitgelezen", "This report was not parsed well")}
          </h3>
          <p className="mt-1 text-sm text-slate-200">
            {tr(
              "Als je wilt, kun je het originele PDF-bestand veilig naar ons sturen zodat we de parser in deze beta kunnen verbeteren.",
              "If you want, you can safely send the original PDF to us so we can improve the parser during this beta."
            )}
          </p>
          <p className="mt-2 text-xs text-slate-300">
            {tr("Markers", "Markers")}: {assessment.markerCount} · {tr("Confidence", "Confidence")}: {Math.round(assessment.confidence * 100)}% ·{" "}
            {tr("Bestand", "File")}: {draft.sourceFileName}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-md border border-cyan-500/30 bg-cyan-500/10 p-2 text-xs text-cyan-100">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          {tr(
            "We gebruiken dit alleen voor parserverbetering in de beta. Zonder jouw vinkje wordt er niets verstuurd.",
            "We use this only for parser improvement during the beta. Nothing is sent unless you explicitly consent."
          )}
        </p>
      </div>

      <div className="mt-4 space-y-3">
        <label className="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-900/45 px-3 py-2 text-sm text-slate-100">
          <input
            type="checkbox"
            checked={values.consent}
            disabled={isSubmitting}
            onChange={(event) => setValues((current) => ({ ...current, consent: event.target.checked }))}
            className="mt-0.5 h-4 w-4 rounded border border-slate-500 bg-slate-800 text-cyan-400"
          />
          <span>
            {tr(
              "Ik geef toestemming om dit originele PDF-bestand en de ingevulde metadata te versturen voor parserverbetering.",
              "I consent to sending this original PDF and the metadata below to help improve the parser."
            )}
          </span>
        </label>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="block text-sm text-slate-200">
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{tr("Land", "Country")}</span>
            <input
              type="text"
              value={values.country}
              disabled={isSubmitting}
              onChange={(event) => setValues((current) => ({ ...current, country: event.target.value }))}
              className="w-full rounded-md border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="block text-sm text-slate-200">
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{tr("Lab / provider", "Lab / provider")}</span>
            <input
              type="text"
              value={values.labProvider}
              disabled={isSubmitting}
              onChange={(event) => setValues((current) => ({ ...current, labProvider: event.target.value }))}
              className="w-full rounded-md border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="block text-sm text-slate-200">
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{tr("Taal", "Language")}</span>
            <input
              type="text"
              value={values.language}
              disabled={isSubmitting}
              onChange={(event) => setValues((current) => ({ ...current, language: event.target.value }))}
              className="w-full rounded-md border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
            />
          </label>
        </div>

        <label className="block text-sm text-slate-200">
          <span className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{tr("Opmerking", "Note")}</span>
          <textarea
            value={values.note}
            disabled={isSubmitting}
            onChange={(event) => setValues((current) => ({ ...current, note: event.target.value }))}
            className="min-h-24 w-full rounded-md border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
            placeholder={tr(
              "Optioneel: wat ging er mis of wat moeten we weten?",
              "Optional: what went wrong or what should we know?"
            )}
          />
        </label>
      </div>

      {combinedError ? (
        <div role="alert" className="mt-3 rounded-md border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {combinedError}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
          onClick={onDismiss}
          disabled={isSubmitting}
        >
          {tr("Overslaan", "Skip")}
        </button>
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {isSubmitting
            ? tr("PDF wordt verstuurd...", "Sending PDF...")
            : "Send PDF to improve parser"}
        </button>
      </div>
    </form>
  );
};

export default ParserImprovementSubmissionCard;
