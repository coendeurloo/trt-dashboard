import { AppLanguage, SupplementEntry } from "./types";
import { trLocale } from "./i18n";

interface CompoundCatalogEntry {
  name: string;
  aliases?: string[];
}

interface SupplementCatalogEntry {
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

export interface SupplementFrequencyOption {
  value: string;
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

const dedupeCaseInsensitive = (values: string[]): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];
  values.forEach((value) => {
    const normalized = normalizeKey(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    output.push(value);
  });
  return output;
};

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
  { name: "Oxandrolone", aliases: ["Anavar", "Var", "Oxandralone"] },
  { name: "Oxymetholone", aliases: ["Anadrol", "A50"] },
  { name: "Methandrostenolone", aliases: ["Dianabol", "Dbol"] },
  { name: "Chlorodehydromethyltestosterone", aliases: ["Turinabol", "Tbol"] },
  { name: "Methasterone", aliases: ["Superdrol", "M-Drol"] },
  { name: "Fluoxymesterone", aliases: ["Halotestin", "Halo"] },
  { name: "Mesterolone", aliases: ["Proviron"] },
  { name: "Clostebol", aliases: ["4-Chloro Testosterone"] },
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

const SUPPLEMENT_CATALOG: SupplementCatalogEntry[] = [
  { name: "Vitamin D3", aliases: ["Vitamin D", "D3", "Cholecalciferol"] },
  { name: "Vitamin K2", aliases: ["MK-7", "Menaquinone"] },
  { name: "Vitamin C", aliases: ["Ascorbic Acid"] },
  { name: "Vitamin B12", aliases: ["Methylcobalamin", "Cobalamin"] },
  { name: "Vitamin B Complex", aliases: ["B-Complex"] },
  { name: "Folate", aliases: ["Methylfolate", "Folic Acid"] },
  { name: "Niacin", aliases: ["Vitamin B3"] },
  { name: "Magnesium Glycinate", aliases: ["Magnesium"] },
  { name: "Magnesium Citrate" },
  { name: "Magnesium Taurate" },
  { name: "Zinc", aliases: ["Zinc Picolinate"] },
  { name: "Copper" },
  { name: "Selenium" },
  { name: "Iodine" },
  { name: "Boron" },
  { name: "Potassium" },
  { name: "Omega-3", aliases: ["Fish Oil", "EPA DHA"] },
  { name: "Krill Oil" },
  { name: "CoQ10", aliases: ["Ubiquinol", "Coenzyme Q10"] },
  { name: "NAC", aliases: ["N-Acetylcysteine"] },
  { name: "TUDCA" },
  { name: "Milk Thistle", aliases: ["Silymarin"] },
  { name: "Berberine" },
  { name: "Citrus Bergamot", aliases: ["Bergamot"] },
  { name: "Red Yeast Rice" },
  { name: "Psyllium Husk", aliases: ["Psyllium"] },
  { name: "Plant Sterols" },
  { name: "Curcumin", aliases: ["Turmeric Extract"] },
  { name: "Resveratrol" },
  { name: "Quercetin" },
  { name: "Glycine" },
  { name: "Taurine" },
  { name: "L-Tyrosine", aliases: ["Tyrosine"] },
  { name: "L-Theanine", aliases: ["Theanine"] },
  { name: "L-Citrulline", aliases: ["Citrulline Malate"] },
  { name: "L-Arginine", aliases: ["Arginine"] },
  { name: "L-Carnitine", aliases: ["Acetyl-L-Carnitine", "ALCAR"] },
  { name: "Beta-Alanine" },
  { name: "Betaine", aliases: ["TMG"] },
  { name: "Creatine Monohydrate", aliases: ["Creatine"] },
  { name: "Electrolytes" },
  { name: "Collagen Peptides", aliases: ["Collagen"] },
  { name: "Whey Protein", aliases: ["Protein Powder"] },
  { name: "Casein Protein", aliases: ["Casein"] },
  { name: "EAAs", aliases: ["Essential Amino Acids"] },
  { name: "BCAAs" },
  { name: "Glutamine", aliases: ["L-Glutamine"] },
  { name: "Probiotics", aliases: ["Probiotic"] },
  { name: "Digestive Enzymes" },
  { name: "P5P", aliases: ["Vitamin B6 P5P"] },
  { name: "Ashwagandha", aliases: ["KSM-66", "Sensoril"] },
  { name: "Rhodiola Rosea", aliases: ["Rhodiola"] },
  { name: "Tongkat Ali", aliases: ["Eurycoma Longifolia"] },
  { name: "Fadogia Agrestis", aliases: ["Fadogia"] },
  { name: "Shilajit" },
  { name: "Maca Root", aliases: ["Maca"] },
  { name: "Fenugreek" },
  { name: "Saw Palmetto" },
  { name: "Pygeum" },
  { name: "DIM", aliases: ["Diindolylmethane"] },
  { name: "Calcium D-Glucarate" },
  { name: "Indole-3-Carbinol", aliases: ["I3C"] },
  { name: "DHEA" },
  { name: "Pregnenolone" },
  { name: "Melatonin" },
  { name: "5-HTP" },
  { name: "GABA" },
  { name: "Inositol" },
  { name: "Apigenin" },
  { name: "Lemon Balm" },
  { name: "Valerian Root" },
  { name: "KSM-66 Ashwagandha", aliases: ["KSM-66"] },
  { name: "Beetroot Powder", aliases: ["Beetroot"] },
  { name: "Garlic Extract", aliases: ["Aged Garlic"] },
  { name: "Olive Leaf Extract" },
  { name: "Hawthorn Berry" },
  { name: "Cinnamon Extract", aliases: ["Ceylon Cinnamon"] },
  { name: "Chromium Picolinate", aliases: ["Chromium"] },
  { name: "Alpha-Lipoic Acid", aliases: ["ALA"] },
  { name: "R-Alpha-Lipoic Acid", aliases: ["R-ALA"] },
  { name: "Myo-Inositol" },
  { name: "D-Chiro Inositol" },
  { name: "PQQ", aliases: ["Pyrroloquinoline Quinone"] },
  { name: "Astragalus" },
  { name: "Cordyceps" },
  { name: "Lion's Mane", aliases: ["Hericium"] },
  { name: "Reishi" },
  { name: "Chaga" },
  { name: "Turkey Tail" },
  { name: "EGCG", aliases: ["Green Tea Extract"] },
  { name: "Boswellia" },
  { name: "HMB", aliases: ["Beta-Hydroxy Beta-Methylbutyrate"] },
  { name: "Ornithine" },
  { name: "Cissus Quadrangularis", aliases: ["Cissus"] },
  { name: "Glucosamine" },
  { name: "Chondroitin" },
  { name: "MSM", aliases: ["Methylsulfonylmethane"] },
  { name: "Hydration Salts", aliases: ["ORS"] }
];

const COMPOUND_POPULAR_ALIAS_WHITELIST = new Set([
  "Anavar",
  "Anadrol",
  "Dianabol",
  "Turinabol",
  "Superdrol",
  "Winstrol",
  "Primobolan",
  "Masteron",
  "Deca",
  "Tren",
  "Equipoise",
  "Proviron",
  "HGH",
  "hCG",
  "Clomid",
  "Nolvadex",
  "Arimidex",
  "Aromasin"
]);

const compoundDisplayLabel = (entry: CompoundCatalogEntry): string => {
  const aliases = entry.aliases ?? [];
  const preferredAlias = aliases.find((alias) => COMPOUND_POPULAR_ALIAS_WHITELIST.has(alias)) ?? aliases[0] ?? "";
  return preferredAlias ? `${entry.name} (${preferredAlias})` : entry.name;
};

export const COMPOUND_OPTIONS: string[] = COMPOUND_CATALOG.map((entry) => compoundDisplayLabel(entry));
export const SUPPLEMENT_OPTIONS: string[] = SUPPLEMENT_CATALOG.map((entry) => entry.name);

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

const supplementAliasMap = SUPPLEMENT_CATALOG.reduce((map, entry) => {
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

const parseSupplementChunk = (chunk: string): SupplementEntry | null => {
  const trimmed = chunk.trim();
  if (!trimmed) {
    return null;
  }

  const parenMatch = trimmed.match(/^(.+?)\s*\((.+)\)$/);
  if (parenMatch) {
    const name = canonicalizeSupplement(parenMatch[1] ?? "");
    if (!name) {
      return null;
    }
    const parsed = extractSupplementDoseAndFrequency(String(parenMatch[2] ?? ""));
    return {
      name,
      dose: parsed.dose,
      frequency: parsed.frequency
    };
  }

  const dashMatch = trimmed.match(/^(.+?)\s*[-:]\s*(.+)$/);
  if (dashMatch) {
    const name = canonicalizeSupplement(dashMatch[1] ?? "");
    if (!name) {
      return null;
    }
    const parsed = extractSupplementDoseAndFrequency(String(dashMatch[2] ?? ""));
    return {
      name,
      dose: parsed.dose,
      frequency: parsed.frequency
    };
  }

  const doseStartMatch = trimmed.match(/\s\d/);
  const firstDigitIndex = doseStartMatch?.index !== undefined ? doseStartMatch.index + 1 : -1;
  if (firstDigitIndex > 0) {
    const name = canonicalizeSupplement(trimmed.slice(0, firstDigitIndex).replace(/[-:]+$/, "").trim());
    if (!name) {
      return null;
    }
    const parsed = extractSupplementDoseAndFrequency(trimmed.slice(firstDigitIndex).trim());
    return {
      name,
      dose: parsed.dose,
      frequency: parsed.frequency
    };
  }

  const atSplit = trimmed.match(/^(.+?)\s+[@]\s+(.+)$/);
  if (atSplit) {
    const name = canonicalizeSupplement(atSplit[1] ?? "");
    if (!name) {
      return null;
    }
    const frequency = normalizeSupplementFrequency(String(atSplit[2] ?? ""));
    return {
      name,
      dose: "",
      frequency
    };
  }

  const name = canonicalizeSupplement(trimmed);
  if (!name) {
    return null;
  }
  return {
    name,
    dose: "",
    frequency: "unknown"
  };
};

export const canonicalizeCompound = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const withoutHint = trimmed.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const normalized = normalizeKey(withoutHint || trimmed);
  return compoundAliasMap.get(normalized) ?? (withoutHint || trimmed);
};

export const canonicalizeCompoundList = (values: string[]): string[] =>
  dedupeCaseInsensitive(values.map((value) => canonicalizeCompound(value)).filter((value) => value.length > 0));

export const inferCompoundFromProtocol = (protocol: string): string => {
  const normalized = normalizeKey(protocol);
  if (!normalized) {
    return "";
  }
  const match = compoundMatchers.find((entry) => entry.pattern.test(normalized));
  return match?.name ?? "";
};

export const normalizeCompounds = (options: {
  compounds?: string[];
  compound?: string;
  protocolFallback?: string;
}): { compounds: string[]; compound: string } => {
  const fromArray = Array.isArray(options.compounds) ? options.compounds : [];
  const fromSingle = String(options.compound ?? "").trim();
  const fromProtocol = inferCompoundFromProtocol(String(options.protocolFallback ?? ""));
  const compounds = canonicalizeCompoundList([...fromArray, fromSingle, fromProtocol]);
  return {
    compounds,
    compound: compounds[0] ?? ""
  };
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

export const SUPPLEMENT_FREQUENCY_OPTIONS: SupplementFrequencyOption[] = [
  {
    value: "unknown",
    label: { nl: "Onbekend / niet ingevuld", en: "Unknown / not set" },
    aliases: ["unknown", "onbekend", "not set", "none"]
  },
  {
    value: "daily",
    label: { nl: "Dagelijks", en: "Daily" },
    aliases: ["daily", "dagelijks", "every day", "ed", "q.d."]
  },
  {
    value: "twice_daily",
    label: { nl: "2x per dag", en: "2x per day" },
    aliases: ["twice daily", "2x/day", "2x per day", "2x per dag", "bid", "b.i.d."]
  },
  {
    value: "three_times_daily",
    label: { nl: "3x per dag", en: "3x per day" },
    aliases: ["three times daily", "3x/day", "3x per day", "3x per dag", "tid", "t.i.d."]
  },
  {
    value: "with_meals",
    label: { nl: "Bij maaltijden", en: "With meals" },
    aliases: ["with meals", "bij maaltijden", "with food", "met eten"]
  },
  {
    value: "before_bed",
    label: { nl: "Voor het slapen", en: "Before bed" },
    aliases: ["before bed", "voor het slapen", "nightly", "at night"]
  },
  {
    value: "training_days",
    label: { nl: "Alleen trainingsdagen", en: "Training days only" },
    aliases: ["training days", "trainingsdagen", "on workout days"]
  },
  {
    value: "as_needed",
    label: { nl: "Zo nodig", en: "As needed" },
    aliases: ["as needed", "zo nodig", "prn", "p.r.n."]
  },
  {
    value: "1x_week",
    label: { nl: "1x per week", en: "1x per week" },
    aliases: ["1x/week", "1x per week", "once weekly", "weekly", "q7d"]
  },
  {
    value: "2x_week",
    label: { nl: "2x per week", en: "2x per week" },
    aliases: ["2x/week", "2x per week", "twice weekly", "2 per week"]
  },
  {
    value: "3x_week",
    label: { nl: "3x per week", en: "3x per week" },
    aliases: ["3x/week", "3x per week", "three times weekly", "3 per week"]
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

const supplementFrequencyByValue = new Map(SUPPLEMENT_FREQUENCY_OPTIONS.map((option) => [option.value, option]));

const supplementFrequencyAliasMap = SUPPLEMENT_FREQUENCY_OPTIONS.reduce((map, option) => {
  const aliases = [option.value, option.label.en, option.label.nl, ...(option.aliases ?? [])];
  aliases.forEach((alias) => {
    const key = normalizeKey(alias);
    if (key) {
      map.set(key, option.value);
    }
  });
  return map;
}, new Map<string, string>());

export const normalizeSupplementFrequency = (value: string): string => {
  const normalized = normalizeKey(value);
  if (!normalized) {
    return "unknown";
  }
  return supplementFrequencyAliasMap.get(normalized) ?? value.trim();
};

const extractSupplementDoseAndFrequency = (value: string): { dose: string; frequency: string } => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { dose: "", frequency: "unknown" };
  }

  const explicitSplit = trimmed.match(/^(.+?)\s*[@;|]\s*(.+)$/);
  if (explicitSplit) {
    return {
      dose: String(explicitSplit[1] ?? "").trim(),
      frequency: normalizeSupplementFrequency(String(explicitSplit[2] ?? ""))
    };
  }

  const candidateMatches = Array.from(supplementFrequencyAliasMap.entries())
    .sort((left, right) => right[0].length - left[0].length)
    .map(([alias, normalizedValue]) => ({
      normalizedValue,
      pattern: new RegExp(`(?:^|\\s)${escapeRegex(alias).replace(/\s+/g, "\\s+")}$`, "i")
    }));

  for (const candidate of candidateMatches) {
    const matched = trimmed.match(candidate.pattern);
    if (!matched || matched.index === undefined) {
      continue;
    }
    const dose = trimmed.slice(0, matched.index).trim().replace(/[,@;|]+$/, "").trim();
    if (!dose) {
      return { dose: "", frequency: candidate.normalizedValue };
    }
    return { dose, frequency: candidate.normalizedValue };
  }

  return { dose: trimmed, frequency: "unknown" };
};

export const supplementFrequencyLabel = (value: string, language: AppLanguage): string => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const normalized = normalizeSupplementFrequency(value);
  const option = supplementFrequencyByValue.get(normalized);
  if (option) {
    return tr(option.label.nl, option.label.en);
  }
  return value.trim() || tr("Onbekend", "Unknown");
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
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const normalized = normalizeInjectionFrequency(value);
  const option = frequencyByValue.get(normalized);
  if (!option) {
    return tr("Onbekend", "Unknown");
  }
  return tr(option.label.nl, option.label.en);
};

export const canonicalizeSupplement = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const normalized = normalizeKey(trimmed);
  return supplementAliasMap.get(normalized) ?? trimmed;
};

const normalizeSingleSupplementEntry = (entry: Partial<SupplementEntry>): SupplementEntry | null => {
  const name = canonicalizeSupplement(String(entry.name ?? ""));
  const dose = String(entry.dose ?? "").trim();
  const frequency = normalizeSupplementFrequency(String(entry.frequency ?? "unknown"));
  if (!name) {
    return null;
  }
  return {
    name,
    dose,
    frequency
  };
};

const parseSupplementEntriesFromText = (supplements: string): SupplementEntry[] =>
  dedupeCaseInsensitive(
    supplements
      .split(/[\n,;]+/)
      .map((chunk) => parseSupplementChunk(chunk))
      .filter((entry): entry is SupplementEntry => entry !== null)
      .map((entry) => `${entry.name}|${entry.dose}|${entry.frequency}`)
  ).map((encoded) => {
    const [name = "", dose = "", frequency = "unknown"] = encoded.split("|");
    return { name, dose, frequency };
  });

export const normalizeSupplementEntries = (
  supplementEntries: unknown,
  supplementsFallback = ""
): SupplementEntry[] => {
  const sourceEntries = Array.isArray(supplementEntries)
    ? supplementEntries
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }
          return normalizeSingleSupplementEntry(entry as Partial<SupplementEntry>);
        })
        .filter((entry): entry is SupplementEntry => entry !== null)
    : [];

  if (sourceEntries.length > 0) {
    return dedupeCaseInsensitive(sourceEntries.map((entry) => `${entry.name}|${entry.dose}|${entry.frequency}`)).map((encoded) => {
      const [name = "", dose = "", frequency = "unknown"] = encoded.split("|");
      return { name, dose, frequency };
    });
  }

  return parseSupplementEntriesFromText(supplementsFallback);
};

export const supplementEntriesToText = (supplementEntries: SupplementEntry[]): string =>
  supplementEntries
    .map((entry) => {
      const name = canonicalizeSupplement(entry.name);
      const dose = entry.dose.trim();
      const frequency = normalizeSupplementFrequency(entry.frequency);
      if (!name) {
        return "";
      }
      const base = dose ? `${name} ${dose}` : name;
      if (frequency === "unknown") {
        return base;
      }
      const option = supplementFrequencyByValue.get(frequency);
      const frequencyText = option?.label.en ?? entry.frequency.trim();
      return frequencyText ? `${base} @ ${frequencyText}` : base;
    })
    .filter((value) => value.length > 0)
    .join(", ");

export const normalizeSupplementContext = (
  supplementEntriesInput: unknown,
  supplementsFallback: string
): { supplementEntries: SupplementEntry[]; supplements: string } => {
  const supplementEntries = normalizeSupplementEntries(supplementEntriesInput, supplementsFallback);
  const supplements = supplementEntriesToText(supplementEntries);
  return {
    supplementEntries,
    supplements
  };
};
