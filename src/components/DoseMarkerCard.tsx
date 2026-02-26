import { useMemo } from "react";
import { BarChart3, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { DosePrediction, buildMarkerSeries, calculatePercentChange, getTargetZone } from "../analytics";
import { formatAxisTick } from "../chartHelpers";
import { getMarkerDisplayName, trLocale } from "../i18n";
import { AppLanguage, AppSettings, LabReport } from "../types";
import DoseProjectionChart from "./DoseProjectionChart";

interface DoseMarkerCardProps {
  prediction: DosePrediction;
  targetDose: number;
  targetEstimate: number;
  targetLow: number | null;
  targetHigh: number | null;
  reports: LabReport[];
  settings: AppSettings;
  language: AppLanguage;
  isSameDoseScenario: boolean;
  isLocked?: boolean;
}

const DoseMarkerCard = ({
  prediction,
  targetDose,
  targetEstimate,
  targetLow,
  targetHigh,
  reports,
  settings,
  language,
  isSameDoseScenario,
  isLocked = false
}: DoseMarkerCardProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const markerLabel = getMarkerDisplayName(prediction.marker, language);
  const markerSeries = useMemo(
    () => buildMarkerSeries(reports, prediction.marker, settings.unitSystem),
    [reports, prediction.marker, settings.unitSystem]
  );
  const latestMeasuredValue =
    markerSeries.length > 0 ? markerSeries[markerSeries.length - 1]?.value ?? null : null;
  const currentDisplayEstimate =
    latestMeasuredValue !== null && Number.isFinite(latestMeasuredValue) ? latestMeasuredValue : prediction.currentEstimate;
  const measurementOffset = currentDisplayEstimate - prediction.currentEstimate;
  const scenarioDisplayEstimate = isSameDoseScenario
    ? currentDisplayEstimate
    : Math.max(0, targetEstimate + measurementOffset);
  const scenarioDisplayLow = isSameDoseScenario
    ? currentDisplayEstimate
    : targetLow === null
      ? null
      : Math.max(0, targetLow + measurementOffset);
  const scenarioDisplayHigh = isSameDoseScenario
    ? currentDisplayEstimate
    : targetHigh === null
      ? null
      : Math.max(0, targetHigh + measurementOffset);
  const deltaPct = calculatePercentChange(scenarioDisplayEstimate, currentDisplayEstimate);
  const deltaRounded = deltaPct === null ? null : Math.round(deltaPct);
  const deltaLabel =
    deltaRounded === null ? tr("Onbekend", "Unknown") : `${deltaRounded > 0 ? "+" : ""}${deltaRounded}%`;

  const sourceLabel =
    prediction.source === "personal"
      ? tr("Persoonlijk model", "Personal model")
      : prediction.source === "hybrid"
        ? tr("Hybride model", "Hybrid model")
        : tr("Study prior", "Study prior");

  const confidenceLabel =
    prediction.confidence === "High"
      ? tr("Hoog", "High")
      : prediction.confidence === "Medium"
        ? tr("Middel", "Medium")
        : tr("Laag", "Low");

  const targetRangeLabel =
    scenarioDisplayLow === null || scenarioDisplayHigh === null
      ? tr("Onzekerheidsbereik nog niet beschikbaar", "Uncertainty range not available yet")
      : `${formatAxisTick(scenarioDisplayLow)} - ${formatAxisTick(scenarioDisplayHigh)} ${prediction.unit}`;

  const latestReference = useMemo(() => {
    const latestWithReference = [...markerSeries].reverse().find((point) => point.referenceMin !== null || point.referenceMax !== null);
    return latestWithReference
      ? {
          min: latestWithReference.referenceMin,
          max: latestWithReference.referenceMax
        }
      : null;
  }, [markerSeries]);

  const optimalZone = getTargetZone(prediction.marker, "trt", settings.unitSystem);
  const longevityZone = getTargetZone(prediction.marker, "longevity", settings.unitSystem);
  const inZone = (value: number, zone: { min: number; max: number } | null): boolean =>
    !!zone && value >= zone.min && value <= zone.max;
  const inReferenceRange =
    latestReference !== null &&
    (latestReference.min === null || scenarioDisplayEstimate >= latestReference.min) &&
    (latestReference.max === null || scenarioDisplayEstimate <= latestReference.max);

  const zoneMessage = (() => {
    if (latestReference && inReferenceRange) {
      return tr("Binnen meest recente referentiebereik", "Inside latest reference range");
    }
    if (latestReference && !inReferenceRange) {
      return tr("Buiten meest recente referentiebereik", "Outside latest reference range");
    }
    if (inZone(scenarioDisplayEstimate, optimalZone)) {
      return tr("Valt binnen de optimal zone", "Falls inside the optimal zone");
    }
    if (inZone(scenarioDisplayEstimate, longevityZone)) {
      return tr("Valt binnen de longevity zone", "Falls inside the longevity zone");
    }
    if (optimalZone || longevityZone) {
      return tr("Buiten de bekende doelzones", "Outside known target zones");
    }
    return tr("Nog geen zone-overlay voor deze marker", "No zone overlay available for this marker");
  })();

  const trajectoryText = (() => {
    if (deltaRounded === null) {
      return tr("waarschijnlijk verandert", "likely changes");
    }
    if (deltaRounded === 0) {
      return tr("waarschijnlijk ongeveer gelijk blijft", "likely stays about the same");
    }
    if (deltaRounded > 0) {
      return tr("waarschijnlijk stijgt", "likely rises");
    }
    return tr("waarschijnlijk daalt", "likely falls");
  })();
  const scenarioNarrative = tr(
    "Als je richting {dose} mg/week gaat, verwacht dit model dat {marker} {trajectory} richting {estimate} {unit}.",
    "If you move toward {dose} mg/week, this model expects {marker} to {trajectory} toward {estimate} {unit}."
  )
    .replace("{dose}", formatAxisTick(targetDose))
    .replace("{marker}", markerLabel)
    .replace("{trajectory}", trajectoryText)
    .replace("{estimate}", formatAxisTick(scenarioDisplayEstimate))
    .replace("{unit}", prediction.unit);

  return (
    <article className={`dose-premium-card dose-accordion-card rounded-2xl border p-3 sm:p-4 ${isLocked ? "dose-premium-card-locked" : ""}`}>
      <div className="dose-accordion-trigger flex w-full items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <h4 className="truncate text-base font-semibold text-slate-100">{markerLabel}</h4>
          <p className="mt-1 line-clamp-1 text-xs text-slate-300">{prediction.whyRelevant}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[11px]">
          <span className="dose-accordion-chip rounded-full border px-2 py-0.5 text-cyan-100">
            {tr("Bij", "At")} {formatAxisTick(targetDose)} mg
          </span>
          <span className="dose-accordion-chip rounded-full border px-2 py-0.5 text-slate-200">
            {formatAxisTick(scenarioDisplayEstimate)} {prediction.unit}
          </span>
          <span className="dose-accordion-chip rounded-full border px-2 py-0.5 text-emerald-200">{deltaLabel}</span>
          <span className="dose-accordion-chip rounded-full border px-2 py-0.5 text-slate-200">{confidenceLabel}</span>
        </div>
      </div>

      <div className="mt-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="dose-source-badge inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
            <Sparkles className="h-3 w-3" />
            {sourceLabel}
          </span>
          <span className="dose-confidence-badge inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
            <ShieldCheck className="h-3 w-3" />
            {tr("Confidence", "Confidence")}: {confidenceLabel}
          </span>
          {isLocked ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-200">
              <Lock className="h-3 w-3" /> {tr("Premium", "Premium")}
            </span>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="dose-stat-card rounded-xl border p-2.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{tr("Huidige waarde", "Current value")}</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">
              {formatAxisTick(currentDisplayEstimate)} <span className="text-xs font-medium text-slate-400">{prediction.unit}</span>
            </p>
          </div>
          <div className="dose-stat-card rounded-xl border p-2.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              {tr("Scenario bij", "Scenario at")} {formatAxisTick(targetDose)} mg/week
            </p>
            <p className="mt-1 text-lg font-semibold text-cyan-200">
              {formatAxisTick(scenarioDisplayEstimate)} <span className="text-xs font-medium text-slate-400">{prediction.unit}</span>
            </p>
          </div>
          <div className="dose-stat-card rounded-xl border p-2.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{tr("Verandering vs nu", "Change vs now")}</p>
            <p className="mt-1 text-lg font-semibold text-emerald-200">{deltaLabel}</p>
          </div>
        </div>

        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-300">
          <span>
            <strong>{tr("Waarschijnlijk bereik", "Likely range")}:</strong> {targetRangeLabel}
          </span>
          <span>
            <strong>{tr("Zone-impact", "Zone impact")}:</strong> {zoneMessage}
          </span>
        </div>

        <p className="text-xs text-slate-200">
          {scenarioNarrative}
        </p>

        {prediction.source === "study_prior" && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <strong>{tr("Let op:", "Note:")}</strong>{" "}
            {tr(
              "Deze inschatting komt vooral uit populatiestudies en minder uit je persoonlijke data. Gebruik dit als richting, niet als exact eindpunt.",
              "This estimate leans more on population studies than on your personal data. Use it as direction, not as an exact endpoint."
            )}
          </div>
        )}

        {prediction.source === "hybrid" && (
          <div className="rounded-lg border border-slate-500/40 bg-slate-900/40 px-3 py-2 text-xs text-slate-300">
            <strong>{tr("Hybride model:", "Hybrid model:")}</strong>{" "}
            {tr(
              "Deze inschatting combineert je eigen data met studiegegevens omdat er nog beperkte persoonlijke meetpunten zijn.",
              "This estimate combines your own data with study priors because personal data points are still limited."
            )}
          </div>
        )}

        <div>
          <DoseProjectionChart
            prediction={prediction}
            reports={reports}
            settings={settings}
            language={language}
            targetDose={targetDose}
            targetEstimate={scenarioDisplayEstimate}
            targetLow={scenarioDisplayLow}
            targetHigh={scenarioDisplayHigh}
            isSameDoseScenario={isSameDoseScenario}
            sameDoseDeltaPct={deltaPct}
          />
        </div>

        <details className="dose-model-details mt-1 rounded-lg border border-slate-700/70 bg-slate-950/35 p-2.5 text-[11px] text-slate-300">
          <summary className="cursor-pointer list-none font-medium text-slate-200">
            <span className="inline-flex items-center gap-1">
              <BarChart3 className="h-3.5 w-3.5" />
              {tr("Model details", "Model details")}
            </span>
          </summary>
          <div className="mt-2 space-y-1">
            <p>{prediction.statusReason}</p>
            <p>
              n={prediction.sampleCount}, doses={prediction.uniqueDoseLevels}, r=
              {prediction.correlationR === null ? tr("n.v.t.", "n/a") : formatAxisTick(prediction.correlationR)}, R²=
              {formatAxisTick(prediction.rSquared)}, {tr("model", "model")}={prediction.modelType}
            </p>
            {prediction.samplingWarning ? (
              <p>
                {tr("Samplingwaarschuwing", "Sampling warning")}: {prediction.samplingWarning}
              </p>
            ) : null}
            {prediction.blendDiagnostics ? (
              <p>
                blend w={formatAxisTick(prediction.blendDiagnostics.wPersonal)}, sigma p=
                {formatAxisTick(prediction.blendDiagnostics.sigmaPersonal)}, sigma prior=
                {formatAxisTick(prediction.blendDiagnostics.sigmaPrior)}, sigma resid=
                {formatAxisTick(prediction.blendDiagnostics.sigmaResidual)}
                {prediction.blendDiagnostics.offlinePriorFallback ? ` (${tr("offline fallback", "offline fallback")})` : ""}
              </p>
            ) : null}
            {prediction.excludedPoints.length > 0 ? (
              <p>
                {tr("Uitgesloten punten", "Excluded points")}:{" "}
                {prediction.excludedPoints
                  .slice(0, 3)
                  .map((item) => `${item.date}: ${item.reason}`)
                  .join(" | ")}
                {prediction.excludedPoints.length > 3 ? ` +${prediction.excludedPoints.length - 3}` : ""}
              </p>
            ) : null}
          </div>
        </details>
      </div>
    </article>
  );
};

export default DoseMarkerCard;
