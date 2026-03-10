import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Cloud, Loader2, ShieldCheck, X } from "lucide-react";
import { createPortal } from "react-dom";
import { trLocale } from "../i18n";
import { AppLanguage, ThemeMode } from "../types";
import { CloudConsentPayload } from "../cloud/consentClient";

export type CloudAuthView = "signin" | "signup";

interface CloudAuthModalProps {
  open: boolean;
  language: AppLanguage;
  theme: ThemeMode;
  configured: boolean;
  initialView: CloudAuthView;
  authStatus: "loading" | "authenticated" | "unauthenticated" | "error";
  authError: string | null;
  consentRequired: boolean;
  privacyPolicyVersion: string;
  onClose: () => void;
  onSignInGoogle: (intent?: "signin" | "signup", payload?: CloudConsentPayload) => Promise<void>;
  onSignInEmail: (email: string, password: string) => Promise<void>;
  onSignUpEmail: (email: string, password: string, payload: CloudConsentPayload) => Promise<void>;
  onCompleteConsent: (payload: CloudConsentPayload) => Promise<void>;
}

const GoogleIcon = () => (
  <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
    <path
      d="M21.805 12.23c0-.72-.065-1.412-.186-2.076H12v3.93h5.498a4.704 4.704 0 0 1-2.038 3.087v2.563h3.298c1.93-1.777 3.047-4.4 3.047-7.504Z"
      fill="#4285F4"
    />
    <path
      d="M12 22c2.76 0 5.074-.915 6.765-2.477l-3.298-2.563c-.914.613-2.083.975-3.467.975-2.664 0-4.923-1.798-5.728-4.215H2.863v2.643A9.997 9.997 0 0 0 12 22Z"
      fill="#34A853"
    />
    <path
      d="M6.272 13.72A5.997 5.997 0 0 1 5.952 12c0-.597.107-1.176.32-1.72V7.637H2.863A10 10 0 0 0 2 12c0 1.61.385 3.135 1.067 4.363l3.205-2.643Z"
      fill="#FBBC05"
    />
    <path
      d="M12 6.064c1.502 0 2.85.516 3.91 1.528l2.932-2.932C17.069 2.994 14.755 2 12 2A9.997 9.997 0 0 0 2.863 7.637l3.409 2.643c.805-2.417 3.064-4.216 5.728-4.216Z"
      fill="#EA4335"
    />
  </svg>
);

