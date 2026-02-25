import { t } from "../i18n";
import { ShareClientError } from "../shareClient";
import { AppSettings } from "../types";

type TranslateFn = (nl: string, en: string) => string;
type AppLanguage = AppSettings["language"];
type ErrorScope = "ai" | "pdf";

interface ServiceErrorMessageParams {
  error: unknown;
  scope: ErrorScope;
  language: AppLanguage;
  tr: TranslateFn;
}

export const mapServiceErrorToMessage = ({
  error,
  scope,
  language,
  tr
}: ServiceErrorMessageParams): string => {
  if (!(error instanceof Error)) {
    return scope === "ai"
      ? tr("AI-analyse kon niet worden uitgevoerd.", "AI analysis could not be completed.")
      : t(language, "pdfProcessFailed");
  }

  const code = error.message ?? "";
  if (scope === "ai") {
    if (code === "AI_CONSENT_REQUIRED") {
      return tr(
        "AI staat uit. Geef eerst expliciete toestemming in Instellingen > Privacy & AI.",
        "AI is disabled. Please grant explicit consent first in Settings > Privacy & AI."
      );
    }
    if (code === "AI_LIMITS_UNAVAILABLE") {
      return tr(
        "AI is tijdelijk niet beschikbaar omdat de limietservice niet reageert. Probeer later opnieuw.",
        "AI is temporarily unavailable because the limits service is unreachable. Please try again later."
      );
    }
    if (code.startsWith("AI_RATE_LIMITED:")) {
      const seconds = Number(code.split(":")[1] ?? "0");
      const minutes = Math.max(1, Math.ceil((Number.isFinite(seconds) ? seconds : 0) / 60));
      return t(language, "aiRateLimited").replace("{minutes}", String(minutes));
    }
    if (code === "AI_PROXY_UNREACHABLE") {
      return t(language, "aiProxyUnreachable");
    }
    if (code === "AI_EMPTY_RESPONSE") {
      return t(language, "aiEmptyResponse");
    }
    if (code === "AI_OVERLOADED") {
      return tr(
        "AI-service is tijdelijk druk (overloaded). We hebben retries en fallback geprobeerd; probeer het zo opnieuw.",
        "AI service is temporarily busy (overloaded). Retries and fallback were attempted; please try again now."
      );
    }
    if (code.startsWith("AI_REQUEST_FAILED:")) {
      const [, status, ...rest] = code.split(":");
      const details = rest.join(":").trim();
      if (status === "529") {
        return tr(
          "AI-provider is tijdelijk overbelast (529 Overloaded). Wacht 30-90 seconden en probeer opnieuw.",
          "AI provider is temporarily overloaded (529 Overloaded). Wait 30-90 seconds and retry."
        );
      }
      const suffix = details ? ` (${status || "unknown"}: ${details})` : ` (${status || "unknown"})`;
      return `${t(language, "aiRequestFailed")}${suffix}`;
    }
    return error.message;
  }

  if (code === "PDF_PROXY_UNREACHABLE") {
    return t(language, "pdfProxyUnreachable");
  }
  if (code === "AI_LIMITS_UNAVAILABLE") {
    return tr(
      "AI parserfallback is tijdelijk niet beschikbaar omdat de limietservice niet reageert.",
      "AI parser fallback is temporarily unavailable because the limits service is unreachable."
    );
  }
  if (code === "PDF_EMPTY_RESPONSE") {
    return t(language, "pdfEmptyResponse");
  }
  if (code.startsWith("PDF_EXTRACTION_FAILED:")) {
    const [, status, ...rest] = code.split(":");
    const details = rest.join(":").trim();
    const suffix = details ? ` (${status || "unknown"}: ${details})` : ` (${status || "unknown"})`;
    return `${t(language, "pdfExtractionFailed")}${suffix}`;
  }
  return t(language, "pdfProcessFailed");
};

export const mapShareServiceErrorToMessage = (error: unknown, tr: TranslateFn): string => {
  if (!(error instanceof ShareClientError)) {
    return tr(
      "De deellink kon niet worden aangemaakt. Probeer later opnieuw.",
      "Could not create the share link. Please try again later."
    );
  }

  if (error.code === "SHARE_PROXY_UNREACHABLE" || error.code === "SHARE_STORE_UNAVAILABLE") {
    return tr(
      "De deellinkservice is tijdelijk niet bereikbaar. Probeer later opnieuw.",
      "The share-link service is temporarily unreachable. Please try again later."
    );
  }

  if (error.code === "SHARE_CRYPTO_MISCONFIGURED") {
    return tr(
      "De deellinkservice is tijdelijk verkeerd geconfigureerd. Probeer later opnieuw.",
      "The share-link service is temporarily misconfigured. Please try again later."
    );
  }

  if (error.code === "SHARE_TOKEN_REQUIRED" || error.code === "SHARE_CODE_INVALID") {
    return tr(
      "De deellink kon niet worden opgebouwd door ongeldige data.",
      "The share link could not be created due to invalid data."
    );
  }

  return tr(
    "De deellink kon niet worden aangemaakt. Probeer later opnieuw.",
    "Could not create the share link. Please try again later."
  );
};
