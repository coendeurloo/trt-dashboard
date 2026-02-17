import { motion } from "framer-motion";
import { BarChart3, FileText, Lock } from "lucide-react";
import { trLocale } from "../i18n";
import { AppLanguage } from "../types";

export interface WelcomeHeroProps {
  language: AppLanguage;
  onLoadDemo: () => void;
  onUploadClick: () => void;
}

const WelcomeHero = ({ language, onLoadDemo, onUploadClick }: WelcomeHeroProps) => {
  const isNl = language === "nl";
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  const features = [
    {
      icon: FileText,
      title: tr("Slimme PDF-verwerking", "Smart PDF Parsing"),
      description: tr(
        "Upload een lab-PDF en de markers worden automatisch uitgelezen.",
        "Upload any lab PDF and markers are extracted automatically."
      )
    },
    {
      icon: BarChart3,
      title: tr("Trendvisualisatie", "Trend Visualization"),
      description: tr(
        "Bekijk hoe je waarden veranderen met interactieve grafieken.",
        "See how your markers change over time with interactive charts."
      )
    },
    {
      icon: Lock,
      title: tr("Privacy eerst", "Privacy First"),
      description: tr(
        "Alle data wordt lokaal opgeslagen in je browser. Niets wordt naar een server gestuurd.",
        "All data is stored locally in your browser. Nothing is sent to any server."
      )
    }
  ];

  const steps = [
    tr("Upload een lab-PDF", "Upload a lab PDF"),
    tr("Controleer de uitgelezen waarden", "Review extracted markers"),
    tr("Volg trends over tijd", "Track trends over time")
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="welcome-hero rounded-2xl border border-slate-700/70 bg-slate-900/60 p-5 sm:p-6"
    >
      <div className="max-w-3xl">
        <h3 className="text-xl font-semibold text-slate-100 sm:text-2xl">{tr("Volg je bloedwaarden", "Track Your Blood Work")}</h3>
        <p className="mt-2 text-sm text-slate-300 sm:text-base">
          {tr(
            "Upload lab-PDF's, ontdek trends en optimaliseer je protocol — alle data blijft in je browser.",
            "Upload lab PDFs, spot trends, and optimize your protocol — all data stays in your browser."
          )}
        </p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <motion.article
              key={feature.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: index * 0.06 }}
              className="welcome-hero-feature rounded-xl border border-slate-700/70 bg-slate-900/60 p-4"
            >
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-500/35 bg-cyan-500/15 text-cyan-200">
                <Icon className="h-4 w-4" />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-100">{feature.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-300">{feature.description}</p>
            </motion.article>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onUploadClick}
          className="inline-flex items-center justify-center rounded-md bg-cyan-500 px-3.5 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-400"
        >
          {tr("Upload je eerste PDF", "Upload your first PDF")}
        </button>
        <button
          type="button"
          onClick={onLoadDemo}
          className="inline-flex items-center justify-center rounded-md border border-slate-600 px-3.5 py-2 text-sm text-slate-200 hover:border-cyan-500/50 hover:text-cyan-200"
        >
          {tr("Probeer met demodata", "Try with demo data")}
        </button>
      </div>

      <div className="mt-5 rounded-xl border border-slate-700/70 bg-slate-900/50 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">{tr("Hoe het werkt", "How it works")}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step} className="welcome-hero-step flex items-start gap-2 rounded-lg border border-slate-700/70 bg-slate-900/35 p-3">
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-xs font-semibold text-cyan-200">
                {index + 1}
              </span>
              <span className="text-sm text-slate-200">{step}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
};

export default WelcomeHero;
