import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { canonicalizeSupplement, SUPPLEMENT_FREQUENCY_OPTIONS, SUPPLEMENT_OPTIONS, supplementFrequencyLabel } from "../protocolStandards";
import { trLocale } from "../i18n";
import { AppLanguage, LabReport, SupplementPeriod } from "../types";
import { ResolvedReportSupplementContext } from "../supplementUtils";
import { createId, formatDate } from "../utils";

interface SupplementsViewProps {
  language: AppLanguage;
  reports: LabReport[];
  timeline: SupplementPeriod[];
  resolvedSupplementContexts: Record<string, ResolvedReportSupplementContext>;
  isShareMode: boolean;
  onAddSupplementPeriod: (period: SupplementPeriod) => void;
  onUpdateSupplementPeriod: (id: string, updates: Partial<SupplementPeriod>) => void;
  onStopSupplement: (id: string, endDate?: string) => void;
  onDeleteSupplementPeriod: (id: string) => void;
  onOpenReportForSupplementBackfill: (reportId: string) => void;
}

const AUTOCOMPLETE_MIN_CHARS = 2;
const AUTOCOMPLETE_MAX_OPTIONS = 8;

const buildSuggestions = (value: string, options: string[]): string[] => {
  const query = value.trim().toLocaleLowerCase();
  if (query.length < AUTOCOMPLETE_MIN_CHARS) {
    return [];
  }
  const startsWith = options.filter((option) => option.toLocaleLowerCase().startsWith(query));
  const includes = options.filter(
    (option) => !option.toLocaleLowerCase().startsWith(query) && option.toLocaleLowerCase().includes(query)
  );
  return [...startsWith, ...includes].slice(0, AUTOCOMPLETE_MAX_OPTIONS);
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const daysBetween = (fromIso: string, toIso: string): number => {
  const start = Date.parse(`${fromIso}T00:00:00Z`);
  const end = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 0;
  }
  return Math.max(0, Math.floor((end - start) / (24 * 60 * 60 * 1000)));
};

const shiftIsoByDays = (isoDate: string, deltaDays: number): string => {
  const ts = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(ts)) {
    return isoDate;
  }
  return new Date(ts + deltaDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
};

