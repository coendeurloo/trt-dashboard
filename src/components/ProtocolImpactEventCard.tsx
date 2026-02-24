import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { ProtocolImpactDoseEvent, ProtocolImpactMarkerRow } from "../analytics";
import { formatAxisTick } from "../chartHelpers";
import { getMarkerDisplayName, trLocale } from "../i18n";
import { AppLanguage, AppSettings } from "../types";
import { formatDate } from "../utils";
import ProtocolImpactDeltaRail from "./ProtocolImpactDeltaRail";

interface ProtocolImpactEventCardProps {
  event: ProtocolImpactDoseEvent;
  rows: ProtocolImpactMarkerRow[];
  settings: AppSettings;
  language: AppLanguage;
}

const ProtocolImpactEventCard = ({
  event,
  rows,
  settings,
  language
}: ProtocolImpactEventCardProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const [showAllMarkers, setShowAllMarkers] = useState(false);

  const sameCompoundSet = (left: string[], right: string[]) => {
    const normalize = (value: string) => value.trim().toLowerCase();
    const leftSet = new Set(left.map(normalize).filter(Boolean));
    const rightSet = new Set(right.map(normalize).filter(Boolean));
    if (leftSet.size !== rightSet.size) {
      return false;
    }
    return Array.from(leftSet).every((value) => rightSet.has(value));
  };

  const doseChanged = event.fromDose !== event.toDose;
  const frequencyChanged = event.fromFrequency !== event.toFrequency;
  const compoundChanged = !sameCompoundSet(event.fromCompounds, event.toCompounds);
  const baselineLabel = tr("Baseline", "Baseline");
  const notSetLabel = tr("Niet ingesteld", "Not set");

  const formatDose = (value: number | null): string => (value === null ? notSetLabel : `${formatAxisTick(value)} mg/week`);
  const formatFrequency = (value: number | null): string => (value === null ? notSetLabel : `${formatAxisTick(value)}/week`);
  const formatCompounds = (values: string[], isFrom: boolean): string => {
    if (values.length === 0) {
      return isFrom ? baselineLabel : notSetLabel;
    }
    return values.join(" + ");
  };
  const markerIcon = (marker: string): string => {
    const key = marker.toLowerCase();
    if (key.includes("testosterone")) return "🧪";
    if (key.includes("estradiol") || key.includes("e2")) return "⚖️";
    if (key.includes("hematocrit") || key.includes("hemoglobin") || key.includes("rbc")) return "🩸";
    if (
      key.includes("ldl") ||
      key.includes("hdl") ||
      key.includes("cholesterol") ||
      key.includes("apolipoprotein") ||
      key.includes("triglycer")
    ) {
      return "🫀";
    }
    if (key.includes("psa") || key.includes("prostate")) return "🧭";
    if (key.includes("shbg")) return "🔗";
    return "🔹";
  };

  const confounderLine = useMemo(() => {
    const parts: string[] = [];
    if (event.confounders.samplingChanged) {
      parts.push(tr("samplingmoment veranderde", "sampling timing changed"));
    }
    if (event.confounders.supplementsChanged) {
      parts.push(tr("supplementen veranderden", "supplements changed"));
    }
    if (parts.length === 0) {
      return null;
    }
    return `${parts.join(", ")}.`;
  }, [
    event.confounders.samplingChanged,
    event.confounders.supplementsChanged,
    tr
  ]);

  const displayTopRows = useMemo(() => {
    const visibleMarkers = new Set(rows.map((row) => row.marker));
    return event.topImpacts.filter((row) => visibleMarkers.has(row.marker)).slice(0, 4);
  }, [event.topImpacts, rows]);

  const hasInsufficientRows = rows.some((row) => row.comparisonBasis === "insufficient");

  return (
    <article className="protocol-impact-event-shell rounded-2xl border p-4">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          {formatDate(event.changeDate)} · {tr("Protocol update", "Protocol update")}
        </p>
        <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          {doseChanged ? (
            <>
              <span className="text-slate-500">{tr("Dosis", "Dose")}</span>
              <span className="text-slate-200">{formatDose(event.fromDose)} → {formatDose(event.toDose)}</span>
            </>
          ) : null}
          {frequencyChanged ? (
            <>
              <span className="text-slate-500">{tr("Frequentie", "Frequency")}</span>
              <span className="text-slate-200">{formatFrequency(event.fromFrequency)} → {formatFrequency(event.toFrequency)}</span>
            </>
          ) : null}
          {compoundChanged ? (
            <>
              <span className="text-slate-500">{tr("Compound", "Compound")}</span>
              <span className="text-slate-200">{formatCompounds(event.fromCompounds, true)} → {formatCompounds(event.toCompounds, false)}</span>
            </>
          ) : null}
        </div>
        {hasInsufficientRows ? (
          <p className="protocol-impact-story-block text-sm text-amber-200">
            {tr(
              "Nog onvoldoende gemeten pre/post-data voor (een deel van) dit event.",
              "Not enough measured pre/post data for this event yet."
            )}
          </p>
        ) : null}
      </header>

      <div className="mt-4 space-y-2 text-sm text-slate-200">
        <p className="protocol-impact-story-row">
          <span className="protocol-impact-emoji-label">📌 {tr("Wat is gemeten", "What is measured")}:</span> {event.storyObserved ?? event.storyEffect}
        </p>
        {confounderLine ? (
          <p className="protocol-impact-story-row text-slate-300">
            <span className="protocol-impact-emoji-label">⚠️ {tr("Extra factoren", "Extra factors")}:</span> {confounderLine}
          </p>
        ) : null}
      </div>

      <section className="mt-4 space-y-2">
        <div className="mb-4 flex items-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{tr("Grootste gemeten veranderingen", "Biggest measured changes")}</p>
          <span className="group relative ml-2 cursor-help text-slate-600 hover:text-slate-400">
            <Info className="h-3.5 w-3.5" />
            <span className="pointer-events-none absolute left-0 top-full z-40 mt-1 w-80 rounded-xl border border-slate-700 bg-slate-950/95 p-3 text-[11px] leading-relaxed text-slate-300 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
              {tr(
                "Vergelijkt het pre-change venster met het post-change venster rond deze wijziging. Voor sommige markers is de dichtstbijzijnde meting gebruikt als een venster leeg was.",
                "Comparing the pre-change measurement window to the post-change window around this event. For some markers, the nearest available measurement was used because the window was empty."
              )}
            </span>
          </span>
        </div>

        {displayTopRows.length === 0 ? (
          <p className="text-sm text-slate-400">{tr("Nog geen duidelijke effecten; meer metingen nodig.", "No clear effects yet; more measurements are needed.")}</p>
        ) : (
          <ul className="protocol-impact-effects-grid grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
            {displayTopRows.map((row) => {
              return (
                <li key={`${event.id}-top-${row.marker}`} className="protocol-impact-effect-tile flex h-full flex-col rounded-xl border p-3.5">
                  <div className="protocol-impact-effect-head flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="protocol-impact-effect-title text-sm font-semibold text-slate-100">
                        <span className="mr-1" aria-hidden="true">
                          {markerIcon(row.marker)}
                        </span>
                        {getMarkerDisplayName(row.marker, settings.language)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2">
                    <ProtocolImpactDeltaRail
                      beforeValue={row.beforeAvg}
                      afterValue={row.afterAvg}
                      deltaPct={row.deltaPct}
                      unit={row.unit}
                      trend={row.trend}
                      language={language}
                      unitSystem={settings.unitSystem}
                      isInsufficient={row.insufficientData}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="protocol-impact-tech-details mt-6 rounded-2xl border border-slate-700/60 bg-slate-900/40">
        <button
          type="button"
          onClick={() => setShowAllMarkers((current) => !current)}
          className="flex w-full items-center justify-between px-5 py-4 text-sm font-medium text-slate-300 hover:text-slate-100"
        >
          <span>
            {tr("Alle markers", "All markers")}
            <span className="ml-1.5 text-slate-600">({rows.length})</span>
          </span>
          {showAllMarkers ? (
            <ChevronUp className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          )}
        </button>

        {showAllMarkers ? (
          <div className="border-t border-slate-700/60 px-5 py-4">
            <div className="grid gap-2 md:grid-cols-2">
              {rows.map((row) => (
                <div key={`${event.id}-detail-${row.marker}`} className="rounded-lg border border-slate-700/70 bg-slate-950/25 p-2.5">
                  <p className="text-sm font-medium text-slate-100">{getMarkerDisplayName(row.marker, settings.language)}</p>
                  <p className="mt-1 text-slate-300">
                    {tr("Voor", "Before")}: {row.beforeAvg === null ? "-" : formatAxisTick(row.beforeAvg)} {row.unit} · {tr("Na", "After")}: {row.afterAvg === null ? "-" : formatAxisTick(row.afterAvg)} {row.unit}
                  </p>
                  <p className="text-slate-400">
                    Δ%: {row.deltaPct === null ? "-" : `${row.deltaPct > 0 ? "+" : ""}${row.deltaPct}%`} · Lag: {row.lagDays} · n: {row.nBefore}/{row.nAfter}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
};

export default ProtocolImpactEventCard;
