type TranslateFn = (nl: string, en: string) => string;

const extractErrorCode = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const index = trimmed.indexOf(":");
  return index >= 0 ? trimmed.slice(0, index).trim() : trimmed;
};

const isNetworkError = (value: string): boolean => {
  const lower = value.toLowerCase();
  return (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed")
  );
};

const mapKnownAuthCode = (code: string, tr: TranslateFn): string | null => {
  if (!code) {
    return null;
  }
  if (code === "AUTH_INVALID_CREDENTIALS") {
    return tr(
      "Inloggen mislukt. Dit account bestaat niet of het wachtwoord klopt niet.",
      "Sign-in failed. This account doesn't exist or the password is incorrect."
    );
  }
  if (code === "AUTH_USER_ALREADY_REGISTERED") {
    return tr(
      "Er bestaat al een account met dit e-mailadres. Log in of reset je wachtwoord.",
      "An account with this email already exists. Sign in or reset your password."
    );
  }
  if (code === "AUTH_EMAIL_NOT_CONFIRMED") {
    return tr(
      "Je e-mailadres is nog niet bevestigd. Controleer je inbox en bevestig eerst je account.",
      "Your email is not confirmed yet. Check your inbox and confirm your account first."
    );
  }
  if (code === "AUTH_INVALID_EMAIL") {
    return tr(
      "Voer een geldig e-mailadres in.",
      "Please enter a valid email address."
    );
  }
  if (code === "AUTH_WEAK_PASSWORD") {
    return tr(
      "Gebruik een sterker wachtwoord (minimaal 6 tekens).",
      "Use a stronger password (at least 6 characters)."
    );
  }
  if (code === "AUTH_RATE_LIMITED") {
    return tr(
      "Te veel pogingen in korte tijd. Wacht even en probeer opnieuw.",
      "Too many attempts in a short time. Wait a moment and try again."
    );
  }
  if (code === "AUTH_UNAUTHORIZED") {
    return tr(
      "Je sessie is verlopen. Log opnieuw in.",
      "Your session expired. Please sign in again."
    );
  }
  if (code === "AUTH_PROVIDER_UNAVAILABLE") {
    return tr(
      "De cloud-auth service is tijdelijk niet beschikbaar. Probeer zo opnieuw.",
      "The cloud auth service is temporarily unavailable. Please try again shortly."
    );
  }
  if (code === "AUTH_BAD_REQUEST" || code === "AUTH_UNPROCESSABLE") {
    return tr(
      "De aanvraag kon niet worden verwerkt. Controleer je gegevens en probeer opnieuw.",
      "The request could not be processed. Check your details and try again."
    );
  }
  if (code.startsWith("AUTH_SIGNOUT_FAILED_")) {
    return tr(
      "Uitloggen bij de cloudservice mislukte. Probeer opnieuw.",
      "Cloud sign-out failed. Please try again."
    );
  }
  if (code === "AUTH_SESSION_INCOMPLETE") {
    return tr(
      "Inloggen lukte niet volledig. Probeer opnieuw.",
      "Sign-in did not complete correctly. Please try again."
    );
  }
  return null;
};

export const mapCloudAuthErrorToMessage = (
  error: unknown,
  tr: TranslateFn
): string => {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const message = raw.trim();
  if (!message) {
    return tr("Inloggen mislukt.", "Sign-in failed.");
  }

  if (isNetworkError(message)) {
    return tr(
      "Geen verbinding met de cloudservice. Controleer je internetverbinding en probeer opnieuw.",
      "Could not reach the cloud service. Check your internet connection and try again."
    );
  }

  const mapped = mapKnownAuthCode(extractErrorCode(message), tr);
  if (mapped) {
    return mapped;
  }

  if (message.includes("Consent is required before creating an account.")) {
    return tr(
      "Je moet eerst beide consent-vakjes aanvinken om een account te maken.",
      "You must check both consent boxes before creating an account."
    );
  }
  if (message.includes("Could not save signup consent.")) {
    return tr(
      "Account is aangemaakt, maar consent opslaan mislukte. Rond consent af via Settings.",
      "Your account was created, but saving consent failed. Complete consent in Settings."
    );
  }
  if (message.includes("Could not save consent after signup.")) {
    return tr(
      "Account is aangemaakt, maar consent opslaan mislukte. Rond consent af via Settings.",
      "Your account was created, but saving consent failed. Complete consent in Settings."
    );
  }

  if (message.startsWith("AUTH_HTTP_")) {
    return tr(
      "Cloud-auth mislukt. Probeer opnieuw of log later nog eens in.",
      "Cloud auth failed. Please try again or sign in again later."
    );
  }

  return message;
};

export const mapCloudSyncErrorToMessage = (
  error: unknown,
  tr: TranslateFn
): string => {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const message = raw.trim();
  if (!message) {
    return tr("Cloud-sync mislukt.", "Cloud sync failed.");
  }

  if (isNetworkError(message)) {
    return tr(
      "Geen verbinding met de cloudservice. Controleer je internetverbinding en probeer opnieuw.",
      "Could not reach the cloud service. Check your internet connection and try again."
    );
  }

  if (message.includes("Cloud schema version") && message.includes("mismatch")) {
    return tr(
      "Cloud-schema komt niet overeen met deze appversie. Werk de app bij en probeer opnieuw.",
      "Cloud schema does not match this app version. Update the app and try again."
    );
  }

  const code = extractErrorCode(message);
  if (code === "REVISION_MISMATCH" || code === "P0001") {
    return tr(
      "Er is een sync-conflict gevonden. Kies eerst of je de cloud- of lokale versie wilt gebruiken.",
      "A sync conflict was detected. First choose whether to keep the cloud or local version."
    );
  }
  if (code === "AUTH_REQUIRED" || code === "SUPABASE_HTTP_401" || code === "SUPABASE_HTTP_403") {
    return tr(
      "Je sessie is verlopen. Log opnieuw in om cloud-sync te hervatten.",
      "Your session expired. Sign in again to resume cloud sync."
    );
  }
  if (code.startsWith("SUPABASE_HTTP_5")) {
    return tr(
      "De cloudservice is tijdelijk niet beschikbaar. Probeer het zo opnieuw.",
      "The cloud service is temporarily unavailable. Please try again shortly."
    );
  }
  if (
    code === "CLOUD_REPLACE_FAILED" ||
    code === "CLOUD_PATCH_FAILED" ||
    code === "CLOUD_REPLACE_UNEXPECTED" ||
    code === "CLOUD_PATCH_UNEXPECTED"
  ) {
    return tr(
      "Cloud-sync is mislukt. Probeer opnieuw.",
      "Cloud sync failed. Please try again."
    );
  }

  const mappedAuth = mapKnownAuthCode(code, tr);
  if (mappedAuth) {
    return mappedAuth;
  }

  return message;
};

