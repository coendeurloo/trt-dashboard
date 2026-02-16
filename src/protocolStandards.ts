import { AppLanguage } from "./types";

interface CompoundCatalogEntry {
  name: string;
  aliases?: string[];
}

export interface InjectionFrequencyOption {
  value: string;
  dosesPerWeek: number | null;
  label: {
    nl: string;
    en: string;
  };
  aliases?: string[];
}

const normalizeKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeFrequencyText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/,/g, ".")
    .replace(/\s+/g, " ")
    .trim();

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const COMPOUND_CATALOG: CompoundCatalogEntry[] = [
  { name: "Testosterone" },
  { name: "Testosterone Enanthate", aliases: ["Test E", "Enanthate"] },
  { name: "Testosterone Cypionate", aliases: ["Test C", "Cypionate"] },
  { name: "Testosterone Propionate", aliases: ["Test P", "Propionate"] },
  { name: "Testosterone Undecanoate", aliases: ["Nebido", "TU"] },
  { name: "Testosterone Suspension", aliases: ["Suspension"] },
  { name: "Testosterone Phenylpropionate", aliases: ["TPP"] },
  { name: "Sustanon 250", aliases: ["Sustanon", "Sus"] },
  { name: "Omnadren 250", aliases: ["Omnadren"] },
  { name: "Boldenone Undecylenate", aliases: ["Equipoise", "EQ"] },
  { name: "Boldenone Cypionate", aliases: ["Bold C"] },
  { name: "Nandrolone Decanoate", aliases: ["Deca", "Deca Durabolin"] },
  { name: "Nandrolone Phenylpropionate", aliases: ["NPP"] },
  { name: "Trenbolone Acetate", aliases: ["Tren A", "Tren"] },
  { name: "Trenbolone Enanthate", aliases: ["Tren E"] },
  { name: "Trenbolone Hexahydrobenzylcarbonate", aliases: ["Parabolan", "Tren Hex"] },
  { name: "Drostanolone Propionate", aliases: ["Masteron P", "Mast P"] },
  { name: "Drostanolone Enanthate", aliases: ["Masteron E", "Mast E"] },
  { name: "Methenolone Enanthate", aliases: ["Primobolan", "Primo E"] },
  { name: "Methenolone Acetate", aliases: ["Primo A"] },
  { name: "Stanozolol", aliases: ["Winstrol", "Winny"] },
  { name: "Oxandrolone", aliases: ["Anavar", "Var"] },
  { name: "Oxymetholone", aliases: ["Anadrol", "A50"] },
  { name: "Methandrostenolone", aliases: ["Dianabol", "Dbol"] },
  { name: "Chlorodehydromethyltestosterone", aliases: ["Turinabol", "Tbol"] },
  { name: "Methasterone", aliases: ["Superdrol", "M-Drol"] },
  { name: "Fluoxymesterone", aliases: ["Halotestin", "Halo"] },
  { name: "Mesterolone", aliases: ["Proviron"] },
  { name: "Clostebol", aliases: ["4-chloro testosterone"] },
  { name: "Danazol" },
  { name: "Mibolerone", aliases: ["Cheque Drops"] },
  { name: "Norethandrolone" },
  { name: "Dehydroepiandrosterone", aliases: ["DHEA"] },
  { name: "Pregnenolone" },
  { name: "Human Chorionic Gonadotropin", aliases: ["hCG", "HCG"] },
  { name: "Human Menopausal Gonadotropin", aliases: ["hMG", "HMG", "Menopur"] },
  { name: "Clomiphene Citrate", aliases: ["Clomid", "Clomiphene"] },
  { name: "Enclomiphene Citrate", aliases: ["Enclomiphene"] },
  { name: "Tamoxifen Citrate", aliases: ["Tamoxifen", "Nolvadex"] },
  { name: "Raloxifene", aliases: ["Evista"] },
  { name: "Toremifene Citrate", aliases: ["Fareston"] },
  { name: "Anastrozole", aliases: ["Arimidex", "Adex"] },
  { name: "Exemestane", aliases: ["Aromasin"] },
  { name: "Letrozole", aliases: ["Femara"] },
  { name: "Cabergoline", aliases: ["Caber"] },
  { name: "Pramipexole", aliases: ["Prami"] },
  { name: "Finasteride" },
  { name: "Dutasteride" },
  { name: "Human Growth Hormone", aliases: ["HGH", "Somatropin", "GH"] },
  { name: "Insulin", aliases: ["Humalog", "Novorapid", "Lantus"] },
  { name: "IGF-1 LR3", aliases: ["IGF-1"] },
  { name: "CJC-1295" },
  { name: "Ipamorelin" },
  { name: "Tesamorelin" },
  { name: "BPC-157" },
  { name: "TB-500", aliases: ["Thymosin Beta-4"] },
  { name: "MK-677", aliases: ["Ibutamoren"] },
  { name: "MK-2866", aliases: ["Ostarine"] },
  { name: "LGD-4033", aliases: ["Ligandrol"] },
  { name: "RAD-140", aliases: ["Testolone"] },
  { name: "S-23" },
  { name: "S-4", aliases: ["Andarine"] },
  { name: "YK-11" },
  { name: "ACP-105" },
  { name: "AC-262,536" },
  { name: "GW-501516", aliases: ["Cardarine"] },
  { name: "SR9009", aliases: ["Stenabolic"] },
  { name: "SR9011" },
  { name: "Clenbuterol", aliases: ["Clen"] },
  { name: "Albuterol", aliases: ["Salbutamol"] },
  { name: "T3", aliases: ["Liothyronine", "Cytomel"] },
  { name: "T4", aliases: ["Levothyroxine"] }
];

