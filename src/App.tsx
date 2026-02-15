import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addDays, format, parseISO } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useDropzone } from "react-dropzone";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import {
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  CheckSquare,
  ChevronDown,
  ClipboardList,
  Copy,
  Cog,
  Download,
  FileText,
  Gauge,
  Info,
  Loader2,
  Lock,
  Link2,
  Moon,
  Pencil,
  Plus,
  Save,
  Sparkles,
  SlidersHorizontal,
  Square,
  Sun,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import {
  MarkerSeriesPoint,
  MarkerTrendSummary,
  DosePrediction,
  ProtocolImpactDoseEvent,
  buildAlerts,
  buildAlertsByMarker,
  buildDoseCorrelationInsights,
  buildProtocolImpactDoseEvents,
  buildDosePhaseBlocks,
  buildMarkerSeries,
  buildProtocolImpactSummary,
  buildTrtStabilitySeries,
  calculatePercentChange,
  calculatePercentVsBaseline,
  classifyMarkerTrend,
  computeTrtStabilityIndex,
  enrichReportsWithCalculatedMarkers,
  estimateDoseResponse,
  filterReportsBySampling,
  getTargetZone
} from "./analytics";
import { analyzeLabDataWithClaude } from "./aiAnalysis";
import { buildCsv } from "./csvExport";
import { CARDIO_PRIORITY_MARKERS, PRIMARY_MARKERS, TAB_ITEMS } from "./constants";
import { getMarkerDisplayName, getMarkerMeta, getTabLabel, t } from "./i18n";
import trtLogo from "./assets/trt-logo.png";
import { exportElementToPdf } from "./pdfExport";
import { extractLabData } from "./pdfParsing";
import { buildShareToken, parseShareToken, ShareOptions } from "./share";
import { coerceStoredAppData, loadAppData, saveAppData } from "./storage";
import { canonicalizeMarker, convertBySystem, normalizeMarkerMeasurement } from "./unitConversion";
import {
  AppSettings,
  ExtractionDraft,
  LabReport,
  MarkerValue,
  ReportAnnotations,
  AppLanguage,
  TabKey,
  TimeRangeKey
} from "./types";
import {
  createId,
  deriveAbnormalFlag,
  formatDate,
  safeNumber,
  sortReportsChronological,
  withinRange
} from "./utils";

interface EditableCellProps {
  value: string | number | null;
  align?: "left" | "right";
  placeholder?: string;
  editLabel?: string;
  onCommit: (value: string) => void;
}

interface MarkerMergeSuggestion {
  sourceCanonical: string;
  targetCanonical: string;
  score: number;
}

const markerColor = (index: number): string => {
  const palette = ["#22d3ee", "#34d399", "#60a5fa", "#f59e0b", "#f472b6", "#facc15", "#a78bfa"];
  return palette[index % palette.length];
};

const formatAxisTick = (value: number): string => {
  const abs = Math.abs(value);
  let decimals = 2;
  if (abs >= 100) {
    decimals = 0;
  } else if (abs >= 10) {
    decimals = 1;
  } else if (abs < 1) {
    decimals = 3;
  }
  return Number(value.toFixed(decimals)).toString();
};

const buildYAxisDomain = (
  values: number[],
  mode: AppSettings["yAxisMode"]
): [number, number] | undefined => {
  if (values.length === 0) {
    return undefined;
  }

  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) {
    return undefined;
  }

  const span = Math.abs(dataMax - dataMin);
  const padding = span === 0 ? Math.max(Math.abs(dataMax) * 0.08, 1) : span * 0.08;

  if (mode === "data") {
    const min = dataMin - padding;
    const max = dataMax + padding;
    return max > min ? [min, max] : [dataMin - 1, dataMax + 1];
  }

  const min = dataMin < 0 ? dataMin - padding : 0;
  const max = dataMax + padding;
  return max > min ? [min, max] : [min, min + 1];
};

const blankAnnotations = (): ReportAnnotations => ({
  dosageMgPerWeek: null,
  protocol: "",
  supplements: "",
  symptoms: "",
  notes: "",
  samplingTiming: "trough"
});

