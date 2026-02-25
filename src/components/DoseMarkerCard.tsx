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
  isLocked = false
}: DoseMarkerCardProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const markerLabel = getMarkerDisplayName(prediction.marker, language);
  const deltaPct = calculatePercentChange(targetEstimate, prediction.currentEstimate);
  const deltaLabel = deltaPct === null ? tr("Onbekend", "Unknown") : `${deltaPct > 0 ? "+" : ""}${deltaPct}%`;

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
    targetLow === null || targetHigh === null
      ? tr("Onzekerheidsbereik nog niet beschikbaar", "Uncertainty range not available yet")
      : `${formatAxisTick(targetLow)} - ${formatAxisTick(targetHigh)} ${prediction.unit}`;

  const latestReference = useMemo(() => {
    const series = buildMarkerSeries(reports, prediction.marker, settings.unitSystem);
    const latestWithReference = [...series].reverse().find((point) => point.referenceMin !== null || point.referenceMax !== null);
    return latestWithReference
      ? {
          min: latestWithReference.referenceMin,
          max: latestWithReference.referenceMax
        }
      : null;
  }, [reports, prediction.marker, settings.unitSystem]);

  const optimalZone = getTargetZone(prediction.marker, "trt", settings.unitSystem);
  const longevityZone = getTargetZone(prediction.marker, "longevity", settings.unitSystem);
  const inZone = (value: number, zone: { min: number; max: number } | null): boolean =>
    !!zone && value >= zone.min && value <= zone.max;
  const inReferenceRange =
    latestReference !== null &&
    (latestReference.min === null || targetEstimate >= latestReference.min) &&
    (latestReference.max === null || targetEstimate <= latestReference.max);

  const zoneMessage = (() => {
    if (latestReference && inReferenceRange) {
      return tr("Binnen meest recente referentiebereik", "Inside latest reference range");
    }
    if (latestReference && !inReferenceRange) {
      return tr("Buiten meest recente referentiebereik", "Outside latest reference range");
    }
    if (inZone(targetEstimate, optimalZone)) {
      return tr("Valt binnen de optimal zone", "Falls inside the optimal zone");
    }
    if (inZone(targetEstimate, longevityZone)) {
      return tr("Valt binnen de longevity zone", "Falls inside the longevity zone");
    }
    if (optimalZone || longevityZone) {
      return tr("Buiten de bekende doelzones", "Outside known target zones");
    }
    return tr("Nog geen zone-overlay voor deze marker", "No zone overlay available for this marker");
  })();

  return (
    <article className={`dose-premium-card rounded-2xl border p-4 ${isLocked ? "dose-premium-card-locked" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-base font-semibold text-slate-100">{markerLabel}</h4>
          <p className="mt-1 text-xs text-slate-300">{prediction.whyRelevant}</p>
        </div>
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
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="dose-stat-card rounded-xl border p-2.5">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">{tr("Huidige modelwaarde", "Current model value")}</p>
          <p className="mt-1 text-lg font-semibold text-slate-100">
            {formatAxisTick(prediction.currentEstimate)} <span className="text-xs font-medium text-slate-400">{prediction.unit}</span>
          </p>
        </div>
        <div className="dose-stat-card rounded-xl border p-2.5">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">
            {tr("Bij", "At")} {formatAxisTick(targetDose)} mg/week
          </p>
          <p className="mt-1 text-lg font-semibold text-cyan-200">
            {formatAxisTick(targetEstimate)} <span className="text-xs font-medium text-slate-400">{prediction.unit}</span>
          </p>
        </div>
        <div className="dose-stat-card rounded-xl border p-2.5">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">{tr("Verandering vs nu", "Change vs now")}</p>
          <p className="mt-1 text-lg font-semibold text-emerald-200">{deltaLabel}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-300">
        <span>
          <strong>{tr("Waarschijnlijk bereik", "Likely range")}:</strong> {targetRangeLabel}
        </span>
        <span>
          <strong>{tr("Zone-impact", "Zone impact")}:</strong> {zoneMessage}
        </span>
      </div>

      <p className="mt-2 text-xs text-slate-200">
        {tr(
          `Als je richting ${formatAxisTick(targetDose)} mg/week gaat, dan verwacht dit model dat ${markerLabel} ${
            deltaPct !== null && deltaPct >= 0 ? "waarschijnlijk stijgt" : "waarschijnlijk daalt"
          } richting ${formatAxisTick(targetEstimate)} ${prediction.unit}.`,
          `If you move toward ${formatAxisTick(targetDose)} mg/week, this model expects ${markerLabel} to ${
            deltaPct !== null && deltaPct >= 0 ? "likely rise" : "likely fall"
          } toward ${formatAxisTick(targetEstimate)} ${prediction.unit}.`
        )}
      </p>

      {prediction.source === "study_prior" && (
        <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <strong>{tr("Let op:", "Note:")}</strong>{" "}
          {tr(
            "Deze voorspelling is gebaseerd op gemiddelden uit TRT-populatiestudies, niet op jouw eigen meetdata. Individuele respons op testosteron varieert sterk — gebruik dit alleen als ruwe richtlijn.",
            "This prediction is based on population study averages only — not your personal measurement data. Individual dose-response varies significantly. Use this as a rough reference only."
          )}
        </div>
      )}

      {prediction.source === "hybrid" && (
        <div className="mt-2 rounded-lg border border-slate-500/40 bg-slate-900/40 px-3 py-2 text-xs text-slate-300">
          <strong>{tr("Hybride model:", "Hybrid model:")}</strong>{" "}
          {tr(
            "Dit model combineert jouw eigen meetdata met gemiddelden uit TRT-studies, omdat je nog niet genoeg persoonlijke datapunten hebt voor een volledig persoonlijk model. Voeg meer labresultaten toe om de nauwkeurigheid te verbeteren.",
            "This model blends your own measurement data with population study averages, because you don't yet have enough personal data points for a fully personal model. Add more lab results to improve accuracy."
          )}
        </div>
      )}

      <div className="mt-2">
        <DoseProjectionChart
          prediction={prediction}
          reports={reports}
          settings={settings}
          language={language}
          targetDose={targetDose}
          targetEstimate={targetEstimate}
          targetLow={targetLow}
          targetHigh={targetHigh}
        />
      </div>

      <details className="dose-model-details mt-2 rounded-lg border border-slate-700/70 bg-slate-950/35 p-2.5 text-[11px] text-slate-300">
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
    </article>
  );
};

export default DoseMarkerCard;
