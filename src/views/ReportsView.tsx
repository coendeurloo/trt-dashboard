import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CalendarDays, Check, CheckCircle2, CheckSquare, ChevronDown, ClipboardList, FileText, FlaskConical, Lock, Pencil, Save, Square, Trash2, X, XCircle } from "lucide-react";
import ProtocolEditor from "../components/ProtocolEditor";
import MarkerUnitReviewPopover from "../components/MarkerUnitReviewPopover";
import { ProtocolDraft, blankProtocolDraft } from "../components/protocolEditorModel";
import { buildMarkerSeries } from "../analytics";
import MarkerInfoBadge from "../components/MarkerInfoBadge";
import { abnormalStatusLabel, blankAnnotations } from "../chartHelpers";
import { getMarkerDisplayName, trLocale } from "../i18n";
import {
  canonicalizeSupplement,
  compoundsForProtocolEditor,
  compoundsForProtocolStorage,
  SUPPLEMENT_FREQUENCY_OPTIONS,
  SUPPLEMENT_OPTIONS,
  supplementFrequencyLabel
} from "../protocolStandards";
import {
  getProtocolCompoundsText,
  getProtocolDoseMgPerWeek,
  getProtocolFrequencyLabel,
  getProtocolDisplayLabel,
  getReportProtocol
} from "../protocolUtils";
import { cloneCompoundEntries, normalizeInterventionSnapshot, todayIsoDate } from "../protocolVersions";
import { AppLanguage, AppSettings, LabReport, MarkerValue, Protocol, ReportAnnotations, SupplementPeriod } from "../types";
import { ResolvedReportSupplementContext, getActiveSupplementsAtDate, resolveReportSupplementContexts, supplementPeriodsToText } from "../supplementUtils";
import { convertBySystem, getMarkerConversionInput } from "../unitConversion";
import { createId, deriveAbnormalFlag, formatDate } from "../utils";
import { findBaselineOverlapMarkers } from "../baselineUtils";
import { ReviewMarker, enrichMarkerForReview } from "../utils/markerReview";

const REVIEW_TOOLTIP_EDGE_PADDING = 10;
const REVIEW_TOOLTIP_MIN_WIDTH = 280;
const REVIEW_TOOLTIP_MAX_WIDTH = 420;
const REVIEW_TOOLTIP_GAP = 10;

const canonicalizeProtocolDraftForCompare = (draft: ProtocolDraft): string =>
  JSON.stringify({
    name: draft.name.trim(),
    effectiveFrom: draft.effectiveFrom.trim(),
    notes: draft.notes.trim(),
    compounds: draft.compounds.map((compound) => ({
      name: compound.name.trim(),
      dose: (compound.dose ?? compound.doseMg ?? "").trim(),
      doseWeekly: (compound.doseMg ?? "").trim(),
      frequency: compound.frequency.trim(),
      route: compound.route.trim()
    }))
  });

interface MarkerReviewBadgeProps {
  label: string;
  className: string;
  icon: ReactNode;
  tooltip?: string;
  tooltipId: string;
  buttonRef?: (element: HTMLButtonElement | null) => void;
  onClick?: () => void;
  expanded?: boolean;
  ariaLabel?: string;
}

