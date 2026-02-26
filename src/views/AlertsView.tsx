import { useEffect, useMemo, useRef } from "react";
import { MarkerAlert, MarkerSeriesPoint } from "../analytics";
import AlertTrendMiniChart from "../components/AlertTrendMiniChart";
import { getMarkerDisplayName, trLocale } from "../i18n";
import { buildPredictiveAlerts } from "../predictiveTrends";
import { AppLanguage, AppSettings } from "../types";
import { formatDate } from "../utils";

interface AlertsViewProps {
  alerts: MarkerAlert[];
  actionableAlerts: MarkerAlert[];
  positiveAlerts: MarkerAlert[];
  alertSeriesByMarker: Record<string, MarkerSeriesPoint[]>;
  settings: AppSettings;
  language: AppLanguage;
  samplingControlsEnabled: boolean;
  focusedMarker: string | null;
  onFocusedMarkerHandled: () => void;
}

const AlertsView = ({
  alerts,
  actionableAlerts,
  positiveAlerts,
  alertSeriesByMarker,
  settings,
  language,
  samplingControlsEnabled,
  focusedMarker,
  onFocusedMarkerHandled
}: AlertsViewProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const rootRef = useRef<HTMLElement | null>(null);
  const predictiveAlerts = useMemo(
    () => buildPredictiveAlerts(alertSeriesByMarker, settings.unitSystem),
    [alertSeriesByMarker, settings.unitSystem]
  );

  const alertSeverityLabel = (severity: "high" | "medium" | "low"): string => {
    if (severity === "high") {
      return tr("hoog", "high");
    }
    if (severity === "medium") {
      return tr("middel", "medium");
    }
    return tr("laag", "low");
  };

  const alertTypeLabel = (type: "threshold" | "trend"): string => {
    if (type === "threshold") {
      return tr("Drempel", "Threshold");
    }
    return tr("Trend", "Trend");
  };

  useEffect(() => {
    if (!focusedMarker || !rootRef.current) {
      return;
    }
    const markerKey = focusedMarker.toLowerCase();
    const cards = Array.from(rootRef.current.querySelectorAll<HTMLElement>("[data-alert-marker]"));
    const target = cards.find((card) => (card.dataset.alertMarker ?? "").toLowerCase() === markerKey) ?? null;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    onFocusedMarkerHandled();
  }, [focusedMarker, onFocusedMarkerHandled]);

  return (
    <section ref={rootRef} className="space-y-4 fade-in">
      <div className="alerts-hero rounded-2xl border border-slate-700/70 bg-gradient-to-br from-slate-900/80 via-slate-900/70 to-cyan-950/25 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-100">{tr("Alerts Centrum", "Alerts Center")}</h3>
            <p className="mt-1 text-sm text-slate-400">
              {tr("Signalen met context en suggesties om met je arts te bespreken.", "Signals with context and discussion suggestions for your doctor.")}
            </p>
          </div>
          {samplingControlsEnabled ? (
            <span className="rounded-full border border-cyan-500/40 bg-cyan-500/15 px-3 py-1 text-xs text-cyan-200">
              {tr("Filter actief", "Filter active")}: {settings.samplingFilter}
            </span>
          ) : null}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
            <p className="text-xs uppercase tracking-wide text-rose-200">{tr("Actie nodig", "Action needed")}</p>
            <p className="mt-1 text-2xl font-semibold text-rose-100">{actionableAlerts.length}</p>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
            <p className="text-xs uppercase tracking-wide text-emerald-200">{tr("Positieve signalen", "Positive signals")}</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-100">{positiveAlerts.length}</p>
          </div>
          <div className="rounded-xl border border-slate-600 bg-slate-800/70 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-300">{tr("Totaal", "Total alerts")}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-100">{alerts.length}</p>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-900/60 p-3 text-xs text-slate-300">
          {tr(
            "Leesvolgorde: 1) bekijk eerst 'Voorspellend', 2) ga daarna naar 'Actie nodig', 3) gebruik 'Positieve signalen' als bevestiging.",
            "Reading order: 1) review 'Predictive' first, 2) then review 'Action needed', 3) use 'Positive signals' as confirmation."
          )}
        </div>
      </div>

      {predictiveAlerts.length > 0 ? (
        <section className="alerts-panel-predictive rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
          <div className="mb-4 flex items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-100">{tr("Voorspellend", "Predictive")}</h4>
            <span className="rounded-full bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-violet-300 ring-1 ring-violet-500/20">
              {tr("Op basis van trend", "Trend-based")}
            </span>
          </div>

          <div className="space-y-3">
            {predictiveAlerts.map((alert) => (
              <article
                key={`${alert.marker}-${alert.threshold}`}
                className="alerts-card-predictive rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-100">
                      {getMarkerDisplayName(alert.marker, language)}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-300">
                      {language === "nl" ? alert.narrativeNl : alert.narrativeEn}
                    </p>
                    {alert.confidence === "low" ? (
                      <p className="mt-1.5 text-[11px] text-slate-500">
                        {tr(
                          "Gebaseerd op slechts 2 metingen. Meer metingen maken deze projectie betrouwbaarder.",
                          "Based on only 2 data points. More measurements make this projection more reliable."
                        )}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={
                      alert.daysUntil <= 60
                        ? "shrink-0 rounded-lg bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-200 ring-1 ring-amber-500/25"
                        : "shrink-0 rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-300 ring-1 ring-slate-700"
                    }
                  >
                    ~{Math.max(1, Math.round(alert.daysUntil / 30))}
                    {tr("mnd", "mo")}
                  </span>
                </div>
              </article>
            ))}
          </div>

          <p className="mt-4 text-[11px] text-slate-500">
            {tr(
              "Projecties zijn gebaseerd op lineaire extrapolatie van je meetgeschiedenis en houden geen rekening met protocolwijzigingen of leefstijlfactoren. Geen medisch advies.",
              "Projections are based on linear extrapolation of your measurement history and do not account for protocol changes or lifestyle factors. Not medical advice."
            )}
          </p>
        </section>
      ) : null}

      <div className="alerts-panel-positive rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
        <h4 className="text-sm font-semibold text-slate-100">{tr("Positieve signalen", "Positive signals")}</h4>
        <p className="mt-1 text-xs text-slate-400">
          {tr("Waarden of trends die momenteel gunstig ogen worden hier groen gemarkeerd.", "Values or trends that currently look favorable are shown here in green.")}
        </p>
        {positiveAlerts.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">{tr("Nog geen positieve signalen in deze filter.", "No positive signals in this filter yet.")}</p>
        ) : (
          <div className="mt-3 columns-1 [column-gap:0.75rem] md:columns-2 2xl:columns-3">
            {positiveAlerts.map((alert) => {
              const series = alertSeriesByMarker[alert.marker] ?? [];
              return (
                <article
                  key={alert.id}
                  data-alert-marker={alert.marker}
                  className={`alerts-card-positive positive-alert-card mb-3 break-inside-avoid rounded-xl border bg-emerald-500/10 p-3 text-emerald-100 ${
                    focusedMarker?.toLowerCase() === alert.marker.toLowerCase() ? "border-cyan-400/70 ring-2 ring-cyan-400/35" : "border-emerald-500/35"
                  }`}
                >
                  <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_190px]">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{getMarkerDisplayName(alert.marker, language)}</p>
                        <span className="rounded-full border border-emerald-300/30 bg-emerald-500/20 px-2 py-0.5 text-[11px]">
                          {tr("Positief", "Positive")}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-snug">{alert.message}</p>
                      <p className="mt-1 text-xs leading-snug text-emerald-200/90">{alert.suggestion}</p>
                      <p className="mt-1 text-[11px] text-emerald-200/80">{formatDate(alert.date)}</p>
                    </div>
                    <div>
                      <AlertTrendMiniChart
                        marker={alert.marker}
                        points={series}
                        highlightDate={alert.date}
                        language={language}
                        height={100}
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="alerts-panel-actionable rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
        <h4 className="text-sm font-semibold text-slate-100">{tr("Actiegerichte alerts", "Actionable alerts")}</h4>
        <p className="mt-1 text-xs text-slate-400">
          {tr("Dit zijn signalen waarbij vaak een bespreekactie of extra monitoring zinvol is.", "These signals often benefit from discussion or additional monitoring.")}
        </p>
        {actionableAlerts.length === 0 ? (
          <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-4 text-sm text-emerald-200">
            {tr(
              "Geen alerts met directe actie in de huidige filter. Dat is meestal een goed teken.",
              "No action-needed alerts in the current filter. That is usually a good sign."
            )}
          </div>
        ) : (
          <div className="mt-3 columns-1 [column-gap:0.75rem] xl:columns-2">
            {actionableAlerts.map((alert) => {
              const cardClass =
                alert.severity === "high"
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-100"
                  : alert.severity === "medium"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
                    : "border-slate-600 bg-slate-800/70 text-slate-100";
              const series = alertSeriesByMarker[alert.marker] ?? [];
              return (
                <article
                  key={alert.id}
                  data-alert-marker={alert.marker}
                  className={`alerts-card-actionable mb-3 break-inside-avoid rounded-xl border p-3 shadow-soft ${cardClass} ${
                    focusedMarker?.toLowerCase() === alert.marker.toLowerCase() ? "border-cyan-400/70 ring-2 ring-cyan-400/35" : ""
                  }`}
                >
                  <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_200px]">
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{getMarkerDisplayName(alert.marker, language)}</p>
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <span className="rounded-full border border-white/20 bg-black/15 px-2 py-0.5">
                            {alertTypeLabel(alert.type)}
                          </span>
                          <span className="rounded-full border border-white/20 bg-black/15 px-2 py-0.5">
                            {tr("Prioriteit", "Priority")}: {alertSeverityLabel(alert.severity)}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 text-sm leading-snug">{alert.message}</p>
                      <div className="mt-1 rounded-lg border border-white/15 bg-slate-950/30 px-2.5 py-2">
                        <p className="text-[11px] uppercase tracking-wide opacity-80">
                          {tr("Mogelijke bespreekactie", "Suggested discussion action")}
                        </p>
                        <p className="mt-1 text-xs leading-snug">{alert.suggestion}</p>
                      </div>
                      <p className="mt-1 text-[11px] opacity-75">{formatDate(alert.date)}</p>
                    </div>
                    <div>
                      <AlertTrendMiniChart
                        marker={alert.marker}
                        points={series}
                        highlightDate={alert.date}
                        language={language}
                        height={100}
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

    </section>
  );
};

export default AlertsView;
