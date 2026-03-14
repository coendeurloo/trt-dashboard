import React, { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { trLocale } from "../i18n";
import { WELLBEING_METRICS, WELLBEING_PRESETS } from "../wellbeingMetrics";
import { createId } from "../utils";
import type {
  AppLanguage,
  ThemeMode,
  UserProfile,
  TabKey,
  LabReport,
  Protocol,
  SupplementPeriod,
  SymptomCheckIn,
  WellbeingMetricId,
  InterventionItem,
  PersonalInfo,
  BiologicalSex
} from "../types";

/* ── Types ─────────────────────────────────────────────── */

export interface OnboardingWizardProps {
  language: AppLanguage;
  userProfile: UserProfile;
  theme: ThemeMode;
  report: LabReport;
  personalInfo: PersonalInfo;
  onUpdatePersonalInfo: (patch: Partial<PersonalInfo>) => void;
  onAddProtocol: (protocol: Protocol) => void;
  onAddSupplementPeriod: (supplement: SupplementPeriod) => void;
  onAddCheckIn: (checkIn: SymptomCheckIn) => void;
  onComplete: () => void;
  onNavigate: (tab: TabKey) => void;
}

interface ProtocolDraft {
  compound: string;
  dose: string;
  frequency: string;
  route: string;
  startDate: string;
}

interface SupplementDraft {
  name: string;
  dose: string;
}

/* ── Constants ─────────────────────────────────────────── */

const TOTAL_STEPS = 6;

const FREQUENCIES: { value: string; nl: string; en: string }[] = [
  { value: "daily", nl: "Dagelijks", en: "Daily" },
  { value: "every other day", nl: "Om de dag", en: "Every other day" },
  { value: "2x/week", nl: "2x per week", en: "Twice a week" },
  { value: "3x/week", nl: "3x per week", en: "3x per week" },
  { value: "weekly", nl: "Wekelijks", en: "Weekly" },
  { value: "biweekly", nl: "Om de 2 weken", en: "Every 2 weeks" },
  { value: "monthly", nl: "Maandelijks", en: "Monthly" }
];

const ROUTES: { value: string; nl: string; en: string }[] = [
  { value: "injection", nl: "Injectie", en: "Injection" },
  { value: "gel", nl: "Gel", en: "Gel" },
  { value: "cream", nl: "Crème", en: "Cream" },
  { value: "oral", nl: "Oraal", en: "Oral" },
  { value: "sublingual", nl: "Sublinguaal", en: "Sublingual" },
  { value: "patch", nl: "Pleister", en: "Patch" },
  { value: "other", nl: "Anders", en: "Other" }
];

/* ── Profile-aware copy ────────────────────────────────── */

function protocolTitle(profile: UserProfile, lang: AppLanguage): string {
  const map: Record<UserProfile, [string, string]> = {
    trt: ["Wat is je huidige protocol?", "What's your current protocol?"],
    enhanced: ["Wat gebruik je momenteel?", "What are you currently running?"],
    health: ["Gebruik je medicijnen of therapieën?", "Are you on any medications?"],
    biohacker: ["Wat is je huidige stack?", "What's your current stack?"]
  };
  return trLocale(lang, ...map[profile]);
}

function protocolWhy(profile: UserProfile, lang: AppLanguage): string {
  const map: Record<UserProfile, [string, string]> = {
    trt: [
      "Zo kunnen we bloedwaarden koppelen aan je protocol en veranderingen over tijd zichtbaar maken.",
      "This lets us link your blood values to your protocol and show changes over time."
    ],
    enhanced: [
      "Zo zien we welke middelen welke markers beïnvloeden en houden we alles overzichtelijk.",
      "This helps us see which compounds affect which markers and keeps everything organized."
    ],
    health: [
      "Zo kunnen we veranderingen in je bloedwaarden koppelen aan je behandeling.",
      "This lets us connect changes in your blood work to your treatment."
    ],
    biohacker: [
      "Zo correleren we bloedwaarden met je interventies en meten we wat echt werkt.",
      "This lets us correlate blood values with your interventions and measure what actually works."
    ]
  };
  return trLocale(lang, ...map[profile]);
}

function compoundLabel(profile: UserProfile, lang: AppLanguage): string {
  const map: Record<UserProfile, [string, string]> = {
    trt: ["Middel", "Compound"],
    enhanced: ["Middel", "Compound"],
    health: ["Medicijn / therapie", "Medication / treatment"],
    biohacker: ["Interventie", "Intervention"]
  };
  return trLocale(lang, ...map[profile]);
}

function compoundPlaceholder(profile: UserProfile, lang: AppLanguage): string {
  const map: Record<UserProfile, [string, string]> = {
    trt: ["bijv. Testosterone Cypionate", "e.g. Testosterone Cypionate"],
    enhanced: ["bijv. Testosterone Enanthate", "e.g. Testosterone Enanthate"],
    health: ["bijv. Levothyroxine", "e.g. Levothyroxine"],
    biohacker: ["bijv. Metformin", "e.g. Metformin"]
  };
  return trLocale(lang, ...map[profile]);
}

/* ── Helpers ────────────────────────────────────────────── */

function countFlagged(report: LabReport): { total: number; flagged: number; flaggedNames: string[] } {
  const total = report.markers.length;
  const flaggedNames: string[] = [];
  for (const m of report.markers) {
    if (m.referenceMin === null && m.referenceMax === null) continue;
    if ((m.referenceMin !== null && m.value < m.referenceMin) || (m.referenceMax !== null && m.value > m.referenceMax)) {
      flaggedNames.push(m.marker || m.canonicalMarker);
    }
  }
  return { total, flagged: flaggedNames.length, flaggedNames };
}

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 180 : -180, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -180 : 180, opacity: 0 })
};

