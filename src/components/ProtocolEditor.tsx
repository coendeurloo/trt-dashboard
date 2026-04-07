import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { trLocale } from "../i18n";
import {
  canonicalizeCompound,
  COMPOUND_OPTIONS,
  INJECTION_FREQUENCY_OPTIONS,
  normalizeInjectionFrequency,
  protocolDosePerAdministrationToWeeklyEquivalent
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

const ProtocolEditor = ({ value, language, onChange }: ProtocolEditorProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  const [compoundNameInput, setCompoundNameInput] = useState("");
  const [compoundDoseInput, setCompoundDoseInput] = useState("");
  const [compoundFrequencyInput, setCompoundFrequencyInput] = useState("unknown");
  const [compoundRouteInput, setCompoundRouteInput] = useState("");
  const [showCompoundSuggestions, setShowCompoundSuggestions] = useState(false);

  const compoundSuggestions = useMemo(() => buildSuggestions(compoundNameInput, COMPOUND_OPTIONS), [compoundNameInput]);
  const searchQuery = compoundNameInput.trim();
  const shouldShowSuggestionMenu = showCompoundSuggestions && searchQuery.length >= AUTOCOMPLETE_MIN_CHARS;
  const hasMatchingSuggestions = compoundSuggestions.length > 0;
  const newEntryWeeklyEquivalent = protocolDosePerAdministrationToWeeklyEquivalent(compoundDoseInput, compoundFrequencyInput);

  const addCompound = () => {
    const name = canonicalizeCompound(compoundNameInput);
    if (!name) {
      return;
    }

    const nextCompounds = [
      ...(value.compounds.length > 0 ? value.compounds : value.items),
      {
        name,
        dose: compoundDoseInput.trim(),
        doseMg: compoundDoseInput.trim(),
        frequency: normalizeInjectionFrequency(compoundFrequencyInput),
        route: compoundRouteInput.trim()
      }
    ];
    onChange(syncDraftItems(value, nextCompounds));

    setCompoundNameInput("");
    setCompoundDoseInput("");
    setCompoundFrequencyInput("unknown");
    setCompoundRouteInput("");
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

          <div className="grid gap-2 md:grid-cols-[minmax(260px,1fr)_170px_200px_140px_auto]">
            <input
              value={compoundDoseInput}
              onChange={(event) => setCompoundDoseInput(event.target.value)}
              className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
              placeholder={tr(
                "Dosis per toediening (bv. 2 mg)",
                "Dose per administration (e.g. 2 mg)"
              )}
            />
            <select
              value={compoundFrequencyInput}
              onChange={(event) => setCompoundFrequencyInput(event.target.value)}
              className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
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
              className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
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

          {newEntryWeeklyEquivalent ? (
            <p className="text-[11px] text-slate-400">
              {tr("Week-equivalent", "Weekly equivalent")}: {newEntryWeeklyEquivalent}
            </p>
          ) : null}
        </div>

        <p className="mt-2 text-[11px] text-slate-400">{tr("Suggesties verschijnen vanaf 2 letters.", "Suggestions appear after 2 letters.")}</p>
        <p className="mt-1 text-[11px] text-slate-400">
          {tr(
            "Vul dosis per toediening in. Het week-equivalent wordt automatisch berekend op basis van frequentie.",
            "Enter dose per administration. The weekly equivalent is calculated automatically from frequency."
          )}
        </p>

        <div className="mt-2 space-y-2">
          {(value.compounds.length > 0 ? value.compounds : value.items).length === 0 ? (
            <span className="text-xs text-slate-400">{tr("Nog geen compounds toegevoegd.", "No compounds added yet.")}</span>
          ) : (
            (value.compounds.length > 0 ? value.compounds : value.items).map((compound, index) => {
              const normalizedFrequency = normalizeInjectionFrequency(compound.frequency);
              const editableDose = compound.dose || compound.doseMg || "";
              const weeklyEquivalent = protocolDosePerAdministrationToWeeklyEquivalent(editableDose, normalizedFrequency);
              return (
              <div key={`compound-row-${index}`} className="grid gap-2 md:grid-cols-[minmax(260px,1fr)_170px_200px_140px_auto]">
                <input
                  value={compound.name}
                  onChange={(event) => updateCompound(index, { name: event.target.value })}
                  onBlur={(event) => updateCompound(index, { name: canonicalizeCompound(event.target.value) })}
                  className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                />
                <div className="space-y-1">
                  <input
                    value={editableDose}
                    onChange={(event) => updateCompound(index, { dose: event.target.value, doseMg: event.target.value })}
                    className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                    placeholder={tr("Dosis per toediening", "Dose per administration")}
                  />
                  {weeklyEquivalent ? (
                    <p className="text-[11px] text-slate-400">
                      {tr("Week-equivalent", "Weekly equivalent")}: {weeklyEquivalent}
                    </p>
                  ) : null}
                </div>
                <select
                  value={normalizedFrequency}
                  onChange={(event) => updateCompound(index, { frequency: event.target.value })}
                  className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
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
                  className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
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
                  className="inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
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