const normalizeAnalysisTextForDisplay = (raw: string): string => {
  if (!raw.trim()) {
    return "";
  }

  return raw
    .replace(/\r\n/g, "\n")
    .replace(
      /([^\n])\s+(?=(Supplement:|Advies:|Huidige status|Optie:|Waarom nu|Verwachte impact:|Mogelijke nadelen:|Mogelijke nadelen\/barrières:|Praktische dosering|Praktische uitvoering|Wat monitoren|Evidentie uit betrouwbare studies:|Evidentie \(auteur\/jaar\/studietype\):|Leefstijlactie:|Confidence:))/g,
      "$1\n"
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const compactTooltipText = (value: string, maxLength = 64): string => {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "-";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(1, maxLength - 1))}\u2026`;
};

const clampNumber = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const stabilityColor = (score: number | null): string => {
  if (score === null) {
    return "#64748b";
  }
  if (score >= 80) {
    return "#22c55e";
  }
  if (score >= 60) {
    return "#f59e0b";
  }
  return "#fb7185";
};

const PROTOCOL_MARKER_CATEGORIES: Record<string, string[]> = {
  Hormones: ["Testosterone", "Free Testosterone", "Estradiol", "SHBG", "Free Androgen Index", "Dihydrotestosteron (DHT)"],
  Lipids: ["LDL Cholesterol", "HDL Cholesterol", "Cholesterol", "Triglyceriden", "Apolipoprotein B", "Non-HDL Cholesterol"],
  Hematology: ["Hematocrit", "Hemoglobin", "Red Blood Cells", "Platelets", "Leukocyten"],
  Inflammation: ["CRP"]
};

const normalizeMarkerKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const markerSimilarity = (left: string, right: string): number => {
  const a = normalizeMarkerKey(left);
  const b = normalizeMarkerKey(right);
  if (!a || !b) {
    return 0;
  }
  if (a === b) {
    return 1;
  }
  if (a.includes(b) || b.includes(a)) {
    return 0.9;
  }

  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  const sharedTokens = Array.from(aTokens).filter((token) => bTokens.has(token)).length;
  const tokenScore = (2 * sharedTokens) / (aTokens.size + bTokens.size);

  const aBigrams = new Set(Array.from({ length: Math.max(0, a.length - 1) }, (_, i) => a.slice(i, i + 2)));
  const bBigrams = new Set(Array.from({ length: Math.max(0, b.length - 1) }, (_, i) => b.slice(i, i + 2)));
  const sharedBigrams = Array.from(aBigrams).filter((token) => bBigrams.has(token)).length;
  const bigramScore = aBigrams.size === 0 || bBigrams.size === 0 ? 0 : (2 * sharedBigrams) / (aBigrams.size + bBigrams.size);

  return tokenScore * 0.65 + bigramScore * 0.35;
};

const dedupeMarkersInReport = (markers: MarkerValue[]): MarkerValue[] =>
  Array.from(
    markers
      .reduce((map, marker) => {
        const key = [
          marker.canonicalMarker,
          marker.value,
          marker.unit,
          marker.referenceMin ?? "",
          marker.referenceMax ?? "",
          marker.isCalculated ? "calc" : "raw"
        ].join("|");
        const existing = map.get(key);
        if (!existing || marker.confidence > existing.confidence) {
          map.set(key, marker);
        }
        return map;
      }, new Map<string, MarkerValue>())
      .values()
  );

const detectMarkerMergeSuggestions = (
  incomingCanonicalMarkers: string[],
  existingCanonicalMarkers: string[]
): MarkerMergeSuggestion[] => {
  const existingSet = new Set(existingCanonicalMarkers);
  const suggestions = incomingCanonicalMarkers
    .map((source) => {
      if (existingSet.has(source) || source === "Unknown Marker") {
        return null;
      }
      let bestTarget = "";
      let bestScore = 0;
      for (const candidate of existingCanonicalMarkers) {
        if (candidate === source) {
          continue;
        }
        const score = markerSimilarity(source, candidate);
        if (score > bestScore) {
          bestScore = score;
          bestTarget = candidate;
        }
      }
      if (!bestTarget || bestScore < 0.82) {
        return null;
      }
      return {
        sourceCanonical: source,
        targetCanonical: bestTarget,
        score: Number(bestScore.toFixed(2))
      } satisfies MarkerMergeSuggestion;
    })
    .filter((item): item is MarkerMergeSuggestion => item !== null);

  return Array.from(
    suggestions
      .reduce((map, suggestion) => {
        const key = `${suggestion.sourceCanonical}|${suggestion.targetCanonical}`;
        const existing = map.get(key);
        if (!existing || suggestion.score > existing.score) {
          map.set(key, suggestion);
        }
        return map;
      }, new Map<string, MarkerMergeSuggestion>())
      .values()
  );
};

const EditableCell = ({ value, align = "left", placeholder = "", editLabel = "Edit value", onCommit }: EditableCellProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value === null ? "" : String(value));

  useEffect(() => {
    setDraft(value === null ? "" : String(value));
  }, [value]);

  if (isEditing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          onCommit(draft);
          setIsEditing(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onCommit(draft);
            setIsEditing(false);
          }
          if (event.key === "Escape") {
            setDraft(value === null ? "" : String(value));
            setIsEditing(false);
          }
        }}
        placeholder={placeholder}
        className={`w-full rounded-md border border-cyan-500/40 bg-slate-900/80 px-2 py-1 text-sm text-slate-100 focus:outline-none ${
          align === "right" ? "text-right" : "text-left"
        }`}
      />
    );
  }

  return (
    <div className={`group relative min-h-7 ${align === "right" ? "text-right" : "text-left"}`}>
      <span className="pr-6 text-sm text-slate-200">{value === null || value === "" ? "-" : String(value)}</span>
      <button
        type="button"
        className="absolute right-0 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:text-cyan-300"
        onClick={() => setIsEditing(true)}
        aria-label={editLabel}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

interface UploadPanelProps {
  isProcessing: boolean;
  onFileSelected: (file: File) => void;
  language: AppLanguage;
}

const UploadPanel = ({ isProcessing, onFileSelected, language }: UploadPanelProps) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "application/pdf": [".pdf"]
    },
    maxFiles: 1,
    disabled: isProcessing,
    onDrop: (files) => {
      const file = files[0];
      if (!file) {
        return;
      }
      onFileSelected(file);
    }
  });

  return (
    <motion.div
      layout
      className={`upload-panel-shell rounded-2xl border border-dashed p-5 transition ${
        isDragActive
          ? "border-cyan-400 bg-cyan-500/10"
          : "border-slate-600/50 bg-slate-900/30 hover:border-cyan-500/50"
      }`}
    >
      <div
        {...getRootProps()}
        className="upload-panel-dropzone flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl px-4 py-9 text-center"
      >
        <input {...getInputProps()} />
        {isProcessing ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-cyan-300" />
            <p className="text-sm text-slate-200">
              {language === "nl" ? "PDF wordt verwerkt en labwaarden worden uitgelezen..." : "Processing PDF and extracting lab values..."}
            </p>
          </>
        ) : (
          <>
            <UploadCloud className="h-9 w-9 text-cyan-300" />
            <div>
              <p className="text-base font-semibold text-slate-100">
                {language === "nl" ? "Sleep je lab-PDF hierheen" : "Drag and drop your lab PDF here"}
              </p>
              <p className="mt-1 text-sm text-slate-300">{language === "nl" ? "of klik om te bladeren" : "or click to browse files"}</p>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};

interface ExtractionReviewProps {
  draft: ExtractionDraft;
  annotations: ReportAnnotations;
  language: AppLanguage;
  showSamplingTiming: boolean;
  onDraftChange: (draft: ExtractionDraft) => void;
  onAnnotationsChange: (annotations: ReportAnnotations) => void;
  onSave: () => void;
  onCancel: () => void;
}

const ExtractionReview = ({
  draft,
  annotations,
  language,
  showSamplingTiming,
  onDraftChange,
  onAnnotationsChange,
  onSave,
  onCancel
}: ExtractionReviewProps) => {
  const isNl = language === "nl";
  const tr = (nl: string, en: string): string => (isNl ? nl : en);
  const abnormalLabel = (value: MarkerValue["abnormal"]): string => {
    if (value === "high") {
      return tr("Hoog", "High");
    }
    if (value === "low") {
      return tr("Laag", "Low");
    }
    if (value === "normal") {
      return tr("Normaal", "Normal");
    }
    return tr("Onbekend", "Unknown");
  };

  const updateRow = (rowId: string, updater: (row: MarkerValue) => MarkerValue) => {
    onDraftChange({
      ...draft,
      markers: draft.markers.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        const next = updater(row);
        const normalized = normalizeMarkerMeasurement({
          canonicalMarker: next.canonicalMarker,
          value: next.value,
          unit: next.unit,
          referenceMin: next.referenceMin,
          referenceMax: next.referenceMax
        });
        return {
          ...next,
          value: normalized.value,
          unit: normalized.unit,
          referenceMin: normalized.referenceMin,
          referenceMax: normalized.referenceMax,
          abnormal: deriveAbnormalFlag(normalized.value, normalized.referenceMin, normalized.referenceMax)
        };
      })
    });
  };

  const addRow = () => {
    onDraftChange({
      ...draft,
      markers: [
        ...draft.markers,
        {
          id: createId(),
          marker: "",
          canonicalMarker: "Unknown Marker",
          value: 0,
          unit: "",
          referenceMin: null,
          referenceMax: null,
          abnormal: "unknown",
          confidence: 0.4
        }
      ]
    });
  };

  const removeRow = (rowId: string) => {
    onDraftChange({
      ...draft,
      markers: draft.markers.filter((row) => row.id !== rowId)
    });
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-cyan-500/30 bg-slate-900/70 p-4 shadow-soft"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">{tr("Controleer geëxtraheerde data", "Review extracted data")}</h2>
          <p className="text-sm text-slate-300">
            {draft.sourceFileName} | {draft.extraction.provider.toUpperCase()} {tr("betrouwbaarheid", "confidence")}{" "}
            <span className="font-medium text-cyan-300">{Math.round(draft.extraction.confidence * 100)}%</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {draft.extraction.needsReview ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" /> {tr("Controleren", "Needs review")}
            </span>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-400"
            onClick={onCancel}
          >
            <X className="h-4 w-4" /> {tr("Annuleren", "Cancel")}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-cyan-400"
            onClick={onSave}
          >
            <Save className="h-4 w-4" /> {tr("Rapport opslaan", "Save report")}
          </button>
        </div>
      </div>

      <div className={`mt-4 grid gap-3 md:grid-cols-2 ${showSamplingTiming ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{tr("Afnamedatum", "Test date")}</label>
          <input
            type="date"
            value={draft.testDate}
            onChange={(event) => onDraftChange({ ...draft, testDate: event.target.value })}
            className="w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{tr("Dosis (mg/week)", "Dose (mg/week)")}</label>
          <input
            type="number"
            value={annotations.dosageMgPerWeek ?? ""}
            onChange={(event) =>
              onAnnotationsChange({
                ...annotations,
                dosageMgPerWeek: safeNumber(event.target.value)
              })
            }
            className="w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            placeholder={tr("bijv. 120", "e.g. 120")}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Protocol</label>
          <input
            value={annotations.protocol}
            onChange={(event) => onAnnotationsChange({ ...annotations, protocol: event.target.value })}
            className="w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            placeholder="2x per week SubQ"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{tr("Supplementen", "Supplements")}</label>
          <input
            value={annotations.supplements}
            onChange={(event) => onAnnotationsChange({ ...annotations, supplements: event.target.value })}
            className="w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            placeholder="Vitamin D, Omega-3"
          />
        </div>
        {showSamplingTiming ? (
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{tr("Meetmoment", "Sampling timing")}</label>
            <select
              value={annotations.samplingTiming}
              onChange={(event) =>
                onAnnotationsChange({
                  ...annotations,
                  samplingTiming: event.target.value as ReportAnnotations["samplingTiming"]
                })
              }
              className="w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            >
              <option value="unknown">{tr("Onbekend", "Unknown")}</option>
              <option value="trough">Trough</option>
              <option value="mid">{tr("Midden", "Mid")}</option>
              <option value="peak">Peak</option>
            </select>
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{tr("Symptomen", "Symptoms")}</label>
          <textarea
            value={annotations.symptoms}
            onChange={(event) => onAnnotationsChange({ ...annotations, symptoms: event.target.value })}
            className="h-24 w-full resize-none rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            placeholder={tr("Energie, libido, stemming, slaap", "Energy, libido, mood, sleep")}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{tr("Notities", "Notes")}</label>
          <textarea
            value={annotations.notes}
            onChange={(event) => onAnnotationsChange({ ...annotations, notes: event.target.value })}
            className="h-24 w-full resize-none rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            placeholder={tr("Aanvullende observaties", "Additional observations")}
          />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-700">
        <table className="min-w-full divide-y divide-slate-700 text-sm">
          <thead className="bg-slate-900/80 text-left text-slate-300">
            <tr>
              <th className="px-3 py-2">{tr("Marker", "Marker")}</th>
              <th className="px-3 py-2 text-right">{tr("Waarde", "Value")}</th>
              <th className="px-3 py-2">{tr("Eenheid", "Unit")}</th>
              <th className="px-3 py-2 text-right">{tr("Ref min", "Ref min")}</th>
              <th className="px-3 py-2 text-right">{tr("Ref max", "Ref max")}</th>
              <th className="px-3 py-2 text-right">{tr("Status", "Status")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {draft.markers.map((row) => (
              <tr key={row.id} className="bg-slate-900/35">
                <td className="px-3 py-2">
                  <EditableCell
                    value={row.marker}
                    onCommit={(value) =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        marker: value,
                        canonicalMarker: canonicalizeMarker(value)
                      }))
                    }
                    placeholder={tr("Markernaam", "Marker name")}
                    editLabel={tr("Waarde bewerken", "Edit value")}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <EditableCell
                    value={row.value}
                    align="right"
                    editLabel={tr("Waarde bewerken", "Edit value")}
                    onCommit={(value) =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        value: safeNumber(value) ?? current.value
                      }))
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    value={row.unit}
                    editLabel={tr("Waarde bewerken", "Edit value")}
                    onCommit={(value) => updateRow(row.id, (current) => ({ ...current, unit: value }))}
                    placeholder={tr("Eenheid", "Unit")}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <EditableCell
                    value={row.referenceMin}
                    align="right"
                    editLabel={tr("Waarde bewerken", "Edit value")}
                    onCommit={(value) =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        referenceMin: value.trim() ? safeNumber(value) : null
                      }))
                    }
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <EditableCell
                    value={row.referenceMax}
                    align="right"
                    editLabel={tr("Waarde bewerken", "Edit value")}
                    onCommit={(value) =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        referenceMax: value.trim() ? safeNumber(value) : null
                      }))
                    }
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      row.abnormal === "high"
                        ? "bg-rose-500/20 text-rose-300"
                        : row.abnormal === "low"
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-emerald-500/20 text-emerald-300"
                    }`}
                  >
                    {abnormalLabel(row.abnormal)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className="rounded-md p-1 text-slate-400 hover:bg-slate-700 hover:text-rose-300"
                    onClick={() => removeRow(row.id)}
                    aria-label={tr("Rij verwijderen", "Remove row")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        className="mt-3 inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200"
        onClick={addRow}
      >
        <Plus className="h-4 w-4" /> {tr("Markerrij toevoegen", "Add marker row")}
      </button>
    </motion.div>
  );
};

interface MarkerChartCardProps {
  marker: string;
  points: MarkerSeriesPoint[];
  colorIndex: number;
  settings: AppSettings;
  language: AppLanguage;
  phaseBlocks: ReturnType<typeof buildDosePhaseBlocks>;
  alertCount: number;
  trendSummary: MarkerTrendSummary | null;
  percentChange: number | null;
  baselineDelta: number | null;
  isCalculatedMarker: boolean;
  onOpenLarge: () => void;
  onRenameMarker: (marker: string) => void;
}

interface MarkerTrendChartProps {
  marker: string;
  points: MarkerSeriesPoint[];
  colorIndex: number;
  settings: AppSettings;
  language: AppLanguage;
  phaseBlocks: ReturnType<typeof buildDosePhaseBlocks>;
  height: number;
  showYearHints?: boolean;
}

interface AlertTrendMiniChartProps {
  marker: string;
  points: MarkerSeriesPoint[];
  highlightDate?: string;
  language: AppLanguage;
  height?: number;
}

const trendVisual = (direction: MarkerTrendSummary["direction"] | null): { icon: JSX.Element; text: string } => {
  if (direction === "rising") {
    return { icon: <ArrowUp className="h-3.5 w-3.5 text-emerald-300" />, text: "Rising" };
  }
  if (direction === "falling") {
    return { icon: <ArrowDown className="h-3.5 w-3.5 text-amber-300" />, text: "Falling" };
  }
  if (direction === "volatile") {
    return { icon: <AlertTriangle className="h-3.5 w-3.5 text-rose-300" />, text: "Volatile" };
  }
  return { icon: <ArrowRight className="h-3.5 w-3.5 text-slate-300" />, text: "Stable" };
};

const markerCardAccentClass = (alertCount: number, latestAbnormal: MarkerValue["abnormal"] | null): string => {
  if (alertCount > 0 || latestAbnormal === "high") {
    return "border-l-4 border-l-rose-400";
  }
  if (latestAbnormal === "low") {
    return "border-l-4 border-l-amber-400";
  }
  return "border-l-4 border-l-emerald-400";
};

const phaseColor = (dose: number | null, index: number): string => {
  if (dose !== null && dose >= 160) {
    return "#f59e0b";
  }
  if (dose !== null && dose >= 120) {
    return "#22d3ee";
  }
  if (dose !== null && dose < 120) {
    return "#34d399";
  }
  return index % 2 === 0 ? "#334155" : "#1e293b";
};

const abnormalStatusLabel = (value: MarkerValue["abnormal"], language: AppLanguage): string => {
  if (value === "high") {
    return language === "nl" ? "Hoog" : "High";
  }
  if (value === "low") {
    return language === "nl" ? "Laag" : "Low";
  }
  if (value === "normal") {
    return language === "nl" ? "Normaal" : "Normal";
  }
  return language === "nl" ? "Onbekend" : "Unknown";
};

interface MarkerInfoBadgeProps {
  marker: string;
  language: AppLanguage;
}

const MarkerInfoBadge = ({ marker, language }: MarkerInfoBadgeProps) => {
  const meta = getMarkerMeta(marker, language);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!isOpen || !triggerRef.current || typeof window === "undefined") {
      return;
    }

    const TOOLTIP_WIDTH = 288;
    const TOOLTIP_HEIGHT_ESTIMATE = 230;
    const GAP = 10;
    const EDGE_PADDING = 10;

    const updatePosition = () => {
      if (!triggerRef.current) {
        return;
      }
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const maxLeft = Math.max(EDGE_PADDING, viewportWidth - TOOLTIP_WIDTH - EDGE_PADDING);
      const left = clampNumber(rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2, EDGE_PADDING, maxLeft);
      const placeBelow = rect.bottom + GAP + TOOLTIP_HEIGHT_ESTIMATE <= viewportHeight - EDGE_PADDING;
      const top = placeBelow
        ? rect.bottom + GAP
        : Math.max(EDGE_PADDING, rect.top - TOOLTIP_HEIGHT_ESTIMATE - GAP);

      setTooltipPosition({ top, left });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  const tooltip = isOpen && tooltipPosition && typeof document !== "undefined"
    ? createPortal(
        <div
          className="marker-info-tooltip pointer-events-none fixed z-[120] w-72 rounded-xl border border-slate-600 bg-slate-950/95 p-3 text-left text-xs text-slate-200 shadow-xl"
          style={{ top: tooltipPosition.top, left: tooltipPosition.left }}
        >
          <p className="font-semibold text-slate-100">{meta.title}</p>
          <p className="mt-1">{meta.what}</p>
          <p className="mt-1 text-slate-300">
            <strong>{language === "nl" ? "Waarom meten:" : "Why measured:"}</strong> {meta.why}
          </p>
          <p className="mt-1 text-slate-300">
            <strong>{language === "nl" ? "Bij tekort/laag:" : "If low:"}</strong> {meta.low}
          </p>
          <p className="mt-1 text-slate-300">
            <strong>{language === "nl" ? "Bij teveel/hoog:" : "If high:"}</strong> {meta.high}
          </p>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="inline-flex">
      <button
        type="button"
        ref={triggerRef}
        className="rounded-full p-0.5 text-slate-400 transition hover:text-cyan-200"
        aria-label={meta.title}
        aria-expanded={isOpen}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {tooltip}
    </div>
  );
};

const MarkerTrendChart = ({
  marker,
  points,
  colorIndex,
  settings,
  language,
  phaseBlocks,
  height,
  showYearHints = false
}: MarkerTrendChartProps) => {
  const markerLabel = getMarkerDisplayName(marker, language);
  const mins = points.map((point) => point.referenceMin).filter((value): value is number => value !== null);
  const maxs = points.map((point) => point.referenceMax).filter((value): value is number => value !== null);
  const rangeMin = mins.length > 0 ? Math.min(...mins) : undefined;
  const rangeMax = maxs.length > 0 ? Math.max(...maxs) : undefined;
  const yAxisCandidates = points.map((point) => point.value);
  const yDomain = buildYAxisDomain(yAxisCandidates, settings.yAxisMode);
  const availableKeys = new Set(points.map((point) => point.key));
  const compactTooltip = settings.tooltipDetailMode === "compact";
  const phaseBlocksForSeries = phaseBlocks.filter(
    (block) => availableKeys.has(block.fromKey) || availableKeys.has(block.toKey)
  );

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-slate-700 text-sm text-slate-400"
        style={{ height }}
      >
        {language === "nl" ? "Geen data in dit bereik" : "No data in selected range"}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ left: 2, right: 8, top: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="key"
          tickFormatter={(value: string, index) => {
            try {
              const dateString = String(value).split("__")[0];
              const currentDate = parseISO(dateString);
              if (!showYearHints) {
                return format(currentDate, "dd MMM");
              }

              if (index === 0) {
                return format(currentDate, "dd MMM yyyy");
              }

              const previousPoint = points[index - 1];
              if (!previousPoint) {
                return format(currentDate, "dd MMM yyyy");
              }

              const previousDate = parseISO(previousPoint.date);
              if (previousDate.getFullYear() !== currentDate.getFullYear()) {
                return format(currentDate, "dd MMM yyyy");
              }

              return format(currentDate, "dd MMM");
            } catch {
              return value;
            }
          }}
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          stroke="#334155"
          minTickGap={18}
        />
        <YAxis
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          tickFormatter={(value) => formatAxisTick(Number(value))}
          stroke="#334155"
          width={44}
          domain={yDomain ?? ["auto", "auto"]}
        />
        <Tooltip
          offset={18}
          allowEscapeViewBox={{ x: true, y: true }}
          wrapperStyle={{ pointerEvents: "none", zIndex: 50 }}
          cursor={{ stroke: "#334155", strokeDasharray: "4 3", strokeWidth: 1 }}
          content={({ active, payload }) => {
            const point = payload?.[0]?.payload as MarkerSeriesPoint | undefined;
            if (!active || !point) {
              return null;
            }
            const protocolText = compactTooltipText(point.context.protocol, 54);
            return (
              <div
                className={`chart-tooltip rounded-xl border border-slate-600 bg-slate-950/95 p-2.5 text-xs text-slate-200 shadow-xl ${
                  compactTooltip ? "w-[210px]" : "w-[300px]"
                }`}
              >
                <p className="font-semibold text-slate-100">{formatDate(point.date)}</p>
                <p className="mt-1 text-sm text-cyan-200">
                  {markerLabel}: <strong>{formatAxisTick(point.value)}</strong> {point.unit}
                </p>
                <div className="mt-1.5 space-y-1 text-slate-300">
                  <p>{language === "nl" ? "Dosis" : "Dose"}: {point.context.dosageMgPerWeek === null ? "-" : `${point.context.dosageMgPerWeek} mg/week`}</p>
                  {compactTooltip ? (
                    <p>Protocol: {protocolText}</p>
                  ) : (
                    <>
                      <p>Protocol: {point.context.protocol || "-"}</p>
                      <p>{language === "nl" ? "Supplementen" : "Supplements"}: {point.context.supplements || "-"}</p>
                      <p>{language === "nl" ? "Symptomen" : "Symptoms"}: {point.context.symptoms || "-"}</p>
                      <p>{language === "nl" ? "Notities" : "Notes"}: {point.context.notes || "-"}</p>
                    </>
                  )}
                </div>
              </div>
            );
          }}
        />

        {settings.showAnnotations
          ? phaseBlocksForSeries.map((block, index) => (
              <ReferenceArea
                key={`${marker}-phase-${block.id}`}
                x1={block.fromKey}
                x2={block.toKey}
                y1="dataMin"
                y2="dataMax"
                fill={phaseColor(block.dosageMgPerWeek, index)}
                fillOpacity={0.08}
                strokeOpacity={0}
              />
            ))
          : null}

        {settings.showReferenceRanges && rangeMin !== undefined && rangeMax !== undefined && rangeMin < rangeMax ? (
          <ReferenceArea y1={rangeMin} y2={rangeMax} fill="#22c55e" fillOpacity={0.12} strokeOpacity={0} />
        ) : null}

        {settings.showTrtTargetZone
          ? (() => {
              const zone = getTargetZone(marker, "trt", settings.unitSystem);
              if (!zone || zone.min >= zone.max) {
                return null;
              }
              return <ReferenceArea y1={zone.min} y2={zone.max} fill="#0ea5e9" fillOpacity={0.09} strokeOpacity={0} />;
            })()
          : null}

        {settings.showLongevityTargetZone
          ? (() => {
              const zone = getTargetZone(marker, "longevity", settings.unitSystem);
              if (!zone || zone.min >= zone.max) {
                return null;
              }
              return <ReferenceArea y1={zone.min} y2={zone.max} fill="#a855f7" fillOpacity={0.06} strokeOpacity={0} />;
            })()
          : null}

        <Line
          type="monotone"
          dataKey="value"
          stroke={markerColor(colorIndex)}
          strokeWidth={2.6}
          dot={(props) => {
            const payload = props.payload as MarkerSeriesPoint;
            let fill = markerColor(colorIndex);
            if (settings.showAbnormalHighlights) {
              if (payload.abnormal === "high") {
                fill = "#fb7185";
              }
              if (payload.abnormal === "low") {
                fill = "#f59e0b";
              }
            }
            return <circle cx={props.cx} cy={props.cy} r={4} stroke="#0f172a" strokeWidth={1.5} fill={fill} />;
          }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

const AlertTrendMiniChart = ({ marker, points, highlightDate, language, height = 110 }: AlertTrendMiniChartProps) => {
  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-700 text-xs text-slate-500" style={{ height }}>
        {language === "nl" ? "Geen trenddata" : "No trend data"}
      </div>
    );
  }

  const markerLabel = getMarkerDisplayName(marker, language);
  const yDomain = buildYAxisDomain(
    points.map((point) => point.value),
    "data"
  );

  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-950/40 p-1.5" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ left: 0, right: 0, top: 6, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="key"
            tickFormatter={(value: string) => {
              const dateString = String(value).split("__")[0];
              try {
                return format(parseISO(dateString), "dd MMM yy");
              } catch {
                return dateString;
              }
            }}
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            stroke="#334155"
            minTickGap={16}
          />
          <YAxis hide domain={yDomain ?? ["auto", "auto"]} />
          <Tooltip
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as MarkerSeriesPoint | undefined;
              if (!active || !point) {
                return null;
              }
              return (
                <div className="chart-tooltip-mini rounded-lg border border-slate-600 bg-slate-950/95 px-2.5 py-2 text-[11px] text-slate-200 shadow-lg">
                  <p className="font-medium text-slate-100">{formatDate(point.date)}</p>
                  <p className="mt-1 text-cyan-200">
                    {markerLabel}: {formatAxisTick(point.value)} {point.unit}
                  </p>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#22d3ee"
            strokeWidth={2.1}
            dot={(props) => {
              const payload = props.payload as MarkerSeriesPoint | undefined;
              const isHighlighted = Boolean(highlightDate && payload?.date === highlightDate);
              return (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={isHighlighted ? 4 : 2.5}
                  fill={isHighlighted ? "#fb7185" : "#22d3ee"}
                  stroke="#0f172a"
                  strokeWidth={1.2}
                />
              );
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const MarkerChartCard = ({
  marker,
  points,
  colorIndex,
  settings,
  language,
  phaseBlocks,
  alertCount,
  trendSummary,
  percentChange,
  baselineDelta,
  isCalculatedMarker,
  onOpenLarge,
  onRenameMarker
}: MarkerChartCardProps) => {
  const latestPoint = points[points.length - 1] ?? null;
  const trend = trendVisual(trendSummary?.direction ?? null);
  const accent = markerCardAccentClass(alertCount, latestPoint?.abnormal ?? null);
  const markerLabel = getMarkerDisplayName(marker, language);
  const trendText =
    language === "nl"
      ? trend.text === "Rising"
        ? "Stijgend"
        : trend.text === "Falling"
          ? "Dalend"
          : trend.text === "Volatile"
            ? "Volatiel"
            : "Stabiel"
      : trend.text;
  const trendExplanation =
    language === "nl"
      ? trendSummary?.explanation
          ?.replace("Volatile pattern: variability is high", "Volatiel patroon: variabiliteit is hoog")
          .replace("Rising trend based on positive linear regression slope.", "Stijgende trend op basis van positieve regressie-helling.")
          .replace("Falling trend based on negative linear regression slope.", "Dalende trend op basis van negatieve regressie-helling.")
          .replace("Stable trend: slope remains close to zero.", "Stabiele trend: helling blijft dicht bij nul.")
          .replace("Insufficient points for trend classification.", "Onvoldoende meetpunten voor trendclassificatie.")
      : trendSummary?.explanation;
  return (
    <motion.div
      layout
      className={`rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 shadow-soft ${accent}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-100">{markerLabel}</h3>
          <MarkerInfoBadge marker={marker} language={language} />
          {!isCalculatedMarker ? (
            <button
              type="button"
              className="rounded p-0.5 text-slate-400 transition hover:text-cyan-200"
              onClick={() => onRenameMarker(marker)}
              aria-label={language === "nl" ? "Marker hernoemen" : "Rename marker"}
              title={language === "nl" ? "Marker hernoemen" : "Rename marker"}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {isCalculatedMarker ? (
            <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-200">fx</span>
          ) : null}
          {alertCount > 0 ? (
            <span className="rounded-full border border-rose-400/50 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-200">
              {alertCount} {language === "nl" ? "alert" : `alert${alertCount > 1 ? "s" : ""}`}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{points[0]?.unit ?? ""}</span>
          <button
            type="button"
            className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:border-cyan-500/50 hover:text-cyan-200"
            onClick={onOpenLarge}
          >
            {language === "nl" ? "Vergroot" : "Enlarge"}
          </button>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-300">
        <span className="inline-flex items-center gap-1" title={trendExplanation}>
          {trend.icon}
          {trendText}
        </span>
        <span>
          {language === "nl" ? "Sinds vorige test" : "Since last test"}:{" "}
          <strong className={percentChange === null ? "text-slate-300" : percentChange >= 0 ? "text-emerald-300" : "text-amber-300"}>
            {percentChange === null ? "-" : `${percentChange > 0 ? "+" : ""}${percentChange}%`}
          </strong>
        </span>
        {settings.compareToBaseline ? (
          <span>
            {language === "nl" ? "t.o.v. baseline" : "vs baseline"}:{" "}
            <strong className={baselineDelta === null ? "text-slate-300" : baselineDelta >= 0 ? "text-emerald-300" : "text-amber-300"}>
              {baselineDelta === null ? "-" : `${baselineDelta > 0 ? "+" : ""}${baselineDelta}%`}
            </strong>
          </span>
        ) : null}
      </div>

      <button
        type="button"
        className="block w-full cursor-zoom-in text-left"
        onClick={onOpenLarge}
        aria-label={language === "nl" ? `Open grotere grafiek voor ${markerLabel}` : `Open larger chart for ${markerLabel}`}
      >
        <MarkerTrendChart
          marker={marker}
          points={points}
          colorIndex={colorIndex}
          settings={settings}
          language={language}
          phaseBlocks={phaseBlocks}
          height={230}
        />
      </button>
    </motion.div>
  );
};

interface ComparisonChartProps {
  leftMarker: string;
  rightMarker: string;
  reports: LabReport[];
  settings: AppSettings;
  language: AppLanguage;
}

interface DoseProjectionChartProps {
  prediction: DosePrediction;
  reports: LabReport[];
  settings: AppSettings;
  language: AppLanguage;
  targetDose?: number;
  targetEstimate?: number;
}

const ComparisonChart = ({ leftMarker, rightMarker, reports, settings, language }: ComparisonChartProps) => {
  const leftLabel = getMarkerDisplayName(leftMarker, language);
  const rightLabel = getMarkerDisplayName(rightMarker, language);
  const data = useMemo(() => {
    const selectMarkerValue = (report: LabReport, markerName: string): number | null => {
      const matches = report.markers.filter((marker) => marker.canonicalMarker === markerName);
      if (matches.length === 0) {
        return null;
      }

      // In case a report contains duplicate rows for the same canonical marker,
      // prefer the highest-confidence extraction row.
      const best = matches.reduce((current, next) => (next.confidence > current.confidence ? next : current));
      return convertBySystem(best.canonicalMarker, best.value, best.unit, settings.unitSystem).value;
    };

    return reports
      .map((report) => {
        const left = selectMarkerValue(report, leftMarker);
        const right = selectMarkerValue(report, rightMarker);
        if (left === null && right === null) {
          return null;
        }

        // Keep each report as a distinct point so measurements on the same day are not collapsed.
        return {
          x: `${report.testDate}__${report.id}`,
          date: report.testDate,
          createdAt: report.createdAt,
          left,
          right
        };
      })
      .filter(
        (
          point
        ): point is {
          x: string;
          date: string;
          createdAt: string;
          left: number | null;
          right: number | null;
        } => point !== null
      )
      .sort((a, b) => {
        const byDate = parseISO(a.date).getTime() - parseISO(b.date).getTime();
        if (byDate !== 0) {
          return byDate;
        }
        return parseISO(a.createdAt).getTime() - parseISO(b.createdAt).getTime();
      });
  }, [leftMarker, rightMarker, reports, settings.unitSystem]);

  const normalizedData = useMemo(() => {
    if (settings.comparisonScale !== "normalized") {
      return data;
    }

    const leftValues = data.map((point) => point.left).filter((value): value is number => value !== null);
    const rightValues = data.map((point) => point.right).filter((value): value is number => value !== null);
    const leftMin = leftValues.length > 0 ? Math.min(...leftValues) : null;
    const leftMax = leftValues.length > 0 ? Math.max(...leftValues) : null;
    const rightMin = rightValues.length > 0 ? Math.min(...rightValues) : null;
    const rightMax = rightValues.length > 0 ? Math.max(...rightValues) : null;

    const normalize = (value: number | null, min: number | null, max: number | null): number | null => {
      if (value === null || min === null || max === null) {
        return null;
      }
      if (Math.abs(max - min) < 0.000001) {
        return 50;
      }
      return ((value - min) / (max - min)) * 100;
    };

    return data.map((point) => ({
      ...point,
      leftNorm: normalize(point.left, leftMin, leftMax),
      rightNorm: normalize(point.right, rightMin, rightMax)
    }));
  }, [data, settings.comparisonScale]);

  const leftDomain = useMemo(() => {
    if (settings.comparisonScale === "normalized") {
      return [0, 100] as [number, number];
    }
    return buildYAxisDomain(
      data.map((point) => point.left).filter((value): value is number => value !== null),
      settings.yAxisMode
    );
  }, [data, settings.yAxisMode, settings.comparisonScale]);

  const rightDomain = useMemo(() => {
    if (settings.comparisonScale === "normalized") {
      return [0, 100] as [number, number];
    }
    return buildYAxisDomain(
      data.map((point) => point.right).filter((value): value is number => value !== null),
      settings.yAxisMode
    );
  }, [data, settings.yAxisMode, settings.comparisonScale]);

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/50 p-4">
        <h3 className="text-sm font-semibold text-slate-100">{language === "nl" ? "Vergelijkingsmodus" : "Comparison mode"}</h3>
        <p className="mt-2 text-sm text-slate-400">
          {language === "nl" ? "Geen overlappende data in gekozen bereik." : "No overlapping data in selected range."}
        </p>
      </div>
    );
  }

  return (
    <motion.div
      layout
      className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 shadow-soft"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h3 className="mb-2 text-sm font-semibold text-slate-100">
        {language === "nl" ? "Vergelijkingsmodus" : "Comparison mode"}{" "}
        {settings.comparisonScale === "normalized" ? (language === "nl" ? "(genormaliseerd 0-100%)" : "(normalized 0-100%)") : ""}
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={normalizedData} margin={{ left: 2, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="x"
            tickFormatter={(value) => {
              const date = String(value).split("__")[0];
              return formatDate(date);
            }}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            stroke="#334155"
            minTickGap={18}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickFormatter={(value) => formatAxisTick(Number(value))}
            stroke="#334155"
            width={45}
            domain={leftDomain ?? ["auto", "auto"]}
          />
          {settings.comparisonScale === "normalized" ? null : (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickFormatter={(value) => formatAxisTick(Number(value))}
              stroke="#334155"
              width={45}
              domain={rightDomain ?? ["auto", "auto"]}
            />
          )}
          <Tooltip
            contentStyle={{
              background: "#0b1220",
              border: "1px solid #334155",
              borderRadius: "12px"
            }}
            labelFormatter={(value) => {
              const date = String(value).split("__")[0];
              return formatDate(date);
            }}
            formatter={(value, name, item) => {
              const payload = item?.payload as { left: number | null; right: number | null } | undefined;
              if (settings.comparisonScale === "normalized") {
                const raw = name === leftLabel ? payload?.left : payload?.right;
                const rawSuffix = raw === null || raw === undefined ? "-" : ` | raw ${formatAxisTick(raw)}`;
                return [`${formatAxisTick(Number(value))}%${rawSuffix}`, name];
              }
              return [formatAxisTick(Number(value)), name];
            }}
          />
          <Legend />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey={settings.comparisonScale === "normalized" ? "leftNorm" : "left"}
            name={leftLabel}
            stroke="#22d3ee"
            strokeWidth={2.4}
          />
          <Line
            yAxisId={settings.comparisonScale === "normalized" ? "left" : "right"}
            type="monotone"
            dataKey={settings.comparisonScale === "normalized" ? "rightNorm" : "right"}
            name={rightLabel}
            stroke="#f472b6"
            strokeWidth={2.4}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

const DoseProjectionChart = ({ prediction, reports, settings, language, targetDose, targetEstimate }: DoseProjectionChartProps) => {
  const markerLabel = getMarkerDisplayName(prediction.marker, language);
  const projectedDose = typeof targetDose === "number" && Number.isFinite(targetDose) ? targetDose : prediction.suggestedDose;
  const projectedEstimate =
    typeof targetEstimate === "number" && Number.isFinite(targetEstimate) ? targetEstimate : prediction.suggestedEstimate;
  const historical = useMemo(
    () => buildMarkerSeries(reports, prediction.marker, settings.unitSystem),
    [reports, prediction.marker, settings.unitSystem]
  );

  if (historical.length === 0) {
    return null;
  }

  const recentHistorical = historical.slice(-3);
  const latest = recentHistorical[recentHistorical.length - 1];
  if (!latest) {
    return null;
  }

  const projectionSpacingDays =
    recentHistorical.length >= 2
      ? (() => {
          const previous = recentHistorical[recentHistorical.length - 2];
          if (!previous) {
            return 42;
          }
          const days = Math.round((Date.parse(`${latest.date}T00:00:00Z`) - Date.parse(`${previous.date}T00:00:00Z`)) / 86400000);
          return Number.isFinite(days) && days > 0 ? Math.min(Math.max(days, 21), 120) : 42;
        })()
      : 42;

  const projectionDateIso = format(addDays(parseISO(latest.date), projectionSpacingDays), "yyyy-MM-dd");
  const projectionKey = `${projectionDateIso}__projection`;

  const chartData: Array<{ x: string; date: string; actual: number | null; projected: number | null }> = recentHistorical.map((point, index) => ({
    x: point.key,
    date: point.date,
    actual: point.value,
    projected: index === recentHistorical.length - 1 ? point.value : null
  }));

  chartData.push({
    x: projectionKey,
    date: projectionDateIso,
    actual: null,
    projected: projectedEstimate
  });

  const yDomain = buildYAxisDomain(
    [
      ...recentHistorical.map((point) => point.value),
      projectedEstimate
    ].filter((value): value is number => Number.isFinite(value)),
    "data"
  );

  return (
    <div className="rounded-lg border border-cyan-500/20 bg-slate-950/40 p-2">
      <p className="mb-1 text-[11px] text-slate-300">
        {language === "nl"
          ? "Volle lijn = gemeten. Stippellijn = modelinschatting bij dit dosis-scenario."
          : "Solid line = measured. Dotted line = model estimate for this dose scenario."}
      </p>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={chartData} margin={{ left: 2, right: 6, top: 6, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="x"
            tickFormatter={(value) => {
              const date = String(value).split("__")[0];
              try {
                return format(parseISO(date), "dd MMM yy");
              } catch {
                return date;
              }
            }}
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            stroke="#334155"
            minTickGap={16}
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            tickFormatter={(value) => formatAxisTick(Number(value))}
            stroke="#334155"
            width={40}
            domain={yDomain ?? ["auto", "auto"]}
          />
          <Tooltip
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as { date: string; actual: number | null; projected: number | null } | undefined;
              if (!active || !point) {
                return null;
              }
              const isProjectionPoint = point.actual === null && point.projected !== null;
              const value = isProjectionPoint ? point.projected : point.actual ?? point.projected;
              return (
                <div className="chart-tooltip-mini rounded-lg border border-slate-600 bg-slate-950/95 px-2.5 py-2 text-[11px] text-slate-200 shadow-lg">
                  <p className="font-medium text-slate-100">{formatDate(point.date)}</p>
                  <p className="mt-1 text-cyan-200">
                    {markerLabel}: {value === null ? "-" : `${formatAxisTick(value)} ${prediction.unit}`}
                  </p>
                  {isProjectionPoint ? (
                    <p className="mt-1 text-[10px] text-amber-200">
                      {language === "nl"
                        ? `Hypothetische modelwaarde bij ${formatAxisTick(projectedDose)} mg/week`
                        : `Hypothetical model value at ${formatAxisTick(projectedDose)} mg/week`}
                    </p>
                  ) : null}
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#22d3ee"
            strokeWidth={2.2}
            dot={{ r: 2.8, fill: "#22d3ee", stroke: "#0f172a", strokeWidth: 1.1 }}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="projected"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={(props) => {
              const payload = props.payload as { x: string } | undefined;
              const isProjectionPoint = payload?.x === projectionKey;
              return (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={isProjectionPoint ? 4 : 0}
                  fill={isProjectionPoint ? "#fb7185" : "transparent"}
                  stroke="#0f172a"
                  strokeWidth={1.3}
                />
              );
            }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const App = () => {
  const [sharedSnapshot] = useState(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const token = new URLSearchParams(window.location.search).get("share");
    if (!token) {
      return null;
    }
    return parseShareToken(token);
  });
  const isShareMode = sharedSnapshot !== null;

  const [shareOptions, setShareOptions] = useState<ShareOptions>({
    hideNotes: false,
    hideProtocol: false,
    hideSymptoms: false
  });
  const [shareLink, setShareLink] = useState("");
  const [reportComparisonOpen, setReportComparisonOpen] = useState(false);
  const [appData, setAppData] = useState(() => (sharedSnapshot ? sharedSnapshot.data : loadAppData()));
  const isNl = appData.settings.language === "nl";
  const samplingControlsEnabled = appData.settings.enableSamplingControls;
  const tr = (nl: string, en: string): string => (isNl ? nl : en);
  const mapServiceErrorToMessage = (
    error: unknown,
    scope: "ai" | "pdf"
  ): string => {
    if (!(error instanceof Error)) {
      return scope === "ai"
        ? tr("AI-analyse kon niet worden uitgevoerd.", "AI analysis could not be completed.")
        : t(appData.settings.language, "pdfProcessFailed");
    }

    const code = error.message ?? "";
    if (scope === "ai") {
      if (code === "AI_PROXY_UNREACHABLE") {
        return t(appData.settings.language, "aiProxyUnreachable");
      }
      if (code === "AI_EMPTY_RESPONSE") {
        return t(appData.settings.language, "aiEmptyResponse");
      }
      if (code.startsWith("AI_REQUEST_FAILED:")) {
        const [, status, ...rest] = code.split(":");
        const details = rest.join(":").trim();
        const suffix = details ? ` (${status || "unknown"}: ${details})` : ` (${status || "unknown"})`;
        return `${t(appData.settings.language, "aiRequestFailed")}${suffix}`;
      }
      return error.message;
    }

    if (code === "PDF_PROXY_UNREACHABLE") {
      return t(appData.settings.language, "pdfProxyUnreachable");
    }
    if (code === "PDF_EMPTY_RESPONSE") {
      return t(appData.settings.language, "pdfEmptyResponse");
    }
    if (code.startsWith("PDF_EXTRACTION_FAILED:")) {
      const [, status, ...rest] = code.split(":");
      const details = rest.join(":").trim();
      const suffix = details ? ` (${status || "unknown"}: ${details})` : ` (${status || "unknown"})`;
      return `${t(appData.settings.language, "pdfExtractionFailed")}${suffix}`;
    }
    return t(appData.settings.language, "pdfProcessFailed");
  };
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [doseResponseInput, setDoseResponseInput] = useState("");
  const [dashboardView, setDashboardView] = useState<"primary" | "all">("primary");

  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [draft, setDraft] = useState<ExtractionDraft | null>(null);
  const [draftAnnotations, setDraftAnnotations] = useState<ReportAnnotations>(blankAnnotations());

  const [comparisonMode, setComparisonMode] = useState(false);
  const [leftCompareMarker, setLeftCompareMarker] = useState<string>(PRIMARY_MARKERS[0]);
  const [rightCompareMarker, setRightCompareMarker] = useState<string>(PRIMARY_MARKERS[2]);

  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [expandedReportIds, setExpandedReportIds] = useState<string[]>([]);
  const [reportSortOrder, setReportSortOrder] = useState<"asc" | "desc">("desc");
  const [csvMarkerSelection, setCsvMarkerSelection] = useState<string[]>([]);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editingAnnotations, setEditingAnnotations] = useState<ReportAnnotations>(blankAnnotations());
  const [expandedMarker, setExpandedMarker] = useState<string | null>(null);
  const [isAnalyzingLabs, setIsAnalyzingLabs] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisResult, setAnalysisResult] = useState("");
  const [analysisGeneratedAt, setAnalysisGeneratedAt] = useState<string | null>(null);
  const [analysisCopied, setAnalysisCopied] = useState(false);
  const [analysisKind, setAnalysisKind] = useState<"full" | "latestComparison" | null>(null);
  const [protocolWindowSize, setProtocolWindowSize] = useState(2);
  const [protocolMarkerSearch, setProtocolMarkerSearch] = useState("");
  const [protocolCategoryFilter, setProtocolCategoryFilter] = useState<"all" | "Hormones" | "Lipids" | "Hematology" | "Inflammation">("all");
  const [protocolSortKey, setProtocolSortKey] = useState<"deltaPct" | "deltaAbs" | "marker">("deltaPct");
  const [collapsedProtocolEvents, setCollapsedProtocolEvents] = useState<string[]>([]);
  const [markerSuggestions, setMarkerSuggestions] = useState<MarkerMergeSuggestion[]>([]);
  const [renameDialog, setRenameDialog] = useState<{ sourceCanonical: string; draftName: string } | null>(null);
  const [mergeFromMarker, setMergeFromMarker] = useState("");
  const [mergeIntoMarker, setMergeIntoMarker] = useState("");
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importStatus, setImportStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const reports = useMemo(
    () =>
      sortReportsChronological(
        enrichReportsWithCalculatedMarkers(appData.reports, {
          enableCalculatedFreeTestosterone: appData.settings.enableCalculatedFreeTestosterone,
          logCalculatedFreeTestosteroneDebug: appData.settings.enableCalculatedFreeTestosterone
        })
      ),
    [appData.reports, appData.settings.enableCalculatedFreeTestosterone]
  );

  const rangeFilteredReports = useMemo(
    () =>
      reports.filter((report) =>
        withinRange(
          report.testDate,
          appData.settings.timeRange,
          appData.settings.customRangeStart,
          appData.settings.customRangeEnd
        )
      ),
    [reports, appData.settings.timeRange, appData.settings.customRangeStart, appData.settings.customRangeEnd]
  );

  const visibleReports = useMemo(() => {
    if (!samplingControlsEnabled) {
      return rangeFilteredReports;
    }
    return filterReportsBySampling(rangeFilteredReports, appData.settings.samplingFilter);
  }, [rangeFilteredReports, samplingControlsEnabled, appData.settings.samplingFilter]);

  const allMarkers = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((report) => {
      report.markers.forEach((marker) => set.add(marker.canonicalMarker));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reports]);
  const editableMarkers = useMemo(
    () =>
      allMarkers.filter((marker) =>
        reports.some((report) => report.markers.some((entry) => entry.canonicalMarker === marker && !entry.isCalculated))
      ),
    [allMarkers, reports]
  );
  const markerUsage = useMemo(() => {
    const byMarker = new Map<
      string,
      {
        marker: string;
        valueCount: number;
        reportCount: number;
      }
    >();

    reports.forEach((report) => {
      const seenInReport = new Set<string>();
      report.markers.forEach((entry) => {
        if (entry.isCalculated) {
          return;
        }
        const current = byMarker.get(entry.canonicalMarker) ?? {
          marker: entry.canonicalMarker,
          valueCount: 0,
          reportCount: 0
        };
        current.valueCount += 1;
        if (!seenInReport.has(entry.canonicalMarker)) {
          current.reportCount += 1;
          seenInReport.add(entry.canonicalMarker);
        }
        byMarker.set(entry.canonicalMarker, current);
      });
    });

    return Array.from(byMarker.values()).sort((a, b) => b.valueCount - a.valueCount || a.marker.localeCompare(b.marker));
  }, [reports]);
  const primaryMarkers = useMemo(() => {
    const base: string[] = [...PRIMARY_MARKERS];
    const selectedCardioMarker = CARDIO_PRIORITY_MARKERS.find((marker) => allMarkers.includes(marker)) ?? "LDL Cholesterol";
    if (!base.includes(selectedCardioMarker)) {
      base.push(selectedCardioMarker);
    }
    return Array.from(new Set(base));
  }, [allMarkers]);

  const baselineReport = useMemo(() => reports.find((report) => report.isBaseline) ?? null, [reports]);
  const dosePhaseBlocks = useMemo(() => buildDosePhaseBlocks(visibleReports), [visibleReports]);

  const trendByMarker = useMemo(() => {
    return allMarkers.reduce(
      (acc, marker) => {
        const series = buildMarkerSeries(visibleReports, marker, appData.settings.unitSystem);
        acc[marker] = classifyMarkerTrend(series, marker);
        return acc;
      },
      {} as Record<string, MarkerTrendSummary>
    );
  }, [allMarkers, visibleReports, appData.settings.unitSystem]);

  const alerts = useMemo(
    () => buildAlerts(visibleReports, allMarkers, appData.settings.unitSystem, appData.settings.language),
    [visibleReports, allMarkers, appData.settings.unitSystem, appData.settings.language]
  );
  const actionableAlerts = useMemo(() => alerts.filter((alert) => alert.actionNeeded), [alerts]);
  const positiveAlerts = useMemo(() => alerts.filter((alert) => !alert.actionNeeded), [alerts]);
  const alertsByMarker = useMemo(() => buildAlertsByMarker(actionableAlerts), [actionableAlerts]);
  const alertSeriesByMarker = useMemo(() => {
    const markerSet = new Set<string>(alerts.map((alert) => alert.marker));
    return Array.from(markerSet).reduce(
      (acc, marker) => {
        acc[marker] = buildMarkerSeries(visibleReports, marker, appData.settings.unitSystem);
        return acc;
      },
      {} as Record<string, MarkerSeriesPoint[]>
    );
  }, [alerts, visibleReports, appData.settings.unitSystem]);

  const trtStability = useMemo(
    () => computeTrtStabilityIndex(visibleReports, appData.settings.unitSystem),
    [visibleReports, appData.settings.unitSystem]
  );
  const trtStabilitySeries = useMemo(
    () => buildTrtStabilitySeries(visibleReports, appData.settings.unitSystem),
    [visibleReports, appData.settings.unitSystem]
  );

  const protocolImpactSummary = useMemo(
    () => buildProtocolImpactSummary(visibleReports, appData.settings.unitSystem),
    [visibleReports, appData.settings.unitSystem]
  );
  const protocolDoseEvents = useMemo(
    () => buildProtocolImpactDoseEvents(visibleReports, appData.settings.unitSystem, protocolWindowSize),
    [visibleReports, appData.settings.unitSystem, protocolWindowSize]
  );
  const protocolDoseOverview = useMemo(
    () => buildDoseCorrelationInsights(visibleReports, allMarkers, appData.settings.unitSystem),
    [visibleReports, allMarkers, appData.settings.unitSystem]
  );

  useEffect(() => {
    setCollapsedProtocolEvents((current) => {
      const available = new Set(protocolDoseEvents.map((event) => event.id));
      const retained = current.filter((id) => available.has(id));
      if (retained.length > 0) {
        return retained;
      }
      return protocolDoseEvents.map((event) => event.id);
    });
  }, [protocolDoseEvents]);
  const dosePredictions = useMemo(
    () => estimateDoseResponse(visibleReports, allMarkers, appData.settings.unitSystem),
    [visibleReports, allMarkers, appData.settings.unitSystem]
  );
  const customDoseValue = useMemo(() => safeNumber(doseResponseInput), [doseResponseInput]);
  const hasCustomDose = customDoseValue !== null && customDoseValue >= 0;

  useEffect(() => {
    if (isShareMode) {
      return;
    }
    saveAppData(appData);
  }, [appData, isShareMode]);

  useEffect(() => {
    if (isShareMode && activeTab !== "dashboard") {
      setActiveTab("dashboard");
    }
  }, [activeTab, isShareMode]);

  useEffect(() => {
    if (appData.settings.theme === "dark") {
      document.documentElement.classList.add("dark");
      document.body.classList.remove("light");
    } else {
      document.documentElement.classList.remove("dark");
      document.body.classList.add("light");
    }
  }, [appData.settings.theme]);

  useEffect(() => {
    if (!expandedMarker) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpandedMarker(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedMarker]);

  useEffect(() => {
    if (allMarkers.length === 0) {
      return;
    }

    setLeftCompareMarker((current) => (allMarkers.includes(current) ? current : allMarkers[0]));
    setRightCompareMarker((current) => {
      if (allMarkers.includes(current)) {
        return current;
      }
      return allMarkers[Math.min(1, allMarkers.length - 1)];
    });
    setCsvMarkerSelection((current) => {
      if (current.length === 0) {
        return allMarkers;
      }
      return current.filter((marker) => allMarkers.includes(marker));
    });
  }, [allMarkers]);

  useEffect(() => {
    if (editableMarkers.length === 0) {
      setMergeFromMarker("");
      setMergeIntoMarker("");
      return;
    }
    setMergeFromMarker((current) => (editableMarkers.includes(current) ? current : editableMarkers[0]));
    setMergeIntoMarker((current) => {
      if (editableMarkers.includes(current) && current !== (editableMarkers[0] ?? "")) {
        return current;
      }
      return editableMarkers.find((marker) => marker !== (editableMarkers[0] ?? "")) ?? "";
    });
  }, [editableMarkers]);

  useEffect(() => {
    setExpandedReportIds((current) => current.filter((id) => reports.some((report) => report.id === id)));
  }, [reports]);

  useEffect(() => {
    if (!editingReportId) {
      return;
    }
    setExpandedReportIds((current) => (current.includes(editingReportId) ? current : [...current, editingReportId]));
  }, [editingReportId]);

  useEffect(() => {
    if (!samplingControlsEnabled && (appData.settings.samplingFilter !== "all" || appData.settings.compareToBaseline)) {
      updateSettings({ samplingFilter: "all", compareToBaseline: false });
    }
  }, [samplingControlsEnabled, appData.settings.samplingFilter, appData.settings.compareToBaseline]);

  const updateSettings = (patch: Partial<AppSettings>) => {
    setAppData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...patch
      }
    }));
  };

  const remapMarkerAcrossReports = (sourceCanonical: string, targetLabel: string) => {
    const cleanLabel = targetLabel.trim();
    if (!cleanLabel) {
      return;
    }
    const targetCanonical = canonicalizeMarker(cleanLabel);
    setAppData((prev) => ({
      ...prev,
      reports: prev.reports.map((report) => {
        const rewritten = report.markers.map((marker) => {
          if (marker.canonicalMarker !== sourceCanonical || marker.isCalculated) {
            return marker;
          }
          const normalized = normalizeMarkerMeasurement({
            canonicalMarker: targetCanonical,
            value: marker.value,
            unit: marker.unit,
            referenceMin: marker.referenceMin,
            referenceMax: marker.referenceMax
          });
          return {
            ...marker,
            marker: cleanLabel,
            canonicalMarker: targetCanonical,
            value: normalized.value,
            unit: normalized.unit,
            referenceMin: normalized.referenceMin,
            referenceMax: normalized.referenceMax,
            abnormal: deriveAbnormalFlag(normalized.value, normalized.referenceMin, normalized.referenceMax)
          };
        });
        return {
          ...report,
          markers: dedupeMarkersInReport(rewritten)
        };
      })
    }));
    setMarkerSuggestions((current) =>
      current.filter(
        (item) => item.sourceCanonical !== sourceCanonical && item.targetCanonical !== sourceCanonical
      )
    );
  };

  const openRenameDialog = (sourceCanonical: string) => {
    setRenameDialog({
      sourceCanonical,
      draftName: sourceCanonical
    });
  };

  const runAiAnalysis = async (analysisType: "full" | "latestComparison") => {
    if (analysisType === "latestComparison" && visibleReports.length < 2) {
      setAnalysisError(tr("Voor vergelijking van laatste vs vorige rapport zijn minimaal 2 rapporten nodig.", "At least 2 reports are required for latest-vs-previous analysis."));
      return;
    }

    setIsAnalyzingLabs(true);
    setAnalysisError("");
    setAnalysisCopied(false);

    try {
      const result = await analyzeLabDataWithClaude({
        apiKey: appData.settings.claudeApiKey,
        reports: visibleReports,
        unitSystem: appData.settings.unitSystem,
        language: appData.settings.language,
        analysisType,
        context: {
          samplingFilter: samplingControlsEnabled ? appData.settings.samplingFilter : "all",
          protocolImpact: protocolImpactSummary,
          alerts,
          trendByMarker,
          trtStability,
          dosePredictions
        }
      });
      setAnalysisResult(result);
      setAnalysisGeneratedAt(new Date().toISOString());
      setAnalysisKind(analysisType);
    } catch (error) {
      setAnalysisError(mapServiceErrorToMessage(error, "ai"));
    } finally {
      setIsAnalyzingLabs(false);
    }
  };

  const copyAnalysis = async () => {
    if (!analysisResult) {
      return;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setAnalysisError(tr("Kopiëren wordt niet ondersteund in deze browser.", "Copying is not supported in this browser."));
      return;
    }

    try {
      await navigator.clipboard.writeText(analysisResult);
      setAnalysisCopied(true);
      setTimeout(() => setAnalysisCopied(false), 1800);
    } catch {
      setAnalysisError(tr("Kon analyse niet kopiëren naar klembord.", "Could not copy analysis to clipboard."));
    }
  };

  const startManualEntry = () => {
    setUploadError("");
    setDraftAnnotations(blankAnnotations());
    setDraft({
      sourceFileName: "Manual entry",
      testDate: new Date().toISOString().slice(0, 10),
      markers: [
        {
          id: createId(),
          marker: "Testosterone",
          canonicalMarker: "Testosterone",
          value: 13.8,
          unit: "nmol/L",
          referenceMin: null,
          referenceMax: null,
          abnormal: "unknown",
          confidence: 1
        }
      ],
      extraction: {
        provider: "fallback",
        model: "manual-entry",
        confidence: 1,
        needsReview: false
      }
    });
    setActiveTab("dashboard");
  };

  const handleUpload = async (file: File) => {
    setIsProcessing(true);
    setUploadError("");

    try {
      const extracted = await extractLabData(file, appData.settings.claudeApiKey);
      setDraft(extracted);
      setDraftAnnotations(blankAnnotations());
      setActiveTab("dashboard");
    } catch (error) {
      setUploadError(mapServiceErrorToMessage(error, "pdf"));
    } finally {
      setIsProcessing(false);
    }
  };

  const saveDraftAsReport = () => {
    if (!draft) {
      return;
    }

    const sanitizedMarkers = draft.markers
      .map((marker) => {
        const canonicalMarker = canonicalizeMarker(marker.marker || marker.canonicalMarker);
        const value = Number(marker.value);
        if (!Number.isFinite(value)) {
          return null;
        }
        const normalized = normalizeMarkerMeasurement({
          canonicalMarker,
          value,
          unit: marker.unit,
          referenceMin: marker.referenceMin,
          referenceMax: marker.referenceMax
        });

        return {
          ...marker,
          id: createId(),
          marker: marker.marker.trim() || canonicalMarker,
          canonicalMarker,
          value: normalized.value,
          unit: normalized.unit,
          referenceMin: normalized.referenceMin,
          referenceMax: normalized.referenceMax,
          abnormal: deriveAbnormalFlag(normalized.value, normalized.referenceMin, normalized.referenceMax)
        } as MarkerValue;
      })
      .filter((marker): marker is MarkerValue => marker !== null);

    if (sanitizedMarkers.length === 0) {
      setUploadError(tr("Geen geldige markerrijen gevonden. Voeg minimaal één marker toe voordat je opslaat.", "No valid marker rows found. Add at least one marker before saving."));
      return;
    }

    const report: LabReport = {
      id: createId(),
      sourceFileName: draft.sourceFileName,
      testDate: draft.testDate,
      createdAt: new Date().toISOString(),
      markers: sanitizedMarkers,
      annotations: samplingControlsEnabled
        ? draftAnnotations
        : {
            ...draftAnnotations,
            samplingTiming: "trough"
          },
      extraction: draft.extraction
    };
    const incomingCanonicalMarkers = Array.from(new Set(report.markers.map((marker) => marker.canonicalMarker)));
    const suggestions = detectMarkerMergeSuggestions(incomingCanonicalMarkers, allMarkers);

    setAppData((prev) => ({
      ...prev,
      reports: sortReportsChronological([...prev.reports, report])
    }));
    if (suggestions.length > 0) {
      setMarkerSuggestions((current) => {
        const merged = [...current, ...suggestions];
        return Array.from(
          merged
            .reduce((map, suggestion) => {
              const key = `${suggestion.sourceCanonical}|${suggestion.targetCanonical}`;
              const existing = map.get(key);
              if (!existing || suggestion.score > existing.score) {
                map.set(key, suggestion);
              }
              return map;
            }, new Map<string, MarkerMergeSuggestion>())
            .values()
        );
      });
    }

    setDraft(null);
    setDraftAnnotations(blankAnnotations());
    setUploadError("");
  };

  const deleteReport = (reportId: string) => {
    if (isShareMode) {
      return;
    }
    setAppData((prev) => ({
      ...prev,
      reports: prev.reports.filter((report) => report.id !== reportId)
    }));
    setSelectedReports((prev) => prev.filter((id) => id !== reportId));
    if (editingReportId === reportId) {
      setEditingReportId(null);
      setEditingAnnotations(blankAnnotations());
    }
  };

  const startEditingReport = (report: LabReport) => {
    if (isShareMode) {
      return;
    }
    setEditingReportId(report.id);
    setEditingAnnotations({ ...report.annotations });
  };

  const cancelEditingReport = () => {
    setEditingReportId(null);
    setEditingAnnotations(blankAnnotations());
  };

  const saveEditedReport = () => {
    if (!editingReportId) {
      return;
    }
    if (isShareMode) {
      return;
    }

    setAppData((prev) => ({
      ...prev,
      reports: prev.reports.map((report) =>
        report.id === editingReportId
          ? {
              ...report,
              annotations: samplingControlsEnabled
                ? editingAnnotations
                : {
                    ...editingAnnotations,
                    samplingTiming: "trough"
                  }
            }
          : report
      )
    }));
    setEditingReportId(null);
    setEditingAnnotations(blankAnnotations());
  };

  const setBaselineReport = (reportId: string) => {
    if (isShareMode) {
      return;
    }
    setAppData((prev) => ({
      ...prev,
      reports: prev.reports.map((report) => ({
        ...report,
        isBaseline: report.id === reportId
      }))
    }));
  };

  const deleteSelectedReports = () => {
    if (selectedReports.length === 0) {
      return;
    }
    if (isShareMode) {
      return;
    }

    const selected = new Set(selectedReports);
    setAppData((prev) => ({
      ...prev,
      reports: prev.reports.filter((report) => !selected.has(report.id))
    }));
    setSelectedReports([]);
  };

  const normalizeBaselineFlags = (reportsToNormalize: LabReport[]): LabReport[] => {
    let baselineSeen = false;
    return reportsToNormalize.map((report) => {
      if (!report.isBaseline) {
        return report;
      }
      if (!baselineSeen) {
        baselineSeen = true;
        return report;
      }
      return {
        ...report,
        isBaseline: false
      };
    });
  };

  const applyImportedData = (incomingRaw: unknown, mode: "merge" | "replace") => {
    const incoming = coerceStoredAppData(incomingRaw as Record<string, unknown>);
    const importedReports = sortReportsChronological(incoming.reports);
    const incomingCanonicalMarkers = Array.from(
      new Set(importedReports.flatMap((report) => report.markers.map((marker) => marker.canonicalMarker)))
    );

    if (mode === "replace") {
      const replaceConfirmed =
        typeof window === "undefined"
          ? true
          : window.confirm(
              tr(
                "Dit vervangt al je huidige data. Weet je het zeker?",
                "This will replace your current data. Are you sure?"
              )
            );
      if (!replaceConfirmed) {
        return;
      }

      setAppData((prev) => ({
        ...incoming,
        // Keep current API key locally to avoid accidental key loss during restore.
        settings: {
          ...incoming.settings,
          claudeApiKey: prev.settings.claudeApiKey
        },
        reports: normalizeBaselineFlags(importedReports)
      }));
      setSelectedReports([]);
      setEditingReportId(null);
      setEditingAnnotations(blankAnnotations());
      setImportStatus({
        type: "success",
        message: tr(
          `Backup hersteld: ${importedReports.length} rapporten geladen.`,
          `Backup restored: ${importedReports.length} reports loaded.`
        )
      });
      return;
    }

    const mergeSuggestions = detectMarkerMergeSuggestions(incomingCanonicalMarkers, allMarkers);

    setAppData((prev) => {
      const byId = new Map<string, LabReport>();
      prev.reports.forEach((report) => {
        byId.set(report.id, report);
      });
      importedReports.forEach((report) => {
        byId.set(report.id, report);
      });
      const merged = normalizeBaselineFlags(sortReportsChronological(Array.from(byId.values())));
      return {
        ...prev,
        reports: merged
      };
    });
    setImportStatus({
      type: "success",
      message: tr(
        `Backup samengevoegd: ${importedReports.length} rapporten verwerkt.`,
        `Backup merged: processed ${importedReports.length} reports.`
      )
    });
    if (mergeSuggestions.length > 0) {
      setMarkerSuggestions((current) => {
        const merged = [...current, ...mergeSuggestions];
        return Array.from(
          merged
            .reduce((map, suggestion) => {
              const key = `${suggestion.sourceCanonical}|${suggestion.targetCanonical}`;
              const existing = map.get(key);
              if (!existing || suggestion.score > existing.score) {
                map.set(key, suggestion);
              }
              return map;
            }, new Map<string, MarkerMergeSuggestion>())
            .values()
        );
      });
    }
  };

  const onImportBackupFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      applyImportedData(parsed, importMode);
    } catch {
      setImportStatus({
        type: "error",
        message: tr(
          "Import mislukt: dit lijkt geen geldig TRT backup JSON-bestand.",
          "Import failed: this does not look like a valid TRT backup JSON file."
        )
      });
    } finally {
      event.target.value = "";
    }
  };

  const exportJson = () => {
    const reportsForExport = reports.map((report) => ({
      ...report,
      markers: report.markers
        .filter((marker) => appData.settings.enableCalculatedFreeTestosterone || !marker.isCalculated)
        .map((marker) => ({
          ...marker,
          source: marker.isCalculated ? "calculated" : "measured"
        }))
    }));
    const exportPayload = {
      ...appData,
      reports: reportsForExport
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `trt-lab-data-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const csv = buildCsv(reports, csvMarkerSelection, appData.settings.unitSystem);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `trt-lab-data-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = async () => {
    const root = document.getElementById("dashboard-export-root");
    if (!root) {
      return;
    }
    await exportElementToPdf(root, `trt-dashboard-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const chartPointsForMarker = (markerName: string): MarkerSeriesPoint[] =>
    buildMarkerSeries(visibleReports, markerName, appData.settings.unitSystem);

  const markerPercentChange = (marker: string): number | null => {
    const points = chartPointsForMarker(marker);
    const latest = points[points.length - 1];
    const previous = points[points.length - 2];
    if (!latest || !previous) {
      return null;
    }
    return calculatePercentChange(latest.value, previous.value);
  };

  const markerBaselineDelta = (marker: string): number | null => {
    if (!baselineReport) {
      return null;
    }
    const points = chartPointsForMarker(marker);
    const latest = points[points.length - 1];
    if (!latest) {
      return null;
    }
    const baselinePoint = buildMarkerSeries([baselineReport], marker, appData.settings.unitSystem)[0];
    if (!baselinePoint) {
      return null;
    }
    return calculatePercentVsBaseline(latest.value, baselinePoint.value);
  };

  const expandedMarkerPoints = useMemo(
    () => (expandedMarker ? chartPointsForMarker(expandedMarker) : []),
    [expandedMarker, visibleReports, appData.settings.unitSystem]
  );

  const expandedMarkerColorIndex = useMemo(() => {
    if (!expandedMarker) {
      return 0;
    }
    const allIndex = allMarkers.indexOf(expandedMarker);
    if (allIndex >= 0) {
      return allIndex;
    }
    const primaryIndex = primaryMarkers.findIndex((item) => item === expandedMarker);
    return primaryIndex >= 0 ? primaryIndex : 0;
  }, [expandedMarker, allMarkers, primaryMarkers]);

  const outOfRangeCount = useMemo(() => {
    let count = 0;
    visibleReports.forEach((report) => {
      report.markers.forEach((marker) => {
        if (marker.abnormal === "high" || marker.abnormal === "low") {
          count += 1;
        }
      });
    });
    return count;
  }, [visibleReports]);

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

  const generateShareLink = async () => {
    if (typeof window === "undefined") {
      return;
    }
    const token = buildShareToken({ ...appData, settings: { ...appData.settings, claudeApiKey: "" } }, shareOptions);
    if (!token) {
      return;
    }
    const shareUrl = `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(token)}`;
    setShareLink(shareUrl);
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Clipboard is optional here; the generated URL is still shown in the UI.
    }
  };

  const activeTabTitle = getTabLabel(activeTab, appData.settings.language);
  const analysisResultDisplay = useMemo(() => normalizeAnalysisTextForDisplay(analysisResult), [analysisResult]);
  const visibleTabs = isShareMode ? TAB_ITEMS.filter((tab) => tab.key === "dashboard") : TAB_ITEMS;

  const timeRangeOptions: Array<[TimeRangeKey, string]> = isNl
    ? [
        ["3m", "3 maanden"],
        ["6m", "6 maanden"],
        ["12m", "12 maanden"],
        ["all", "Alles"],
        ["custom", "Aangepast"]
      ]
    : [
        ["3m", "3 months"],
        ["6m", "6 months"],
        ["12m", "12 months"],
        ["all", "All time"],
        ["custom", "Custom"]
      ];

  const samplingOptions: Array<[AppSettings["samplingFilter"], string]> = isNl
    ? [
        ["all", "Alles"],
        ["trough", "Alleen trough"],
        ["peak", "Alleen peak"]
      ]
    : [
        ["all", "Show all"],
        ["trough", "Trough only"],
        ["peak", "Peak only"]
      ];

  const samplingTimingLabel = (value: ReportAnnotations["samplingTiming"]): string => {
    if (value === "unknown") {
      return isNl ? "Onbekend" : "Unknown";
    }
    if (value === "trough") {
      return "Trough";
    }
    if (value === "mid") {
      return isNl ? "Midden" : "Mid";
    }
    return "Peak";
  };

  const confidenceLabel = (value: string): string => {
    if (!isNl) {
      return value;
    }
    if (value === "High") {
      return "Hoog";
    }
    if (value === "Medium") {
      return "Middel";
    }
    if (value === "Low") {
      return "Laag";
    }
    return value;
  };

  const alertSeverityLabel = (severity: "high" | "medium" | "low"): string => {
    if (!isNl) {
      return severity;
    }
    if (severity === "high") {
      return "hoog";
    }
    if (severity === "medium") {
      return "middel";
    }
    return "laag";
  };

  const alertTypeLabel = (type: "threshold" | "trend"): string => {
    if (type === "threshold") {
      return isNl ? "Drempel" : "Threshold";
    }
    return isNl ? "Trend" : "Trend";
  };

  return (
    <div className="min-h-screen px-3 py-4 text-slate-100 sm:px-5 lg:px-6">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 lg:flex-row">
        <aside className="w-full rounded-2xl border border-slate-700/70 bg-slate-900/70 p-3 lg:sticky lg:top-4 lg:w-72 lg:self-start">
          <div className="brand-card mb-4 rounded-xl bg-gradient-to-br from-cyan-400/20 to-emerald-400/15 p-3">
            <img src={trtLogo} alt="TRT Lab Tracker" className="brand-logo mx-auto w-full max-w-[230px]" />
            <p className="brand-subtitle mt-2 text-center text-xs text-slate-200/90">{t(appData.settings.language, "subtitle")}</p>
          </div>

          <nav className="space-y-1.5">
            {visibleTabs.map((tab) => {
              const icon =
                tab.key === "dashboard" ? (
                  <BarChart3 className="h-4 w-4" />
                ) : tab.key === "protocolImpact" ? (
                  <Gauge className="h-4 w-4" />
                ) : tab.key === "doseResponse" ? (
                  <SlidersHorizontal className="h-4 w-4" />
                ) : tab.key === "alerts" ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : tab.key === "reports" ? (
                  <ClipboardList className="h-4 w-4" />
                ) : tab.key === "analysis" ? (
                  <Sparkles className="h-4 w-4" />
                ) : (
                  <Cog className="h-4 w-4" />
                );

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as TabKey)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                    activeTab === tab.key
                      ? "bg-cyan-500/15 text-cyan-200"
                      : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-100"
                  }`}
                >
                  {icon}
                  {getTabLabel(tab.key as TabKey, appData.settings.language)}
                </button>
              );
            })}
          </nav>

          {isShareMode ? (
            <div className="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-100">
              <p className="font-semibold">{isNl ? "Read-only deellink-snapshot" : "Read-only share snapshot"}</p>
              <p className="mt-1">
                {isNl
                  ? "Bewerken, uploads, API-keys en lokale opslagwijzigingen zijn uitgeschakeld in deze weergave."
                  : "Editing, uploads, API keys and local data writes are disabled in this view."}
              </p>
              {sharedSnapshot?.generatedAt ? (
                <p className="mt-1 text-cyan-200/80">{isNl ? "Gegenereerd" : "Generated"}: {formatDate(sharedSnapshot.generatedAt)}</p>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/80 p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">{t(appData.settings.language, "uploadPdf")}</p>
              <UploadPanel isProcessing={isProcessing} onFileSelected={handleUpload} language={appData.settings.language} />
              <button
                type="button"
                className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:border-cyan-500/50 hover:text-cyan-200"
                onClick={startManualEntry}
              >
                <Plus className="h-4 w-4" /> {t(appData.settings.language, "addManualValue")}
              </button>
              {uploadError ? (
                <div className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  {uploadError}
                </div>
              ) : null}
            </div>
          )}

          <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/80 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">{appData.settings.language === "nl" ? "Snel overzicht" : "Quick stats"}</p>
            <div className="mt-2 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">{t(appData.settings.language, "reports")}</span>
                <span className="font-semibold text-slate-100">{reports.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">{t(appData.settings.language, "markersTracked")}</span>
                <span className="font-semibold text-slate-100">{allMarkers.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">{t(appData.settings.language, "outOfRange")}</span>
                <span className="font-semibold text-amber-300">{outOfRangeCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">{t(appData.settings.language, "trtStabilityShort")}</span>
                <span className="font-semibold text-cyan-200">{trtStability.score === null ? "-" : `${trtStability.score}`}</span>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-3" id="dashboard-export-root">
          <header className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-2.5 sm:p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-100 sm:text-lg">{activeTabTitle}</h2>
                  <p className="text-sm text-slate-400">
                    {isShareMode
                      ? isNl
                        ? "Gedeelde read-only snapshot van tijdlijntrends en markercontext."
                        : "Shared read-only snapshot of timeline trends and marker context."
                      : isNl
                        ? "Professionele bloedwaardetracking met bewerkbare extractie en trendvisualisatie."
                        : "Professional blood work tracking with editable extraction and visual trends."}
                  </p>
                </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  className="rounded-md border border-slate-600 px-2.5 py-1.25 text-sm text-slate-200 hover:border-cyan-500/50"
                  onClick={() => updateSettings({ language: appData.settings.language === "nl" ? "en" : "nl" })}
                >
                  {t(appData.settings.language, "language")}: {appData.settings.language.toUpperCase()}
                </button>
                <button
                  type="button"
                  className={`rounded-md px-2.5 py-1.25 text-sm ${
                    appData.settings.theme === "dark" ? "bg-slate-800 text-slate-100" : "bg-slate-200 text-slate-900"
                  }`}
                  onClick={() => updateSettings({ theme: appData.settings.theme === "dark" ? "light" : "dark" })}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {appData.settings.theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}{" "}
                    {t(appData.settings.language, "theme")}
                  </span>
                </button>
                {isShareMode ? null : (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-2.5 py-1.25 text-sm text-slate-200 hover:border-cyan-500/50"
                    onClick={exportJson}
                  >
                    <Download className="h-4 w-4" /> JSON
                  </button>
                )}
              </div>
            </div>
          </header>

          <AnimatePresence mode="wait">
            {draft && !isShareMode ? (
              <ExtractionReview
                key="draft"
                draft={draft}
                annotations={draftAnnotations}
                language={appData.settings.language}
                showSamplingTiming={samplingControlsEnabled}
                onDraftChange={setDraft}
                onAnnotationsChange={setDraftAnnotations}
                onSave={saveDraftAsReport}
                onCancel={() => setDraft(null)}
              />
            ) : null}
          </AnimatePresence>

          {activeTab === "dashboard" ? (
            <section className="space-y-3 fade-in">
              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {timeRangeOptions.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`rounded-md px-2.5 py-1 text-xs sm:text-sm ${
                        appData.settings.timeRange === value
                          ? "bg-cyan-500/20 text-cyan-200"
                          : "bg-slate-800 text-slate-300 hover:text-slate-100"
                      }`}
                      onClick={() => updateSettings({ timeRange: value })}
                    >
                      {label}
                    </button>
                  ))}

                  {appData.settings.timeRange === "custom" ? (
                    <div className="ml-0 flex flex-wrap items-center gap-2 sm:ml-2">
                      <input
                        type="date"
                        className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm"
                        value={appData.settings.customRangeStart}
                        onChange={(event) => updateSettings({ customRangeStart: event.target.value })}
                      />
                      <input
                        type="date"
                        className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm"
                        value={appData.settings.customRangeEnd}
                        onChange={(event) => updateSettings({ customRangeEnd: event.target.value })}
                      />
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className={`ml-auto rounded-md px-2.5 py-1 text-xs sm:text-sm ${
                      comparisonMode ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800 text-slate-300"
                    }`}
                    onClick={() => setComparisonMode((prev) => !prev)}
                  >
                    <span className="inline-flex items-center gap-1">
                      <SlidersHorizontal className="h-4 w-4" /> {isNl ? "Multi-marker modus" : "Multi-marker mode"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-slate-800 px-2.5 py-1 text-xs text-slate-300 sm:text-sm"
                    onClick={() => updateSettings({ unitSystem: appData.settings.unitSystem === "eu" ? "us" : "eu" })}
                  >
                    {isNl ? "Eenheden" : "Units"}: {appData.settings.unitSystem.toUpperCase()}
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
                    <input
                      type="checkbox"
                      checked={appData.settings.showReferenceRanges}
                      onChange={(event) => updateSettings({ showReferenceRanges: event.target.checked })}
                    />
                    {isNl ? "Referentiebereiken" : "Reference ranges"}
                  </label>
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
                    <input
                      type="checkbox"
                      checked={appData.settings.showAbnormalHighlights}
                      onChange={(event) => updateSettings({ showAbnormalHighlights: event.target.checked })}
                    />
                    {isNl ? "Afwijkende waarden markeren" : "Abnormal highlights"}
                  </label>
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
                    <input
                      type="checkbox"
                      checked={appData.settings.showAnnotations}
                      onChange={(event) => updateSettings({ showAnnotations: event.target.checked })}
                    />
                    {isNl ? "Dosisfase-overlay" : "Dose-phase overlays"}
                  </label>
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
                    <input
                      type="checkbox"
                      checked={appData.settings.showTrtTargetZone}
                      onChange={(event) => updateSettings({ showTrtTargetZone: event.target.checked })}
                    />
                    {isNl ? "TRT-doelzone" : "TRT optimal zone"}
                  </label>
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
                    <input
                      type="checkbox"
                      checked={appData.settings.showLongevityTargetZone}
                      onChange={(event) => updateSettings({ showLongevityTargetZone: event.target.checked })}
                    />
                    {isNl ? "Longevity-doelzone" : "Longevity zone"}
                  </label>
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
                    <input
                      type="checkbox"
                      checked={appData.settings.yAxisMode === "data"}
                      onChange={(event) => updateSettings({ yAxisMode: event.target.checked ? "data" : "zero" })}
                    />
                    {isNl ? "Gebruik data-bereik Y-as" : "Use data-range Y-axis"}
                  </label>
                </div>

                {samplingControlsEnabled ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
                      {isNl ? "Meetmoment-filter" : "Sampling filter"}
                    </span>
                    {samplingOptions.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`rounded-md px-2.5 py-1 text-xs sm:text-sm ${
                          appData.settings.samplingFilter === value
                            ? "bg-cyan-500/20 text-cyan-200"
                            : "bg-slate-800 text-slate-300 hover:text-slate-100"
                        }`}
                        onClick={() => updateSettings({ samplingFilter: value })}
                      >
                        {label}
                      </button>
                    ))}
                    <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.25 text-xs text-slate-300 sm:text-sm">
                      <input
                        type="checkbox"
                        checked={appData.settings.compareToBaseline}
                        onChange={(event) => updateSettings({ compareToBaseline: event.target.checked })}
                      />
                      {isNl ? "Vergelijk met baseline" : "Compare to baseline"}
                    </label>
                  </div>
                ) : null}
              </div>

              {comparisonMode ? (
                <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-2.5">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                      value={leftCompareMarker}
                      onChange={(event) => setLeftCompareMarker(event.target.value)}
                    >
                      {allMarkers.map((marker) => (
                        <option key={marker} value={marker}>
                          {getMarkerDisplayName(marker, appData.settings.language)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                      value={rightCompareMarker}
                      onChange={(event) => setRightCompareMarker(event.target.value)}
                    >
                      {allMarkers.map((marker) => (
                        <option key={marker} value={marker}>
                          {getMarkerDisplayName(marker, appData.settings.language)}
                        </option>
                      ))}
                    </select>
                    <label className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-2 text-xs text-slate-300 sm:text-sm">
                      <input
                        type="checkbox"
                        checked={appData.settings.comparisonScale === "normalized"}
                        onChange={(event) =>
                          updateSettings({
                            comparisonScale: event.target.checked ? "normalized" : "absolute"
                          })
                        }
                      />
                      {appData.settings.language === "nl" ? "Genormaliseerde schaal (0-100%)" : "Normalized scale (0-100%)"}
                    </label>
                  </div>

                  <ComparisonChart
                    leftMarker={leftCompareMarker}
                    rightMarker={rightCompareMarker}
                    reports={visibleReports}
                    settings={appData.settings}
                    language={appData.settings.language}
                  />
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-2.5">
                <div className="mb-3 flex gap-2">
                  <button
                    type="button"
                    className={`rounded-md px-3 py-1.5 text-sm ${
                      dashboardView === "primary" ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-800 text-slate-300"
                    }`}
                    onClick={() => setDashboardView("primary")}
                  >
                    {isNl ? "Primaire markers" : "Primary markers"}
                  </button>
                  <button
                    type="button"
                    className={`rounded-md px-3 py-1.5 text-sm ${
                      dashboardView === "all" ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-800 text-slate-300"
                    }`}
                    onClick={() => setDashboardView("all")}
                  >
                    {isNl ? "Alle markers" : "All markers"}
                  </button>
                </div>

                {dashboardView === "primary" ? (
                  <div className="mb-1" />
                ) : null}

                {visibleReports.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-700 py-14 text-center">
                    <p className="text-base font-semibold text-slate-200">{isNl ? "Geen data in huidige filter" : "No data in current filter"}</p>
                    <p className="mt-1 text-sm text-slate-400">
                      {reports.length === 0
                        ? isNl
                          ? "Upload je eerste PDF om TRT-bloedwaardetrends te volgen."
                          : "Upload your first PDF to start tracking TRT blood work trends."
                        : isNl
                          ? samplingControlsEnabled
                            ? "Pas tijdsbereik of meetmoment-filter aan om data te tonen."
                            : "Pas het tijdsbereik aan om data te tonen."
                          : samplingControlsEnabled
                            ? "Change time range or sampling filter to show data."
                            : "Change time range to show data."}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {(dashboardView === "primary" ? primaryMarkers : allMarkers).map((marker, index) => {
                      const points = chartPointsForMarker(marker);
                      return (
                        <MarkerChartCard
                          key={marker}
                          marker={marker}
                          points={points}
                          colorIndex={index}
                          settings={appData.settings}
                          language={appData.settings.language}
                          phaseBlocks={dosePhaseBlocks}
                          alertCount={alertsByMarker[marker]?.length ?? 0}
                          trendSummary={trendByMarker[marker] ?? null}
                          percentChange={markerPercentChange(marker)}
                          baselineDelta={markerBaselineDelta(marker)}
                          isCalculatedMarker={points.length > 0 && points.every((point) => point.isCalculated)}
                          onOpenLarge={() => setExpandedMarker(marker)}
                          onRenameMarker={openRenameDialog}
                        />
                      );
                    })}
                  </div>
                )}

                {dashboardView === "primary" ? (
                  <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800/70 p-3 text-left">
                    <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center">
                      <div className="relative mx-auto h-28 w-28">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: "score", value: trtStability.score ?? 0 },
                                { name: "rest", value: 100 - (trtStability.score ?? 0) }
                              ]}
                              dataKey="value"
                              innerRadius={34}
                              outerRadius={48}
                              stroke="none"
                              startAngle={90}
                              endAngle={-270}
                            >
                              <Cell fill={stabilityColor(trtStability.score)} />
                              <Cell fill="#334155" />
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <span className="text-xl font-semibold text-slate-100">{trtStability.score === null ? "-" : trtStability.score}</span>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-100">TRT Stability Index</p>
                          <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs text-cyan-200">
                            {trtStability.score === null ? "-" : `${trtStability.score}`}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-300">
                          {isNl
                            ? "Dit is een rust-score van je kern TRT-markers over tijd (Testosteron, Estradiol, Hematocriet, SHBG)."
                            : "This is a steadiness score of your core TRT markers over time (Testosterone, Estradiol, Hematocrit, SHBG)."}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {isNl
                            ? "Belangrijk: het zegt niets over ‘goed’ of ‘slecht’, alleen hoe stabiel je patroon is."
                            : "Important: it does not mean 'good' or 'bad'; it only reflects how stable your pattern is."}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {isNl
                            ? "Snelle interpretatie: 80-100 = vrij stabiel, 60-79 = matig stabiel, <60 = duidelijk wisselend."
                            : "Quick interpretation: 80-100 = fairly stable, 60-79 = moderately stable, <60 = clearly variable."}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {activeTab === "alerts" ? (
            <section className="space-y-4 fade-in">
              <div className="alerts-hero rounded-2xl border border-slate-700/70 bg-gradient-to-br from-slate-900/80 via-slate-900/70 to-cyan-950/25 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-100">{isNl ? "Alerts Centrum" : "Alerts Center"}</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      {isNl
                        ? "Signalen met context en suggesties om met je arts te bespreken."
                        : "Signals with context and discussion suggestions for your doctor."}
                    </p>
                  </div>
                  {samplingControlsEnabled ? (
                    <span className="rounded-full border border-cyan-500/40 bg-cyan-500/15 px-3 py-1 text-xs text-cyan-200">
                      {isNl ? "Filter actief" : "Filter active"}: {appData.settings.samplingFilter}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                    <p className="text-xs uppercase tracking-wide text-rose-200">{isNl ? "Actie nodig" : "Action needed"}</p>
                    <p className="mt-1 text-2xl font-semibold text-rose-100">{actionableAlerts.length}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <p className="text-xs uppercase tracking-wide text-emerald-200">{isNl ? "Positieve signalen" : "Positive signals"}</p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-100">{positiveAlerts.length}</p>
                  </div>
                  <div className="rounded-xl border border-slate-600 bg-slate-800/70 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-300">{isNl ? "Totaal" : "Total alerts"}</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-100">{alerts.length}</p>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-900/60 p-3 text-xs text-slate-300">
                  {isNl
                    ? "Leesvolgorde: 1) bekijk eerst 'Positieve signalen', 2) zie wat al goed gaat, 3) ga daarna naar 'Actie nodig' voor de aandachtspunten."
                    : "Reading order: 1) review 'Positive signals' first, 2) see what is already going well, 3) then review 'Action needed' for attention points."}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h4 className="text-sm font-semibold text-slate-100">{isNl ? "Positieve signalen" : "Positive signals"}</h4>
                <p className="mt-1 text-xs text-slate-400">
                  {isNl
                    ? "Waarden of trends die momenteel gunstig ogen worden hier groen gemarkeerd."
                    : "Values or trends that currently look favorable are shown here in green."}
                </p>
                {positiveAlerts.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-400">{isNl ? "Nog geen positieve signalen in deze filter." : "No positive signals in this filter yet."}</p>
                ) : (
                  <div className="mt-3 columns-1 [column-gap:0.75rem] md:columns-2 2xl:columns-3">
                    {positiveAlerts.map((alert) => {
                      const series = alertSeriesByMarker[alert.marker] ?? [];
                      return (
                      <article key={alert.id} className="positive-alert-card mb-3 break-inside-avoid rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3 text-emerald-100">
                        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_190px]">
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold">{getMarkerDisplayName(alert.marker, appData.settings.language)}</p>
                              <span className="rounded-full border border-emerald-300/30 bg-emerald-500/20 px-2 py-0.5 text-[11px]">
                                {isNl ? "Positief" : "Positive"}
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
                              language={appData.settings.language}
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

              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h4 className="text-sm font-semibold text-slate-100">{isNl ? "Actiegerichte alerts" : "Actionable alerts"}</h4>
                <p className="mt-1 text-xs text-slate-400">
                  {isNl
                    ? "Dit zijn signalen waarbij vaak een bespreekactie of extra monitoring zinvol is."
                    : "These signals often benefit from discussion or additional monitoring."}
                </p>
                {actionableAlerts.length === 0 ? (
                  <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-4 text-sm text-emerald-200">
                    {isNl
                      ? "Geen alerts met directe actie in de huidige filter. Dat is meestal een goed teken."
                      : "No action-needed alerts in the current filter. That is usually a good sign."}
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
                        <article key={alert.id} className={`mb-3 break-inside-avoid rounded-xl border p-3 shadow-soft ${cardClass}`}>
                          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_200px]">
                            <div>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold">
                                  {getMarkerDisplayName(alert.marker, appData.settings.language)}
                                </p>
                                <div className="flex items-center gap-1.5 text-[11px]">
                                  <span className="rounded-full border border-white/20 bg-black/15 px-2 py-0.5">
                                    {alertTypeLabel(alert.type)}
                                  </span>
                                  <span className="rounded-full border border-white/20 bg-black/15 px-2 py-0.5">
                                    {isNl ? "Prioriteit" : "Priority"}: {alertSeverityLabel(alert.severity)}
                                  </span>
                                </div>
                              </div>
                              <p className="mt-1 text-sm leading-snug">{alert.message}</p>
                              <div className="mt-1 rounded-lg border border-white/15 bg-slate-950/30 px-2.5 py-2">
                                <p className="text-[11px] uppercase tracking-wide opacity-80">
                                  {isNl ? "Mogelijke bespreekactie" : "Suggested discussion action"}
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
                                language={appData.settings.language}
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
          ) : null}

          {activeTab === "protocolImpact" ? (
            <section className="space-y-3 fade-in">
              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h3 className="text-base font-semibold text-slate-100">{isNl ? "Protocol-impact" : "Protocol Impact"}</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                  <label className="text-xs text-slate-300">
                    {isNl ? "Zoek marker" : "Filter markers"}
                    <input
                      value={protocolMarkerSearch}
                      onChange={(event) => setProtocolMarkerSearch(event.target.value)}
                      placeholder={isNl ? "bijv. Estradiol" : "e.g. Estradiol"}
                      className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900/80 px-2.5 py-1.5 text-sm text-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-300">
                    {isNl ? "Window grootte" : "Window size"}
                    <select
                      value={protocolWindowSize}
                      onChange={(event) => setProtocolWindowSize(Number(event.target.value))}
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
                    {isNl ? "Categorie" : "Category"}
                    <select
                      value={protocolCategoryFilter}
                      onChange={(event) =>
                        setProtocolCategoryFilter(event.target.value as "all" | "Hormones" | "Lipids" | "Hematology" | "Inflammation")
                      }
                      className="mt-1 rounded-md border border-slate-600 bg-slate-900/80 px-2.5 py-1.5 text-sm text-slate-100"
                    >
                      <option value="all">{isNl ? "Alle categorieën" : "All categories"}</option>
                      <option value="Hormones">{isNl ? "Hormonen" : "Hormones"}</option>
                      <option value="Lipids">{isNl ? "Lipiden" : "Lipids"}</option>
                      <option value="Hematology">{isNl ? "Hematologie" : "Hematology"}</option>
                      <option value="Inflammation">{isNl ? "Ontsteking" : "Inflammation"}</option>
                    </select>
                  </label>
                </div>

                <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800/70 p-3">
                  <h4 className="text-sm font-semibold text-slate-100">{isNl ? "Dosis-respons overzicht" : "Dose Response Overview"}</h4>
                  {protocolDoseOverview.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-400">
                      {isNl ? "Nog te weinig punten (minimaal n=3 per marker) voor correlatie-overzicht." : "Not enough points yet (minimum n=3 per marker) for correlation overview."}
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-xs text-slate-300">
                      {protocolDoseOverview.map((item) => (
                        <li key={item.marker}>
                          {getMarkerDisplayName(item.marker, appData.settings.language)}{" "}
                          {item.r >= 0
                            ? isNl
                              ? "neigt omhoog bij hogere dosis"
                              : "tends to increase with higher dose"
                            : isNl
                              ? "neigt omlaag bij hogere dosis"
                              : "tends to decrease with higher dose"}{" "}
                          (r={formatAxisTick(item.r)}, n={item.n})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {protocolDoseEvents.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-400">
                    {isNl
                      ? "Nog geen dosisveranderingsevents gevonden in je huidige datafilter."
                      : "No dose change events found in your current data filter."}
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {protocolDoseEvents.map((event: ProtocolImpactDoseEvent) => {
                      const isCollapsed = collapsedProtocolEvents.includes(event.id);
                      const categorySet =
                        protocolCategoryFilter === "all"
                          ? null
                          : new Set(PROTOCOL_MARKER_CATEGORIES[protocolCategoryFilter] ?? []);
                      const query = protocolMarkerSearch.trim().toLowerCase();
                      const rows = event.rows
                        .filter((row) => {
                          if (categorySet && !categorySet.has(row.marker)) {
                            return false;
                          }
                          if (!query) {
                            return true;
                          }
                          const label = getMarkerDisplayName(row.marker, appData.settings.language).toLowerCase();
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
                            onClick={() =>
                              setCollapsedProtocolEvents((current) =>
                                current.includes(event.id) ? current.filter((id) => id !== event.id) : [...current, event.id]
                              )
                            }
                          >
                            <h4 className="text-sm font-semibold text-slate-100">
                              {(event.fromDose ?? "-")} {"->"} {(event.toDose ?? "-")} mg/week
                            </h4>
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-slate-400">
                                {formatDate(event.changeDate)} | {isNl ? "Window" : "Window"}: {event.beforeCount} {isNl ? "voor" : "before"} /{" "}
                                {event.afterCount} {isNl ? "na" : "after"}
                              </p>
                              <ChevronDown className={`h-4 w-4 text-slate-400 transition ${isCollapsed ? "" : "rotate-180"}`} />
                            </div>
                          </button>
                          {!isCollapsed ? (
                            <>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {event.topImpacts.length === 0 ? (
                                  <span className="text-xs text-slate-400">{isNl ? "Top impacts: onvoldoende data" : "Top impacts: insufficient data"}</span>
                                ) : (
                                  event.topImpacts.map((row) => (
                                    <span key={`${event.id}-${row.marker}`} className="rounded-full bg-slate-900/70 px-2 py-0.5 text-xs text-cyan-200">
                                      {getMarkerDisplayName(row.marker, appData.settings.language)}{" "}
                                      {row.deltaPct === null ? "-" : `${row.deltaPct > 0 ? "+" : ""}${row.deltaPct}%`}
                                    </span>
                                  ))
                                )}
                              </div>
                              <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                                <span>{isNl ? "Sorteer op" : "Sort by"}:</span>
                                <button type="button" className={`rounded px-2 py-0.5 ${protocolSortKey === "deltaPct" ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-900/70"}`} onClick={() => setProtocolSortKey("deltaPct")}>Δ%</button>
                                <button type="button" className={`rounded px-2 py-0.5 ${protocolSortKey === "deltaAbs" ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-900/70"}`} onClick={() => setProtocolSortKey("deltaAbs")}>Δ</button>
                                <button type="button" className={`rounded px-2 py-0.5 ${protocolSortKey === "marker" ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-900/70"}`} onClick={() => setProtocolSortKey("marker")}>{isNl ? "Marker" : "Marker"}</button>
                              </div>
                              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-700">
                                <table className="min-w-full divide-y divide-slate-700 text-xs">
                                  <thead className="bg-slate-900/70 text-slate-300">
                                    <tr>
                                      <th className="px-2 py-1.5 text-left">{isNl ? "Marker" : "Marker"}</th>
                                      <th className="px-2 py-1.5 text-right">{isNl ? "Voor gem." : "Before avg"}</th>
                                      <th className="px-2 py-1.5 text-right">{isNl ? "Na gem." : "After avg"}</th>
                                      <th className="px-2 py-1.5 text-right">Δ</th>
                                      <th className="px-2 py-1.5 text-right">Δ%</th>
                                      <th className="px-2 py-1.5 text-center">{isNl ? "Trend" : "Trend"}</th>
                                      <th className="px-2 py-1.5 text-left">{isNl ? "Confidence" : "Confidence"}</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-800">
                                    {rows.map((row) => (
                                      <tr key={`${event.id}-${row.marker}`} className="bg-slate-900/30 text-slate-200">
                                        <td className="px-2 py-1.5">{getMarkerDisplayName(row.marker, appData.settings.language)}</td>
                                        <td className="px-2 py-1.5 text-right">{row.beforeAvg === null ? "Insufficient data" : `${formatAxisTick(row.beforeAvg)} ${row.unit}`}</td>
                                        <td className="px-2 py-1.5 text-right">{row.afterAvg === null ? "Insufficient data" : `${formatAxisTick(row.afterAvg)} ${row.unit}`}</td>
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
          ) : null}

          {activeTab === "doseResponse" ? (
            <section className="space-y-3 fade-in">
              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h3 className="text-base font-semibold text-slate-100">{isNl ? "Dosis-respons schattingen" : "Dose-response Estimates"}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {isNl
                    ? "In gewone taal: dit model schat, op basis van je eigen historie, wat er waarschijnlijk met een marker gebeurt als je dosis verandert."
                    : "In plain language: this model estimates, from your own history, what will likely happen to a marker if your dose changes."}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {isNl
                    ? "Alleen zichtbaar bij voldoende meetpunten; bedoeld als gesprekshulp met je arts."
                    : "Only shown with enough data points; intended as a discussion aid with your doctor."}
                </p>

                <div className="mt-3 rounded-lg border border-cyan-500/25 bg-cyan-500/5 p-3">
                  <label className="text-xs font-medium uppercase tracking-wide text-cyan-200">
                    {isNl ? "Simuleer testosterondosis (mg/week)" : "Simulate testosterone dose (mg/week)"}
                  </label>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      inputMode="decimal"
                      value={doseResponseInput}
                      onChange={(event) => setDoseResponseInput(event.target.value)}
                      placeholder={isNl ? "Bijv. 100" : "e.g. 100"}
                      className="w-40 rounded-md border border-slate-600 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setDoseResponseInput("")}
                      className="rounded-md border border-slate-600 px-2.5 py-1.5 text-xs text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200"
                    >
                      {isNl ? "Auto-scenario" : "Auto scenario"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    {hasCustomDose && customDoseValue !== null
                      ? isNl
                        ? `Actief scenario: ${formatAxisTick(customDoseValue)} mg/week voor alle voorspellingen.`
                        : `Active scenario: ${formatAxisTick(customDoseValue)} mg/week for all estimates.`
                      : isNl
                        ? "Geen handmatige dosis ingevuld; per marker wordt het standaard scenario gebruikt."
                        : "No manual dose entered; each marker currently uses its default scenario."}
                  </p>
                </div>

                {dosePredictions.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-400">
                    {isNl ? "Nog te weinig dose-gekoppelde meetpunten voor schattingen." : "Not enough dose-linked data points yet for estimates."}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm">
                    {dosePredictions.map((prediction) => {
                      const markerLabel = getMarkerDisplayName(prediction.marker, appData.settings.language);
                      const targetDose = hasCustomDose && customDoseValue !== null ? customDoseValue : prediction.suggestedDose;
                      const canPredict = prediction.status === "clear";
                      const targetEstimate =
                        canPredict
                          ? Math.max(0, prediction.intercept + prediction.slopePerMg * targetDose)
                          : null;
                      const targetPercentChange =
                        canPredict && targetEstimate !== null
                          ? calculatePercentChange(targetEstimate, prediction.currentEstimate)
                          : null;
                      const currentEstimate = `${formatAxisTick(prediction.currentEstimate)} ${prediction.unit}`;
                      const projectedEstimate = targetEstimate === null ? "-" : `${formatAxisTick(targetEstimate)} ${prediction.unit}`;
                      const pctText =
                        targetPercentChange === null
                          ? isNl
                            ? "onbekend"
                            : "unknown"
                          : `${targetPercentChange > 0 ? "+" : ""}${targetPercentChange}%`;
                      const directionText =
                        targetPercentChange === null
                          ? isNl
                            ? "verandering"
                            : "change"
                          : targetPercentChange >= 0
                            ? isNl
                              ? "stijging"
                              : "increase"
                            : isNl
                              ? "daling"
                              : "decrease";
                      const correlationText =
                        prediction.correlationR === null
                          ? isNl
                            ? "n.v.t."
                            : "n/a"
                          : `${prediction.correlationR > 0 ? "+" : ""}${formatAxisTick(prediction.correlationR)}`;
                      const usedDatesText =
                        prediction.usedReportDates.length === 0
                          ? "-"
                          : prediction.usedReportDates.join(", ");
                      const excludedSummary =
                        prediction.excludedPoints.length === 0
                          ? null
                          : prediction.excludedPoints
                              .slice(0, 3)
                              .map((item) => `${item.date}: ${item.reason}`)
                              .join(" | ");
                      return (
                        <li key={prediction.marker} className="rounded-lg bg-slate-800/70 px-3 py-2 text-slate-200">
                          <p className="font-medium">{markerLabel}</p>
                          {canPredict ? (
                            <p className="mt-1 text-xs leading-relaxed text-slate-200">
                              {isNl
                                ? `Als je dosis rond ${formatAxisTick(targetDose)} mg/week ligt, verwacht dit model dat ${markerLabel} ongeveer ${projectedEstimate} wordt. Ter vergelijking: bij ongeveer ${formatAxisTick(prediction.currentDose)} mg/week is de modelwaarde nu ${currentEstimate}. Dat is waarschijnlijk een ${directionText} van ${pctText}.`
                                : `If your dose is around ${formatAxisTick(targetDose)} mg/week, this model expects ${markerLabel} to be about ${projectedEstimate}. For reference, at around ${formatAxisTick(prediction.currentDose)} mg/week the current model value is ${currentEstimate}. That is likely a ${directionText} of ${pctText}.`}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs leading-relaxed text-amber-200">
                              {isNl
                                ? `Nog geen betrouwbare dosis-schatting voor ${markerLabel}. ${prediction.statusReason}`
                                : `No reliable dose estimate yet for ${markerLabel}. ${prediction.statusReason}`}
                            </p>
                          )}
                          <p className="mt-1 text-[11px] text-slate-400">
                            {isNl ? "Betrouwbaarheid van deze inschatting" : "Confidence of this estimate"}: {confidenceLabel(prediction.confidence)}{" "}
                            (n={prediction.sampleCount}, r={correlationText}, R²={formatAxisTick(prediction.rSquared)}, {prediction.modelType})
                          </p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            {isNl ? "Debug (gebruikte data)" : "Debug (used data)"}:{" "}
                            {isNl ? "helling" : "slope"}={formatAxisTick(prediction.slopePerMg)},{" "}
                            {isNl ? "intercept" : "intercept"}={formatAxisTick(prediction.intercept)},{" "}
                            {isNl ? "data-datums" : "dates"}={usedDatesText}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            {isNl ? "Samplingbasis" : "Sampling basis"}:{" "}
                            {prediction.samplingMode === "trough"
                              ? isNl
                                ? "Trough-only"
                                : "Trough-only"
                              : isNl
                                ? "Alle timings"
                                : "All timings"}
                            {prediction.samplingWarning ? ` • ${prediction.samplingWarning}` : ""}
                          </p>
                          {excludedSummary ? (
                            <p className="mt-1 text-[11px] text-slate-500">
                              {isNl ? "Uitgesloten punten" : "Excluded points"}: {excludedSummary}
                              {prediction.excludedPoints.length > 3 ? ` +${prediction.excludedPoints.length - 3}` : ""}
                            </p>
                          ) : null}
                          {canPredict && targetEstimate !== null ? (
                            <div className="mt-2">
                              <DoseProjectionChart
                                prediction={prediction}
                                reports={visibleReports}
                                settings={appData.settings}
                                language={appData.settings.language}
                                targetDose={targetDose}
                                targetEstimate={targetEstimate}
                              />
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          ) : null}

          {activeTab === "reports" ? (
            <section className="space-y-3 fade-in">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
                <div className="text-sm text-slate-300">
                  <span className="font-semibold text-slate-100">{reports.length}</span>{" "}
                  {isNl ? "rapporten totaal" : "reports total"}
                </div>
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/70 p-0.5">
                    <button
                      type="button"
                      className={`rounded px-2 py-1 text-xs ${reportSortOrder === "desc" ? "bg-cyan-500/20 text-cyan-200" : "text-slate-300 hover:text-slate-100"}`}
                      onClick={() => setReportSortOrder("desc")}
                    >
                      {isNl ? "Nieuwste eerst" : "Newest first"}
                    </button>
                    <button
                      type="button"
                      className={`rounded px-2 py-1 text-xs ${reportSortOrder === "asc" ? "bg-cyan-500/20 text-cyan-200" : "text-slate-300 hover:text-slate-100"}`}
                      onClick={() => setReportSortOrder("asc")}
                    >
                      {isNl ? "Oudste eerst" : "Oldest first"}
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
                    {isNl ? "Selecteer alles" : "Select all"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-sm text-cyan-200 disabled:opacity-50"
                    disabled={selectedReports.length < 2}
                    onClick={() => setReportComparisonOpen((prev) => !prev)}
                  >
                    <ClipboardList className="h-4 w-4" /> {isNl ? "Vergelijk selectie" : "Compare selected"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-sm text-rose-300 disabled:opacity-50"
                    disabled={selectedReports.length === 0 || isShareMode}
                    onClick={deleteSelectedReports}
                  >
                    <Trash2 className="h-4 w-4" /> {isNl ? "Verwijder selectie" : "Delete selected"}
                  </button>
                </div>
              </div>

              {reportComparisonOpen && compareReports.length >= 2 ? (
                <div className="overflow-x-auto rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
                  <h4 className="mb-2 text-sm font-semibold text-slate-100">
                    {isNl ? "Vergelijking van geselecteerde rapporten" : "Selected report comparison"}
                  </h4>
                  <table className="min-w-full divide-y divide-slate-700 text-xs sm:text-sm">
                    <thead className="bg-slate-900/70 text-slate-300">
                      <tr>
                        <th className="px-2 py-2 text-left">{isNl ? "Marker" : "Marker"}</th>
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
                          <td className="px-2 py-2 text-left">{getMarkerDisplayName(marker, appData.settings.language)}</td>
                          {compareReports.map((report) => {
                            const point = buildMarkerSeries([report], marker, appData.settings.unitSystem)[0];
                            return (
                              <td key={`${report.id}-${marker}`} className="px-2 py-2 text-right">
                                {point ? `${formatAxisTick(point.value)} ${point.unit}` : "-"}
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
                const doseSummary =
                  report.annotations.dosageMgPerWeek === null
                    ? isNl
                      ? "Dosis: -"
                      : "Dose: -"
                    : `${isNl ? "Dosis" : "Dose"}: ${report.annotations.dosageMgPerWeek} mg/week`;

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
                            {isNl ? "Baseline" : "Baseline"}
                          </span>
                        ) : null}
                      </h3>
                      <p className="text-xs text-slate-300">{doseSummary}</p>
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
                        {selectedReports.includes(report.id)
                          ? isNl
                            ? "Geselecteerd"
                            : "Selected"
                          : isNl
                            ? "Selecteer"
                            : "Select"}
                      </button>
                      {!isShareMode && isEditing ? (
                        <>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md border border-slate-500/60 bg-slate-800/70 px-2 py-1.5 text-xs text-slate-200"
                            onClick={cancelEditingReport}
                          >
                            <X className="h-3.5 w-3.5" /> {isNl ? "Annuleer" : "Cancel"}
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-300"
                            onClick={saveEditedReport}
                          >
                            <Save className="h-3.5 w-3.5" /> {isNl ? "Opslaan" : "Save"}
                          </button>
                        </>
                      ) : !isShareMode ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1.5 text-xs text-cyan-200"
                          onClick={() => startEditingReport(report)}
                        >
                          <Pencil className="h-3.5 w-3.5" /> {isNl ? "Bewerk details" : "Edit details"}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-2 py-1.5 text-xs text-slate-300">
                          <Lock className="h-3.5 w-3.5" /> {isNl ? "Alleen-lezen" : "Read-only"}
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
                          onClick={() => setBaselineReport(report.id)}
                        >
                          <Lock className="h-3.5 w-3.5" /> {report.isBaseline ? "Baseline" : isNl ? "Zet als baseline" : "Set baseline"}
                        </button>
                      ) : null}

                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-300"
                        disabled={isShareMode}
                        onClick={() => deleteReport(report.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {isNl ? "Verwijder" : "Delete"}
                      </button>
                    </div>

                  {isEditing ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <label className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                        <span className="mb-1 block text-slate-400">{isNl ? "Dosis (mg/week)" : "Dose (mg/week)"}</span>
                        <input
                          type="number"
                          className="w-full rounded-md border border-slate-600 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100"
                          value={editingAnnotations.dosageMgPerWeek ?? ""}
                          onChange={(event) =>
                            setEditingAnnotations((current) => ({
                              ...current,
                              dosageMgPerWeek: safeNumber(event.target.value)
                            }))
                          }
                        />
                      </label>
                      <label className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                        <span className="mb-1 block text-slate-400">Protocol</span>
                        <input
                          className="w-full rounded-md border border-slate-600 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100"
                          value={editingAnnotations.protocol}
                          onChange={(event) =>
                            setEditingAnnotations((current) => ({
                              ...current,
                              protocol: event.target.value
                            }))
                          }
                        />
                      </label>
                      <label className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                        <span className="mb-1 block text-slate-400">{isNl ? "Supplementen / vitaminen" : "Supplements / vitamins"}</span>
                        <input
                          className="w-full rounded-md border border-slate-600 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100"
                          value={editingAnnotations.supplements}
                          onChange={(event) =>
                            setEditingAnnotations((current) => ({
                              ...current,
                              supplements: event.target.value
                            }))
                          }
                        />
                      </label>
                      <label className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                        <span className="mb-1 block text-slate-400">{isNl ? "Symptomen" : "Symptoms"}</span>
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
                          <span className="mb-1 block text-slate-400">{isNl ? "Meetmoment" : "Sampling timing"}</span>
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
                            <option value="unknown">{isNl ? "Onbekend" : "Unknown"}</option>
                            <option value="trough">Trough</option>
                            <option value="mid">{isNl ? "Midden" : "Mid"}</option>
                            <option value="peak">Peak</option>
                          </select>
                        </label>
                      ) : null}
                    </div>
                  ) : (
                    <div className={`mt-3 grid gap-2 sm:grid-cols-2 ${samplingControlsEnabled ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}>
                      <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                        <span className="block text-slate-400">{isNl ? "Dosis" : "Dose"}</span>
                        <strong className="text-sm text-slate-100">
                          {report.annotations.dosageMgPerWeek === null ? "-" : `${report.annotations.dosageMgPerWeek} mg/week`}
                        </strong>
                      </div>
                      <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                        <span className="block text-slate-400">Protocol</span>
                        <strong className="text-sm text-slate-100">{report.annotations.protocol || "-"}</strong>
                      </div>
                      <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                        <span className="block text-slate-400">{isNl ? "Supplementen" : "Supplements"}</span>
                        <strong className="text-sm text-slate-100">{report.annotations.supplements || "-"}</strong>
                      </div>
                      <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                        <span className="block text-slate-400">{isNl ? "Symptomen" : "Symptoms"}</span>
                        <strong className="text-sm text-slate-100">{report.annotations.symptoms || "-"}</strong>
                      </div>
                      <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                        <span className="block text-slate-400">{tr("Notities", "Notes")}</span>
                        <strong className="text-sm text-slate-100">{report.annotations.notes || "-"}</strong>
                      </div>
                      {samplingControlsEnabled ? (
                        <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                          <span className="block text-slate-400">{isNl ? "Meetmoment" : "Sampling timing"}</span>
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
                          <th className="px-3 py-2 text-right">{isNl ? "Waarde" : "Value"}</th>
                          <th className="px-3 py-2 text-left">{tr("Eenheid", "Unit")}</th>
                          <th className="px-3 py-2 text-right">{isNl ? "Bereik" : "Range"}</th>
                          <th className="px-3 py-2 text-right">{tr("Status", "Status")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {report.markers.map((marker) => {
                          const converted = convertBySystem(
                            marker.canonicalMarker,
                            marker.value,
                            marker.unit,
                            appData.settings.unitSystem
                          );
                          const min =
                            marker.referenceMin === null
                              ? null
                              : convertBySystem(
                                  marker.canonicalMarker,
                                  marker.referenceMin,
                                  marker.unit,
                                  appData.settings.unitSystem
                                ).value;
                          const max =
                            marker.referenceMax === null
                              ? null
                              : convertBySystem(
                                  marker.canonicalMarker,
                                  marker.referenceMax,
                                  marker.unit,
                                  appData.settings.unitSystem
                                ).value;

                          return (
                            <tr key={marker.id} className="bg-slate-900/35 text-slate-200">
                              <td className="px-3 py-2">
                                <span className="inline-flex items-center gap-1">
                                  {getMarkerDisplayName(marker.canonicalMarker, appData.settings.language)}
                                  <MarkerInfoBadge marker={marker.canonicalMarker} language={appData.settings.language} />
                                  {!marker.isCalculated ? (
                                    <button
                                      type="button"
                                      className="rounded p-0.5 text-slate-400 transition hover:text-cyan-200"
                                      onClick={() => openRenameDialog(marker.canonicalMarker)}
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
                                {min === null || max === null
                                  ? "-"
                                  : `${Number(min.toFixed(2))} - ${Number(max.toFixed(2))}`}
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
                                  {abnormalStatusLabel(marker.abnormal, appData.settings.language)}
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
          ) : null}

          {activeTab === "analysis" ? (
            <section className="space-y-3 fade-in">
              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h3 className="text-base font-semibold text-slate-100">{tr("AI Lab Analyse", "AI Lab Analysis")}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {tr(
                    "Laat AI al je labwaardes over tijd analyseren, inclusief protocol, supplementen, symptomen en notities.",
                    "Let AI analyze all your lab values over time, including protocol, supplements, symptoms, and notes."
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {tr(
                    "Deze analyse gebruikt alle opgeslagen rapporten en stuurt data naar Anthropic via je Claude API key.",
                    "This analysis uses all saved reports and sends data to Anthropic through your Claude API key."
                  )}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-cyan-500/50 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200 disabled:opacity-50"
                    onClick={() => runAiAnalysis("full")}
                    disabled={isAnalyzingLabs || visibleReports.length === 0 || !appData.settings.claudeApiKey.trim()}
                  >
                    {isAnalyzingLabs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {isAnalyzingLabs ? tr("Analyseren...", "Analyzing...") : tr("Volledige AI-analyse", "Full AI analysis")}
                  </button>
                  <button
                    type="button"
                    className="analysis-latest-btn inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-200 disabled:opacity-50"
                    onClick={() => runAiAnalysis("latestComparison")}
                    disabled={isAnalyzingLabs || visibleReports.length < 2 || !appData.settings.claudeApiKey.trim()}
                  >
                    <Sparkles className="h-4 w-4" />
                    {tr("Laatste vs vorige", "Latest vs previous")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-50"
                    onClick={copyAnalysis}
                    disabled={!analysisResult}
                  >
                    <FileText className="h-4 w-4" /> {analysisCopied ? tr("Gekopieerd", "Copied") : tr("Kopieer analyse", "Copy analysis")}
                  </button>
                  {!appData.settings.claudeApiKey.trim() ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-200"
                      onClick={() => setActiveTab("settings")}
                    >
                      <Cog className="h-4 w-4" /> {tr("Voeg Claude API key toe", "Add Claude API key")}
                    </button>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                  <span>{tr("Rapporten in scope", "Reports in scope")}: {visibleReports.length}</span>
                  {samplingControlsEnabled ? <span>{tr("Meetmoment-filter", "Sampling filter")}: {appData.settings.samplingFilter}</span> : null}
                  <span>{tr("Markers gevolgd", "Markers tracked")}: {allMarkers.length}</span>
                  <span>{tr("Eenheden", "Unit system")}: {appData.settings.unitSystem.toUpperCase()}</span>
                  <span>{tr("Formaat: alleen tekst (geen tabellen)", "Format: text-only (no tables)")}</span>
                  {analysisGeneratedAt ? (
                    <span>{tr("Laatste run", "Last run")}: {format(parseISO(analysisGeneratedAt), "dd MMM yyyy HH:mm")}</span>
                  ) : null}
                </div>
              </div>

              {analysisError ? (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
                  {analysisError}
                </div>
              ) : null}

              {isAnalyzingLabs ? (
                <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-5">
                  <div className="inline-flex items-center gap-2 text-sm text-slate-300">
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                    {tr("AI is je trendanalyse aan het opstellen...", "AI is preparing your trend analysis...")}
                  </div>
                </div>
              ) : null}

              {analysisResult ? (
                <article className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                  <h4 className="text-sm font-semibold text-slate-100">
                    {analysisKind === "latestComparison"
                      ? tr("Analyse-output (laatste vs vorige)", "Analysis output (latest vs previous)")
                      : tr("Analyse-output (volledig)", "Analysis output (full)")}
                  </h4>
                  <div className="mt-3 overflow-x-auto">
                    <ReactMarkdown
                      skipHtml
                      remarkPlugins={[remarkBreaks]}
                      allowedElements={[
                        "h1",
                        "h2",
                        "h3",
                        "h4",
                        "p",
                        "strong",
                        "em",
                        "ul",
                        "ol",
                        "li",
                        "blockquote",
                        "code",
                        "pre",
                        "br",
                        "hr"
                      ]}
                      components={{
                        h1: ({ children }) => <h1 className="mt-4 text-xl font-semibold text-slate-100">{children}</h1>,
                        h2: ({ children }) => <h2 className="mt-4 text-lg font-semibold text-cyan-200">{children}</h2>,
                        h3: ({ children }) => <h3 className="mt-3 text-base font-semibold text-slate-100">{children}</h3>,
                        h4: ({ children }) => <h4 className="mt-3 text-sm font-semibold text-slate-100">{children}</h4>,
                        p: ({ children }) => <p className="mt-2 text-sm leading-6 text-slate-200">{children}</p>,
                        ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">{children}</ul>,
                        ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-200">{children}</ol>,
                        li: ({ children }) => <li className="leading-6">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold text-slate-100">{children}</strong>,
                        em: ({ children }) => <em className="italic text-slate-200">{children}</em>,
                        blockquote: ({ children }) => (
                          <blockquote className="mt-3 border-l-2 border-slate-600 pl-3 text-sm text-slate-300">{children}</blockquote>
                        ),
                        code: ({ children }) => (
                          <code className="rounded bg-slate-800/80 px-1 py-0.5 text-[13px] text-slate-100">{children}</code>
                        ),
                        pre: ({ children }) => (
                          <pre className="mt-2 overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200">
                            {children}
                          </pre>
                        ),
                        hr: () => <hr className="my-4 border-slate-700" />
                      }}
                    >
                      {analysisResultDisplay}
                    </ReactMarkdown>
                  </div>
                </article>
              ) : null}
            </section>
          ) : null}

          {activeTab === "settings" ? (
            <section className="space-y-3 fade-in">
              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h3 className="text-base font-semibold text-slate-100">{tr("Voorkeuren", "Preferences")}</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm">
                    <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("Thema", "Theme")}</span>
                    <select
                      className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
                      value={appData.settings.theme}
                      onChange={(event) => updateSettings({ theme: event.target.value as AppSettings["theme"] })}
                    >
                      <option value="dark">{tr("Donker", "Dark")}</option>
                      <option value="light">{tr("Licht", "Light")}</option>
                    </select>
                  </label>

                  <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm">
                    <span className="block text-xs uppercase tracking-wide text-slate-400">{t(appData.settings.language, "language")}</span>
                    <select
                      className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
                      value={appData.settings.language}
                      onChange={(event) => updateSettings({ language: event.target.value as AppSettings["language"] })}
                    >
                      <option value="nl">Nederlands</option>
                      <option value="en">English</option>
                    </select>
                  </label>

                  <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm">
                    <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("Eenhedensysteem", "Unit system")}</span>
                    <select
                      className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
                      value={appData.settings.unitSystem}
                      onChange={(event) =>
                        updateSettings({
                          unitSystem: event.target.value as AppSettings["unitSystem"]
                        })
                      }
                    >
                      <option value="eu">{tr("Europees", "European")}</option>
                      <option value="us">US</option>
                    </select>
                  </label>

                  <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm">
                    <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("Grafiek Y-as", "Chart Y-axis")}</span>
                    <select
                      className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
                      value={appData.settings.yAxisMode}
                      onChange={(event) =>
                        updateSettings({
                          yAxisMode: event.target.value as AppSettings["yAxisMode"]
                        })
                      }
                    >
                      <option value="zero">{tr("Start op nul", "Start at zero")}</option>
                      <option value="data">{tr("Gebruik databereik", "Use data range")}</option>
                    </select>
                  </label>

                  <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm">
                    <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("Tooltip-detail", "Tooltip detail")}</span>
                    <select
                      className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
                      value={appData.settings.tooltipDetailMode}
                      onChange={(event) =>
                        updateSettings({
                          tooltipDetailMode: event.target.value as AppSettings["tooltipDetailMode"]
                        })
                      }
                    >
                      <option value="compact">{tr("Compact (snel overzicht)", "Compact (quick overview)")}</option>
                      <option value="full">{tr("Uitgebreid (alle context)", "Extended (full context)")}</option>
                    </select>
                  </label>

                  <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm md:col-span-2">
                    <span className="block text-xs uppercase tracking-wide text-slate-400">
                      {tr("Geavanceerde meetmoment-filters", "Advanced sampling filters")}
                    </span>
                    <div className="mt-2 flex items-center gap-2 text-slate-200">
                      <input
                        type="checkbox"
                        checked={samplingControlsEnabled}
                        onChange={(event) => updateSettings({ enableSamplingControls: event.target.checked })}
                      />
                      <span>{tr("Toon sampling filter + baseline vergelijking op dashboard", "Show sampling filter + baseline comparison on dashboard")}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      {tr(
                        "Standaard uit. Als uitgeschakeld worden trough/peak- en baseline-opties verborgen.",
                        "Off by default. When disabled, trough/peak and baseline options are hidden."
                      )}
                    </p>
                  </label>

                  <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm md:col-span-2">
                    <span className="block text-xs uppercase tracking-wide text-slate-400">
                      {tr("Afgeleide marker", "Derived marker")}
                    </span>
                    <div className="mt-2 flex items-center gap-2 text-slate-200">
                      <input
                        type="checkbox"
                        checked={appData.settings.enableCalculatedFreeTestosterone}
                        onChange={(event) => updateSettings({ enableCalculatedFreeTestosterone: event.target.checked })}
                      />
                      <span>{tr("Bereken Vrij Testosteron (afgeleid)", "Enable calculated Free Testosterone (derived)")}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      {tr(
                        "Berekend uit totaal testosteron + SHBG (+ albumine). Vervangt gemeten vrij testosteron nooit en vult alleen ontbrekende punten aan.",
                        "Computed from Total T + SHBG (+ Albumin). Never replaces measured Free T; it only fills missing points."
                      )}
                    </p>
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h3 className="text-base font-semibold text-slate-100">{tr("Marker Manager", "Marker Manager")}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {tr(
                    "Beheer markernaam-normalisatie zonder je dashboard te verstoren. Je kunt markers handmatig samenvoegen of hernoemen.",
                    "Manage marker-name normalization without cluttering the dashboard. You can manually merge or rename markers."
                  )}
                </p>
                <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
                  <select
                    className="rounded-md border border-slate-600 bg-slate-800 px-2 py-2 text-sm"
                    value={mergeFromMarker}
                    onChange={(event) => setMergeFromMarker(event.target.value)}
                  >
                    {editableMarkers.length === 0 ? (
                      <option value="">{tr("Geen markers beschikbaar", "No markers available")}</option>
                    ) : (
                      editableMarkers.map((marker) => (
                        <option key={`from-${marker}`} value={marker}>
                          {getMarkerDisplayName(marker, appData.settings.language)}
                        </option>
                      ))
                    )}
                  </select>
                  <div className="self-center text-center text-xs text-slate-400">{tr("naar", "into")}</div>
                  <select
                    className="rounded-md border border-slate-600 bg-slate-800 px-2 py-2 text-sm"
                    value={mergeIntoMarker}
                    onChange={(event) => setMergeIntoMarker(event.target.value)}
                  >
                    <option value="">{tr("Selecteer target", "Select target")}</option>
                    {editableMarkers
                      .filter((marker) => marker !== mergeFromMarker)
                      .map((marker) => (
                        <option key={`to-${marker}`} value={marker}>
                          {getMarkerDisplayName(marker, appData.settings.language)}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 disabled:opacity-50"
                    disabled={!mergeFromMarker || !mergeIntoMarker || mergeFromMarker === mergeIntoMarker}
                    onClick={() => remapMarkerAcrossReports(mergeFromMarker, mergeIntoMarker)}
                  >
                    {tr("Voer merge uit", "Merge markers")}
                  </button>
                </div>

                <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-slate-700 bg-slate-900/40">
                  <table className="min-w-full divide-y divide-slate-700 text-sm">
                    <thead className="bg-slate-900/70 text-slate-300">
                      <tr>
                        <th className="px-3 py-2 text-left">{tr("Marker", "Marker")}</th>
                        <th className="px-3 py-2 text-right">{tr("Waarden", "Values")}</th>
                        <th className="px-3 py-2 text-right">{tr("Rapporten", "Reports")}</th>
                        <th className="px-3 py-2 text-right">{tr("Actie", "Action")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {markerUsage.map((item) => (
                        <tr key={item.marker} className="bg-slate-900/30 text-slate-200">
                          <td className="px-3 py-2">{getMarkerDisplayName(item.marker, appData.settings.language)}</td>
                          <td className="px-3 py-2 text-right">{item.valueCount}</td>
                          <td className="px-3 py-2 text-right">{item.reportCount}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              className="rounded p-1 text-slate-400 transition hover:text-cyan-200"
                              onClick={() => openRenameDialog(item.marker)}
                              aria-label={tr("Marker hernoemen", "Rename marker")}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h3 className="text-base font-semibold text-slate-100">Claude API</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {tr(
                    "API key wordt in je browseropslag bewaard voor deze demo. Gebruik hier geen productiegeheimen.",
                    "API key is stored in your browser storage for this demo. Do not use production secrets here."
                  )}
                </p>
                <input
                  type="password"
                  className="mt-3 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                  placeholder="sk-ant-api03-..."
                  value={appData.settings.claudeApiKey}
                  onChange={(event) => updateSettings({ claudeApiKey: event.target.value })}
                />
              </div>

              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h3 className="text-base font-semibold text-slate-100">{tr("Backup & Herstel", "Backup & Restore")}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {tr(
                    "Maak een JSON-backup van al je data. Je kunt die later importeren als merge of volledige restore.",
                    "Create a JSON backup of all your data. You can later import it as a merge or full restore."
                  )}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200"
                    onClick={exportJson}
                  >
                    <Download className="h-4 w-4" /> {tr("Backup maken (JSON)", "Create backup (JSON)")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-200"
                    onClick={() => {
                      setImportMode("merge");
                      importFileInputRef.current?.click();
                    }}
                  >
                    <FileText className="h-4 w-4" /> {tr("Importeer backup (samenvoegen)", "Import backup (merge)")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-200"
                    onClick={() => {
                      setImportMode("replace");
                      importFileInputRef.current?.click();
                    }}
                  >
                    <FileText className="h-4 w-4" /> {tr("Herstel backup (vervangen)", "Restore backup (replace)")}
                  </button>
                </div>

                <input
                  ref={importFileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={onImportBackupFile}
                />

                {importStatus ? (
                  <div
                    className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                      importStatus.type === "success"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                        : "border-rose-500/30 bg-rose-500/10 text-rose-200"
                    }`}
                  >
                    {importStatus.message}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h3 className="text-base font-semibold text-slate-100">{tr("Deelmodus", "Share mode")}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {tr(
                    "Genereer een read-only snapshotlink zonder API keys. De gedeelde weergave staat geen bewerken toe.",
                    "Generate a read-only snapshot link without API keys. Shared view does not allow editing."
                  )}
                </p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-200">
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5">
                    <input
                      type="checkbox"
                      checked={shareOptions.hideNotes}
                      onChange={(event) => setShareOptions((current) => ({ ...current, hideNotes: event.target.checked }))}
                    />
                    {tr("Verberg notities", "Hide notes")}
                  </label>
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5">
                    <input
                      type="checkbox"
                      checked={shareOptions.hideProtocol}
                      onChange={(event) => setShareOptions((current) => ({ ...current, hideProtocol: event.target.checked }))}
                    />
                    {tr("Verberg protocol", "Hide protocol")}
                  </label>
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5">
                    <input
                      type="checkbox"
                      checked={shareOptions.hideSymptoms}
                      onChange={(event) => setShareOptions((current) => ({ ...current, hideSymptoms: event.target.checked }))}
                    />
                    {tr("Verberg symptomen", "Hide symptoms")}
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-cyan-500/50 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200"
                    onClick={generateShareLink}
                  >
                    <Link2 className="h-4 w-4" /> {tr("Genereer deellink", "Generate share link")}
                  </button>
                  {shareLink ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(shareLink);
                        } catch {
                          // no-op
                        }
                      }}
                    >
                      <Copy className="h-4 w-4" /> {tr("Kopieer link", "Copy link")}
                    </button>
                  ) : null}
                </div>
                {shareLink ? (
                  <p className="mt-2 break-all rounded-md border border-slate-700 bg-slate-800/70 px-3 py-2 text-xs text-slate-300">
                    {shareLink}
                  </p>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h3 className="text-base font-semibold text-slate-100">{tr("Export", "Export")}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {tr(
                    "Exporteer alle opgeslagen data als JSON, geselecteerde markers als CSV, of grafieken als PDF.",
                    "Export all stored data as JSON, selected markers as CSV, or charts as PDF."
                  )}
                </p>

                <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">{tr("CSV markerselectie", "CSV marker selection")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {allMarkers.map((marker) => {
                      const selected = csvMarkerSelection.includes(marker);
                      return (
                        <button
                          key={marker}
                          type="button"
                          className={`rounded-full border px-3 py-1 text-xs ${
                            selected
                              ? "border-cyan-500/60 bg-cyan-500/20 text-cyan-200"
                              : "border-slate-600 text-slate-300"
                          }`}
                          onClick={() => {
                            setCsvMarkerSelection((current) => {
                              if (current.includes(marker)) {
                                return current.filter((item) => item !== marker);
                              }
                              return [...current, marker];
                            });
                          }}
                        >
                          {getMarkerDisplayName(marker, appData.settings.language)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                    onClick={exportJson}
                  >
                    <FileText className="h-4 w-4" /> {tr("Exporteer JSON", "Export JSON")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                    onClick={exportCsv}
                  >
                    <Download className="h-4 w-4" /> {tr("Exporteer CSV", "Export CSV")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                    onClick={exportPdf}
                  >
                    <FileText className="h-4 w-4" /> {tr("Exporteer PDF-rapport", "Export PDF report")}
                  </button>
                </div>
              </div>

              <div className="medical-disclaimer rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                <p className="font-semibold">{tr("Medische disclaimer", "Medical disclaimer")}</p>
                <p className="mt-1">
                  {tr(
                    "Deze tool is alleen voor persoonlijke tracking en geeft geen medisch advies.",
                    "This tool is for personal tracking only and does not provide medical advice."
                  )}
                </p>
              </div>
            </section>
          ) : null}
        </main>
      </div>

      <AnimatePresence>
        {expandedMarker ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setExpandedMarker(null)}
          >
            <motion.div
              className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 shadow-soft"
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 6 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-700/70 px-4 py-3 sm:px-5">
                <div>
                  <h3 className="text-base font-semibold text-slate-100">
                    {getMarkerDisplayName(expandedMarker, appData.settings.language)}
                  </h3>
                  <p className="text-xs text-slate-400">{tr("Gedetailleerde markergrafiek", "Detailed marker chart")}</p>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-2.5 py-1.5 text-xs text-slate-200 hover:border-cyan-500/50 hover:text-cyan-200"
                  onClick={() => setExpandedMarker(null)}
                >
                  <X className="h-4 w-4" /> {tr("Sluiten", "Close")}
                </button>
              </div>

              <div className="p-3 sm:p-5">
                <MarkerTrendChart
                  marker={expandedMarker}
                  points={expandedMarkerPoints}
                  colorIndex={expandedMarkerColorIndex}
                  settings={appData.settings}
                  language={appData.settings.language}
                  phaseBlocks={dosePhaseBlocks}
                  height={460}
                  showYearHints
                />
              </div>
            </motion.div>
          </motion.div>
        ) : null}

        {!isShareMode && markerSuggestions.length > 0 ? (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-3 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMarkerSuggestions([])}
          >
            <motion.div
              className="w-full max-w-2xl rounded-2xl border border-slate-700/80 bg-slate-900 shadow-soft"
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 4 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-slate-700/70 px-4 py-3">
                <h3 className="text-base font-semibold text-slate-100">
                  {tr("Marker review nodig", "Marker review needed")}
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  {tr(
                    "Deze markers lijken mogelijk dubbel. Je kunt nu meteen mergen of later via Settings > Marker Manager.",
                    "These markers may be duplicates. Merge now or do it later in Settings > Marker Manager."
                  )}
                </p>
              </div>
              <div className="max-h-[58vh] space-y-2 overflow-auto px-4 py-3">
                {markerSuggestions.map((item) => (
                  <div key={`${item.sourceCanonical}-${item.targetCanonical}`} className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                    <p className="text-sm text-slate-200">
                      <strong className="text-slate-100">{getMarkerDisplayName(item.sourceCanonical, appData.settings.language)}</strong>{" "}
                      {tr("lijkt op", "looks like")}{" "}
                      <strong className="text-slate-100">{getMarkerDisplayName(item.targetCanonical, appData.settings.language)}</strong>.
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {tr("Matchscore", "Match score")}: {(item.score * 100).toFixed(0)}%
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-xs text-cyan-200"
                        onClick={() => remapMarkerAcrossReports(item.sourceCanonical, item.targetCanonical)}
                      >
                        {tr("Merge nu", "Merge now")}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-600 px-2.5 py-1.5 text-xs text-slate-300"
                        onClick={() =>
                          setMarkerSuggestions((current) =>
                            current.filter(
                              (entry) =>
                                !(entry.sourceCanonical === item.sourceCanonical && entry.targetCanonical === item.targetCanonical)
                            )
                          )
                        }
                      >
                        {tr("Later", "Later")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-700/70 px-4 py-3 text-right">
                <button
                  type="button"
                  className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                  onClick={() => setMarkerSuggestions([])}
                >
                  {tr("Sluiten", "Close")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}

        {renameDialog ? (
          <motion.div
            className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/75 p-3 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setRenameDialog(null)}
          >
            <motion.div
              className="w-full max-w-lg rounded-2xl border border-slate-700/80 bg-slate-900 shadow-soft"
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 4 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-slate-700/70 px-4 py-3">
                <h3 className="text-base font-semibold text-slate-100">{tr("Marker hernoemen", "Rename marker")}</h3>
                <p className="mt-1 text-xs text-slate-400">
                  {tr("Wijzigt alle rapporten met deze marker.", "This updates all reports containing this marker.")}
                </p>
              </div>
              <div className="px-4 py-3">
                <label className="block text-xs uppercase tracking-wide text-slate-400">{tr("Nieuwe markernaam", "New marker name")}</label>
                <input
                  className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  value={renameDialog.draftName}
                  onChange={(event) =>
                    setRenameDialog((current) => (current ? { ...current, draftName: event.target.value } : current))
                  }
                  placeholder={tr("Bijv. Hematocrit", "e.g. Hematocrit")}
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-700/70 px-4 py-3">
                <button
                  type="button"
                  className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                  onClick={() => setRenameDialog(null)}
                >
                  {tr("Annuleren", "Cancel")}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200"
                  onClick={() => {
                    if (!renameDialog.draftName.trim()) {
                      return;
                    }
                    remapMarkerAcrossReports(renameDialog.sourceCanonical, renameDialog.draftName);
                    setRenameDialog(null);
                  }}
                >
                  {tr("Opslaan", "Save")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default App;
