import { useMemo } from "react";
import { DoseCorrelationInsight, ProtocolImpactDoseEvent } from "../analytics";
import { formatAxisTick } from "../chartHelpers";
import ProtocolImpactEventCard from "../components/ProtocolImpactEventCard";
import { trLocale } from "../i18n";
import { AppLanguage, AppSettings } from "../types";
import { formatDate } from "../utils";

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
  void protocolDoseOverview;
  void protocolWindowSize;
  void protocolMarkerSearch;
  void protocolCategoryFilter;
  void onProtocolWindowSizeChange;
  void onProtocolMarkerSearchChange;
  void onProtocolCategoryFilterChange;
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  const eventAnchors = useMemo(() => {
    const formatDose = (value: number | null): string => (value === null ? "?" : `${formatAxisTick(value)} mg/wk`);
    const formatFrequency = (value: number | null): string => (value === null ? "?" : `${formatAxisTick(value)}/wk`);
    const baselineLabel = tr("baseline", "baseline");

    return protocolDoseEvents.map((event, index) => {
      const safeId = event.id.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
      const anchorId = `protocol-impact-event-${index}-${safeId}`;
      const dateLabel = formatDate(event.changeDate);

      let label = "";
      if (event.eventType === "dose") {
        label = `${dateLabel} · ${formatDose(event.fromDose)} → ${formatDose(event.toDose)}`;
      } else if (event.eventType === "frequency") {
        label = `${dateLabel} · ${formatFrequency(event.fromFrequency)} → ${formatFrequency(event.toFrequency)}`;
      } else if (event.eventType === "compound") {
        const fromCompound = event.fromCompounds[0] || baselineLabel;
        const toCompound = event.toCompounds[0] || "?";
        label = `${dateLabel} · ${fromCompound} → ${toCompound}`;
      } else {
        label = `${dateLabel} · ${tr("Protocol update", "Protocol update")}`;
      }

      return {
        anchorId,
        label
      };
    });
  }, [protocolDoseEvents, tr]);

  return (
    <section className="space-y-3 fade-in">
      <div className="protocol-impact-premium-shell rounded-2xl border p-4">
        <div className="protocol-impact-header-minimal">
          <h3 className="text-base font-semibold text-slate-100">{tr("Protocol Impact", "Protocol Impact")}</h3>
          <p className="mt-1 text-sm text-slate-300">
            {tr(
              "Per protocolwijziging zie je wat er echt veranderde in je metingen.",
              "For each protocol change, you see what factually changed in your measurements."
            )}
          </p>
        </div>

        {eventAnchors.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
              {tr("Spring naar wijziging", "Jump to change")}
            </p>
            <div className="protocol-impact-jumpbar flex gap-2 overflow-x-auto pb-1">
              {eventAnchors.map((item) => (
                <a
                  key={item.anchorId}
                  href={`#${item.anchorId}`}
                  className="protocol-impact-jump-chip inline-flex items-center rounded-full border px-3 py-1.5 text-xs text-slate-200"
                  title={item.label}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {protocolDoseEvents.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            {tr(
              "Nog geen protocolwijziging met bruikbare voor/na-data gevonden.",
              "No protocol-change events with usable before/after data were found."
            )}
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {protocolDoseEvents.map((event, index) => {
              const anchorId = eventAnchors[index]?.anchorId ?? `protocol-impact-event-${index}`;

              return (
                <div key={event.id} id={anchorId} className="protocol-impact-event-anchor scroll-mt-24">
                  <ProtocolImpactEventCard
                    event={event}
                    rows={event.rows}
                    settings={settings}
                    language={language}
                  />
                </div>
              );
            })}
          </div>
        )}

        <details className="protocol-impact-footer-note mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <summary className="cursor-pointer list-none font-medium text-amber-100">{tr("Medische noot", "Medical note")}</summary>
          <p className="mt-2">
            {tr(
              "Deze inzichten gebruiken echte metingen uit je labrapporten. De verandering na een protocolwijziging is feitelijk gemeten. Of die verandering volledig door het protocol komt, blijft een inschatting, omdat ook timing, supplementen, klachten en normale schommelingen invloed kunnen hebben.",
              "These insights use real measurements from your lab reports. The change after a protocol adjustment is factually measured. Whether that change is fully caused by the protocol remains an estimate, because timing, supplements, symptoms, and normal variability can also influence results."
            )}
          </p>
        </details>
      </div>
    </section>
  );
};

export default ProtocolImpactView;
