import { useMemo, useState } from "react";
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

  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [editDoseInput, setEditDoseInput] = useState("");
  const [editFrequencyInput, setEditFrequencyInput] = useState("unknown");
  const [editStartDateInput, setEditStartDateInput] = useState(todayIso());

  const sortedTimeline = useMemo(
    () =>
      [...timeline].sort(
        (left, right) =>
          left.startDate.localeCompare(right.startDate) ||
          (left.endDate ?? "9999-12-31").localeCompare(right.endDate ?? "9999-12-31") ||
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
    return Array.from(byName.entries()).sort((a, b) => a[0].localeCompare(b[0]));
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
  };

  const submitNewSupplement = () => {
    const name = canonicalizeSupplement(nameInput);
    if (!name || !startDateInput) {
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
    resetAddForm();
    setIsAdding(false);
  };

  const startEditDose = (period: SupplementPeriod) => {
    setEditingPeriodId(period.id);
    setEditDoseInput(period.dose);
    setEditFrequencyInput(period.frequency);
    setEditStartDateInput(todayIso());
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
    if (newStart <= period.startDate) {
      onUpdateSupplementPeriod(period.id, {
        dose: editDoseInput.trim(),
        frequency: editFrequencyInput
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

  return (
    <section className="space-y-3 fade-in">
      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-100">{tr("Supplementen", "Supplements")}</h3>
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
            onClick={() => setIsAdding((current) => !current)}
            disabled={isShareMode}
          >
            {isAdding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {isAdding ? tr("Sluiten", "Close") : tr("Supplement toevoegen", "Add supplement")}
          </button>
        </div>

        {isAdding ? (
          <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900/60 p-3">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_140px_170px_150px_auto]">
              <div className="relative">
                <input
                  value={nameInput}
                  onChange={(event) => {
                    setNameInput(event.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)}
                  className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
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

              <input
                value={doseInput}
                onChange={(event) => setDoseInput(event.target.value)}
                className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                placeholder={tr("Dosis", "Dose")}
              />
              <select
                value={frequencyInput}
                onChange={(event) => setFrequencyInput(event.target.value)}
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
                value={startDateInput}
                onChange={(event) => setStartDateInput(event.target.value)}
                className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
              />
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
                onClick={submitNewSupplement}
              >
                <Save className="h-4 w-4" /> {tr("Opslaan", "Save")}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
        <h4 className="text-sm font-semibold text-slate-100">{tr("Actieve stack", "Active stack")}</h4>
        {activeStack.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">{tr("Geen actieve supplementen.", "No active supplements.")}</p>
        ) : (
          <div className="mt-2 space-y-2">
            {activeStack.map((period) => {
              const isEditing = editingPeriodId === period.id;
              const activeDays = daysBetween(period.startDate, todayIso());
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
                        <X className="h-4 w-4" />
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
                        onClick={() => onStopSupplement(period.id)}
                        disabled={isShareMode}
                      >
                        {tr("Stop", "Stop")}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-200 disabled:opacity-50"
                        onClick={() => onDeleteSupplementPeriod(period.id)}
                        disabled={isShareMode}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {tr("Verwijderen", "Delete")}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
        <h4 className="text-sm font-semibold text-slate-100">{tr("Historie", "History")}</h4>
        {groupedHistory.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">{tr("Nog geen supplementhistorie.", "No supplement history yet.")}</p>
        ) : (
          <div className="mt-2 space-y-3">
            {groupedHistory.map(([name, periods]) => (
              <article key={name} className="rounded-xl border border-slate-700 bg-slate-900/50 p-3">
                <h5 className="text-sm font-semibold text-slate-100">{name}</h5>
                <div className="mt-2 space-y-1.5">
                  {periods.map((period) => (
                    <div key={period.id} className="rounded-lg border border-slate-700/70 bg-slate-800/40 px-2.5 py-2 text-xs text-slate-200">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {formatDate(period.startDate)} → {period.endDate ? formatDate(period.endDate) : tr("nu", "now")}
                        </span>
                        <span className="font-medium text-slate-100">
                          {period.dose || tr("geen dosis", "no dose")} · {supplementFrequencyLabel(period.frequency, language)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {unknownReports.length > 0 ? (
        <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
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
                  {tr("Open in All Reports", "Open in All Reports")}
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
