import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckSquare, ChevronDown, ClipboardList, Lock, Pencil, Save, Square, Trash2, X } from "lucide-react";
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
import { AppLanguage, AppSettings, LabReport, Protocol, ReportAnnotations, SupplementPeriod } from "../types";
import { getEffectiveSupplements, supplementPeriodsToText } from "../supplementUtils";
import { convertBySystem } from "../unitConversion";
import { formatDate } from "../utils";

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

  return (
    <section className="space-y-3 fade-in">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
        <div className="text-sm text-slate-300">
          <span className="font-semibold text-slate-100">{reports.length}</span> {tr("rapporten totaal", "reports total")}
        </div>
        <div className="flex items-center gap-2">
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
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-2.5 py-1.5 text-sm text-slate-300"
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
            className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-sm text-cyan-200 disabled:opacity-50"
            disabled={selectedReports.length < 2}
            onClick={() => setReportComparisonOpen((prev) => !prev)}
          >
            <ClipboardList className="h-4 w-4" /> {tr("Vergelijk selectie", "Compare selected")}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-sm text-rose-300 disabled:opacity-50"
            disabled={selectedReports.length === 0 || isShareMode}
            onClick={deleteSelectedReports}
          >
            <Trash2 className="h-4 w-4" /> {tr("Verwijder selectie", "Delete selected")}
          </button>
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

      {sortedReportsForList.map((report) => {
        const isEditing = editingReportId === report.id;
        const isExpanded = expandedReportIds.includes(report.id);
        const protocol = getReportProtocol(report, protocols);
        const dose = getProtocolDoseMgPerWeek(protocol);

        return (
          <motion.article key={report.id} layout className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
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
              className="flex w-full min-w-0 items-start gap-2 rounded-lg text-left hover:bg-slate-800/30"
              aria-label={isExpanded ? tr("Inklappen", "Collapse") : tr("Uitklappen", "Expand")}
            >
              <span className="mt-0.5 rounded-md border border-slate-700 bg-slate-800/70 p-1 text-slate-300">
                <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              </span>
              <span className="min-w-0">
                <h3 className="text-base font-semibold text-slate-100">
                  {formatDate(report.testDate)}
                  {report.isBaseline ? (
                    <span className="ml-2 rounded-full border border-cyan-400/50 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium text-cyan-200">
                      Baseline
                    </span>
                  ) : null}
                </h3>
                <p className="text-xs text-slate-300">
                  {tr("Dosis", "Dose")}: {dose === null ? "-" : `${dose} mg/week`}
                </p>
                <p className="truncate text-xs text-slate-400">{report.sourceFileName}</p>
              </span>
            </button>

            {isExpanded ? (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-2 self-start">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-600 bg-slate-800/70 px-2 py-1.5 text-xs text-slate-200"
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
                        className="inline-flex items-center gap-1 rounded-md border border-slate-500/60 bg-slate-800/70 px-2 py-1.5 text-xs text-slate-200"
                        onClick={cancelEditingReport}
                      >
                        <X className="h-3.5 w-3.5" /> {tr("Annuleer", "Cancel")}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-300"
                        onClick={saveEditedReport}
                      >
                        <Save className="h-3.5 w-3.5" /> {tr("Opslaan", "Save")}
                      </button>
                    </>
                  ) : !isShareMode ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1.5 text-xs text-cyan-200"
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
                          : "border-slate-600 bg-slate-800/70 text-slate-200"
                      }`}
                      onClick={() => onSetBaseline(report.id)}
                    >
                      <Lock className="h-3.5 w-3.5" /> {report.isBaseline ? "Baseline" : tr("Zet als baseline", "Set baseline")}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-300"
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
              </>
            ) : null}
          </motion.article>
        );
      })}
    </section>
  );
};

export default ReportsView;
