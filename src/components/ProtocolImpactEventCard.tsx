import { useMemo } from "react";
import { ProtocolImpactDoseEvent, ProtocolImpactMarkerRow } from "../analytics";
import { formatAxisTick } from "../chartHelpers";
import { getMarkerDisplayName, trLocale } from "../i18n";
import { AppLanguage, AppSettings } from "../types";
import { formatDate as formatHumanDate } from "../utils";
import ProtocolImpactDeltaRail from "./ProtocolImpactDeltaRail";

interface ProtocolImpactEventCardProps {
  event: ProtocolImpactDoseEvent;
  rows: ProtocolImpactMarkerRow[];
  settings: AppSettings;
  language: AppLanguage;
  doseContextByMarker: Record<string, string>;
}

const ProtocolImpactEventCard = ({
  event,
  rows,
  settings,
  language,
  doseContextByMarker
}: ProtocolImpactEventCardProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
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
    const candidates = rows.filter((row) => !row.insufficientData);
    return candidates.slice(0, 4);
  }, [rows]);

  const hasBaselineComparison = rows.some((row) => row.beforeSource === "baseline");
  const nextSuggestedDateLabel = useMemo(() => {
    const nextDate = rows
      .map((row) => row.recommendedNextTestDate)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => Date.parse(left) - Date.parse(right))[0];
    return nextDate ? formatHumanDate(nextDate) : null;
  }, [rows]);

  const signalStatusLabel =
    event.signalStatus === "established_pattern"
      ? tr("Bevestigd patroon", "Established pattern")
      : event.signalStatus === "building_signal"
        ? tr("Opbouwend signaal", "Building signal")
        : tr("Vroeg signaal", "Early signal");

  const signalStatusClass =
    event.signalStatus === "established_pattern"
      ? "protocol-impact-status-established"
      : event.signalStatus === "building_signal"
        ? "protocol-impact-status-building"
        : "protocol-impact-status-early";

  const signalEmoji =
    event.signalStatus === "established_pattern" ? "✅" : event.signalStatus === "building_signal" ? "🟡" : "🧪";

  const signalGuidance =
    event.signalStatus === "established_pattern"
      ? tr(
          "Het patroon is sterk en consistent. Blijf je normale monitoringritme volgen.",
          "This pattern is strong and consistent. Keep your normal monitoring cadence."
        )
      : event.signalStatus === "building_signal"
        ? nextSuggestedDateLabel
          ? tr(
              `Het patroon wordt duidelijker. Een extra meting rond ${nextSuggestedDateLabel} maakt de conclusie sterker.`,
              `The pattern is becoming clearer. One extra measurement around ${nextSuggestedDateLabel} will strengthen the conclusion.`
            )
          : tr(
              "Het patroon wordt duidelijker. Nog één extra follow-up meting maakt de conclusie sterker.",
              "The pattern is becoming clearer. One extra follow-up measurement will strengthen the conclusion."
            )
        : nextSuggestedDateLabel
          ? tr(
              `Dit is nog een vroeg signaal. Een nieuwe meting rond ${nextSuggestedDateLabel} geeft een betrouwbaarder beeld.`,
              `This is still an early signal. A new measurement around ${nextSuggestedDateLabel} will provide a more reliable picture.`
            )
          : tr(
              "Dit is nog een vroeg signaal. Meer stabiele voor/na-metingen zijn nodig voor een betrouwbaarder beeld.",
              "This is still an early signal. More stable before/after measurements are needed for a more reliable picture."
            );

  return (
    <article className="protocol-impact-event-shell rounded-2xl border p-4">
      <header className="space-y-2">
        <h4 className="break-words text-lg font-semibold text-slate-100">{event.headlineNarrative ?? event.storyChange}</h4>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`protocol-impact-status-pill inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${signalStatusClass}`}>
            {signalEmoji} {signalStatusLabel}
          </span>
          {hasBaselineComparison ? (
            <span className="protocol-impact-context-chip inline-flex items-center rounded-full border px-2.5 py-1 text-xs">
              🧷 {tr("Vergeleken met baseline", "Compared to baseline")}
            </span>
          ) : null}
        </div>

        <p className="protocol-impact-story-block text-sm text-slate-300">{signalGuidance || event.signalNextStep}</p>
      </header>

      <div className="mt-4 space-y-2 text-sm text-slate-200">
        <p className="protocol-impact-story-row">
          <span className="protocol-impact-emoji-label">📌 {tr("Wat is gemeten", "What is measured")}:</span> {event.storyObserved ?? event.storyEffect}
        </p>
        <p className="protocol-impact-story-row">
          <span className="protocol-impact-emoji-label">🧭 {tr("Interpretatie", "Interpretation")}:</span> {event.storyInterpretation ?? event.storyReliability}
        </p>
        {confounderLine ? (
          <p className="protocol-impact-story-row text-slate-300">
            <span className="protocol-impact-emoji-label">⚠️ {tr("Extra factoren", "Extra factors")}:</span> {confounderLine}
          </p>
        ) : null}
      </div>

      <section className="mt-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">📈 {tr("Belangrijkste effecten", "Main effects")}</p>

        {displayTopRows.length === 0 ? (
          <p className="text-sm text-slate-400">{tr("Nog geen duidelijke effecten; meer metingen nodig.", "No clear effects yet; more measurements are needed.")}</p>
        ) : (
          <ul className="protocol-impact-effects-grid grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
            {displayTopRows.map((row) => {
              const contextParts = [row.contextHint, doseContextByMarker[row.marker]].filter(Boolean);
              const contextHint = contextParts.length > 0 ? contextParts.join(" ") : null;
              return (
                <li key={`${event.id}-top-${row.marker}`} className="protocol-impact-effect-tile flex h-full flex-col rounded-xl border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="protocol-impact-effect-title text-sm font-semibold text-slate-100">
                        <span className="mr-1" aria-hidden="true">
                          {markerIcon(row.marker)}
                        </span>
                        {getMarkerDisplayName(row.marker, settings.language)}
                      </p>
                      <p className="protocol-impact-effect-summary mt-0.5 text-sm text-slate-300">{row.narrativeShort}</p>
                    </div>
                    {contextHint ? (
                      <span
                        className="protocol-impact-context-chip inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px]"
                        title={contextHint}
                      >
                        💡 {tr("Context", "Context")}
                      </span>
                    ) : null}
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
        <summary className="cursor-pointer list-none font-medium text-slate-200">{tr("Technical details", "Technical details")}</summary>
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
