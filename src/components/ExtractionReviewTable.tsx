import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ChevronDown, ChevronUp, Plus, Save, Trash2, X } from "lucide-react";
import { FEEDBACK_EMAIL } from "../constants";
import { trLocale } from "../i18n";
import { createId, deriveAbnormalFlag, safeNumber } from "../utils";
import { canonicalizeMarker, normalizeMarkerMeasurement } from "../unitConversion";
import { AppLanguage, ExtractionDraft, MarkerValue, Protocol, ReportAnnotations, SupplementPeriod } from "../types";
import {
  canonicalizeSupplement,
  SUPPLEMENT_FREQUENCY_OPTIONS,
  SUPPLEMENT_OPTIONS,
  supplementFrequencyLabel
} from "../protocolStandards";
import { getActiveSupplementsAtDate, supplementPeriodsToText } from "../supplementUtils";
import ProtocolEditor, { blankProtocolDraft } from "./ProtocolEditor";
import EditableCell from "./EditableCell";

export interface ExtractionReviewTableProps {
  draft: ExtractionDraft;
  annotations: ReportAnnotations;
  protocols: Protocol[];
  supplementTimeline: SupplementPeriod[];
  selectedProtocolId: string | null;
  language: AppLanguage;
  showSamplingTiming: boolean;
  onDraftChange: (draft: ExtractionDraft) => void;
  onAnnotationsChange: (annotations: ReportAnnotations) => void;
  onSelectedProtocolIdChange: (protocolId: string | null) => void;
  onProtocolCreate: (protocol: Protocol) => void;
  onAddSupplementPeriod: (period: SupplementPeriod) => void;
  onSave: () => void;
  onCancel: () => void;
}

