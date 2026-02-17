import { ChevronDown } from "lucide-react";
import { DoseCorrelationInsight, ProtocolImpactDoseEvent } from "../analytics";
import { PROTOCOL_MARKER_CATEGORIES } from "../constants";
import { formatAxisTick } from "../chartHelpers";
import { getMarkerDisplayName, trLocale } from "../i18n";
import { AppLanguage, AppSettings } from "../types";
import { formatDate } from "../utils";

interface ProtocolImpactViewProps {
  protocolDoseOverview: DoseCorrelationInsight[];
  protocolDoseEvents: ProtocolImpactDoseEvent[];
  protocolWindowSize: number;
  protocolMarkerSearch: string;
  protocolCategoryFilter: "all" | "Hormones" | "Lipids" | "Hematology" | "Inflammation";
  protocolSortKey: "deltaPct" | "deltaAbs" | "marker";
  collapsedProtocolEvents: string[];
  settings: AppSettings;
  language: AppLanguage;
  onProtocolWindowSizeChange: (value: number) => void;
  onProtocolMarkerSearchChange: (value: string) => void;
  onProtocolCategoryFilterChange: (value: "all" | "Hormones" | "Lipids" | "Hematology" | "Inflammation") => void;
  onProtocolSortKeyChange: (value: "deltaPct" | "deltaAbs" | "marker") => void;
  onToggleCollapsedEvent: (eventId: string) => void;
}

