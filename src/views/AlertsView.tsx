import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkerAlert, MarkerSeriesPoint } from "../analytics";
import AlertTrendMiniChart from "../components/AlertTrendMiniChart";
import EmptyStateCard from "../components/EmptyStateCard";
import { MARKER_DATABASE } from "../data/markerDatabase";
import { getMarkerDisplayName, trLocale } from "../i18n";
import { normalizeMarkerLookupKey } from "../markerNormalization";
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

/* ─── Category helpers ─── */

const CATEGORY_ORDER = [
  "Liver Function",
  "Hormones - Sex",
  "Hormones - Adrenal",
  "Metabolic Health",
  "Blood Glucose",
  "Complete Blood Count",
  "Kidney Function",
  "Thyroid",
  "Inflammatory Markers",
  "Iron Studies",
  "Vitamins & Minerals",
  "Electrolytes",
  "Coagulation",
  "Enzymes",
  "Other"
] as const;

const buildCategoryLookup = (): Map<string, string> => {
  const lookup = new Map<string, string>();
  MARKER_DATABASE.forEach((entry) => {
    [entry.canonicalName, ...entry.aliases].forEach((alias) => {
      const key = normalizeMarkerLookupKey(alias);
      if (key) {
        lookup.set(key, entry.category);
      }
    });
  });
  return lookup;
};

const getCategoryLabel = (
  category: string,
  tr: (nl: string, en: string) => string
): string => {
  switch (category) {
    case "Hormones - Sex": return tr("Geslachtshormonen", "Hormones");
    case "Hormones - Adrenal": return tr("Bijnierhormonen", "Adrenal");
    case "Thyroid": return tr("Schildklier", "Thyroid");
    case "Complete Blood Count": return tr("Bloedbeeld", "Blood Count");
    case "Inflammatory Markers": return tr("Ontsteking", "Inflammation");
    case "Coagulation": return tr("Stolling", "Coagulation");
    case "Metabolic Health": return tr("Metabool", "Metabolic");
    case "Blood Glucose": return tr("Glucose", "Glucose");
    case "Liver Function": return tr("Lever", "Liver");
    case "Kidney Function": return tr("Nieren", "Kidney");
    case "Electrolytes": return tr("Elektrolyten", "Electrolytes");
    case "Enzymes": return tr("Enzymen", "Enzymes");
    case "Vitamins & Minerals": return tr("Vitamines", "Vitamins");
    case "Iron Studies": return tr("IJzer", "Iron");
    default: return tr("Overig", "Other");
  }
};

/* ─── Severity helpers ─── */

const severityWeight = (severity: "high" | "medium" | "low"): number =>
  severity === "high" ? 3 : severity === "medium" ? 2 : 1;

