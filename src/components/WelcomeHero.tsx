import { motion } from "framer-motion";
import { ArrowRight, BarChart3, FileText, Lock, Play, Sparkles, Upload } from "lucide-react";
import { trLocale } from "../i18n";
import { AppLanguage } from "../types";

export interface WelcomeHeroProps {
  language: AppLanguage;
  onLoadDemo: () => void;
  onUploadClick: () => void;
}

const WelcomeHero = ({ language, onLoadDemo, onUploadClick }: WelcomeHeroProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  const steps = [
    {
      icon: Upload,
      title: tr("Upload je lab-PDF", "Upload your lab PDF"),
      description: tr(
        "Sleep je PDF in de app. Markers worden automatisch uitgelezen.",
        "Drop your PDF into the app. Markers are extracted automatically."
      )
    },
    {
      icon: BarChart3,
      title: tr("Bekijk je trends", "See your trends"),
      description: tr(
        "Grafieken, referentiebereiken en veranderingen over tijd — direct zichtbaar.",
        "Charts, reference ranges, and changes over time — visible immediately."
      )
    },
    {
      icon: Sparkles,
      title: tr("Optimaliseer je protocol", "Optimize your protocol"),
      description: tr(
        "Koppel protocollen aan je labs en laat AI patronen analyseren.",
        "Connect protocols to your labs and let AI surface patterns."
      )
    }
  ];

  const trust = [
    {
      icon: Lock,
      label: tr("Alles lokaal opgeslagen", "All data stays local")
    },
    {
      icon: FileText,
      label: tr("Werkt met elk lab-formaat", "Works with any lab format")
    }
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="welcome-hero rounded-2xl border border-slate-700/70 bg-slate-900/60 p-5 sm:p-8"
    >
      {/* Headline */}
      <div className="max-w-2xl">
        <h3 className="text-xl font-semibold text-slate-100 sm:text-2xl">
          {tr("Begrijp wat je bloedwaarden je vertellen", "Understand what your blood work is telling you")}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-400 sm:text-base">
          {tr(
            "Volg je bloedwerk. Upload PDF's, spot trends en optimaliseer je protocol — alle data blijft in je browser.",
            "Track your bloodwork. Upload PDFs, spot trends, optimize your protocol — all data stays in your browser."
          )}
        </p>
      </div>

      {/* Primary CTA — demo first */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* Demo button — primary */}
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={onLoadDemo}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-cyan-400 active:scale-[0.98]"
          >
            <Play className="h-4 w-4" />
            {tr("Bekijk live demo", "See a live demo")}
          </button>
          <p className="text-xs text-slate-500">
            {tr(
              "Geen account nodig · je kunt daarna eenvoudig opnieuw beginnen",
              "No account needed · you can easily start fresh afterwards"
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 sm:mt-2.5">
          <span className="text-xs text-slate-600">{tr("of", "or")}</span>
        </div>

        {/* Upload button — secondary */}
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={onUploadClick}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-600 px-5 py-2.5 text-sm text-slate-200 transition hover:border-cyan-500/50 hover:text-cyan-200 active:scale-[0.98]"
          >
            <Upload className="h-4 w-4" />
            {tr("Upload je eigen PDF", "Upload your own PDF")}
          </button>
          <p className="text-xs text-slate-500">
            {tr("Direct beginnen met je eigen data", "Jump straight in with your own data")}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="mt-7 border-t border-slate-800" />

      {/* Steps */}
      <div className="mt-6">
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
                className="relative flex gap-3 rounded-xl border border-slate-700/60 bg-slate-900/50 p-4"
              >
                {/* Step number + connector line */}
                <div className="flex flex-col items-center">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-xs font-bold text-cyan-300">
                    {index + 1}
                  </div>
                  {index < steps.length - 1 ? (
                    <div className="mt-1 hidden h-full w-px bg-slate-700/50 sm:block" />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="mb-1.5 inline-flex items-center justify-center rounded-lg border border-slate-700/60 bg-slate-800/60 p-1.5 text-slate-400">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <p className="text-sm font-semibold text-slate-100">{step.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-400">{step.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Trust signals */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.35 }}
        className="mt-5 flex flex-wrap items-center gap-4"
      >
        {trust.map((item) => {
          const Icon = item.icon;
          return (
            <span key={item.label} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <Icon className="h-3.5 w-3.5 text-slate-600" />
              {item.label}
            </span>
          );
        })}
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); onLoadDemo(); }}
          className="ml-auto inline-flex items-center gap-1 text-xs text-cyan-500/70 transition hover:text-cyan-400"
        >
          {tr("Of bekijk eerst de demo", "Or explore the demo first")}
          <ArrowRight className="h-3 w-3" />
        </a>
      </motion.div>
    </motion.section>
  );
};

export default WelcomeHero;
