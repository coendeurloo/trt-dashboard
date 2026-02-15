import { motion } from "framer-motion";
import { AlertTriangle, Plus, Save, Trash2, X } from "lucide-react";
import { MarkerValue, ExtractionDraft, ReportAnnotations, AppLanguage } from "../types";
import { canonicalizeMarker, normalizeMarkerMeasurement } from "../unitConversion";
import { createId, deriveAbnormalFlag, safeNumber } from "../utils";
import EditableCell from "./EditableCell";

export interface ExtractionReviewTableProps {
  draft: ExtractionDraft;
  annotations: ReportAnnotations;
  language: AppLanguage;
  showSamplingTiming: boolean;
  onDraftChange: (draft: ExtractionDraft) => void;
  onAnnotationsChange: (annotations: ReportAnnotations) => void;
  onSave: () => void;
  onCancel: () => void;
}

const ExtractionReviewTable = ({
  draft,
  annotations,
  language,
  showSamplingTiming,
  onDraftChange,
  onAnnotationsChange,
  onSave,
  onCancel
}: ExtractionReviewTableProps) => {
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

export default ExtractionReviewTable;