const ProtocolImpactView = ({
  protocolDoseOverview,
  protocolDoseEvents,
  protocolWindowSize,
  protocolMarkerSearch,
  protocolCategoryFilter,
  protocolSortKey,
  collapsedProtocolEvents,
  settings,
  language,
  onProtocolWindowSizeChange,
  onProtocolMarkerSearchChange,
  onProtocolCategoryFilterChange,
  onProtocolSortKeyChange,
  onToggleCollapsedEvent
}: ProtocolImpactViewProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  const confidenceLabel = (value: string): string => {
    if (value === "High") {
      return tr("Hoog", "High");
    }
    if (value === "Medium") {
      return tr("Middel", "Medium");
    }
    if (value === "Low") {
      return tr("Laag", "Low");
    }
    return value;
  };

  return (
    <section className="space-y-3 fade-in">
      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
        <h3 className="text-base font-semibold text-slate-100">{tr("Protocol-impact", "Protocol Impact")}</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
          <label className="text-xs text-slate-300">
            {tr("Zoek marker", "Filter markers")}
            <input
              value={protocolMarkerSearch}
              onChange={(event) => onProtocolMarkerSearchChange(event.target.value)}
              placeholder={tr("bijv. Estradiol", "e.g. Estradiol")}
              className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900/80 px-2.5 py-1.5 text-sm text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-300">
            {tr("Window grootte", "Window size")}
            <select
              value={protocolWindowSize}
              onChange={(event) => onProtocolWindowSizeChange(Number(event.target.value))}
              className="mt-1 rounded-md border border-slate-600 bg-slate-900/80 px-2.5 py-1.5 text-sm text-slate-100"
            >
              {[1, 2, 3, 4].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-300">
            {tr("Categorie", "Category")}
            <select
              value={protocolCategoryFilter}
              onChange={(event) =>
                onProtocolCategoryFilterChange(event.target.value as "all" | "Hormones" | "Lipids" | "Hematology" | "Inflammation")
              }
              className="mt-1 rounded-md border border-slate-600 bg-slate-900/80 px-2.5 py-1.5 text-sm text-slate-100"
            >
              <option value="all">{tr("Alle categorieën", "All categories")}</option>
              <option value="Hormones">{tr("Hormonen", "Hormones")}</option>
              <option value="Lipids">{tr("Lipiden", "Lipids")}</option>
              <option value="Hematology">{tr("Hematologie", "Hematology")}</option>
              <option value="Inflammation">{tr("Ontsteking", "Inflammation")}</option>
            </select>
          </label>
        </div>

        <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800/70 p-3">
          <h4 className="text-sm font-semibold text-slate-100">{tr("Dosis-respons overzicht", "Dose Response Overview")}</h4>
          {protocolDoseOverview.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">
              {tr(
                "Nog te weinig punten (minimaal n=3 per marker) voor correlatie-overzicht.",
                "Not enough points yet (minimum n=3 per marker) for correlation overview."
              )}
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-xs text-slate-300">
              {protocolDoseOverview.map((item) => (
                <li key={item.marker}>
                  {getMarkerDisplayName(item.marker, settings.language)}{" "}
                  {item.r >= 0
                    ? tr("neigt omhoog bij hogere dosis", "tends to increase with higher dose")
                    : tr("neigt omlaag bij hogere dosis", "tends to decrease with higher dose")}{" "}
                  (r={formatAxisTick(item.r)}, n={item.n})
                </li>
              ))}
            </ul>
          )}
        </div>

        {protocolDoseEvents.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            {tr("Nog geen dosisveranderingsevents gevonden in je huidige datafilter.", "No dose change events found in your current data filter.")}
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {protocolDoseEvents.map((event) => {
              const isCollapsed = collapsedProtocolEvents.includes(event.id);
              const categorySet =
                protocolCategoryFilter === "all" ? null : new Set(PROTOCOL_MARKER_CATEGORIES[protocolCategoryFilter] ?? []);
              const query = protocolMarkerSearch.trim().toLowerCase();
              const rows = event.rows
                .filter((row) => {
                  if (categorySet && !categorySet.has(row.marker)) {
                    return false;
                  }
                  if (!query) {
                    return true;
                  }
                  const label = getMarkerDisplayName(row.marker, settings.language).toLowerCase();
                  return label.includes(query) || row.marker.toLowerCase().includes(query);
                })
                .sort((left, right) => {
                  if (protocolSortKey === "marker") {
                    return left.marker.localeCompare(right.marker);
                  }
                  if (protocolSortKey === "deltaAbs") {
                    return Math.abs(right.deltaAbs ?? -Infinity) - Math.abs(left.deltaAbs ?? -Infinity);
                  }
                  return Math.abs(right.deltaPct ?? -Infinity) - Math.abs(left.deltaPct ?? -Infinity);
                });
              return (
                <article key={event.id} className="rounded-xl border border-slate-700 bg-slate-800/70 p-3">
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                    onClick={() => onToggleCollapsedEvent(event.id)}
                  >
                    <h4 className="text-sm font-semibold text-slate-100">
                      {(event.fromDose ?? "-")} {"->"} {(event.toDose ?? "-")} mg/week
                    </h4>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-slate-400">
                        {formatDate(event.changeDate)} | {tr("Window", "Window")}: {event.beforeCount} {tr("voor", "before")} /{" "}
                        {event.afterCount} {tr("na", "after")}
                      </p>
                      <ChevronDown className={`h-4 w-4 text-slate-400 transition ${isCollapsed ? "" : "rotate-180"}`} />
                    </div>
                  </button>
                  {!isCollapsed ? (
                    <>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {event.topImpacts.length === 0 ? (
                          <span className="text-xs text-slate-400">{tr("Top impacts: onvoldoende data", "Top impacts: insufficient data")}</span>
                        ) : (
                          event.topImpacts.map((row) => (
                            <span key={`${event.id}-${row.marker}`} className="rounded-full bg-slate-900/70 px-2 py-0.5 text-xs text-cyan-200">
                              {getMarkerDisplayName(row.marker, settings.language)}{" "}
                              {row.deltaPct === null ? "-" : `${row.deltaPct > 0 ? "+" : ""}${row.deltaPct}%`}
                            </span>
                          ))
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                        <span>{tr("Sorteer op", "Sort by")}:</span>
                        <button
                          type="button"
                          className={`rounded px-2 py-0.5 ${protocolSortKey === "deltaPct" ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-900/70"}`}
                          onClick={() => onProtocolSortKeyChange("deltaPct")}
                        >
                          Δ%
                        </button>
                        <button
                          type="button"
                          className={`rounded px-2 py-0.5 ${protocolSortKey === "deltaAbs" ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-900/70"}`}
                          onClick={() => onProtocolSortKeyChange("deltaAbs")}
                        >
                          Δ
                        </button>
                        <button
                          type="button"
                          className={`rounded px-2 py-0.5 ${protocolSortKey === "marker" ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-900/70"}`}
                          onClick={() => onProtocolSortKeyChange("marker")}
                        >
                          {tr("Marker", "Marker")}
                        </button>
                      </div>
                      <div className="mt-2 overflow-x-auto rounded-lg border border-slate-700">
                        <table className="min-w-full divide-y divide-slate-700 text-xs">
                          <thead className="bg-slate-900/70 text-slate-300">
                            <tr>
                              <th className="px-2 py-1.5 text-left">{tr("Marker", "Marker")}</th>
                              <th className="px-2 py-1.5 text-right">{tr("Voor gem.", "Before avg")}</th>
                              <th className="px-2 py-1.5 text-right">{tr("Na gem.", "After avg")}</th>
                              <th className="px-2 py-1.5 text-right">Δ</th>
                              <th className="px-2 py-1.5 text-right">Δ%</th>
                              <th className="px-2 py-1.5 text-center">{tr("Trend", "Trend")}</th>
                              <th className="px-2 py-1.5 text-left">{tr("Confidence", "Confidence")}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {rows.map((row) => (
                              <tr key={`${event.id}-${row.marker}`} className="bg-slate-900/30 text-slate-200">
                                <td className="px-2 py-1.5">{getMarkerDisplayName(row.marker, settings.language)}</td>
                                <td className="px-2 py-1.5 text-right">
                                  {row.beforeAvg === null ? tr("Onvoldoende data", "Insufficient data") : `${formatAxisTick(row.beforeAvg)} ${row.unit}`}
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  {row.afterAvg === null ? tr("Onvoldoende data", "Insufficient data") : `${formatAxisTick(row.afterAvg)} ${row.unit}`}
                                </td>
                                <td className="px-2 py-1.5 text-right">{row.deltaAbs === null ? "-" : formatAxisTick(row.deltaAbs)}</td>
                                <td className="px-2 py-1.5 text-right">{row.deltaPct === null ? "-" : `${row.deltaPct > 0 ? "+" : ""}${row.deltaPct}%`}</td>
                                <td className="px-2 py-1.5 text-center">
                                  {row.trend === "up" ? "↑" : row.trend === "down" ? "↓" : row.trend === "flat" ? "→" : "·"}
                                </td>
                                <td className="px-2 py-1.5" title={row.confidenceReason}>
                                  {confidenceLabel(row.confidence)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default ProtocolImpactView;
