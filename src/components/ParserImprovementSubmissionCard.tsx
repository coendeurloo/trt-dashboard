import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Send, ShieldCheck, X } from "lucide-react";
import { trLocale } from "../i18n";
import { ParserImprovementFormValues } from "../parserImprovementSubmission";
import { AppLanguage, ExtractionDraft, ParserUncertaintyAssessment } from "../types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";

interface ParserImprovementSubmissionCardProps {
  open: boolean;
  language: AppLanguage;
  draft: ExtractionDraft;
  assessment: ParserUncertaintyAssessment;
  status: "idle" | "submitting" | "success" | "error";
  errorMessage: string;
  onSubmit: (values: ParserImprovementFormValues) => Promise<void>;
  onClose: () => void;
}

const EMPTY_VALUES: ParserImprovementFormValues = {
  consent: false,
  note: "",
  country: "",
  labProvider: "",
  language: ""
};

const ParserImprovementSubmissionCard = ({
  open,
  language,
  draft,
  assessment,
  status,
  errorMessage,
  onSubmit,
  onClose
}: ParserImprovementSubmissionCardProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const [values, setValues] = useState<ParserImprovementFormValues>(EMPTY_VALUES);
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    if (!open || status !== "idle") {
      return;
    }
    setValues(EMPTY_VALUES);
    setValidationError("");
  }, [draft.sourceFileName, open, status]);

  if (!open) {
    return null;
  }

  const isSubmitting = status === "submitting";
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

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" asChild>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2">
                  <AlertTriangle className="h-5 w-5 text-amber-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle>
                    {tr("Dit rapport is niet goed uitgelezen", "This report was not parsed well")}
                  </DialogTitle>
                  <p className="mt-1 text-sm text-slate-200">
                    {tr(
                      "Als je wilt, kun je het originele PDF-bestand veilig naar ons sturen zodat we de parser in deze beta kunnen verbeteren.",
                      "If you want, you can safely send the original PDF to us so we can improve the parser during this beta."
                    )}
                  </p>
                  <p className="mt-2 text-xs text-slate-300">
                    {assessment.markerCount} {tr("biomarkers gevonden", "biomarkers found")} | {tr("Bestand", "File")}: {draft.sourceFileName}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={onClose}
                disabled={isSubmitting}
                aria-label={tr("Sluiten", "Close")}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>

          <Alert variant="info">
            <ShieldCheck className="h-4 w-4" />
            <AlertDescription>
              {tr(
                "We gebruiken dit alleen voor parserverbetering in de beta. Zonder jouw vinkje wordt er niets verstuurd.",
                "We use this only for parser improvement during the beta. Nothing is sent unless you explicitly consent."
              )}
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <label className="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-900/45 px-3 py-2 text-sm text-slate-100">
              <Checkbox
                checked={values.consent}
                disabled={isSubmitting}
                onCheckedChange={(checked) => setValues((current) => ({ ...current, consent: checked as boolean }))}
              />
              <span>
                {tr(
                  "Ik geef toestemming om dit originele PDF-bestand en de ingevulde metadata te versturen voor parserverbetering.",
                  "I consent to sending this original PDF and the metadata below to help improve the parser."
                )}
              </span>
            </label>

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label htmlFor="country" className="text-xs uppercase tracking-wide text-slate-400">{tr("Land", "Country")}</Label>
                <Input
                  id="country"
                  type="text"
                  value={values.country}
                  disabled={isSubmitting}
                  onChange={(event) => setValues((current) => ({ ...current, country: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="labProvider" className="text-xs uppercase tracking-wide text-slate-400">{tr("Lab / provider", "Lab / provider")}</Label>
                <Input
                  id="labProvider"
                  type="text"
                  value={values.labProvider}
                  disabled={isSubmitting}
                  onChange={(event) => setValues((current) => ({ ...current, labProvider: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="language" className="text-xs uppercase tracking-wide text-slate-400">{tr("Taal", "Language")}</Label>
                <Input
                  id="language"
                  type="text"
                  value={values.language}
                  disabled={isSubmitting}
                  onChange={(event) => setValues((current) => ({ ...current, language: event.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="note" className="text-xs uppercase tracking-wide text-slate-400">{tr("Opmerking", "Note")}</Label>
              <Textarea
                id="note"
                value={values.note}
                disabled={isSubmitting}
                onChange={(event) => setValues((current) => ({ ...current, note: event.target.value }))}
                className="min-h-24"
                placeholder={tr(
                  "Optioneel: wat ging er mis of wat moeten we weten?",
                  "Optional: what went wrong or what should we know?"
                )}
              />
            </div>
          </div>

          {combinedError ? (
            <Alert variant="destructive">
              <AlertDescription>{combinedError}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter className="flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              {tr("Niet nu", "Not now")}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {isSubmitting
                ? tr("PDF wordt verstuurd...", "Sending PDF...")
                : "Send PDF to improve parser"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ParserImprovementSubmissionCard;
