import { useMemo, useState } from "react";
import { AlertTriangle, BadgeInfo, Loader2, Sparkles } from "lucide-react";
import { DosePrediction, projectDosePredictionAt } from "../analytics";
import { formatAxisTick } from "../chartHelpers";
import DoseMarkerCard from "../components/DoseMarkerCard";
import useDoseResponsePremium from "../hooks/useDoseResponsePremium";
import { trLocale } from "../i18n";
import { AppLanguage, AppSettings, LabReport } from "../types";

interface DoseResponseViewProps {
  dosePredictions: DosePrediction[];
  customDoseValue: number | null;
  hasCustomDose: boolean;
  doseResponseInput: string;
  visibleReports: LabReport[];
  settings: AppSettings;
  language: AppLanguage;
  onDoseResponseInputChange: (value: string) => void;
}

const median = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
};

const DoseResponseView = ({
  dosePredictions,
  customDoseValue,
  hasCustomDose,
  doseResponseInput,
  visibleReports,
  settings,
  language,
  onDoseResponseInputChange
}: DoseResponseViewProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const [markerScope, setMarkerScope] = useState<"top" | "all">("top");
  const {
    predictions: premiumPredictions,
    loading,
    offlinePriorFallback,
    limitReason,
    remainingAssisted,
    assistedLimits,
    apiAssistedCount
  } = useDoseResponsePremium({
    basePredictions: dosePredictions,
    unitSystem: settings.unitSystem
  });

  const currentDoseValues = useMemo(
    () => premiumPredictions.map((prediction) => prediction.currentDose).filter((value) => Number.isFinite(value) && value > 0),
    [premiumPredictions]
  );

  const baselineDose = useMemo(() => {
    if (currentDoseValues.length === 0) {
      return 120;
    }
    return Number(median(currentDoseValues).toFixed(1));
  }, [currentDoseValues]);

  const scenarioDose = hasCustomDose && customDoseValue !== null ? customDoseValue : baselineDose;
  const minObservedDose = currentDoseValues.length === 0 ? 80 : Math.min(...currentDoseValues);
  const maxObservedDose = currentDoseValues.length === 0 ? 180 : Math.max(...currentDoseValues);
  const sliderMin = Math.max(20, Math.floor((minObservedDose * 0.8) / 5) * 5);
  const sliderMax = Math.max(sliderMin + 10, Math.ceil((maxObservedDose * 1.2) / 5) * 5);
  const sliderValue = Math.min(Math.max(scenarioDose, sliderMin), sliderMax);
  const topPredictions = premiumPredictions.slice(0, 8);
  const visiblePredictions = markerScope === "top" ? topPredictions : premiumPredictions;

  const quickScenarios = [
    { key: "minus20", delta: -0.2 },
    { key: "minus10", delta: -0.1 },
    { key: "current", delta: 0 },
    { key: "plus10", delta: 0.1 },
    { key: "plus20", delta: 0.2 }
  ].map((entry) => ({
    ...entry,
    value: Number(Math.max(0, baselineDose * (1 + entry.delta)).toFixed(1))
  }));

  const scenarioLabel = (delta: number): string => {
    if (delta === 0) {
      return tr("Huidig", "Current");
    }
    return `${delta > 0 ? "+" : ""}${Math.round(delta * 100)}%`;
  };

  return (
    <section className="space-y-3 fade-in">
      <div className="dose-premium-shell rounded-2xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-100">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              {tr("Premium Dose Simulator", "Premium Dose Simulator")}
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              {tr(
                "Zie per relevante marker wat er waarschijnlijk verandert als je je testosterondosis aanpast.",
                "See what is likely to change per relevant marker when your testosterone dose changes."
              )}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {tr(
                "Educatief hulpmiddel voor bespreking met je arts, niet als medisch voorschrift.",
                "Educational aid for doctor discussion, not a medical prescription."
              )}
            </p>
          </div>
          <div className="rounded-xl border border-cyan-500/35 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
            {tr("Relevante markers in focus", "Relevant markers in focus")}: {Math.min(8, premiumPredictions.length)}
            {" · "}
            {tr("Totaal", "Total")}: {premiumPredictions.length}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-medium uppercase tracking-wide text-cyan-200">
              {tr("Dose scenario (mg/week)", "Dose scenario (mg/week)")}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                min="0"
                inputMode="decimal"
                value={doseResponseInput}
                onChange={(event) => onDoseResponseInputChange(event.target.value)}
                placeholder={tr("Bijv. 120", "e.g. 120")}
                className="w-28 rounded-md border border-slate-600 bg-slate-900/80 px-2.5 py-1.5 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => onDoseResponseInputChange("")}
                className="rounded-md border border-slate-600 px-2.5 py-1.5 text-xs text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200"
              >
                {tr("Auto", "Auto")}
              </button>
            </div>
          </div>

          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={0.5}
            value={sliderValue}
            onChange={(event) => onDoseResponseInputChange(event.target.value)}
            className="mt-3 w-full accent-cyan-400"
          />

          <div className="mt-2 flex flex-wrap gap-2">
            {quickScenarios.map((scenario) => {
              const active = Math.abs(scenarioDose - scenario.value) <= 0.2;
              return (
                <button
                  key={scenario.key}
                  type="button"
                  onClick={() => onDoseResponseInputChange(String(scenario.value))}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    active
                      ? "border-cyan-300 bg-cyan-500/20 text-cyan-100"
                      : "border-slate-600 bg-slate-900/55 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200"
                  }`}
                >
                  {scenarioLabel(scenario.delta)} ({formatAxisTick(scenario.value)} mg)
                </button>
              );
            })}
          </div>

          <p className="mt-2 text-xs text-slate-300">
            {tr("Actief scenario", "Active scenario")}: {formatAxisTick(scenarioDose)} mg/week
            {" · "}
            {tr("Baseline", "Baseline")}: {formatAxisTick(baselineDose)} mg/week
          </p>
        </div>

        <div className="mt-3 rounded-lg border border-slate-700/70 bg-slate-900/45 px-3 py-2 text-xs text-slate-300">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              {tr("Assisted study calls over", "Assisted study calls left")}: {remainingAssisted.dailyRemaining}/
              {assistedLimits.maxRunsPerDay} {tr("vandaag", "today")}
            </span>
            <span>
              {remainingAssisted.monthlyRemaining}/{assistedLimits.maxRunsPerMonth} {tr("deze maand", "this month")}
            </span>
            {loading ? (
              <span className="inline-flex items-center gap-1 text-cyan-200">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {tr("Assisted model wordt ververst...", "Refreshing assisted model...")}
              </span>
            ) : apiAssistedCount > 0 ? (
              <span className="text-emerald-200">
                {tr("API-assisted markers", "API-assisted markers")}: {apiAssistedCount}
              </span>
            ) : null}
          </div>
          {limitReason ? (
            <p className="mt-1 inline-flex items-center gap-1 text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5" />
              {tr(
                "Assisted quota bereikt; er wordt lokaal fallback model gebruikt.",
                "Assisted quota reached; using local fallback model."
              )}
            </p>
          ) : null}
          {offlinePriorFallback && !limitReason ? (
            <p className="mt-1 inline-flex items-center gap-1 text-amber-200">
              <BadgeInfo className="h-3.5 w-3.5" />
              {tr(
                "Offline prior fallback actief door API-onbereikbaarheid.",
                "Offline prior fallback active because API was unreachable."
              )}
            </p>
          ) : null}
        </div>
      </div>

      {premiumPredictions.length === 0 ? (
        <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 text-sm text-slate-300">
          {tr(
            "Voeg meer blood reports met bekende weekdosis toe om dose-response simulaties te kunnen tonen.",
            "Add more blood reports with known weekly dose to unlock dose-response simulations."
          )}
        </div>
      ) : (
        <>
          {premiumPredictions.length > 8 ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMarkerScope("top")}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  markerScope === "top"
                    ? "border-cyan-300 bg-cyan-500/20 text-cyan-100"
                    : "border-slate-600 bg-slate-900/55 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200"
                }`}
              >
                {tr("Top 8 relevant", "Top 8 relevant")}
              </button>
              <button
                type="button"
                onClick={() => setMarkerScope("all")}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  markerScope === "all"
                    ? "border-cyan-300 bg-cyan-500/20 text-cyan-100"
                    : "border-slate-600 bg-slate-900/55 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200"
                }`}
              >
                {tr("Alle markers", "All markers")}
              </button>
            </div>
          ) : null}

          <div className="grid gap-3">
            {visiblePredictions.map((prediction) => {
              const projected = projectDosePredictionAt(prediction, scenarioDose);
              return (
                <DoseMarkerCard
                  key={`${prediction.marker}|${prediction.unit}`}
                  prediction={prediction}
                  targetDose={scenarioDose}
                  targetEstimate={projected.estimate}
                  targetLow={projected.low}
                  targetHigh={projected.high}
                  reports={visibleReports}
                  settings={settings}
                  language={language}
                />
              );
            })}
          </div>
        </>
      )}
    </section>
  );
};

export default DoseResponseView;
