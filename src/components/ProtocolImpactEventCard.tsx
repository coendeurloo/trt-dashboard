import { useCallback, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, Eye, Info, ListFilter, Minus, ShieldAlert, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { ProtocolImpactDoseEvent, ProtocolImpactMarkerRow } from "../analytics";
import { formatAxisTick } from "../chartHelpers";
import { getMarkerDisplayName, trLocale } from "../i18n";
import { AppLanguage, AppSettings } from "../types";
import { formatDate } from "../utils";

interface ProtocolImpactEventCardProps {
  event: ProtocolImpactDoseEvent;
  rows: ProtocolImpactMarkerRow[];
  settings: AppSettings;
  language: AppLanguage;
}

type ChangeContext = "expected" | "monitor" | "improvement" | "watch" | "neutral";

const HORMONE_MARKERS = ["Testosterone", "Free Testosterone"];
const LIPID_IMPROVEMENT_MARKERS = ["LDL Cholesterol", "LDL", "Triglycerides", "Total Cholesterol"];
const normalizeMarkerName = (value: string): string => value.trim().toLowerCase();
const markerMatches = (marker: string, candidates: string[]): boolean => {
  const normalizedMarker = normalizeMarkerName(marker);
  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeMarkerName(candidate);
    return normalizedMarker === normalizedCandidate || normalizedMarker.includes(normalizedCandidate);
  });
};

const doseWasIncreased = (event: ProtocolImpactDoseEvent): boolean => {
  if (event.fromDose === null || event.toDose === null) {
    return false;
  }
  return event.toDose > event.fromDose;
};

const classifyChange = (
  marker: string,
  percentChange: number | null,
  event: ProtocolImpactDoseEvent
): ChangeContext => {
  if (percentChange === null || !Number.isFinite(percentChange)) {
    return "neutral";
  }

  if (markerMatches(marker, HORMONE_MARKERS) && doseWasIncreased(event) && percentChange > 0) {
    return "expected";
  }
  if (markerMatches(marker, LIPID_IMPROVEMENT_MARKERS) && percentChange < -5) {
    return "improvement";
  }
  if (markerMatches(marker, ["eGFR"]) && percentChange > 5) {
    return "improvement";
  }
  if (markerMatches(marker, ["Creatinine"]) && percentChange < -5) {
    return "improvement";
  }
  if (markerMatches(marker, ["Estradiol"]) && percentChange > 15) {
    return "monitor";
  }
  if (markerMatches(marker, ["Hematocrit"]) && percentChange > 3) {
    return "monitor";
  }
  if (markerMatches(marker, ["LDL Cholesterol", "LDL"]) && percentChange > 10) {
    return "watch";
  }
  if (markerMatches(marker, ["PSA"]) && percentChange > 15) {
    return "watch";
  }
  return "neutral";
};

const joinMarkerLabels = (
  markers: string[],
  language: AppLanguage,
  tr: (nl: string, en: string) => string
): string => {
  const labels = Array.from(new Set(markers.map((marker) => getMarkerDisplayName(marker, language))));
  if (labels.length === 0) {
    return "";
  }
  if (labels.length === 1) {
    return labels[0] ?? "";
  }
  if (labels.length === 2) {
    return `${labels[0]}${tr(" en ", " and ")}${labels[1]}`;
  }
  const head = labels.slice(0, -1).join(", ");
  const tail = labels[labels.length - 1] ?? "";
  return `${head}${tr(", en ", ", and ")}${tail}`;
};

const getImpactSummary = (
  changes: ProtocolImpactMarkerRow[],
  event: ProtocolImpactDoseEvent,
  language: AppLanguage,
  tr: (nl: string, en: string) => string
): string => {
  const measuredChanges = changes.filter((change) => !change.insufficientData && change.deltaPct !== null);
  if (measuredChanges.length === 0) {
    return tr("Markers verschoven na de protocolwijziging.", "Markers shifted after the protocol change.");
  }

  const positiveHormones = measuredChanges.filter(
    (change) => markerMatches(change.marker, HORMONE_MARKERS) && (change.deltaPct ?? 0) > 0
  );
  const negativeFlags = measuredChanges.filter((change) => {
    const pct = change.deltaPct ?? 0;
    return (
      (markerMatches(change.marker, ["Hematocrit"]) && pct > 3) ||
      (markerMatches(change.marker, ["Estradiol"]) && pct > 20) ||
      (markerMatches(change.marker, ["PSA"]) && pct > 20)
    );
  });
  const positiveOther = measuredChanges.filter(
    (change) => markerMatches(change.marker, LIPID_IMPROVEMENT_MARKERS) && (change.deltaPct ?? 0) < -5
  );

  const parts: string[] = [];

  if (positiveHormones.length > 0) {
    parts.push(
      doseWasIncreased(event)
        ? tr(
            "Hormoonmarkers stegen zoals verwacht na de dosisverhoging.",
            "Hormone markers rose as expected after the dose increase."
          )
        : tr(
            "Hormoonmarkers verschoven na de protocolwijziging.",
            "Hormone markers shifted with the protocol change."
          )
    );
  }
  if (positiveOther.length > 0) {
    const markerText = joinMarkerLabels(
      positiveOther.map((change) => change.marker),
      language,
      tr
    );
    parts.push(tr(`${markerText}: verbetering gezien.`, `${markerText} improved.`));
  }
  if (negativeFlags.length > 0) {
    const markerText = joinMarkerLabels(
      negativeFlags.map((change) => change.marker),
      language,
      tr
    );
    parts.push(tr(`${markerText}: extra monitoring aanbevolen.`, `${markerText} worth monitoring.`));
  }

  return parts.join(" ") || tr("Markers verschoven na de protocolwijziging.", "Markers shifted after the protocol change.");
};

