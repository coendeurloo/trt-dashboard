import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ProtocolImpactDoseEvent, ProtocolImpactMarkerRow } from "../analytics";
import { formatAxisTick } from "../chartHelpers";
import { getMarkerDisplayName, trLocale } from "../i18n";
import { AppLanguage, AppSettings } from "../types";
import { formatDate } from "../utils";
import {
  getConfidenceLabel,
  getEventOutcomeSummary,
  getEventSelectorLabel,
  selectTopMeaningfulMarkers,
  summarizeCompounds
} from "./protocolImpactPresentation";

interface ProtocolImpactViewProps {
  protocolDoseEvents: ProtocolImpactDoseEvent[];
  settings: AppSettings;
  language: AppLanguage;
}

type Translator = (nl: string, en: string) => string;
const tone = (isDarkTheme: boolean, darkClass: string, lightClass: string): string =>
  isDarkTheme ? darkClass : lightClass;

const listOrFallback = (
  values: string[],
  tr: Translator,
  fallback = tr("Geen", "None")
): string => {
  if (values.length === 0) {
    return fallback;
  }
  return values.join(", ");
};

const hasMeasuredDelta = (row: ProtocolImpactMarkerRow): boolean =>
  !row.insufficientData &&
  row.beforeAvg !== null &&
  row.afterAvg !== null &&
  row.deltaPct !== null &&
  Number.isFinite(row.deltaPct);

const deltaArrow = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) {
    return "→";
  }
  if (value > 0) {
    return "↑";
  }
  if (value < 0) {
    return "↓";
  }
  return "→";
};

const deltaText = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }
  return `${Math.abs(Number(formatAxisTick(value)))}%`;
};

const deltaToneClass = (value: number | null, isDarkTheme: boolean): string => {
  if (value === null || !Number.isFinite(value) || value === 0) {
    return tone(isDarkTheme, "text-slate-300", "text-slate-600");
  }
  if (value > 0) {
    return tone(isDarkTheme, "text-cyan-200", "text-cyan-700");
  }
  return tone(isDarkTheme, "text-rose-200", "text-rose-700");
};

const measurementLine = (row: ProtocolImpactMarkerRow): string => {
  if (!hasMeasuredDelta(row)) {
    return "-";
  }
  const beforeValue = formatAxisTick(row.beforeAvg ?? 0);
  const afterValue = formatAxisTick(row.afterAvg ?? 0);
  return `${beforeValue} -> ${afterValue} ${row.unit}`;
};

const ProtocolImpactHeader = ({ tr, isDarkTheme }: { tr: Translator; isDarkTheme: boolean }) => (
  <header className="space-y-2">
    <h2 className={`text-xl font-semibold sm:text-2xl ${tone(isDarkTheme, "text-slate-100", "text-slate-900")}`}>
      {tr("Protocol-impact", "Protocol Impact")}
    </h2>
    <p className={`max-w-2xl text-sm leading-relaxed ${tone(isDarkTheme, "text-slate-300", "text-slate-600")}`}>
      {tr(
        "Bekijk wat er in je labs veranderde na elke protocol-update.",
        "See what changed in your labs after each protocol update."
      )}
    </p>
  </header>
);

