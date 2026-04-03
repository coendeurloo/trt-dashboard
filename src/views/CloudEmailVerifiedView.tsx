import { CheckCircle2 } from "lucide-react";
import { trLocale } from "../i18n";
import { AppLanguage, ThemeMode } from "../types";

interface CloudEmailVerifiedViewProps {
  language: AppLanguage;
  theme: ThemeMode;
  prefillEmail?: string | null;
}

const CloudEmailVerifiedView = ({
  language,
  theme,
  prefillEmail = null
}: CloudEmailVerifiedViewProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const isLightTheme = theme === "light";
  const signInHref = prefillEmail
    ? `/?cloudAuth=signin&cloudEmail=${encodeURIComponent(prefillEmail)}`
    : "/?cloudAuth=signin";

  return (
    <div
      className={`min-h-screen px-4 py-6 sm:px-6 sm:py-8 ${
        isLightTheme
          ? "bg-[radial-gradient(circle_at_top_right,rgba(8,145,178,0.16),transparent_34%),linear-gradient(180deg,#f8fafc_0%,#e2e8f0_100%)] text-slate-900"
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
          <div
            className={`mx-auto inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] ${
              isLightTheme
                ? "border border-emerald-600/25 bg-emerald-500/10 text-emerald-800"
                : "border border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {tr("Verification complete", "Verification complete")}
          </div>

          <p className={`mt-5 text-center text-xs uppercase tracking-[0.32em] ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>
            LabTracker
          </p>
          <h1 className={`mt-3 text-center text-3xl font-semibold sm:text-4xl ${isLightTheme ? "text-slate-950" : "text-white"}`}>
            {tr("E-mail bevestigd", "Email verified")}
          </h1>
          <p className={`mx-auto mt-4 max-w-2xl text-center text-sm leading-7 sm:text-base ${isLightTheme ? "text-slate-600" : "text-slate-300"}`}>
            {tr(
              "Je e-mailadres is bevestigd. Log nu in bij LabTracker Cloud om veilige sync op dit apparaat te activeren.",
              "Your email is confirmed. Sign in to LabTracker Cloud now to enable secure sync on this device."
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
                "Om deze flow bewust en voorspelbaar te houden, loggen we je niet automatisch in na verificatie.",
                "To keep this flow deliberate and predictable, we do not sign you in automatically after verification."
              )}
            </p>

            <a
              href={signInHref}
              className={`mx-auto mt-5 inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                isLightTheme
                  ? "border border-cyan-700 bg-cyan-700 text-white hover:border-cyan-800 hover:bg-cyan-800"
                  : "border border-cyan-500/45 bg-cyan-500/15 text-cyan-100 hover:border-cyan-300/75 hover:bg-cyan-500/22"
              }`}
            >
              {tr("Inloggen bij LabTracker Cloud", "Sign in to LabTracker Cloud")}
            </a>

            {prefillEmail ? (
              <p className={`mx-auto mt-3 max-w-2xl text-center text-xs leading-6 ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>
                {tr(
                  `We vullen ${prefillEmail} alvast voor je in zodra de sign-in modal opent.`,
                  `We will prefill ${prefillEmail} for you as soon as the sign-in modal opens.`
                )}
              </p>
            ) : null}
          </div>

          <p className={`mx-auto mt-6 max-w-2xl text-center text-xs leading-6 ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>
            {tr(
              "Je lokale data blijft gewoon beschikbaar. Cloud sync wordt pas actief na je eerste echte login.",
              "Your local data stays available. Cloud sync only turns on after your first real sign-in."
            )}
          </p>
        </section>
      </div>
    </div>
  );
};

export default CloudEmailVerifiedView;