export const COMPOUND_OPTIONS: string[] = COMPOUND_CATALOG.map((entry) => entry.name);

const compoundAliasMap = COMPOUND_CATALOG.reduce((map, entry) => {
  const aliases = [entry.name, ...(entry.aliases ?? [])];
  aliases.forEach((alias) => {
    const key = normalizeKey(alias);
    if (key) {
      map.set(key, entry.name);
    }
  });
  return map;
}, new Map<string, string>());

const compoundMatchers = Array.from(compoundAliasMap.entries())
  .sort((left, right) => right[0].length - left[0].length)
  .map(([alias, name]) => ({
    name,
    pattern: new RegExp(`(^|\\s)${escapeRegex(alias).replace(/\s+/g, "\\s+")}(\\s|$)`, "i")
  }));

export const canonicalizeCompound = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const normalized = normalizeKey(trimmed);
  return compoundAliasMap.get(normalized) ?? trimmed;
};

export const inferCompoundFromProtocol = (protocol: string): string => {
  const normalized = normalizeKey(protocol);
  if (!normalized) {
    return "";
  }
  const match = compoundMatchers.find((entry) => entry.pattern.test(normalized));
  return match?.name ?? "";
};

export const INJECTION_FREQUENCY_OPTIONS: InjectionFrequencyOption[] = [
  {
    value: "unknown",
    dosesPerWeek: null,
    label: { nl: "Onbekend / niet ingevuld", en: "Unknown / not set" },
    aliases: ["unknown", "onbekend", "none", "niet ingevuld"]
  },
  {
    value: "1x_week",
    dosesPerWeek: 1,
    label: { nl: "1x per week", en: "1x per week" },
    aliases: ["1x/week", "1x per week", "1 per week", "once weekly", "1 keer per week", "weekly", "q7d"]
  },
  {
    value: "2x_week",
    dosesPerWeek: 2,
    label: { nl: "2x per week", en: "2x per week" },
    aliases: ["2x/week", "2x per week", "2 per week", "twice weekly", "2 keer per week"]
  },
  {
    value: "3x_week",
    dosesPerWeek: 3,
    label: { nl: "3x per week", en: "3x per week" },
    aliases: ["3x/week", "3x per week", "3 per week", "three times weekly", "3 keer per week"]
  },
  {
    value: "eod",
    dosesPerWeek: 3.5,
    label: { nl: "E.O.D. (om de dag, 3.5x/week)", en: "E.O.D. (every other day, 3.5x/week)" },
    aliases: ["eod", "every other day", "om de dag", "qod", "3.5x/week", "3,5x/week", "3.5 times per week", "3,5 keer per week"]
  },
  {
    value: "4x_week",
    dosesPerWeek: 4,
    label: { nl: "4x per week", en: "4x per week" },
    aliases: ["4x/week", "4x per week", "4 per week", "4 keer per week"]
  },
  {
    value: "5x_week",
    dosesPerWeek: 5,
    label: { nl: "5x per week", en: "5x per week" },
    aliases: ["5x/week", "5x per week", "5 per week", "5 keer per week"]
  },
  {
    value: "daily",
    dosesPerWeek: 7,
    label: { nl: "Dagelijks (7x/week)", en: "Daily (7x/week)" },
    aliases: ["daily", "ed", "every day", "dagelijks", "iedere dag", "7x/week", "7 keer per week"]
  },
  {
    value: "every_3_days",
    dosesPerWeek: 7 / 3,
    label: { nl: "Elke 3 dagen (~2.33x/week)", en: "Every 3 days (~2.33x/week)" },
    aliases: ["every 3 days", "elke 3 dagen", "q3d"]
  },
  {
    value: "every_5_days",
    dosesPerWeek: 7 / 5,
    label: { nl: "Elke 5 dagen (~1.4x/week)", en: "Every 5 days (~1.4x/week)" },
    aliases: ["every 5 days", "elke 5 dagen", "q5d"]
  },
  {
    value: "every_7_days",
    dosesPerWeek: 1,
    label: { nl: "Elke 7 dagen (1x/week)", en: "Every 7 days (1x/week)" },
    aliases: ["every 7 days", "elke 7 dagen", "q7d"]
  },
  {
    value: "every_10_days",
    dosesPerWeek: 0.7,
    label: { nl: "Elke 10 dagen (~0.7x/week)", en: "Every 10 days (~0.7x/week)" },
    aliases: ["every 10 days", "elke 10 dagen", "q10d"]
  }
];