const MarkerReviewBadge = ({ label, className, icon, tooltip, tooltipId, buttonRef, onClick, expanded = false, ariaLabel }: MarkerReviewBadgeProps) => {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!tooltip || !isOpen || !triggerRef.current || typeof window === "undefined") {
      return;
    }

    const lineCount = tooltip
      .split("\n")
      .map((line) => Math.max(1, Math.ceil(line.trim().length / 56)))
      .reduce((total, value) => total + value, 0);
    const tooltipHeightEstimate = Math.min(360, 84 + lineCount * 18);

    const updatePosition = () => {
      if (!triggerRef.current) {
        return;
      }
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(
        REVIEW_TOOLTIP_MAX_WIDTH,
        Math.max(REVIEW_TOOLTIP_MIN_WIDTH, viewportWidth - REVIEW_TOOLTIP_EDGE_PADDING * 2)
      );
      const maxLeft = Math.max(REVIEW_TOOLTIP_EDGE_PADDING, viewportWidth - width - REVIEW_TOOLTIP_EDGE_PADDING);
      const clampedLeft = Math.max(
        REVIEW_TOOLTIP_EDGE_PADDING,
        Math.min(rect.left + rect.width / 2 - width / 2, maxLeft)
      );
      const placeBelow = rect.bottom + REVIEW_TOOLTIP_GAP + tooltipHeightEstimate <= viewportHeight - REVIEW_TOOLTIP_EDGE_PADDING;
      const top = placeBelow
        ? rect.bottom + REVIEW_TOOLTIP_GAP
        : Math.max(REVIEW_TOOLTIP_EDGE_PADDING, rect.top - tooltipHeightEstimate - REVIEW_TOOLTIP_GAP);
      setTooltipPosition({ top, left: clampedLeft, width });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, tooltip]);

  const tooltipOverlay =
    tooltip && isOpen && tooltipPosition && typeof document !== "undefined"
      ? createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            className="review-tooltip pointer-events-none fixed z-[120] whitespace-normal break-words rounded-md border border-slate-600 bg-slate-900/95 px-3 py-2 text-left text-xs leading-relaxed text-slate-200 shadow-lg"
            style={{ top: tooltipPosition.top, left: tooltipPosition.left, width: tooltipPosition.width }}
          >
            {tooltip}
          </div>,
          document.body
        )
      : null;

  return (
    <span className="inline-flex">
      <button
        type="button"
        ref={(element) => {
          triggerRef.current = element;
          buttonRef?.(element);
        }}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${className}`}
        aria-describedby={tooltip ? tooltipId : undefined}
        aria-expanded={onClick ? expanded : tooltip ? isOpen : undefined}
        aria-haspopup={onClick ? "dialog" : undefined}
        aria-label={ariaLabel}
        tabIndex={tooltip || onClick ? 0 : -1}
        onClick={() => {
          if (onClick) {
            onClick();
          }
        }}
        onMouseEnter={() => {
          if (tooltip) {
            setIsOpen(true);
          }
        }}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => {
          if (tooltip) {
            setIsOpen(true);
          }
        }}
        onBlur={() => setIsOpen(false)}
      >
        {icon}
        {label}
      </button>
      {tooltipOverlay}
    </span>
  );
};

interface ReportsViewProps {
  reports: LabReport[];
  protocols: Protocol[];
  supplementTimeline: SupplementPeriod[];
  settings: AppSettings;
  language: AppLanguage;
  samplingControlsEnabled: boolean;
  isShareMode: boolean;
  resolvedSupplementContexts?: Record<string, ResolvedReportSupplementContext>;
  onDeleteReport: (reportId: string) => void;
  onDeleteReports: (reportIds: string[]) => void;
  onUpdateReportAnnotations: (reportId: string, annotations: ReportAnnotations) => void;
  onUpdateReportMarkerUnit: (reportId: string, markerId: string, selectedUnit: string) => void;
  onSetBaseline: (reportId: string) => void;
  onRenameMarker: (sourceCanonical: string) => void;
  onOpenProtocolTab: () => void;
  focusedReportId?: string | null;
  onFocusedReportHandled?: () => void;
}

const ReportsView = ({
  reports,
  protocols,
  supplementTimeline,
  settings,
  language,
  isShareMode,
  resolvedSupplementContexts,
  onDeleteReport,
  onDeleteReports,
  onUpdateReportAnnotations,
  onUpdateReportMarkerUnit,
  onSetBaseline,
  onRenameMarker,
  onOpenProtocolTab,
  focusedReportId,
  onFocusedReportHandled
}: ReportsViewProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const isDarkTheme = settings.theme === "dark";

  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [expandedReportIds, setExpandedReportIds] = useState<string[]>([]);
  const [expandedSupplementReportIds, setExpandedSupplementReportIds] = useState<string[]>([]);
  const [reportSortOrder, setReportSortOrder] = useState<"asc" | "desc">("desc");
  const [reportComparisonOpen, setReportComparisonOpen] = useState(false);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editingAnnotations, setEditingAnnotations] = useState<ReportAnnotations>(blankAnnotations());
  const [protocolVersionEditorReportId, setProtocolVersionEditorReportId] = useState<string | null>(null);
  const [protocolVersionDraft, setProtocolVersionDraft] = useState<ProtocolDraft>(blankProtocolDraft());
  const [protocolVersionInitialDraft, setProtocolVersionInitialDraft] = useState<ProtocolDraft>(blankProtocolDraft());
  const [protocolVersionLinkedInterventionId, setProtocolVersionLinkedInterventionId] = useState<string | null>(null);
  const [protocolVersionFeedback, setProtocolVersionFeedback] = useState("");
  const [activeUnitReview, setActiveUnitReview] = useState<{ reportId: string; markerId: string } | null>(null);
  const [unitReviewSelection, setUnitReviewSelection] = useState("");
  const [activeUnitReviewAnchor, setActiveUnitReviewAnchor] = useState<HTMLButtonElement | null>(null);
  const unitReviewAnchorRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [supplementNameInput, setSupplementNameInput] = useState("");
  const [supplementDoseInput, setSupplementDoseInput] = useState("");
  const [supplementFrequencyInput, setSupplementFrequencyInput] = useState("daily");

  const reportSupplementContexts = useMemo(
    () => resolvedSupplementContexts ?? resolveReportSupplementContexts(reports, supplementTimeline),
    [resolvedSupplementContexts, reports, supplementTimeline]
  );

  const supplementSuggestions = useMemo(() => {
    const query = supplementNameInput.trim().toLowerCase();
    if (query.length < 2) {
      return [];
    }
    return SUPPLEMENT_OPTIONS.filter((option) => option.toLowerCase().includes(query)).slice(0, 8);
  }, [supplementNameInput]);

  const markerAbnormalStatus = useCallback(
    (marker: MarkerValue): MarkerValue["abnormal"] =>
      deriveAbnormalFlag(marker.value, marker.referenceMin, marker.referenceMax),
    []
  );

  const isMarkerOutOfRange = useCallback((marker: MarkerValue): boolean => {
    const abnormal = markerAbnormalStatus(marker);
    return abnormal === "high" || abnormal === "low";
  }, [markerAbnormalStatus]);

  const markerReviewOverall = (marker: ReviewMarker): "ok" | "review" | "error" => marker._confidence?.overall ?? "ok";

  const markerReviewLabel = (marker: ReviewMarker): string => {
    const overall = markerReviewOverall(marker);
    if (overall === "error") {
      return tr("Fout", "Error");
    }
    if (overall === "review") {
      return tr("Controleren", "Review");
    }
    return tr("OK", "OK");
  };

  const markerReviewClassName = (marker: ReviewMarker): string => {
    const overall = markerReviewOverall(marker);
    if (overall === "error") {
      return "border-rose-500/40 bg-rose-500/10 text-rose-200";
    }
    if (overall === "review") {
      return "border-amber-500/40 bg-amber-500/10 text-amber-100";
    }
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  };

  const markerReviewIcon = (marker: ReviewMarker) => {
    const overall = markerReviewOverall(marker);
    if (overall === "error") {
      return <XCircle className="h-3.5 w-3.5" />;
    }
    if (overall === "review") {
      return <AlertTriangle className="h-3.5 w-3.5" />;
    }
    return <CheckCircle2 className="h-3.5 w-3.5" />;
  };

  const markerReviewTooltip = (marker: ReviewMarker): string | undefined => {
    const issues = marker._confidence?.issues ?? [];
    if (issues.length > 0) {
      return issues.map((issue) => `- ${issue}`).join("\n");
    }
    const overall = markerReviewOverall(marker);
    if (overall === "review") {
      return tr(
        "Controle aanbevolen: de parser heeft een onzeker punt gezien.",
        "Review recommended: the parser detected an uncertain point."
      );
    }
    if (overall === "error") {
      return tr(
        "Parserfout: controleer deze marker handmatig.",
        "Parser error: review this marker manually."
      );
    }
    return undefined;
  };

  const isInteractiveUnitReview = useCallback(
    (marker: ReviewMarker): boolean => {
      if (isShareMode) {
        return false;
      }
      const unitReview = marker._unitReview;
      if (!unitReview) {
        return false;
      }
      if (unitReview.isMissingUnit || unitReview.hasUnitIssue) {
        return true;
      }
      const unitConfidence = marker._confidence?.unit;
      return unitConfidence === "low" || unitConfidence === "missing";
    },
    [isShareMode]
  );

  const normalizeAnchorState = (annotations: ReportAnnotations): ReportAnnotations["supplementAnchorState"] => {
    if (
      annotations.supplementAnchorState === "inherit" ||
      annotations.supplementAnchorState === "anchor" ||
      annotations.supplementAnchorState === "none" ||
      annotations.supplementAnchorState === "unknown"
    ) {
      return annotations.supplementAnchorState;
    }
    if (annotations.supplementOverrides === null) {
      return "inherit";
    }
    return annotations.supplementOverrides.length > 0 ? "anchor" : "none";
  };

  const toSingleDayOverrides = (periods: SupplementPeriod[], testDate: string): SupplementPeriod[] =>
    periods.map((period) => ({
      id: createId(),
      name: period.name,
      dose: period.dose,
      frequency: period.frequency,
      startDate: testDate,
      endDate: testDate
    }));

  useEffect(() => {
    const ids = new Set(reports.map((report) => report.id));
    setExpandedReportIds((current) => current.filter((id) => ids.has(id)));
    setExpandedSupplementReportIds((current) => current.filter((id) => ids.has(id)));
    setSelectedReports((current) => current.filter((id) => ids.has(id)));
    if (editingReportId && !ids.has(editingReportId)) {
      setEditingReportId(null);
      setEditingAnnotations(blankAnnotations());
    }
    if (protocolVersionEditorReportId && !ids.has(protocolVersionEditorReportId)) {
      setProtocolVersionEditorReportId(null);
      setProtocolVersionDraft(blankProtocolDraft());
      setProtocolVersionInitialDraft(blankProtocolDraft());
      setProtocolVersionLinkedInterventionId(null);
      setProtocolVersionFeedback("");
    }
    if (activeUnitReview && !ids.has(activeUnitReview.reportId)) {
      setActiveUnitReview(null);
      setUnitReviewSelection("");
      setActiveUnitReviewAnchor(null);
    }
  }, [activeUnitReview, editingReportId, protocolVersionEditorReportId, reports]);

  useEffect(() => {
    if (!editingReportId) {
      return;
    }
    setExpandedReportIds((current) => (current.includes(editingReportId) ? current : [...current, editingReportId]));
  }, [editingReportId]);

  useEffect(() => {
    if (!focusedReportId) {
      return;
    }
    const exists = reports.some((report) => report.id === focusedReportId);
    if (!exists) {
      onFocusedReportHandled?.();
      return;
    }
    setExpandedReportIds((current) => (current.includes(focusedReportId) ? current : [...current, focusedReportId]));
    const node = document.querySelector<HTMLElement>(`[data-report-id=\"${focusedReportId}\"]`);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    onFocusedReportHandled?.();
  }, [focusedReportId, reports, onFocusedReportHandled]);

  const activeUnitReviewMarker = useMemo(() => {
    if (!activeUnitReview) {
      return null;
    }
    const report = reports.find((entry) => entry.id === activeUnitReview.reportId);
    const marker = report?.markers.find((entry) => entry.id === activeUnitReview.markerId);
    return marker ? enrichMarkerForReview(marker) : null;
  }, [activeUnitReview, reports]);

  useEffect(() => {
    if (!activeUnitReview) {
      return;
    }
    if (!activeUnitReviewMarker || !isInteractiveUnitReview(activeUnitReviewMarker)) {
      setActiveUnitReview(null);
      setUnitReviewSelection("");
      setActiveUnitReviewAnchor(null);
    }
  }, [activeUnitReview, activeUnitReviewMarker, isInteractiveUnitReview]);

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

  const baselineOverlapByReportId = useMemo(() => {
    const byReportId = new Map<string, string[]>();
    reports.forEach((report) => {
      if (report.isBaseline) {
        byReportId.set(report.id, []);
        return;
      }
      byReportId.set(report.id, findBaselineOverlapMarkers(report, reports));
    });
    return byReportId;
  }, [reports]);

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
      if (r.markers.some((marker) => isMarkerOutOfRange(marker))) reportsWithAbnormal++;
    });
    return {
      earliest: dates[0],
      latest: dates[dates.length - 1],
      uniqueMarkers: allMarkers.size,
      reportsWithAbnormal
    };
  }, [reports, isMarkerOutOfRange]);

  const startEditingReport = (report: LabReport) => {
    if (isShareMode) {
      return;
    }
    const normalizedAnchorState = normalizeAnchorState(report.annotations);
    setEditingReportId(report.id);
    setEditingAnnotations({
      ...report.annotations,
      supplementAnchorState: normalizedAnchorState,
      supplementOverrides:
        normalizedAnchorState === "anchor"
          ? report.annotations.supplementOverrides ?? []
          : normalizedAnchorState === "none"
            ? []
            : null
    });
    setSupplementNameInput("");
    setSupplementDoseInput("");
    setSupplementFrequencyInput("daily");
  };

  const cancelEditingReport = () => {
    setEditingReportId(null);
    setEditingAnnotations(blankAnnotations());
    setSupplementNameInput("");
    setSupplementDoseInput("");
    setSupplementFrequencyInput("daily");
  };

  const closeUnitReview = () => {
    setActiveUnitReview(null);
    setUnitReviewSelection("");
    setActiveUnitReviewAnchor(null);
  };

  const openUnitReview = (reportId: string, marker: ReviewMarker) => {
    setActiveUnitReview({ reportId, markerId: marker.id });
    setUnitReviewSelection(marker._unitReview?.suggestion?.unit ?? "");
    setActiveUnitReviewAnchor(unitReviewAnchorRefs.current[`${reportId}:${marker.id}`] ?? null);
  };

  const confirmUnitReview = () => {
    if (!activeUnitReview || !unitReviewSelection.trim()) {
      return;
    }
    onUpdateReportMarkerUnit(activeUnitReview.reportId, activeUnitReview.markerId, unitReviewSelection);
    closeUnitReview();
  };

  const hasUnsavedProtocolVersionChanges =
    protocolVersionEditorReportId !== null &&
    canonicalizeProtocolDraftForCompare(protocolVersionDraft) !== canonicalizeProtocolDraftForCompare(protocolVersionInitialDraft);

  const closeProtocolVersionEditor = () => {
    setProtocolVersionEditorReportId(null);
    const emptyDraft = blankProtocolDraft();
    setProtocolVersionDraft(emptyDraft);
    setProtocolVersionInitialDraft(emptyDraft);
    setProtocolVersionLinkedInterventionId(null);
    setProtocolVersionFeedback("");
  };

  const requestCloseProtocolVersionEditor = () => {
    if (
      hasUnsavedProtocolVersionChanges &&
      typeof window !== "undefined" &&
      !window.confirm(
        tr(
          "Je hebt niet-opgeslagen wijzigingen voor deze rapportversie. Weet je zeker dat je wilt sluiten?",
          "You have unsaved changes for this report version. Are you sure you want to close?"
        )
      )
    ) {
      return;
    }
    closeProtocolVersionEditor();
  };

  const openProtocolVersionEditor = (report: LabReport) => {
    if (isShareMode) {
      return;
    }
    const resolvedProtocol = getReportProtocol(report, protocols);
    const snapshot = normalizeInterventionSnapshot(report.annotations.interventionSnapshot);
    const linkedInterventionId =
      report.annotations.interventionId ??
      report.annotations.protocolId ??
      snapshot?.interventionId ??
      resolvedProtocol?.id ??
      null;
    const baseName =
      snapshot?.name ??
      resolvedProtocol?.name ??
      report.annotations.interventionLabel ??
      report.annotations.protocol ??
      "";
    const baseCompounds = cloneCompoundEntries(
      snapshot?.compounds ??
        (resolvedProtocol
          ? resolvedProtocol.compounds.length > 0
            ? resolvedProtocol.compounds
            : resolvedProtocol.items
          : [])
    );
    const editorCompounds = compoundsForProtocolEditor(baseCompounds);
    const nextDraft: ProtocolDraft = {
      name: baseName,
      effectiveFrom: snapshot?.effectiveFrom ?? report.testDate ?? todayIsoDate(),
      items: editorCompounds,
      compounds: editorCompounds,
      notes: snapshot?.notes ?? resolvedProtocol?.notes ?? ""
    };
    setProtocolVersionEditorReportId(report.id);
    setProtocolVersionDraft(nextDraft);
    setProtocolVersionInitialDraft(nextDraft);
    setProtocolVersionLinkedInterventionId(linkedInterventionId);
    setProtocolVersionFeedback("");
  };

  const saveReportProtocolVersion = () => {
    if (!protocolVersionEditorReportId) {
      return;
    }
    const report = reports.find((entry) => entry.id === protocolVersionEditorReportId);
    if (!report) {
      return;
    }
    const name = protocolVersionDraft.name.trim();
    const effectiveFrom = protocolVersionDraft.effectiveFrom.trim() || report.testDate || todayIsoDate();
    const compounds = compoundsForProtocolStorage(cloneCompoundEntries(protocolVersionDraft.compounds));
    if (!name) {
      setProtocolVersionFeedback(tr("Geef een protocolnaam op.", "Please enter a protocol name."));
      return;
    }
    if (compounds.length === 0) {
      setProtocolVersionFeedback(tr("Voeg minimaal 1 compound toe.", "Add at least 1 compound."));
      return;
    }
    const existingSnapshot = normalizeInterventionSnapshot(report.annotations.interventionSnapshot);
    const snapshotVersionId =
      existingSnapshot?.versionId ??
      report.annotations.interventionVersionId ??
      report.annotations.protocolVersionId ??
      createId();
    const linkedInterventionId =
      protocolVersionLinkedInterventionId ??
      report.annotations.interventionId ??
      report.annotations.protocolId ??
      existingSnapshot?.interventionId ??
      null;
    const nextAnnotations: ReportAnnotations = {
      ...report.annotations,
      interventionId: linkedInterventionId,
      interventionLabel: name,
      interventionVersionId: snapshotVersionId,
      interventionSnapshot: {
        interventionId: linkedInterventionId,
        versionId: snapshotVersionId,
        name,
        items: compounds,
        compounds,
        notes: protocolVersionDraft.notes,
        effectiveFrom
      },
      protocolId: linkedInterventionId,
      protocolVersionId: snapshotVersionId,
      protocol: name
    };
    onUpdateReportAnnotations(report.id, nextAnnotations);
    closeProtocolVersionEditor();
  };

  const saveEditedReport = () => {
    if (!editingReportId) {
      return;
    }
    const normalizedAnchorState = normalizeAnchorState(editingAnnotations);
    const normalizedAnnotations: ReportAnnotations = {
      ...editingAnnotations,
      supplementAnchorState: normalizedAnchorState,
      supplementOverrides:
        normalizedAnchorState === "anchor"
          ? editingAnnotations.supplementOverrides ?? []
          : normalizedAnchorState === "none"
            ? []
            : null
    };
    onUpdateReportAnnotations(editingReportId, normalizedAnnotations);
    setEditingReportId(null);
    setEditingAnnotations(blankAnnotations());
    setSupplementNameInput("");
    setSupplementDoseInput("");
    setSupplementFrequencyInput("daily");
  };

  const deleteSelectedReports = () => {
    if (selectedReports.length === 0) {
      return;
    }
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        tr(
          `Weet je zeker dat je ${selectedReports.length} geselecteerde rapporten wilt verwijderen?`,
          `Are you sure you want to delete ${selectedReports.length} selected reports?`
        )
      )
    ) {
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

  const setEditingSupplementState = (state: ReportAnnotations["supplementAnchorState"], report: LabReport) => {
    setEditingAnnotations((current) => {
      if (state === "inherit") {
        return {
          ...current,
          supplementAnchorState: "inherit",
          supplementOverrides: null
        };
      }
      if (state === "unknown") {
        return {
          ...current,
          supplementAnchorState: "unknown",
          supplementOverrides: null
        };
      }
      if (state === "none") {
        return {
          ...current,
          supplementAnchorState: "none",
          supplementOverrides: []
        };
      }

      const context = reportSupplementContexts[report.id];
      const seeded = current.supplementOverrides ?? toSingleDayOverrides(context?.effectiveSupplements ?? [], report.testDate);
      return {
        ...current,
        supplementAnchorState: "anchor",
        supplementOverrides: seeded
      };
    });
  };

  const addEditingSupplementOverride = (report: LabReport) => {
    const name = canonicalizeSupplement(supplementNameInput);
    if (!name) {
      return;
    }
    const period: SupplementPeriod = {
      id: createId(),
      name,
      dose: supplementDoseInput.trim(),
      frequency: supplementFrequencyInput.trim() || "unknown",
      startDate: report.testDate,
      endDate: report.testDate
    };
    setEditingAnnotations((current) => ({
      ...current,
      supplementAnchorState: "anchor",
      supplementOverrides: [...(current.supplementOverrides ?? []), period]
    }));
    setSupplementNameInput("");
    setSupplementDoseInput("");
    setSupplementFrequencyInput("daily");
  };

  const removeEditingSupplementOverride = (id: string) => {
    setEditingAnnotations((current) => {
      const next = (current.supplementOverrides ?? []).filter((item) => item.id !== id);
      return {
        ...current,
        supplementAnchorState: next.length > 0 ? "anchor" : "none",
        supplementOverrides: next.length > 0 ? next : []
      };
    });
  };

  const toggleReportSelection = (reportId: string) => {
    setSelectedReports((current) => {
      if (current.includes(reportId)) {
        return current.filter((id) => id !== reportId);
      }
      return [...current, reportId];
    });
  };

  // Left border + health indicator color based on abnormal count
  const cardHealthClass = (report: LabReport): string => {
    const abnormalCount = report.markers.filter((marker) => isMarkerOutOfRange(marker)).length;
    if (abnormalCount === 0) return "border-l-slate-700/60";
    if (abnormalCount <= 2) return "border-l-amber-500/60";
    return "border-l-rose-500/60";
  };

  const abnormalCountForReport = (report: LabReport): number =>
    report.markers.filter((marker) => isMarkerOutOfRange(marker)).length;

  return (
    <section className="space-y-3 fade-in">
      {/* ── Stats + toolbar row ── */}
      <div className="app-teal-glow-surface rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
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
              <span className="text-slate-400">{tr("unieke biomarkers", "unique biomarkers")}</span>
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
          <div className="flex flex-wrap items-center gap-2">
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
              className={`items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-sm text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 ${selectedReports.length >= 2 ? "inline-flex" : "hidden sm:inline-flex"}`}
              disabled={selectedReports.length < 2}
              onClick={() => setReportComparisonOpen((prev) => !prev)}
            >
              <ClipboardList className="h-4 w-4" /> {tr("Vergelijk selectie", "Compare selected")}
            </button>
            <button
              type="button"
              className={`items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-sm text-rose-300 hover:bg-rose-500/20 disabled:opacity-50 ${selectedReports.length > 0 ? "inline-flex" : "hidden sm:inline-flex"}`}
              disabled={selectedReports.length === 0 || isShareMode}
              onClick={deleteSelectedReports}
            >
              <Trash2 className="h-4 w-4" /> {tr("Verwijder selectie", "Delete selected")}
            </button>
          </div>
        </div>
      </div>

      {reportComparisonOpen && compareReports.length >= 2 ? (
        <div className="app-teal-glow-surface overflow-x-auto rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
          <h4 className="mb-2 text-sm font-semibold text-slate-100">
            {tr("Vergelijking van geselecteerde rapporten", "Selected report comparison")}
          </h4>
          <table className="min-w-full divide-y divide-slate-700 text-xs sm:text-sm">
            <thead className="bg-slate-900/70 text-slate-300">
              <tr>
                <th className="px-2 py-2 text-left">{tr("Biomarker", "Biomarker")}</th>
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
        const annotationProtocolLabel = (report.annotations.interventionLabel ?? report.annotations.protocol ?? "").trim();
        const snapshotProtocolLabel =
          report.annotations.interventionSnapshot && typeof report.annotations.interventionSnapshot.name === "string"
            ? report.annotations.interventionSnapshot.name.trim()
            : "";
        const protocolLabel =
          getProtocolDisplayLabel(protocol).trim() || snapshotProtocolLabel || annotationProtocolLabel;
        const dose = getProtocolDoseMgPerWeek(protocol);
        const supplementContext = reportSupplementContexts[report.id];
        const supplementAnchorState = normalizeAnchorState(report.annotations);
        const timelineSupplementsAtDate = getActiveSupplementsAtDate(supplementTimeline, report.testDate);
        const inheritedFallbackSupplements =
          supplementAnchorState === "inherit" && supplementContext?.effectiveState === "unknown"
            ? timelineSupplementsAtDate
            : supplementContext?.effectiveSupplements ?? [];
        const inheritedFallbackState =
          supplementAnchorState === "inherit" && supplementContext?.effectiveState === "unknown"
            ? timelineSupplementsAtDate.length > 0
              ? "anchor"
              : "none"
            : supplementContext?.effectiveState ?? "none";
        const inheritedSourceLabel = `${tr("op basis van schema op", "based on schedule on")} ${formatDate(report.testDate)}`;
        const symptomsText = report.annotations.symptoms.trim();
        const notesText = report.annotations.notes.trim();
        const detailCardClass = isDarkTheme
          ? "rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300"
          : "rounded-lg border border-slate-200/90 bg-slate-50/90 p-2.5 text-xs text-slate-700";
        const detailLabelClass = isDarkTheme ? "block text-slate-400" : "block text-slate-500";
        const detailValueClass = isDarkTheme ? "text-sm text-slate-100" : "text-sm text-slate-900";
        const protocolBadgeClass = isDarkTheme
          ? "rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-left text-xs text-cyan-200 hover:border-cyan-400"
          : "rounded-full border border-cyan-500/45 bg-cyan-500/10 px-2 py-0.5 text-left text-xs text-cyan-700 hover:border-cyan-500";
        const supplementUnknownBadgeClass = isDarkTheme
          ? "mt-1 inline-flex rounded-full border border-slate-500/60 bg-slate-700/70 px-2 py-0.5 text-xs text-slate-100"
          : "mt-1 inline-flex rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-700";
        const supplementNoneBadgeClass = isDarkTheme
          ? "mt-1 inline-flex rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200"
          : "mt-1 inline-flex rounded-full border border-amber-400/60 bg-amber-50 px-2 py-0.5 text-xs text-amber-700";
        const supplementChipClass = isDarkTheme
          ? "inline-flex max-w-full items-center rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-100"
          : "inline-flex max-w-full items-center rounded-full border border-cyan-400/55 bg-cyan-50 px-2 py-0.5 text-xs text-cyan-800";
        const supplementToggleClass = isDarkTheme
          ? "inline-flex items-center rounded-full border border-slate-500/70 bg-slate-700/70 px-2 py-0.5 text-xs text-slate-100 hover:border-slate-400/80"
          : "inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:border-slate-400";
        const showAllSupplements = expandedSupplementReportIds.includes(report.id);
        const supplementPreviewLimit = 4;
        const totalSupplements = inheritedFallbackSupplements.length;
        const visibleSupplements =
          showAllSupplements || totalSupplements <= supplementPreviewLimit
            ? inheritedFallbackSupplements
            : inheritedFallbackSupplements.slice(0, supplementPreviewLimit);
        const hiddenSupplementCount = Math.max(0, totalSupplements - visibleSupplements.length);
        const editingSupplementState = normalizeAnchorState(editingAnnotations);
        const editingOverrideSupplements = editingAnnotations.supplementOverrides ?? [];
        const editingEffectiveSupplements =
          editingSupplementState === "anchor"
            ? editingOverrideSupplements
            : editingSupplementState === "none" || editingSupplementState === "unknown"
              ? []
              : inheritedFallbackSupplements;
        const abnormalCount = abnormalCountForReport(report);
        const baselineOverlapMarkers = baselineOverlapByReportId.get(report.id) ?? [];
        const baselineSetBlocked = !report.isBaseline && baselineOverlapMarkers.length > 0;
        const overlapPreview =
          baselineOverlapMarkers.length > 3
            ? `${baselineOverlapMarkers.slice(0, 3).join(", ")} +${baselineOverlapMarkers.length - 3}`
            : baselineOverlapMarkers.join(", ");
        const reviewedMarkers = report.markers.map((marker) => enrichMarkerForReview(marker));
        const groupedMarkers = Array.from(
          reviewedMarkers.reduce((map, marker) => {
            const key = marker.category ?? "Other";
            const list = map.get(key) ?? [];
            list.push(marker);
            map.set(key, list);
            return map;
          }, new Map<string, ReviewMarker[]>())
        )
          .map(([category, markers]) => {
            const sortedMarkers = [...markers].sort((left, right) =>
              getMarkerDisplayName(left.canonicalMarker, language).localeCompare(getMarkerDisplayName(right.canonicalMarker, language))
            );
            const rank = sortedMarkers.some((marker) => markerReviewOverall(marker) === "error")
              ? 0
              : sortedMarkers.some((marker) => markerReviewOverall(marker) === "review")
                ? 1
                : 2;
            return { category, markers: sortedMarkers, rank };
          })
          .sort((left, right) => {
            if (left.rank !== right.rank) {
              return left.rank - right.rank;
            }
            return left.category.localeCompare(right.category);
          });

        return (
          <article
            key={report.id}
            data-report-id={report.id}
            className={`app-teal-glow-surface rounded-2xl border border-slate-700/70 border-l-2 ${cardHealthClass(report)} bg-slate-900/60 transition-colors hover:bg-slate-900/80`}
          >
            {/* ── Collapsed header ── */}
            <div className="flex w-full min-w-0 items-start gap-2 px-2 py-1.5">
              <span className="flex h-12 w-8 shrink-0 flex-col items-center justify-between py-0.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700/70 bg-slate-800/65 text-cyan-300/85">
                  <FileText className="h-4 w-4" />
                </span>
                <button
                  type="button"
                  aria-label={tr("Selecteer rapport", "Select report")}
                  aria-pressed={selectedReports.includes(report.id)}
                  className={`mt-2 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border leading-none transition-colors ${
                    selectedReports.includes(report.id)
                      ? isDarkTheme
                        ? "border-cyan-400/70 bg-cyan-500/25 text-cyan-100"
                        : "border-cyan-500/70 bg-cyan-500/20 text-cyan-700"
                      : isDarkTheme
                        ? "border-slate-500/80 bg-slate-800/55 text-transparent hover:border-slate-400/90 hover:bg-slate-700/70"
                        : "border-slate-400/85 bg-slate-200/70 text-transparent hover:border-slate-500 hover:bg-slate-300/70"
                  }`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleReportSelection(report.id);
                  }}
                >
                  <Check className="h-2.5 w-2.5" />
                </button>
              </span>
              <button
                type="button"
                onClick={(event) => {
                  const target = event.target as HTMLElement | null;
                  const clickedProtocolChip = target?.closest("[data-report-protocol-chip='true']");
                  if (clickedProtocolChip && protocol && !isShareMode) {
                    event.preventDefault();
                    event.stopPropagation();
                    openProtocolVersionEditor(report);
                    return;
                  }
                  if (isExpanded && isEditing) {
                    cancelEditingReport();
                  }
                  setExpandedReportIds((current) =>
                    current.includes(report.id) ? current.filter((id) => id !== report.id) : [...current, report.id]
                  );
                }}
                className="flex min-w-0 flex-1 rounded-xl text-left"
                aria-label={isExpanded ? tr("Inklappen", "Collapse") : tr("Uitklappen", "Expand")}
              >
                <span className="flex w-full min-w-0 flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between">
                  <span className="flex min-w-0 items-start gap-2">
                    <span className="min-w-0">
                      <span className="block text-[1.05rem] font-semibold leading-tight tracking-tight text-slate-100 sm:text-[1.16rem]">
                        {formatDate(report.testDate)}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-slate-400">{report.sourceFileName}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        {report.isBaseline && (
                          <span className="rounded-full border border-cyan-400/50 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-300">
                            Baseline
                          </span>
                        )}
                        {protocolLabel && (
                          <span
                            data-report-protocol-chip="true"
                            title={
                              !isShareMode && protocol
                                ? tr(
                                    "Klik om protocol voor dit rapport te bewerken",
                                    "Click to edit protocol for this report"
                                  )
                                : undefined
                            }
                            className={`rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-300 ${
                              !isShareMode && protocol ? "cursor-pointer hover:border-violet-400/60 hover:bg-violet-500/20" : ""
                            }`}
                          >
                            {protocolLabel}
                          </span>
                        )}
                        <span className="rounded-full border border-slate-600/90 bg-slate-800/75 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                          {report.markers.length} {tr("biomarkers", "biomarkers")}
                        </span>
                      </span>
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center justify-end gap-1">
                    {abnormalCount > 0 && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          abnormalCount >= 3
                            ? "bg-rose-500/15 text-rose-300"
                            : "bg-amber-500/15 text-amber-300"
                        }`}
                        aria-label={tr("Afwijkende biomarkers in dit rapport", "Out-of-range biomarkers in this report")}
                        title={tr("Afwijkende biomarkers in dit rapport", "Out-of-range biomarkers in this report")}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {abnormalCount}
                      </span>
                    )}
                    <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </span>
                </span>
              </button>
            </div>

            <AnimatePresence initial={false}>
              {isExpanded ? (
                <motion.div
                  key={`${report.id}-expanded`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-slate-700/50 px-4 pb-4 pt-3">
                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2">
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
                    <span
                      className={baselineSetBlocked ? "inline-flex cursor-help" : "inline-flex"}
                      title={
                        baselineSetBlocked
                          ? tr(
                              `Niet mogelijk: marker-overlap met bestaande baseline (${overlapPreview}).`,
                              `Not possible: marker overlap with existing baseline (${overlapPreview}).`
                            )
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs ${
                          report.isBaseline
                            ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200"
                            : baselineSetBlocked
                              ? "pointer-events-none cursor-not-allowed border-slate-700 bg-slate-800/60 text-slate-500"
                            : "border-slate-600 bg-slate-800/70 text-slate-200 hover:border-slate-500"
                        }`}
                        disabled={baselineSetBlocked}
                        onClick={() => onSetBaseline(report.id)}
                      >
                        <Lock className="h-3.5 w-3.5" />{" "}
                        {report.isBaseline
                          ? tr("Verwijder baseline", "Remove baseline")
                          : tr("Zet als baseline", "Set baseline")}
                      </button>
                    </span>
                  ) : null}

                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                    disabled={isShareMode}
                    onClick={() => {
                      if (
                        typeof window !== "undefined" &&
                        !window.confirm(
                          tr(
                            `Weet je zeker dat je rapport van ${formatDate(report.testDate)} wilt verwijderen?`,
                            `Are you sure you want to delete the report from ${formatDate(report.testDate)}?`
                          )
                        )
                      ) {
                        return;
                      }
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
                      <span className="mb-1 block text-slate-400">{tr("Protocol koppelen", "Link protocol")}</span>
                      <select
                        className="w-full rounded-md border border-slate-600 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100"
                        value={editingAnnotations.interventionId ?? editingAnnotations.protocolId ?? ""}
                        onChange={(event) => {
                          const nextId = event.target.value ? event.target.value : null;
                          const nextProtocol = protocols.find((item) => item.id === nextId);
                          const nextLabel = nextProtocol?.name ?? "";
                          setEditingAnnotations((current) => ({
                            ...current,
                            interventionId: nextId,
                            interventionLabel: nextLabel,
                            protocolId: nextId,
                            protocolVersionId: null,
                            interventionVersionId: null,
                            interventionSnapshot: null,
                            protocol: nextLabel
                          }));
                        }}
                      >
                        <option value="">{tr("Geen gekoppeld protocol", "No linked protocol")}</option>
                        {protocols.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                      {protocols.length === 0 ? (
                        <span className="mt-1 block text-[11px] text-amber-300">
                          {tr(
                            "Nog geen protocol aangemaakt. Maak er eerst een in Protocols; je kunt dit rapport later altijd koppelen.",
                            "No protocol exists yet. Create one in Protocols first; you can always link this report later."
                          )}
                        </span>
                      ) : (
                        <span className="mt-1 block text-[11px] text-slate-400">
                          {tr(
                            "Je kunt nu koppelen of later aanpassen; dit blijft bewerkbaar.",
                            "You can link now or later; this stays editable."
                          )}
                        </span>
                      )}
                      <button
                        type="button"
                        className="mt-2 inline-flex items-center gap-1 rounded-md border border-cyan-500/35 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200 hover:border-cyan-400/60 hover:bg-cyan-500/20"
                        onClick={onOpenProtocolTab}
                      >
                        {tr("Open Protocols", "Open Protocols")}
                      </button>
                    </label>
                    <label className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                      <span className="mb-1 block text-slate-400">{tr("Protocoldetails (optioneel)", "Protocol details (optional)")}</span>
                      <input
                        className="w-full rounded-md border border-slate-600 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100"
                        value={editingAnnotations.protocol}
                        onChange={(event) =>
                          setEditingAnnotations((current) => ({
                            ...current,
                            protocol: event.target.value
                          }))
                        }
                        placeholder={tr("bijv. injectieplek, timing, bijzonderheden", "e.g. injection site, timing, notes")}
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
                    <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300 sm:col-span-2">
                      <span className="mb-1 block text-slate-400">{tr("Supplementen op testdatum", "Supplements at test date")}</span>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={`rounded-md border px-2.5 py-1 text-xs ${
                            editingSupplementState === "inherit"
                              ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200"
                              : "border-slate-600 text-slate-200 hover:border-cyan-500/50"
                          }`}
                          onClick={() => setEditingSupplementState("inherit", report)}
                        >
                          {tr("Nee, zelfde", "No, same")}
                        </button>
                        <button
                          type="button"
                          className={`rounded-md border px-2.5 py-1 text-xs ${
                            editingSupplementState === "anchor"
                              ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200"
                              : "border-slate-600 text-slate-200 hover:border-cyan-500/50"
                          }`}
                          onClick={() => setEditingSupplementState("anchor", report)}
                        >
                          {tr("Ja, aangepast", "Yes, changed")}
                        </button>
                        <button
                          type="button"
                          className={`rounded-md border px-2.5 py-1 text-xs ${
                            editingSupplementState === "unknown"
                              ? "border-slate-500/70 bg-slate-700 text-slate-100"
                              : "border-slate-600 text-slate-200 hover:border-slate-500"
                          }`}
                          onClick={() => setEditingSupplementState("unknown", report)}
                        >
                          {tr("Onbekend", "Unknown")}
                        </button>
                        <button
                          type="button"
                          className={`rounded-md border px-2.5 py-1 text-xs ${
                            editingSupplementState === "none"
                              ? "border-amber-500/60 bg-amber-500/15 text-amber-200"
                              : "border-slate-600 text-slate-200 hover:border-amber-500/50"
                          }`}
                          onClick={() => setEditingSupplementState("none", report)}
                        >
                          {tr("Geen supplementen", "No supplements")}
                        </button>
                      </div>
                      <p className="mt-2 text-[11px] text-slate-400">
                        {editingSupplementState === "inherit"
                          ? `${tr("Erft", "Inherits")} ${inheritedSourceLabel}.`
                          : editingSupplementState === "unknown"
                            ? tr("Gemarkeerd als onbekend voor deze datum.", "Marked as unknown for this date.")
                            : editingSupplementState === "none"
                              ? tr("Expliciet geen supplementen op deze datum.", "Explicitly no supplements on this date.")
                              : tr("Dit rapport gebruikt een aangepaste stack voor alleen deze testdatum.", "This report uses a custom stack for this test date only.")}
                      </p>
                      <p className="mt-1 text-sm text-slate-200">
                        {editingSupplementState === "unknown"
                          ? tr("Onbekend op testdatum", "Unknown at test date")
                          : editingSupplementState === "none"
                            ? tr("Geen supplementen", "No supplements")
                            : supplementPeriodsToText(editingEffectiveSupplements) || tr("Geen supplementen", "No supplements")}
                      </p>

                      {editingSupplementState === "anchor" ? (
                        <div className="mt-3 space-y-3 rounded-md border border-slate-700 bg-slate-900/60 p-3">
                          <div className="grid gap-2 md:grid-cols-[1.3fr_1fr_1fr_auto]">
                            <div>
                              <label className="mb-1 block text-xs text-slate-400">{tr("Supplement", "Supplement")}</label>
                              <input
                                value={supplementNameInput}
                                onChange={(event) => setSupplementNameInput(event.target.value)}
                                placeholder={tr("Zoek of typ supplement", "Search or type supplement")}
                                className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                              />
                              {supplementSuggestions.length > 0 ? (
                                <div className="mt-1 rounded-md border border-slate-700 bg-slate-900/95 p-1">
                                  {supplementSuggestions.map((option) => (
                                    <button
                                      key={option}
                                      type="button"
                                      className="block w-full rounded px-2 py-1 text-left text-sm text-slate-200 hover:bg-slate-800"
                                      onClick={() => setSupplementNameInput(option)}
                                    >
                                      {option}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            <div>
                              <label className="mb-1 block text-xs text-slate-400">{tr("Dosis", "Dose")}</label>
                              <input
                                value={supplementDoseInput}
                                onChange={(event) => setSupplementDoseInput(event.target.value)}
                                placeholder={tr("bijv. 4000 IU", "e.g. 4000 IU")}
                                className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs text-slate-400">{tr("Frequentie", "Frequency")}</label>
                              <select
                                value={supplementFrequencyInput}
                                onChange={(event) => setSupplementFrequencyInput(event.target.value)}
                                className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                              >
                                {SUPPLEMENT_FREQUENCY_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {tr(option.label.nl, option.label.en)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-end">
                              <button
                                type="button"
                                className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
                                onClick={() => addEditingSupplementOverride(report)}
                              >
                                <Save className="mr-1 inline-block h-3.5 w-3.5" />
                                {tr("Toevoegen", "Add")}
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {editingOverrideSupplements.length === 0 ? (
                              <p className="text-sm text-slate-400">{tr("Nog geen stack-items toegevoegd.", "No stack items added yet.")}</p>
                            ) : (
                              editingOverrideSupplements.map((supplement) => (
                                <div key={supplement.id} className="flex items-center justify-between rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2">
                                  <p className="text-sm text-slate-200">
                                    <span className="font-medium">{supplement.name}</span>
                                    {supplement.dose ? ` · ${supplement.dose}` : ""}
                                    {` · ${supplementFrequencyLabel(supplement.frequency, language)}`}
                                  </p>
                                  <button
                                    type="button"
                                    className="rounded-md p-1 text-slate-400 hover:bg-slate-700 hover:text-rose-300"
                                    onClick={() => removeEditingSupplementOverride(supplement.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    <div className={detailCardClass}>
                      <span className={detailLabelClass}>{tr("Dosis", "Dose")}</span>
                      <strong className={detailValueClass}>{dose === null ? "-" : `${dose} mg/week`}</strong>
                    </div>
                    <div className={detailCardClass}>
                      <span className={detailLabelClass}>{tr("Protocol", "Protocol")}</span>
                      {protocol ? (
                        <button
                          type="button"
                          className={protocolBadgeClass}
                          onClick={() => openProtocolVersionEditor(report)}
                        >
                          {protocolLabel}
                        </button>
                      ) : (
                        <strong className={detailValueClass}>{protocolLabel || "-"}</strong>
                      )}
                    </div>
                    <div className={detailCardClass}>
                      <span className={detailLabelClass}>{tr("Compound", "Compound")}</span>
                      <strong className={`break-words ${detailValueClass}`}>{getProtocolCompoundsText(protocol) || "-"}</strong>
                    </div>
                    <div className={detailCardClass}>
                      <span className={detailLabelClass}>{tr("Injectiefrequentie", "Injection frequency")}</span>
                      <strong className={detailValueClass}>{getProtocolFrequencyLabel(protocol, language)}</strong>
                    </div>
                    <div className={detailCardClass}>
                      <span className={detailLabelClass}>{tr("Meetmoment", "Sampling timing")}</span>
                      <strong className={detailValueClass}>{samplingTimingLabel(report.annotations.samplingTiming)}</strong>
                    </div>
                    <div className={`${detailCardClass} sm:col-span-2 xl:col-span-3`}>
                      <span className={detailLabelClass}>{tr("Supplementen", "Supplements")}</span>
                      {inheritedFallbackState === "unknown" ? (
                        <span className={supplementUnknownBadgeClass}>
                          {tr("Onbekend op testdatum", "Unknown at test date")}
                        </span>
                      ) : inheritedFallbackState === "none" || totalSupplements === 0 ? (
                        <span className={supplementNoneBadgeClass}>
                          {tr("Geen supplementen", "No supplements")}
                        </span>
                      ) : (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {visibleSupplements.map((supplement) => {
                            const doseText = supplement.dose.trim();
                            const hasKnownFrequency = supplement.frequency.trim().length > 0 && supplement.frequency.trim() !== "unknown";
                            const frequencyText = hasKnownFrequency ? supplementFrequencyLabel(supplement.frequency, language) : "";
                            const compactSuffix = doseText || frequencyText;
                            const compactLabel = compactSuffix ? `${supplement.name} ${compactSuffix}` : supplement.name;
                            const fullLabel = [supplement.name, doseText || null, frequencyText || null].filter(Boolean).join(" · ");
                            return (
                              <span
                                key={supplement.id}
                                className={supplementChipClass}
                                title={fullLabel}
                              >
                                <span className="truncate">{compactLabel}</span>
                              </span>
                            );
                          })}
                          {hiddenSupplementCount > 0 ? (
                            <button
                              type="button"
                              className={supplementToggleClass}
                              onClick={() =>
                                setExpandedSupplementReportIds((current) =>
                                  current.includes(report.id) ? current : [...current, report.id]
                                )
                              }
                            >
                              {tr(`+${hiddenSupplementCount} meer`, `+${hiddenSupplementCount} more`)}
                            </button>
                          ) : null}
                          {showAllSupplements && totalSupplements > supplementPreviewLimit ? (
                            <button
                              type="button"
                              className={supplementToggleClass}
                              onClick={() =>
                                setExpandedSupplementReportIds((current) => current.filter((id) => id !== report.id))
                              }
                            >
                              {tr("Minder tonen", "Show less")}
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                    {symptomsText ? (
                      <div className={detailCardClass}>
                        <span className={detailLabelClass}>{tr("Symptomen", "Symptoms")}</span>
                        <strong className={`break-words ${detailValueClass}`}>{symptomsText}</strong>
                      </div>
                    ) : null}
                    {notesText ? (
                      <div className={`${detailCardClass} sm:col-span-2 xl:col-span-2`}>
                        <span className={detailLabelClass}>{tr("Notities", "Notes")}</span>
                        <strong className={`break-words ${detailValueClass}`}>{notesText}</strong>
                      </div>
                    ) : null}
                  </div>
                )}

                <div className="mt-3 space-y-2">
                  {groupedMarkers.map((group) => (
                    <details key={`${report.id}-${group.category}`} open className="overflow-hidden rounded-lg border border-slate-700">
                      <summary className="flex cursor-pointer items-center justify-between bg-slate-900/65 px-3 py-2 text-sm text-slate-200">
                        <span className="inline-flex items-center gap-2">
                          <span className="font-medium">{group.category}</span>
                          <span className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                            {group.markers.length}
                          </span>
                          {group.rank === 0 ? (
                            <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-200">
                              {tr("Fout", "Error")}
                            </span>
                          ) : group.rank === 1 ? (
                            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
                              {tr("Controleren", "Review")}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-xs text-slate-400">{tr("klik om in/uit te klappen", "click to collapse/expand")}</span>
                      </summary>
                      <div className="overflow-visible">
                        <table className="min-w-full divide-y divide-slate-700 text-xs sm:text-sm">
                          <thead className="bg-slate-900/70 text-slate-300">
                            <tr>
                              <th className="px-3 py-2 text-left">{tr("Biomarker", "Biomarker")}</th>
                              <th className="px-3 py-2 text-right">{tr("Waarde", "Value")}</th>
                              <th className="px-3 py-2 text-left">{tr("Eenheid", "Unit")}</th>
                              <th className="px-3 py-2 text-right">{tr("Bereik", "Range")}</th>
                              <th className="px-3 py-2 text-right">{tr("Review", "Review")}</th>
                              <th className="px-3 py-2 text-right">{tr("Status", "Status")}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {group.markers.map((marker) => {
                              const conversionInput = getMarkerConversionInput(marker);
                              const converted = convertBySystem(
                                conversionInput.canonicalMarker,
                                conversionInput.value,
                                conversionInput.unit,
                                settings.unitSystem
                              );
                              const markerAbnormal = markerAbnormalStatus(marker);
                              const min =
                                marker.referenceMin === null
                                  ? null
                                  : convertBySystem(
                                      conversionInput.canonicalMarker,
                                      marker.referenceMin,
                                      conversionInput.unit,
                                      settings.unitSystem
                                    ).value;
                              const max =
                                marker.referenceMax === null
                                  ? null
                                  : convertBySystem(
                                      conversionInput.canonicalMarker,
                                      marker.referenceMax,
                                      conversionInput.unit,
                                      settings.unitSystem
                                    ).value;
                              const issuesTitle = markerReviewTooltip(marker);
                              const issuesTooltipId = `report-marker-review-tooltip-${report.id}-${group.category}-${marker.id}`;
                              const unitReviewKey = `${report.id}:${marker.id}`;
                              const hasInteractiveUnitReview = isInteractiveUnitReview(marker);
                              const isUnitReviewOpen =
                                activeUnitReview?.reportId === report.id && activeUnitReview?.markerId === marker.id;
                              const unitReviewAriaLabel = marker._unitReview?.isMissingUnit
                                ? tr("Ontbrekende unit controleren", "Review missing unit")
                                : tr("Eenheid controleren", "Review unit");

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
                                          aria-label={tr("Biomarker hernoemen", "Rename biomarker")}
                                          title={tr("Biomarker hernoemen", "Rename biomarker")}
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
                                    {marker.rawMarker && marker.rawMarker.trim() && marker.rawMarker !== marker.marker ? (
                                      <p className="mt-1 text-[11px] text-slate-500">
                                        {tr("In rapport", "In report")}: {marker.rawMarker}
                                      </p>
                                    ) : null}
                                  </td>
                                  <td className="px-3 py-2 text-right">{converted.value.toFixed(2)}</td>
                                  <td className="px-3 py-2">{converted.unit}</td>
                                  <td className="px-3 py-2 text-right">
                                    {min === null || max === null ? "-" : `${Number(min.toFixed(2))} - ${Number(max.toFixed(2))}`}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <MarkerReviewBadge
                                      className={markerReviewClassName(marker)}
                                      icon={markerReviewIcon(marker)}
                                      label={markerReviewLabel(marker)}
                                      tooltip={hasInteractiveUnitReview ? undefined : issuesTitle}
                                      tooltipId={issuesTooltipId}
                                      buttonRef={(element) => {
                                        unitReviewAnchorRefs.current[unitReviewKey] = element;
                                      }}
                                      onClick={
                                        hasInteractiveUnitReview
                                          ? () => {
                                              if (isUnitReviewOpen) {
                                                closeUnitReview();
                                                return;
                                              }
                                              openUnitReview(report.id, marker);
                                            }
                                          : undefined
                                      }
                                      expanded={isUnitReviewOpen}
                                      ariaLabel={hasInteractiveUnitReview ? unitReviewAriaLabel : undefined}
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <span
                                      className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                                        markerAbnormal === "high"
                                          ? "bg-rose-500/20 text-rose-300"
                                          : markerAbnormal === "low"
                                            ? "bg-amber-500/20 text-amber-300"
                                            : "bg-emerald-500/20 text-emerald-300"
                                      }`}
                                    >
                                      {abnormalStatusLabel(markerAbnormal, language)}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ))}
                </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </article>
        );
      })}

      {protocolVersionEditorReportId
        ? createPortal(
            <div
              className="app-modal-overlay z-[96]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="report-protocol-version-modal-title"
            >
              <div className="app-modal-shell relative w-full max-w-5xl bg-slate-900" onClick={(event) => event.stopPropagation()}>
                <div className="app-modal-header p-5">
                  <div className="app-modal-header-glow" aria-hidden />
                  <div className="relative flex items-start justify-between gap-3">
                    <div>
                      <h4 id="report-protocol-version-modal-title" className="text-lg font-semibold text-slate-50">
                        {tr("Bewerk protocol voor dit rapport", "Edit protocol for this report")}
                      </h4>
                      <p className="mt-1 text-xs text-slate-300">
                        {tr(
                          "Deze wijziging geldt alleen voor dit rapport en verandert geen protocolgeschiedenis.",
                          "This change only applies to this report and does not change protocol history."
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="app-modal-close-btn"
                      onClick={requestCloseProtocolVersionEditor}
                      aria-label={tr("Sluiten", "Close")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="max-h-[calc(100vh-18rem)] overflow-y-auto p-5">
                  <ProtocolEditor value={protocolVersionDraft} language={language} onChange={setProtocolVersionDraft} />
                  {protocolVersionFeedback ? (
                    <p className="mt-3 text-sm text-rose-300">{protocolVersionFeedback}</p>
                  ) : null}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-700/60 p-4">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600/70 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-slate-100"
                    onClick={requestCloseProtocolVersionEditor}
                  >
                    <X className="h-4 w-4" /> {tr("Annuleren", "Cancel")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:border-emerald-400/70 hover:bg-emerald-500/22"
                    onClick={saveReportProtocolVersion}
                  >
                    <Save className="h-4 w-4" /> {tr("Sla rapportprotocol op", "Save report protocol")}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {activeUnitReview && activeUnitReviewMarker?._unitReview ? (
        <MarkerUnitReviewPopover
          anchorRef={{ current: activeUnitReviewAnchor }}
          language={language}
          theme={settings.theme}
          open
          unitReview={activeUnitReviewMarker._unitReview}
          selectedUnit={unitReviewSelection}
          onSelectedUnitChange={setUnitReviewSelection}
          onConfirm={confirmUnitReview}
          onClose={closeUnitReview}
        />
      ) : null}
    </section>
  );
};

export default ReportsView;