const ProtocolImpactEventSelector = ({
  events,
  selectedEventId,
  onSelect,
  tr,
  isDarkTheme
}: {
  events: ProtocolImpactDoseEvent[];
  selectedEventId: string;
  onSelect: (eventId: string) => void;
  tr: Translator;
  isDarkTheme: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedEvent = events.find((item) => item.id === selectedEventId) ?? events[0] ?? null;
  const selectedLabel = selectedEvent ? getEventSelectorLabel(selectedEvent, tr, formatDate) : "";

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }
      if (containerRef.current.contains(event.target as Node)) {
        return;
      }
      setIsOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative rounded-2xl p-3.5 ${
        isDarkTheme
          ? "border border-cyan-500/20 bg-gradient-to-r from-slate-900/80 via-slate-900/55 to-cyan-900/20"
          : "border border-slate-200 bg-white shadow-sm"
      }`}
    >
      <p
        id="protocol-impact-event-select-label"
        className={`mb-2 block text-xs font-semibold uppercase tracking-wide ${tone(isDarkTheme, "text-slate-400", "text-slate-500")}`}
      >
        {tr("Protocolwijziging", "Protocol change")}
      </p>

      <button
        type="button"
        data-testid="protocol-impact-event-selector-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby="protocol-impact-event-select-label"
        onClick={() => setIsOpen((current) => !current)}
        className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-sm outline-none transition focus:ring-2 ${
          isDarkTheme
            ? "border border-slate-600/80 bg-slate-950/70 text-slate-100 ring-cyan-400/50"
            : "border border-slate-300 bg-slate-50 text-slate-900 ring-cyan-500/40"
        }`}
      >
        <span className="truncate pr-3">{selectedLabel}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen ? (
        <ul
          role="listbox"
          aria-labelledby="protocol-impact-event-select-label"
          className={`absolute left-3.5 right-3.5 top-[calc(100%-0.15rem)] z-30 max-h-72 overflow-auto rounded-xl border shadow-lg ${
            isDarkTheme
              ? "border-slate-700 bg-slate-900/95"
              : "border-slate-300 bg-white"
          }`}
        >
          {events.map((item) => {
            const label = getEventSelectorLabel(item, tr, formatDate);
            const isSelected = item.id === selectedEventId;
            return (
              <li key={item.id} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(item.id);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3.5 py-2 text-left text-sm transition ${
                    isSelected
                      ? isDarkTheme
                        ? "bg-cyan-500/20 text-cyan-100"
                        : "bg-cyan-50 text-cyan-700"
                      : isDarkTheme
                        ? "text-slate-200 hover:bg-slate-800/90"
                        : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
};

const ProtocolImpactOutcomeHero = ({
  markers,
  language,
  tr,
  isDarkTheme
}: {
  markers: ProtocolImpactMarkerRow[];
  language: AppLanguage;
  tr: Translator;
  isDarkTheme: boolean;
}) => (
  <section
    className={`rounded-2xl p-4 sm:p-5 ${
      isDarkTheme
        ? "border border-cyan-500/20 bg-gradient-to-br from-slate-900/80 via-slate-900/65 to-cyan-950/20"
        : "border border-slate-200 bg-white shadow-sm"
    }`}
  >
    <p className={`text-sm font-semibold uppercase tracking-wide ${tone(isDarkTheme, "text-cyan-200/90", "text-cyan-700")}`}>
      {tr("Wat veranderde na deze update", "What changed after this update")}
    </p>
    {markers.length === 0 ? (
      <p className={`mt-3 text-lg font-semibold ${tone(isDarkTheme, "text-slate-100", "text-slate-900")}`}>
        {tr("Nog geen duidelijke verschuivingen gemeten.", "No clear shifts measured yet.")}
      </p>
    ) : (
      <ul className="mt-3 space-y-2.5">
        {markers.map((row) => (
          <li key={`hero-${row.marker}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className={`text-sm font-semibold sm:text-lg ${tone(isDarkTheme, "text-slate-100", "text-slate-900")}`}>
              {getMarkerDisplayName(row.marker, language)}
            </span>
            <span className={`text-sm font-semibold sm:text-lg ${deltaToneClass(row.deltaPct, isDarkTheme)}`}>
              {deltaArrow(row.deltaPct)} {deltaText(row.deltaPct)}
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
);

const ProtocolImpactMarkerCards = ({
  markers,
  language,
  isDarkTheme
}: {
  markers: ProtocolImpactMarkerRow[];
  language: AppLanguage;
  isDarkTheme: boolean;
}) => {
  if (markers.length === 0) {
    return null;
  }

  return (
    <ul className="grid gap-3 md:grid-cols-3">
      {markers.map((row) => (
        <li
          key={`card-${row.marker}`}
          data-testid="protocol-impact-key-marker-card"
          className={`rounded-2xl p-3 ${
            isDarkTheme ? "border border-slate-700/70 bg-slate-900/35" : "border border-slate-200 bg-white shadow-sm"
          }`}
        >
          <p className={`text-base font-semibold ${tone(isDarkTheme, "text-slate-100", "text-slate-900")}`}>
            {getMarkerDisplayName(row.marker, language)}
          </p>
          <p className={`mt-2 text-base ${tone(isDarkTheme, "text-slate-300", "text-slate-700")}`}>{measurementLine(row)}</p>
          <p className={`mt-2 text-xl font-semibold ${deltaToneClass(row.deltaPct, isDarkTheme)}`}>
            {deltaArrow(row.deltaPct)} {deltaText(row.deltaPct)}
          </p>
        </li>
      ))}
    </ul>
  );
};

const ProtocolImpactMetaLine = ({
  event,
  rows,
  tr,
  isDarkTheme
}: {
  event: ProtocolImpactDoseEvent;
  rows: ProtocolImpactMarkerRow[];
  tr: Translator;
  isDarkTheme: boolean;
}) => {
  const summary = getEventOutcomeSummary(rows, event);
  const confidence = getConfidenceLabel(event.eventConfidence, tr);

  return (
    <div className={`flex flex-wrap items-center gap-2 text-sm ${tone(isDarkTheme, "text-slate-400", "text-slate-600")}`}>
      <span>{summary.improved} {tr("verbeterd", "improved")}</span>
      <span>•</span>
      <span>{summary.worsened} {tr("verslechterd", "worsened")}</span>
      <span>•</span>
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${confidence.toneClass}`}>
        {confidence.label}
      </span>
    </div>
  );
};

const ProtocolImpactProtocolChanges = ({
  event,
  tr,
  isDarkTheme
}: {
  event: ProtocolImpactDoseEvent;
  tr: Translator;
  isDarkTheme: boolean;
}) => {
  const notSetLabel = tr("Niet ingesteld", "Not set");
  const compoundSummary = summarizeCompounds(event.fromCompounds, event.toCompounds);
  const doseChanged = event.fromDose !== event.toDose;
  const frequencyChanged = event.fromFrequency !== event.toFrequency;

  const rows: Array<{ label: string; value: string }> = [];
  if (doseChanged) {
    const fromLabel = event.fromDose === null ? notSetLabel : `${formatAxisTick(event.fromDose)} mg/week`;
    const toLabel = event.toDose === null ? notSetLabel : `${formatAxisTick(event.toDose)} mg/week`;
    rows.push({ label: tr("Dosis", "Dose"), value: `${fromLabel} -> ${toLabel}` });
  }
  if (frequencyChanged) {
    const fromLabel = event.fromFrequency === null ? notSetLabel : `${formatAxisTick(event.fromFrequency)}/week`;
    const toLabel = event.toFrequency === null ? notSetLabel : `${formatAxisTick(event.toFrequency)}/week`;
    rows.push({ label: tr("Frequentie", "Frequency"), value: `${fromLabel} -> ${toLabel}` });
  }
  rows.push({ label: tr("Toegevoegd", "Added"), value: listOrFallback(compoundSummary.added, tr) });
  rows.push({ label: tr("Verwijderd", "Removed"), value: listOrFallback(compoundSummary.removed, tr) });

  return (
    <section
      data-testid="protocol-impact-protocol-changes"
      className={`h-full rounded-2xl p-4 sm:p-5 ${
        isDarkTheme ? "border border-slate-700/60 bg-slate-900/30" : "border border-slate-200 bg-slate-50"
      }`}
    >
      <p className={`text-sm font-semibold uppercase tracking-wide ${tone(isDarkTheme, "text-cyan-200/90", "text-cyan-700")}`}>
        {tr("Protocolwijzigingen", "Protocol changes")}
      </p>
      <ul className="mt-3 space-y-2.5">
        {rows.map((item) => (
          <li key={item.label} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className={`text-sm font-semibold sm:text-lg ${tone(isDarkTheme, "text-slate-400", "text-slate-500")}`}>
              {item.label}:
            </span>
            <span className={`text-sm font-semibold sm:text-lg ${tone(isDarkTheme, "text-slate-100", "text-slate-900")}`}>
              {item.value}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};

const ProtocolImpactDisclosures = ({
  event,
  rows,
  language,
  allEvents,
  onSelectEvent,
  tr,
  isDarkTheme
}: {
  event: ProtocolImpactDoseEvent;
  rows: ProtocolImpactMarkerRow[];
  language: AppLanguage;
  allEvents: ProtocolImpactDoseEvent[];
  onSelectEvent: (eventId: string) => void;
  tr: Translator;
  isDarkTheme: boolean;
}) => {
  const measuredRows = rows.filter(
    (row) =>
      !row.insufficientData &&
      row.beforeAvg !== null &&
      row.afterAvg !== null &&
      row.deltaPct !== null &&
      Number.isFinite(row.deltaPct)
  );
  const insufficientRows = rows.filter((row) => row.insufficientData);
  const notSetLabel = tr("Niet ingesteld", "Not set");
  const baselineLabel = tr("Startpunt", "Baseline");
  const compoundSummary = summarizeCompounds(event.fromCompounds, event.toCompounds);

  const confidenceExplanation =
    event.eventConfidence === "High"
      ? tr(
          "Deze vergelijking heeft consistente voor- en nametingen rond dezelfde protocolwijziging.",
          "This comparison has consistent before and after measurements around the same protocol change."
        )
      : event.eventConfidence === "Medium"
        ? tr(
            "Er is een bruikbaar signaal, maar een deel van de markers mist nog sterke pre/post dekking.",
            "There is a useful signal, but part of the markers still miss strong before and after coverage."
          )
        : tr(
            "De vergelijking is gebaseerd op beperkte matched data en vraagt om extra metingen.",
            "This comparison is based on limited matched data and needs more measurements."
          );

  const confounderFlags = [
    event.confounders.samplingChanged ? tr("Samplingmoment veranderde", "Sampling timing changed") : null,
    event.confounders.supplementsChanged ? tr("Supplementen veranderden", "Supplements changed") : null,
    event.confounders.symptomsChanged ? tr("Welzijnsklachten veranderden", "Symptoms changed") : null
  ].filter(Boolean) as string[];

  const disclosurePanelClass = isDarkTheme
    ? "border border-slate-700/70 bg-slate-900/35 open:border-cyan-400/25 open:bg-slate-900/60"
    : "border border-slate-200 bg-white open:border-cyan-300";
  const disclosureDividerClass = isDarkTheme ? "border-t border-slate-700/70" : "border-t border-slate-200";
  const disclosureBodyTextClass = tone(isDarkTheme, "text-slate-300", "text-slate-700");
  const disclosureMutedTextClass = tone(isDarkTheme, "text-slate-400", "text-slate-500");
  const markerDetailCardClass = isDarkTheme
    ? "rounded-lg border border-slate-700/70 bg-slate-950/25 p-2.5 text-sm"
    : "rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm";

  return (
    <section className="space-y-2">
      <details className={`group rounded-xl ${disclosurePanelClass}`}>
        <summary className={`flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium ${tone(isDarkTheme, "text-slate-200", "text-slate-800")}`}>
          {tr("Toon alle markers", "Show all markers")} ({rows.length})
          <ChevronDown className={`h-4 w-4 transition group-open:rotate-180 ${tone(isDarkTheme, "text-slate-500 group-open:text-cyan-300", "text-slate-400 group-open:text-cyan-600")}`} />
        </summary>
        <div className={`${disclosureDividerClass} px-3 py-3`}>
          <div className="grid gap-2 md:grid-cols-2">
            {rows.map((row) => (
              <div key={`${event.id}-all-${row.marker}`} className={markerDetailCardClass}>
                <p className={`font-medium ${tone(isDarkTheme, "text-slate-100", "text-slate-900")}`}>{getMarkerDisplayName(row.marker, language)}</p>
                <p className={`mt-1 ${disclosureBodyTextClass}`}>
                  {tr("Voor", "Before")}: {row.beforeAvg === null ? "-" : formatAxisTick(row.beforeAvg)} {row.unit} · {tr("Na", "After")}:{" "}
                  {row.afterAvg === null ? "-" : formatAxisTick(row.afterAvg)} {row.unit}
                </p>
                <p className={disclosureMutedTextClass}>
                  {tr("Verandering", "Change")}: {row.deltaPct === null ? "-" : `${row.deltaPct > 0 ? "+" : ""}${formatAxisTick(row.deltaPct)}%`}
                </p>
              </div>
            ))}
          </div>
        </div>
      </details>

      <details className={`group rounded-xl ${disclosurePanelClass}`}>
        <summary className={`flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium ${tone(isDarkTheme, "text-slate-200", "text-slate-800")}`}>
          {tr("Waarom betrouwbaarheid beperkt is", "Why confidence is limited")}
          <ChevronDown className={`h-4 w-4 transition group-open:rotate-180 ${tone(isDarkTheme, "text-slate-500 group-open:text-cyan-300", "text-slate-400 group-open:text-cyan-600")}`} />
        </summary>
        <div className={`${disclosureDividerClass} px-3 py-3 text-sm ${disclosureBodyTextClass}`}>
          <p>{confidenceExplanation}</p>
          <p className={`mt-2 ${disclosureMutedTextClass}`}>
            {tr("Gemeten markers", "Measured markers")}: {measuredRows.length} · {tr("Nog onvoldoende data", "Insufficient data")}: {insufficientRows.length}
          </p>
        </div>
      </details>

      <details className={`group rounded-xl ${disclosurePanelClass}`}>
        <summary className={`flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium ${tone(isDarkTheme, "text-slate-200", "text-slate-800")}`}>
          {tr("Andere factoren veranderden", "Other factors changed")}
          <ChevronDown className={`h-4 w-4 transition group-open:rotate-180 ${tone(isDarkTheme, "text-slate-500 group-open:text-cyan-300", "text-slate-400 group-open:text-cyan-600")}`} />
        </summary>
        <div className={`${disclosureDividerClass} px-3 py-3 text-sm ${disclosureBodyTextClass}`}>
          {confounderFlags.length === 0 ? (
            <p>{tr("Geen duidelijke extra factoren gemarkeerd.", "No clear extra factors were flagged.")}</p>
          ) : (
            <ul className="space-y-1">
              {confounderFlags.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <details className={`group rounded-xl ${disclosurePanelClass}`}>
        <summary className={`flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium ${tone(isDarkTheme, "text-slate-200", "text-slate-800")}`}>
          {tr("Volledige protocoldetails", "Full protocol details")}
          <ChevronDown className={`h-4 w-4 transition group-open:rotate-180 ${tone(isDarkTheme, "text-slate-500 group-open:text-cyan-300", "text-slate-400 group-open:text-cyan-600")}`} />
        </summary>
        <div className={`${disclosureDividerClass} px-3 py-3 text-sm ${disclosureBodyTextClass}`}>
          <p>
            {tr("Dosis", "Dose")}: {event.fromDose === null ? notSetLabel : `${formatAxisTick(event.fromDose)} mg/week`} {"->"}{" "}
            {event.toDose === null ? notSetLabel : `${formatAxisTick(event.toDose)} mg/week`}
          </p>
          <p>
            {tr("Frequentie", "Frequency")}: {event.fromFrequency === null ? notSetLabel : `${formatAxisTick(event.fromFrequency)}/week`} {"->"}{" "}
            {event.toFrequency === null ? notSetLabel : `${formatAxisTick(event.toFrequency)}/week`}
          </p>
          <p>{tr("Toegevoegd", "Added")}: {listOrFallback(compoundSummary.added, tr)}</p>
          <p>{tr("Verwijderd", "Removed")}: {listOrFallback(compoundSummary.removed, tr)}</p>
          <p>{tr("Kept", "Kept")}: {listOrFallback(compoundSummary.kept, tr, baselineLabel)}</p>
          <p className={`mt-2 ${disclosureMutedTextClass}`}>
            {tr("Voorvenster", "Before window")}: {formatDate(event.beforeWindow.start)} - {formatDate(event.beforeWindow.end)} ({event.beforeCount})
          </p>
          <p className={disclosureMutedTextClass}>
            {tr("Navenster", "After window")}: {formatDate(event.afterWindow.start)} - {formatDate(event.afterWindow.end)} ({event.afterCount})
          </p>
        </div>
      </details>

      <details className={`group rounded-xl ${disclosurePanelClass}`}>
        <summary className={`flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium ${tone(isDarkTheme, "text-slate-200", "text-slate-800")}`}>
          {tr("Tijdlijn geschiedenis", "Timeline history")}
          <ChevronDown className={`h-4 w-4 transition group-open:rotate-180 ${tone(isDarkTheme, "text-slate-500 group-open:text-cyan-300", "text-slate-400 group-open:text-cyan-600")}`} />
        </summary>
        <div className={`${disclosureDividerClass} px-3 py-3`}>
          <div className="space-y-2">
            {allEvents.map((timelineEvent) => (
              <button
                key={timelineEvent.id}
                type="button"
                onClick={() => onSelectEvent(timelineEvent.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                  timelineEvent.id === event.id
                    ? isDarkTheme
                      ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-100"
                      : "border-cyan-300 bg-cyan-50 text-cyan-700"
                    : isDarkTheme
                      ? "border-slate-700/70 bg-slate-900/40 text-slate-300 hover:text-slate-100"
                      : "border-slate-200 bg-white text-slate-700 hover:text-slate-900"
                }`}
              >
                {getEventSelectorLabel(timelineEvent, tr, formatDate)}
              </button>
            ))}
          </div>
        </div>
      </details>
    </section>
  );
};

const ProtocolImpactView = ({ protocolDoseEvents, settings, language }: ProtocolImpactViewProps) => {
  const tr = useCallback((nl: string, en: string): string => trLocale(language, nl, en), [language]);
  const isDarkTheme = settings.theme === "dark";
  const [selectedEventId, setSelectedEventId] = useState<string>(protocolDoseEvents[0]?.id ?? "");

  useEffect(() => {
    if (protocolDoseEvents.length === 0) {
      if (selectedEventId !== "") {
        setSelectedEventId("");
      }
      return;
    }
    const stillExists = protocolDoseEvents.some((event) => event.id === selectedEventId);
    if (!stillExists) {
      setSelectedEventId(protocolDoseEvents[0]?.id ?? "");
    }
  }, [protocolDoseEvents, selectedEventId]);

  const selectedEvent = useMemo(
    () => protocolDoseEvents.find((event) => event.id === selectedEventId) ?? protocolDoseEvents[0] ?? null,
    [protocolDoseEvents, selectedEventId]
  );

  const topMarkers = useMemo(() => {
    if (!selectedEvent) {
      return [];
    }
    return selectTopMeaningfulMarkers(selectedEvent, selectedEvent.rows, 3);
  }, [selectedEvent]);

  return (
    <section className="fade-in space-y-4">
      <div
        className={`app-teal-glow-surface rounded-2xl p-4 sm:p-5 ${
          isDarkTheme
            ? "border border-cyan-500/20 bg-gradient-to-br from-slate-900/85 via-slate-900/70 to-cyan-950/20 shadow-[0_20px_50px_-30px_rgba(34,211,238,0.6)]"
            : "border border-slate-200 bg-slate-50/80 shadow-sm"
        }`}
      >
        <ProtocolImpactHeader tr={tr} isDarkTheme={isDarkTheme} />

        {protocolDoseEvents.length === 0 || !selectedEvent ? (
          <p
            className={`mt-4 rounded-xl px-3 py-3 text-sm ${
              isDarkTheme
                ? "border border-slate-700/60 bg-slate-900/40 text-slate-300"
                : "border border-slate-200 bg-white text-slate-600"
            }`}
          >
            {tr(
              "Nog geen protocolwijziging met bruikbare voor/na-data gevonden.",
              "No protocol-change events with usable before/after data were found."
            )}
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <ProtocolImpactEventSelector
              events={protocolDoseEvents}
              selectedEventId={selectedEvent.id}
              onSelect={setSelectedEventId}
              tr={tr}
              isDarkTheme={isDarkTheme}
            />
            <div className="grid gap-3 lg:grid-cols-2">
              <ProtocolImpactOutcomeHero
                markers={topMarkers}
                language={settings.language}
                tr={tr}
                isDarkTheme={isDarkTheme}
              />
              <ProtocolImpactProtocolChanges
                event={selectedEvent}
                tr={tr}
                isDarkTheme={isDarkTheme}
              />
            </div>
            <ProtocolImpactMarkerCards
              markers={topMarkers}
              language={settings.language}
              isDarkTheme={isDarkTheme}
            />
            <ProtocolImpactMetaLine
              event={selectedEvent}
              rows={selectedEvent.rows}
              tr={tr}
              isDarkTheme={isDarkTheme}
            />
            <ProtocolImpactDisclosures
              event={selectedEvent}
              rows={selectedEvent.rows}
              language={settings.language}
              allEvents={protocolDoseEvents}
              onSelectEvent={setSelectedEventId}
              tr={tr}
              isDarkTheme={isDarkTheme}
            />
          </div>
        )}
      </div>
    </section>
  );
};

export default ProtocolImpactView;
