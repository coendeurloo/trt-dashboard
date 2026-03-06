export type RoutingLanguageCode = "eng" | "nld" | "deu" | "fra" | "spa" | "ita" | "unknown";

export type ParserTemplateId =
  | "lifelabs"
  | "london"
  | "latvia_indexed"
  | "genova"
  | "zrt"
  | "warde"
  | "mijngezondheid";

export interface ScoredLanguageCandidate {
  language: RoutingLanguageCode;
  score: number;
}

export interface ScoredTemplateCandidate {
  template: ParserTemplateId;
  score: number;
}

export interface OcrLanguagePlan {
  primaryLang: string;
  fallbackLang: string | null;
  languageAttempts: string[];
  maxPasses: number;
  reason: string;
}

export interface DocumentSignals {
  fileName: string;
  sampleText: string;
  textLength: number;
  textItems: number;
  pageCount: number;
  nonWhitespaceChars: number;
  lineCount: number;
  markerAnchorHits: number;
  tokenHits: Record<Exclude<RoutingLanguageCode, "unknown">, number>;
  sectionHits: Record<Exclude<RoutingLanguageCode, "unknown">, number>;
  dateKeywordHits: Record<Exclude<RoutingLanguageCode, "unknown">, number>;
  templateKeywordHits: Record<ParserTemplateId, number>;
  hasLifeLabsHeader: boolean;
  hasMijnGezondheidHeader: boolean;
}

export interface BuildRoutingDecisionInput {
  fileName: string;
  text: string;
  textItems: number;
  pageCount: number;
  nonWhitespaceChars: number;
  lineCount: number;
  previewOcrText?: string;
}

export interface RoutingDecision {
  primaryLanguage: RoutingLanguageCode;
  languageCandidates: ScoredLanguageCandidate[];
  templateCandidates: ScoredTemplateCandidate[];
  selectedParsers: ParserTemplateId[];
  ocrPlan: OcrLanguagePlan;
  reason: string;
  signals: DocumentSignals;
}

interface LanguagePack {
  code: Exclude<RoutingLanguageCode, "unknown">;
  markerTokens: string[];
  sectionKeywords: string[];
  dateKeywords: string[];
  templateAffinity: Partial<Record<ParserTemplateId, number>>;
}

const MAX_SIGNAL_TEXT_CHARS = 12_000;

const LANGUAGE_PACKS: LanguagePack[] = [
  {
    code: "eng",
    markerTokens: ["hematocrit", "hemoglobin", "platelets", "cholesterol", "creatinine", "testosterone", "estradiol"],
    sectionKeywords: ["hematology", "clinical chemistry", "reference range", "reported", "result", "units"],
    dateKeywords: ["date collected", "collected", "received", "reported", "sample draw", "collection date"],
    templateAffinity: {
      lifelabs: 0.12,
      london: 0.1,
      genova: 0.08,
      zrt: 0.08,
      warde: 0.08
    }
  },
  {
    code: "nld",
    markerTokens: ["hematocriet", "hemoglobine", "leukocyten", "thrombocyten", "ureum", "creatinine", "testosteron"],
    sectionKeywords: ["hematologie", "klinische chemie", "endocrinologie", "referentie", "uitslag", "bloedbeeld"],
    dateKeywords: ["afname", "ontvangst", "rapport", "datum afdruk", "monster afname", "materiaal ontvangst"],
    templateAffinity: {
      mijngezondheid: 0.2
    }
  },
  {
    code: "deu",
    markerTokens: ["haematokrit", "haemoglobin", "leukozyten", "thrombozyten", "kreatinin", "cholesterin"],
    sectionKeywords: ["haematologie", "klinische chemie", "referenzbereich", "befund", "ergebnis"],
    dateKeywords: ["abnahme", "eingang", "bericht", "datum"],
    templateAffinity: {}
  },
  {
    code: "fra",
    markerTokens: ["hematocrite", "hemoglobine", "leucocytes", "plaquettes", "creatinine", "cholesterol"],
    sectionKeywords: ["hematologie", "chimie clinique", "valeur de reference", "resultat"],
    dateKeywords: ["preleve", "recu", "date de prelevement", "date de reception", "date du rapport"],
    templateAffinity: {}
  },
  {
    code: "spa",
    markerTokens: ["hematocrito", "hemoglobina", "leucocitos", "plaquetas", "creatinina", "colesterol"],
    sectionKeywords: ["hematologia", "quimica clinica", "rango de referencia", "resultado"],
    dateKeywords: ["muestra", "recibido", "fecha de toma", "fecha de informe"],
    templateAffinity: {}
  },
  {
    code: "ita",
    markerTokens: ["ematocrito", "emoglobina", "leucociti", "piastrine", "creatinina", "colesterolo"],
    sectionKeywords: ["ematologia", "chimica clinica", "intervallo di riferimento", "risultato"],
    dateKeywords: ["prelievo", "ricevuto", "data prelievo", "data referto"],
    templateAffinity: {}
  }
];