const ExtractionReviewTable = ({
  draft,
  annotations,
  protocols,
  supplementTimeline,
  selectedProtocolId,
  language,
  showSamplingTiming,
  onDraftChange,
  onAnnotationsChange,
  onSelectedProtocolIdChange,
  onProtocolCreate,
  onAddSupplementPeriod,
  onSave,
  onCancel
}: ExtractionReviewTableProps) => {
  const isNl = language === "nl";
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  const [showCreateProtocol, setShowCreateProtocol] = useState(false);
  const [protocolDraft, setProtocolDraft] = useState(blankProtocolDraft());
  const [protocolFeedback, setProtocolFeedback] = useState("");
  const [showSupplementOverrideEditor, setShowSupplementOverrideEditor] = useState(false);
  const [supplementNameInput, setSupplementNameInput] = useState("");
  const [supplementDoseInput, setSupplementDoseInput] = useState("");
  const [supplementFrequencyInput, setSupplementFrequencyInput] = useState("daily");
  const [addTimelineStartDate, setAddTimelineStartDate] = useState(draft.testDate);
  const [addTimelineEndDate, setAddTimelineEndDate] = useState("");
  const [showWarningDetails, setShowWarningDetails] = useState(false);

  const warningCodes = Array.from(new Set([...(draft.extraction.warnings ?? []), ...(draft.extraction.warningCode ? [draft.extraction.warningCode] : [])]));
  const debugInfo = draft.extraction.debug;
  const warningMessages = warningCodes
    .map((code) => {
      if (code === "PDF_TEXT_LAYER_EMPTY") {
        return tr(
          "Deze PDF heeft geen bruikbare tekstlaag. OCR is gebruikt; controleer de uitgelezen markers extra goed.",
          "This PDF has no usable text layer. OCR was used; review extracted markers carefully."
        );
      }
      if (code === "PDF_TEXT_EXTRACTION_FAILED") {
        return tr(
          "De tekstextractie uit dit PDF-bestand mislukte. De app is doorgeschakeld naar een veilige fallback.",
          "Text extraction failed for this PDF. The app switched to a safe fallback."
        );
      }
      if (code === "PDF_OCR_INIT_FAILED") {
        return tr(
          "OCR kon niet worden gestart voor dit bestand. Voeg ontbrekende markers handmatig toe.",
          "OCR could not be started for this file. Add missing markers manually."
        );
      }
      if (code === "PDF_OCR_PARTIAL") {
        return tr(
          "OCR was slechts gedeeltelijk succesvol. Sommige markers kunnen ontbreken of onjuist zijn.",
          "OCR was only partially successful. Some markers may be missing or incorrect."
        );
      }
      if (code === "PDF_LOW_CONFIDENCE_LOCAL") {
        return tr(
          "De parserzekerheid is laag. Controleer datum, markerwaarden en referentiebereiken voordat je opslaat.",
          "Parser confidence is low. Check date, marker values, and reference ranges before saving."
        );
      }
      return null;
    })
    .filter((value): value is string => Boolean(value));

  const selectedProtocol = useMemo(
    () => protocols.find((protocol) => protocol.id === selectedProtocolId) ?? null,
    [protocols, selectedProtocolId]
  );

  useEffect(() => {
    if (selectedProtocolId && !selectedProtocol) {
      onSelectedProtocolIdChange(null);
    }
  }, [selectedProtocol, selectedProtocolId, onSelectedProtocolIdChange]);

  useEffect(() => {
    setAddTimelineStartDate(draft.testDate);
  }, [draft.testDate]);

  const autoMatchedSupplements = useMemo(
    () => getActiveSupplementsAtDate(supplementTimeline, draft.testDate),
    [supplementTimeline, draft.testDate]
  );

  const activeSupplements = annotations.supplementOverrides ?? autoMatchedSupplements;
  const overrideSupplements = annotations.supplementOverrides ?? [];
  const supplementSuggestions = useMemo(() => {
    const query = supplementNameInput.trim().toLowerCase();
    if (query.length < 2) {
      return [];
    }
    return SUPPLEMENT_OPTIONS.filter((option) => option.toLowerCase().includes(query)).slice(0, 8);
  }, [supplementNameInput]);

  const parsingFeedbackMailto = (() => {
    const subject = `PDF Parsing Feedback - ${draft.sourceFileName}`;
    const body = [
      "Hi,",
      "",
      "I uploaded a lab PDF and the extraction didn't work correctly.",
      "",
      `File: ${draft.sourceFileName}`,
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

  const addSupplementOverride = () => {
    const name = canonicalizeSupplement(supplementNameInput);
    if (!name) {
      return;
    }
    const normalizedFrequency = supplementFrequencyInput.trim() || "unknown";
    const period: SupplementPeriod = {
      id: createId(),
      name,
      dose: supplementDoseInput.trim(),
      frequency: normalizedFrequency,
      startDate: draft.testDate,
      endDate: draft.testDate
    };
    onAnnotationsChange({
      ...annotations,
      supplementOverrides: [...overrideSupplements, period]
    });
    setSupplementNameInput("");
    setSupplementDoseInput("");
    setSupplementFrequencyInput("daily");
  };

  const removeSupplementOverride = (id: string) => {
    onAnnotationsChange({
      ...annotations,
      supplementOverrides: overrideSupplements.filter((item) => item.id !== id)
    });
  };

  const resetSupplementsToAuto = () => {
    onAnnotationsChange({
      ...annotations,
      supplementOverrides: null
    });
    setShowSupplementOverrideEditor(false);
  };

  const addOverridesToTimeline = () => {
    if (overrideSupplements.length === 0) {
      return;
    }
    const startDate = addTimelineStartDate || draft.testDate;
    const endDate = addTimelineEndDate.trim() ? addTimelineEndDate : null;
    overrideSupplements.forEach((supplement) => {
      onAddSupplementPeriod({
        ...supplement,
        id: createId(),
        startDate,
        endDate
      });
    });
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

  const saveProtocolFromDraft = () => {
    const name = protocolDraft.name.trim();
    if (!name) {
      setProtocolFeedback(tr("Geef een protocolnaam op.", "Please enter a protocol name."));
      return;
    }
    if (protocolDraft.compounds.length === 0) {
      setProtocolFeedback(tr("Voeg minimaal 1 compound toe.", "Add at least 1 compound."));
      return;
    }

    const now = new Date().toISOString();
    const protocol: Protocol = {
      id: createId(),
      name,
      compounds: protocolDraft.compounds,
      notes: protocolDraft.notes,
      createdAt: now,
      updatedAt: now
    };

    onProtocolCreate(protocol);
    onSelectedProtocolIdChange(protocol.id);
    setShowCreateProtocol(false);
    setProtocolDraft(blankProtocolDraft());
    setProtocolFeedback("");
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
            {draft.sourceFileName} | {tr("betrouwbaarheid", "confidence")} {" "}
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

      {warningMessages.length > 0 ? (
        <div className="mt-3 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-4 w-4" />
              {tr("Parserwaarschuwingen", "Parser warnings")} ({warningMessages.length})
            </p>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-100 hover:bg-amber-500/20"
              onClick={() => setShowWarningDetails((current) => !current)}
            >
              {showWarningDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showWarningDetails ? tr("Minder tonen", "Show less") : tr("Checklist tonen", "Show checklist")}
            </button>
          </div>
          <p className="mt-1 text-xs text-amber-100/95 sm:text-sm">
            {tr(
              "Controleer markernaam, waarde en referentiebereik voordat je opslaat.",
              "Review marker name, value, and reference range before saving."
            )}
          </p>
          {showWarningDetails ? (
            <>
              <ul className="mt-2 space-y-1 text-xs sm:text-sm">
                {warningMessages.map((message) => (
                  <li key={message}>• {message}</li>
                ))}
              </ul>
              <div className="mt-2 rounded-md border border-amber-500/20 bg-slate-950/30 p-2 text-xs text-amber-100/95">
                <p className="font-medium">{tr("Checklist vóór opslaan", "Checklist before saving")}</p>
                <p>• {tr("Controleer of de testdatum klopt.", "Confirm the test date is correct.")}</p>
                <p>• {tr("Controleer kritieke markers (Testosterone, Estradiol, SHBG, Hematocrit).", "Verify critical markers (Testosterone, Estradiol, SHBG, Hematocrit).")}</p>
                <p>• {tr("Vul ontbrekende referentiewaarden handmatig aan waar nodig.", "Fill in missing reference ranges manually where needed.")}</p>
              </div>
              {debugInfo ? (
                <p className="mt-2 text-[11px] text-amber-100/80">
                  {tr("Debug", "Debug")}: text items {debugInfo.textItems} · OCR {debugInfo.ocrUsed ? "on" : "off"} · kept rows {debugInfo.keptRows} · rejected rows{" "}
                  {debugInfo.rejectedRows}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      <div className={`mt-4 grid gap-3 md:grid-cols-2 ${showSamplingTiming ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
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
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{tr("Protocol", "Protocol")}</label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedProtocolId ?? ""}
              onChange={(event) => {
                const nextValue = event.target.value.trim();
                onSelectedProtocolIdChange(nextValue ? nextValue : null);
              }}
              className="review-context-input min-w-[220px] flex-1 rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">{tr("Geen protocol", "No protocol")}</option>
              {protocols.map((protocol) => (
                <option key={protocol.id} value={protocol.id}>
                  {protocol.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-200"
              onClick={() => setShowCreateProtocol((current) => !current)}
            >
              <Plus className="h-4 w-4" /> {showCreateProtocol ? tr("Sluit", "Close") : tr("Nieuw", "New")}
            </button>
            {selectedProtocol ? (
              <button
                type="button"
                className="rounded-md border border-rose-500/50 bg-rose-500/15 px-3 py-2 text-sm font-medium text-rose-100"
                onClick={() => onSelectedProtocolIdChange(null)}
              >
                {tr("Ontkoppel", "Detach")}
              </button>
            ) : null}
          </div>
          {!selectedProtocol && protocols.length === 0 ? (
            <p className="mt-1 text-xs text-slate-400">
              {tr("Nog geen protocol opgeslagen. Klik op Nieuw om er één aan te maken.", "No saved protocol yet. Click New to create one.")}
            </p>
          ) : null}
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

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-700">
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

      <div className="review-context-card mt-3 space-y-3 rounded-xl border border-slate-700 bg-slate-900/45 p-3">
          {showCreateProtocol ? (
            <div className="rounded-xl border border-cyan-500/30 bg-slate-900/50 p-3">
              <ProtocolEditor value={protocolDraft} language={language} onChange={setProtocolDraft} />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                  onClick={() => {
                    setShowCreateProtocol(false);
                    setProtocolDraft(blankProtocolDraft());
                    setProtocolFeedback("");
                  }}
                >
                  <X className="h-4 w-4" /> {tr("Annuleren", "Cancel")}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-200"
                  onClick={saveProtocolFromDraft}
                >
                  <Save className="h-4 w-4" /> {tr("Opslaan en selecteren", "Save and select")}
                </button>
              </div>
              {protocolFeedback ? <p className="mt-2 text-sm text-amber-200">{protocolFeedback}</p> : null}
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-700 bg-slate-900/45 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="block text-xs uppercase tracking-wide text-slate-400">
                {tr("Supplementen op moment van test", "Supplements at time of test")}
              </label>
              {annotations.supplementOverrides ? (
                <span className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-200">
                  {tr("Aangepaste override", "Custom override")}
                </span>
              ) : (
                <span className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                  {tr("Auto-match op datum", "Auto-matched by test date")}
                </span>
              )}
            </div>

            <p className="text-sm text-slate-300">
              {supplementPeriodsToText(activeSupplements) || tr("Geen supplementen actief op deze datum.", "No supplements active at this date.")}
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-cyan-500/50 hover:text-cyan-200"
                onClick={() => setShowSupplementOverrideEditor((current) => !current)}
              >
                {showSupplementOverrideEditor
                  ? tr("Verberg aanpassen", "Hide customization")
                  : tr("Deze kloppen niet - aanpassen", "These weren't my supplements - customize")}
              </button>
              {annotations.supplementOverrides ? (
                <button
                  type="button"
                  className="rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-1.5 text-sm text-rose-100"
                  onClick={resetSupplementsToAuto}
                >
                  {tr("Terug naar auto-match", "Reset to auto-match")}
                </button>
              ) : null}
            </div>

            {showSupplementOverrideEditor ? (
              <div className="mt-3 space-y-3 rounded-lg border border-slate-700 bg-slate-950/40 p-3">
            <div className="grid gap-2 md:grid-cols-[1.4fr_1fr_1fr_auto]">
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
                  onClick={addSupplementOverride}
                >
                  <Plus className="mr-1 inline-block h-4 w-4" />
                  {tr("Toevoegen", "Add")}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {overrideSupplements.length === 0 ? (
                <p className="text-sm text-slate-400">{tr("Nog geen overrides toegevoegd.", "No overrides added yet.")}</p>
              ) : (
                overrideSupplements.map((supplement) => (
                  <div key={supplement.id} className="flex items-center justify-between rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2">
                    <p className="text-sm text-slate-200">
                      <span className="font-medium">{supplement.name}</span>
                      {supplement.dose ? ` · ${supplement.dose}` : ""}
                      {` · ${supplementFrequencyLabel(supplement.frequency, language)}`}
                    </p>
                    <button
                      type="button"
                      className="rounded-md p-1 text-slate-400 hover:bg-slate-700 hover:text-rose-300"
                      onClick={() => removeSupplementOverride(supplement.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {overrideSupplements.length > 0 ? (
              <div className="rounded-md border border-slate-700 bg-slate-900/60 p-3">
                <p className="mb-2 text-sm font-medium text-slate-200">{tr("Voeg deze ook toe aan je supplement-tijdlijn", "Add these to your supplement timeline")}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">{tr("Startdatum", "Start date")}</label>
                    <input
                      type="date"
                      value={addTimelineStartDate}
                      onChange={(event) => setAddTimelineStartDate(event.target.value)}
                      className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">{tr("Einddatum (optioneel)", "End date (optional)")}</label>
                    <input
                      type="date"
                      value={addTimelineEndDate}
                      onChange={(event) => setAddTimelineEndDate(event.target.value)}
                      className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="mt-2 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200"
                  onClick={addOverridesToTimeline}
                >
                  {tr("Toevoegen aan tijdlijn", "Add to timeline")}
                </button>
              </div>
            ) : null}
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
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

          <div className="flex flex-col-reverse gap-2 border-t border-slate-700/80 pt-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:border-slate-400"
              onClick={onCancel}
            >
              <X className="h-4 w-4" /> {tr("Annuleren", "Cancel")}
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1 rounded-md bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-400"
              onClick={onSave}
            >
              <Save className="h-4 w-4" /> {tr("Rapport opslaan", "Save report")}
            </button>
          </div>
      </div>
    </motion.div>
  );
};

export default ExtractionReviewTable;