/* ── Sub-components ────────────────────────────────────── */

function StepDots({ current, total, isDark }: { current: number; total: number; isDark: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all duration-300 ${
            i === current
              ? "w-6 bg-cyan-500"
              : i < current
                ? `w-2 ${isDark ? "bg-cyan-700" : "bg-cyan-300"}`
                : `w-2 ${isDark ? "bg-slate-700" : "bg-slate-300"}`
          }`}
        />
      ))}
    </div>
  );
}

/* Step 0: Success summary */
function StepSuccess({
  report,
  language,
  isDark
}: {
  report: LabReport;
  language: AppLanguage;
  isDark: boolean;
}) {
  const tr = (nl: string, en: string) => trLocale(language, nl, en);
  const { total, flagged, flaggedNames } = countFlagged(report);
  const inRange = total - flagged;

  return (
    <div className="text-center">
      <div className="text-5xl mb-4">&#x2705;</div>
      <h2 className={`text-xl font-bold mb-2 ${isDark ? "text-white" : "text-slate-900"}`}>
        {tr("Je eerste rapport staat erin!", "Your first report is saved!")}
      </h2>
      <p className={`text-sm mb-6 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
        {tr(
          `We hebben ${total} markers uit je PDF gehaald.`,
          `We extracted ${total} markers from your PDF.`
        )}
      </p>

      <div className="flex justify-center gap-4 mb-6">
        {inRange > 0 && (
          <div className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
            isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"
          }`}>
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            {inRange} {tr("binnen bereik", "in range")}
          </div>
        )}
        {flagged > 0 && (
          <div className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
            isDark ? "bg-rose-500/10 text-rose-400" : "bg-rose-50 text-rose-700"
          }`}>
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            {flagged} {tr("buiten bereik", "out of range")}
          </div>
        )}
      </div>

      {flagged > 0 && flaggedNames.length <= 5 && (
        <p className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>
          {flaggedNames.join(", ")}
        </p>
      )}

      {flagged === 0 && (
        <p className={`text-sm font-medium ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
          {tr("Alles ziet er goed uit!", "Everything looks good!")}
        </p>
      )}

      <p className={`mt-6 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
        {tr(
          "Laten we nog een paar dingen instellen zodat je het meeste uit je data haalt.",
          "Let's set up a few more things so you get the most out of your data."
        )}
      </p>
    </div>
  );
}

/* Step 1: Personal Info */
function StepPersonalInfo({
  language,
  isDark,
  personalInfo,
  onChange
}: {
  language: AppLanguage;
  isDark: boolean;
  personalInfo: PersonalInfo;
  onChange: (patch: Partial<PersonalInfo>) => void;
}) {
  const tr = (nl: string, en: string) => trLocale(language, nl, en);
  const inputCls = `w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2 focus:ring-cyan-500/40 ${
    isDark
      ? "bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500"
      : "bg-slate-50 border-slate-300 text-slate-800 placeholder:text-slate-400"
  }`;
  const labelCls = `block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-500"}`;

  return (
    <div>
      <h2 className={`text-lg font-bold mb-1 ${isDark ? "text-white" : "text-slate-900"}`}>
        {trLocale(language, "Even kennismaken", "Let's get to know you")}
      </h2>
      <p className={`text-sm mb-5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
        {trLocale(language, "Deze gegevens helpen ons om je resultaten beter te interpreteren.", "This info helps us interpret your results more accurately.")}
      </p>

      <div className="space-y-3">
        {/* Name */}
        <div>
          <label className={labelCls}>{tr("Naam", "Name")}</label>
          <input
            type="text"
            className={inputCls}
            placeholder={tr("bijv. Jan de Vries", "e.g. John Smith")}
            value={personalInfo.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>

        {/* Date of Birth */}
        <div>
          <label className={labelCls}>{tr("Geboortedatum", "Date of birth")}</label>
          <input
            type="date"
            className={inputCls}
            value={personalInfo.dateOfBirth}
            onChange={(e) => onChange({ dateOfBirth: e.target.value })}
          />
        </div>

        {/* Biological Sex */}
        <div>
          <label className={labelCls}>{tr("Biologisch geslacht", "Biological sex")}</label>
          <div className="space-y-2">
            {[
              { value: "male" as BiologicalSex, nl: "Man", en: "Male" },
              { value: "female" as BiologicalSex, nl: "Vrouw", en: "Female" },
              { value: "prefer_not_to_say" as BiologicalSex, nl: "Liever niet zeggen", en: "Prefer not to say" }
            ].map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="biologicalSex"
                  value={opt.value}
                  checked={personalInfo.biologicalSex === opt.value}
                  onChange={(e) => onChange({ biologicalSex: e.target.value as BiologicalSex })}
                  className="h-4 w-4 accent-cyan-500"
                />
                <span className={`text-sm ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  {trLocale(language, opt.nl, opt.en)}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Height */}
        <div>
          <label className={labelCls}>{tr("Lengte (cm)", "Height (cm)")}</label>
          <input
            type="number"
            className={inputCls}
            placeholder={tr("bijv. 180", "e.g. 180")}
            value={personalInfo.heightCm ?? ""}
            onChange={(e) => onChange({ heightCm: e.target.value ? Number(e.target.value) : null })}
          />
        </div>

        {/* Weight */}
        <div>
          <label className={labelCls}>{tr("Gewicht (kg)", "Weight (kg)")}</label>
          <input
            type="number"
            className={inputCls}
            placeholder={tr("bijv. 80", "e.g. 80")}
            value={personalInfo.weightKg ?? ""}
            onChange={(e) => onChange({ weightKg: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
      </div>
    </div>
  );
}

/* Step 2: Protocol (simplified) */
function StepProtocol({
  language,
  userProfile,
  isDark,
  draft,
  onChange
}: {
  language: AppLanguage;
  userProfile: UserProfile;
  isDark: boolean;
  draft: ProtocolDraft;
  onChange: (d: ProtocolDraft) => void;
}) {
  const tr = (nl: string, en: string) => trLocale(language, nl, en);
  const inputCls = `w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2 focus:ring-cyan-500/40 ${
    isDark
      ? "bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500"
      : "bg-slate-50 border-slate-300 text-slate-800 placeholder:text-slate-400"
  }`;
  const labelCls = `block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-500"}`;
  const selectCls = `${inputCls} appearance-none cursor-pointer`;

  return (
    <div>
      <h2 className={`text-lg font-bold mb-1 ${isDark ? "text-white" : "text-slate-900"}`}>
        {protocolTitle(userProfile, language)}
      </h2>
      <p className={`text-sm mb-5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
        {protocolWhy(userProfile, language)}
      </p>

      <div className="space-y-3">
        <div>
          <label className={labelCls}>{compoundLabel(userProfile, language)}</label>
          <input
            className={inputCls}
            placeholder={compoundPlaceholder(userProfile, language)}
            value={draft.compound}
            onChange={(e) => onChange({ ...draft, compound: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{tr("Dosering", "Dose")}</label>
            <input
              className={inputCls}
              placeholder={tr("bijv. 150mg", "e.g. 150mg")}
              value={draft.dose}
              onChange={(e) => onChange({ ...draft, dose: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>{tr("Toedieningswijze", "Route")}</label>
            <select
              className={selectCls}
              value={draft.route}
              onChange={(e) => onChange({ ...draft, route: e.target.value })}
            >
              <option value="">{tr("Kies...", "Select...")}</option>
              {ROUTES.map((r) => (
                <option key={r.value} value={r.value}>
                  {trLocale(language, r.nl, r.en)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{tr("Frequentie", "Frequency")}</label>
            <select
              className={selectCls}
              value={draft.frequency}
              onChange={(e) => onChange({ ...draft, frequency: e.target.value })}
            >
              <option value="">{tr("Kies...", "Select...")}</option>
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {trLocale(language, f.nl, f.en)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{tr("Startdatum", "Start date")}</label>
            <input
              type="date"
              className={inputCls}
              value={draft.startDate}
              onChange={(e) => onChange({ ...draft, startDate: e.target.value })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* Step 3: Wellbeing check-in */
function StepCheckin({
  language,
  userProfile,
  isDark,
  values,
  onChange
}: {
  language: AppLanguage;
  userProfile: UserProfile;
  isDark: boolean;
  values: Record<WellbeingMetricId, number>;
  onChange: (values: Record<WellbeingMetricId, number>) => void;
}) {
  const tr = (nl: string, en: string) => trLocale(language, nl, en);
  const metrics = WELLBEING_PRESETS[userProfile];

  return (
    <div>
      <h2 className={`text-lg font-bold mb-1 ${isDark ? "text-white" : "text-slate-900"}`}>
        {tr("Hoe voel je je vandaag?", "How are you feeling today?")}
      </h2>
      <p className={`text-sm mb-5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
        {tr(
          "Dit duurt maar 10 seconden. We volgen dit over tijd naast je bloedwaarden.",
          "This only takes 10 seconds. We'll track this alongside your blood work over time."
        )}
      </p>

      <div className="space-y-4">
        {metrics.map((metricId) => {
          const metric = WELLBEING_METRICS[metricId];
          const label = language === "nl" ? metric.labelNl : metric.labelEn;
          const val = values[metricId] ?? 5;

          return (
            <div key={metricId}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-base">{metric.icon}</span>
                  <span className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                    {label}
                  </span>
                </div>
                <span
                  className="text-sm font-bold tabular-nums"
                  style={{ color: metric.color }}
                >
                  {val}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={val}
                onChange={(e) =>
                  onChange({ ...values, [metricId]: Number(e.target.value) })
                }
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, ${metric.color} 0%, ${metric.color} ${((val - 1) / 9) * 100}%, ${isDark ? "#334155" : "#e2e8f0"} ${((val - 1) / 9) * 100}%, ${isDark ? "#334155" : "#e2e8f0"} 100%)`,
                  accentColor: metric.color
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Step 4: Supplements */
function StepSupplements({
  language,
  isDark,
  supplements,
  onAdd,
  onRemove,
  currentDraft,
  onDraftChange
}: {
  language: AppLanguage;
  isDark: boolean;
  supplements: SupplementDraft[];
  onAdd: () => void;
  onRemove: (idx: number) => void;
  currentDraft: SupplementDraft;
  onDraftChange: (d: SupplementDraft) => void;
}) {
  const tr = (nl: string, en: string) => trLocale(language, nl, en);
  const inputCls = `w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2 focus:ring-cyan-500/40 ${
    isDark
      ? "bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500"
      : "bg-slate-50 border-slate-300 text-slate-800 placeholder:text-slate-400"
  }`;

  const canAdd = currentDraft.name.trim().length > 0;

  return (
    <div>
      <h2 className={`text-lg font-bold mb-1 ${isDark ? "text-white" : "text-slate-900"}`}>
        {tr("Neem je supplementen?", "Taking any supplements?")}
      </h2>
      <p className={`text-sm mb-5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
        {tr(
          "Voeg je supplementen toe zodat de AI-analyse ze kan meewegen bij het beoordelen van je resultaten.",
          "Add your supplements so the AI analysis can factor them in when reviewing your results."
        )}
      </p>

      {/* Added supplements as chips */}
      {supplements.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {supplements.map((s, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
                isDark
                  ? "bg-slate-800/70 border-slate-600/60 text-slate-300"
                  : "bg-slate-100 border-slate-300 text-slate-700"
              }`}
            >
              <span className="font-medium">{s.name}</span>
              {s.dose && <span className={isDark ? "text-slate-500" : "text-slate-400"}>{s.dose}</span>}
              <button
                onClick={() => onRemove(i)}
                className={`ml-1 rounded-full h-4 w-4 flex items-center justify-center text-xs leading-none hover:bg-rose-500/20 hover:text-rose-400 transition-colors ${
                  isDark ? "text-slate-500" : "text-slate-400"
                }`}
                aria-label={tr("Verwijderen", "Remove")}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add form */}
      <div className="flex gap-2">
        <div className="flex-1">
          <input
            className={inputCls}
            placeholder={tr("bijv. Vitamine D", "e.g. Vitamin D")}
            value={currentDraft.name}
            onChange={(e) => onDraftChange({ ...currentDraft, name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canAdd) onAdd();
            }}
          />
        </div>
        <div className="w-28">
          <input
            className={inputCls}
            placeholder={tr("bijv. 3000 IU", "e.g. 3000 IU")}
            value={currentDraft.dose}
            onChange={(e) => onDraftChange({ ...currentDraft, dose: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canAdd) onAdd();
            }}
          />
        </div>
        <button
          onClick={onAdd}
          disabled={!canAdd}
          className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            canAdd
              ? "bg-cyan-600 text-white hover:bg-cyan-500"
              : isDark
                ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          +
        </button>
      </div>

      {supplements.length === 0 && (
        <p className={`mt-4 text-xs text-center ${isDark ? "text-slate-600" : "text-slate-400"}`}>
          {tr(
            "Je kunt dit ook later toevoegen via het Supplementen-tabblad.",
            "You can always add these later from the Supplements tab."
          )}
        </p>
      )}
    </div>
  );
}

/* Step 5: Summary / what's next */
function StepSummary({
  language,
  isDark,
  savedProtocol,
  savedSupplementCount,
  savedCheckin,
  savedPersonalInfo
}: {
  language: AppLanguage;
  isDark: boolean;
  savedProtocol: boolean;
  savedSupplementCount: number;
  savedCheckin: boolean;
  savedPersonalInfo: boolean;
}) {
  const tr = (nl: string, en: string) => trLocale(language, nl, en);

  const setupItems = [
    {
      done: true,
      label: tr("Labrapport geüpload", "Lab report uploaded")
    },
    {
      done: savedPersonalInfo,
      label: tr("Persoonlijke info toegevoegd", "Personal info added")
    },
    {
      done: savedProtocol,
      label: tr("Protocol ingesteld", "Protocol set up")
    },
    {
      done: savedCheckin,
      label: tr("Eerste welzijn check-in", "First wellbeing check-in")
    },
    {
      done: savedSupplementCount > 0,
      label:
        savedSupplementCount > 0
          ? tr(
              `${savedSupplementCount} supplement${savedSupplementCount === 1 ? "" : "en"} toegevoegd`,
              `${savedSupplementCount} supplement${savedSupplementCount === 1 ? "" : "s"} added`
            )
          : tr("Supplementen toegevoegd", "Supplements added")
    }
  ];

  const sections: { icon: string; title: string; desc: string }[] = [
    {
      icon: "📊",
      title: tr("Dashboard", "Dashboard"),
      desc: tr(
        "Je markers en trends in één oogopslag. Hier zie je hoe je waarden zich ontwikkelen.",
        "Your markers and trends at a glance. See how your values develop over time."
      )
    },
    {
      icon: "🔔",
      title: tr("Alerts", "Alerts"),
      desc: tr(
        "We waarschuwen je als een marker buiten bereik valt of een trend zorgelijk is.",
        "We'll alert you when a marker goes out of range or shows a concerning trend."
      )
    },
    {
      icon: "🧠",
      title: tr("AI Analyse", "AI Analysis"),
      desc: tr(
        "Laat een AI je volledige resultaten beoordelen, inclusief protocol en supplementen.",
        "Let AI review your full results, including protocol and supplements."
      )
    },
    {
      icon: "😊",
      title: tr("Welzijn check-ins", "Wellbeing check-ins"),
      desc: tr(
        "Houd dagelijks bij hoe je je voelt. Zo koppelen we subjectief welzijn aan je bloedwaarden.",
        "Track how you feel daily. This links your subjective wellbeing to your blood work."
      )
    }
  ];

  return (
    <div>
      <h2 className={`text-lg font-bold mb-1 ${isDark ? "text-white" : "text-slate-900"}`}>
        {tr("Je bent helemaal klaar!", "You're all set!")}
      </h2>
      <p className={`text-sm mb-5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
        {tr("Hier is wat je hebt ingesteld.", "Here's what you've set up.")}
      </p>

      {/* Setup checklist */}
      <div className={`rounded-xl border p-3 mb-5 ${
        isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200"
      }`}>
        <div className="space-y-2">
          {setupItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className={`flex-shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-xs ${
                item.done
                  ? "bg-cyan-500/20 text-cyan-400"
                  : isDark
                    ? "bg-slate-700 text-slate-500"
                    : "bg-slate-200 text-slate-400"
              }`}>
                {item.done ? "✓" : "–"}
              </span>
              <span className={`text-sm ${
                item.done
                  ? isDark ? "text-slate-200" : "text-slate-700"
                  : isDark ? "text-slate-500" : "text-slate-400"
              }`}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* App sections guide */}
      <p className={`text-xs font-medium uppercase tracking-wider mb-3 ${
        isDark ? "text-slate-500" : "text-slate-400"
      }`}>
        {tr("Wat je nu kunt doen", "What you can do now")}
      </p>
      <div className="space-y-3">
        {sections.map((s, i) => (
          <div key={i} className="flex gap-3">
            <span className="text-lg flex-shrink-0 mt-0.5">{s.icon}</span>
            <div>
              <p className={`text-sm font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                {s.title}
              </p>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main component ────────────────────────────────────── */

export default function OnboardingWizard({
  language,
  userProfile,
  theme,
  report,
  personalInfo,
  onUpdatePersonalInfo,
  onAddProtocol,
  onAddSupplementPeriod,
  onAddCheckIn,
  onComplete,
  onNavigate
}: OnboardingWizardProps) {
  const tr = useCallback(
    (nl: string, en: string) => trLocale(language, nl, en),
    [language]
  );

  const isDark = theme === "dark";

  /* Step state */
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  /* Protocol form */
  const [protocolDraft, setProtocolDraft] = useState<ProtocolDraft>({
    compound: "",
    dose: "",
    frequency: "",
    route: "",
    startDate: ""
  });
  const [protocolSaved, setProtocolSaved] = useState(false);

  /* Check-in form */
  const defaultCheckinValues = useMemo(() => {
    const metrics = WELLBEING_PRESETS[userProfile];
    const vals: Record<WellbeingMetricId, number> = {} as any;
    for (const m of metrics) vals[m] = 5;
    return vals;
  }, [userProfile]);
  const [checkinValues, setCheckinValues] = useState<Record<WellbeingMetricId, number>>(defaultCheckinValues);
  const [checkinSaved, setCheckinSaved] = useState(false);

  /* Supplements form */
  const [supplements, setSupplements] = useState<SupplementDraft[]>([]);
  const [supplementDraft, setSupplementDraft] = useState<SupplementDraft>({ name: "", dose: "" });
  const [supplementsSaved, setSupplementsSaved] = useState(false);

  /* ── Actions ── */

  const saveProtocol = useCallback(() => {
    if (!protocolDraft.compound.trim()) return;
    const now = new Date().toISOString();
    const item: InterventionItem = {
      name: protocolDraft.compound.trim(),
      dose: protocolDraft.dose.trim(),
      doseMg: protocolDraft.dose.trim(),
      frequency: protocolDraft.frequency,
      route: protocolDraft.route
    };
    const protocol: Protocol = {
      id: createId(),
      name: protocolDraft.compound.trim(),
      items: [item],
      compounds: [item],
      notes: "",
      createdAt: now,
      updatedAt: now
    };
    onAddProtocol(protocol);
    setProtocolSaved(true);
  }, [protocolDraft, onAddProtocol]);

  const saveCheckin = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    const legacyFields: Record<string, number | null> = {};
    const legacyKeys = ["energy", "mood", "sleep", "libido", "motivation"] as const;
    for (const key of legacyKeys) {
      legacyFields[key] = checkinValues[key] ?? null;
    }
    const checkIn: SymptomCheckIn = {
      id: createId(),
      date: today,
      profileAtEntry: userProfile,
      values: { ...checkinValues },
      ...legacyFields,
      notes: ""
    };
    onAddCheckIn(checkIn);
    setCheckinSaved(true);
  }, [checkinValues, userProfile, onAddCheckIn]);

  const saveSupplements = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    for (const s of supplements) {
      const period: SupplementPeriod = {
        id: createId(),
        name: s.name.trim(),
        dose: s.dose.trim(),
        frequency: "daily",
        startDate: today,
        endDate: null
      };
      onAddSupplementPeriod(period);
    }
    setSupplementsSaved(true);
  }, [supplements, onAddSupplementPeriod]);

  const addSupplementToList = useCallback(() => {
    if (!supplementDraft.name.trim()) return;
    setSupplements((prev) => [...prev, { name: supplementDraft.name.trim(), dose: supplementDraft.dose.trim() }]);
    setSupplementDraft({ name: "", dose: "" });
  }, [supplementDraft]);

  const removeSupplementFromList = useCallback((idx: number) => {
    setSupplements((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  /* ── Navigation ── */

  const goNext = useCallback(() => {
    // Save data on leaving certain steps
    if (step === 1 && personalInfo.name.trim()) {
      onUpdatePersonalInfo(personalInfo);
    }
    if (step === 2 && protocolDraft.compound.trim() && !protocolSaved) {
      saveProtocol();
    }
    if (step === 3 && !checkinSaved) {
      saveCheckin();
    }
    if (step === 4 && supplements.length > 0 && !supplementsSaved) {
      saveSupplements();
    }

    if (step < TOTAL_STEPS - 1) {
      setDirection(1);
      setStep((s) => s + 1);
    } else {
      onComplete();
      onNavigate("dashboard");
    }
  }, [step, personalInfo, protocolDraft, protocolSaved, checkinSaved, supplements, supplementsSaved, onUpdatePersonalInfo, saveProtocol, saveCheckin, saveSupplements, onComplete, onNavigate]);

  const goBack = useCallback(() => {
    if (step > 0) {
      setDirection(-1);
      setStep((s) => s - 1);
    }
  }, [step]);

  const skip = useCallback(() => {
    setDirection(1);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }, []);

  /* ── Button labels ── */

  const nextLabel = (): string => {
    if (step === 0) return tr("Aan de slag", "Let's go");
    if (step === TOTAL_STEPS - 1) return tr("Start verkennen", "Start exploring");
    if (step === 1 && personalInfo.name.trim()) return tr("Opslaan en door", "Save & continue");
    if (step === 2 && protocolDraft.compound.trim()) return tr("Opslaan en door", "Save & continue");
    if (step === 3) return tr("Opslaan en door", "Save & continue");
    if (step === 4 && supplements.length > 0) return tr("Opslaan en door", "Save & continue");
    return tr("Volgende", "Next");
  };

  const showSkip = step === 2 || step === 4;
  const showBack = step > 0 && step < TOTAL_STEPS - 1;

  /* ── Render ── */

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => {
          // Allow closing on backdrop click only on last step
          if (step === TOTAL_STEPS - 1) {
            onComplete();
            onNavigate("dashboard");
          }
        }}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className={`relative z-10 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${
          isDark
            ? "bg-slate-900 border border-slate-700/60"
            : "bg-white border border-slate-200"
        }`}
      >
        {/* Inner content with padding */}
        <div className="px-6 pt-6 pb-4">
          <StepDots current={step} total={TOTAL_STEPS} isDark={isDark} />

          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="min-h-[280px]"
            >
              {step === 0 && (
                <StepSuccess report={report} language={language} isDark={isDark} />
              )}
              {step === 1 && (
                <StepPersonalInfo
                  language={language}
                  isDark={isDark}
                  personalInfo={personalInfo}
                  onChange={onUpdatePersonalInfo}
                />
              )}
              {step === 2 && (
                <StepProtocol
                  language={language}
                  userProfile={userProfile}
                  isDark={isDark}
                  draft={protocolDraft}
                  onChange={setProtocolDraft}
                />
              )}
              {step === 3 && (
                <StepCheckin
                  language={language}
                  userProfile={userProfile}
                  isDark={isDark}
                  values={checkinValues}
                  onChange={setCheckinValues}
                />
              )}
              {step === 4 && (
                <StepSupplements
                  language={language}
                  isDark={isDark}
                  supplements={supplements}
                  onAdd={addSupplementToList}
                  onRemove={removeSupplementFromList}
                  currentDraft={supplementDraft}
                  onDraftChange={setSupplementDraft}
                />
              )}
              {step === 5 && (
                <StepSummary
                  language={language}
                  isDark={isDark}
                  savedProtocol={protocolSaved}
                  savedSupplementCount={supplements.length}
                  savedCheckin={checkinSaved}
                  savedPersonalInfo={personalInfo.name.trim().length > 0}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between px-6 py-4 border-t ${
          isDark ? "border-slate-800 bg-slate-900/50" : "border-slate-100 bg-slate-50/50"
        }`}>
          <div>
            {showBack && (
              <button
                onClick={goBack}
                className={`text-sm px-3 py-2 rounded-lg transition-colors ${
                  isDark
                    ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                }`}
              >
                {tr("Terug", "Back")}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {showSkip && (
              <button
                onClick={skip}
                className={`text-sm transition-colors ${
                  isDark ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {tr("Sla over", "Skip")}
              </button>
            )}
            <button
              onClick={goNext}
              className="rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all hover:bg-cyan-500 hover:shadow-cyan-500/30 active:scale-[0.97]"
            >
              {nextLabel()}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
