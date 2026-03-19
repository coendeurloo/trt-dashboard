import { useEffect, useMemo, useRef } from "react";
import { ShieldCheck } from "lucide-react";
import { MarkerAlert, MarkerSeriesPoint } from "../analytics";
import AlertTrendMiniChart from "../components/AlertTrendMiniChart";
import EmptyStateCard from "../components/EmptyStateCard";
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
  onOpenDashboard: () => void;
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
  onFocusedMarkerHandled,
  onOpenDashboard
}: AlertsViewProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const isDarkTheme = settings.theme === "dark";
  const rootRef = useRef<HTMLElement | null>(null);
  const predictiveAlerts = useMemo(
    () => buildPredictiveAlerts(alertSeriesByMarker, settings.unitSystem),
    [alertSeriesByMarker, settings.unitSystem]
  );
  const showAllClearState = alerts.length === 0 && predictiveAlerts.length === 0;

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

  const positiveSignalsSection = (
    <div
      className={
        isDarkTheme
          ? "alerts-panel-positive app-teal-glow-surface rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4"
          : "alerts-panel-positive rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      }
    >
      <h4 className={isDarkTheme ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900"}>{tr("Positieve signalen", "Positive signals")}</h4>
      <p className={isDarkTheme ? "mt-1 text-xs text-slate-400" : "mt-1 text-xs text-slate-600"}>
        {tr("Waarden of trends die momenteel gunstig ogen worden hier groen gemarkeerd.", "Values or trends that currently look favorable are shown here in green.")}
      </p>
      {positiveAlerts.length === 0 ? (
        <p className={isDarkTheme ? "mt-3 text-sm text-slate-400" : "mt-3 text-sm text-slate-600"}>
          {tr("Nog geen positieve signalen in deze filter.", "No positive signals in this filter yet.")}
        </p>
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
                <div className="space-y-2">
                  <div className="grid items-start gap-2 lg:grid-cols-[minmax(0,1fr)_176px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 text-sm font-semibold">{getMarkerDisplayName(alert.marker, language)}</p>
                        <span className="shrink-0 rounded-full border border-emerald-300/30 bg-emerald-500/20 px-2 py-0.5 text-[11px]">
                          {tr("Positief", "Positive")}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-snug">{alert.message}</p>
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
                  <div className="w-full">
                    <p className="text-xs leading-snug text-emerald-200/90">{alert.suggestion}</p>
                    <p className="mt-1 text-[11px] text-emerald-200/80">{formatDate(alert.date)}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );

  const actionableAlertsSection = (
    <div
      className={
        isDarkTheme
          ? "alerts-panel-actionable app-teal-glow-surface rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4"
          : "alerts-panel-actionable rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      }
    >
      <h4 className={isDarkTheme ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900"}>{tr("Actiegerichte alerts", "Actionable alerts")}</h4>
      <p className={isDarkTheme ? "mt-1 text-xs text-slate-400" : "mt-1 text-xs text-slate-600"}>
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
                ? isDarkTheme
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-100"
                  : "border-rose-200 bg-rose-50 text-rose-900"
                : alert.severity === "medium"
                  ? isDarkTheme
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
                    : "border-amber-200 bg-amber-50 text-amber-900"
                  : isDarkTheme
                    ? "border-slate-600 bg-slate-800/70 text-slate-100"
                    : "border-slate-200 bg-slate-50 text-slate-900";
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
                        <span className={isDarkTheme ? "rounded-full border border-white/20 bg-black/15 px-2 py-0.5" : "rounded-full border border-slate-300 bg-white px-2 py-0.5"}>
                          {alertTypeLabel(alert.type)}
                        </span>
                        <span className={isDarkTheme ? "rounded-full border border-white/20 bg-black/15 px-2 py-0.5" : "rounded-full border border-slate-300 bg-white px-2 py-0.5"}>
                          {tr("Prioriteit", "Priority")}: {alertSeverityLabel(alert.severity)}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-sm leading-snug">{alert.message}</p>
                    <div
                      className={
                        isDarkTheme
                          ? "mt-1 rounded-lg border border-white/15 bg-slate-950/30 px-2.5 py-2"
                          : "mt-1 rounded-lg border border-slate-300/80 bg-white px-2.5 py-2"
                      }
                    >
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
  );

  return (
    <section ref={rootRef} className="space-y-4 fade-in">
      <div
        className={
          isDarkTheme
            ? "alerts-hero app-teal-glow-surface rounded-2xl border border-slate-700/70 bg-gradient-to-br from-slate-900/80 via-slate-900/70 to-cyan-950/25 p-4"
            : "alerts-hero rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-cyan-50/60 p-4 shadow-sm"
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className={isDarkTheme ? "text-base font-semibold text-slate-100" : "text-base font-semibold text-slate-900"}>{tr("Alerts Centrum", "Alerts Center")}</h3>
            <p className={isDarkTheme ? "mt-0.5 text-sm text-slate-400" : "mt-0.5 text-sm text-slate-600"}>
              {tr(
                "Hier zie je prioriteitssignalen, voorspellende trends en positieve bevestigingen per marker.",
                "See prioritized signals, predictive trends, and positive confirmations per marker."
              )}
            </p>
          </div>
          {samplingControlsEnabled ? (
            <span className={isDarkTheme ? "rounded-full border border-cyan-500/40 bg-cyan-500/15 px-3 py-1 text-xs text-cyan-200" : "rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1 text-xs text-cyan-700"}>
              {tr("Filter actief", "Filter active")}: {settings.samplingFilter}
            </span>
          ) : null}
        </div>
      </div>

      {showAllClearState ? (
        <EmptyStateCard
          title={tr("Geen alerts in deze filter", "No alerts in this filter")}
          description={tr(
            "Alles ziet er stabiel uit binnen je huidige selectie. Je kunt op het dashboard een ruimer tijdsbereik of andere markers kiezen.",
            "Everything looks stable in your current selection. Use the dashboard to pick a wider range or different markers."
          )}
          actionLabel={tr("Naar dashboard", "Go to dashboard")}
          onAction={onOpenDashboard}
          icon={<ShieldCheck className={isDarkTheme ? "h-8 w-8 text-emerald-300" : "h-8 w-8 text-emerald-600"} />}
          isDarkTheme={isDarkTheme}
        />
      ) : null}

      {!showAllClearState && predictiveAlerts.length > 0 ? (
        <section
          className={
            isDarkTheme
              ? "alerts-panel-predictive app-teal-glow-surface rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4"
              : "alerts-panel-predictive rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          }
        >
          <div className="mb-4 flex items-center gap-2">
            <h4 className={isDarkTheme ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900"}>{tr("Voorspellend", "Predictive")}</h4>
            <span className={isDarkTheme ? "rounded-full bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-violet-300 ring-1 ring-violet-500/20" : "rounded-full bg-violet-50 px-2.5 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-200"}>
              {tr("Op basis van trend", "Trend-based")}
            </span>
          </div>

          <div className="space-y-3">
            {predictiveAlerts.map((alert) => (
              <article
                key={`${alert.marker}-${alert.threshold}`}
                className={
                  isDarkTheme
                    ? "alerts-card-predictive rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4"
                    : "alerts-card-predictive rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className={isDarkTheme ? "text-sm font-medium text-slate-100" : "text-sm font-medium text-slate-900"}>
                      {getMarkerDisplayName(alert.marker, language)}
                    </p>
                    <p className={isDarkTheme ? "mt-1 text-sm leading-relaxed text-slate-300" : "mt-1 text-sm leading-relaxed text-slate-700"}>
                      {language === "nl" ? alert.narrativeNl : alert.narrativeEn}
                    </p>
                    {alert.confidence === "low" ? (
                      <p className={isDarkTheme ? "mt-1.5 text-[11px] text-slate-500" : "mt-1.5 text-[11px] text-slate-600"}>
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
                        ? isDarkTheme
                          ? "shrink-0 rounded-lg bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-200 ring-1 ring-amber-500/25"
                          : "shrink-0 rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200"
                        : isDarkTheme
                          ? "shrink-0 rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-300 ring-1 ring-slate-700"
                          : "shrink-0 rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 ring-1 ring-slate-200"
                    }
                  >
                    ~{Math.max(1, Math.round(alert.daysUntil / 30))}
                    {tr("mnd", "mo")}
                  </span>
                </div>
              </article>
            ))}
          </div>

          <p className={isDarkTheme ? "mt-3 text-[10px] text-slate-500" : "mt-3 text-[10px] text-slate-600"}>
            {tr("Lineaire extrapolatie. Geen medisch advies.", "Linear extrapolation. Not medical advice.")}
          </p>
        </section>
      ) : null}

      {!showAllClearState ? actionableAlertsSection : null}
      {!showAllClearState ? positiveSignalsSection : null}

    </section>
  );
};

export default AlertsView;
