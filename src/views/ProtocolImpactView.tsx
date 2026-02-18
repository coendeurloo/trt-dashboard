import { useMemo } from "react";
import { DoseCorrelationInsight, ProtocolImpactDoseEvent } from "../analytics";
import ProtocolImpactEventCard from "../components/ProtocolImpactEventCard";
import { PROTOCOL_MARKER_CATEGORIES } from "../constants";
import { formatAxisTick } from "../chartHelpers";
import { getMarkerDisplayName, trLocale } from "../i18n";
import { AppLanguage, AppSettings } from "../types";

interface ProtocolImpactViewProps {
  protocolDoseOverview: DoseCorrelationInsight[];
  protocolDoseEvents: ProtocolImpactDoseEvent[];
  protocolWindowSize: number;
  protocolMarkerSearch: string;
  protocolCategoryFilter: "all" | "Hormones" | "Lipids" | "Hematology" | "Inflammation";
  settings: AppSettings;
  language: AppLanguage;
  onProtocolWindowSizeChange: (value: number) => void;
  onProtocolMarkerSearchChange: (value: string) => void;
  onProtocolCategoryFilterChange: (value: "all" | "Hormones" | "Lipids" | "Hematology" | "Inflammation") => void;
}

const ProtocolImpactView = ({
  protocolDoseOverview,
  protocolDoseEvents,
  protocolWindowSize,
  protocolMarkerSearch,
  protocolCategoryFilter,
  settings,
  language,
  onProtocolWindowSizeChange,
  onProtocolMarkerSearchChange,
  onProtocolCategoryFilterChange
}: ProtocolImpactViewProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  const categorySet = useMemo(
    () => (protocolCategoryFilter === "all" ? null : new Set(PROTOCOL_MARKER_CATEGORIES[protocolCategoryFilter] ?? [])),
    [protocolCategoryFilter]
  );

  const markerQuery = protocolMarkerSearch.trim().toLowerCase();

  const doseContextByMarker = useMemo(() => {
    return protocolDoseOverview.reduce<Record<string, string>>((acc, item) => {
      const markerLabel = getMarkerDisplayName(item.marker, language);
      const direction =
        item.r >= 0
          ? tr("neigt omhoog bij hogere dosis", "tends to increase with higher dose")
          : tr("neigt omlaag bij hogere dosis", "tends to decrease with higher dose");
      acc[item.marker] = `${tr("Dosis-context", "Dose context")}: ${markerLabel} ${direction} (r=${formatAxisTick(item.r)}, n=${item.n})`;
      return acc;
    }, {});
  }, [protocolDoseOverview, language, tr]);

  return (
    <section className="space-y-3 fade-in">
      <div className="protocol-impact-premium-shell rounded-2xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-100">{tr("Protocol Impact Timeline", "Protocol Impact Timeline")}</h3>
            <p className="mt-1 text-sm text-slate-300">
              {tr(
                "Per protocolwijziging zie je in gewone taal wat feitelijk veranderde en hoe dat mogelijk samenhangt met je protocol.",
                "For each protocol change, you see in plain language what changed factually and how that may relate to your protocol."
              )}
            </p>
            <p className="mt-2 text-xs text-slate-300">
              <strong>{tr("Zo lees je dit", "How to read this")}:</strong>{" "}
              {tr(
                "Gemeten veranderingen zijn feiten. De koppeling aan je protocol is een inschatting, omdat timing, supplementen, klachten en normale schommelingen ook invloed kunnen hebben.",
                "Measured changes are facts. The link to your protocol is an estimate, because timing, supplements, symptoms, and normal variability can also influence results."
              )}
            </p>
          </div>
          <div className="medical-disclaimer rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <strong>{tr("Medische disclaimer", "Medical disclaimer")}: </strong>
            {tr(
              "Deze inzichten gebruiken echte metingen uit je labrapporten. De verandering na een protocolwijziging is feitelijk gemeten. Of die verandering volledig door het protocol komt, blijft een inschatting, omdat ook timing, supplementen, klachten en normale schommelingen invloed kunnen hebben.",
              "These insights use real measurements from your lab reports. The change after a protocol adjustment is factually measured. Whether that change is fully caused by the protocol remains an estimate, because timing, supplements, symptoms, and normal variability can also influence results."
            )}
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
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

        <details className="mt-2 rounded-xl border border-slate-700/70 bg-slate-900/35 p-3 text-xs text-slate-300">
          <summary className="cursor-pointer list-none font-medium text-slate-200">{tr("Advanced", "Advanced")}</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-[auto_auto] sm:items-end">
            <label>
              {tr("Venstergrootte", "Window size")}
              <select
                value={protocolWindowSize}
                onChange={(event) => onProtocolWindowSizeChange(Number(event.target.value))}
                className="mt-1 block rounded-md border border-slate-600 bg-slate-900/80 px-2.5 py-1.5 text-sm text-slate-100"
              >
                {[30, 45, 60].map((value) => (
                  <option key={value} value={value}>
                    {value} {tr("dagen", "days")}
                  </option>
                ))}
              </select>
            </label>
            <span className="rounded-full border border-slate-600 px-2 py-0.5">Lag: 10-28 {tr("dagen", "days")}</span>
          </div>
        </details>

        {protocolDoseEvents.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            {tr(
              "Nog geen protocolwijziging met bruikbare voor/na-data gevonden in je huidige filter.",
              "No protocol-change events with usable before/after data were found in your current filter."
            )}
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {protocolDoseEvents.map((event) => {
              const filteredRows = event.rows.filter((row) => {
                if (categorySet && !categorySet.has(row.marker)) {
                  return false;
                }
                if (!markerQuery) {
                  return true;
                }
                const label = getMarkerDisplayName(row.marker, settings.language).toLowerCase();
                return label.includes(markerQuery) || row.marker.toLowerCase().includes(markerQuery);
              });

              return (
                <ProtocolImpactEventCard
                  key={event.id}
                  event={event}
                  rows={filteredRows}
                  settings={settings}
                  language={language}
                  doseContextByMarker={doseContextByMarker}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default ProtocolImpactView;
