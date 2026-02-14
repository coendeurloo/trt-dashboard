import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useDropzone } from "react-dropzone";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  AlertTriangle,
  BarChart3,
  CheckSquare,
  ClipboardList,
  Cog,
  Download,
  FileText,
  Loader2,
  Moon,
  Pencil,
  Plus,
  Save,
  SlidersHorizontal,
  Square,
  Sun,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import { buildCsv } from "./csvExport";
import { PRIMARY_MARKERS, TAB_ITEMS } from "./constants";
import { exportElementToPdf } from "./pdfExport";
import { extractLabData } from "./pdfParsing";
import { loadAppData, saveAppData } from "./storage";
import { canonicalizeMarker, convertBySystem } from "./unitConversion";
import {
  AppSettings,
  ExtractionDraft,
  LabReport,
  MarkerValue,
  ReportAnnotations,
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

interface ChartPoint {
  x: string;
  value: number;
  unit: string;
  referenceMin: number | null;
  referenceMax: number | null;
  abnormal: MarkerValue["abnormal"];
}

interface EditableCellProps {
  value: string | number | null;
  onCommit: (nextValue: string) => void;
  align?: "left" | "right";
  placeholder?: string;
}

const markerColor = (index: number): string => {
  const palette = ["#22d3ee", "#34d399", "#60a5fa", "#f59e0b", "#f472b6", "#facc15", "#a78bfa"];
  return palette[index % palette.length];
};

const isAnnotated = (report: LabReport): boolean => {
  return Boolean(
    report.annotations.dosageMgPerWeek !== null ||
      report.annotations.protocol.trim() ||
      report.annotations.supplements.trim() ||
      report.annotations.symptoms.trim() ||
      report.annotations.notes.trim()
  );
};

const blankAnnotations = (): ReportAnnotations => ({
  dosageMgPerWeek: null,
  protocol: "",
  supplements: "",
  symptoms: "",
  notes: ""
});

const EditableCell = ({ value, onCommit, align = "left", placeholder = "" }: EditableCellProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value === null ? "" : String(value));

  useEffect(() => {
    setDraft(value === null ? "" : String(value));
  }, [value]);

  if (isEditing) {
    return (
      <input
        autoFocus
        className={`w-full rounded-md border border-cyan-500/40 bg-slate-900/80 px-2 py-1 text-sm text-slate-100 focus:outline-none ${
          align === "right" ? "text-right" : "text-left"
        }`}
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
        aria-label="Edit value"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

interface UploadPanelProps {
  isProcessing: boolean;
  onFileSelected: (file: File) => void;
}

const UploadPanel = ({ isProcessing, onFileSelected }: UploadPanelProps) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "application/pdf": [".pdf"]
    },
    disabled: isProcessing,
    maxFiles: 1,
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
      className={`rounded-2xl border border-dashed p-5 transition ${
        isDragActive
          ? "border-cyan-400 bg-cyan-500/10"
          : "border-slate-600/50 bg-slate-900/30 hover:border-cyan-500/50"
      }`}
    >
      <div
        {...getRootProps()}
        className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl px-4 py-9 text-center"
      >
        <input {...getInputProps()} />
        {isProcessing ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-cyan-300" />
            <p className="text-sm text-slate-200">Processing PDF and extracting lab values...</p>
          </>
        ) : (
          <>
            <UploadCloud className="h-9 w-9 text-cyan-300" />
            <div>
              <p className="text-base font-semibold text-slate-100">Drag and drop your lab PDF here</p>
              <p className="mt-1 text-sm text-slate-300">or click to browse files</p>
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
  onDraftChange: (next: ExtractionDraft) => void;
  onAnnotationsChange: (next: ReportAnnotations) => void;
  onSave: () => void;
  onCancel: () => void;
}

const ExtractionReview = ({
  draft,
  annotations,
  onDraftChange,
  onAnnotationsChange,
  onSave,
  onCancel
}: ExtractionReviewProps) => {
  const updateRow = (rowId: string, updater: (row: MarkerValue) => MarkerValue) => {
    onDraftChange({
      ...draft,
      markers: draft.markers.map((row) => {
        if (row.id !== rowId) {
          return row;
        }
        const next = updater(row);
        return {
          ...next,
          abnormal: deriveAbnormalFlag(next.value, next.referenceMin, next.referenceMax)
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
          <h2 className="text-lg font-semibold text-slate-100">Review extracted data</h2>
          <p className="text-sm text-slate-300">
            {draft.sourceFileName} | {draft.extraction.provider.toUpperCase()} confidence {" "}
            <span className="font-medium text-cyan-300">{Math.round(draft.extraction.confidence * 100)}%</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {draft.extraction.needsReview && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" /> Needs review
            </span>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-400"
            onClick={onCancel}
          >
            <X className="h-4 w-4" /> Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-cyan-400"
            onClick={onSave}
          >
            <Save className="h-4 w-4" /> Save report
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Test date</label>
          <input
            className="w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            type="date"
            value={draft.testDate}
            onChange={(event) => onDraftChange({ ...draft, testDate: event.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Dose (mg/week)</label>
          <input
            className="w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            type="number"
            value={annotations.dosageMgPerWeek ?? ""}
            onChange={(event) =>
              onAnnotationsChange({
                ...annotations,
                dosageMgPerWeek: safeNumber(event.target.value)
              })
            }
            placeholder="e.g. 120"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Protocol</label>
          <input
            className="w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            value={annotations.protocol}
            onChange={(event) => onAnnotationsChange({ ...annotations, protocol: event.target.value })}
            placeholder="2x per week SubQ"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Supplements</label>
          <input
            className="w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            value={annotations.supplements}
            onChange={(event) => onAnnotationsChange({ ...annotations, supplements: event.target.value })}
            placeholder="Vitamin D, Omega-3"
          />
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Symptoms</label>
          <textarea
            className="h-24 w-full resize-none rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            value={annotations.symptoms}
            onChange={(event) => onAnnotationsChange({ ...annotations, symptoms: event.target.value })}
            placeholder="Energy, libido, mood, sleep"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Notes</label>
          <textarea
            className="h-24 w-full resize-none rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            value={annotations.notes}
            onChange={(event) => onAnnotationsChange({ ...annotations, notes: event.target.value })}
            placeholder="Additional observations"
          />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-700">
        <table className="min-w-full divide-y divide-slate-700 text-sm">
          <thead className="bg-slate-900/80 text-left text-slate-300">
            <tr>
              <th className="px-3 py-2">Marker</th>
              <th className="px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2 text-right">Ref min</th>
              <th className="px-3 py-2 text-right">Ref max</th>
              <th className="px-3 py-2 text-right">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {draft.markers.map((row) => (
              <tr key={row.id} className="bg-slate-900/35">
                <td className="px-3 py-2">
                  <EditableCell
                    value={row.marker}
                    onCommit={(next) =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        marker: next,
                        canonicalMarker: canonicalizeMarker(next)
                      }))
                    }
                    placeholder="Marker name"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <EditableCell
                    align="right"
                    value={row.value}
                    onCommit={(next) =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        value: safeNumber(next) ?? current.value
                      }))
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    value={row.unit}
                    onCommit={(next) => updateRow(row.id, (current) => ({ ...current, unit: next }))}
                    placeholder="Unit"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <EditableCell
                    align="right"
                    value={row.referenceMin}
                    onCommit={(next) =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        referenceMin: next.trim() ? safeNumber(next) : null
                      }))
                    }
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <EditableCell
                    align="right"
                    value={row.referenceMax}
                    onCommit={(next) =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        referenceMax: next.trim() ? safeNumber(next) : null
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
                    {row.abnormal}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className="rounded-md p-1 text-slate-400 hover:bg-slate-700 hover:text-rose-300"
                    onClick={() => removeRow(row.id)}
                    aria-label="Remove row"
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
        <Plus className="h-4 w-4" /> Add marker row
      </button>
    </motion.div>
  );
};

interface MarkerChartCardProps {
  marker: string;
  points: ChartPoint[];
  settings: AppSettings;
  annotationReports: LabReport[];
  colorIndex: number;
}

const MarkerChartCard = ({ marker, points, settings, annotationReports, colorIndex }: MarkerChartCardProps) => {
  const mins = points.map((point) => point.referenceMin).filter((value): value is number => value !== null);
  const maxs = points.map((point) => point.referenceMax).filter((value): value is number => value !== null);
  const rangeMin = mins.length > 0 ? Math.min(...mins) : undefined;
  const rangeMax = maxs.length > 0 ? Math.max(...maxs) : undefined;

  return (
    <motion.div
      layout
      className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 shadow-soft"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-100">{marker}</h3>
        <span className="text-xs text-slate-400">{points[0]?.unit ?? ""}</span>
      </div>

      {points.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-slate-700 text-sm text-slate-400">
          No data in selected range
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={points} margin={{ left: 2, right: 8, top: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="x"
              tickFormatter={(value: string) => {
                try {
                  return format(parseISO(value), "dd MMM");
                } catch {
                  return value;
                }
              }}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              stroke="#334155"
              minTickGap={18}
            />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} stroke="#334155" width={45} />
            <Tooltip
              contentStyle={{
                background: "#0b1220",
                border: "1px solid #334155",
                borderRadius: "12px"
              }}
              labelFormatter={(value) => formatDate(String(value))}
              formatter={(value: number) => [Number(value).toFixed(2), marker]}
            />

            {settings.showReferenceRanges && rangeMin !== undefined && rangeMax !== undefined && rangeMin < rangeMax ? (
              <ReferenceArea y1={rangeMin} y2={rangeMax} fill="#22c55e" fillOpacity={0.12} strokeOpacity={0} />
            ) : null}

            {settings.showAnnotations
              ? annotationReports.map((report) => {
                  const label = report.annotations.dosageMgPerWeek
                    ? `${report.annotations.dosageMgPerWeek} mg/w`
                    : report.annotations.protocol.trim()
                      ? report.annotations.protocol.trim().slice(0, 18)
                      : "Note";

                  return (
                    <ReferenceLine
                      key={`${report.id}-${marker}`}
                      x={report.testDate}
                      stroke="#facc15"
                      strokeDasharray="3 3"
                      strokeOpacity={0.5}
                      label={{ value: label, position: "insideTopLeft", fill: "#fcd34d", fontSize: 10 }}
                    />
                  );
                })
              : null}

            <Line
              type="monotone"
              dataKey="value"
              stroke={markerColor(colorIndex)}
              strokeWidth={2.6}
              dot={(props) => {
                const payload = props.payload as ChartPoint;
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
      )}
    </motion.div>
  );
};

interface ComparisonChartProps {
  leftMarker: string;
  rightMarker: string;
  reports: LabReport[];
  settings: AppSettings;
}

const ComparisonChart = ({ leftMarker, rightMarker, reports, settings }: ComparisonChartProps) => {
  const data = useMemo(() => {
    const map = new Map<string, { x: string; left: number | null; right: number | null }>();

    reports.forEach((report) => {
      const leftEntry = report.markers.find((marker) => marker.canonicalMarker === leftMarker);
      const rightEntry = report.markers.find((marker) => marker.canonicalMarker === rightMarker);

      if (!leftEntry && !rightEntry) {
        return;
      }

      const leftValue =
        leftEntry === undefined
          ? null
          : convertBySystem(leftEntry.canonicalMarker, leftEntry.value, leftEntry.unit, settings.unitSystem).value;
      const rightValue =
        rightEntry === undefined
          ? null
          : convertBySystem(rightEntry.canonicalMarker, rightEntry.value, rightEntry.unit, settings.unitSystem).value;

      map.set(report.testDate, {
        x: report.testDate,
        left: leftValue,
        right: rightValue
      });
    });

    return Array.from(map.values()).sort((a, b) => parseISO(a.x).getTime() - parseISO(b.x).getTime());
  }, [leftMarker, rightMarker, reports, settings.unitSystem]);

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/50 p-4">
        <h3 className="text-sm font-semibold text-slate-100">Comparison Mode</h3>
        <p className="mt-2 text-sm text-slate-400">No overlapping data in selected range.</p>
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
      <h3 className="mb-2 text-sm font-semibold text-slate-100">Comparison Mode</h3>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ left: 2, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="x"
            tickFormatter={(value: string) => formatDate(value)}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            stroke="#334155"
            minTickGap={18}
          />
          <YAxis yAxisId="left" tick={{ fill: "#94a3b8", fontSize: 11 }} stroke="#334155" width={45} />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            stroke="#334155"
            width={45}
          />
          <Tooltip
            contentStyle={{
              background: "#0b1220",
              border: "1px solid #334155",
              borderRadius: "12px"
            }}
            labelFormatter={(value) => formatDate(String(value))}
          />
          <Legend />
          <Line yAxisId="left" type="monotone" dataKey="left" name={leftMarker} stroke="#22d3ee" strokeWidth={2.4} />
          <Line yAxisId="right" type="monotone" dataKey="right" name={rightMarker} stroke="#f472b6" strokeWidth={2.4} />
        </ComposedChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

const App = () => {
  const [appData, setAppData] = useState(loadAppData());
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [dashboardView, setDashboardView] = useState<"primary" | "all">("primary");

  const [isProcessing, setIsProcessing] = useState(false);
  const [draft, setDraft] = useState<ExtractionDraft | null>(null);
  const [draftAnnotations, setDraftAnnotations] = useState<ReportAnnotations>(blankAnnotations());
  const [uploadError, setUploadError] = useState("");

  const [comparisonMode, setComparisonMode] = useState(false);
  const [leftCompareMarker, setLeftCompareMarker] = useState<string>(PRIMARY_MARKERS[0]);
  const [rightCompareMarker, setRightCompareMarker] = useState<string>(PRIMARY_MARKERS[2]);

  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [csvMarkerSelection, setCsvMarkerSelection] = useState<string[]>([]);

  const reports = useMemo(() => sortReportsChronological(appData.reports), [appData.reports]);

  const visibleReports = useMemo(() => {
    return reports.filter((report) => {
      return withinRange(
        report.testDate,
        appData.settings.timeRange,
        appData.settings.customRangeStart,
        appData.settings.customRangeEnd
      );
    });
  }, [reports, appData.settings.customRangeEnd, appData.settings.customRangeStart, appData.settings.timeRange]);

  const allMarkers = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((report) => {
      report.markers.forEach((marker) => set.add(marker.canonicalMarker));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  const annotationReports = useMemo(() => visibleReports.filter((report) => isAnnotated(report)), [visibleReports]);

  useEffect(() => {
    saveAppData(appData);
  }, [appData]);

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

  const updateSettings = (patch: Partial<AppSettings>) => {
    setAppData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...patch
      }
    }));
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
      setUploadError(error instanceof Error ? error.message : "Could not process this PDF file");
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

        return {
          ...marker,
          marker: marker.marker.trim() || canonicalMarker,
          canonicalMarker,
          value,
          abnormal: deriveAbnormalFlag(value, marker.referenceMin, marker.referenceMax),
          id: createId()
        } as MarkerValue;
      })
      .filter((marker): marker is MarkerValue => marker !== null);

    if (sanitizedMarkers.length === 0) {
      setUploadError("No valid marker rows found. Add at least one marker before saving.");
      return;
    }

    const report: LabReport = {
      id: createId(),
      sourceFileName: draft.sourceFileName,
      testDate: draft.testDate,
      createdAt: new Date().toISOString(),
      markers: sanitizedMarkers,
      annotations: draftAnnotations,
      extraction: draft.extraction
    };

    setAppData((prev) => ({
      ...prev,
      reports: sortReportsChronological([...prev.reports, report])
    }));

    setDraft(null);
    setDraftAnnotations(blankAnnotations());
    setUploadError("");
  };

  const deleteReport = (reportId: string) => {
    setAppData((prev) => ({
      ...prev,
      reports: prev.reports.filter((report) => report.id !== reportId)
    }));
    setSelectedReports((prev) => prev.filter((id) => id !== reportId));
  };

  const deleteSelectedReports = () => {
    if (selectedReports.length === 0) {
      return;
    }
    const selectedSet = new Set(selectedReports);
    setAppData((prev) => ({
      ...prev,
      reports: prev.reports.filter((report) => !selectedSet.has(report.id))
    }));
    setSelectedReports([]);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(appData, null, 2)], { type: "application/json" });
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
    const element = document.getElementById("dashboard-export-root");
    if (!element) {
      return;
    }
    await exportElementToPdf(element, `trt-dashboard-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const getChartPoints = (markerName: string): ChartPoint[] => {
    return visibleReports
      .map((report) => {
        const entry = report.markers.find((marker) => marker.canonicalMarker === markerName);
        if (!entry) {
          return null;
        }

        const converted = convertBySystem(entry.canonicalMarker, entry.value, entry.unit, appData.settings.unitSystem);
        const convertedMin =
          entry.referenceMin === null
            ? null
            : convertBySystem(entry.canonicalMarker, entry.referenceMin, entry.unit, appData.settings.unitSystem).value;
        const convertedMax =
          entry.referenceMax === null
            ? null
            : convertBySystem(entry.canonicalMarker, entry.referenceMax, entry.unit, appData.settings.unitSystem).value;

        return {
          x: report.testDate,
          value: Number(converted.value.toFixed(3)),
          unit: converted.unit,
          referenceMin: convertedMin === null ? null : Number(convertedMin.toFixed(3)),
          referenceMax: convertedMax === null ? null : Number(convertedMax.toFixed(3)),
          abnormal: entry.abnormal
        };
      })
      .filter((point): point is ChartPoint => point !== null);
  };

  const totalOutOfRange = useMemo(() => {
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

  return (
    <div className="min-h-screen px-3 py-4 text-slate-100 sm:px-5 lg:px-6">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 lg:flex-row">
        <aside className="w-full rounded-2xl border border-slate-700/70 bg-slate-900/70 p-3 lg:w-72 lg:self-start lg:sticky lg:top-4">
          <div className="mb-4 rounded-xl bg-gradient-to-br from-cyan-400/20 to-emerald-400/15 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-cyan-200">TRT Lab Tracker</p>
            <h1 className="mt-1 text-xl font-bold text-white">Blood Work Timeline</h1>
            <p className="mt-1 text-xs text-slate-200/90">Track markers, protocol context, and trends.</p>
          </div>

          <nav className="space-y-1.5">
            {TAB_ITEMS.map((item) => {
              const icon =
                item.key === "dashboard" ? (
                  <BarChart3 className="h-4 w-4" />
                ) : item.key === "reports" ? (
                  <ClipboardList className="h-4 w-4" />
                ) : (
                  <Cog className="h-4 w-4" />
                );

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveTab(item.key as TabKey)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                    activeTab === item.key
                      ? "bg-cyan-500/15 text-cyan-200"
                      : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-100"
                  }`}
                >
                  {icon}
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/80 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Quick stats</p>
            <div className="mt-2 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Reports</span>
                <span className="font-semibold text-slate-100">{reports.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Markers tracked</span>
                <span className="font-semibold text-slate-100">{allMarkers.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Out of range</span>
                <span className="font-semibold text-amber-300">{totalOutOfRange}</span>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-4" id="dashboard-export-root">
          <header className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-3 sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">{activeTab === "dashboard" ? "Dashboard" : activeTab === "reports" ? "All Reports" : "Settings"}</h2>
                <p className="text-sm text-slate-400">Professional blood work tracking with editable extraction and visual trends.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    appData.settings.theme === "dark"
                      ? "bg-slate-800 text-slate-100"
                      : "bg-slate-200 text-slate-900"
                  }`}
                  onClick={() => updateSettings({ theme: appData.settings.theme === "dark" ? "light" : "dark" })}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {appData.settings.theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />} Theme
                  </span>
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-cyan-500/50"
                  onClick={exportJson}
                >
                  <Download className="h-4 w-4" /> JSON
                </button>
              </div>
            </div>
          </header>

          <UploadPanel isProcessing={isProcessing} onFileSelected={handleUpload} />

          {uploadError ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{uploadError}</div>
          ) : null}

          <AnimatePresence mode="wait">
            {draft ? (
              <ExtractionReview
                key="draft"
                draft={draft}
                annotations={draftAnnotations}
                onDraftChange={setDraft}
                onAnnotationsChange={setDraftAnnotations}
                onSave={saveDraftAsReport}
                onCancel={() => setDraft(null)}
              />
            ) : null}
          </AnimatePresence>

          {activeTab === "dashboard" ? (
            <section className="space-y-4 fade-in">
              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {([
                    ["3m", "3 months"],
                    ["6m", "6 months"],
                    ["12m", "12 months"],
                    ["all", "All time"],
                    ["custom", "Custom"]
                  ] as Array<[TimeRangeKey, string]>).map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      className={`rounded-md px-2.5 py-1.5 text-xs sm:text-sm ${
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
                    className={`ml-auto rounded-md px-2.5 py-1.5 text-xs sm:text-sm ${
                      comparisonMode ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800 text-slate-300"
                    }`}
                    onClick={() => setComparisonMode((current) => !current)}
                  >
                    <span className="inline-flex items-center gap-1">
                      <SlidersHorizontal className="h-4 w-4" /> Multi-marker mode
                    </span>
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs sm:text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={appData.settings.showReferenceRanges}
                      onChange={(event) => updateSettings({ showReferenceRanges: event.target.checked })}
                    />
                    Reference ranges
                  </label>
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs sm:text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={appData.settings.showAbnormalHighlights}
                      onChange={(event) => updateSettings({ showAbnormalHighlights: event.target.checked })}
                    />
                    Abnormal highlights
                  </label>
                  <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs sm:text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={appData.settings.showAnnotations}
                      onChange={(event) => updateSettings({ showAnnotations: event.target.checked })}
                    />
                    Annotation markers
                  </label>
                  <button
                    type="button"
                    className="rounded-md bg-slate-800 px-2.5 py-1.5 text-xs sm:text-sm text-slate-300"
                    onClick={() => updateSettings({ unitSystem: appData.settings.unitSystem === "eu" ? "us" : "eu" })}
                  >
                    Units: {appData.settings.unitSystem.toUpperCase()}
                  </button>
                </div>
              </div>

              {comparisonMode ? (
                <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
                  <div className="mb-3 flex flex-wrap gap-2">
                    <select
                      className="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm"
                      value={leftCompareMarker}
                      onChange={(event) => setLeftCompareMarker(event.target.value)}
                    >
                      {allMarkers.map((marker) => (
                        <option key={marker} value={marker}>
                          {marker}
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
                          {marker}
                        </option>
                      ))}
                    </select>
                  </div>

                  <ComparisonChart
                    leftMarker={leftCompareMarker}
                    rightMarker={rightCompareMarker}
                    reports={visibleReports}
                    settings={appData.settings}
                  />
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
                <div className="mb-3 flex gap-2">
                  <button
                    type="button"
                    className={`rounded-md px-3 py-1.5 text-sm ${
                      dashboardView === "primary"
                        ? "bg-cyan-500/20 text-cyan-200"
                        : "bg-slate-800 text-slate-300"
                    }`}
                    onClick={() => setDashboardView("primary")}
                  >
                    Primary markers
                  </button>
                  <button
                    type="button"
                    className={`rounded-md px-3 py-1.5 text-sm ${
                      dashboardView === "all" ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-800 text-slate-300"
                    }`}
                    onClick={() => setDashboardView("all")}
                  >
                    All markers
                  </button>
                </div>

                {reports.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-700 py-14 text-center">
                    <p className="text-base font-semibold text-slate-200">No lab reports yet</p>
                    <p className="mt-1 text-sm text-slate-400">Upload your first PDF to start tracking TRT blood work trends.</p>
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {(dashboardView === "primary" ? [...PRIMARY_MARKERS] : allMarkers).map((marker, index) => (
                      <MarkerChartCard
                        key={marker}
                        marker={marker}
                        points={getChartPoints(marker)}
                        settings={appData.settings}
                        annotationReports={annotationReports}
                        colorIndex={index}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {activeTab === "reports" ? (
            <section className="space-y-3 fade-in">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
                <div className="text-sm text-slate-300">
                  <span className="font-semibold text-slate-100">{reports.length}</span> reports total
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-2.5 py-1.5 text-sm text-slate-300"
                    onClick={() => {
                      if (selectedReports.length === reports.length) {
                        setSelectedReports([]);
                        return;
                      }
                      setSelectedReports(reports.map((report) => report.id));
                    }}
                  >
                    {selectedReports.length === reports.length && reports.length > 0 ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    Select all
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-sm text-rose-300 disabled:opacity-50"
                    disabled={selectedReports.length === 0}
                    onClick={deleteSelectedReports}
                  >
                    <Trash2 className="h-4 w-4" /> Delete selected
                  </button>
                </div>
              </div>

              {reports.map((report) => (
                <motion.article
                  key={report.id}
                  layout
                  className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-md p-1 text-slate-300 hover:bg-slate-800"
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
                          <CheckSquare className="h-5 w-5 text-cyan-300" />
                        ) : (
                          <Square className="h-5 w-5" />
                        )}
                      </button>

                      <div>
                        <h3 className="text-base font-semibold text-slate-100">{formatDate(report.testDate)}</h3>
                        <p className="text-xs text-slate-400">{report.sourceFileName}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="inline-flex items-center gap-1 self-start rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-300"
                      onClick={() => deleteReport(report.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                      <span className="block text-slate-400">Dose</span>
                      <strong className="text-sm text-slate-100">
                        {report.annotations.dosageMgPerWeek === null ? "-" : `${report.annotations.dosageMgPerWeek} mg/week`}
                      </strong>
                    </div>
                    <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                      <span className="block text-slate-400">Protocol</span>
                      <strong className="text-sm text-slate-100">{report.annotations.protocol || "-"}</strong>
                    </div>
                    <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                      <span className="block text-slate-400">Supplements</span>
                      <strong className="text-sm text-slate-100">{report.annotations.supplements || "-"}</strong>
                    </div>
                    <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                      <span className="block text-slate-400">Symptoms</span>
                      <strong className="text-sm text-slate-100">{report.annotations.symptoms || "-"}</strong>
                    </div>
                    <div className="rounded-lg bg-slate-800/80 p-2 text-xs text-slate-300">
                      <span className="block text-slate-400">Notes</span>
                      <strong className="text-sm text-slate-100">{report.annotations.notes || "-"}</strong>
                    </div>
                  </div>

                  <div className="mt-3 overflow-x-auto rounded-lg border border-slate-700">
                    <table className="min-w-full divide-y divide-slate-700 text-xs sm:text-sm">
                      <thead className="bg-slate-900/70 text-slate-300">
                        <tr>
                          <th className="px-3 py-2 text-left">Marker</th>
                          <th className="px-3 py-2 text-right">Value</th>
                          <th className="px-3 py-2 text-left">Unit</th>
                          <th className="px-3 py-2 text-right">Range</th>
                          <th className="px-3 py-2 text-right">Status</th>
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
                              <td className="px-3 py-2">{marker.canonicalMarker}</td>
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
                                  {marker.abnormal}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </motion.article>
              ))}
            </section>
          ) : null}

          {activeTab === "settings" ? (
            <section className="space-y-3 fade-in">
              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h3 className="text-base font-semibold text-slate-100">Preferences</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm">
                    <span className="block text-xs uppercase tracking-wide text-slate-400">Theme</span>
                    <select
                      className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
                      value={appData.settings.theme}
                      onChange={(event) => updateSettings({ theme: event.target.value as AppSettings["theme"] })}
                    >
                      <option value="dark">Dark</option>
                      <option value="light">Light</option>
                    </select>
                  </label>

                  <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm">
                    <span className="block text-xs uppercase tracking-wide text-slate-400">Unit system</span>
                    <select
                      className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
                      value={appData.settings.unitSystem}
                      onChange={(event) => updateSettings({ unitSystem: event.target.value as AppSettings["unitSystem"] })}
                    >
                      <option value="eu">European</option>
                      <option value="us">US</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
                <h3 className="text-base font-semibold text-slate-100">Claude API</h3>
                <p className="mt-1 text-sm text-slate-400">
                  API key is stored in your browser storage for this demo. Do not use production secrets here.
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
                <h3 className="text-base font-semibold text-slate-100">Export</h3>
                <p className="mt-1 text-sm text-slate-400">Export all stored data as JSON, selected markers as CSV, or charts as PDF.</p>

                <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400">CSV marker selection</p>
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
                          {marker}
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
                    <FileText className="h-4 w-4" /> Export JSON
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                    onClick={exportCsv}
                  >
                    <Download className="h-4 w-4" /> Export CSV
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                    onClick={exportPdf}
                  >
                    <FileText className="h-4 w-4" /> Export PDF Report
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                <p className="font-semibold">Medical disclaimer</p>
                <p className="mt-1">This tool is for personal tracking only and does not provide medical advice.</p>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
};

export default App;