const CloudAuthModal = ({
  open,
  language,
  theme,
  configured,
  initialView,
  authStatus,
  authError,
  consentRequired,
  privacyPolicyVersion,
  onClose,
  onSignInGoogle,
  onSignInEmail,
  onSignUpEmail,
  onCompleteConsent
}: CloudAuthModalProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const isLightTheme = theme === "light";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptPrivacyPolicy, setAcceptPrivacyPolicy] = useState(false);
  const [acceptHealthDataConsent, setAcceptHealthDataConsent] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [consentNotice, setConsentNotice] = useState<string | null>(null);
  const [consentHighlight, setConsentHighlight] = useState(false);
  const consentNoticeTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setEmail("");
    setPassword("");
    setAcceptPrivacyPolicy(false);
    setAcceptHealthDataConsent(false);
    setLocalError(null);
    setConsentNotice(null);
    setConsentHighlight(false);
  }, [initialView, open]);

  useEffect(() => {
    return () => {
      if (consentNoticeTimeoutRef.current !== null) {
        globalThis.clearTimeout(consentNoticeTimeoutRef.current);
      }
    };
  }, []);

  const consentPayload = useMemo<CloudConsentPayload | null>(() => {
    if (!acceptPrivacyPolicy || !acceptHealthDataConsent) {
      return null;
    }
    return {
      acceptPrivacyPolicy: true,
      acceptHealthDataConsent: true,
      privacyPolicyVersion
    };
  }, [acceptHealthDataConsent, acceptPrivacyPolicy, privacyPolicyVersion]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const isSignupView = initialView === "signup";
  const signupBlocked = isSignupView && !consentPayload;

  const showConsentNotice = () => {
    const message = tr(
      "Start hier: vink eerst beide consent-vakjes aan om verder te gaan.",
      "Start here: check both consent boxes first to continue."
    );
    setConsentNotice(message);
    setConsentHighlight(true);
    if (consentNoticeTimeoutRef.current !== null) {
      globalThis.clearTimeout(consentNoticeTimeoutRef.current);
    }
    consentNoticeTimeoutRef.current = globalThis.setTimeout(() => {
      setConsentNotice(null);
      setConsentHighlight(false);
      consentNoticeTimeoutRef.current = null;
    }, 3200);
  };

  const runWithClose = async (fn: () => Promise<void>) => {
    setIsBusy(true);
    setLocalError(null);
    try {
      await fn();
      onClose();
      setPassword("");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : tr("Actie mislukt.", "Action failed."));
    } finally {
      setIsBusy(false);
    }
  };

  const runWithoutClose = async (fn: () => Promise<void>) => {
    setIsBusy(true);
    setLocalError(null);
    try {
      await fn();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : tr("Actie mislukt.", "Action failed."));
    } finally {
      setIsBusy(false);
    }
  };

  const handleGoogleClick = async () => {
    await runWithoutClose(async () => {
      if (isSignupView && !consentPayload) {
        showConsentNotice();
        return;
      }
      await onSignInGoogle(initialView, isSignupView ? consentPayload ?? undefined : undefined);
    });
  };

  const submitEmail = async (event: FormEvent) => {
    event.preventDefault();
    if (isSignupView && !consentPayload) {
      setLocalError(null);
      showConsentNotice();
      return;
    }
    const signupPayload = consentPayload;
    await runWithClose(() => {
      if (isSignupView) {
        if (!signupPayload) {
          throw new Error(
            tr(
              "Bevestig eerst de privacy policy en health-data toestemming.",
              "Please confirm privacy policy and health-data consent first."
            )
          );
        }
        return onSignUpEmail(email, password, signupPayload);
      }
      return onSignInEmail(email, password);
    });
  };

  const consentBlock = (
    <div
      className={`space-y-2 rounded-2xl p-3 transition ${
        isLightTheme
          ? "border border-slate-300 bg-slate-50/95"
          : "border border-slate-800 bg-slate-950/70"
      } ${
        consentHighlight && signupBlocked
          ? isLightTheme
            ? "ring-2 ring-cyan-500/45"
            : "ring-2 ring-cyan-400/45"
          : ""
      }`}
    >
      <label className={`flex items-start gap-2 text-sm ${isLightTheme ? "text-slate-700" : "text-slate-200"}`}>
        <input
          type="checkbox"
          checked={acceptPrivacyPolicy}
          onChange={(event) => setAcceptPrivacyPolicy(event.target.checked)}
          className={`mt-0.5 h-4 w-4 rounded text-cyan-500 ${
            isLightTheme ? "border-slate-400 bg-white" : "border-slate-600 bg-slate-900"
          }`}
        />
        <span>
          {tr("Ik ga akkoord met de", "I agree to the")}{" "}
          <a
            href="/privacy-policy.html"
            target="_blank"
            rel="noopener noreferrer"
            className={`underline underline-offset-2 ${isLightTheme ? "text-cyan-700" : "text-cyan-200"}`}
          >
            {tr("privacy policy", "privacy policy")}
          </a>
          .
        </span>
      </label>
      <label className={`flex items-start gap-2 text-sm ${isLightTheme ? "text-slate-700" : "text-slate-200"}`}>
        <input
          type="checkbox"
          checked={acceptHealthDataConsent}
          onChange={(event) => setAcceptHealthDataConsent(event.target.checked)}
          className={`mt-0.5 h-4 w-4 rounded text-cyan-500 ${
            isLightTheme ? "border-slate-400 bg-white" : "border-slate-600 bg-slate-900"
          }`}
        />
        <span>
          {tr(
            "Ik geef expliciet toestemming voor verwerking van gezondheidsdata voor cloud sync.",
            "I explicitly consent to processing health data for cloud sync."
          )}
        </span>
      </label>
      {isSignupView ? (
        <p className={`text-xs ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>
          {tr(
            "Beide vinkjes zijn verplicht voor accountregistratie.",
            "Both checkboxes are required to create an account."
          )}
        </p>
      ) : null}
    </div>
  );

  const title = authStatus === "authenticated" && consentRequired
    ? tr("Cloud toestemming vereist", "Cloud consent required")
    : isSignupView
      ? tr("Maak een account voor automatische sync", "Create an account for automatic sync")
      : tr("Log in voor cloud sync", "Sign in for cloud sync");

  const subtitle = authStatus === "authenticated" && consentRequired
    ? tr(
        "Je bent ingelogd, maar cloud sync blijft uit tot je de verplichte consent bevestigt.",
        "You are signed in, but cloud sync remains disabled until you confirm the required consent."
      )
    : isSignupView
      ? tr(
          "Cloud sync is optioneel. Maak een account als je back-up en sync tussen apparaten wilt.",
          "Cloud sync is optional. Create an account if you want backup and sync across devices."
        )
      : tr(
          "Log in om je clouddata te openen en automatisch te synchroniseren tussen apparaten.",
          "Sign in to access your cloud data and automatically sync across devices."
        );

  const modal = (
    <div
      className={`fixed inset-0 z-[90] flex items-center justify-center p-4 backdrop-blur-sm ${
        isLightTheme ? "bg-slate-900/45" : "bg-slate-950/80"
      }`}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-xl overflow-hidden rounded-[28px] ${
          isLightTheme
            ? "border border-slate-300/80 bg-white/95 shadow-[0_28px_72px_-42px_rgba(15,23,42,0.45)]"
            : "border border-slate-700/80 bg-slate-950/95 shadow-[0_30px_90px_-45px_rgba(34,211,238,0.65)]"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={`relative overflow-hidden p-5 sm:p-6 ${
            isLightTheme
              ? "border-b border-slate-200 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,0.14),transparent_52%),linear-gradient(145deg,rgba(240,249,255,0.98),rgba(255,255,255,0.98))]"
              : "border-b border-slate-800 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_45%),linear-gradient(135deg,rgba(8,47,73,0.92),rgba(2,6,23,0.96))]"
          }`}
        >
          <div
            className={`pointer-events-none absolute inset-x-0 top-0 h-24 blur-3xl ${isLightTheme ? "bg-cyan-400/10" : "bg-cyan-400/5"}`}
            aria-hidden
          />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] ${
                  isLightTheme
                    ? "border border-cyan-600/30 bg-cyan-500/12 text-cyan-800"
                    : "border border-cyan-500/35 bg-cyan-500/10 text-cyan-200"
                }`}
              >
                <Cloud className="h-3.5 w-3.5" />
                {tr("Cloud sync", "Cloud sync")}
              </div>
              <h2 className={`mt-3 text-xl font-semibold sm:text-2xl ${isLightTheme ? "text-slate-900" : "text-slate-50"}`}>{title}</h2>
              <p className={`mt-2 max-w-lg text-sm leading-6 ${isLightTheme ? "text-slate-600" : "text-slate-300"}`}>{subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`rounded-full p-2 transition ${
                isLightTheme
                  ? "border border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
                  : "border border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500 hover:text-slate-100"
              }`}
              aria-label={tr("Sluiten", "Close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className={`relative mt-4 text-xs ${isLightTheme ? "text-slate-600" : "text-slate-300"}`}>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 ${
                isLightTheme
                  ? "border border-slate-300 bg-white/90"
                  : "border border-slate-700/80 bg-slate-900/55"
              }`}
            >
              <ShieldCheck className={`h-3.5 w-3.5 ${isLightTheme ? "text-cyan-700" : "text-cyan-300"}`} />
              {tr("Lokale modus blijft altijd beschikbaar", "Local mode always stays available")}
            </span>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          {!configured ? (
            <div
              className={`rounded-2xl border p-4 text-sm ${
                isLightTheme
                  ? "border-amber-400/45 bg-amber-100/80 text-amber-900"
                  : "border-amber-500/35 bg-amber-500/10 text-amber-100"
              }`}
            >
              {tr(
                "Cloud is nog niet geconfigureerd. Voeg eerst `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` toe.",
                "Cloud is not configured yet. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` first."
              )}
            </div>
          ) : authStatus === "authenticated" && consentRequired ? (
            <>
              {consentBlock}
              <button
                type="button"
                disabled={isBusy || !consentPayload}
                onClick={() => {
                  void runWithClose(async () => {
                    if (!consentPayload) {
                      throw new Error(
                        tr(
                          "Bevestig beide consent-opties om door te gaan.",
                          "Please confirm both consent options to continue."
                        )
                      );
                    }
                    await onCompleteConsent(consentPayload);
                  });
                }}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${
                  isLightTheme
                    ? "border border-cyan-700/65 bg-cyan-700 text-white hover:border-cyan-800 hover:bg-cyan-800"
                    : "border border-cyan-500/45 bg-cyan-500/15 text-cyan-100 hover:border-cyan-300/75 hover:bg-cyan-500/22"
                }`}
              >
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {tr("Consent bevestigen en cloud activeren", "Confirm consent and enable cloud")}
              </button>
            </>
          ) : authStatus === "authenticated" ? (
            <p className={`text-sm ${isLightTheme ? "text-slate-700" : "text-slate-200"}`}>
              {tr(
                "Je bent al ingelogd. Cloud sync wordt automatisch beheerd in Settings.",
                "You are already signed in. Cloud sync is managed automatically in Settings."
              )}
            </p>
          ) : (
            <>
              {isSignupView ? consentBlock : null}

              {isSignupView && consentNotice ? (
                <div
                  role="status"
                  aria-live="polite"
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    isLightTheme
                      ? "border-cyan-500/45 bg-cyan-50 text-cyan-900"
                      : "border-cyan-500/40 bg-cyan-500/10 text-cyan-100"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" />
                    {consentNotice}
                  </span>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  void handleGoogleClick();
                }}
                disabled={isBusy || authStatus === "loading"}
                className={`inline-flex w-full items-center justify-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-70 ${
                  isLightTheme
                    ? "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                    : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                }`}
              >
                <GoogleIcon />
                {tr("Doorgaan met Google", "Continue with Google")}
              </button>

              <div className={`flex items-center gap-3 text-[11px] uppercase tracking-[0.24em] ${isLightTheme ? "text-slate-500" : "text-slate-500"}`}>
                <span className={`h-px flex-1 ${isLightTheme ? "bg-slate-300" : "bg-slate-800"}`} />
                {tr("of ga verder met e-mail", "or continue with email")}
                <span className={`h-px flex-1 ${isLightTheme ? "bg-slate-300" : "bg-slate-800"}`} />
              </div>

              <form className="space-y-3" onSubmit={submitEmail}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={`text-sm ${isLightTheme ? "text-slate-700" : "text-slate-300"}`}>
                    <span className={`mb-1.5 block text-xs uppercase tracking-wide ${isLightTheme ? "text-slate-500" : "text-slate-500"}`}>Email</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      onFocus={() => {
                        if (isSignupView && !consentPayload) {
                          showConsentNotice();
                        }
                      }}
                      placeholder="name@example.com"
                      autoComplete={isSignupView ? "username" : "email"}
                      className={`w-full rounded-xl border px-3.5 py-3 text-sm placeholder:text-slate-500 focus:outline-none ${
                        isLightTheme
                          ? "border-slate-300 bg-white text-slate-900 focus:border-cyan-600"
                          : "border-slate-700 bg-slate-900/80 text-slate-100 focus:border-cyan-400/65"
                      }`}
                      required
                    />
                  </label>
                  <label className={`text-sm ${isLightTheme ? "text-slate-700" : "text-slate-300"}`}>
                    <span className={`mb-1.5 block text-xs uppercase tracking-wide ${isLightTheme ? "text-slate-500" : "text-slate-500"}`}>{tr("Wachtwoord", "Password")}</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      onFocus={() => {
                        if (isSignupView && !consentPayload) {
                          showConsentNotice();
                        }
                      }}
                      placeholder={tr("Minimaal 6 tekens", "At least 6 characters")}
                      autoComplete={isSignupView ? "new-password" : "current-password"}
                      className={`w-full rounded-xl border px-3.5 py-3 text-sm placeholder:text-slate-500 focus:outline-none ${
                        isLightTheme
                          ? "border-slate-300 bg-white text-slate-900 focus:border-cyan-600"
                          : "border-slate-700 bg-slate-900/80 text-slate-100 focus:border-cyan-400/65"
                      }`}
                      minLength={6}
                      required
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isBusy || authStatus === "loading"}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${
                    isLightTheme
                      ? "border border-cyan-700/65 bg-cyan-700 text-white hover:border-cyan-800 hover:bg-cyan-800"
                      : "border border-cyan-500/45 bg-cyan-500/15 text-cyan-100 hover:border-cyan-300/75 hover:bg-cyan-500/22"
                  }`}
                >
                  {isBusy || authStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {isSignupView ? tr("Account maken", "Create account") : tr("Inloggen", "Sign in")}
                </button>
              </form>

              {isSignupView && signupBlocked ? (
                <p className={`text-xs ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>
                  {tr(
                    "Vink beide verplichte checkboxen aan om accountregistratie te starten.",
                    "Check both required checkboxes to start account registration."
                  )}
                </p>
              ) : null}
            </>
          )}

          {localError || authError ? (
            <p className={`text-sm ${isLightTheme ? "text-rose-700" : "text-rose-200"}`}>{localError ?? authError}</p>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default CloudAuthModal;