const TEMPLATE_DETECTION_RULES: Record<ParserTemplateId, RegExp[]> = {
  lifelabs: [
    /\bTest\s+Flag\s+Result\s+Reference\s+Range\s*-\s*Units\b/i,
    /\bLifeLabs\b/i,
    /\bFINAL RESULTS\b/i
  ],
  london: [
    /\bresults for your doctor\b/i,
    /\blondonmedicallaboratory\.com\b/i
  ],
  latvia_indexed: [
    /\be\.\s*gulbja laboratorija\b/i,
    /\brequest complete\b/i,
    /\btest title\b/i,
    /\b\d{1,3}\/\d{2,3}\s+A?\s+/i
  ],
  genova: [
    /\bgenova diagnostics\b/i,
    /\bmale hormonal health\b/i,
    /\bmhh1\.\b/i
  ],
  zrt: [
    /\bcomprehensive male profile ii\b/i,
    /\bzrt laboratory\b/i
  ],
  warde: [
    /\btestosterone,\s*free,\s*bioavailable and total\b/i,
    /\bwarde medical\b/i
  ],
  mijngezondheid: [
    /\bUw metingen\b/i,
    /\bNormale waarde:\b/i,
    /\bUitslagen uit het verleden\b/i
  ]
};

const LANGUAGE_BY_TEMPLATE_HINT: Partial<Record<ParserTemplateId, RoutingLanguageCode>> = {
  lifelabs: "eng",
  london: "eng",
  genova: "eng",
  zrt: "eng",
  warde: "eng",
  mijngezondheid: "nld"
};

