import { useMemo } from "react";
import { ProtocolImpactDoseEvent, ProtocolImpactMarkerRow } from "../analytics";
import { formatAxisTick } from "../chartHelpers";
import { getMarkerDisplayName, trLocale } from "../i18n";
import { AppLanguage, AppSettings } from "../types";
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
  const markerEffectSummary = (row: ProtocolImpactMarkerRow): string => {
    if (row.insufficientData || row.deltaPct === null || row.trend === "insufficient") {
      return tr("Nog te weinig gemeten data.", "Not enough measured data yet.");
    }
    if (row.trend === "flat") {
      return tr(
        `Vrijwel stabiel (${row.deltaPct > 0 ? "+" : ""}${formatAxisTick(row.deltaPct)}%).`,
        `Mostly stable (${row.deltaPct > 0 ? "+" : ""}${formatAxisTick(row.deltaPct)}%).`
      );
    }
    const verb = row.trend === "up" ? tr("Gestegen met", "Increased by") : tr("Gedaald met", "Decreased by");
    return `${verb} ${row.deltaPct > 0 ? "+" : ""}${formatAxisTick(row.deltaPct)}%.`;
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
    if (event.confounders.symptomsChanged) {
      parts.push(tr("symptomencontext veranderde", "symptom context changed"));
    }
    if (parts.length === 0) {
      return null;
    }
    return `${parts.join(", ")}.`;
  }, [
    event.confounders.samplingChanged,
    event.confounders.supplementsChanged,
    event.confounders.symptomsChanged,
    tr
  ]);

  const displayTopRows = useMemo(() => {
    const visibleMarkers = new Set(rows.map((row) => row.marker));
    return event.topImpacts.filter((row) => visibleMarkers.has(row.marker)).slice(0, 4);
  }, [event.topImpacts, rows]);

  const hasInsufficientRows = rows.some((row) => row.comparisonBasis === "insufficient");
  const hasEventReportFallbackRows = rows.some((row) => row.comparisonBasis === "event_reports");

  return (
    <article className="protocol-impact-event-shell rounded-2xl border p-4">
      <header className="space-y-2">
        <h4 className="break-words text-lg font-semibold text-slate-100">{event.headlineNarrative ?? event.storyChange}</h4>
        <p className="protocol-impact-story-block text-sm text-slate-300">
          {tr(
            "Gemeten vergelijking: pre-change window versus post-change window rond deze wijziging.",
            "Measured comparison: pre-change window vs post-change window around this event."
          )}
        </p>
        {hasEventReportFallbackRows ? (
          <p className="protocol-impact-story-block text-sm text-slate-300">
            {tr(
              "Voor sommige markers is de dichtstbijzijnde pre/post eventmeting gebruikt omdat het lag-window leeg was.",
              "For some markers, the nearest pre/post event measurement was used because the lag window was empty."
            )}
          </p>
        ) : null}
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
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">📈 {tr("Grootste gemeten veranderingen", "Biggest measured changes")}</p>

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
                      <p className="protocol-impact-effect-summary mt-0.5 text-sm text-slate-300">{markerEffectSummary(row)}</p>
                    </div>
                  </div>

                  <div className="mt-3">
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

      <details className="protocol-impact-tech-details mt-4 rounded-xl border p-3 text-xs text-slate-300">
        <summary className="cursor-pointer list-none font-medium text-slate-200">{tr("Alle markers", "All markers")}</summary>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
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
      </details>
    </article>
  );
};

export default ProtocolImpactEventCard;
