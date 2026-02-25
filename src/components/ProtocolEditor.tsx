import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { trLocale } from "../i18n";
import {
  canonicalizeCompound,
  COMPOUND_OPTIONS,
  INJECTION_FREQUENCY_OPTIONS,
  normalizeInjectionFrequency
} from "../protocolStandards";
import { PROTOCOL_ROUTE_OPTIONS } from "../protocolUtils";
import { AppLanguage, CompoundEntry } from "../types";

const AUTOCOMPLETE_MIN_CHARS = 2;
const AUTOCOMPLETE_MAX_OPTIONS = 8;
const COMPOUND_DATALIST_ID = "protocol-compound-options";

const formatWeeklyDoseValue = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

const normalizeDoseToWeekly = (rawValue: string): string => {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return "";
  }
  const dailyMatch = trimmed.match(
    /^(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)?\s*(?:\/\s*)?(?:day|d|daily|ed|per day|per dag|dagelijks)$/i
  );
  if (!dailyMatch) {
    return trimmed;
  }
  const numeric = Number((dailyMatch[1] ?? "").replace(",", "."));
  if (!Number.isFinite(numeric)) {
    return trimmed;
  }
  const unit = (dailyMatch[2] ?? "").trim();
  const weekly = formatWeeklyDoseValue(numeric * 7);
  return unit ? `${weekly} ${unit}/week` : `${weekly}/week`;
};

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

export interface ProtocolDraft {
  name: string;
  compounds: CompoundEntry[];
  notes: string;
}

export const blankProtocolDraft = (): ProtocolDraft => ({
  name: "",
  compounds: [],
  notes: ""
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

  const addCompound = () => {
    const name = canonicalizeCompound(compoundNameInput);
    if (!name) {
      return;
    }

    onChange({
      ...value,
      compounds: [
        ...value.compounds,
        {
          name,
          doseMg: compoundDoseInput.trim(),
          frequency: normalizeInjectionFrequency(compoundFrequencyInput),
          route: compoundRouteInput.trim()
        }
      ]
    });

    setCompoundNameInput("");
    setCompoundDoseInput("");
    setCompoundFrequencyInput("unknown");
    setCompoundRouteInput("");
    setShowCompoundSuggestions(false);
  };

  const updateCompound = (index: number, patch: Partial<CompoundEntry>) => {
    onChange({
      ...value,
      compounds: value.compounds.map((compound, compoundIndex) =>
        compoundIndex === index
          ? {
              ...compound,
              ...patch
            }
          : compound
      )
    });
  };

  const removeCompound = (index: number) => {
    onChange({
      ...value,
      compounds: value.compounds.filter((_, compoundIndex) => compoundIndex !== index)
    });
  };

  return (
    <div className="space-y-3">
      <label className="block text-xs uppercase tracking-wide text-slate-400">
        {tr("Protocolnaam", "Protocol name")}
        <input
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          className="review-context-input mt-1 w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
          placeholder={tr("Bijv. TRT Cruise 125mg", "e.g. TRT Cruise 125mg")}
        />
      </label>

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
              list={COMPOUND_DATALIST_ID}
              onFocus={() => setShowCompoundSuggestions(true)}
              onBlur={() => window.setTimeout(() => setShowCompoundSuggestions(false), 120)}
              className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
              placeholder={tr("Zoek of typ compound", "Search or type compound")}
            />
            {showCompoundSuggestions && compoundSuggestions.length > 0 ? (
              <div className="review-suggestion-menu absolute left-0 right-0 top-[calc(100%+6px)] z-20 rounded-md">
                {compoundSuggestions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="review-suggestion-item block w-full px-3 py-2 text-left text-sm"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setCompoundNameInput(option);
                      setShowCompoundSuggestions(false);
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_170px_200px_140px_auto]">
            <input
              value={compoundDoseInput}
              onChange={(event) => setCompoundDoseInput(event.target.value)}
              onBlur={(event) => setCompoundDoseInput(normalizeDoseToWeekly(event.target.value))}
              className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
              placeholder={tr("Totale weekdosis (bv. 280 mg/week of 40 mg/day)", "Total weekly dose (e.g. 280 mg/week or 40 mg/day)")}
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
        </div>

        <p className="mt-2 text-[11px] text-slate-400">{tr("Suggesties verschijnen vanaf 2 letters.", "Suggestions appear after 2 letters.")}</p>
        <p className="mt-1 text-[11px] text-slate-400">
          {tr(
            "Dosis is altijd de totale weekdosis. Voorbeeld: 40 mg/dag = 280 mg/week.",
            "Dose is always the total weekly dose. Example: 40 mg/day = 280 mg/week."
          )}
        </p>

        <div className="mt-2 space-y-2">
          {value.compounds.length === 0 ? (
            <span className="text-xs text-slate-400">{tr("Nog geen compounds toegevoegd.", "No compounds added yet.")}</span>
          ) : (
            value.compounds.map((compound, index) => (
              <div key={`compound-row-${index}`} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_170px_200px_140px_auto]">
                <input
                  value={compound.name}
                  list={COMPOUND_DATALIST_ID}
                  onChange={(event) => updateCompound(index, { name: event.target.value })}
                  onBlur={(event) => updateCompound(index, { name: canonicalizeCompound(event.target.value) })}
                  className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                />
                <input
                  value={compound.doseMg}
                  onChange={(event) => updateCompound(index, { doseMg: event.target.value })}
                  onBlur={(event) => updateCompound(index, { doseMg: normalizeDoseToWeekly(event.target.value) })}
                  className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                  placeholder={tr("Totale weekdosis", "Total weekly dose")}
                />
                <select
                  value={normalizeInjectionFrequency(compound.frequency)}
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
            ))
          )}
        </div>
        <datalist id={COMPOUND_DATALIST_ID}>
          {COMPOUND_OPTIONS.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
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