const contextStyles: Record<
  ChangeContext,
  {
    border: string;
    badge: string;
    label: string;
    chip: string;
    icon: typeof Sparkles;
  }
> = {
  expected: {
    border: "border-l-2 border-l-emerald-500/40",
    badge: "bg-emerald-500/10 text-emerald-200 ring-emerald-500/20",
    label: "text-emerald-200",
    chip: "border-emerald-500/30 bg-emerald-500/8 text-emerald-200",
    icon: Sparkles
  },
  improvement: {
    border: "border-l-2 border-l-cyan-500/40",
    badge: "bg-cyan-500/10 text-cyan-200 ring-cyan-500/20",
    label: "text-cyan-200",
    chip: "border-cyan-500/30 bg-cyan-500/8 text-cyan-200",
    icon: TrendingDown
  },
  monitor: {
    border: "border-l-2 border-l-amber-500/40",
    badge: "bg-amber-500/10 text-amber-200 ring-amber-500/20",
    label: "text-amber-200",
    chip: "border-amber-500/30 bg-amber-500/8 text-amber-200",
    icon: ShieldAlert
  },
  watch: {
    border: "border-l-2 border-l-rose-500/40",
    badge: "bg-rose-500/10 text-rose-200 ring-rose-500/20",
    label: "text-rose-200",
    chip: "border-rose-500/30 bg-rose-500/8 text-rose-200",
    icon: Eye
  },
  neutral: {
    border: "border-l-2 border-l-slate-700/40",
    badge: "bg-slate-800 text-slate-300 ring-slate-700",
    label: "text-slate-400",
    chip: "border-slate-600/70 bg-slate-800/70 text-slate-300",
    icon: Minus
  }
};

const contextLabelText = (context: ChangeContext, tr: (nl: string, en: string) => string): string => {
  if (context === "expected") {
    return tr("verwacht", "expected");
  }
  if (context === "improvement") {
    return tr("verbetering", "improvement");
  }
  if (context === "monitor") {
    return tr("monitor", "monitor");
  }
  if (context === "watch") {
    return tr("bewaken", "watch");
  }
  return tr("gemeten", "measured");
};