const frequencyByValue = new Map(INJECTION_FREQUENCY_OPTIONS.map((option) => [option.value, option]));

const frequencyAliasMap = INJECTION_FREQUENCY_OPTIONS.reduce((map, option) => {
  const aliases = [option.value, option.label.en, option.label.nl, ...(option.aliases ?? [])];
  aliases.forEach((alias) => {
    const key = normalizeKey(alias);
    if (key) {
      map.set(key, option.value);
    }
  });
  return map;
}, new Map<string, string>());

const parseFrequencyPerWeekFromFreeText = (value: string): number | null => {
  const normalized = normalizeFrequencyText(value);
  if (!normalized) {
    return null;
  }

  if (/\b(daily|dagelijks|every day|ed)\b/.test(normalized)) {
    return 7;
  }
  if (/\b(eod|every other day|om de dag|qod)\b/.test(normalized)) {
    return 3.5;
  }

  const xPerWeek = normalized.match(/(\d+(?:\.\d+)?)\s*x\s*(?:per|\/)?\s*week/);
  if (xPerWeek) {
    const parsed = Number(xPerWeek[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const timesWeekly = normalized.match(/(\d+(?:\.\d+)?)\s*(?:times|keer)\s*(?:per|\/)?\s*week/);
  if (timesWeekly) {
    const parsed = Number(timesWeekly[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const everyXDays = normalized.match(/every\s*(\d+(?:\.\d+)?)\s*days?/);
  if (everyXDays) {
    const days = Number(everyXDays[1]);
    return days > 0 ? 7 / days : null;
  }

  const elkeXDagen = normalized.match(/elke\s*(\d+(?:\.\d+)?)\s*dagen?/);
  if (elkeXDagen) {
    const days = Number(elkeXDagen[1]);
    return days > 0 ? 7 / days : null;
  }

  return null;
};

const closestFrequencyValue = (dosesPerWeek: number): string | null => {
  let bestValue: string | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  INJECTION_FREQUENCY_OPTIONS.forEach((option) => {
    if (option.dosesPerWeek === null) {
      return;
    }
    const delta = Math.abs(option.dosesPerWeek - dosesPerWeek);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestValue = option.value;
    }
  });

  return bestDelta <= 0.12 ? bestValue : null;
};

export const normalizeInjectionFrequency = (value: string): string => {
  const normalized = normalizeKey(value);
  if (!normalized) {
    return "unknown";
  }
  return frequencyAliasMap.get(normalized) ?? "unknown";
};

export const inferInjectionFrequencyFromProtocol = (protocol: string): string => {
  const parsed = parseFrequencyPerWeekFromFreeText(protocol);
  if (parsed === null) {
    return "unknown";
  }
  return closestFrequencyValue(parsed) ?? "unknown";
};

export const frequencyPerWeekFromSelectionOrProtocol = (
  injectionFrequency: string,
  protocolFallback: string
): number | null => {
  const normalized = normalizeInjectionFrequency(injectionFrequency);
  const fromSelection = frequencyByValue.get(normalized)?.dosesPerWeek ?? null;
  if (fromSelection !== null) {
    return fromSelection;
  }
  const parsed = parseFrequencyPerWeekFromFreeText(injectionFrequency);
  if (parsed !== null) {
    return parsed;
  }
  return parseFrequencyPerWeekFromFreeText(protocolFallback);
};

export const injectionFrequencyLabel = (value: string, language: AppLanguage): string => {
  const normalized = normalizeInjectionFrequency(value);
  const option = frequencyByValue.get(normalized);
  if (!option) {
    return language === "nl" ? "Onbekend" : "Unknown";
  }
  return language === "nl" ? option.label.nl : option.label.en;
};
