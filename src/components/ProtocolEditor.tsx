import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { trLocale } from "../i18n";
import {
  canonicalizeCompound,
  canonicalizeSupplement,
  COMPOUND_OPTIONS,
  INJECTION_FREQUENCY_OPTIONS,
  normalizeInjectionFrequency,
  normalizeSupplementFrequency,
  normalizeSupplementEntries,
  SUPPLEMENT_FREQUENCY_OPTIONS,
  SUPPLEMENT_OPTIONS
} from "../protocolStandards";
import { PROTOCOL_ROUTE_OPTIONS } from "../protocolUtils";
import { AppLanguage, CompoundEntry, SupplementEntry } from "../types";

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

export interface ProtocolDraft {
  name: string;
  compounds: CompoundEntry[];
  supplements: SupplementEntry[];
  notes: string;
}

export const blankProtocolDraft = (): ProtocolDraft => ({
  name: "",
  compounds: [],
  supplements: [],
  notes: ""
});

interface ProtocolEditorProps {
  value: ProtocolDraft;
  language: AppLanguage;
  onChange: (next: ProtocolDraft) => void;
}

const ProtocolEditor = ({ value, language, onChange }: ProtocolEditorProps) => {
  const isNl = language === "nl";
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  const [compoundNameInput, setCompoundNameInput] = useState("");
  const [compoundDoseInput, setCompoundDoseInput] = useState("");
  const [compoundFrequencyInput, setCompoundFrequencyInput] = useState("unknown");
  const [compoundRouteInput, setCompoundRouteInput] = useState("");
  const [showCompoundSuggestions, setShowCompoundSuggestions] = useState(false);

  const [supplementNameInput, setSupplementNameInput] = useState("");
  const [supplementDoseInput, setSupplementDoseInput] = useState("");
  const [supplementFrequencyInput, setSupplementFrequencyInput] = useState("unknown");
  const [showSupplementSuggestions, setShowSupplementSuggestions] = useState(false);

  const compoundSuggestions = useMemo(() => buildSuggestions(compoundNameInput, COMPOUND_OPTIONS), [compoundNameInput]);
  const supplementSuggestions = useMemo(() => buildSuggestions(supplementNameInput, SUPPLEMENT_OPTIONS), [supplementNameInput]);

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

  const addSupplement = () => {
    const name = canonicalizeSupplement(supplementNameInput);
    if (!name) {
      return;
    }

    const normalizedSupplements = normalizeSupplementEntries(
      [
        ...value.supplements,
        {
          name,
          dose: supplementDoseInput.trim(),
          frequency: normalizeSupplementFrequency(supplementFrequencyInput)
        }
      ],
      ""
    );

    onChange({
      ...value,
      supplements: normalizedSupplements
    });

    setSupplementNameInput("");
    setSupplementDoseInput("");
    setSupplementFrequencyInput("unknown");
    setShowSupplementSuggestions(false);
  };

  const updateSupplement = (index: number, patch: Partial<SupplementEntry>) => {
    const normalizedSupplements = normalizeSupplementEntries(
      value.supplements.map((supplement, supplementIndex) =>
        supplementIndex === index
          ? {
              ...supplement,
              ...patch
            }
          : supplement
      ),
      ""
    );

    onChange({
      ...value,
      supplements: normalizedSupplements
    });
  };

  const removeSupplement = (index: number) => {
    onChange({
      ...value,
      supplements: value.supplements.filter((_, supplementIndex) => supplementIndex !== index)
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
              className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
              placeholder={tr("Dosis (bv. 125 mg/week)", "Dose (e.g. 125 mg/week)")}
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

        <div className="mt-2 space-y-2">
          {value.compounds.length === 0 ? (
            <span className="text-xs text-slate-400">{tr("Nog geen compounds toegevoegd.", "No compounds added yet.")}</span>
          ) : (
            value.compounds.map((compound, index) => (
              <div key={`${compound.name}-${index}`} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_170px_200px_140px_auto]">
                <input
                  value={compound.name}
                  onChange={(event) => updateCompound(index, { name: canonicalizeCompound(event.target.value) })}
                  className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                />
                <input
                  value={compound.doseMg}
                  onChange={(event) => updateCompound(index, { doseMg: event.target.value })}
                  className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
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
      </div>

      <div className="review-context-card rounded-xl border border-slate-700 bg-slate-900/40 p-3">
        <label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">
          {tr("Supplementen (met dosis + frequentie)", "Supplements (with dose + frequency)")}
        </label>

        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_170px_190px_auto]">
          <div className="relative">
            <input
              value={supplementNameInput}
              onChange={(event) => {
                setSupplementNameInput(event.target.value);
                setShowSupplementSuggestions(true);
              }}
              onFocus={() => setShowSupplementSuggestions(true)}
              onBlur={() => window.setTimeout(() => setShowSupplementSuggestions(false), 120)}
              className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
              placeholder={tr("Zoek of typ supplement", "Search or type supplement")}
            />
            {showSupplementSuggestions && supplementSuggestions.length > 0 ? (
              <div className="review-suggestion-menu absolute left-0 right-0 top-[calc(100%+6px)] z-20 rounded-md">
                {supplementSuggestions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="review-suggestion-item block w-full px-3 py-2 text-left text-sm"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setSupplementNameInput(option);
                      setShowSupplementSuggestions(false);
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <input
            value={supplementDoseInput}
            onChange={(event) => setSupplementDoseInput(event.target.value)}
            className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
            placeholder={tr("Dosis", "Dose")}
          />
          <select
            value={supplementFrequencyInput}
            onChange={(event) => setSupplementFrequencyInput(event.target.value)}
            className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
          >
            {SUPPLEMENT_FREQUENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {tr(option.label.nl, option.label.en)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
            onClick={addSupplement}
          >
            <Plus className="h-4 w-4" /> {tr("Toevoegen", "Add")}
          </button>
        </div>

        <p className="mt-2 text-[11px] text-slate-400">{tr("Suggesties verschijnen vanaf 2 letters.", "Suggestions appear after 2 letters.")}</p>

        <div className="mt-2 space-y-2">
          {value.supplements.length === 0 ? (
            <span className="text-xs text-slate-400">{tr("Nog geen supplementen toegevoegd.", "No supplements added yet.")}</span>
          ) : (
            value.supplements.map((supplement, index) => (
              <div key={`${supplement.name}-${index}`} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_170px_190px_auto]">
                <input
                  value={supplement.name}
                  onChange={(event) => updateSupplement(index, { name: canonicalizeSupplement(event.target.value) })}
                  className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                />
                <input
                  value={supplement.dose}
                  onChange={(event) => updateSupplement(index, { dose: event.target.value })}
                  className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                />
                <select
                  value={normalizeSupplementFrequency(supplement.frequency)}
                  onChange={(event) => updateSupplement(index, { frequency: event.target.value })}
                  className="review-context-input w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                >
                  {SUPPLEMENT_FREQUENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {tr(option.label.nl, option.label.en)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
                  onClick={() => removeSupplement(index)}
                >
                  {tr("Verwijderen", "Remove")}
                </button>
              </div>
            ))
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