const ProtocolImpactEventCard = ({
  event,
  rows,
  settings,
  language
}: ProtocolImpactEventCardProps) => {
  const tr = useCallback((nl: string, en: string): string => trLocale(language, nl, en), [language]);
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
  const impactSummary = getImpactSummary(displayTopRows, event, language, tr);

  return (
    <article className="protocol-impact-event-shell rounded-2xl border p-4">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          {formatDate(event.changeDate)} · {tr("Protocol update", "Protocol update")}
        </p>
        <div className="mb-6 mt-3 flex flex-wrap gap-2">
          {doseChanged ? (
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/60 bg-slate-800/60 px-3 py-1.5 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{tr("Dosis", "Dose")}</span>
              <span className="text-slate-400">{formatDose(event.fromDose)}</span>
              <ArrowRight className="h-3 w-3 text-slate-600" />
              <span className="font-semibold text-slate-200">{formatDose(event.toDose)}</span>
            </div>
          ) : null}
          {frequencyChanged ? (
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/60 bg-slate-800/60 px-3 py-1.5 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{tr("Frequentie", "Frequency")}</span>
              <span className="text-slate-400">{formatFrequency(event.fromFrequency)}</span>
              <ArrowRight className="h-3 w-3 text-slate-600" />
              <span className="font-semibold text-slate-200">{formatFrequency(event.toFrequency)}</span>
            </div>
          ) : null}
          {compoundChanged ? (
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/60 bg-slate-800/60 px-3 py-1.5 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{tr("Compound", "Compound")}</span>
              <span className="text-slate-400">{formatCompounds(event.fromCompounds, true)}</span>
              <ArrowRight className="h-3 w-3 text-slate-600" />
              <span className="font-semibold text-slate-200">{formatCompounds(event.toCompounds, false)}</span>
            </div>
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

      <div className="mt-4 space-y-2">
        <p className="mb-6 text-sm leading-relaxed text-slate-400">{impactSummary}</p>
        {confounderLine ? (
          <p className="protocol-impact-story-row text-slate-300">
            <span className="protocol-impact-emoji-label">⚠️ {tr("Extra factoren", "Extra factors")}:</span> {confounderLine}
          </p>
        ) : null}
      </div>

      <section className="mt-4 space-y-2">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">{tr("Impact", "Impact")}</h3>
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
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-slate-700/70 bg-slate-900/40 px-2.5 py-1 text-[11px] text-slate-300">
          <ListFilter className="h-3 w-3 text-slate-400" />
          <span>
            {tr(
              "Top 4 op absolute gemeten verandering (%Δ) in dit eventvenster.",
              "Top 4 by absolute measured change (%Δ) in this event window."
            )}
          </span>
        </div>

        {displayTopRows.length === 0 ? (
          <p className="text-sm text-slate-400">{tr("Nog geen duidelijke effecten; meer metingen nodig.", "No clear effects yet; more measurements are needed.")}</p>
        ) : (
          <ul className="protocol-impact-effects-grid grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
            {displayTopRows.map((row, index) => {
              const context = classifyChange(row.marker, row.deltaPct, event);
              const styles = contextStyles[context];
              const badgeLabel = contextLabelText(context, tr);
              const deltaPct = row.deltaPct;
              const Icon =
                deltaPct === null || Math.abs(deltaPct) < 0.01 ? Minus : deltaPct > 0 ? TrendingUp : TrendingDown;
              const ContextIcon = styles.icon;
              const beforeLabel = row.beforeAvg === null ? "-" : formatAxisTick(row.beforeAvg);
              const afterLabel = row.afterAvg === null ? "-" : formatAxisTick(row.afterAvg);
              const rank = index + 1;
              const absDeltaLabel = row.deltaPct === null ? "?" : `${Math.abs(row.deltaPct).toFixed(1)}%`;
              const selectionReason = tr(
                `Geselecteerd: #${rank} op |%Δ| (${absDeltaLabel}) · n ${row.nBefore}/${row.nAfter}`,
                `Selected: #${rank} by |%Δ| (${absDeltaLabel}) · n ${row.nBefore}/${row.nAfter}`
              );

              if (row.insufficientData || row.beforeAvg === null || row.afterAvg === null || row.deltaPct === null) {
                return (
                  <li
                    key={`${event.id}-top-${row.marker}`}
                    className={`flex h-full flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/50 pl-4 pr-5 py-4 ${styles.border}`}
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-200">{getMarkerDisplayName(row.marker, settings.language)}</span>
                    </div>
                    <p className="mt-auto text-sm text-slate-400">{tr("Nog te weinig data", "Not enough data yet")}</p>
                  </li>
                );
              }

              return (
                <li
                  key={`${event.id}-top-${row.marker}`}
                  className={`flex h-full flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/50 pl-4 pr-5 py-4 ${styles.border}`}
                >
                  <div className="mb-4 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-200">{getMarkerDisplayName(row.marker, settings.language)}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{selectionReason}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${styles.chip}`}>
                      <ContextIcon className="h-3 w-3" />
                      {badgeLabel}
                    </span>
                  </div>

                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex flex-1 flex-col items-center">
                      <span className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">{tr("Voor", "Before")}</span>
                      <span className="text-2xl font-bold tabular-nums text-slate-400">{beforeLabel}</span>
                      <span className="mt-0.5 text-[10px] text-slate-600">{row.unit}</span>
                    </div>

                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-700" />

                    <div className="flex flex-1 flex-col items-center">
                      <span className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{tr("Na", "After")}</span>
                      <span className="text-2xl font-bold tabular-nums text-slate-200">{afterLabel}</span>
                      <span className="mt-0.5 text-[10px] text-slate-600">{row.unit}</span>
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${styles.badge}`}>
                      <Icon className="h-3 w-3" />
                      {row.deltaPct > 0 ? "+" : ""}
                      {row.deltaPct.toFixed(1)}%
                    </span>
                    <span className={`text-[10px] font-semibold uppercase tracking-widest ${styles.label}`}>
                      {tr("gemeten effect", "measured effect")}
                    </span>
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
