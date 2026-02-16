import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Plus, Save, Trash2, X } from "lucide-react";
import { MarkerValue, ExtractionDraft, ReportAnnotations, AppLanguage, SupplementEntry } from "../types";
import { FEEDBACK_EMAIL } from "../constants";
import {
  canonicalizeCompoundList,
  COMPOUND_OPTIONS,
  INJECTION_FREQUENCY_OPTIONS,
  normalizeInjectionFrequency,
  normalizeSupplementEntries,
  supplementEntriesToText,
  SUPPLEMENT_OPTIONS
} from "../protocolStandards";
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
  const compoundDatalistId = "compound-autocomplete-options";
  const supplementDatalistId = "supplement-autocomplete-options";
  const isNl = language === "nl";
  const tr = (nl: string, en: string): string => (isNl ? nl : en);
  const [compoundInput, setCompoundInput] = useState("");
  const [supplementNameInput, setSupplementNameInput] = useState("");
  const [supplementDoseInput, setSupplementDoseInput] = useState("");
  const compounds = Array.isArray(annotations.compounds) ? annotations.compounds : [];
  const supplementEntries = Array.isArray(annotations.supplementEntries) ? annotations.supplementEntries : [];
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
  const parsingFeedbackMailto = (() => {
    const subject = `PDF Parsing Feedback - ${draft.sourceFileName}`;
    const body = [
      "Hi,",
      "",
      "I uploaded a lab PDF and the extraction didn't work correctly.",
      "",
      `File: ${draft.sourceFileName}`,
      `Extraction method: ${draft.extraction.provider}`,
      `Confidence: ${draft.extraction.confidence}`,
      `Markers extracted: ${draft.markers.length}`,
      "",
      "Lab / country: [user fills in]",
      "What went wrong: [user fills in]",
      "",
      "---",
      "Please do NOT attach your PDF as it contains personal medical data.",
      "Describe which markers were missing or incorrectly extracted instead."
    ].join("\n");
    return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  })();

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

  const updateCompounds = (nextCompounds: string[]) => {
    const normalizedCompounds = canonicalizeCompoundList(nextCompounds);
    onAnnotationsChange({
      ...annotations,
      compounds: normalizedCompounds,
      compound: normalizedCompounds[0] ?? ""
    });
  };

  const addCompound = () => {
    const next = compoundInput.trim();
    if (!next) {
      return;
    }
    updateCompounds([...compounds, next]);
    setCompoundInput("");
  };

  const removeCompound = (compoundToRemove: string) => {
    updateCompounds(compounds.filter((entry) => entry !== compoundToRemove));
  };

  const updateSupplementList = (nextEntries: SupplementEntry[]) => {
    const normalizedEntries = normalizeSupplementEntries(nextEntries, annotations.supplements);
    onAnnotationsChange({
      ...annotations,
      supplementEntries: normalizedEntries,
      supplements: supplementEntriesToText(normalizedEntries)
    });
  };

  const addSupplement = () => {
    const name = supplementNameInput.trim();
    if (!name) {
      return;
    }
    updateSupplementList([
      ...supplementEntries,
      {
        name,
        dose: supplementDoseInput.trim()
      }
    ]);
    setSupplementNameInput("");
    setSupplementDoseInput("");
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
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{tr("Injectiefrequentie", "Injection frequency")}</label>
          <select
            value={normalizeInjectionFrequency(annotations.injectionFrequency)}
            onChange={(event) =>
              onAnnotationsChange({
                ...annotations,
                injectionFrequency: event.target.value
              })
            }
            className="w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
          >
            {INJECTION_FREQUENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {isNl ? option.label.nl : option.label.en}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">
            {tr("Protocoldetails", "Protocol details")}
          </label>
          <input
            value={annotations.protocol}
            onChange={(event) => onAnnotationsChange({ ...annotations, protocol: event.target.value })}
            className="w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            placeholder={tr("bijv. SubQ, split doses, opmerking", "e.g. SubQ, split doses, notes")}
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

      <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900/40 p-3">
        <label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">{tr("Compounds", "Compounds")}</label>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <input
            list={compoundDatalistId}
            value={compoundInput}
            onChange={(event) => setCompoundInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCompound();
              }
            }}
            className="w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            placeholder={tr("Zoek of typ een compound en druk Enter", "Search or type a compound and press Enter")}
          />
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 hover:border-cyan-400/60 hover:text-cyan-100"
            onClick={addCompound}
          >
            <Plus className="h-4 w-4" /> {tr("Toevoegen", "Add")}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {compounds.length === 0 ? (
            <span className="text-xs text-slate-400">{tr("Nog geen compounds toegevoegd.", "No compounds added yet.")}</span>
          ) : (
            compounds.map((compound) => (
              <button
                key={compound}
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-100"
                onClick={() => removeCompound(compound)}
                title={tr("Verwijderen", "Remove")}
              >
                {compound}
                <X className="h-3 w-3" />
              </button>
            ))
          )}
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900/40 p-3">
        <label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">
          {tr("Supplementen (met dosis)", "Supplements (with dose)")}
        </label>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_200px_auto]">
          <input
            list={supplementDatalistId}
            value={supplementNameInput}
            onChange={(event) => setSupplementNameInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addSupplement();
              }
            }}
            className="w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            placeholder={tr("Zoek of typ supplement", "Search or type supplement")}
          />
          <input
            value={supplementDoseInput}
            onChange={(event) => setSupplementDoseInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addSupplement();
              }
            }}
            className="w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            placeholder={tr("Dosis (bv 4000 IU)", "Dose (e.g. 4000 IU)")}
          />
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 hover:border-emerald-400/60 hover:text-emerald-100"
            onClick={addSupplement}
          >
            <Plus className="h-4 w-4" /> {tr("Toevoegen", "Add")}
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {supplementEntries.length === 0 ? (
            <span className="text-xs text-slate-400">{tr("Nog geen supplementen toegevoegd.", "No supplements added yet.")}</span>
          ) : (
            supplementEntries.map((entry, index) => (
              <div key={`${entry.name}-${entry.dose}-${index}`} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_200px_auto]">
                <input
                  list={supplementDatalistId}
                  value={entry.name}
                  onChange={(event) =>
                    updateSupplementList(
                      supplementEntries.map((row, rowIndex) =>
                        rowIndex === index
                          ? {
                              ...row,
                              name: event.target.value
                            }
                          : row
                      )
                    )
                  }
                  className="w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                />
                <input
                  value={entry.dose}
                  onChange={(event) =>
                    updateSupplementList(
                      supplementEntries.map((row, rowIndex) =>
                        rowIndex === index
                          ? {
                              ...row,
                              dose: event.target.value
                            }
                          : row
                      )
                    )
                  }
                  className="w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                />
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 hover:border-rose-400/60 hover:text-rose-100"
                  onClick={() => updateSupplementList(supplementEntries.filter((_, rowIndex) => rowIndex !== index))}
                >
                  {tr("Verwijderen", "Remove")}
                </button>
              </div>
            ))
          )}
        </div>
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
      <datalist id={compoundDatalistId}>
        {COMPOUND_OPTIONS.map((compound) => (
          <option key={compound} value={compound} />
        ))}
      </datalist>
      <datalist id={supplementDatalistId}>
        {SUPPLEMENT_OPTIONS.map((supplement) => (
          <option key={supplement} value={supplement} />
        ))}
      </datalist>

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

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200"
          onClick={addRow}
        >
          <Plus className="h-4 w-4" /> {tr("Markerrij toevoegen", "Add marker row")}
        </button>
        <a
          href={parsingFeedbackMailto}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-300"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {tr("Meld een verwerkingsprobleem", "Report a parsing issue")}
        </a>
      </div>
    </motion.div>
  );
};

export default ExtractionReviewTable;
