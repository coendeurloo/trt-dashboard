import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { CLOUD_LAST_AUTH_EMAIL_STORAGE_KEY } from "../cloud/constants";
import { readAccessTokenFromHash, readEmailFromAccessToken } from "../cloud/authClient";
import { trLocale } from "../i18n";
import { mapCloudAuthErrorToMessage } from "../lib/cloudErrorMessages";
import { AppLanguage, ThemeMode } from "../types";

interface CloudPasswordResetViewProps {
  language: AppLanguage;
  theme: ThemeMode;
  recoveryUrl: string | null;
  onResetPassword: (accessToken: string, password: string) => Promise<string | null>;
}

const normalizeEmail = (value: unknown): string | null => {
  const candidate = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
};

const rememberEmail = (email: string | null) => {
  if (typeof window === "undefined") {
    return;
  }
  if (!email) {
    window.localStorage.removeItem(CLOUD_LAST_AUTH_EMAIL_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(CLOUD_LAST_AUTH_EMAIL_STORAGE_KEY, email);
};

const CloudPasswordResetView = ({
  language,
  theme,
  recoveryUrl,
  onResetPassword
}: CloudPasswordResetViewProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const isLightTheme = theme === "light";
  const accessToken = useMemo(
    () => (typeof window === "undefined" ? null : readAccessTokenFromHash(window.location.hash)),
    []
  );
  const initialEmail = useMemo(() => normalizeEmail(readEmailFromAccessToken(accessToken)), [accessToken]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetCompleted, setResetCompleted] = useState(false);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);

  const displayError = error ? mapCloudAuthErrorToMessage(error, tr) : null;
  const signInHref = successEmail
    ? `/?cloudAuth=signin&cloudEmail=${encodeURIComponent(successEmail)}`
    : initialEmail
      ? `/?cloudAuth=signin&cloudEmail=${encodeURIComponent(initialEmail)}`
      : "/?cloudAuth=signin";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) {
      setError("AUTH_RESET_LINK_INVALID");
      return;
    }
    if (password.trim().length < 6) {
      setError("AUTH_WEAK_PASSWORD");
      return;
    }
    if (password !== confirmPassword) {
      setError(
        tr(
          "De wachtwoorden komen niet overeen.",
          "The passwords do not match."
        )
      );
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      const nextEmail = normalizeEmail(await onResetPassword(accessToken, password));
      rememberEmail(nextEmail ?? initialEmail);
      setResetCompleted(true);
      setSuccessEmail(nextEmail ?? initialEmail);
      setPassword("");
      setConfirmPassword("");
      if (typeof window !== "undefined" && window.location.hash) {
        const cleanUrl = `${window.location.pathname}${window.location.search}`;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : tr("Reset mislukt.", "Reset failed."));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      className={`min-h-screen px-4 py-6 sm:px-6 sm:py-8 ${
        isLightTheme
          ? "bg-[radial-gradient(circle_at_top_right,rgba(8,145,178,0.18),transparent_34%),linear-gradient(180deg,#f8fafc_0%,#e2e8f0_100%)] text-slate-900"
          : "bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_36%),linear-gradient(180deg,#020617_0%,#071225_100%)] text-slate-100"
      }`}
    >
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-3xl items-center justify-center">
        <section
          className={`w-full overflow-hidden rounded-[28px] border p-6 shadow-[0_30px_90px_-45px_rgba(8,47,73,0.55)] sm:p-8 ${
            isLightTheme
              ? "border-slate-300/90 bg-white/95"
              : "border-cyan-500/25 bg-slate-950/88"
          }`}
        >
          <div className="flex justify-center">
            <div
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] ${
                isLightTheme
                  ? "border border-cyan-700/20 bg-cyan-500/10 text-cyan-800"
                  : "border border-cyan-500/35 bg-cyan-500/10 text-cyan-200"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {tr("Cloud security", "Cloud security")}
            </div>
          </div>

          <p className={`mt-5 text-center text-xs uppercase tracking-[0.32em] ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>
            LabTracker
          </p>

          {resetCompleted ? (
            <>
              <h1 className={`mt-3 text-center text-3xl font-semibold sm:text-4xl ${isLightTheme ? "text-slate-950" : "text-white"}`}>
                {tr("Wachtwoord bijgewerkt", "Password updated")}
              </h1>
              <p className={`mx-auto mt-4 max-w-2xl text-center text-sm leading-7 sm:text-base ${isLightTheme ? "text-slate-600" : "text-slate-300"}`}>
                {tr(
                  "Je kunt nu met je nieuwe wachtwoord inloggen bij LabTracker Cloud.",
                  "You can now sign in to LabTracker Cloud with your new password."
                )}
              </p>
              <div
                className={`mt-8 rounded-[24px] border p-5 sm:p-6 ${
                  isLightTheme
                    ? "border-slate-300 bg-slate-50/95"
                    : "border-slate-800 bg-slate-900/75"
                }`}
              >
                <div className="flex justify-center">
                  <div
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                      isLightTheme
                        ? "border border-emerald-300 bg-emerald-50 text-emerald-800"
                        : "border border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {tr("Nieuwe inlog klaar", "New sign-in ready")}
                  </div>
                </div>
                <div className="mt-5 flex justify-center">
                  <a
                    href={signInHref}
                    className={`inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                      isLightTheme
                        ? "border border-cyan-700 bg-cyan-700 text-white hover:border-cyan-800 hover:bg-cyan-800"
                        : "border border-cyan-500/45 bg-cyan-500/15 text-cyan-100 hover:border-cyan-300/75 hover:bg-cyan-500/22"
                    }`}
                  >
                    {tr("Inloggen bij LabTracker Cloud", "Sign in to LabTracker Cloud")}
                  </a>
                </div>
              </div>
            </>
          ) : accessToken ? (
            <>
              <h1 className={`mt-3 text-center text-3xl font-semibold sm:text-4xl ${isLightTheme ? "text-slate-950" : "text-white"}`}>
                {tr("Kies een nieuw wachtwoord", "Choose a new password")}
              </h1>
              <p className={`mx-auto mt-4 max-w-2xl text-center text-sm leading-7 sm:text-base ${isLightTheme ? "text-slate-600" : "text-slate-300"}`}>
                {tr(
                  "Voer hieronder je nieuwe wachtwoord in. Daarna kun je weer normaal inloggen.",
                  "Enter your new password below. After that you can sign in normally again."
                )}
              </p>

              <div
                className={`mt-8 rounded-[24px] border p-5 sm:p-6 ${
                  isLightTheme
                    ? "border-slate-300 bg-slate-50/95"
                    : "border-slate-800 bg-slate-900/75"
                }`}
              >
                <form className="mx-auto max-w-lg space-y-4" onSubmit={handleSubmit}>
                  <label className="block text-sm">
                    <span className={`mb-1.5 block text-xs uppercase tracking-wide ${isLightTheme ? "text-slate-500" : "text-slate-500"}`}>
                      {tr("Nieuw wachtwoord", "New password")}
                    </span>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="new-password"
                      minLength={6}
                      required
                      placeholder={tr("Minimaal 6 tekens", "At least 6 characters")}
                      className={`w-full rounded-xl border px-3.5 py-3 text-sm placeholder:text-slate-500 focus:outline-none ${
                        isLightTheme
                          ? "border-slate-300 bg-white text-slate-900 focus:border-cyan-600"
                          : "border-slate-700 bg-slate-900/80 text-slate-100 focus:border-cyan-400/65"
                      }`}
                    />
                  </label>

                  <label className="block text-sm">
                    <span className={`mb-1.5 block text-xs uppercase tracking-wide ${isLightTheme ? "text-slate-500" : "text-slate-500"}`}>
                      {tr("Bevestig wachtwoord", "Confirm password")}
                    </span>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      minLength={6}
                      required
                      placeholder={tr("Voer hetzelfde wachtwoord nogmaals in", "Enter the same password again")}
                      className={`w-full rounded-xl border px-3.5 py-3 text-sm placeholder:text-slate-500 focus:outline-none ${
                        isLightTheme
                          ? "border-slate-300 bg-white text-slate-900 focus:border-cyan-600"
                          : "border-slate-700 bg-slate-900/80 text-slate-100 focus:border-cyan-400/65"
                      }`}
                    />
                  </label>

                  {displayError ? (
                    <p className={`text-center text-sm ${isLightTheme ? "text-rose-700" : "text-rose-200"}`}>
                      {displayError}
                    </p>
                  ) : null}

                  <div className="flex justify-center">
                    <button
                      type="submit"
                      disabled={isBusy}
                      className={`inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${
                        isLightTheme
                          ? "border border-cyan-700 bg-cyan-700 text-white hover:border-cyan-800 hover:bg-cyan-800"
                          : "border border-cyan-500/45 bg-cyan-500/15 text-cyan-100 hover:border-cyan-300/75 hover:bg-cyan-500/22"
                      }`}
                    >
                      {isBusy ? tr("Bezig met opslaan...", "Saving...") : tr("Nieuw wachtwoord opslaan", "Save new password")}
                    </button>
                  </div>
                </form>
              </div>
            </>
          ) : recoveryUrl ? (
            <>
              <h1 className={`mt-3 text-center text-3xl font-semibold sm:text-4xl ${isLightTheme ? "text-slate-950" : "text-white"}`}>
                {tr("Reset je wachtwoord", "Reset your password")}
              </h1>
              <p className={`mx-auto mt-4 max-w-2xl text-center text-sm leading-7 sm:text-base ${isLightTheme ? "text-slate-600" : "text-slate-300"}`}>
                {tr(
                  "We wachten nog even op jouw bevestiging. Deze extra stap voorkomt dat mailapps of inbox-scanners de reset automatisch activeren.",
                  "We are waiting for your confirmation. This extra step prevents mail apps or inbox scanners from triggering the reset automatically."
                )}
              </p>

              <div
                className={`mt-8 rounded-[24px] border p-5 sm:p-6 ${
                  isLightTheme
                    ? "border-slate-300 bg-slate-50/95"
                    : "border-slate-800 bg-slate-900/75"
                }`}
              >
                <p className={`mx-auto max-w-2xl text-center text-sm leading-7 ${isLightTheme ? "text-slate-600" : "text-slate-300"}`}>
                  {tr(
                    "Zodra je hieronder op de knop drukt, openen we de beveiligde resetflow. Daarna kies je meteen een nieuw wachtwoord.",
                    "As soon as you press the button below, we will open the secure reset flow. After that you can choose a new password right away."
                  )}
                </p>
                <div className="mt-5 flex justify-center">
                  <a
                    href={recoveryUrl}
                    className={`inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                      isLightTheme
                        ? "border border-cyan-700 bg-cyan-700 text-white hover:border-cyan-800 hover:bg-cyan-800"
                        : "border border-cyan-500/45 bg-cyan-500/15 text-cyan-100 hover:border-cyan-300/75 hover:bg-cyan-500/22"
                    }`}
                  >
                    {tr("Ga verder met resetten", "Continue to password reset")}
                  </a>
                </div>
              </div>
            </>
          ) : (
            <>
              <h1 className={`mt-3 text-center text-3xl font-semibold sm:text-4xl ${isLightTheme ? "text-slate-950" : "text-white"}`}>
                {tr("Resetlink verlopen", "Reset link expired")}
              </h1>
              <p className={`mx-auto mt-4 max-w-2xl text-center text-sm leading-7 sm:text-base ${isLightTheme ? "text-slate-600" : "text-slate-300"}`}>
                {tr(
                  "Deze resetlink is ongeldig of niet meer compleet. Vraag vanuit de inlogpagina een nieuwe reset e-mail aan.",
                  "This reset link is invalid or no longer complete. Request a new reset email from the sign-in screen."
                )}
              </p>
              <div className="mt-8 flex justify-center">
                <a
                  href="/?cloudAuth=signin"
                  className={`inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                    isLightTheme
                      ? "border border-cyan-700 bg-cyan-700 text-white hover:border-cyan-800 hover:bg-cyan-800"
                      : "border border-cyan-500/45 bg-cyan-500/15 text-cyan-100 hover:border-cyan-300/75 hover:bg-cyan-500/22"
                  }`}
                >
                  {tr("Ga naar inloggen", "Go to sign in")}
                </a>
              </div>
            </>
          )}

          <p className={`mx-auto mt-6 max-w-2xl text-center text-xs leading-6 ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>
            {tr(
              "Lokale modus blijft gewoon beschikbaar. Cloud sync gaat pas weer aan zodra je opnieuw inlogt.",
              "Local mode stays available. Cloud sync turns back on only after you sign in again."
            )}
          </p>
        </section>
      </div>
    </div>
  );
};

export default CloudPasswordResetView;