const SupplementsView = ({
  language,
  reports,
  timeline,
  resolvedSupplementContexts,
  isShareMode,
  onAddSupplementPeriod,
  onUpdateSupplementPeriod,
  onStopSupplement,
  onDeleteSupplementPeriod,
  onOpenReportForSupplementBackfill
}: SupplementsViewProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  const [isAdding, setIsAdding] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [doseInput, setDoseInput] = useState("");
  const [frequencyInput, setFrequencyInput] = useState("unknown");
  const [startDateInput, setStartDateInput] = useState(todayIso());
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [addErrors, setAddErrors] = useState<{
    name?: string;
    startDate?: string;
  }>({});
  const [addSuccessMessage, setAddSuccessMessage] = useState("");

  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [editDoseInput, setEditDoseInput] = useState("");
  const [editFrequencyInput, setEditFrequencyInput] = useState("unknown");
  const [editStartDateInput, setEditStartDateInput] = useState(todayIso());
  const [stopDialogPeriod, setStopDialogPeriod] = useState<SupplementPeriod | null>(null);
  const [stopDateInput, setStopDateInput] = useState(todayIso());
  const [stopDateError, setStopDateError] = useState("");
  const [editingHistoryPeriodId, setEditingHistoryPeriodId] = useState<string | null>(null);
  const [historyDoseInput, setHistoryDoseInput] = useState("");
  const [historyFrequencyInput, setHistoryFrequencyInput] = useState("unknown");
  const [historyStartDateInput, setHistoryStartDateInput] = useState(todayIso());
  const [historyEndDateInput, setHistoryEndDateInput] = useState("");
  const [historyEditError, setHistoryEditError] = useState("");
  const addFormRef = useRef<HTMLDivElement | null>(null);
  const addNameInputRef = useRef<HTMLInputElement | null>(null);
  const addStartDateInputRef = useRef<HTMLInputElement | null>(null);
  const currentDateIso = todayIso();

  const sortedTimeline = useMemo(
    () =>
      [...timeline].sort(
        (left, right) =>
          right.startDate.localeCompare(left.startDate) ||
          (right.endDate ?? "9999-12-31").localeCompare(left.endDate ?? "9999-12-31") ||
          left.name.localeCompare(right.name)
      ),
    [timeline]
  );

  const activeStack = useMemo(() => sortedTimeline.filter((period) => period.endDate === null), [sortedTimeline]);

  const groupedHistory = useMemo(() => {
    const byName = new Map<string, SupplementPeriod[]>();
    sortedTimeline.forEach((period) => {
      const current = byName.get(period.name) ?? [];
      current.push(period);
      byName.set(period.name, current);
    });
    return Array.from(byName.entries()).sort((a, b) => {
      const latestA = a[1][0]?.startDate ?? "";
      const latestB = b[1][0]?.startDate ?? "";
      return latestB.localeCompare(latestA) || a[0].localeCompare(b[0]);
    });
  }, [sortedTimeline]);

  const suggestions = useMemo(() => buildSuggestions(nameInput, SUPPLEMENT_OPTIONS), [nameInput]);
  const unknownReports = useMemo(
    () =>
      [...reports]
        .filter((report) => resolvedSupplementContexts[report.id]?.effectiveState === "unknown")
        .sort(
          (left, right) => right.testDate.localeCompare(left.testDate) || right.createdAt.localeCompare(left.createdAt)
        ),
    [reports, resolvedSupplementContexts]
  );

  const resetAddForm = () => {
    setNameInput("");
    setDoseInput("");
    setFrequencyInput("unknown");
    setStartDateInput(todayIso());
    setShowSuggestions(false);
    setAddErrors({});
  };

  const submitNewSupplement = () => {
    const name = canonicalizeSupplement(nameInput);
    const nextErrors: {
      name?: string;
      startDate?: string;
    } = {};
    if (!name) {
      nextErrors.name = tr("Vul een supplementnaam in.", "Please enter a supplement name.");
    }
    if (!startDateInput) {
      nextErrors.startDate = tr("Kies een startdatum.", "Please choose a start date.");
    }
    setAddErrors(nextErrors);
    if (nextErrors.name || nextErrors.startDate) {
      if (nextErrors.name) {
        addNameInputRef.current?.focus();
      } else if (nextErrors.startDate) {
        addStartDateInputRef.current?.focus();
      }
      return;
    }
    onAddSupplementPeriod({
      id: createId(),
      name,
      dose: doseInput.trim(),
      frequency: frequencyInput,
      startDate: startDateInput,
      endDate: null
    });
    setAddSuccessMessage(tr(`${name} toegevoegd aan je actieve stack.`, `${name} added to your active stack.`));
    resetAddForm();
    setIsAdding(false);
  };

  useEffect(() => {
    if (!isAdding) {
      return;
    }
    addFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timeout = window.setTimeout(() => {
      addNameInputRef.current?.focus();
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [isAdding]);

  const startEditDose = (period: SupplementPeriod) => {
    setEditingPeriodId(period.id);
    setEditDoseInput(period.dose);
    setEditFrequencyInput(period.frequency);
    setEditStartDateInput(period.startDate);
  };

  const cancelEditDose = () => {
    setEditingPeriodId(null);
    setEditDoseInput("");
    setEditFrequencyInput("unknown");
    setEditStartDateInput(todayIso());
  };

  const saveEditedDose = (period: SupplementPeriod) => {
    if (!editStartDateInput) {
      return;
    }
    const newStart = editStartDateInput;
    if (newStart === period.startDate) {
      onUpdateSupplementPeriod(period.id, {
        dose: editDoseInput.trim(),
        frequency: editFrequencyInput
      });
      cancelEditDose();
      return;
    }

    if (newStart < period.startDate) {
      onUpdateSupplementPeriod(period.id, {
        dose: editDoseInput.trim(),
        frequency: editFrequencyInput,
        startDate: newStart
      });
      cancelEditDose();
      return;
    }

    onUpdateSupplementPeriod(period.id, {
      endDate: shiftIsoByDays(newStart, -1)
    });
    onAddSupplementPeriod({
      id: createId(),
      name: period.name,
      dose: editDoseInput.trim(),
      frequency: editFrequencyInput,
      startDate: newStart,
      endDate: null
    });
    cancelEditDose();
  };

  const openStopDateModal = (period: SupplementPeriod) => {
    setStopDialogPeriod(period);
    setStopDateInput(currentDateIso);
    setStopDateError("");
  };

  const closeStopDateModal = () => {
    setStopDialogPeriod(null);
    setStopDateInput(currentDateIso);
    setStopDateError("");
  };

  const confirmStopDateModal = () => {
    if (!stopDialogPeriod) {
      return;
    }
    if (!stopDateInput) {
      setStopDateError(tr("Kies een stopdatum.", "Please choose a stop date."));
      return;
    }
    if (stopDateInput < stopDialogPeriod.startDate) {
      setStopDateError(tr("Stopdatum kan niet voor de startdatum liggen.", "Stop date cannot be before start date."));
      return;
    }
    onStopSupplement(stopDialogPeriod.id, stopDateInput);
    closeStopDateModal();
  };

  const startEditHistoryPeriod = (period: SupplementPeriod) => {
    setEditingHistoryPeriodId(period.id);
    setHistoryDoseInput(period.dose);
    setHistoryFrequencyInput(period.frequency);
    setHistoryStartDateInput(period.startDate);
    setHistoryEndDateInput(period.endDate ?? "");
    setHistoryEditError("");
  };

  const cancelEditHistoryPeriod = () => {
    setEditingHistoryPeriodId(null);
    setHistoryDoseInput("");
    setHistoryFrequencyInput("unknown");
    setHistoryStartDateInput(todayIso());
    setHistoryEndDateInput("");
    setHistoryEditError("");
  };

  const saveEditedHistoryPeriod = (period: SupplementPeriod) => {
    if (!historyStartDateInput) {
      setHistoryEditError(tr("Kies een startdatum.", "Please choose a start date."));
      return;
    }
    if (historyEndDateInput && historyEndDateInput < historyStartDateInput) {
      setHistoryEditError(tr("Einddatum kan niet voor de startdatum liggen.", "End date cannot be before start date."));
      return;
    }
    onUpdateSupplementPeriod(period.id, {
      dose: historyDoseInput.trim(),
      frequency: historyFrequencyInput,
      startDate: historyStartDateInput,
      endDate: historyEndDateInput || null
    });
    cancelEditHistoryPeriod();
  };

  return (
    <section className="space-y-3 fade-in">
      <div className="app-teal-glow-surface rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-100">{tr("Actieve stack en tijdlijn", "Active stack and timeline")}</h3>
            <p className="text-sm text-slate-300">
              {tr(
                "Volg je actieve stack en bekijk de volledige tijdlijn per supplement. Deze huidige stack wordt automatisch gebruikt voor nieuwe rapporten totdat je in een rapport expliciet aangeeft dat je stack is veranderd.",
                "Track your active stack and full timeline per supplement. This current stack is automatically used for new reports until you explicitly mark a stack change inside a report."
              )}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200 disabled:opacity-50"
            onClick={() => {
              if (isAdding) {
                setIsAdding(false);
                setAddErrors({});
                return;
              }
              setAddSuccessMessage("");
              setAddErrors({});
              setIsAdding(true);
            }}
            disabled={isShareMode}
          >
            {isAdding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {isAdding ? tr("Sluiten", "Close") : tr("Supplement toevoegen", "Add supplement")}
          </button>
        </div>
        {addSuccessMessage ? (
          <div
            role="status"
            aria-live="polite"
            className="mt-3 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
          >
            {addSuccessMessage}
          </div>
        ) : null}

        {isAdding ? (
          <div ref={addFormRef} className="mt-3 rounded-xl border border-slate-700 bg-slate-900/60 p-3">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_140px_170px_150px_auto] md:items-end">
              <label className="text-xs uppercase tracking-wide text-slate-400">
                {tr("Supplement", "Supplement")}
                <div className="relative mt-1">
                  <input
                    ref={addNameInputRef}
                    value={nameInput}
                    onChange={(event) => {
                      setNameInput(event.target.value);
                      setAddErrors((current) => ({ ...current, name: undefined }));
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)}
                    className={`review-context-input w-full rounded-md border bg-slate-800/70 px-3 py-2 text-sm text-slate-100 ${
                      addErrors.name ? "border-rose-500/80 focus:border-rose-400" : "border-slate-600"
                    }`}
                    placeholder={tr("Zoek of typ supplement", "Search or type supplement")}
                  />
                  {showSuggestions && suggestions.length > 0 ? (
                    <div className="review-suggestion-menu absolute left-0 right-0 top-[calc(100%+6px)] z-20 rounded-md">
                      {suggestions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className="review-suggestion-item block w-full px-3 py-2 text-left text-sm"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setNameInput(option);
                            setShowSuggestions(false);
                          }}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                {addErrors.name ? <p className="mt-1 text-xs text-rose-300">{addErrors.name}</p> : null}
              </label>

              <label className="text-xs uppercase tracking-wide text-slate-400">
                {tr("Dosis", "Dose")}
                <input
                  value={doseInput}
                  onChange={(event) => setDoseInput(event.target.value)}
                  className="review-context-input mt-1 w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                  placeholder={tr("Dosis", "Dose")}
                />
              </label>
              <label className="text-xs uppercase tracking-wide text-slate-400">
                {tr("Frequentie", "Frequency")}
                <select
                  value={frequencyInput}
                  onChange={(event) => setFrequencyInput(event.target.value)}
                  className="review-context-input mt-1 w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                >
                  {SUPPLEMENT_FREQUENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {tr(option.label.nl, option.label.en)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs uppercase tracking-wide text-slate-400">
                {tr("Startdatum", "Date started")}
                <input
                  ref={addStartDateInputRef}
                  type="date"
                  value={startDateInput}
                  onChange={(event) => {
                    setStartDateInput(event.target.value);
                    setAddErrors((current) => ({ ...current, startDate: undefined }));
                  }}
                  className={`review-context-input mt-1 w-full rounded-md border bg-slate-800/70 px-3 py-2 text-sm text-slate-100 ${
                    addErrors.startDate ? "border-rose-500/80 focus:border-rose-400" : "border-slate-600"
                  }`}
                />
                {addErrors.startDate ? <p className="mt-1 text-xs text-rose-300">{addErrors.startDate}</p> : null}
              </label>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 md:self-end"
                onClick={submitNewSupplement}
              >
                <Save className="h-4 w-4" /> {tr("Opslaan", "Save")}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="app-teal-glow-surface rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
        <h4 className="text-sm font-semibold text-slate-100">{tr("Actieve stack", "Active stack")}</h4>
        {activeStack.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">{tr("Geen actieve supplementen.", "No active supplements.")}</p>
        ) : (
          <div className="mt-2 space-y-2">
            {activeStack.map((period) => {
              const isEditing = editingPeriodId === period.id;
              const activeDays = daysBetween(period.startDate, currentDateIso);
              return (
                <article key={period.id} className="rounded-xl border border-slate-700 bg-slate-900/50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{period.name}</p>
                      <p className="text-xs text-slate-300">
                        {period.dose || tr("Geen dosis", "No dose")} · {supplementFrequencyLabel(period.frequency, language)} · {tr("Sinds", "Since")} {formatDate(period.startDate)}
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-200">
                      <Clock3 className="h-3.5 w-3.5" /> {activeDays} {tr("dagen actief", "days active")}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="mt-2 grid gap-2 md:grid-cols-[150px_180px_150px_auto_auto]">
                      <input
                        value={editDoseInput}
                        onChange={(event) => setEditDoseInput(event.target.value)}
                        className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                        placeholder={tr("Nieuwe dosis", "New dose")}
                      />
                      <select
                        value={editFrequencyInput}
                        onChange={(event) => setEditFrequencyInput(event.target.value)}
                        className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                      >
                        {SUPPLEMENT_FREQUENCY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {tr(option.label.nl, option.label.en)}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={editStartDateInput}
                        onChange={(event) => setEditStartDateInput(event.target.value)}
                        className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                      />
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
                        onClick={() => saveEditedDose(period)}
                      >
                        <Save className="h-4 w-4" /> {tr("Opslaan", "Save")}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200"
                        onClick={cancelEditDose}
                      >
                        <X className="h-4 w-4" /> {tr("Annuleren", "Cancel")}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-xs text-cyan-200 disabled:opacity-50"
                        onClick={() => startEditDose(period)}
                        disabled={isShareMode}
                      >
                        <Pencil className="h-3.5 w-3.5" /> {tr("Dosis aanpassen", "Edit dose")}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-200 disabled:opacity-50"
                        onClick={() => openStopDateModal(period)}
                        disabled={isShareMode}
                      >
                        {tr("Stop", "Stop")}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="app-teal-glow-surface rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
        <h4 className="text-sm font-semibold text-slate-100">{tr("Historie", "History")}</h4>
        {groupedHistory.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">{tr("Nog geen supplementhistorie.", "No supplement history yet.")}</p>
        ) : (
          <div className="mt-2 space-y-3">
            {groupedHistory.map(([name, periods]) => (
              <article key={name} className="rounded-xl border border-slate-700 bg-slate-900/50 p-3">
                <h5 className="text-sm font-semibold text-slate-100">{name}</h5>
                <div className="mt-2 space-y-1.5">
                  {periods.map((period) => {
                    const isEditingHistory = editingHistoryPeriodId === period.id;
                    return (
                      <div key={period.id} className="supplement-history-row rounded-lg border border-slate-700/70 bg-slate-800/40 px-2.5 py-2 text-xs text-slate-200">
                        {isEditingHistory ? (
                          <div className="space-y-2">
                            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_170px_170px_170px]">
                              <input
                                value={historyDoseInput}
                                onChange={(event) => {
                                  setHistoryDoseInput(event.target.value);
                                  setHistoryEditError("");
                                }}
                                className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                                placeholder={tr("Dosis", "Dose")}
                              />
                              <select
                                value={historyFrequencyInput}
                                onChange={(event) => {
                                  setHistoryFrequencyInput(event.target.value);
                                  setHistoryEditError("");
                                }}
                                className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                              >
                                {SUPPLEMENT_FREQUENCY_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {tr(option.label.nl, option.label.en)}
                                  </option>
                                ))}
                              </select>
                              <label className="text-[11px] text-slate-400">
                                <span className="mb-1 block uppercase tracking-wide">{tr("Gestart", "Started")}</span>
                                <input
                                  type="date"
                                  value={historyStartDateInput}
                                  onChange={(event) => {
                                    setHistoryStartDateInput(event.target.value);
                                    setHistoryEditError("");
                                  }}
                                  className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                                />
                              </label>
                              <label className="text-[11px] text-slate-400">
                                <span className="mb-1 block uppercase tracking-wide">{tr("Gestopt", "Stopped")}</span>
                                <input
                                  type="date"
                                  value={historyEndDateInput}
                                  onChange={(event) => {
                                    setHistoryEndDateInput(event.target.value);
                                    setHistoryEditError("");
                                  }}
                                  className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                                />
                              </label>
                            </div>
                            {historyEditError ? <p className="text-xs text-rose-300">{historyEditError}</p> : null}
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200 disabled:opacity-50"
                                onClick={() => saveEditedHistoryPeriod(period)}
                                disabled={isShareMode}
                              >
                                <Save className="h-3.5 w-3.5" /> {tr("Opslaan", "Save")}
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-2.5 py-1 text-xs text-slate-200 disabled:opacity-50"
                                onClick={cancelEditHistoryPeriod}
                                disabled={isShareMode}
                              >
                                <X className="h-3.5 w-3.5" /> {tr("Annuleren", "Cancel")}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              {formatDate(period.startDate)} → {period.endDate ? formatDate(period.endDate) : tr("nu", "now")}
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-slate-100">
                                {period.dose || tr("geen dosis", "no dose")} · {supplementFrequencyLabel(period.frequency, language)}
                              </span>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200 disabled:opacity-50"
                                onClick={() => startEditHistoryPeriod(period)}
                                disabled={isShareMode}
                              >
                                <Pencil className="h-3.5 w-3.5" /> {tr("Bewerk", "Edit")}
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200 disabled:opacity-50"
                                onClick={() => {
                                  if (
                                    typeof window !== "undefined" &&
                                    !window.confirm(
                                      tr(
                                        `Weet je zeker dat je deze supplement-periode wilt verwijderen?`,
                                        "Are you sure you want to delete this supplement period?"
                                      )
                                    )
                                  ) {
                                    return;
                                  }
                                  onDeleteSupplementPeriod(period.id);
                                }}
                                disabled={isShareMode}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> {tr("Verwijder periode", "Delete period")}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {stopDialogPeriod ? (
        <div
          className="app-modal-overlay z-[96]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="supplement-stop-date-modal-title"
          onClick={closeStopDateModal}
        >
          <div className="app-modal-shell w-full max-w-md bg-slate-900 p-5 shadow-soft" onClick={(event) => event.stopPropagation()}>
            <h4 id="supplement-stop-date-modal-title" className="text-base font-semibold text-slate-100">
              {tr("Supplement stoppen", "Stop supplement")}
            </h4>
            <p className="mt-2 text-sm text-slate-300">
              {tr(
                `Kies wanneer je met ${stopDialogPeriod.name} bent gestopt. Je kunt een datum kiezen of direct vandaag stoppen.`,
                `Choose when you stopped ${stopDialogPeriod.name}. You can pick a date or stop today directly.`
              )}
            </p>
            <label className="mt-3 block text-xs uppercase tracking-wide text-slate-400">
              {tr("Gestopt sinds", "Stopped since")}
              <input
                type="date"
                min={stopDialogPeriod.startDate}
                max={currentDateIso}
                value={stopDateInput}
                onChange={(event) => {
                  setStopDateInput(event.target.value);
                  setStopDateError("");
                }}
                className={`review-context-input mt-1 w-full rounded-md border bg-slate-800/70 px-3 py-2 text-sm text-slate-100 ${
                  stopDateError ? "border-rose-500/80 focus:border-rose-400" : "border-slate-600"
                }`}
              />
            </label>
            {stopDateError ? <p className="mt-1 text-xs text-rose-300">{stopDateError}</p> : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                onClick={closeStopDateModal}
              >
                <X className="h-4 w-4" /> {tr("Annuleren", "Cancel")}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-200"
                onClick={() => {
                  onStopSupplement(stopDialogPeriod.id, currentDateIso);
                  closeStopDateModal();
                }}
              >
                {tr("Stop vandaag", "Stop today")}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-200"
                onClick={confirmStopDateModal}
              >
                <Save className="h-4 w-4" /> {tr("Stop op gekozen datum", "Stop on selected date")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {unknownReports.length > 0 ? (
        <div className="app-teal-glow-surface rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-slate-100">
              {tr("Historische backfill (onbekend)", "Historical backfill (unknown)")}
            </h4>
            <span className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
              {unknownReports.length} {tr("rapporten", "reports")}
            </span>
          </div>
          <div className="mt-2 space-y-2">
            {unknownReports.slice(0, 10).map((report) => (
              <div key={report.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100">{formatDate(report.testDate)}</p>
                  <p className="truncate text-xs text-slate-400">{report.sourceFileName}</p>
                </div>
                <button
                  type="button"
                  className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-200 hover:bg-cyan-500/20"
                  onClick={() => onOpenReportForSupplementBackfill(report.id)}
                >
                  {tr("Open in Labuitslagen", "Open in Lab Results")}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default SupplementsView;
