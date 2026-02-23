import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CalendarDays, CheckSquare, ChevronDown, ClipboardList, FlaskConical, Lock, Pencil, Save, Square, Trash2, X } from "lucide-react";
import { buildMarkerSeries } from "../analytics";
import MarkerInfoBadge from "../components/MarkerInfoBadge";
import { abnormalStatusLabel, blankAnnotations } from "../chartHelpers";
import { getMarkerDisplayName, trLocale } from "../i18n";
import {
  getProtocolCompoundsText,
  getProtocolDoseMgPerWeek,
  getProtocolFrequencyLabel,
  getReportProtocol
} from "../protocolUtils";
import { AppLanguage, AppSettings, LabReport, MarkerValue, Protocol, ReportAnnotations, SupplementPeriod } from "../types";
import { getEffectiveSupplements, supplementPeriodsToText } from "../supplementUtils";
import { convertBySystem } from "../unitConversion";
import { formatDate } from "../utils";

// Markers to show as preview chips in the collapsed card header
const HIGHLIGHT_MARKERS = ["Testosterone", "Estradiol", "Hematocrit", "SHBG", "Hemoglobin", "LDL Cholesterol"];

interface ReportsViewProps {
  reports: LabReport[];
  protocols: Protocol[];
  supplementTimeline: SupplementPeriod[];
  settings: AppSettings;
  language: AppLanguage;
  samplingControlsEnabled: boolean;
  isShareMode: boolean;
  onDeleteReport: (reportId: string) => void;
  onDeleteReports: (reportIds: string[]) => void;
  onUpdateReportAnnotations: (reportId: string, annotations: ReportAnnotations) => void;
  onSetBaseline: (reportId: string) => void;
  onRenameMarker: (sourceCanonical: string) => void;
  onOpenProtocolTab: () => void;
}