const cleanWhitespace = (value: string): string =>
  value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeKeyword = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const countKeywordHits = (haystack: string, keywords: string[], cap: number): number => {
  let count = 0;
  for (const keyword of keywords) {
    const normalized = normalizeKeyword(keyword);
    if (!normalized) {
      continue;
    }
    const pattern = new RegExp(`\\b${normalized.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (pattern.test(haystack)) {
      count += 1;
      if (count >= cap) {
        return cap;
      }
    }
  }
  return count;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const roundScore = (value: number): number => Math.round(value * 1000) / 1000;

export const buildDocumentSignals = (input: BuildRoutingDecisionInput): DocumentSignals => {
  const combinedSource = `${input.text}\n${input.previewOcrText ?? ""}`.slice(0, MAX_SIGNAL_TEXT_CHARS);
  const sampleText = cleanWhitespace(combinedSource);
  const normalizedSample = normalizeKeyword(sampleText);
  const markerAnchorHits = Array.from(
    sampleText.matchAll(
      /\b(?:testosterone|estradiol|shbg|hematocrit|hematocriet|hemoglobin|hemoglobine|cholesterol|creatinine|psa|tsh)\b/gi
    )
  ).length;

  const tokenHits = {
    eng: 0,
    nld: 0,
    deu: 0,
    fra: 0,
    spa: 0,
    ita: 0
  } satisfies Record<Exclude<RoutingLanguageCode, "unknown">, number>;

  const sectionHits = {
    eng: 0,
    nld: 0,
    deu: 0,
    fra: 0,
    spa: 0,
    ita: 0
  } satisfies Record<Exclude<RoutingLanguageCode, "unknown">, number>;

  const dateKeywordHits = {
    eng: 0,
    nld: 0,
    deu: 0,
    fra: 0,
    spa: 0,
    ita: 0
  } satisfies Record<Exclude<RoutingLanguageCode, "unknown">, number>;

  for (const pack of LANGUAGE_PACKS) {
    tokenHits[pack.code] = countKeywordHits(normalizedSample, pack.markerTokens, 8);
    sectionHits[pack.code] = countKeywordHits(normalizedSample, pack.sectionKeywords, 6);
    dateKeywordHits[pack.code] = countKeywordHits(normalizedSample, pack.dateKeywords, 5);
  }

  const templateKeywordHits = {
    lifelabs: 0,
    london: 0,
    latvia_indexed: 0,
    genova: 0,
    zrt: 0,
    warde: 0,
    mijngezondheid: 0
  } satisfies Record<ParserTemplateId, number>;

  (Object.keys(TEMPLATE_DETECTION_RULES) as ParserTemplateId[]).forEach((template) => {
    templateKeywordHits[template] = TEMPLATE_DETECTION_RULES[template].reduce(
      (sum, pattern) => sum + (pattern.test(sampleText) ? 1 : 0),
      0
    );
  });

  const hasLifeLabsHeader = TEMPLATE_DETECTION_RULES.lifelabs[0].test(sampleText);
  const hasMijnGezondheidHeader = /\bUw metingen\b/i.test(sampleText);

  return {
    fileName: input.fileName,
    sampleText,
    textLength: sampleText.length,
    textItems: input.textItems,
    pageCount: input.pageCount,
    nonWhitespaceChars: input.nonWhitespaceChars,
    lineCount: input.lineCount,
    markerAnchorHits,
    tokenHits,
    sectionHits,
    dateKeywordHits,
    templateKeywordHits,
    hasLifeLabsHeader,
    hasMijnGezondheidHeader
  };
};

const scoreLanguages = (signals: DocumentSignals): ScoredLanguageCandidate[] => {
  const templateStrength = Object.entries(signals.templateKeywordHits).reduce(
    (map, [templateId, hitCount]) => {
      map[templateId as ParserTemplateId] = hitCount;
      return map;
    },
    {} as Record<ParserTemplateId, number>
  );

  const candidates = LANGUAGE_PACKS.map((pack) => {
    let rawScore =
      signals.tokenHits[pack.code] * 2.1 +
      signals.sectionHits[pack.code] * 3 +
      signals.dateKeywordHits[pack.code] * 1.4 +
      Math.min(signals.markerAnchorHits, 10) * 0.15;

    Object.entries(pack.templateAffinity).forEach(([template, weight]) => {
      rawScore += (templateStrength[template as ParserTemplateId] ?? 0) * 12 * weight;
    });

    if (pack.code === "eng") {
      rawScore += 1.4;
    }

    return {
      language: pack.code,
      score: roundScore(clamp(rawScore / 12, 0, 1))
    } satisfies ScoredLanguageCandidate;
  }).sort((left, right) => right.score - left.score);

  if (candidates.length === 0) {
    return [{ language: "unknown", score: 0 }];
  }

  const top = candidates[0];
  if (top.score < 0.35) {
    return [
      { language: "eng", score: 0.3 },
      { language: "unknown", score: 0.25 }
    ];
  }

  return [...candidates.slice(0, 3), { language: "unknown", score: roundScore(clamp(1 - top.score, 0.05, 0.4)) }];
};

const scoreTemplates = (signals: DocumentSignals): ScoredTemplateCandidate[] => {
  const normalizedFileName = signals.fileName.toLowerCase();
  const candidates = (Object.keys(TEMPLATE_DETECTION_RULES) as ParserTemplateId[]).map((template) => {
    let score = signals.templateKeywordHits[template] * 24;

    if (template === "lifelabs" && signals.hasLifeLabsHeader) {
      score = Math.max(score, 92);
    }
    if (template === "mijngezondheid" && signals.hasMijnGezondheidHeader) {
      score = Math.max(score, 90);
    }

    if (template === "latvia_indexed" && /\blatvia|riga|lv[\s-]?1006\b/i.test(signals.sampleText)) {
      score += 12;
    }
    if (template === "london" && /\blondon\b/i.test(normalizedFileName)) {
      score += 8;
    }
    if (template === "lifelabs" && /\blifelabs\b/i.test(normalizedFileName)) {
      score += 8;
    }

    return {
      template,
      score: roundScore(clamp(score, 0, 100))
    } satisfies ScoredTemplateCandidate;
  });

  return candidates.sort((left, right) => right.score - left.score);
};

const chooseSelectedParsers = (templates: ScoredTemplateCandidate[]): ParserTemplateId[] => {
  if (templates.length === 0) {
    return [];
  }

  const selected: ParserTemplateId[] = [];
  const top = templates[0];
  if (top.score >= 55) {
    selected.push(top.template);
  }

  const runnerUp = templates[1];
  if (runnerUp && top.score >= 55 && runnerUp.score >= 50 && top.score - runnerUp.score < 10) {
    selected.push(runnerUp.template);
  }

  if (selected.length === 0 && top.score >= 22) {
    selected.push(top.template);
  }

  return Array.from(new Set(selected)).slice(0, 2);
};

const isLanguageTemplateAligned = (language: RoutingLanguageCode, templates: ScoredTemplateCandidate[]): boolean => {
  const strongestTemplate = templates[0];
  if (!strongestTemplate || strongestTemplate.score < 75) {
    return false;
  }
  const hintedLanguage = LANGUAGE_BY_TEMPLATE_HINT[strongestTemplate.template];
  return hintedLanguage === language;
};

const choosePrimaryLanguage = (languages: ScoredLanguageCandidate[]): RoutingLanguageCode => {
  const ranked = languages.filter((item) => item.language !== "unknown");
  if (ranked.length === 0) {
    return "unknown";
  }
  return ranked[0].score >= 0.6 ? ranked[0].language : "unknown";
};

const chooseOcrPlan = (
  primaryLanguage: RoutingLanguageCode,
  languageCandidates: ScoredLanguageCandidate[],
  templateCandidates: ScoredTemplateCandidate[]
): OcrLanguagePlan => {
  const ranked = languageCandidates.filter((item) => item.language !== "unknown");
  const top = ranked[0] ?? { language: "eng" as const, score: 0.3 };
  const runnerUp = ranked.find((item) => item.language !== top.language) ?? null;

  let primaryLang = "eng";
  let reason = "default_english";
  if (primaryLanguage !== "unknown" && primaryLanguage !== "eng") {
    const strongGap = top.score - (runnerUp?.score ?? 0) >= 0.15;
    const templateAligned = isLanguageTemplateAligned(primaryLanguage, templateCandidates);
    if (top.score >= 0.65 && (strongGap || templateAligned)) {
      primaryLang = `eng+${primaryLanguage}`;
      reason = templateAligned ? "template_aligned_dual_language" : "strong_language_signal";
    }
  }

  let fallbackLang: string | null = null;
  if (primaryLang !== "eng") {
    fallbackLang = "eng";
  } else if (runnerUp && runnerUp.language !== "eng" && runnerUp.score >= 0.6) {
    fallbackLang = `eng+${runnerUp.language}`;
  }

  const languageAttempts = Array.from(new Set([primaryLang, fallbackLang].filter(Boolean) as string[])).slice(0, 2);
  return {
    primaryLang,
    fallbackLang: fallbackLang && fallbackLang !== primaryLang ? fallbackLang : null,
    languageAttempts,
    maxPasses: languageAttempts.length,
    reason
  };
};

export const buildRoutingDecision = (input: BuildRoutingDecisionInput): RoutingDecision => {
  const signals = buildDocumentSignals(input);
  const languageCandidates = scoreLanguages(signals);
  const templateCandidates = scoreTemplates(signals);
  const primaryLanguage = choosePrimaryLanguage(languageCandidates);
  const selectedParsers = chooseSelectedParsers(templateCandidates);
  const ocrPlan = chooseOcrPlan(primaryLanguage, languageCandidates, templateCandidates);

  const topTemplate = templateCandidates[0];
  const reason =
    selectedParsers.length > 0 && topTemplate
      ? `template:${topTemplate.template}:${topTemplate.score.toFixed(1)}`
      : `language:${primaryLanguage}:${(languageCandidates[0]?.score ?? 0).toFixed(2)}`;

  return {
    primaryLanguage,
    languageCandidates,
    templateCandidates,
    selectedParsers,
    ocrPlan,
    reason,
    signals
  };
};
