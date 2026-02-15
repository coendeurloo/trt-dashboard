import { DosePrediction, MarkerSeriesPoint, calculatePercentChange } from "../analytics";
import DoseProjectionChart from "../components/DoseProjectionChart";
import { formatAxisTick } from "../chartHelpers";
import { getMarkerDisplayName } from "../i18n";
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
  const isNl = language === "nl";

  const confidenceLabel = (value: string): string => {
    if (!isNl) {
      return value;
    }
    if (value === "High") {
      return "Hoog";
    }
    if (value === "Medium") {
      return "Middel";
    }
    if (value === "Low") {
      return "Laag";
    }
    return value;
  };

  return (
    <section className="space-y-3 fade-in">
      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
        <h3 className="text-base font-semibold text-slate-100">{isNl ? "Dosis-respons schattingen" : "Dose-response Estimates"}</h3>
        <p className="mt-1 text-sm text-slate-400">
          {isNl
            ? "In gewone taal: dit model schat, op basis van je eigen historie, wat er waarschijnlijk met een marker gebeurt als je dosis verandert."
            : "In plain language: this model estimates, from your own history, what will likely happen to a marker if your dose changes."}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {isNl
            ? "Alleen zichtbaar bij voldoende meetpunten; bedoeld als gesprekshulp met je arts."
            : "Only shown with enough data points; intended as a discussion aid with your doctor."}
        </p>

        <div className="mt-3 rounded-lg border border-cyan-500/25 bg-cyan-500/5 p-3">
          <label className="text-xs font-medium uppercase tracking-wide text-cyan-200">
            {isNl ? "Simuleer testosterondosis (mg/week)" : "Simulate testosterone dose (mg/week)"}
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="number"
              step="0.1"
              min="0"
              inputMode="decimal"
              value={doseResponseInput}
              onChange={(event) => onDoseResponseInputChange(event.target.value)}
              placeholder={isNl ? "Bijv. 100" : "e.g. 100"}
              className="w-40 rounded-md border border-slate-600 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => onDoseResponseInputChange("")}
              className="rounded-md border border-slate-600 px-2.5 py-1.5 text-xs text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200"
            >
              {isNl ? "Auto-scenario" : "Auto scenario"}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {hasCustomDose && customDoseValue !== null
              ? isNl
                ? `Actief scenario: ${formatAxisTick(customDoseValue)} mg/week voor alle voorspellingen.`
                : `Active scenario: ${formatAxisTick(customDoseValue)} mg/week for all estimates.`
              : isNl
                ? "Geen handmatige dosis ingevuld; per marker wordt het standaard scenario gebruikt."
                : "No manual dose entered; each marker currently uses its default scenario."}
          </p>
        </div>

        {dosePredictions.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            {isNl ? "Nog te weinig dose-gekoppelde meetpunten voor schattingen." : "Not enough dose-linked data points yet for estimates."}
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {dosePredictions.map((prediction) => {
              const markerLabel = getMarkerDisplayName(prediction.marker, settings.language);
              const targetDose = hasCustomDose && customDoseValue !== null ? customDoseValue : prediction.suggestedDose;
              const canPredict = prediction.status === "clear";
              const targetEstimate = canPredict ? Math.max(0, prediction.intercept + prediction.slopePerMg * targetDose) : null;
              const targetPercentChange =
                canPredict && targetEstimate !== null ? calculatePercentChange(targetEstimate, prediction.currentEstimate) : null;
              const currentEstimate = `${formatAxisTick(prediction.currentEstimate)} ${prediction.unit}`;
              const projectedEstimate = targetEstimate === null ? "-" : `${formatAxisTick(targetEstimate)} ${prediction.unit}`;
              const pctText =
                targetPercentChange === null
                  ? isNl
                    ? "onbekend"
                    : "unknown"
                  : `${targetPercentChange > 0 ? "+" : ""}${targetPercentChange}%`;
              const directionText =
                targetPercentChange === null
                  ? isNl
                    ? "verandering"
                    : "change"
                  : targetPercentChange >= 0
                    ? isNl
                      ? "stijging"
                      : "increase"
                    : isNl
                      ? "daling"
                      : "decrease";
              const correlationText =
                prediction.correlationR === null
                  ? isNl
                    ? "n.v.t."
                    : "n/a"
                  : `${prediction.correlationR > 0 ? "+" : ""}${formatAxisTick(prediction.correlationR)}`;
              const usedDatesText = prediction.usedReportDates.length === 0 ? "-" : prediction.usedReportDates.join(", ");
              const excludedSummary =
                prediction.excludedPoints.length === 0
                  ? null
                  : prediction.excludedPoints
                      .slice(0, 3)
                      .map((item) => `${item.date}: ${item.reason}`)
                      .join(" | ");
              return (
                <li key={prediction.marker} className="rounded-lg bg-slate-800/70 px-3 py-2 text-slate-200">
                  <p className="font-medium">{markerLabel}</p>
                  {canPredict ? (
                    <p className="mt-1 text-xs leading-relaxed text-slate-200">
                      {isNl
                        ? `Als je dosis rond ${formatAxisTick(targetDose)} mg/week ligt, verwacht dit model dat ${markerLabel} ongeveer ${projectedEstimate} wordt. Ter vergelijking: bij ongeveer ${formatAxisTick(prediction.currentDose)} mg/week is de modelwaarde nu ${currentEstimate}. Dat is waarschijnlijk een ${directionText} van ${pctText}.`
                        : `If your dose is around ${formatAxisTick(targetDose)} mg/week, this model expects ${markerLabel} to be about ${projectedEstimate}. For reference, at around ${formatAxisTick(prediction.currentDose)} mg/week the current model value is ${currentEstimate}. That is likely a ${directionText} of ${pctText}.`}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs leading-relaxed text-amber-200">
                      {isNl
                        ? `Nog geen betrouwbare dosis-schatting voor ${markerLabel}. ${prediction.statusReason}`
                        : `No reliable dose estimate yet for ${markerLabel}. ${prediction.statusReason}`}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-slate-400">
                    {isNl ? "Betrouwbaarheid van deze inschatting" : "Confidence of this estimate"}: {confidenceLabel(prediction.confidence)}{" "}
                    (n={prediction.sampleCount}, r={correlationText}, R²={formatAxisTick(prediction.rSquared)}, {prediction.modelType})
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {isNl ? "Debug (gebruikte data)" : "Debug (used data)"}: {isNl ? "helling" : "slope"}=
                    {formatAxisTick(prediction.slopePerMg)}, {isNl ? "intercept" : "intercept"}={formatAxisTick(prediction.intercept)},{" "}
                    {isNl ? "data-datums" : "dates"}={usedDatesText}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {isNl ? "Samplingbasis" : "Sampling basis"}:{" "}
                    {prediction.samplingMode === "trough"
                      ? isNl
                        ? "Trough-only"
                        : "Trough-only"
                      : isNl
                        ? "Alle timings"
                        : "All timings"}
                    {prediction.samplingWarning ? ` • ${prediction.samplingWarning}` : ""}
                  </p>
                  {excludedSummary ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {isNl ? "Uitgesloten punten" : "Excluded points"}: {excludedSummary}
                      {prediction.excludedPoints.length > 3 ? ` +${prediction.excludedPoints.length - 3}` : ""}
                    </p>
                  ) : null}
                  {canPredict && targetEstimate !== null ? (
                    <div className="mt-2">
                      <DoseProjectionChart
                        prediction={prediction}
                        reports={visibleReports}
                        settings={settings}
                        language={language}
                        targetDose={targetDose}
                        targetEstimate={targetEstimate}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};

export default DoseResponseView;