const parseDate = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

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
  const tr = useCallback((nl: string, en: string): string => trLocale(language, nl, en), [language]);
  const isDarkTheme = settings.theme === "dark";
  const rootRef = useRef<HTMLElement | null>(null);
  const [expandedAlerts, setExpandedAlerts] = useState<Record<string, boolean>>({});
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [predictiveExpanded, setPredictiveExpanded] = useState(false);
  const [positiveExpanded, setPositiveExpanded] = useState(false);

  const predictiveAlerts = useMemo(
    () => buildPredictiveAlerts(alertSeriesByMarker, settings.unitSystem),
    [alertSeriesByMarker, settings.unitSystem]
  );
  const showAllClearState = alerts.length === 0 && predictiveAlerts.length === 0;

  const categoryLookup = useMemo(() => buildCategoryLookup(), []);

  const resolveCategory = useCallback((marker: string): string => {
    const key = normalizeMarkerLookupKey(marker);
    return categoryLookup.get(key) ?? "Other";
  }, [categoryLookup]);

  /* Sort actionable alerts: severity desc, then date desc */
  const sortedActionableAlerts = useMemo(
    () =>
      [...actionableAlerts].sort((left, right) => {
        const severityDiff = severityWeight(right.severity) - severityWeight(left.severity);
        if (severityDiff !== 0) return severityDiff;
        return parseDate(right.date) - parseDate(left.date);
      }),
    [actionableAlerts]
  );

  /* Top 3 = featured, rest grouped by category */
  const topAlerts = sortedActionableAlerts.slice(0, 3);
  const remainingAlerts = sortedActionableAlerts.slice(3);

  /* Auto-expand the first top alert so users discover the expand pattern */
  const autoExpandedRef = useRef<string | null>(null);
  const firstAlertId = topAlerts[0]?.id ?? null;
  useEffect(() => {
    if (firstAlertId && autoExpandedRef.current !== firstAlertId) {
      autoExpandedRef.current = firstAlertId;
      setExpandedAlerts((c) => ({ ...c, [firstAlertId]: true }));
    }
  }, [firstAlertId]);

  /* Group remaining alerts by body-system category */
  const groupedRemaining = useMemo(() => {
    const groups: Record<string, MarkerAlert[]> = {};
    remainingAlerts.forEach((alert) => {
      const cat = resolveCategory(alert.marker);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(alert);
    });
    return CATEGORY_ORDER
      .filter((cat) => groups[cat] && groups[cat].length > 0)
      .map((cat) => ({ category: cat, label: getCategoryLabel(cat, tr), alerts: groups[cat] }));
  }, [remainingAlerts, resolveCategory, tr]);

  /* Executive summary one-liner */
  const buildSummaryLine = (): string => {
    if (topAlerts.length === 0) {
      return tr("Geen biomarkers vragen directe aandacht.", "No biomarkers need immediate attention.");
    }
    const parts = topAlerts.map((a) => {
      const name = getMarkerDisplayName(a.marker, language);
      const changeMatch = a.message.match(/([+-]?\d+[\.,]?\d*%)/);
      return changeMatch ? `${name} (${changeMatch[1]})` : name;
    });
    if (parts.length === 1) {
      return tr(`Belangrijkste signaal: ${parts[0]}.`, `Top signal: ${parts[0]}.`);
    }
    const last = parts.pop();
    return tr(
      `Belangrijkste signalen: ${parts.join(", ")} en ${last}.`,
      `Top signals: ${parts.join(", ")} and ${last}.`
    );
  };

  /* Focus handling: scroll to card + expand it */
  useEffect(() => {
    if (!focusedMarker || !rootRef.current) return;
    const markerKey = focusedMarker.toLowerCase();

    const matchingActionable = sortedActionableAlerts.find((a) => a.marker.toLowerCase() === markerKey) ?? null;
    const matchingPositive = positiveAlerts.find((a) => a.marker.toLowerCase() === markerKey) ?? null;

    if (matchingActionable) {
      setExpandedAlerts((c) => ({ ...c, [matchingActionable.id]: true }));
      const cat = resolveCategory(matchingActionable.marker);
      setExpandedCategories((c) => ({ ...c, [cat]: true }));
    }
    if (matchingPositive) {
      setExpandedAlerts((c) => ({ ...c, [matchingPositive.id]: true }));
      setPositiveExpanded(true);
    }

    const cards = Array.from(rootRef.current.querySelectorAll<HTMLElement>("[data-alert-marker]"));
    const target = cards.find((card) => (card.dataset.alertMarker ?? "").toLowerCase() === markerKey) ?? null;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    onFocusedMarkerHandled();
  }, [focusedMarker, onFocusedMarkerHandled, positiveAlerts, resolveCategory, sortedActionableAlerts]);

  const toggleExpanded = (alertId: string) => {
    setExpandedAlerts((c) => ({ ...c, [alertId]: !c[alertId] }));
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((c) => ({ ...c, [category]: !c[category] }));
  };

  /* ─── Severity dot ─── */
  const severityDot = (severity: "high" | "medium" | "low") => {
    const color = severity === "high" ? "bg-rose-500" : severity === "medium" ? "bg-amber-500" : "bg-slate-400";
    return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
  };

  /* ─── Top alert card: featured, clickable, with expand ─── */
  const renderTopCard = (alert: MarkerAlert) => {
    const isExpanded = Boolean(expandedAlerts[alert.id]);
    const series = alertSeriesByMarker[alert.marker] ?? [];
    const isFocused = focusedMarker?.toLowerCase() === alert.marker.toLowerCase();
    const borderColor =
      alert.severity === "high"
        ? isDarkTheme ? "border-rose-500/50" : "border-rose-300"
        : alert.severity === "medium"
          ? isDarkTheme ? "border-amber-500/40" : "border-amber-300"
          : isDarkTheme ? "border-slate-600" : "border-slate-200";
    const bgColor =
      alert.severity === "high"
        ? isDarkTheme ? "bg-rose-500/8" : "bg-rose-50/80"
        : alert.severity === "medium"
          ? isDarkTheme ? "bg-amber-500/8" : "bg-amber-50/80"
          : isDarkTheme ? "bg-slate-800/60" : "bg-slate-50";

    return (
      <article
        key={alert.id}
        data-alert-marker={alert.marker}
        className={`rounded-xl border ${borderColor} ${bgColor} p-3 transition cursor-pointer ${isFocused ? "ring-2 ring-cyan-400/35" : ""}`}
        onClick={() => toggleExpanded(alert.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpanded(alert.id); } }}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2.5">
          {severityDot(alert.severity)}
          <p className={isDarkTheme ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900"}>
            {getMarkerDisplayName(alert.marker, language)}
          </p>
          <span className={isDarkTheme ? "ml-auto text-xs text-slate-400" : "ml-auto text-xs text-slate-500"}>
            {formatDate(alert.date)}
          </span>
          {isExpanded
            ? <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-40" />
            : <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-40" />}
        </div>
        <p className={isDarkTheme ? "mt-1.5 text-sm leading-snug text-slate-300" : "mt-1.5 text-sm leading-snug text-slate-700"}>
          {alert.message}
        </p>

        {isExpanded && (
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px]">
            <div className={isDarkTheme ? "rounded-lg border border-white/10 bg-slate-950/30 px-3 py-2" : "rounded-lg border border-slate-200 bg-white px-3 py-2"}>
              <p className="text-[11px] uppercase tracking-wide opacity-75">{tr("Klinische context", "Clinical context")}</p>
              <p className="mt-1 text-xs leading-snug">{alert.suggestion}</p>
            </div>
            <div>
              <AlertTrendMiniChart marker={alert.marker} points={series} highlightDate={alert.date} language={language} height={100} />
            </div>
          </div>
        )}
      </article>
    );
  };

  /* ─── Compact alert row: for remaining alerts in category groups ─── */
  const renderCompactRow = (alert: MarkerAlert) => {
    const isExpanded = Boolean(expandedAlerts[alert.id]);
    const series = alertSeriesByMarker[alert.marker] ?? [];
    const isFocused = focusedMarker?.toLowerCase() === alert.marker.toLowerCase();

    return (
      <div
        key={alert.id}
        data-alert-marker={alert.marker}
        role="button"
        tabIndex={0}
        onClick={() => toggleExpanded(alert.id)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpanded(alert.id); } }}
        aria-expanded={isExpanded}
        className={`rounded-lg cursor-pointer transition ${isFocused ? "ring-2 ring-cyan-400/35" : ""} ${
          isDarkTheme ? "hover:bg-slate-800/60" : "hover:bg-slate-50"
        }`}
      >
        <div className="px-3 py-2 flex items-center gap-2.5">
          {severityDot(alert.severity)}
          <span className={isDarkTheme ? "text-sm text-slate-200" : "text-sm text-slate-800"}>
            {getMarkerDisplayName(alert.marker, language)}
          </span>
          <span className={isDarkTheme ? "text-xs text-slate-500 hidden sm:inline truncate max-w-[280px]" : "text-xs text-slate-400 hidden sm:inline truncate max-w-[280px]"}>
            {alert.message}
          </span>
          <span className={isDarkTheme ? "ml-auto text-[11px] text-slate-500 shrink-0" : "ml-auto text-[11px] text-slate-400 shrink-0"}>
            {formatDate(alert.date)}
          </span>
          {isExpanded
            ? <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-40" />
            : <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-40" />}
        </div>

        {isExpanded && (
          <div className={`mx-3 mb-2 mt-1 grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px] rounded-lg p-3 ${
            isDarkTheme ? "bg-slate-800/40 border border-white/5" : "bg-slate-50 border border-slate-100"
          }`}>
            <div>
              <p className={isDarkTheme ? "text-sm leading-snug text-slate-300" : "text-sm leading-snug text-slate-700"}>
                {alert.message}
              </p>
              <div className={`mt-2 rounded-lg px-3 py-2 ${isDarkTheme ? "bg-slate-950/40 border border-white/5" : "bg-white border border-slate-200"}`}>
                <p className="text-[11px] uppercase tracking-wide opacity-60">{tr("Klinische context", "Clinical context")}</p>
                <p className="mt-1 text-xs leading-snug opacity-80">{alert.suggestion}</p>
              </div>
            </div>
            <div>
              <AlertTrendMiniChart marker={alert.marker} points={series} highlightDate={alert.date} language={language} height={100} />
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ─── Positive alert row ─── */
  const renderPositiveRow = (alert: MarkerAlert) => {
    const isExpanded = Boolean(expandedAlerts[alert.id]);
    const series = alertSeriesByMarker[alert.marker] ?? [];
    const isFocused = focusedMarker?.toLowerCase() === alert.marker.toLowerCase();

    return (
      <div
        key={alert.id}
        data-alert-marker={alert.marker}
        role="button"
        tabIndex={0}
        onClick={() => toggleExpanded(alert.id)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpanded(alert.id); } }}
        aria-expanded={isExpanded}
        className={`rounded-lg cursor-pointer transition ${isFocused ? "ring-2 ring-cyan-400/35" : ""} ${
          isDarkTheme ? "hover:bg-emerald-500/5" : "hover:bg-emerald-50/50"
        }`}
      >
        <div className="px-3 py-2 flex items-center gap-2.5">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
          <span className={isDarkTheme ? "text-sm text-emerald-200" : "text-sm text-emerald-800"}>
            {getMarkerDisplayName(alert.marker, language)}
          </span>
          <span className={isDarkTheme ? "text-xs text-slate-500 hidden sm:inline truncate max-w-[280px]" : "text-xs text-slate-400 hidden sm:inline truncate max-w-[280px]"}>
            {alert.message}
          </span>
          <span className={isDarkTheme ? "ml-auto text-[11px] text-slate-500 shrink-0" : "ml-auto text-[11px] text-slate-400 shrink-0"}>
            {formatDate(alert.date)}
          </span>
          {isExpanded
            ? <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-40" />
            : <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-40" />}
        </div>

        {isExpanded && (
          <div className={`mx-3 mb-2 mt-1 grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px] rounded-lg p-3 ${
            isDarkTheme ? "bg-emerald-500/5 border border-emerald-500/10" : "bg-emerald-50/50 border border-emerald-100"
          }`}>
            <div>
              <p className={isDarkTheme ? "text-sm leading-snug text-slate-300" : "text-sm leading-snug text-slate-700"}>
                {alert.message}
              </p>
              {alert.suggestion && (
                <div className={`mt-2 rounded-lg px-3 py-2 ${isDarkTheme ? "bg-slate-950/40 border border-white/5" : "bg-white border border-slate-200"}`}>
                  <p className="text-[11px] uppercase tracking-wide opacity-60">{tr("Klinische context", "Clinical context")}</p>
                  <p className="mt-1 text-xs leading-snug opacity-80">{alert.suggestion}</p>
                </div>
              )}
            </div>
            <div>
              <AlertTrendMiniChart marker={alert.marker} points={series} highlightDate={alert.date} language={language} height={100} />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <section ref={rootRef} className="space-y-4 fade-in">
      {/* ─── Executive Summary ─── */}
      <div
        className={
          isDarkTheme
            ? "alerts-hero app-teal-glow-surface rounded-2xl border border-slate-700/70 bg-gradient-to-br from-slate-900/80 via-slate-900/70 to-cyan-950/25 p-4"
            : "alerts-hero rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-cyan-50/60 p-4 shadow-sm"
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className={isDarkTheme ? "text-base font-semibold text-slate-100" : "text-base font-semibold text-slate-900"}>
              {tr("Samenvatting", "Summary")}
            </h3>
            <p className={isDarkTheme ? "mt-1 text-sm text-slate-300" : "mt-1 text-sm text-slate-700"}>
              {buildSummaryLine()}
            </p>
            <div className={`mt-2 flex flex-wrap gap-3 text-xs ${isDarkTheme ? "text-slate-400" : "text-slate-500"}`}>
              <span>{tr("Actie nodig", "Actionable")}: {actionableAlerts.length}</span>
              <span>{tr("Positief", "Positive")}: {positiveAlerts.length}</span>
              <span>{tr("Totaal", "Total")}: {alerts.length + predictiveAlerts.length}</span>
            </div>
          </div>
          {samplingControlsEnabled && (
            <span className={isDarkTheme ? "rounded-full border border-cyan-500/40 bg-cyan-500/15 px-3 py-1 text-xs text-cyan-200" : "rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1 text-xs text-cyan-700"}>
              {tr("Filter actief", "Filter active")}: {settings.samplingFilter}
            </span>
          )}
        </div>
      </div>

      {/* ─── All clear ─── */}
      {showAllClearState && (
        <EmptyStateCard
          title={tr("Geen alerts in deze filter", "No alerts in this filter")}
          description={tr(
            "Alles ziet er stabiel uit binnen je huidige selectie. Je kunt op het dashboard een ruimer tijdsbereik of andere biomarkers kiezen.",
            "Everything looks stable in your current selection. Use the dashboard to pick a wider range or different biomarkers."
          )}
          actionLabel={tr("Naar dashboard", "Go to dashboard")}
          onAction={onOpenDashboard}
          icon={<ShieldCheck className={isDarkTheme ? "h-8 w-8 text-emerald-300" : "h-8 w-8 text-emerald-600"} />}
          isDarkTheme={isDarkTheme}
        />
      )}

      {/* ─── Top signals (always visible, featured cards) ─── */}
      {!showAllClearState && topAlerts.length > 0 && (
        <section
          className={
            isDarkTheme
              ? "alerts-panel-actionable app-teal-glow-surface rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4"
              : "alerts-panel-actionable rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          }
        >
          <h4 className={isDarkTheme ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900"}>
            {tr("Waar eerst naar kijken", "What to look at first")}
          </h4>
          <p className={isDarkTheme ? "mt-0.5 text-xs text-slate-400" : "mt-0.5 text-xs text-slate-600"}>
            {tr("Klik op een kaart voor details en context.", "Click a card for details and context.")}
          </p>
          <div className="mt-3 space-y-2.5">
            {topAlerts.map((alert) => renderTopCard(alert))}
          </div>
        </section>
      )}

      {/* ─── Remaining alerts grouped by category ─── */}
      {!showAllClearState && groupedRemaining.length > 0 && (
        <section
          className={
            isDarkTheme
              ? "app-teal-glow-surface rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4"
              : "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className={isDarkTheme ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900"}>
                {tr("Overige signalen", "Other signals")}
              </h4>
              <p className={isDarkTheme ? "mt-0.5 text-xs text-slate-400" : "mt-0.5 text-xs text-slate-600"}>
                {tr("Gegroepeerd per categorie. Open een groep om de details te zien.", "Grouped by category. Open a group to see details.")}
              </p>
            </div>
            <span className={isDarkTheme ? "rounded-full border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-[11px] text-slate-300" : "rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700"}>
              {remainingAlerts.length}
            </span>
          </div>

          <div className="mt-3 space-y-1">
            {groupedRemaining.map((group) => {
              const isOpen = Boolean(expandedCategories[group.category]);
              return (
                <div key={group.category}>
                  <button
                    type="button"
                    onClick={() => toggleCategory(group.category)}
                    aria-expanded={isOpen}
                    className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left transition ${
                      isDarkTheme ? "hover:bg-slate-800/60" : "hover:bg-slate-50"
                    }`}
                  >
                    {isOpen
                      ? <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                      : <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />}
                    <span className={isDarkTheme ? "text-sm font-medium text-slate-200" : "text-sm font-medium text-slate-800"}>
                      {group.label}
                    </span>
                    <span className={isDarkTheme ? "text-[11px] text-slate-500" : "text-[11px] text-slate-400"}>
                      {group.alerts.length}
                    </span>
                    {/* Severity dots as quick preview */}
                    <div className="ml-auto flex items-center gap-1">
                      {group.alerts.map((a) => (
                        <span
                          key={a.id}
                          className={`inline-block h-1.5 w-1.5 rounded-full ${
                            a.severity === "high" ? "bg-rose-500" : a.severity === "medium" ? "bg-amber-500" : "bg-slate-400"
                          }`}
                        />
                      ))}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="ml-1 space-y-0.5">
                      {group.alerts.map((alert) => renderCompactRow(alert))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ─── No actionable alerts message ─── */}
      {!showAllClearState && actionableAlerts.length === 0 && (
        <div className={isDarkTheme
          ? "rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
          : "rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        }>
          {tr(
            "Geen alerts met directe actie in de huidige filter. Dat is meestal een goed teken.",
            "No action-needed alerts in the current filter. That is usually a good sign."
          )}
        </div>
      )}

      {/* ─── Predictive trends (collapsed) ─── */}
      {!showAllClearState && predictiveAlerts.length > 0 && (
        <section
          className={
            isDarkTheme
              ? "alerts-panel-predictive app-teal-glow-surface rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4"
              : "alerts-panel-predictive rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          }
        >
          <button
            type="button"
            onClick={() => setPredictiveExpanded((c) => !c)}
            aria-expanded={predictiveExpanded}
            className="w-full flex items-center justify-between gap-3 text-left"
          >
            <div className="flex items-center gap-2">
              <h4 className={isDarkTheme ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900"}>
                {tr("Voorspellende trends", "Predictive trends")}
              </h4>
              <span className={isDarkTheme ? "rounded-full bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-violet-300 ring-1 ring-violet-500/20" : "rounded-full bg-violet-50 px-2.5 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-200"}>
                {predictiveAlerts.length}
              </span>
            </div>
            {predictiveExpanded
              ? <ChevronDown className="h-4 w-4 opacity-40" />
              : <ChevronRight className="h-4 w-4 opacity-40" />}
          </button>
          <p className={isDarkTheme ? "mt-0.5 text-xs text-slate-400" : "mt-0.5 text-xs text-slate-600"}>
            {tr("Lineaire extrapolatie van huidige trends.", "Linear extrapolation of current trends.")}
          </p>

          {predictiveExpanded && (
            <>
              <div className="mt-3 space-y-2">
                {predictiveAlerts.map((alert) => (
                  <article
                    key={`${alert.marker}-${alert.threshold}`}
                    className={
                      isDarkTheme
                        ? "alerts-card-predictive rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2.5"
                        : "alerts-card-predictive rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5"
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className={isDarkTheme ? "text-sm font-medium text-slate-100" : "text-sm font-medium text-slate-900"}>
                          {getMarkerDisplayName(alert.marker, language)}
                        </p>
                        <p className={isDarkTheme ? "mt-1 text-xs leading-relaxed text-slate-400" : "mt-1 text-xs leading-relaxed text-slate-600"}>
                          {language === "nl" ? alert.narrativeNl : alert.narrativeEn}
                        </p>
                        {alert.confidence === "low" && (
                          <p className={isDarkTheme ? "mt-1 text-[11px] text-slate-500" : "mt-1 text-[11px] text-slate-500"}>
                            {tr("Gebaseerd op slechts 2 metingen.", "Based on only 2 data points.")}
                          </p>
                        )}
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
              <p className={isDarkTheme ? "mt-2 text-[10px] text-slate-500" : "mt-2 text-[10px] text-slate-500"}>
                {tr("Lineaire extrapolatie. Geen medisch advies.", "Linear extrapolation. Not medical advice.")}
              </p>
            </>
          )}
        </section>
      )}

      {/* ─── Positive signals (collapsed) ─── */}
      {!showAllClearState && (
        <section
          className={
            isDarkTheme
              ? "alerts-panel-positive app-teal-glow-surface rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4"
              : "alerts-panel-positive rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          }
        >
          <button
            type="button"
            onClick={() => setPositiveExpanded((c) => !c)}
            aria-expanded={positiveExpanded}
            className="w-full flex items-center justify-between gap-3 text-left"
          >
            <div className="flex items-center gap-2">
              <h4 className={isDarkTheme ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900"}>
                {tr("Positieve signalen", "Positive signals")}
              </h4>
              <span className={isDarkTheme ? "rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-500/20" : "rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200"}>
                {positiveAlerts.length}
              </span>
            </div>
            {positiveExpanded
              ? <ChevronDown className="h-4 w-4 opacity-40" />
              : <ChevronRight className="h-4 w-4 opacity-40" />}
          </button>
          <p className={isDarkTheme ? "mt-0.5 text-xs text-slate-400" : "mt-0.5 text-xs text-slate-600"}>
            {tr("Biomarkers die de goede kant op gaan.", "Biomarkers trending in the right direction.")}
          </p>

          {positiveExpanded && (
            positiveAlerts.length === 0 ? (
              <p className={isDarkTheme ? "mt-3 text-sm text-slate-400" : "mt-3 text-sm text-slate-600"}>
                {tr("Nog geen positieve signalen in deze filter.", "No positive signals in this filter yet.")}
              </p>
            ) : (
              <div className="mt-2 space-y-0.5">
                {positiveAlerts.map((alert) => renderPositiveRow(alert))}
              </div>
            )
          )}
        </section>
      )}
    </section>
  );
};

export default AlertsView;
