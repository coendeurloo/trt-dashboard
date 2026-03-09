import { FormEvent, useEffect, useMemo, useState } from "react";
import { Cloud, Loader2, ShieldCheck, X } from "lucide-react";
import { createPortal } from "react-dom";
import { trLocale } from "../i18n";
import { AppLanguage } from "../types";
import { CloudConsentPayload } from "../cloud/consentClient";

export type CloudAuthView = "signin" | "signup";

interface CloudAuthModalProps {
  open: boolean;
  language: AppLanguage;
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
  const [view, setView] = useState<CloudAuthView>(initialView);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptPrivacyPolicy, setAcceptPrivacyPolicy] = useState(false);
  const [acceptHealthDataConsent, setAcceptHealthDataConsent] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setView(initialView);
      setLocalError(null);
    }
  }, [initialView, open]);

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

  const run = async (fn: () => Promise<void>) => {
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

  const submitEmail = async (event: FormEvent) => {
    event.preventDefault();
    await run(() => {
      if (view === "signin") {
        return onSignInEmail(email, password);
      }
      if (!consentPayload) {
        throw new Error(
          tr(
            "Bevestig eerst de privacy policy en health-data toestemming.",
            "Please confirm privacy policy and health-data consent first."
          )
        );
      }
      return onSignUpEmail(email, password, consentPayload);
    });
  };

  const signupBlocked = view === "signup" && !consentPayload;
  const consentTitle = tr("Cloud toestemming vereist", "Cloud consent required");
  const headline =
    view === "signin"
      ? tr("Log in en sync tussen apparaten", "Sign in and sync across devices")
      : tr("Maak een account voor automatische sync", "Create an account for automatic sync");
  const subline =
    view === "signin"
      ? tr(
          "Je data blijft local-first. Log alleen in als je back-up en sync tussen apparaten wilt.",
          "LabTracker stays local-first. Sign in only if you want backup and sync across devices."
        )
      : tr(
          "Cloud sync is optioneel, maar voor accountregistratie vragen we expliciet privacy- en health-data consent.",
          "Cloud sync is optional, but account registration requires explicit privacy and health-data consent."
        );

  const consentBlock = (
    <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
      <label className="flex items-start gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={acceptPrivacyPolicy}
          onChange={(event) => setAcceptPrivacyPolicy(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-400"
        />
        <span>
          {tr("Ik ga akkoord met de", "I agree to the")}{" "}
          <a
            href="/privacy-policy.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-200 underline underline-offset-2"
          >
            {tr("privacy policy", "privacy policy")}
          </a>
          .
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={acceptHealthDataConsent}
          onChange={(event) => setAcceptHealthDataConsent(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-400"
        />
        <span>
          {tr(
            "Ik geef expliciet toestemming voor verwerking van gezondheidsdata voor cloud sync.",
            "I explicitly consent to processing health data for cloud sync."
          )}
        </span>
      </label>
    </div>
  );

  const modal = (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-[28px] border border-slate-700/80 bg-slate-950/95 shadow-[0_30px_90px_-45px_rgba(34,211,238,0.65)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative overflow-hidden border-b border-slate-800 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_45%),linear-gradient(135deg,rgba(8,47,73,0.92),rgba(2,6,23,0.96))] p-5 sm:p-6">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-cyan-400/5 blur-3xl" aria-hidden />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/35 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200">
                <Cloud className="h-3.5 w-3.5" />
                {tr("Cloud sync", "Cloud sync")}
              </div>
              <h2 className="mt-3 text-xl font-semibold text-slate-50 sm:text-2xl">
                {authStatus === "authenticated" && consentRequired ? consentTitle : headline}
              </h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-slate-300">
                {authStatus === "authenticated" && consentRequired
                  ? tr(
                      "Je bent ingelogd, maar cloud sync blijft uit tot je de verplichte consent bevestigt.",
                      "You are signed in, but cloud sync remains disabled until you confirm the required consent."
                    )
                  : subline}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-700 bg-slate-900/70 p-2 text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
              aria-label={tr("Sluiten", "Close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="relative mt-4 flex flex-wrap gap-2 text-xs text-slate-300">
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-700/80 bg-slate-900/55 px-3 py-1">
              <ShieldCheck className="h-3.5 w-3.5 text-cyan-300" />
              {tr("Lokaal blijft altijd beschikbaar", "Local mode always stays available")}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-700/80 bg-slate-900/55 px-3 py-1">
              <ShieldCheck className="h-3.5 w-3.5 text-cyan-300" />
              {tr("Cloud alleen met expliciete toestemming", "Cloud only with explicit consent")}
            </span>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          {!configured ? (
            <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-100">
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
                  void run(async () => {
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
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-500/45 bg-cyan-500/15 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/75 hover:bg-cyan-500/22 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {tr("Consent bevestigen en cloud activeren", "Confirm consent and enable cloud")}
              </button>
            </>
          ) : authStatus === "authenticated" ? (
            <p className="text-sm text-slate-200">
              {tr(
                "Je bent al ingelogd. Cloud sync wordt automatisch beheerd in Settings.",
                "You are already signed in. Cloud sync is managed automatically in Settings."
              )}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-800 bg-slate-950/80 p-1">
                <button
                  type="button"
                  onClick={() => setView("signin")}
                  className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                    view === "signin"
                      ? "bg-cyan-500/15 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.35)]"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {tr("Inloggen", "Sign in")}
                </button>
                <button
                  type="button"
                  onClick={() => setView("signup")}
                  className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                    view === "signup"
                      ? "bg-cyan-500/15 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.35)]"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {tr("Account maken", "Create account")}
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  void run(() => onSignInGoogle(view, view === "signup" ? consentPayload ?? undefined : undefined));
                }}
                disabled={isBusy || authStatus === "loading" || signupBlocked}
                className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <GoogleIcon />
                {tr("Doorgaan met Google", "Continue with Google")}
              </button>

              <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.24em] text-slate-500">
                <span className="h-px flex-1 bg-slate-800" />
                {tr("of ga verder met e-mail", "or continue with email")}
                <span className="h-px flex-1 bg-slate-800" />
              </div>

              {view === "signup" ? consentBlock : null}

              <form className="space-y-3" onSubmit={submitEmail}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-slate-300">
                    <span className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">Email</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="name@example.com"
                      autoComplete={view === "signin" ? "email" : "username"}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3.5 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/65 focus:outline-none"
                      required
                    />
                  </label>
                  <label className="text-sm text-slate-300">
                    <span className="mb-1.5 block text-xs uppercase tracking-wide text-slate-500">{tr("Wachtwoord", "Password")}</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={tr("Minimaal 6 tekens", "At least 6 characters")}
                      autoComplete={view === "signin" ? "current-password" : "new-password"}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3.5 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/65 focus:outline-none"
                      minLength={6}
                      required
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isBusy || authStatus === "loading" || signupBlocked}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-500/45 bg-cyan-500/15 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/75 hover:bg-cyan-500/22 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isBusy || authStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {view === "signin" ? tr("Inloggen", "Sign in") : tr("Account maken", "Create account")}
                </button>
              </form>
            </>
          )}

          {localError || authError ? <p className="text-sm text-rose-200">{localError ?? authError}</p> : null}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default CloudAuthModal;
