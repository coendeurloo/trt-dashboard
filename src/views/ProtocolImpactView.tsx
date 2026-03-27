import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, ChevronDown, CircleGauge, ListChecks, Sparkles } from "lucide-react";
import { ProtocolImpactDoseEvent, ProtocolImpactMarkerRow } from "../analytics";
import { formatAxisTick } from "../chartHelpers";
import { getMarkerDisplayName, trLocale } from "../i18n";
import { AppLanguage, AppSettings } from "../types";
import { formatDate } from "../utils";
import {
  getConfidenceLabel,
  getEventOutcomeSummary,
  getEventSelectorLabel,
  getLargestShiftsLabel,
  getMarkerStatus,
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

const sameCompoundSet = (left: string[], right: string[]): boolean => {
  const normalize = (value: string) => value.trim().toLowerCase();
  const leftSet = new Set(left.map(normalize).filter(Boolean));
  const rightSet = new Set(right.map(normalize).filter(Boolean));
  if (leftSet.size !== rightSet.size) {
    return false;
  }
  return Array.from(leftSet).every((value) => rightSet.has(value));
};

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

const renderDelta = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatAxisTick(value)}%`;
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
}) => (
  <div
    className={`rounded-2xl p-3.5 ${
      isDarkTheme
        ? "border border-cyan-500/20 bg-gradient-to-r from-slate-900/80 via-slate-900/55 to-cyan-900/20 shadow-[0_8px_28px_-18px_rgba(34,211,238,0.55)]"
        : "border border-slate-200 bg-white shadow-sm"
    }`}
  >
    <label
      htmlFor="protocol-impact-event-select"
      className={`mb-2 block text-xs font-semibold uppercase tracking-wide ${tone(isDarkTheme, "text-slate-400", "text-slate-500")}`}
    >
      {tr("Protocolwijziging", "Protocol change")}
    </label>
    <select
      id="protocol-impact-event-select"
      className={`w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition focus:ring-2 ${
        isDarkTheme
          ? "border border-slate-600/80 bg-slate-950/70 text-slate-100 ring-cyan-400/50"
          : "border border-slate-300 bg-slate-50 text-slate-900 ring-cyan-500/40"
      }`}
      value={selectedEventId}
      onChange={(event) => onSelect(event.target.value)}
    >
      {events.map((item) => (
        <option key={item.id} value={item.id}>
          {getEventSelectorLabel(item, tr, formatDate)}
        </option>
      ))}
    </select>
  </div>
);

const ProtocolImpactPrimarySummaryCard = ({
  event,
  rows,
  language,
  tr,
  isDarkTheme
}: {
  event: ProtocolImpactDoseEvent;
  rows: ProtocolImpactMarkerRow[];
  language: AppLanguage;
  tr: Translator;
  isDarkTheme: boolean;
}) => {
  const notSetLabel = tr("Niet ingesteld", "Not set");
  const baselineLabel = tr("Startpunt", "Baseline");
  const doseChanged = event.fromDose !== event.toDose;
  const frequencyChanged = event.fromFrequency !== event.toFrequency;
  const compoundChanged = !sameCompoundSet(event.fromCompounds, event.toCompounds);

  const compoundSummary = useMemo(
    () => summarizeCompounds(event.fromCompounds, event.toCompounds),
    [event.fromCompounds, event.toCompounds]
  );
  const outcomeSummary = useMemo(() => getEventOutcomeSummary(rows, event), [rows, event]);
  const largestShiftsLabel = useMemo(
    () => getLargestShiftsLabel(rows, language, tr),
    [rows, language, tr]
  );
  const confidence = useMemo(() => getConfidenceLabel(event.eventConfidence, tr), [event.eventConfidence, tr]);

  const changeRows: Array<{ label: string; value: string }> = [];
  if (doseChanged) {
    const fromLabel = event.fromDose === null ? notSetLabel : `${formatAxisTick(event.fromDose)} mg/week`;
    const toLabel = event.toDose === null ? notSetLabel : `${formatAxisTick(event.toDose)} mg/week`;
    changeRows.push({ label: tr("Dosis", "Dose"), value: `${fromLabel} -> ${toLabel}` });
  }
  if (frequencyChanged) {
    const fromLabel = event.fromFrequency === null ? notSetLabel : `${formatAxisTick(event.fromFrequency)}/week`;
    const toLabel = event.toFrequency === null ? notSetLabel : `${formatAxisTick(event.toFrequency)}/week`;
    changeRows.push({ label: tr("Frequentie", "Frequency"), value: `${fromLabel} -> ${toLabel}` });
  }
  if (!doseChanged && !frequencyChanged && !compoundChanged) {
    changeRows.push({ label: tr("Type", "Type"), value: tr("Protocol-update", "Protocol update") });
  }

  return (
    <article
      className={`relative overflow-hidden rounded-2xl p-4 sm:p-5 ${
        isDarkTheme
          ? "border border-cyan-500/20 bg-gradient-to-br from-slate-900/80 via-slate-900/65 to-cyan-950/20 shadow-[0_12px_40px_-26px_rgba(34,211,238,0.65)]"
          : "border border-slate-200 bg-white shadow-sm"
      }`}
    >
      {isDarkTheme ? <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" /> : null}
      <div className="relative flex flex-wrap items-start justify-between gap-2">
        <p className={`inline-flex items-center gap-1.5 text-sm font-semibold ${tone(isDarkTheme, "text-slate-100", "text-slate-900")}`}>
          <Calendar className={`h-4 w-4 ${tone(isDarkTheme, "text-cyan-300", "text-cyan-600")}`} />
          {tr("Datum", "Date")}: {formatDate(event.changeDate)}
        </p>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${confidence.toneClass}`}>
          <CircleGauge className="h-3.5 w-3.5" />
          {confidence.label}
        </span>
      </div>

      <div className="relative mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section
          className={`rounded-xl p-3.5 ${
            isDarkTheme ? "border border-slate-700/50 bg-slate-950/25" : "border border-slate-200 bg-slate-50"
          }`}
        >
          <p className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${tone(isDarkTheme, "text-cyan-200/90", "text-cyan-700")}`}>
            <ListChecks className="h-3.5 w-3.5" />
            {tr("Protocolwijziging", "Protocol change")}
          </p>
          <ul className={`mt-3 space-y-2 text-sm ${tone(isDarkTheme, "text-slate-200", "text-slate-700")}`}>
            {changeRows.map((item) => (
              <li key={item.label} className="flex flex-wrap items-center gap-2">
                <span className={tone(isDarkTheme, "text-slate-400", "text-slate-500")}>{item.label}</span>
                <span>{item.value}</span>
              </li>
            ))}
            <li className="flex flex-wrap items-center gap-2">
              <span className={tone(isDarkTheme, "text-slate-400", "text-slate-500")}>{tr("Toegevoegd", "Added")}</span>
              <span>{listOrFallback(compoundSummary.added, tr)}</span>
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <span className={tone(isDarkTheme, "text-slate-400", "text-slate-500")}>{tr("Verwijderd", "Removed")}</span>
              <span>{listOrFallback(compoundSummary.removed, tr)}</span>
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <span className={tone(isDarkTheme, "text-slate-400", "text-slate-500")}>{tr("Kept", "Kept")}</span>
              <span>{listOrFallback(compoundSummary.kept, tr, baselineLabel)}</span>
            </li>
          </ul>
        </section>

        <section
          className={`rounded-xl p-3.5 ${
            isDarkTheme ? "border border-slate-700/50 bg-slate-950/25" : "border border-slate-200 bg-slate-50"
          }`}
        >
          <p className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${tone(isDarkTheme, "text-cyan-200/90", "text-cyan-700")}`}>
            <Sparkles className="h-3.5 w-3.5" />
            {tr("Uitkomst", "Outcome")}
          </p>
          <p className={`mt-3 text-base font-semibold ${tone(isDarkTheme, "text-slate-100", "text-slate-900")}`}>
            {`${outcomeSummary.improved} ${tr("verbeterd", "improved")} • ${outcomeSummary.worsened} ${tr("verslechterd", "worsened")} • ${outcomeSummary.unchanged} ${tr("onveranderd", "unchanged")}`}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-200">
              {outcomeSummary.improved} {tr("verbeterd", "improved")}
            </span>
            <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-semibold text-rose-200">
              {outcomeSummary.worsened} {tr("verslechterd", "worsened")}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 font-semibold ${
                isDarkTheme
                  ? "border border-slate-600/70 bg-slate-800/70 text-slate-300"
                  : "border border-slate-300 bg-white text-slate-600"
              }`}
            >
              {outcomeSummary.unchanged} {tr("onveranderd", "unchanged")}
            </span>
          </div>
          <p className={`mt-2 text-sm ${tone(isDarkTheme, "text-slate-300", "text-slate-700")}`}>
            <span className={tone(isDarkTheme, "text-slate-400", "text-slate-500")}>{tr("Grootste verschuivingen", "Largest shifts")}:</span>{" "}
            {largestShiftsLabel}
          </p>
        </section>
      </div>
    </article>
  );
};

const ProtocolImpactKeyMarkers = ({
  event,
  markers,
  language,
  tr,
  isDarkTheme
}: {
  event: ProtocolImpactDoseEvent;
  markers: ProtocolImpactMarkerRow[];
  language: AppLanguage;
  tr: Translator;
  isDarkTheme: boolean;
}) => (
  <section className="space-y-3">
    <div className="flex items-center justify-between">
      <h3 className={`text-sm font-semibold sm:text-base ${tone(isDarkTheme, "text-slate-100", "text-slate-900")}`}>
        {tr("Belangrijkste markers", "Key markers")}
      </h3>
      <span className={`text-xs font-medium ${tone(isDarkTheme, "text-slate-400", "text-slate-500")}`}>{tr("Top 3 effecten", "Top 3 effects")}</span>
    </div>

    {markers.length === 0 ? (
      <p
        className={`rounded-xl px-3 py-2 text-sm ${
          isDarkTheme
            ? "border border-slate-700/60 bg-slate-900/40 text-slate-300"
            : "border border-slate-200 bg-white text-slate-600"
        }`}
      >
        {tr("Nog geen duidelijke gemeten effecten.", "No clear measured effects yet.")}
      </p>
    ) : (
      <ul className="grid gap-3 md:grid-cols-3">
        {markers.map((row) => {
          const status = getMarkerStatus(row, event, tr);
          const beforeValue = row.beforeAvg === null ? "-" : formatAxisTick(row.beforeAvg);
          const afterValue = row.afterAvg === null ? "-" : formatAxisTick(row.afterAvg);
          const statusAccent =
            status.label === tr("Verbeterd", "Improved")
              ? "before:bg-emerald-400/70"
              : status.label === tr("Bewaken", "Watch")
                ? "before:bg-rose-400/70"
                : "before:bg-slate-500/60";
          return (
            <li
              key={`${event.id}-key-marker-${row.marker}`}
              data-testid="protocol-impact-key-marker-card"
              className={`relative overflow-hidden rounded-2xl p-3 transition before:absolute before:inset-y-0 before:left-0 before:w-0.5 ${statusAccent} ${
                isDarkTheme
                  ? "border border-slate-700/70 bg-gradient-to-b from-slate-900/55 to-slate-900/35 shadow-[0_10px_24px_-18px_rgba(8,145,178,0.75)] hover:border-cyan-400/30 hover:shadow-[0_16px_36px_-18px_rgba(34,211,238,0.7)]"
                  : "border border-slate-200 bg-white shadow-sm hover:border-cyan-300 hover:shadow-md"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className={`text-base font-semibold ${tone(isDarkTheme, "text-slate-100", "text-slate-900")}`}>
                  {getMarkerDisplayName(row.marker, language)}
                </p>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${status.toneClass}`}>
                  {status.label}
                </span>
              </div>
              <div className={`mt-3 grid grid-cols-2 gap-2 text-xs ${tone(isDarkTheme, "text-slate-400", "text-slate-500")}`}>
                <div>
                  <p className="uppercase tracking-wide">{tr("Voor", "Before")}</p>
                  <p className={`mt-0.5 text-2xl font-semibold leading-none tabular-nums ${tone(isDarkTheme, "text-slate-200", "text-slate-800")}`}>
                    {beforeValue}
                    <span className={`ml-1 text-xs font-normal ${tone(isDarkTheme, "text-slate-400", "text-slate-500")}`}>{row.unit}</span>
                  </p>
                </div>
                <div>
                  <p className="uppercase tracking-wide">{tr("Na", "After")}</p>
                  <p className={`mt-0.5 text-2xl font-semibold leading-none tabular-nums ${tone(isDarkTheme, "text-slate-100", "text-slate-900")}`}>
                    {afterValue}
                    <span className={`ml-1 text-xs font-normal ${tone(isDarkTheme, "text-slate-400", "text-slate-500")}`}>{row.unit}</span>
                  </p>
                </div>
              </div>
              <p
                className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-base font-semibold ${
                  isDarkTheme
                    ? "border border-cyan-500/25 bg-cyan-500/10 text-cyan-100"
                    : "border border-cyan-300 bg-cyan-50 text-cyan-700"
                }`}
              >
                {renderDelta(row.deltaPct)}
              </p>
            </li>
          );
        })}
      </ul>
    )}
  </section>
);

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
                  {tr("Verandering", "Change")}: {renderDelta(row.deltaPct)}
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

  const keyMarkers = useMemo(() => {
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
            <ProtocolImpactPrimarySummaryCard
              event={selectedEvent}
              rows={selectedEvent.rows}
              language={settings.language}
              tr={tr}
              isDarkTheme={isDarkTheme}
            />
            <ProtocolImpactKeyMarkers
              event={selectedEvent}
              markers={keyMarkers}
              language={settings.language}
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
