type TranslateFn = (nl: string, en: string) => string;

const extractJsonErrorDetail = (value: string): string | null => {
  const candidates = [value];
  const firstBrace = value.indexOf("{");
  if (firstBrace > 0) {
    candidates.push(value.slice(firstBrace));
  }

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed.startsWith("{")) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as
        | string
        | {
            message?: string;
            detail?: string;
            details?: string;
            error?: {
              message?: string;
              detail?: string;
              details?: string;
            };
          };
      if (typeof parsed === "string" && parsed.trim()) {
        return parsed.trim();
      }
      if (parsed && typeof parsed === "object") {
        const nested = parsed.error;
        const message =
          nested?.message ||
          nested?.detail ||
          nested?.details ||
          parsed.message ||
          parsed.detail ||
          parsed.details;
        if (typeof message === "string" && message.trim()) {
          return message.trim();
        }
      }
    } catch {
      // ignore parse failures and continue with raw text
    }
  }

  return null;
};

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
      "Je account is nog niet klaar voor cloudtoegang. Controleer je inbox voor de verificatie-e-mail en log daarna in.",
      "Your account is not ready for cloud access yet. Check your inbox for the verification email, then sign in."
    );
  }
  if (code === "AUTH_EMAIL_VERIFICATION_REQUIRED") {
    return tr(
      "Als dit e-mailadres gebruikt kan worden voor cloud signup, hebben we een verificatie-e-mail gestuurd. Controleer je inbox en log daarna in.",
      "If this email can be used for cloud signup, we sent a verification email. Check your inbox, then sign in."
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
  if (code === "AUTH_ACCOUNT_LOCKED") {
    return tr(
      "Te veel mislukte pogingen. Vraag een wachtwoord-reset e-mail aan om weer toegang te krijgen.",
      "Too many failed attempts. Request a password reset email to regain access."
    );
  }
  if (code === "AUTH_PASSWORD_RESET_EMAIL_SENT") {
    return tr(
      "Als dit e-mailadres bij een account hoort, hebben we een reset e-mail gestuurd. Controleer ook spam, ongewenst of promoties.",
      "If this email belongs to an account, we sent a reset email. Also check spam, junk, or promotions."
    );
  }
  if (code === "AUTH_RESET_LINK_INVALID") {
    return tr(
      "Deze resetlink is ongeldig of verlopen. Vraag een nieuwe reset e-mail aan.",
      "This reset link is invalid or expired. Request a new reset email."
    );
  }
  if (code === "AUTH_UNLOCK_EMAIL_SENT") {
    return tr(
      "Als dit e-mailadres bij een account hoort, hebben we een reset e-mail gestuurd. Open je inbox en volg de stappen.",
      "If this email belongs to an account, we sent a reset email. Open your inbox and follow the steps."
    );
  }
  if (code === "AUTH_VERIFICATION_EMAIL_SENT") {
    return tr(
      "Verificatie-e-mail verzonden. Controleer je inbox en klik op de bevestigingslink.",
      "Verification email sent. Check your inbox and click the confirmation link."
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
  if (code === "AUTH_EMAIL_DELIVERY_FAILED") {
    return tr(
      "De verificatie-e-mail kon niet worden verstuurd. Probeer het opnieuw.",
      "The verification email could not be sent. Please try again."
    );
  }
  if (code === "AUTH_SIGNUP_DISABLED") {
    return tr(
      "Nieuwe cloud-accounts zijn tijdelijk uitgeschakeld.",
      "New cloud signups are temporarily disabled."
    );
  }
  if (code === "AUTH_OAUTH_STATE_INVALID") {
    return tr(
      "Deze inloglink is verlopen of ongeldig. Start de Google login opnieuw vanuit de app.",
      "This sign-in link is expired or invalid. Start Google sign-in again from the app."
    );
  }
  if (
    code === "CSRF_CROSS_SITE_BLOCKED" ||
    code === "CSRF_ORIGIN_MISMATCH" ||
    code === "CSRF_REFERER_MISMATCH"
  ) {
    return tr(
      "Deze aanvraag werd geblokkeerd om je account te beschermen. Probeer opnieuw vanuit LabTracker.",
      "This request was blocked to protect your account. Try again from LabTracker."
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
  const rawMessage = raw.trim();
  if (!rawMessage) {
    return tr("Inloggen mislukt.", "Sign-in failed.");
  }
  const message = extractJsonErrorDetail(rawMessage) ?? rawMessage;

  if (isNetworkError(rawMessage) || isNetworkError(message)) {
    return tr(
      "Geen verbinding met de cloudservice. Controleer je internetverbinding en probeer opnieuw.",
      "Could not reach the cloud service. Check your internet connection and try again."
    );
  }

  const mapped = mapKnownAuthCode(extractErrorCode(rawMessage), tr);
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
  if (message.toLowerCase() === "bad request") {
    return tr(
      "De aanvraag kon niet worden verwerkt. Controleer je gegevens en probeer opnieuw.",
      "The request could not be processed. Check your details and try again."
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
  const rawMessage = raw.trim();
  if (!rawMessage) {
    return tr("Cloud-sync mislukt.", "Cloud sync failed.");
  }
  const message = extractJsonErrorDetail(rawMessage) ?? rawMessage;

  if (isNetworkError(rawMessage) || isNetworkError(message)) {
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

  const code = extractErrorCode(rawMessage);
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
  if (code === "CLOUD_RATE_LIMITED") {
    return tr(
      "Je syncverzoeken gaan te snel. Wacht even en probeer opnieuw.",
      "Your sync requests are too frequent. Wait a moment and try again."
    );
  }
  if (
    code === "CSRF_CROSS_SITE_BLOCKED" ||
    code === "CSRF_ORIGIN_MISMATCH" ||
    code === "CSRF_REFERER_MISMATCH"
  ) {
    return tr(
      "Deze aanvraag werd geblokkeerd om je gegevens te beschermen. Probeer opnieuw vanuit LabTracker.",
      "This request was blocked to protect your data. Try again from LabTracker."
    );
  }

  const mappedAuth = mapKnownAuthCode(code, tr);
  if (mappedAuth) {
    return mappedAuth;
  }
  if (message.toLowerCase() === "bad request") {
    return tr(
      "Cloud-sync kon de aanvraag niet verwerken. Probeer het opnieuw.",
      "Cloud sync could not process the request. Please try again."
    );
  }

  return message;
};
