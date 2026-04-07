import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { trLocale } from "../i18n";
import {
  canonicalizeCompound,
  COMPOUND_OPTIONS,
  INJECTION_FREQUENCY_OPTIONS,
  normalizeInjectionFrequency,
  protocolDosePerAdministrationToWeeklyDose,
  protocolWeeklyDoseInputToPerAdministrationDose
} from "../protocolStandards";
import { PROTOCOL_ROUTE_OPTIONS } from "../protocolUtils";
import { AppLanguage, CompoundEntry } from "../types";
import { ProtocolDraft } from "./protocolEditorModel";

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

const syncDraftItems = (draft: ProtocolDraft, compounds: CompoundEntry[]): ProtocolDraft => ({
  ...draft,
  compounds,
  items: compounds
});

interface ProtocolEditorProps {
  value: ProtocolDraft;
  language: AppLanguage;
  onChange: (next: ProtocolDraft) => void;
}

type DoseEditingField = "per_administration" | "weekly";
const COMPOUND_ROW_GRID_CLASS = "grid gap-2 md:grid-cols-[minmax(180px,1fr)_140px_140px_180px_120px_44px]";

const ProtocolEditor = ({ value, language, onChange }: ProtocolEditorProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  const [compoundNameInput, setCompoundNameInput] = useState("");
  const [compoundDoseInput, setCompoundDoseInput] = useState("");
  const [compoundDoseWeeklyInput, setCompoundDoseWeeklyInput] = useState("");
  const [compoundFrequencyInput, setCompoundFrequencyInput] = useState("unknown");
  const [compoundRouteInput, setCompoundRouteInput] = useState("");
  const [compoundDoseLastEdited, setCompoundDoseLastEdited] = useState<DoseEditingField>("per_administration");
  const [rowDoseLastEdited, setRowDoseLastEdited] = useState<Record<number, DoseEditingField>>({});
  const [showCompoundSuggestions, setShowCompoundSuggestions] = useState(false);

  const compoundSuggestions = useMemo(() => buildSuggestions(compoundNameInput, COMPOUND_OPTIONS), [compoundNameInput]);
  const searchQuery = compoundNameInput.trim();
  const shouldShowSuggestionMenu = showCompoundSuggestions && searchQuery.length >= AUTOCOMPLETE_MIN_CHARS;
  const hasMatchingSuggestions = compoundSuggestions.length > 0;
  const isKnownFrequency = (frequency: string): boolean => normalizeInjectionFrequency(frequency) !== "unknown";

  const handleAddPerAdministrationDoseChange = (nextValue: string) => {
    setCompoundDoseInput(nextValue);
    setCompoundDoseLastEdited("per_administration");
    const normalizedFrequency = normalizeInjectionFrequency(compoundFrequencyInput);
    if (!isKnownFrequency(normalizedFrequency)) {
      setCompoundDoseWeeklyInput("");
      return;
    }
    const weeklyDose = protocolDosePerAdministrationToWeeklyDose(nextValue, normalizedFrequency);
    if (weeklyDose) {
      setCompoundDoseWeeklyInput(weeklyDose);
    }
  };

  const handleAddWeeklyDoseChange = (nextValue: string) => {
    setCompoundDoseWeeklyInput(nextValue);
    setCompoundDoseLastEdited("weekly");
    const normalizedFrequency = normalizeInjectionFrequency(compoundFrequencyInput);
    if (!isKnownFrequency(normalizedFrequency)) {
      setCompoundDoseInput("");
      return;
    }
    const perAdministrationDose = protocolWeeklyDoseInputToPerAdministrationDose(nextValue, normalizedFrequency);
    if (perAdministrationDose) {
      setCompoundDoseInput(perAdministrationDose);
    }
  };

  const handleAddFrequencyChange = (nextFrequencyValue: string) => {
    const normalizedFrequency = normalizeInjectionFrequency(nextFrequencyValue);
    setCompoundFrequencyInput(normalizedFrequency);
    if (!isKnownFrequency(normalizedFrequency)) {
      return;
    }
    if (compoundDoseLastEdited === "weekly") {
      const perAdministrationDose = protocolWeeklyDoseInputToPerAdministrationDose(
        compoundDoseWeeklyInput,
        normalizedFrequency
      );
      if (perAdministrationDose) {
        setCompoundDoseInput(perAdministrationDose);
      }
      return;
    }
    const weeklyDose = protocolDosePerAdministrationToWeeklyDose(compoundDoseInput, normalizedFrequency);
    if (weeklyDose) {
      setCompoundDoseWeeklyInput(weeklyDose);
    }
  };

  const addCompound = () => {
    const name = canonicalizeCompound(compoundNameInput);
    if (!name) {
      return;
    }
    const normalizedFrequency = normalizeInjectionFrequency(compoundFrequencyInput);
    let perAdministrationDose = compoundDoseInput.trim();
    let weeklyDose = compoundDoseWeeklyInput.trim();

    if (isKnownFrequency(normalizedFrequency)) {
      if (compoundDoseLastEdited === "weekly") {
        const convertedPerAdministrationDose = protocolWeeklyDoseInputToPerAdministrationDose(weeklyDose, normalizedFrequency);
        if (convertedPerAdministrationDose) {
          perAdministrationDose = convertedPerAdministrationDose;
        }
      } else {
        const convertedWeeklyDose = protocolDosePerAdministrationToWeeklyDose(perAdministrationDose, normalizedFrequency);
        if (convertedWeeklyDose) {
          weeklyDose = convertedWeeklyDose;
        }
      }
    }

    const nextCompounds = [
      ...(value.compounds.length > 0 ? value.compounds : value.items),
      {
        name,
        dose: perAdministrationDose,
        doseMg: weeklyDose,
        frequency: normalizedFrequency,
        route: compoundRouteInput.trim()
      }
    ];
    onChange(syncDraftItems(value, nextCompounds));

    setCompoundNameInput("");
    setCompoundDoseInput("");
    setCompoundDoseWeeklyInput("");
    setCompoundFrequencyInput("unknown");
    setCompoundRouteInput("");
    setCompoundDoseLastEdited("per_administration");
    setShowCompoundSuggestions(false);
  };

  const updateCompound = (index: number, patch: Partial<CompoundEntry>) => {
    const base = value.compounds.length > 0 ? value.compounds : value.items;
    const nextCompounds = base.map((compound, compoundIndex) =>
      compoundIndex === index
        ? {
            ...compound,
            ...patch,
            dose: patch.dose ?? patch.doseMg ?? compound.dose ?? compound.doseMg,
            doseMg: patch.doseMg ?? patch.dose ?? compound.doseMg ?? compound.dose
          }
        : compound
    );
    onChange(syncDraftItems(value, nextCompounds));
  };

  const removeCompound = (index: number) => {
    const base = value.compounds.length > 0 ? value.compounds : value.items;
    setRowDoseLastEdited((current) => {
      const shifted = Object.entries(current).reduce<Record<number, DoseEditingField>>((acc, [key, field]) => {
        const rowIndex = Number(key);
        if (rowIndex < index) {
          acc[rowIndex] = field;
        } else if (rowIndex > index) {
          acc[rowIndex - 1] = field;
        }
        return acc;
      }, {});
      return shifted;
    });
    onChange(syncDraftItems(value, base.filter((_, compoundIndex) => compoundIndex !== index)));
  };

  const applyCompoundName = (nextName: string) => {
    setCompoundNameInput(nextName);
    setShowCompoundSuggestions(false);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
        <label className="block text-xs uppercase tracking-wide text-slate-400">
          {tr("Protocolnaam", "Protocol name")}
          <input
            value={value.name}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
            className="review-context-input mt-1 w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            placeholder={tr("Bijv. TRT Cruise 125mg", "e.g. TRT Cruise 125mg")}
          />
        </label>
        <label className="block text-xs uppercase tracking-wide text-slate-400">
          {tr("Ingangsdatum", "Effective from")}
          <input
            type="date"
            value={value.effectiveFrom}
            onChange={(event) => onChange({ ...value, effectiveFrom: event.target.value })}
            className="review-context-input mt-1 w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
          />
        </label>
      </div>

      <div className="review-context-card rounded-xl border border-slate-700 bg-slate-900/40 p-3">
        <label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">{tr("Compounds", "Compounds")}</label>

        <div className="space-y-2">
          <div className="relative">
            <input
              value={compoundNameInput}
              onChange={(event) => {
                setCompoundNameInput(event.target.value);
                setShowCompoundSuggestions(true);
              }}
              onFocus={() => setShowCompoundSuggestions(true)}
              onBlur={() => window.setTimeout(() => setShowCompoundSuggestions(false), 120)}
              className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
              placeholder={tr("Zoek of typ compound", "Search or type compound")}
            />
            {shouldShowSuggestionMenu && hasMatchingSuggestions ? (
              <div className="review-suggestion-menu absolute left-0 right-0 top-[calc(100%+6px)] z-20 rounded-md">
                {compoundSuggestions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="review-suggestion-item block w-full px-3 py-2 text-left text-sm"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applyCompoundName(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : null}
            {shouldShowSuggestionMenu && !hasMatchingSuggestions ? (
              <div className="review-suggestion-menu absolute left-0 right-0 top-[calc(100%+6px)] z-20 rounded-md px-3 py-2 text-sm text-slate-400">
                {tr("Geen compound match gevonden", "No matching compound found")}
              </div>
            ) : null}
          </div>
          {!shouldShowSuggestionMenu ? (
            <p className="text-[11px] text-slate-400">
              {tr("Type minimaal 2 letters om gericht te zoeken.", "Type at least 2 letters to search precisely.")}
            </p>
          ) : null}

          <div className={COMPOUND_ROW_GRID_CLASS}>
            <input
              value={compoundDoseInput}
              onChange={(event) => handleAddPerAdministrationDoseChange(event.target.value)}
              className="review-context-input min-w-0 w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
              placeholder={tr("2 mg", "2 mg")}
            />
            <input
              value={compoundDoseWeeklyInput}
              onChange={(event) => handleAddWeeklyDoseChange(event.target.value)}
              className="review-context-input min-w-0 w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
              placeholder={tr("125 mg", "125 mg")}
            />
            <select
              value={compoundFrequencyInput}
              onChange={(event) => handleAddFrequencyChange(event.target.value)}
              className="review-context-input min-w-0 w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            >
              {INJECTION_FREQUENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {tr(option.label.nl, option.label.en)}
                </option>
              ))}
            </select>
            <select
              value={compoundRouteInput}
              onChange={(event) => setCompoundRouteInput(event.target.value)}
              className="review-context-input min-w-0 w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">{tr("Route: niet ingevuld", "Route: not set")}</option>
              {PROTOCOL_ROUTE_OPTIONS.filter((option) => option !== "").map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200"
              onClick={addCompound}
            >
              <Plus className="h-4 w-4" /> {tr("Toevoegen", "Add")}
            </button>
          </div>
        </div>

        <p className="mt-2 text-[11px] text-slate-400">{tr("Suggesties verschijnen vanaf 2 letters.", "Suggestions appear after 2 letters.")}</p>
        <p className="mt-1 text-[11px] text-slate-400">
          {tr(
            "Je kunt per toediening of per week invullen.",
            "You can enter per administration or per week."
          )}
        </p>

        <div className="mt-2 hidden gap-2 px-1 text-[10px] font-medium uppercase tracking-wide text-slate-400 md:grid md:grid-cols-[minmax(180px,1fr)_140px_140px_180px_120px_44px]">
          <span>{tr("Naam", "Name")}</span>
          <span>{tr("Per toediening", "Per administration")}</span>
          <span>{tr("Weekdosis", "Weekly dose")}</span>
          <span>{tr("Frequentie", "Frequency")}</span>
          <span>{tr("Route", "Route")}</span>
          <span aria-hidden="true" />
        </div>

        <div className="space-y-2">
          {(value.compounds.length > 0 ? value.compounds : value.items).length === 0 ? (
            <span className="text-xs text-slate-400">{tr("Nog geen compounds toegevoegd.", "No compounds added yet.")}</span>
          ) : (
            (value.compounds.length > 0 ? value.compounds : value.items).map((compound, index) => {
              const normalizedFrequency = normalizeInjectionFrequency(compound.frequency);
              const perAdministrationDose = compound.dose || "";
              const weeklyDose = compound.doseMg || "";
              const rowDoseSource = rowDoseLastEdited[index] ?? "weekly";
              return (
              <div key={`compound-row-${index}`} className={COMPOUND_ROW_GRID_CLASS}>
                <input
                  value={compound.name}
                  onChange={(event) => updateCompound(index, { name: event.target.value })}
                  onBlur={(event) => updateCompound(index, { name: canonicalizeCompound(event.target.value) })}
                  className="review-context-input min-w-0 w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                />
                <input
                  value={perAdministrationDose}
                  onChange={(event) => {
                    const nextDose = event.target.value;
                    setRowDoseLastEdited((current) => ({ ...current, [index]: "per_administration" }));
                    const patch: Partial<CompoundEntry> = { dose: nextDose };
                    if (isKnownFrequency(normalizedFrequency)) {
                      const nextWeeklyDose = protocolDosePerAdministrationToWeeklyDose(nextDose, normalizedFrequency);
                      if (nextWeeklyDose) {
                        patch.doseMg = nextWeeklyDose;
                      }
                    } else {
                      patch.doseMg = "";
                    }
                    updateCompound(index, patch);
                  }}
                  className="review-context-input min-w-0 w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                  placeholder={tr("2 mg", "2 mg")}
                />
                <input
                  value={weeklyDose}
                  onChange={(event) => {
                    const nextWeeklyDose = event.target.value;
                    setRowDoseLastEdited((current) => ({ ...current, [index]: "weekly" }));
                    const patch: Partial<CompoundEntry> = { doseMg: nextWeeklyDose };
                    if (isKnownFrequency(normalizedFrequency)) {
                      const nextPerAdministrationDose = protocolWeeklyDoseInputToPerAdministrationDose(
                        nextWeeklyDose,
                        normalizedFrequency
                      );
                      if (nextPerAdministrationDose) {
                        patch.dose = nextPerAdministrationDose;
                      }
                    } else {
                      patch.dose = "";
                    }
                    updateCompound(index, patch);
                  }}
                  className="review-context-input min-w-0 w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                  placeholder={tr("125 mg", "125 mg")}
                />
                <select
                  value={normalizedFrequency}
                  onChange={(event) => {
                    const nextFrequency = normalizeInjectionFrequency(event.target.value);
                    const patch: Partial<CompoundEntry> = { frequency: nextFrequency };
                    if (isKnownFrequency(nextFrequency)) {
                      if (rowDoseSource === "weekly") {
                        const nextPerAdministrationDose = protocolWeeklyDoseInputToPerAdministrationDose(weeklyDose, nextFrequency);
                        if (nextPerAdministrationDose) {
                          patch.dose = nextPerAdministrationDose;
                        }
                      } else {
                        const nextWeeklyDose = protocolDosePerAdministrationToWeeklyDose(perAdministrationDose, nextFrequency);
                        if (nextWeeklyDose) {
                          patch.doseMg = nextWeeklyDose;
                        }
                      }
                    }
                    updateCompound(index, patch);
                  }}
                  className="review-context-input min-w-0 w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                >
                  {INJECTION_FREQUENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {tr(option.label.nl, option.label.en)}
                    </option>
                  ))}
                </select>
                <select
                  value={compound.route}
                  onChange={(event) => updateCompound(index, { route: event.target.value })}
                  className="review-context-input min-w-0 w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="">{tr("Niet ingevuld", "Not set")}</option>
                  {PROTOCOL_ROUTE_OPTIONS.filter((option) => option !== "").map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/10 px-0 py-2 text-sm text-rose-200"
                  onClick={() => removeCompound(index)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
            })
          )}
        </div>
      </div>

      <label className="block text-xs uppercase tracking-wide text-slate-400">
        {tr("Notities", "Notes")}
        <textarea
          value={value.notes}
          onChange={(event) => onChange({ ...value, notes: event.target.value })}
          className="review-context-input mt-1 h-[84px] w-full resize-none rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
          placeholder={tr("Protocol notities", "Protocol notes")}
        />
      </label>
    </div>
  );
};

export default ProtocolEditor;