const ReportsView = ({
  reports,
  protocols,
  supplementTimeline,
  settings,
  language,
  samplingControlsEnabled,
  isShareMode,
  onDeleteReport,
  onDeleteReports,
  onUpdateReportAnnotations,
  onSetBaseline,
  onRenameMarker,
  onOpenProtocolTab
}: ReportsViewProps) => {
  const isNl = language === "nl";
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [expandedReportIds, setExpandedReportIds] = useState<string[]>([]);
  const [reportSortOrder, setReportSortOrder] = useState<"asc" | "desc">("desc");
  const [reportComparisonOpen, setReportComparisonOpen] = useState(false);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editingAnnotations, setEditingAnnotations] = useState<ReportAnnotations>(blankAnnotations());

  useEffect(() => {
    const ids = new Set(reports.map((report) => report.id));
    setExpandedReportIds((current) => current.filter((id) => ids.has(id)));
    setSelectedReports((current) => current.filter((id) => ids.has(id)));
    if (editingReportId && !ids.has(editingReportId)) {
      setEditingReportId(null);
      setEditingAnnotations(blankAnnotations());
    }
  }, [reports, editingReportId]);

  useEffect(() => {
    if (!editingReportId) {
      return;
    }
    setExpandedReportIds((current) => (current.includes(editingReportId) ? current : [...current, editingReportId]));
  }, [editingReportId]);

  const sortedReportsForList = useMemo(() => {
    const withIndex = reports.map((report, index) => ({ report, index }));
    withIndex.sort((left, right) => {
      const byDate = left.report.testDate.localeCompare(right.report.testDate);
      if (byDate !== 0) {
        return reportSortOrder === "asc" ? byDate : -byDate;
      }
      const byCreated = left.report.createdAt.localeCompare(right.report.createdAt);
      if (byCreated !== 0) {
        return reportSortOrder === "asc" ? byCreated : -byCreated;
      }
      return left.index - right.index;
    });
    return withIndex.map((item) => item.report);
  }, [reports, reportSortOrder]);

  const compareReports = useMemo(
    () => reports.filter((report) => selectedReports.includes(report.id)).sort((left, right) => left.testDate.localeCompare(right.testDate)),
    [reports, selectedReports]
  );

  const comparedMarkerRows = useMemo(() => {
    if (compareReports.length < 2) {
      return [];
    }
    const markerSet = new Set<string>();
    compareReports.forEach((report) => {
      report.markers.forEach((marker) => markerSet.add(marker.canonicalMarker));
    });
    return Array.from(markerSet).sort((left, right) => left.localeCompare(right));
  }, [compareReports]);

  // Aggregate stats for the header bar
  const reportStats = useMemo(() => {
    if (reports.length === 0) return null;
    const dates = reports.map((r) => r.testDate).sort();
    const allMarkers = new Set<string>();
    let reportsWithAbnormal = 0;
    reports.forEach((r) => {
      r.markers.forEach((m) => allMarkers.add(m.canonicalMarker));
      if (r.markers.some((m) => m.abnormal && m.abnormal !== "normal")) reportsWithAbnormal++;
    });
    return {
      earliest: dates[0],
      latest: dates[dates.length - 1],
      uniqueMarkers: allMarkers.size,
      reportsWithAbnormal
    };
  }, [reports]);

  const startEditingReport = (report: LabReport) => {
    if (isShareMode) {
      return;
    }
    setEditingReportId(report.id);
    setEditingAnnotations({
      ...report.annotations
    });
  };

  const cancelEditingReport = () => {
    setEditingReportId(null);
    setEditingAnnotations(blankAnnotations());
  };

  const saveEditedReport = () => {
    if (!editingReportId) {
      return;
    }
    onUpdateReportAnnotations(editingReportId, editingAnnotations);
    setEditingReportId(null);
    setEditingAnnotations(blankAnnotations());
  };

  const deleteSelectedReports = () => {
    if (selectedReports.length === 0) {
      return;
    }
    onDeleteReports(selectedReports);
    setSelectedReports([]);
    if (editingReportId && selectedReports.includes(editingReportId)) {
      cancelEditingReport();
    }
  };

  const samplingTimingLabel = (value: ReportAnnotations["samplingTiming"]): string => {
    if (value === "unknown") {
      return tr("Onbekend", "Unknown");
    }
    if (value === "trough") {
      return "Trough";
    }
    if (value === "mid") {
      return tr("Midden", "Mid");
    }
    return "Peak";
  };

  // Returns up to 3 highlight marker values for the collapsed card preview
  const getHighlightMarkers = (report: LabReport): MarkerValue[] => {
    const result: MarkerValue[] = [];
    for (const name of HIGHLIGHT_MARKERS) {
      const found = report.markers.find((m) => m.canonicalMarker === name);
      if (found) {
        result.push(found);
        if (result.length === 3) break;
      }
    }
    return result;
  };

  // Left border + health indicator color based on abnormal count
  const cardHealthClass = (report: LabReport): string => {
    const abnormalCount = report.markers.filter((m) => m.abnormal && m.abnormal !== "normal").length;
    if (abnormalCount === 0) return "border-l-slate-700/60";
    if (abnormalCount <= 2) return "border-l-amber-500/60";
    return "border-l-rose-500/60";
  };

  const abnormalCountForReport = (report: LabReport): number =>
    report.markers.filter((m) => m.abnormal && m.abnormal !== "normal").length;

  return (
    <section className="space-y-3 fade-in">
      {/* ── Stats + toolbar row ── */}
      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
        {/* Top line: aggregate stats */}
        {reportStats && (
          <div className="mb-3 flex flex-wrap items-center gap-4 border-b border-slate-700/50 pb-3">
            <div className="flex items-center gap-1.5 text-sm text-slate-300">
              <ClipboardList className="h-4 w-4 text-cyan-400/70" />
              <span className="font-semibold text-slate-100">{reports.length}</span>
              <span className="text-slate-400">{tr("rapporten", "reports")}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-slate-300">
              <CalendarDays className="h-4 w-4 text-cyan-400/70" />
              <span className="text-slate-400">{formatDate(reportStats.earliest)}</span>
              <span className="text-slate-600">→</span>
              <span className="text-slate-400">{formatDate(reportStats.latest)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-slate-300">
              <FlaskConical className="h-4 w-4 text-cyan-400/70" />
              <span className="font-semibold text-slate-100">{reportStats.uniqueMarkers}</span>
              <span className="text-slate-400">{tr("unieke markers", "unique markers")}</span>
            </div>
            {reportStats.reportsWithAbnormal > 0 && (
              <div className="flex items-center gap-1.5 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-400/80" />
                <span className="font-semibold text-amber-300">{reportStats.reportsWithAbnormal}</span>
                <span className="text-slate-400">{tr("met afwijkingen", "with out-of-range")}</span>
              </div>
            )}
          </div>
        )}

        {/* Controls row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/70 p-0.5">
            <button
              type="button"
              className={`rounded px-2 py-1 text-xs ${reportSortOrder === "desc" ? "bg-cyan-500/20 text-cyan-200" : "text-slate-300 hover:text-slate-100"}`}
              onClick={() => setReportSortOrder("desc")}
            >
              {tr("Nieuwste eerst", "Newest first")}
            </button>
            <button
              type="button"
              className={`rounded px-2 py-1 text-xs ${reportSortOrder === "asc" ? "bg-cyan-500/20 text-cyan-200" : "text-slate-300 hover:text-slate-100"}`}
              onClick={() => setReportSortOrder("asc")}
            >
              {tr("Oudste eerst", "Oldest first")}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-2.5 py-1.5 text-sm text-slate-300 hover:border-slate-500 hover:text-slate-100"
              onClick={() => {
                if (selectedReports.length === sortedReportsForList.length) {
                  setSelectedReports([]);
                  return;
                }
                setSelectedReports(sortedReportsForList.map((report) => report.id));
              }}
            >
              {selectedReports.length === sortedReportsForList.length && sortedReportsForList.length > 0 ? (
                <CheckSquare className="h-4 w-4" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              {tr("Selecteer alles", "Select all")}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-sm text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
              disabled={selectedReports.length < 2}
              onClick={() => setReportComparisonOpen((prev) => !prev)}
            >
              <ClipboardList className="h-4 w-4" /> {tr("Vergelijk selectie", "Compare selected")}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-sm text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
              disabled={selectedReports.length === 0 || isShareMode}
              onClick={deleteSelectedReports}
            >
              <Trash2 className="h-4 w-4" /> {tr("Verwijder selectie", "Delete selected")}
            </button>
          </div>
        </div>
      </div>

      {reportComparisonOpen && compareReports.length >= 2 ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
          <h4 className="mb-2 text-sm font-semibold text-slate-100">
            {tr("Vergelijking van geselecteerde rapporten", "Selected report comparison")}
          </h4>
          <table className="min-w-full divide-y divide-slate-700 text-xs sm:text-sm">
            <thead className="bg-slate-900/70 text-slate-300">
              <tr>
                <th className="px-2 py-2 text-left">{tr("Marker", "Marker")}</th>
                {compareReports.map((report) => (
                  <th key={report.id} className="px-2 py-2 text-right">
                    {formatDate(report.testDate)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {comparedMarkerRows.map((marker) => (
                <tr key={marker} className="bg-slate-900/30 text-slate-200">
                  <td className="px-2 py-2 text-left">{getMarkerDisplayName(marker, language)}</td>
                  {compareReports.map((report) => {
                    const point = buildMarkerSeries([report], marker, settings.unitSystem, protocols)[0];
                    return (
                      <td key={`${report.id}-${marker}`} className="px-2 py-2 text-right">
                        {point ? `${point.value.toFixed(2)} ${point.unit}` : "-"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {sortedReportsForList.map((report, reportIndex) => {
        const isEditing = editingReportId === report.id;
        const isExpanded = expandedReportIds.includes(report.id);
        const protocol = getReportProtocol(report, protocols);
        const dose = getProtocolDoseMgPerWeek(protocol);
        const abnormalCount = abnormalCountForReport(report);
        const previewMarkers = getHighlightMarkers(report);
        const displayNumber = reportSortOrder === "asc" ? reportIndex + 1 : sortedReportsForList.length - reportIndex;

        return (
          <motion.article
            key={report.id}
            layout
            className={`rounded-2xl border border-slate-700/70 border-l-2 ${cardHealthClass(report)} bg-slate-900/60 transition-colors hover:bg-slate-900/80`}
          >
            {/* ── Collapsed header ── */}
            <button
              type="button"
              onClick={() => {
                if (isExpanded && isEditing) {
                  cancelEditingReport();
                }
                setExpandedReportIds((current) =>
                  current.includes(report.id) ? current.filter((id) => id !== report.id) : [...current, report.id]
                );
              }}
              className="flex w-full min-w-0 items-stretch gap-0 rounded-2xl px-3 py-3 text-left"
              aria-label={isExpanded ? tr("Inklappen", "Collapse") : tr("Uitklappen", "Expand")}
            >
              {/* Report number */}
              <span className="mr-3 flex shrink-0 flex-col items-center justify-center">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-800/80 text-[11px] font-mono font-semibold text-slate-400">
                  {String(displayNumber).padStart(2, "0")}
                </span>
              </span>

              {/* Main content */}
              <span className="min-w-0 flex-1 space-y-1.5">
                {/* Row 1: date + badges */}
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold tracking-tight text-slate-100">
                    {formatDate(report.testDate)}
                  </span>
                  {report.isBaseline && (
                    <span className="rounded-full border border-cyan-400/50 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-300">
                      Baseline
                    </span>
                  )}
                  {protocol && (
                    <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-300">
                      {protocol.name}
                    </span>
                  )}
                  {!protocol && dose === null && (
                    <span className="text-xs text-slate-500">{tr("Geen protocol", "No protocol")}</span>
                  )}
                </span>

                {/* Row 2: marker preview chips */}
                {previewMarkers.length > 0 && (
                  <span className="flex flex-wrap items-center gap-2">
                    {previewMarkers.map((m) => {
                      const converted = convertBySystem(m.canonicalMarker, m.value, m.unit, settings.unitSystem);
                      const isAbnormal = m.abnormal && m.abnormal !== "normal";
                      return (
                        <span
                          key={m.id}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                            isAbnormal
                              ? m.abnormal === "high"
                                ? "bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/20"
                                : "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20"
                              : "bg-slate-800/60 text-slate-300"
                          }`}
                        >
                          <span className="text-slate-400">{getMarkerDisplayName(m.canonicalMarker, language)}</span>
                          <span className={isAbnormal ? "" : "text-slate-200"}>
                            {converted.value.toFixed(1)} {converted.unit}
                          </span>
                        </span>
                      );
                    })}
                  </span>
                )}

                {/* Row 3: filename */}
                <span className="truncate text-xs text-slate-500">{report.sourceFileName}</span>
              </span>

              {/* Right: counts + chevron */}
              <span className="ml-2 flex shrink-0 flex-col items-end justify-center gap-1.5">
                <span className="flex items-center gap-1.5">
                  {abnormalCount > 0 && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      abnormalCount >= 3 ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-300"
                    }`}>
                      <AlertTriangle className="h-3 w-3" />
                      {abnormalCount}
                    </span>
                  )}
                  <span className="rounded-full bg-slate-800/70 px-2 py-0.5 text-[11px] text-slate-400">
                    {report.markers.length} {tr("m", "m")}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </span>
              </span>
            </button>

            {isExpanded ? (
              <div className="border-t border-slate-700/50 px-4 pb-4 pt-3">
                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-600 bg-slate-800/70 px-2 py-1.5 text-xs text-slate-200 hover:border-slate-500"
                    onClick={() => {
                      setSelectedReports((current) => {
                        if (current.includes(report.id)) {
                          return current.filter((id) => id !== report.id);
                        }
                        return [...current, report.id];
                      });
                    }}
                  >
                    {selectedReports.includes(report.id) ? (
                      <CheckSquare className="h-4 w-4 text-cyan-300" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    {selectedReports.includes(report.id) ? tr("Geselecteerd", "Selected") : tr("Selecteer", "Select")}
                  </button>

                  {!isShareMode && isEditing ? (
                    <>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-500/60 bg-slate-800/70 px-2 py-1.5 text-xs text-slate-200 hover:border-slate-400"
                        onClick={cancelEditingReport}
                      >
                        <X className="h-3.5 w-3.5" /> {tr("Annuleer", "Cancel")}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20"
                        onClick={saveEditedReport}
                      >
                        <Save className="h-3.5 w-3.5" /> {tr("Opslaan", "Save")}
                      </button>
                    </>
                  ) : !isShareMode ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/20"
                      onClick={() => startEditingReport(report)}
                    >
                      <Pencil className="h-3.5 w-3.5" /> {tr("Bewerk details", "Edit details")}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-2 py-1.5 text-xs text-slate-300">
                      <Lock className="h-3.5 w-3.5" /> {tr("Alleen-lezen", "Read-only")}
                    </span>
                  )}

                  {!isShareMode ? (
                    <button
                      type="button"
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs ${
                        report.isBaseline
                          ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200"
                          : "border-slate-600 bg-slate-800/70 text-slate-200 hover:border-slate-500"
                      }`}
                      onClick={() => onSetBaseline(report.id)}
                    >
                      <Lock className="h-3.5 w-3.5" /> {report.isBaseline ? "Baseline" : tr("Zet als baseline", "Set baseline")}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                    disabled={isShareMode}
                    onClick={() => {
                      onDeleteReport(report.id);
                      setSelectedReports((current) => current.filter((id) => id !== report.id));
                      if (editingReportId === report.id) {
                        cancelEditingReport();
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {tr("Verwijder", "Delete")}
                  </button>
                </div>

                {isEditing ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <label className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                      <span className="mb-1 block text-slate-400">{tr("Protocoldetails", "Protocol details")}</span>
                      <input
                        className="w-full rounded-md border border-slate-600 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100"
                        value={editingAnnotations.protocol}
                        onChange={(event) =>
                          setEditingAnnotations((current) => ({
                            ...current,
                            protocol: event.target.value
                          }))
                        }
                        placeholder={tr("bijv. SubQ, injectieplek, timing", "e.g. SubQ, injection site, timing")}
                      />
                    </label>
                    <label className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                      <span className="mb-1 block text-slate-400">{tr("Symptomen", "Symptoms")}</span>
                      <input
                        className="w-full rounded-md border border-slate-600 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100"
                        value={editingAnnotations.symptoms}
                        onChange={(event) =>
                          setEditingAnnotations((current) => ({
                            ...current,
                            symptoms: event.target.value
                          }))
                        }
                      />
                    </label>
                    <label className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300 sm:col-span-2">
                      <span className="mb-1 block text-slate-400">{tr("Notities", "Notes")}</span>
                      <textarea
                        className="h-20 w-full resize-none rounded-md border border-slate-600 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100"
                        value={editingAnnotations.notes}
                        onChange={(event) =>
                          setEditingAnnotations((current) => ({
                            ...current,
                            notes: event.target.value
                          }))
                        }
                      />
                    </label>
                    {samplingControlsEnabled ? (
                      <label className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                        <span className="mb-1 block text-slate-400">{tr("Meetmoment", "Sampling timing")}</span>
                        <select
                          className="w-full rounded-md border border-slate-600 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100"
                          value={editingAnnotations.samplingTiming}
                          onChange={(event) =>
                            setEditingAnnotations((current) => ({
                              ...current,
                              samplingTiming: event.target.value as ReportAnnotations["samplingTiming"]
                            }))
                          }
                        >
                          <option value="unknown">{tr("Onbekend", "Unknown")}</option>
                          <option value="trough">Trough</option>
                          <option value="mid">{tr("Midden", "Mid")}</option>
                          <option value="peak">Peak</option>
                        </select>
                      </label>
                    ) : null}
                  </div>
                ) : (
                  <div className={`mt-3 grid gap-2 sm:grid-cols-2 ${samplingControlsEnabled ? "xl:grid-cols-8" : "xl:grid-cols-7"}`}>
                    <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                      <span className="block text-slate-400">{tr("Dosis", "Dose")}</span>
                      <strong className="text-sm text-slate-100">{dose === null ? "-" : `${dose} mg/week`}</strong>
                    </div>
                    <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                      <span className="block text-slate-400">{tr("Protocol", "Protocol")}</span>
                      {protocol ? (
                        <button
                          type="button"
                          className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-left text-xs text-cyan-200 hover:border-cyan-400"
                          onClick={onOpenProtocolTab}
                        >
                          {protocol.name}
                        </button>
                      ) : (
                        <strong className="text-sm text-slate-100">-</strong>
                      )}
                    </div>
                    <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                      <span className="block text-slate-400">{tr("Compound", "Compound")}</span>
                      <strong className="text-sm text-slate-100">{getProtocolCompoundsText(protocol) || "-"}</strong>
                    </div>
                    <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                      <span className="block text-slate-400">{tr("Injectiefrequentie", "Injection frequency")}</span>
                      <strong className="text-sm text-slate-100">{getProtocolFrequencyLabel(protocol, language)}</strong>
                    </div>
                    <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                      <span className="block text-slate-400">{tr("Actief bij testdatum", "Active at test date")}</span>
                      <strong className="text-sm text-slate-100">
                        {supplementPeriodsToText(getEffectiveSupplements(report, supplementTimeline)) || "-"}
                      </strong>
                    </div>
                    <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                      <span className="block text-slate-400">{tr("Symptomen", "Symptoms")}</span>
                      <strong className="text-sm text-slate-100">{report.annotations.symptoms || "-"}</strong>
                    </div>
                    <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                      <span className="block text-slate-400">{tr("Notities", "Notes")}</span>
                      <strong className="text-sm text-slate-100">{report.annotations.notes || "-"}</strong>
                    </div>
                    {samplingControlsEnabled ? (
                      <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                        <span className="block text-slate-400">{tr("Meetmoment", "Sampling timing")}</span>
                        <strong className="text-sm text-slate-100">{samplingTimingLabel(report.annotations.samplingTiming)}</strong>
                      </div>
                    ) : null}
                  </div>
                )}

                <div className="mt-3 overflow-visible rounded-lg border border-slate-700">
                  <div className="overflow-x-auto overflow-y-visible">
                    <table className="min-w-full divide-y divide-slate-700 text-xs sm:text-sm">
                      <thead className="bg-slate-900/70 text-slate-300">
                        <tr>
                          <th className="px-3 py-2 text-left">{tr("Marker", "Marker")}</th>
                          <th className="px-3 py-2 text-right">{tr("Waarde", "Value")}</th>
                          <th className="px-3 py-2 text-left">{tr("Eenheid", "Unit")}</th>
                          <th className="px-3 py-2 text-right">{tr("Bereik", "Range")}</th>
                          <th className="px-3 py-2 text-right">{tr("Status", "Status")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {report.markers.map((marker) => {
                          const converted = convertBySystem(marker.canonicalMarker, marker.value, marker.unit, settings.unitSystem);
                          const min =
                            marker.referenceMin === null
                              ? null
                              : convertBySystem(marker.canonicalMarker, marker.referenceMin, marker.unit, settings.unitSystem).value;
                          const max =
                            marker.referenceMax === null
                              ? null
                              : convertBySystem(marker.canonicalMarker, marker.referenceMax, marker.unit, settings.unitSystem).value;

                          return (
                            <tr key={marker.id} className="bg-slate-900/35 text-slate-200">
                              <td className="px-3 py-2">
                                <span className="inline-flex items-center gap-1">
                                  {getMarkerDisplayName(marker.canonicalMarker, language)}
                                  <MarkerInfoBadge marker={marker.canonicalMarker} language={language} />
                                  {!marker.isCalculated ? (
                                    <button
                                      type="button"
                                      className="rounded p-0.5 text-slate-400 transition hover:text-cyan-200"
                                      onClick={() => onRenameMarker(marker.canonicalMarker)}
                                      aria-label={tr("Marker hernoemen", "Rename marker")}
                                      title={tr("Marker hernoemen", "Rename marker")}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                                  {marker.isCalculated ? (
                                    <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-200">
                                      fx
                                    </span>
                                  ) : null}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right">{converted.value.toFixed(2)}</td>
                              <td className="px-3 py-2">{converted.unit}</td>
                              <td className="px-3 py-2 text-right">
                                {min === null || max === null ? "-" : `${Number(min.toFixed(2))} - ${Number(max.toFixed(2))}`}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                                    marker.abnormal === "high"
                                      ? "bg-rose-500/20 text-rose-300"
                                      : marker.abnormal === "low"
                                        ? "bg-amber-500/20 text-amber-300"
                                        : "bg-emerald-500/20 text-emerald-300"
                                  }`}
                                >
                                  {abnormalStatusLabel(marker.abnormal, language)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
          </motion.article>
        );
      })}
    </section>
  );
};

export default ReportsView;
