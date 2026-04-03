import { ShieldCheck } from "lucide-react";
import { trLocale } from "../i18n";
import { AppLanguage, ThemeMode } from "../types";

interface CloudEmailConfirmViewProps {
  language: AppLanguage;
  theme: ThemeMode;
  confirmationUrl: string | null;
}

const CloudEmailConfirmView = ({
  language,
  theme,
  confirmationUrl
}: CloudEmailConfirmViewProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const isLightTheme = theme === "light";

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

          <p className={`mt-5 text-xs uppercase tracking-[0.32em] ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>
            LabTracker
          </p>
          <h1 className={`mt-3 text-3xl font-semibold sm:text-4xl ${isLightTheme ? "text-slate-950" : "text-white"}`}>
            {tr("Bevestig je e-mailadres", "Confirm your email")}
          </h1>
          <p className={`mt-4 max-w-2xl text-sm leading-7 sm:text-base ${isLightTheme ? "text-slate-600" : "text-slate-300"}`}>
            {tr(
              "Deze extra stap voorkomt dat inbox-scanners of mailapps je verificatie automatisch activeren. Er gebeurt pas iets zodra jij hieronder op de knop klikt.",
              "This extra step prevents inbox scanners or mail apps from triggering verification automatically. Nothing happens until you press the button below."
            )}
          </p>

          <div
            className={`mt-8 rounded-[24px] border p-5 sm:p-6 ${
              isLightTheme
                ? "border-slate-300 bg-slate-50/95"
                : "border-slate-800 bg-slate-900/75"
            }`}
          >
            <p className={`text-sm leading-7 ${isLightTheme ? "text-slate-600" : "text-slate-300"}`}>
              {tr(
                "Na bevestiging sturen we je naar de afrondpagina. Je wordt niet automatisch ingelogd.",
                "After verification we will send you to the final confirmation screen. You will not be signed in automatically."
              )}
            </p>

            {confirmationUrl ? (
              <a
                href={confirmationUrl}
                className={`mt-5 inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  isLightTheme
                    ? "border border-cyan-700 bg-cyan-700 text-white hover:border-cyan-800 hover:bg-cyan-800"
                    : "border border-cyan-500/45 bg-cyan-500/15 text-cyan-100 hover:border-cyan-300/75 hover:bg-cyan-500/22"
                }`}
              >
                {tr("E-mail bevestigen", "Verify email")}
              </a>
            ) : (
              <div
                className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
                  isLightTheme
                    ? "border-rose-300 bg-rose-50 text-rose-800"
                    : "border-rose-500/35 bg-rose-500/10 text-rose-100"
                }`}
              >
                {tr(
                  "Deze verificatielink is ongeldig of onvolledig. Vraag vanuit de app een nieuwe verificatie-e-mail aan.",
                  "This verification link is invalid or incomplete. Request a new verification email from the app."
                )}
              </div>
            )}
          </div>

          <p className={`mt-6 text-xs leading-6 ${isLightTheme ? "text-slate-500" : "text-slate-400"}`}>
            {tr(
              "Lokale modus blijft altijd beschikbaar, ook als je later terugkomt om cloud sync te activeren.",
              "Local mode always stays available, even if you come back later to enable cloud sync."
            )}
          </p>
        </section>
      </div>
    </div>
  );
};

export default CloudEmailConfirmView;
