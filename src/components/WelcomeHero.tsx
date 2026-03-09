import { motion } from "framer-motion";
import { ArrowRight, BarChart3, Cloud, FileText, Lock, Play, Sparkles, Upload } from "lucide-react";
import dashboardFirstVisitPreview from "../assets/dashboard-first-visit.png";
import { USER_PROFILES } from "../data/userProfiles";
import { trLocale } from "../i18n";
import { AppLanguage, UserProfile } from "../types";
import { useState } from "react";
import { createPortal } from "react-dom";

export interface WelcomeHeroProps {
  language: AppLanguage;
  cloudConfigured: boolean;
  cloudReady: boolean;
  onLoadDemo: (profile: UserProfile) => void;
  onUploadClick: () => void;
  onSetUserProfile: (profile: UserProfile) => void;
  onOpenCloudAuth: (view: "signin" | "signup") => void;
}

const WelcomeHero = ({ language, cloudConfigured, cloudReady, onLoadDemo, onUploadClick, onSetUserProfile, onOpenCloudAuth }: WelcomeHeroProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const [pendingAction, setPendingAction] = useState<"demo" | "upload" | null>(null);

  const steps = [
    {
      icon: Upload,
      title: tr("Upload je lab-PDF", "Upload your lab PDF"),
      description: tr(
        "Sleep je PDF in de app. We halen markers, waarden en referenties direct voor je op.",
        "Drop your PDF into the app. Markers are extracted automatically."
      ),
      preview: "upload" as const
    },
    {
      icon: BarChart3,
      title: tr("Bekijk je trends", "See your trends"),
      description: tr(
        "Zie in seconden hoe je markers bewegen, inclusief referentiebereiken en trendrichting.",
        "Charts, reference ranges, and changes over time — visible immediately."
      ),
      preview: "trends" as const
    },
    {
      icon: Sparkles,
      title: tr("Optimaliseer je protocol", "Optimize your protocol"),
      description: tr(
        "Koppel je protocol aan je labs en laat AI alleen meedenken als jij daar expliciet voor kiest.",
        "Connect protocols to your labs and use AI only if you explicitly opt in."
      ),
      preview: "protocol" as const
    }
  ];

  const trust = [
    {
      icon: Lock,
      label: tr("Standaard lokaal verwerkt", "Local processing by default"),
      description: tr(
        "Analyse draait lokaal in je browser. Jij houdt controle over je data.",
        "Processing runs locally in your browser so you stay in control."
      )
    },
    {
      icon: FileText,
      label: tr("Werkt met veel lab-formaten", "Works with many lab formats"),
      description: tr(
        "Ondersteunt veel lab-PDF's, inclusief scans via OCR fallback.",
        "Handles many lab PDF formats, including scans with OCR fallback."
      )
    }
  ];

  const renderStepPreview = (preview: "upload" | "trends" | "protocol") => {
    if (preview === "upload") {
      return (
        <div className="welcome-hero-preview-shell rounded-lg border border-slate-700/70 bg-slate-900/70 p-2.5">
          <svg viewBox="0 0 260 100" className="w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="260" height="100" rx="10" fill="#0f172a" stroke="#1e293b" strokeWidth="1" />
            <rect x="24" y="18" width="48" height="62" rx="4" fill="#0f172a" stroke="#22d3ee" strokeWidth="1.5" strokeOpacity="0.45" />
            <path d="M56 18 L72 18 L72 34 L56 34 Z" fill="#0f172a" />
            <path d="M56 18 L56 34 L72 34" stroke="#22d3ee" strokeWidth="1.5" strokeOpacity="0.45" strokeLinejoin="round" fill="#1e293b" />
            <path d="M48 58 L48 42 M40 48 L48 38 L56 48" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" />
            <path d="M84 50 L100 50" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M96 46 L102 50 L96 54" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="114" y="18" width="128" height="24" rx="6" fill="#1e293b" />
            <rect x="122" y="27" width="32" height="6" rx="3" fill="#22d3ee" fillOpacity="0.45" />
            <rect x="162" y="27" width="20" height="6" rx="3" fill="#94a3b8" fillOpacity="0.2" />
            <rect x="190" y="27" width="36" height="6" rx="3" fill="#22c55e" fillOpacity="0.3" />
            <rect x="114" y="48" width="128" height="24" rx="6" fill="#1e293b" />
            <rect x="122" y="57" width="38" height="6" rx="3" fill="#22d3ee" fillOpacity="0.35" />
            <rect x="168" y="57" width="16" height="6" rx="3" fill="#94a3b8" fillOpacity="0.2" />
            <rect x="192" y="57" width="34" height="6" rx="3" fill="#22c55e" fillOpacity="0.3" />
            <rect x="114" y="78" width="128" height="4" rx="2" fill="#1e293b" fillOpacity="0.4" />
          </svg>
        </div>
      );
    }

    if (preview === "trends") {
      return (
        <div className="welcome-hero-preview-shell rounded-lg border border-slate-700/70 bg-slate-900/70 p-2.5">
          <svg viewBox="0 0 260 100" className="w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="260" height="100" rx="10" fill="#0f172a" stroke="#1e293b" strokeWidth="1" />
            <rect x="24" y="24" width="212" height="32" fill="#22d3ee" fillOpacity="0.05" />
            <line x1="24" y1="24" x2="236" y2="24" stroke="#22d3ee" strokeWidth="0.75" strokeOpacity="0.12" strokeDasharray="4 4" />
            <line x1="24" y1="56" x2="236" y2="56" stroke="#22d3ee" strokeWidth="0.75" strokeOpacity="0.12" strokeDasharray="4 4" />
            <defs>
              <linearGradient id="welcome-step-trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points="36,70 74,58 112,44 150,40 188,46 226,36 226,82 36,82" fill="url(#welcome-step-trend-fill)" />
            <polyline points="36,70 74,58 112,44 150,40 188,46 226,36" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="36" cy="70" r="4" fill="#0f172a" stroke="#22d3ee" strokeWidth="2" />
            <circle cx="74" cy="58" r="4" fill="#0f172a" stroke="#22d3ee" strokeWidth="2" />
            <circle cx="112" cy="44" r="4" fill="#0f172a" stroke="#22d3ee" strokeWidth="2" />
            <circle cx="150" cy="40" r="4" fill="#0f172a" stroke="#22d3ee" strokeWidth="2" />
            <circle cx="188" cy="46" r="4" fill="#0f172a" stroke="#22d3ee" strokeWidth="2" />
            <circle cx="226" cy="36" r="5" fill="#22d3ee" />
            <circle cx="36" cy="70" r="8" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeOpacity="0.35" strokeDasharray="3 3" />
          </svg>
        </div>
      );
    }

    return (
      <div className="welcome-hero-preview-shell rounded-lg border border-slate-700/70 bg-slate-900/70 p-2.5">
        <svg viewBox="0 0 260 100" className="w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="260" height="100" rx="10" fill="#0f172a" stroke="#1e293b" strokeWidth="1" />
          <rect x="16" y="16" width="96" height="26" rx="7" fill="#0e7490" fillOpacity="0.12" stroke="#22d3ee" strokeWidth="1" strokeOpacity="0.3" />
          <rect x="26" y="25" width="56" height="8" rx="4" fill="#22d3ee" fillOpacity="0.3" />
          <path d="M118 29 L134 29" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M130 25 L136 29 L130 33" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="140" y="16" width="104" height="26" rx="7" fill="#065f46" fillOpacity="0.15" stroke="#22c55e" strokeWidth="1" strokeOpacity="0.3" />
          <rect x="150" y="25" width="64" height="8" rx="4" fill="#22c55e" fillOpacity="0.3" />
          <rect x="16" y="56" width="72" height="28" rx="7" fill="#1e293b" />
          <rect x="24" y="66" width="18" height="6" rx="3" fill="#22d3ee" fillOpacity="0.35" />
          <text x="52" y="74" fill="#22c55e" fontSize="12" fontWeight="700" fontFamily="system-ui">+18%</text>
          <rect x="94" y="56" width="72" height="28" rx="7" fill="#1e293b" />
          <rect x="102" y="66" width="14" height="6" rx="3" fill="#a78bfa" fillOpacity="0.35" />
          <text x="126" y="74" fill="#f59e0b" fontSize="12" fontWeight="700" fontFamily="system-ui">+8%</text>
          <rect x="172" y="56" width="72" height="28" rx="7" fill="#1e293b" />
          <rect x="180" y="66" width="22" height="6" rx="3" fill="#94a3b8" fillOpacity="0.2" />
          <text x="212" y="74" fill="#64748b" fontSize="12" fontWeight="700" fontFamily="system-ui">+1%</text>
        </svg>
      </div>
    );
  };

  const continueWithProfile = (profile: UserProfile) => {
    onSetUserProfile(profile);
    const action = pendingAction;
    setPendingAction(null);
    if (action === "demo") {
      onLoadDemo(profile);
      return;
    }
    onUploadClick();
  };

  const profilePickerModal =
    pendingAction && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4">
            <div className="w-full max-w-3xl rounded-2xl border border-cyan-500/40 bg-slate-900/95 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-lg font-semibold text-cyan-100">{tr("Wat beschrijft je het beste?", "What best describes you?")}</p>
                <button
                  type="button"
                  onClick={() => setPendingAction(null)}
                  className="rounded-md border border-slate-600 px-2.5 py-1.5 text-xs text-slate-300 hover:border-slate-500"
                >
                  {tr("Sluiten", "Close")}
                </button>
              </div>
              <p className="mt-1 text-sm text-slate-300">
                {tr(
                  "Kies wat nu het beste past. Geen zorgen, je kunt dit later altijd aanpassen in Instellingen.",
                  "Pick what fits best for now. Don't worry, you can always change this later in settings."
                )}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {USER_PROFILES.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => continueWithProfile(profile.id)}
                    className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-left transition hover:border-cyan-400/60 hover:bg-cyan-500/10"
                  >
                    <p className="text-sm font-semibold text-slate-100">{language === "nl" ? profile.labelNl : profile.labelEn}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      {language === "nl" ? profile.descriptionNl : profile.descriptionEn}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="welcome-hero relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900/60 p-5 sm:p-8"
    >
      <div className="welcome-hero-halo" aria-hidden />
      <div className="relative z-[1] grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,500px)]">
        <div>
          <div className="max-w-2xl">
            <h3 className="text-xl font-semibold text-slate-100 sm:text-2xl">
              {tr("Begrijp wat je bloedwaarden je vertellen", "Understand what your blood work is telling you")}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300 sm:text-base">
              {tr("Jouw data blijft op jouw apparaat. AI alleen als jij dat wil.", "Your data stays on your device. AI only if you want it.")}
            </p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setPendingAction("demo")}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/55 bg-cyan-500/15 px-5 py-2.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/80 hover:bg-cyan-500/22 active:scale-[0.98]"
              >
                <Play className="h-4 w-4" />
                {tr("Bekijk live demo", "See a live demo")}
              </button>
              <p className="text-xs text-slate-400">
                {tr(
                  "Geen account nodig. Start daarna eenvoudig opnieuw met je eigen data.",
                  "No account needed. Start fresh with your own data afterwards."
                )}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setPendingAction("upload")}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/55 bg-cyan-500/15 px-5 py-2.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/80 hover:bg-cyan-500/22 active:scale-[0.98]"
              >
                <Upload className="h-4 w-4" />
                {tr("Upload je eigen PDF", "Upload your own PDF")}
              </button>
              <p className="text-xs text-slate-400">
                {tr("Direct beginnen met je eigen data", "Jump straight in with your own data")}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {trust.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="welcome-hero-feature rounded-xl border border-slate-700/70 bg-slate-900/55 p-3.5">
                  <div className="mb-2 inline-flex items-center justify-center rounded-lg border border-cyan-500/25 bg-cyan-500/10 p-1.5 text-cyan-200">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-semibold text-slate-100">{item.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-300">{item.description}</p>
                </div>
              );
            })}
          </div>

          {cloudConfigured ? (
            <div className="mt-5 rounded-2xl border border-slate-700/70 bg-[linear-gradient(135deg,rgba(8,145,178,0.12),rgba(2,6,23,0.78))] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="max-w-xl">
                  <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/35 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200">
                    <Cloud className="h-3.5 w-3.5" />
                    {tr("Optionele cloud sync", "Optional cloud sync")}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-100">
                    {cloudReady
                      ? tr("Cloud sync staat klaar. Je eerste upload wordt automatisch meegenomen.", "Cloud sync is ready. Your first upload will be synced automatically.")
                      : tr("Wil je sync tussen apparaten? Maak een account of log meteen in.", "Want sync across devices? Create an account or sign in.")}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-300">
                    {cloudReady
                      ? tr("Je kunt gewoon lokaal blijven werken. Back-up en sync lopen nu stil op de achtergrond.", "You can keep working normally. Backup and sync now run quietly in the background.")
                      : tr("Niet verplicht. Handig als je back-up wilt of op meerdere apparaten verder wilt gaan.", "Completely optional. Useful if you want backup or want to continue on multiple devices.")}
                  </p>
                </div>

                {!cloudReady ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenCloudAuth("signup")}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/55 bg-cyan-500/15 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/80 hover:bg-cyan-500/22"
                    >
                      {tr("Account maken", "Create account")}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenCloudAuth("signin")}
                      className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm text-slate-200 transition hover:border-slate-500 hover:text-slate-50"
                    >
                      {tr("Inloggen", "Sign in")}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <div>
          <div className="relative rounded-xl border border-slate-700/80 bg-slate-950/60 p-2 shadow-[0_18px_40px_-30px_rgba(8,145,178,0.75)]">
            <img
              src={dashboardFirstVisitPreview}
              alt={tr("Dashboardvoorbeeld van LabTracker", "LabTracker dashboard preview")}
              className="h-auto w-full rounded-lg border border-slate-700/75 object-cover"
              loading="lazy"
            />
            <p className="mt-2 px-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
              {tr("Live dashboard preview", "Live dashboard preview")}
            </p>
            <div className="pointer-events-none absolute inset-x-4 top-2 h-16 rounded-full bg-cyan-400/10 blur-2xl" />
          </div>
        </div>
      </div>

      <div className="relative z-[1] mt-7 border-t border-slate-800" />

      <div className="relative z-[1] mt-6">
        <p className="mb-4 text-xs font-medium uppercase tracking-widest text-slate-500">
          {tr("Hoe het werkt", "How it works")}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: 0.1 + index * 0.07 }}
                className="welcome-hero-step rounded-xl border border-slate-700/65 bg-slate-900/50 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-xs font-bold text-cyan-300">
                    {index + 1}
                  </div>
                  <div className="inline-flex items-center justify-center rounded-lg border border-slate-700/70 bg-slate-800/65 p-1.5 text-slate-300">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-100">{step.title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-300">{step.description}</p>
                <div className="mt-3">
                  {renderStepPreview(step.preview)}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.section>
    {profilePickerModal}
    </>
  );
};

export default WelcomeHero;
