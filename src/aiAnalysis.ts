import { sortReportsChronological } from "./utils";
import {
  AIAnalysisProvider,
  AIConsentDecision,
  AppLanguage,
  LabReport,
  PersonalInfo,
  Protocol,
  SupplementPeriod,
  UnitSystem,
  UserProfile
} from "./types";
import { injectionFrequencyLabel } from "./protocolStandards";
import {
  getProtocolCompoundsText,
  getProtocolDoseMgPerWeek,
  getProtocolFrequencyPerWeek,
  getProtocolInjectionFrequency,
  getReportSupplementsText,
  getReportProtocol
} from "./protocolUtils";
import { convertBySystem } from "./unitConversion";
import {
  DosePrediction,
  MarkerAlert,
  MarkerTrendSummary,
  ProtocolImpactSummary,
  TrtStabilityResult
} from "./analytics";
import { getRelevantBenchmarks } from "./data/studyBenchmarks";
import { sanitizeAnalysisPayloadForAI } from "./privacy/sanitizeForAI";
import type { WellbeingSummary } from "./analysisScope";
import {
  buildPremiumInsightPack,
  buildSupplementActionabilityDecision,
  hasForbiddenSupplementAdviceLanguage,
  PremiumInsightPack,
  PremiumTrendSignal,
  SupplementActionabilityDecision
} from "./analysisPremium";
import { getActiveSupplementsAtDate, sortSupplementPeriods, supplementPeriodsToText } from "./supplementUtils";
import { AnalystMemory } from "./types/analystMemory";
import { coerceAnalystMemory } from "./analystMemory";
import { canonicalizeMarker } from "./unitConversion";

interface ClaudeResponse {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  error?: {
    code?: string;
    message?: string;
  };
}

interface SseStreamParseResult {
  text: string;
  stopReason: string | null;
}

interface AnalyzeLabDataOptions {
  reports: LabReport[];
  protocols: Protocol[];
  supplementTimeline?: SupplementPeriod[];
  personalInfo?: Pick<PersonalInfo, "dateOfBirth" | "heightCm" | "weightKg"> | null;
  unitSystem: UnitSystem;
  profile?: UserProfile;
  memory?: AnalystMemory | null;
  language?: AppLanguage;
  analysisType?: "full" | "latestComparison";
  deepMode?: boolean;
  customQuestion?: string;
  externalAiAllowed?: boolean;
  aiConsent?: Pick<AIConsentDecision, "includeSymptoms" | "includeNotes">;
  providerPreference?: AIAnalysisProvider;
  signal?: AbortSignal;
  onStreamEvent?: (event: { type: "start" | "delta" | "complete"; delta?: string; text?: string }) => void;
  context?: {
    samplingFilter: "all" | "trough" | "peak";
    protocolImpact: ProtocolImpactSummary;
    alerts: MarkerAlert[];
    trendByMarker: Record<string, MarkerTrendSummary>;
    trtStability: TrtStabilityResult;
    dosePredictions: DosePrediction[];
    wellbeingSummary?: WellbeingSummary | null;
  };
}

interface GenerateAnalystMemoryOptions {
  reports: LabReport[];
  protocols: Protocol[];
  supplementTimeline?: SupplementPeriod[];
  unitSystem: UnitSystem;
  profile?: UserProfile;
  currentMemory: AnalystMemory | null;
  analysisResult: string;
  aiConsent?: Pick<AIConsentDecision, "includeSymptoms" | "includeNotes">;
}

export interface AnalyzeLabDataResult {
  text: string;
  provider: AnalysisProvider;
  model: string;
  fallbackUsed: boolean;
  actionsNeeded: boolean;
  actionReasons: string[];
  actionConfidence: "high" | "medium" | "low";
  supplementActionsNeeded: boolean;
  supplementAdviceIncluded: boolean;
  qualityGuardApplied: boolean;
  qualityIssues: string[];
}

interface AnalysisMarkerRow {
  m: string;
  v: number;
  u: string;
  ref: [number | null, number | null];
}

interface AnalysisReportRow {
  date: string;
  ann: {
    dose: number | null;
    compound: string;
    frequency: string;
    frequencyPerWeek: number | null;
    protocol: string;
    supps: string;
    symptoms: string;
    notes: string;
    timing: "unknown" | "trough" | "mid" | "peak";
  };
  markers: AnalysisMarkerRow[];
}

interface LatestComparisonRow {
  marker: string;
  unit: string;
  previousDate: string;
  latestDate: string;
  previousValue: number;
  latestValue: number;
  delta: number;
  percentChange: number | null;
  previousAbnormal: "low" | "high" | "normal" | "unknown";
  latestAbnormal: "low" | "high" | "normal" | "unknown";
}

interface AnalysisActionabilityDecision {
  actionsNeeded: boolean;
  actionReasons: string[];
  actionConfidence: "high" | "medium" | "low";
}

interface AnalysisSupplementChangeRow {
  supplement: string;
  effectiveDate: string;
  from: string;
  to: string;
}

interface AnalysisSupplementContextRow {
  latestReportDate: string | null;
  activeAtLatestTestDate: string;
  activeToday: string;
  recentDoseOrFrequencyChanges: AnalysisSupplementChangeRow[];
}

interface AnalysisPersonalContext {
  ageYears: number | null;
  weightKg: number | null;
  heightCm: number | null;
}

interface AnalysisMarkerPresenceEntry {
  everSeen: boolean;
  latestSeenDate: string | null;
  countReportsSeen: number;
}

const QUESTION_REQUIRED_NARRATIVE_SECTION_KEYS = [
  "direct_answer",
  "why_this_fits_your_data",
  "what_to_watch_next",
  "suggested_next_step"
] as const;
const FULL_REQUIRED_NARRATIVE_SECTION_KEYS = [
  "heres_where_you_stand",
  "whats_driving_these_numbers",
  "what_to_focus_on",
  "next_steps"
] as const;
const COMPARISON_REQUIRED_NARRATIVE_SECTION_KEYS = [
  "what_changed",
  "why_it_moved",
  "what_to_focus_on",
  "next_steps"
] as const;
type NarrativeSectionKey =
  | typeof QUESTION_REQUIRED_NARRATIVE_SECTION_KEYS[number]
  | typeof FULL_REQUIRED_NARRATIVE_SECTION_KEYS[number]
  | typeof COMPARISON_REQUIRED_NARRATIVE_SECTION_KEYS[number]
  | "supplement_tweaks";

const ANALYSIS_MODEL_CANDIDATES = [
  "claude-sonnet-4-20250514",
  "claude-3-7-sonnet-20250219",
  "claude-3-7-sonnet-latest",
  "claude-3-5-sonnet-latest"
] as const;
const GEMINI_ANALYSIS_MODEL_CANDIDATES = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"] as const;
type AnalysisProvider = "claude" | "gemini";

const BASE_ANALYSIS_MAX_TOKENS = 2400;
const BASE_DEEP_ANALYSIS_MAX_TOKENS = 3200;
const GEMINI_MIN_OUTPUT_TOKENS = 6144;
const MAX_TRANSIENT_RETRIES_PER_MODEL = 2;
const MAX_CONTINUATION_CALLS = 2;
const TRANSIENT_RETRY_BASE_DELAY_MS = 700;
const TRANSIENT_RETRY_MAX_DELAY_MS = 4200;
const MAX_MARKER_TRENDS_IN_PROMPT = 56;
const MAX_PROTOCOL_CHANGES_IN_PROMPT = 12;
const MAX_ALERTS_IN_PROMPT = 12;
const MAX_DOSE_PREDICTIONS_IN_PROMPT = 10;
const MAX_TOTAL_MARKERS_IN_PROMPT = 160;
const MAX_BENCHMARK_MARKERS_IN_PROMPT = 10;
const MAX_SUPPLEMENT_CHANGES_IN_PROMPT = 8;
const MAX_MEMORY_BASELINES_IN_PROMPT = 8;
const MAX_MEMORY_SUPPLEMENTS_IN_PROMPT = 4;
const MAX_MEMORY_WATCHLIST_IN_PROMPT = 4;
const MEMORY_ANALYSIS_SUMMARY_MAX_CHARS = 1200;
const MEMORY_GENERATION_MAX_TOKENS = 700;
const MEMORY_GENERATION_MODEL = ANALYSIS_MODEL_CANDIDATES[ANALYSIS_MODEL_CANDIDATES.length - 1];
const parseMarkerCap = (): number => {
  const raw = Number(import.meta.env.VITE_AI_ANALYSIS_MARKER_CAP ?? 60);
  if (!Number.isFinite(raw)) {
    return 60;
  }
  return Math.min(200, Math.max(30, Math.round(raw)));
};
const MAX_MARKERS_PER_REPORT = parseMarkerCap();
export const AI_ANALYSIS_MARKER_CAP = MAX_MARKERS_PER_REPORT;
const MAX_CONTEXT_CHARS = 120;

const SIGNAL_MARKERS = [
  "Testosterone",
  "Free Testosterone",
  "Estradiol",
  "Hematocrit",
  "SHBG",
  "Apolipoprotein B",
  "LDL Cholesterol",
  "Non-HDL Cholesterol",
  "Cholesterol",
  "Triglyceriden",
  "Hemoglobin"
] as const;

const FORMAT_RULES = (anchorLimit: number, markerLimit: number): string =>
  `Format: markdown headings and short paragraphs. No tables, no HTML, no bullet dumps.
Plain language. Short sentences. Define jargon inline if unavoidable.
At most ${anchorLimit} numeric anchors total. At most ${markerLimit} markers unless a safety concern requires more.`;

const PROFILE_CRITICAL_MARKERS: Record<UserProfile, Set<string>> = {
  trt: new Set([
    "Testosterone",
    "Free Testosterone",
    "Estradiol",
    "Hematocrit",
    "SHBG",
    "PSA",
    "Hemoglobin",
    "LDL Cholesterol"
  ]),
  enhanced: new Set([
    "Testosterone",
    "Hematocrit",
    "ALT",
    "AST",
    "GGT",
    "LDL Cholesterol",
    "HDL Cholesterol",
    "Apolipoprotein B",
    "Creatinine",
    "eGFR",
    "Blood Pressure",
    "Hemoglobin"
  ]),
  health: new Set([
    "Glucose",
    "HbA1c",
    "TSH",
    "Free T4",
    "Vitamin D",
    "Vitamin B12",
    "Ferritin",
    "CRP",
    "Homocysteine",
    "LDL Cholesterol",
    "HDL Cholesterol",
    "Triglycerides"
  ]),
  biohacker: new Set([
    "Testosterone",
    "Free Testosterone",
    "Estradiol",
    "SHBG",
    "Apolipoprotein B",
    "Homocysteine",
    "CRP",
    "Ferritin",
    "HbA1c",
    "Vitamin D",
    "Glucose",
    "IGF-1"
  ])
};

const promptLanguageLabel = (language: AppLanguage): string => {
  if (language === "nl") {
    return "Dutch";
  }
  if (language === "de") {
    return "German";
  }
  if (language === "es") {
    return "Spanish";
  }
  if (language === "pt") {
    return "Portuguese";
  }
  if (language === "ru") {
    return "Russian";
  }
  if (language === "zh") {
    return "Chinese";
  }
  return "English";
};

const buildPersona = (profile: UserProfile, today: string, language: AppLanguage): string => {
  const base = `Today: ${today}. Reply language: ${promptLanguageLabel(language)}. Match the user's question language for headings and prose.`;
  const personas: Record<UserProfile, string> = {
    trt: `You are a knowledgeable TRT coach who helps people understand their blood work in the context of hormone replacement therapy. You explain things the way a well-informed friend would: clearly, directly, without unnecessary medical jargon. You care about safety (especially hematocrit and cardiovascular markers) but you are not alarmist.`,
    enhanced: `You are an experienced performance health coach who understands anabolic compounds, their effects on blood markers, and harm reduction. You speak directly and practically: no judgment about compound use, just clear guidance on what the blood work shows and what to watch. You prioritize liver function, kidney markers, lipid profile, and cardiovascular safety.`,
    health: `You are a health optimization coach who helps people understand their blood work and make informed decisions. You explain connections between markers, lifestyle factors, and supplements in accessible language. You focus on metabolic health, inflammation, thyroid function, vitamins, and overall longevity markers.`,
    biohacker: `You are a data-driven health analyst who speaks the language of optimization and quantified self. You look for correlations, non-obvious patterns, and actionable signals in the data. You are comfortable with uncertainty and frame findings as hypotheses to test, not conclusions. You focus on trends, rate of change, and inter-marker relationships.`
  };
  return `${personas[profile]}\n${base}`;
};

const buildCoreRules = (profile: UserProfile): string => {
  const profileContext: Record<UserProfile, string> = {
    trt: `The user is on testosterone replacement therapy. Protocol changes, injection frequency, and estradiol management are likely relevant.`,
    enhanced: `The user may be using multiple anabolic compounds. Do not moralize about compound use. Focus on harm reduction and what the blood work actually shows. If liver or kidney markers are flagged, be direct about the risk.`,
    health: `The user is focused on general health optimization, not necessarily hormone therapy. They may not be on any protocol. Focus on metabolic health, nutritional markers, and lifestyle connections.`,
    biohacker: `The user thinks in terms of optimization and experiments. Frame insights as hypotheses and signals, not diagnoses. They appreciate data density and non-obvious correlations.`
  };

  return `${profileContext[profile]}

TONE AND STYLE:
- Talk like a knowledgeable friend, not a textbook. Use "you" and "your", not "the patient" or "the subject".
- Be direct. Lead with what matters, not with context-setting.
- Short paragraphs. No bullet dumps. Flowing text that reads naturally.
- When uncertain, say so plainly.
- Never invent mechanisms. If unknown, say the cause is unclear from the data.

ANALYSIS RULES:
- Every claim must be traceable to a specific number in the data.
- Link every recommendation to a concrete signal.
- State uncertainty and confounders plainly.
- Do not recap stable markers unless they provide required context.
- currentSupplements = current truth. Do not suggest supplements or changes the user is already doing.
- Use markerPresenceAcrossScope as source of truth for whether a marker was ever tracked.
- Use latestReportAllMarkers as source of truth for what was measured in the newest report.
- Only call a marker "never tracked", "not measured", or "missing historically" when markerPresenceAcrossScope[marker].everSeen is false.
- Only call a marker "not in latest report" when it is absent from latestReportAllMarkers.
- Use personalContext (ageYears, weightKg, heightCm) when present; if any field is null, treat it as unknown and do not infer it.

WELLBEING INTEGRATION:
- If wellbeing check-in data is present, treat it as first-class evidence.
- Correlate specific wellbeing scores with specific lab periods.
- If wellbeing patterns conflict with biomarkers, flag that explicitly.
- If no wellbeing data is present, do not mention it.

SAFETY:
- Never diagnose. Never prescribe. Frame recommendations for doctor discussion.
- If markers indicate possible danger (e.g., hematocrit >54% or very elevated liver enzymes), be direct without panic.
- Cite studies only when they directly support a recommendation or risk statement (max 2).`;
};

const buildLatestReportEvidence = (reports: AnalysisReportRow[]): {
  latestDate: string | null;
  markerCount: number;
  markerNames: string[];
  presence: Record<string, boolean>;
} => {
  const latest = reports[reports.length - 1];
  if (!latest) {
    return {
      latestDate: null,
      markerCount: 0,
      markerNames: [],
      presence: {}
    };
  }
  const markerNames = latest.markers.map((marker) => marker.m);
  const presence: Record<string, boolean> = {};
  markerNames.forEach((markerName) => {
    presence[markerName] = true;
  });
  return {
    latestDate: latest.date,
    markerCount: markerNames.length,
    markerNames,
    presence
  };
};

const markerPromptAliases = (markerName: string): string[] => {
  const trimmed = markerName.trim();
  if (!trimmed) {
    return [];
  }

  const aliases = new Set<string>([trimmed]);
  const appCanonical = canonicalizeMarker(trimmed, { mode: "balanced" });
  if (appCanonical && appCanonical !== "Unknown Marker") {
    aliases.add(appCanonical);
  }

  const normalized = markerNameKey(trimmed);
  if (
    normalized.includes("vitamin d") ||
    normalized.includes("vitamine d") ||
    normalized.includes("25-oh") ||
    normalized.includes("25 oh")
  ) {
    aliases.add("Vitamin D");
    aliases.add("Vitamin D (D3+D2) OH");
    aliases.add("25-OH- Vitamin D (D3+D2)");
  }
  if (normalized === "insuline" || normalized === "insulin") {
    aliases.add("Insulin");
    aliases.add("Insuline");
  }
  if (normalized === "glucose nuchter" || normalized === "fasting glucose" || normalized === "glucose") {
    aliases.add("Glucose");
    aliases.add("Fasting Glucose");
    aliases.add("Glucose Nuchter");
  }
  if (normalized === "ferritine" || normalized === "ferritin") {
    aliases.add("Ferritin");
    aliases.add("Ferritine");
  }

  return Array.from(aliases);
};

const buildMarkerPresenceAcrossScope = (reports: AnalysisReportRow[]): Record<string, AnalysisMarkerPresenceEntry> => {
  const byMarker = new Map<string, { marker: string; latestSeenDate: string | null; countReportsSeen: number }>();

  reports.forEach((report) => {
    const seenInReport = new Set<string>();
    report.markers.forEach((marker) => {
      markerPromptAliases(marker.m).forEach((alias) => {
        const key = markerNameKey(alias);
        if (seenInReport.has(key)) {
          return;
        }
        seenInReport.add(key);

        const existing = byMarker.get(key);
        if (!existing) {
          byMarker.set(key, {
            marker: alias,
            latestSeenDate: report.date,
            countReportsSeen: 1
          });
          return;
        }

        existing.countReportsSeen += 1;
        if (!existing.latestSeenDate || report.date > existing.latestSeenDate) {
          existing.latestSeenDate = report.date;
        }
      });
    });
  });

  return Object.fromEntries(
    Array.from(byMarker.values())
      .sort((left, right) => left.marker.localeCompare(right.marker))
      .map((entry) => [
        entry.marker,
        {
          everSeen: true,
          latestSeenDate: entry.latestSeenDate,
          countReportsSeen: entry.countReportsSeen
        }
      ])
  );
};

const buildLatestReportAllMarkers = (reports: AnalysisReportRow[]): string[] => {
  const latest = reports[reports.length - 1];
  if (!latest) {
    return [];
  }
  return Array.from(new Set(latest.markers.flatMap((marker) => markerPromptAliases(marker.m))));
};

const parsePositiveNumber = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

const deriveAgeYears = (dateOfBirth: string | null | undefined, today: string): number | null => {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    return null;
  }

  const birthDate = new Date(`${dateOfBirth}T00:00:00.000Z`);
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  if (Number.isNaN(birthDate.getTime()) || Number.isNaN(todayDate.getTime()) || birthDate > todayDate) {
    return null;
  }

  let age = todayDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const hasHadBirthdayThisYear =
    todayDate.getUTCMonth() > birthDate.getUTCMonth() ||
    (todayDate.getUTCMonth() === birthDate.getUTCMonth() && todayDate.getUTCDate() >= birthDate.getUTCDate());
  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }
  return age >= 0 && age <= 130 ? age : null;
};

const buildPersonalContext = (personalInfo: AnalyzeLabDataOptions["personalInfo"], today: string): AnalysisPersonalContext => ({
  ageYears: deriveAgeYears(personalInfo?.dateOfBirth, today),
  weightKg: parsePositiveNumber(personalInfo?.weightKg),
  heightCm: parsePositiveNumber(personalInfo?.heightCm)
});

const narrativeHeadingLabel = (key: NarrativeSectionKey, language: AppLanguage): string => {
  const en: Record<NarrativeSectionKey, string> = {
    direct_answer: "Direct answer",
    why_this_fits_your_data: "Why this fits your data",
    what_to_watch_next: "What to watch next",
    suggested_next_step: "Suggested next step",
    heres_where_you_stand: "Here's where you stand",
    whats_driving_these_numbers: "What's driving these numbers",
    what_to_focus_on: "What to focus on",
    next_steps: "Next steps",
    what_changed: "What changed",
    why_it_moved: "Why it moved",
    supplement_tweaks: "Supplement tweaks"
  };
  const nl: Record<NarrativeSectionKey, string> = {
    direct_answer: "Direct antwoord",
    why_this_fits_your_data: "Waarom dit past bij jouw data",
    what_to_watch_next: "Wat nu te volgen",
    suggested_next_step: "Voorgestelde volgende stap",
    heres_where_you_stand: "Waar je nu staat",
    whats_driving_these_numbers: "Wat deze waarden waarschijnlijk drijft",
    what_to_focus_on: "Waar je op moet focussen",
    next_steps: "Volgende stappen",
    what_changed: "Wat er veranderde",
    why_it_moved: "Waarom het bewoog",
    supplement_tweaks: "Supplement-aanpassingen"
  };
  return language === "nl" ? nl[key] : en[key];
};

const buildFullSections = (supplementActionsNeeded: boolean, language: AppLanguage): string => {
  const supplementHeading = narrativeHeadingLabel("supplement_tweaks", language);
  const supplementSection = supplementActionsNeeded
    ? `5) ## ${supplementHeading}
For each suggestion: what to change, why (cite the specific signal), what to expect, and when to reassess. Only suggest changes justified by the current data.`
    : `5) ## ${supplementHeading}
If the current stack looks appropriate given the data, say so briefly and explain which signals confirm it.`;

  return `Required sections in this order:
1) ## ${narrativeHeadingLabel("heres_where_you_stand", language)} - a short narrative connecting your protocol history to your current numbers. Tell the story of how decisions led to outcomes. One paragraph, conversational.
2) ## ${narrativeHeadingLabel("whats_driving_these_numbers", language)} - 2-4 causal chains. Each follows: what changed -> why it likely had this effect -> what you're seeing. Skip anything you cannot connect to a concrete cause.
3) ## ${narrativeHeadingLabel("what_to_focus_on", language)} - max 3 priorities. Each must name a specific marker and value, not a category. Start each with the most actionable item.
4) ## ${narrativeHeadingLabel("next_steps", language)} - what to do now, when to retest, and what would trigger a protocol change. If trend data supports it, add one forward-looking sentence about where things are heading.
${supplementSection}`;
};

const buildQuestionSections = (supplementActionsNeeded: boolean, language: AppLanguage): string => {
  const supplementHeading = narrativeHeadingLabel("supplement_tweaks", language);
  const supplementSection = supplementActionsNeeded
    ? `5) ## ${supplementHeading}
Only include if directly relevant to the user question and current signals. Keep it brief and specific.`
    : `5) ## ${supplementHeading}
Only include if directly relevant; otherwise one sentence saying no supplement change is clearly indicated from this question-focused review.`;

  return `Required sections in this order:
1) ## ${narrativeHeadingLabel("direct_answer", language)} - answer the user question first in 2-4 sentences, with a clear stance.
2) ## ${narrativeHeadingLabel("why_this_fits_your_data", language)} - 2-3 concise evidence chains using specific markers/trends/protocol context.
3) ## ${narrativeHeadingLabel("what_to_watch_next", language)} - max 3 concise watch points tied to this question.
4) ## ${narrativeHeadingLabel("suggested_next_step", language)} - one practical next step and what to recheck next.
${supplementSection}`;
};

const buildComparisonSections = (supplementActionsNeeded: boolean, language: AppLanguage): string => {
  const supplementHeading = narrativeHeadingLabel("supplement_tweaks", language);
  const supplementSection = supplementActionsNeeded
    ? `5) ## ${supplementHeading}
Brief, focused on what changed between reports. Only suggest changes justified by the new data.`
    : `5) ## ${supplementHeading}
If no changes are needed, say so in one sentence.`;

  return `Required sections in this order:
1) ## ${narrativeHeadingLabel("what_changed", language)} - one paragraph on the key shifts since your last blood draw and the most likely reasons.
2) ## ${narrativeHeadingLabel("why_it_moved", language)} - 2-3 causal chains connecting protocol/supplement/lifestyle changes to the observed shifts. Skip anything stable.
3) ## ${narrativeHeadingLabel("what_to_focus_on", language)} - max 3 priorities from this comparison. Each must name a specific signal.
4) ## ${narrativeHeadingLabel("next_steps", language)} - what to do now and when to retest.
${supplementSection}`;
};

const HALLUCINATION_GUARDRAILS = `
CRITICAL - DO NOT:
- Claim a compound has "lipid-protective effects" or "hepatoprotective properties" unless a specific study is provided in the benchmark data.
- Predict specific numeric values for future tests. You can describe direction and rough magnitude.
- Attribute changes to a mechanism you are not confident about.
- State a marker is normalizing or recovering based on a single improving data point.
- Claim the user is a hyper-responder or poor responder unless 4+ data points show a consistent pattern across protocol changes.
- Make supplement dosing recommendations with false precision.`;

const SAFETY_FOOTER =
  "*This analysis is for informational purposes only and does not constitute medical advice or diagnosis. Discuss all changes with your healthcare provider.*";

const HIGHER_WORSE_MARKERS = new Set<string>([
  "Apolipoprotein B",
  "LDL Cholesterol",
  "Non-HDL Cholesterol",
  "Triglyceriden",
  "Hematocrit",
  "Prolactin",
  "PSA",
  "Estradiol"
]);

const LOWER_WORSE_MARKERS = new Set<string>([
  "Testosterone",
  "Free Testosterone",
  "HDL Cholesterol",
  "Ferritin"
]);

const waitMs = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, delayMs));
  });

const parseRetryAfterSeconds = (value: string | null): number | null => {
  if (!value) {
    return null;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.ceil(numeric);
  }
  return null;
};

const isAbortError = (error: unknown): boolean => {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  return Boolean(
    typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: string }).name === "AbortError"
  );
};

const parseSseEventBlock = (rawBlock: string): { eventType: string; payloadText: string | null } => {
  const lines = rawBlock.split(/\r?\n/);
  let eventType = "message";
  const dataLines: string[] = [];

  lines.forEach((line) => {
    if (line.startsWith("event:")) {
      eventType = line.slice("event:".length).trim() || "message";
      return;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  });

  return {
    eventType,
    payloadText: dataLines.length > 0 ? dataLines.join("\n") : null
  };
};

const parseAnthropicEventStream = async ({
  response,
  signal,
  onStreamEvent
}: {
  response: Response;
  signal?: AbortSignal;
  onStreamEvent?: AnalyzeLabDataOptions["onStreamEvent"];
}): Promise<SseStreamParseResult> => {
  if (!response.body) {
    return { text: "", stopReason: null };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let stopReason: string | null = null;
  let started = false;

  const processBlock = (block: string) => {
    const { payloadText } = parseSseEventBlock(block);
    if (!payloadText || payloadText === "[DONE]") {
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(payloadText) as unknown;
    } catch {
      return;
    }
    const typedPayload = payload as {
      type?: string;
      delta?: { type?: string; text?: string; stop_reason?: string | null };
      error?: { message?: string };
      message?: string;
    };

    if (typedPayload.type === "content_block_delta") {
      const textDelta = typedPayload.delta?.type === "text_delta" ? typedPayload.delta.text ?? "" : "";
      if (!textDelta) {
        return;
      }
      if (!started) {
        started = true;
        onStreamEvent?.({ type: "start" });
      }
      fullText += textDelta;
      onStreamEvent?.({ type: "delta", delta: textDelta });
      return;
    }

    if (typedPayload.type === "message_delta") {
      if (typeof typedPayload.delta?.stop_reason === "string") {
        stopReason = typedPayload.delta.stop_reason;
      }
      return;
    }

    if (typedPayload.type === "error") {
      const errorMessage = typedPayload.error?.message ?? typedPayload.message ?? "Anthropic stream error";
      throw new Error(`AI_REQUEST_FAILED:${response.status}:${errorMessage}`);
    }
  };

  try {
    while (true) {
      if (signal?.aborted) {
        throw new Error("AI_REQUEST_ABORTED");
      }
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let separatorMatch = buffer.match(/\r?\n\r?\n/);
      while (separatorMatch && separatorMatch.index !== undefined) {
        const separatorIndex = separatorMatch.index;
        const separatorLength = separatorMatch[0].length;
        const eventBlock = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + separatorLength);
        if (eventBlock.trim()) {
          processBlock(eventBlock);
        }
        separatorMatch = buffer.match(/\r?\n\r?\n/);
      }
    }
    if (buffer.trim()) {
      processBlock(buffer);
    }
  } catch (error) {
    if (isAbortError(error) || (error instanceof Error && error.message === "AI_REQUEST_ABORTED")) {
      throw new Error("AI_REQUEST_ABORTED");
    }
    throw error;
  } finally {
    reader.releaseLock();
  }

  onStreamEvent?.({ type: "complete", text: fullText });
  return {
    text: fullText,
    stopReason
  };
};

const shouldRetryTransientAnalysisError = (status: number, errorCode: string): boolean => {
  if (status === 529) {
    return true;
  }
  if (status >= 500 && status <= 599) {
    return !(status === 503 && errorCode === "AI_LIMITS_UNAVAILABLE");
  }
  return false;
};

const nextTransientRetryDelayMs = (attemptIndex: number, retryAfterSeconds: number | null): number => {
  if (typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(TRANSIENT_RETRY_MAX_DELAY_MS, retryAfterSeconds * 1000);
  }
  const exponential = Math.min(
    TRANSIENT_RETRY_MAX_DELAY_MS,
    TRANSIENT_RETRY_BASE_DELAY_MS * Math.pow(2, Math.max(0, attemptIndex))
  );
  const jitter = Math.floor(Math.random() * 260);
  return exponential + jitter;
};

const buildBenchmarkContext = (markerNames: string[]): string => {
  const relevant = getRelevantBenchmarks(markerNames);
  if (relevant.length === 0) {
    return "";
  }

  return [
    "",
    "## Reference data from published studies",
    "",
    "Use the following findings from peer-reviewed research to provide context where relevant.",
    "Reference the source naturally in your analysis (e.g. 'According to a 2021 study in the Journal of Urology...').",
    "Do NOT reproduce these as a list or bibliography; weave them into your narrative only where they add value.",
    "",
    ...relevant.map(
      (benchmark) =>
        `- ${benchmark.marker}: ${benchmark.finding} (${benchmark.source.authors}, ${benchmark.source.journal} ${benchmark.source.year})`
    ),
    ""
  ].join("\n");
};

const buildMemoryContext = (memory: AnalystMemory | null): string => {
  if (!memory || memory.analysisCount < 2) {
    return "";
  }

  const priorityMarkers = new Set<string>(SIGNAL_MARKERS);
  const lines: string[] = [
    `## Analyst memory (${memory.analysisCount} analyses · last updated ${memory.lastUpdated})`,
    "",
    "Returning user memory. Use it silently for personalization.",
    "Do NOT list or repeat the memory contents. Use it as silent background context.",
    ""
  ];

  const responder = memory.responderProfile;
  const hasResponderProfile =
    responder.testosteroneResponse !== "unknown" ||
    responder.aromatizationTendency !== "unknown" ||
    responder.hematocritSensitivity !== "unknown";

  if (hasResponderProfile) {
    lines.push("**Responder profile:**");
    if (responder.testosteroneResponse !== "unknown") {
      lines.push(`- Testosterone response: ${responder.testosteroneResponse}`);
    }
    if (responder.aromatizationTendency !== "unknown") {
      lines.push(`- Aromatization tendency: ${responder.aromatizationTendency}`);
    }
    if (responder.hematocritSensitivity !== "unknown") {
      lines.push(`- Hematocrit sensitivity: ${responder.hematocritSensitivity}`);
    }
    if (responder.notes.trim()) {
      lines.push(`- ${responder.notes.trim()}`);
    }
    lines.push("");
  }

  const baselines = Object.entries(memory.personalBaselines)
    .sort((left, right) => {
      const leftPriority = priorityMarkers.has(left[0]) ? 1 : 0;
      const rightPriority = priorityMarkers.has(right[0]) ? 1 : 0;
      if (leftPriority !== rightPriority) {
        return rightPriority - leftPriority;
      }
      return (right[1].basedOnN ?? 0) - (left[1].basedOnN ?? 0);
    })
    .slice(0, MAX_MEMORY_BASELINES_IN_PROMPT);
  if (baselines.length > 0) {
    lines.push("**Personal baselines:**");
    baselines.forEach(([marker, baseline]) => {
      lines.push(`- ${marker}: ${baseline.mean.toFixed(1)} ± ${baseline.sd.toFixed(1)} ${baseline.unit} (n=${baseline.basedOnN})`);
    });
    const baselineOverflow = Math.max(0, Object.keys(memory.personalBaselines).length - baselines.length);
    if (baselineOverflow > 0) {
      lines.push(`- +${baselineOverflow} more baselines in memory.`);
    }
    lines.push("");
  }

  const supplementHistory = memory.supplementHistory.slice(0, MAX_MEMORY_SUPPLEMENTS_IN_PROMPT);
  if (supplementHistory.length > 0) {
    lines.push("**Supplement history:**");
    supplementHistory.forEach((entry) => {
      lines.push(`- ${entry.name}: ${entry.effect} — ${entry.observation}`);
    });
    const supplementOverflow = Math.max(0, memory.supplementHistory.length - supplementHistory.length);
    if (supplementOverflow > 0) {
      lines.push(`- +${supplementOverflow} more supplement notes.`);
    }
    lines.push("");
  }

  const watchList = memory.watchList.slice(0, MAX_MEMORY_WATCHLIST_IN_PROMPT);
  if (watchList.length > 0) {
    lines.push("**Watch list:**");
    watchList.forEach((entry) => {
      lines.push(`- ${entry.marker}: ${entry.reason}`);
    });
    const watchOverflow = Math.max(0, memory.watchList.length - watchList.length);
    if (watchOverflow > 0) {
      lines.push(`- +${watchOverflow} more watch items.`);
    }
    lines.push("");
  }

  if (memory.analystNotes.trim()) {
    lines.push("**Analyst notes:**");
    lines.push(memory.analystNotes.trim());
    lines.push("");
  }

  return lines.join("\n");
};

interface FullAnalysisParams {
  today: string;
  unitSystem: UnitSystem;
  language: AppLanguage;
  profile: UserProfile;
  personalContext: AnalysisPersonalContext;
  markerPresenceAcrossScope: Record<string, AnalysisMarkerPresenceEntry>;
  latestReportAllMarkers: string[];
  memory: AnalystMemory | null;
  payload: AnalysisReportRow[];
  supplementContext: AnalysisSupplementContextRow;
  signals: unknown;
  fullPremiumInsightPack: PremiumInsightPack;
  fullActionability: AnalysisActionabilityDecision;
  fullSupplementActionability: SupplementActionabilityDecision;
  benchmarkSection: string;
  supplementActionsNeeded: boolean;
  customQuestion: string | null;
}

interface ComparisonParams {
  today: string;
  unitSystem: UnitSystem;
  language: AppLanguage;
  profile: UserProfile;
  personalContext: AnalysisPersonalContext;
  markerPresenceAcrossScope: Record<string, AnalysisMarkerPresenceEntry>;
  latestReportAllMarkers: string[];
  memory: AnalystMemory | null;
  relevantComparison: unknown;
  latestComparison: unknown;
  relevantPayload: AnalysisReportRow[];
  relevantSupplementContext: AnalysisSupplementContextRow;
  comparisonSignals: unknown;
  comparisonPremiumInsightPack: PremiumInsightPack;
  comparisonActionability: AnalysisActionabilityDecision;
  comparisonSupplementActionability: SupplementActionabilityDecision;
  relevantBenchmarkSection: string;
  supplementActionsNeeded: boolean;
}

function buildFullAnalysisPrompt(params: FullAnalysisParams): string {
  const {
    today, unitSystem, language, profile, personalContext, markerPresenceAcrossScope, latestReportAllMarkers, memory, payload, supplementContext, signals,
    fullPremiumInsightPack, fullActionability, fullSupplementActionability,
    benchmarkSection, supplementActionsNeeded, customQuestion
  } = params;

  const questionInstruction = customQuestion
    ? `USER QUESTION:
- "${customQuestion}"
- Answer this directly in the opening section, then provide the usual structured analysis and next steps.`
    : "No explicit user question was provided. Focus on the most important data-driven priorities.";

  return [
    buildPersona(profile, today, language),
    "Target length: 300-450 words.",
    FORMAT_RULES(10, 5),
    buildCoreRules(profile),
    HALLUCINATION_GUARDRAILS,
    buildFullSections(supplementActionsNeeded, language),
    questionInstruction,
    SAFETY_FOOTER,
    benchmarkSection,
    buildMemoryContext(memory),
    "DATA START",
    JSON.stringify({
      type: "full",
      units: unitSystem,
      userProfile: profile,
      personalContext,
      reports: payload,
      latestReportEvidence: buildLatestReportEvidence(payload),
      markerPresenceAcrossScope,
      latestReportAllMarkers,
      currentSupplements: supplementContext,
      userQuestion: customQuestion,
      signals,
      premiumInsights: fullPremiumInsightPack,
      actionability: { clinical: fullActionability, supplement: fullSupplementActionability }
    }),
    "DATA END"
  ].join("\n");
}

function buildQuestionPrompt(params: FullAnalysisParams): string {
  const {
    today, unitSystem, language, profile, personalContext, markerPresenceAcrossScope, latestReportAllMarkers, memory, payload, supplementContext, signals,
    fullPremiumInsightPack, fullActionability, fullSupplementActionability,
    benchmarkSection, supplementActionsNeeded, customQuestion
  } = params;

  const safeQuestion = customQuestion?.trim() ? customQuestion.trim() : "No explicit user question was provided.";

  return [
    buildPersona(profile, today, language),
    "Scope: answer the user question first. This is a targeted Q&A run, not a full timeline recap.",
    "Target length: 180-320 words.",
    FORMAT_RULES(8, 4),
    buildCoreRules(profile),
    HALLUCINATION_GUARDRAILS,
    buildQuestionSections(supplementActionsNeeded, language),
    `USER QUESTION:
- "${safeQuestion}"`,
    `Question-first rules:
- The user question is the primary objective.
- Do not include a broad "story so far" narrative or full historical recap unless strictly required to answer the question.
- Use LabTracker data only as supporting evidence for the answer.
- Keep context mentions concise and directly tied to the question.`,
    SAFETY_FOOTER,
    benchmarkSection,
    buildMemoryContext(memory),
    "DATA START",
    JSON.stringify({
      type: "questionFocusedFull",
      units: unitSystem,
      userProfile: profile,
      personalContext,
      reports: payload,
      latestReportEvidence: buildLatestReportEvidence(payload),
      markerPresenceAcrossScope,
      latestReportAllMarkers,
      currentSupplements: supplementContext,
      userQuestion: customQuestion,
      signals,
      premiumInsights: fullPremiumInsightPack,
      actionability: { clinical: fullActionability, supplement: fullSupplementActionability }
    }),
    "DATA END"
  ].join("\n");
}

function buildComparisonPrompt(params: ComparisonParams): string {
  const {
    today, unitSystem, language, profile, personalContext, markerPresenceAcrossScope, latestReportAllMarkers, memory, relevantComparison, latestComparison,
    relevantPayload, relevantSupplementContext, comparisonSignals, comparisonPremiumInsightPack,
    comparisonActionability, comparisonSupplementActionability, relevantBenchmarkSection,
    supplementActionsNeeded
  } = params;

  return [
    buildPersona(profile, today, language),
    "Scope: latest report vs the most comparable previous report (highest marker overlap; nearest date on tie).",
    "Target length: 220-320 words.",
    FORMAT_RULES(7, 4),
    buildCoreRules(profile),
    HALLUCINATION_GUARDRAILS,
    buildComparisonSections(supplementActionsNeeded, language),
    SAFETY_FOOTER,
    relevantBenchmarkSection,
    buildMemoryContext(memory),
    "DATA START",
    JSON.stringify({
      type: "latestComparison",
      units: unitSystem,
      userProfile: profile,
      personalContext,
      latestComparison: relevantComparison ?? latestComparison,
      reports: relevantPayload,
      latestReportEvidence: buildLatestReportEvidence(relevantPayload),
      markerPresenceAcrossScope,
      latestReportAllMarkers,
      currentSupplements: relevantSupplementContext,
      signals: comparisonSignals,
      premiumInsights: comparisonPremiumInsightPack,
      actionability: { clinical: comparisonActionability, supplement: comparisonSupplementActionability }
    }),
    "DATA END"
  ].join("\n");
}

const buildMemoryPrompt = ({
  today,
  profile,
  currentMemory,
  compactInput
}: {
  today: string;
  profile: UserProfile;
  currentMemory: AnalystMemory | null;
  compactInput: Record<string, unknown>;
}): string => {
  const analysisCount = (currentMemory?.analysisCount ?? 0) + 1;
  const profileDescriptor: Record<UserProfile, string> = {
    trt: "TRT",
    enhanced: "enhanced athlete / performance",
    health: "general health optimization",
    biohacker: "biohacker / quantified self"
  };
  const profileGuidance: Record<UserProfile, string> = {
    trt: "Focus memory on protocol-response patterns, estradiol balance, hematocrit trajectory, and cardiovascular risk context.",
    enhanced:
      "Focus memory on harm-reduction signals for performance use: liver enzymes, kidney markers, lipids, hematocrit, blood pressure, and protocol complexity.",
    health: "Focus memory on metabolic, inflammation, thyroid, and nutrient pattern stability across repeated tests.",
    biohacker:
      "Focus memory on repeatable experimental signals, responder tendencies, and hypothesis quality (what repeatedly improved or worsened)."
  };

  return `Update AnalystMemory (v1) for a ${profileDescriptor[profile]} user.
Today: ${today}. Analysis #${analysisCount}.
Return valid JSON only (full AnalystMemory object). No markdown.
Profile guidance:
- ${profileGuidance[profile]}

Rules:
- Conservative: use "unknown" when uncertain.
- Preserve confirmed facts from currentMemory; revise uncertain facts if new data clarifies.
- personalBaselines: add marker only if >=3 points, using all available points.
- supplementHistory: include only clear before/after effects across >=2 reports; ignore supplements first seen in latest report.
- protocolHistory: max 4 entries (drop oldest first).
- watchList: max 5; remove marker if normalized in latest report.
- analystNotes: 2-4 specific sentences.

currentMemory:
${JSON.stringify(currentMemory)}

input:
${JSON.stringify(compactInput)}

Output only the updated AnalystMemory JSON.`;
};

const buildCompactMemoryInput = ({
  reports,
  supplementTimeline,
  analysisResult
}: {
  reports: AnalysisReportRow[];
  supplementTimeline: SupplementPeriod[];
  analysisResult: string;
}): Record<string, unknown> => {
  const markerSeries = new Map<
    string,
    {
      u: string;
      p: Array<[string, number, "h" | "l" | "n" | "u"]>;
    }
  >();

  reports.forEach((report) => {
    report.markers.forEach((marker) => {
      const abnormal = deriveAbnormalFromReference(marker.v, marker.ref);
      const abnormalCode: "h" | "l" | "n" | "u" =
        abnormal === "high" ? "h" : abnormal === "low" ? "l" : abnormal === "normal" ? "n" : "u";
      const existing = markerSeries.get(marker.m) ?? { u: marker.u, p: [] };
      existing.p.push([report.date, marker.v, abnormalCode]);
      if (!existing.u) {
        existing.u = marker.u;
      }
      markerSeries.set(marker.m, existing);
    });
  });

  const latestComparison = buildLatestVsPrevious(reports);
  const topMovers = latestComparison?.overlapping
    .slice(0, 8)
    .map((row) => ({
      m: row.marker,
      d: row.delta,
      p: row.percentChange
    })) ?? [];

  const compactSummary = stripComplexFormatting(analysisResult).replace(/\s+/g, " ").trim();

  return {
    rc: reports.length,
    rt: reports.map((report) => ({
      d: report.date,
      p: [report.ann.dose, report.ann.frequency, report.ann.compound],
      t: report.ann.timing,
      s: report.ann.supps
    })),
    ms: Array.from(markerSeries.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([m, series]) => ({
        m,
        u: series.u,
        p: series.p
      })),
    st: sortSupplementPeriods(supplementTimeline).map((period) => ({
      n: period.name,
      d: period.dose,
      f: period.frequency,
      s: period.startDate,
      e: period.endDate
    })),
    mv: topMovers,
    as: compactSummary.slice(0, MEMORY_ANALYSIS_SUMMARY_MAX_CHARS)
  };
};

const extractJsonPayload = (text: string): string => {
  const withoutFences = text.replace(/```json|```/gi, "").trim();
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return withoutFences;
  }
  return withoutFences.slice(start, end + 1).trim();
};

export const generateAnalystMemory = async ({
  reports,
  protocols,
  supplementTimeline = [],
  unitSystem,
  profile = "trt",
  currentMemory,
  analysisResult,
  aiConsent
}: GenerateAnalystMemoryOptions): Promise<AnalystMemory | null> => {
  if (reports.length === 0) {
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const memoryPayload: AnalysisReportRow[] = sortReportsChronological(reports).map((report) => {
    const protocol = getReportProtocol(report, protocols);
    const injectionFrequency = getProtocolInjectionFrequency(protocol);
    return {
      date: report.testDate,
      ann: {
        dose: getProtocolDoseMgPerWeek(protocol),
        compound: getProtocolCompoundsText(protocol),
        frequency: injectionFrequencyLabel(injectionFrequency, "en"),
        frequencyPerWeek: getProtocolFrequencyPerWeek(protocol),
        protocol: protocol?.name ?? "",
        supps: truncateContextText(getReportSupplementsText(report, supplementTimeline), 90),
        symptoms: truncateContextText(report.annotations.symptoms, 80),
        notes: truncateContextText(report.annotations.notes, 80),
        timing: report.annotations.samplingTiming
      },
      markers: report.markers.map((marker) => {
        const converted = convertBySystem(marker.canonicalMarker, marker.value, marker.unit, unitSystem);
        const convertedMin =
          marker.referenceMin === null
            ? null
            : convertBySystem(marker.canonicalMarker, marker.referenceMin, marker.unit, unitSystem).value;
        const convertedMax =
          marker.referenceMax === null
            ? null
            : convertBySystem(marker.canonicalMarker, marker.referenceMax, marker.unit, unitSystem).value;
        return {
          m: marker.canonicalMarker,
          v: toRounded(converted.value),
          u: converted.unit,
          ref: [
            convertedMin === null ? null : toRounded(convertedMin),
            convertedMax === null ? null : toRounded(convertedMax)
          ]
        };
      })
    };
  });
  const sanitizedMemoryPayload = sanitizeAnalysisPayloadForAI(memoryPayload, {
    includeSymptoms: aiConsent?.includeSymptoms ?? false,
    includeNotes: aiConsent?.includeNotes ?? false
  });
  const compactInput = buildCompactMemoryInput({
    reports: sanitizedMemoryPayload,
    supplementTimeline,
    analysisResult
  });
  const memoryPrompt = buildMemoryPrompt({
    today,
    profile,
    currentMemory,
    compactInput
  });

  let response: Response;
  try {
    response = await fetch("/api/claude/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        requestType: "analysis",
        payload: {
          model: MEMORY_GENERATION_MODEL,
          max_tokens: MEMORY_GENERATION_MAX_TOKENS,
          temperature: 0.2,
          messages: [{ role: "user", content: memoryPrompt }]
        }
      })
    });
  } catch (error) {
    console.error("Analyst memory generation failed (non-fatal):", error);
    return null;
  }

  const responseText = await response.text();
  if (!(response.status >= 200 && response.status < 300)) {
    console.error("Analyst memory generation failed (non-fatal):", {
      status: response.status,
      body: responseText.slice(0, 280)
    });
    return null;
  }

  let body: ClaudeResponse = {};
  try {
    body = responseText ? (JSON.parse(responseText) as ClaudeResponse) : {};
  } catch {
    console.error("Analyst memory generation failed (non-fatal): invalid response JSON.");
    return null;
  }

  const modelText = body.content
    ?.filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text ?? "")
    .join("\n")
    .trim();
  if (!modelText) {
    return null;
  }

  try {
    const parsed = JSON.parse(extractJsonPayload(modelText)) as unknown;
    const normalized = coerceAnalystMemory(parsed);
    if (!normalized) {
      return null;
    }
    const expectedCount = (currentMemory?.analysisCount ?? 0) + 1;
    return {
      ...normalized,
      version: 1,
      lastUpdated: today,
      analysisCount: Math.max(expectedCount, normalized.analysisCount)
    };
  } catch (error) {
    console.error("Analyst memory generation failed (non-fatal):", error);
    return null;
  }
};

const toRounded = (value: number): number => {
  if (Math.abs(value) >= 100) {
    return Number(value.toFixed(1));
  }
  if (Math.abs(value) >= 10) {
    return Number(value.toFixed(2));
  }
  return Number(value.toFixed(3));
};

const normalizeText = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, " ");

const toEpochDay = (isoDate: string): number | null => {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
};

const computeStdDev = (values: number[]): number => {
  if (values.length <= 1) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const deriveAbnormalFromReference = (
  value: number,
  ref: [number | null, number | null]
): "low" | "high" | "normal" | "unknown" => {
  const [min, max] = ref;
  if (min !== null && value < min) {
    return "low";
  }
  if (max !== null && value > max) {
    return "high";
  }
  if (min === null && max === null) {
    return "unknown";
  }
  return "normal";
};

const truncateContextText = (value: string, maxChars = MAX_CONTEXT_CHARS): string => {
  const compact = value.trim().replace(/\s+/g, " ");
  if (compact.length <= maxChars) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
};

const supplementDoseFrequencyLabel = (dose: string, frequency: string): string => {
  const dosePart = dose.trim();
  const frequencyPart = frequency.trim();
  if (dosePart && frequencyPart && normalizeText(frequencyPart) !== "unknown") {
    return `${dosePart} ${frequencyPart}`.trim();
  }
  if (dosePart) {
    return dosePart;
  }
  if (frequencyPart && normalizeText(frequencyPart) !== "unknown") {
    return frequencyPart;
  }
  return "unspecified";
};

const supplementTextOrNone = (value: string): string => {
  const compact = value.trim();
  return compact.length > 0 ? compact : "none";
};

const buildRecentSupplementDoseChanges = (
  timeline: SupplementPeriod[],
  relevantSupplementNames: Set<string>
): AnalysisSupplementChangeRow[] => {
  if (timeline.length === 0) {
    return [];
  }

  const grouped = new Map<string, SupplementPeriod[]>();
  sortSupplementPeriods(timeline).forEach((period) => {
    const key = normalizeText(period.name);
    if (relevantSupplementNames.size > 0 && !relevantSupplementNames.has(key)) {
      return;
    }
    const existing = grouped.get(key) ?? [];
    existing.push(period);
    grouped.set(key, existing);
  });

  const changes: AnalysisSupplementChangeRow[] = [];
  grouped.forEach((periods) => {
    const ordered = [...periods].sort(
      (left, right) =>
        left.startDate.localeCompare(right.startDate) ||
        (left.endDate ?? "9999-12-31").localeCompare(right.endDate ?? "9999-12-31") ||
        left.id.localeCompare(right.id)
    );

    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      const doseChanged = normalizeText(current.dose) !== normalizeText(previous.dose);
      const frequencyChanged = normalizeText(current.frequency) !== normalizeText(previous.frequency);
      if (!doseChanged && !frequencyChanged) {
        continue;
      }

      changes.push({
        supplement: current.name.trim() || "Unknown supplement",
        effectiveDate: current.startDate,
        from: supplementDoseFrequencyLabel(previous.dose, previous.frequency),
        to: supplementDoseFrequencyLabel(current.dose, current.frequency)
      });
    }
  });

  return changes
    .sort((left, right) => {
      const byDate = right.effectiveDate.localeCompare(left.effectiveDate);
      if (byDate !== 0) {
        return byDate;
      }
      return left.supplement.localeCompare(right.supplement);
    })
    .slice(0, MAX_SUPPLEMENT_CHANGES_IN_PROMPT);
};

const buildSupplementContext = (
  reports: AnalysisReportRow[],
  supplementTimeline: SupplementPeriod[],
  currentDate: string
): AnalysisSupplementContextRow => {
  const latestReport = reports[reports.length - 1] ?? null;
  const latestReportDate = latestReport?.date ?? null;
  const activeAtLatestByTimeline = latestReportDate ? getActiveSupplementsAtDate(supplementTimeline, latestReportDate) : [];
  const activeTodayByTimeline = getActiveSupplementsAtDate(supplementTimeline, currentDate);
  const relevantSupplementNames = new Set<string>(
    [...activeAtLatestByTimeline, ...activeTodayByTimeline].map((period) => normalizeText(period.name))
  );
  const latestSupplementsText =
    latestReport?.ann.supps && latestReport.ann.supps.trim().length > 0
      ? latestReport.ann.supps
      : supplementPeriodsToText(activeAtLatestByTimeline);
  const activeTodayText = supplementPeriodsToText(activeTodayByTimeline);

  return {
    latestReportDate,
    activeAtLatestTestDate: truncateContextText(supplementTextOrNone(latestSupplementsText), 220),
    activeToday: truncateContextText(supplementTextOrNone(activeTodayText), 220),
    recentDoseOrFrequencyChanges: buildRecentSupplementDoseChanges(supplementTimeline, relevantSupplementNames)
  };
};

const markerDeviationFromRange = (marker: AnalysisMarkerRow): number => {
  const [min, max] = marker.ref;
  if (min !== null && marker.v < min) {
    return Math.abs(min - marker.v) / Math.max(1, Math.abs(min));
  }
  if (max !== null && marker.v > max) {
    return Math.abs(marker.v - max) / Math.max(1, Math.abs(max));
  }
  if (min !== null && max !== null && max > min) {
    const center = (min + max) / 2;
    return Math.abs(marker.v - center) / Math.max(1, Math.abs(center));
  }
  return 0;
};

const trendDirectionFromSummary = (summary: {
  marker: string;
  delta: number;
  percentChange: number | null;
  latestAbnormalFlag: "low" | "high" | "normal" | "unknown";
}): PremiumTrendSignal["directionTag"] => {
  const delta = summary.delta;
  const absPct = Math.abs(summary.percentChange ?? 0);

  if (summary.latestAbnormalFlag === "high") {
    if (delta > 0) {
      return "worsening";
    }
    if (delta < 0) {
      return "improving";
    }
    return "stable";
  }
  if (summary.latestAbnormalFlag === "low") {
    if (delta < 0) {
      return "worsening";
    }
    if (delta > 0) {
      return "improving";
    }
    return "stable";
  }

  if (absPct < 6) {
    return "stable";
  }
  if (HIGHER_WORSE_MARKERS.has(summary.marker)) {
    return delta > 0 ? "worsening" : "improving";
  }
  if (LOWER_WORSE_MARKERS.has(summary.marker)) {
    return delta < 0 ? "worsening" : "improving";
  }
  return "stable";
};

const compactTrendSeverity = (summary: {
  outOfRangeCount: number;
  percentChange: number | null;
  latestAbnormalFlag: "low" | "high" | "normal" | "unknown";
}): PremiumTrendSignal["severityTag"] => {
  const absPct = Math.abs(summary.percentChange ?? 0);
  const hasLatestAbnormal = summary.latestAbnormalFlag === "high" || summary.latestAbnormalFlag === "low";
  if ((hasLatestAbnormal && absPct >= 10) || summary.outOfRangeCount >= 2) {
    return "high";
  }
  if (hasLatestAbnormal || summary.outOfRangeCount > 0 || absPct >= 12) {
    return "medium";
  }
  return "low";
};

const compactTrendRelevance = (marker: string, criticalMarkers: Set<string>): PremiumTrendSignal["relevanceTag"] => {
  if (criticalMarkers.has(marker)) {
    return "critical";
  }
  if (SIGNAL_MARKER_SET.has(marker) || MUST_INCLUDE_MARKERS.has(marker)) {
    return "important";
  }
  return "background";
};

const compactTrendPriorityScore = (trend: PremiumTrendSignal): number => {
  const relevance = trend.relevanceTag === "critical" ? 100 : trend.relevanceTag === "important" ? 60 : 20;
  const severity = trend.severityTag === "high" ? 30 : trend.severityTag === "medium" ? 16 : 4;
  const direction = trend.directionTag === "worsening" ? 16 : trend.directionTag === "improving" ? 10 : 0;
  const outOfRange = trend.outOfRangeFlag ? 12 : 0;
  return relevance + severity + direction + outOfRange;
};

const compactDosePredictionsForPrompt = (predictions: DosePrediction[] | undefined) => {
  if (!predictions || predictions.length === 0) {
    return [];
  }

  return [...predictions]
    .sort((left, right) => (right.relevanceScore ?? 0) - (left.relevanceScore ?? 0))
    .slice(0, MAX_DOSE_PREDICTIONS_IN_PROMPT)
    .map((prediction) => ({
      marker: prediction.marker,
      unit: prediction.unit,
      currentDose: prediction.currentDose,
      suggestedDose: prediction.suggestedDose,
      currentEstimate: toRounded(prediction.currentEstimate),
      suggestedEstimate: toRounded(prediction.suggestedEstimate),
      predictedLow: prediction.predictedLow === null ? null : toRounded(prediction.predictedLow),
      predictedHigh: prediction.predictedHigh === null ? null : toRounded(prediction.predictedHigh),
      suggestedPercentChange:
        prediction.suggestedPercentChange === null ? null : toRounded(prediction.suggestedPercentChange),
      confidence: prediction.confidence,
      status: prediction.status,
      statusReason: truncateContextText(prediction.statusReason, 140),
      samplingMode: prediction.samplingMode,
      source: prediction.source
    }));
};

const compactReportsForPrompt = (
  reports: AnalysisReportRow[],
  analysisType: "full" | "latestComparison"
): AnalysisReportRow[] => {
  if (reports.length === 0) {
    return reports;
  }
  const scopedReports =
    analysisType === "latestComparison"
      ? (() => {
          const pair = resolveLatestComparisonPair(reports);
          return pair ? [pair.previous, pair.latest] : reports.slice(-2);
        })()
      : reports;
  const perReportCap = Math.max(
    14,
    Math.min(MAX_MARKERS_PER_REPORT, Math.floor(MAX_TOTAL_MARKERS_IN_PROMPT / Math.max(1, scopedReports.length)))
  );
  return scopedReports.map((report) => ({
    ...report,
    markers: report.markers.slice(0, perReportCap)
  }));
};

const SIGNAL_MARKER_SET = new Set<string>(SIGNAL_MARKERS);
const MUST_INCLUDE_MARKERS = new Set<string>([
  "Testosterone",
  "Free Testosterone",
  "Estradiol",
  "Hematocrit",
  "SHBG",
  "Apolipoprotein B",
  "LDL Cholesterol",
  "HDL Cholesterol",
  "Triglyceriden",
  "Cholesterol",
  "TSH",
  "Free T4",
  "DHEA Sulfate",
  "Prolactin",
  "PSA"
]);

const buildPriorityMarkerSet = (context: AnalyzeLabDataOptions["context"]): Set<string> => {
  const priority = new Set<string>();
  context?.alerts?.forEach((alert) => {
    if (alert?.marker) {
      priority.add(alert.marker);
    }
  });
  context?.protocolImpact?.insights?.forEach((insight) => {
    if (insight?.marker) {
      priority.add(insight.marker);
    }
  });
  context?.dosePredictions?.forEach((prediction) => {
    if (prediction?.marker) {
      priority.add(prediction.marker);
    }
  });
  return priority;
};

const markerPromptPriorityScore = (marker: AnalysisMarkerRow, priorityMarkers: Set<string>): number => {
  let score = SIGNAL_MARKER_SET.has(marker.m) ? 100 : 0;
  if (priorityMarkers.has(marker.m)) {
    score += 50;
  }
  const abnormal = deriveAbnormalFromReference(marker.v, marker.ref);
  if (abnormal === "high" || abnormal === "low") {
    score += 45;
  } else if (abnormal === "unknown") {
    score -= 5;
  } else {
    score += 5;
  }
  if (marker.ref[0] !== null || marker.ref[1] !== null) {
    score += 10;
  }
  score += Math.min(25, markerDeviationFromRange(marker) * 25);
  return score;
};

const selectPromptMarkers = (markers: AnalysisMarkerRow[], priorityMarkers: Set<string>): AnalysisMarkerRow[] => {
  if (markers.length <= MAX_MARKERS_PER_REPORT) {
    return markers;
  }

  const sorted = [...markers].sort((left, right) => {
    const scoreDelta = markerPromptPriorityScore(right, priorityMarkers) - markerPromptPriorityScore(left, priorityMarkers);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return left.m.localeCompare(right.m);
  });

  const includedKeys = new Set<string>();
  const mustIncludeRows: AnalysisMarkerRow[] = [];
  const optionalRows: AnalysisMarkerRow[] = [];

  for (const marker of sorted) {
    const key = normalizeText(marker.m);
    if (includedKeys.has(key)) {
      continue;
    }
    includedKeys.add(key);
    if (MUST_INCLUDE_MARKERS.has(marker.m)) {
      mustIncludeRows.push(marker);
    } else {
      optionalRows.push(marker);
    }
  }

  if (mustIncludeRows.length >= MAX_MARKERS_PER_REPORT) {
    return mustIncludeRows.slice(0, MAX_MARKERS_PER_REPORT);
  }
  return [...mustIncludeRows, ...optionalRows].slice(0, MAX_MARKERS_PER_REPORT);
};

const buildPayload = (
  reports: LabReport[],
  protocols: Protocol[],
  supplementTimeline: SupplementPeriod[],
  unitSystem: UnitSystem,
  priorityMarkers: Set<string>
): AnalysisReportRow[] => {
  const sorted = sortReportsChronological(reports);
  return sorted.map((report) => ({
    ...(() => {
      const protocol = getReportProtocol(report, protocols);
      const injectionFrequency = getProtocolInjectionFrequency(protocol);
      return {
        date: report.testDate,
        ann: {
          dose: getProtocolDoseMgPerWeek(protocol),
          compound: getProtocolCompoundsText(protocol),
          frequency: injectionFrequencyLabel(injectionFrequency, "en"),
          frequencyPerWeek: getProtocolFrequencyPerWeek(protocol),
          protocol: protocol?.name ?? "",
          supps: truncateContextText(getReportSupplementsText(report, supplementTimeline), 150),
          symptoms: truncateContextText(report.annotations.symptoms),
          notes: truncateContextText(report.annotations.notes),
          timing: report.annotations.samplingTiming
        }
      };
    })(),
    markers: selectPromptMarkers(report.markers.map((marker) => {
      const converted = convertBySystem(marker.canonicalMarker, marker.value, marker.unit, unitSystem);
      const convertedMin =
        marker.referenceMin === null
          ? null
          : convertBySystem(marker.canonicalMarker, marker.referenceMin, marker.unit, unitSystem).value;
      const convertedMax =
        marker.referenceMax === null
          ? null
          : convertBySystem(marker.canonicalMarker, marker.referenceMax, marker.unit, unitSystem).value;

      return {
        m: marker.canonicalMarker,
        v: toRounded(converted.value),
        u: converted.unit,
        ref: [
          convertedMin === null ? null : toRounded(convertedMin),
          convertedMax === null ? null : toRounded(convertedMax)
        ]
      };
    }), priorityMarkers)
  }));
};

const isMarkdownTableLine = (line: string): boolean => /^\s*\|.*\|\s*$/.test(line);

const isMarkdownTableSeparator = (line: string): boolean =>
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

const splitTableCells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

const stripComplexFormatting = (input: string): string => {
  const lines = input.split(/\r?\n/);
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!isMarkdownTableLine(line)) {
      output.push(line);
      index += 1;
      continue;
    }

    const tableLines: string[] = [];
    while (index < lines.length && isMarkdownTableLine(lines[index])) {
      tableLines.push(lines[index]);
      index += 1;
    }

    if (tableLines.length === 0) {
      continue;
    }

    const header = splitTableCells(tableLines[0]);
    const dataLines = tableLines.slice(tableLines.length > 1 && isMarkdownTableSeparator(tableLines[1]) ? 2 : 1);
    if (dataLines.length === 0) {
      continue;
    }

    output.push("Omgezet overzicht:");
    dataLines.forEach((dataLine, rowIndex) => {
      const cells = splitTableCells(dataLine);
      const pairs: string[] = [];
      const pairCount = Math.min(header.length, cells.length);
      for (let cellIndex = 0; cellIndex < pairCount; cellIndex += 1) {
        const key = header[cellIndex];
        const value = cells[cellIndex];
        if (!key || !value) {
          continue;
        }
        pairs.push(`${key}: ${value}`);
      }
      if (pairs.length === 0) {
        pairs.push(cells.filter(Boolean).join("; "));
      }
      output.push(`${rowIndex + 1}. ${pairs.join("; ")}`);
    });
    output.push("");
  }

  return output
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const markerNameKey = (value: string): string => normalizeText(value);

const markerOverlapCount = (latest: AnalysisReportRow, candidate: AnalysisReportRow): number => {
  const latestMarkers = new Set(latest.markers.map((marker) => markerNameKey(marker.m)));
  if (latestMarkers.size === 0) {
    return 0;
  }
  return candidate.markers.reduce((count, marker) => {
    return latestMarkers.has(markerNameKey(marker.m)) ? count + 1 : count;
  }, 0);
};

const resolveLatestComparisonPair = (
  reports: AnalysisReportRow[]
): { previous: AnalysisReportRow; latest: AnalysisReportRow; overlap: number; usedFallback: boolean } | null => {
  if (reports.length < 2) {
    return null;
  }
  if (reports.length === 2) {
    return {
      previous: reports[0],
      latest: reports[1],
      overlap: markerOverlapCount(reports[1], reports[0]),
      usedFallback: false
    };
  }

  const latest = reports[reports.length - 1];
  const immediatePrevious = reports[reports.length - 2];
  let bestPrevious = immediatePrevious;
  let bestIndex = reports.length - 2;
  let bestOverlap = markerOverlapCount(latest, immediatePrevious);

  for (let index = 0; index < reports.length - 1; index += 1) {
    const candidate = reports[index];
    const overlap = markerOverlapCount(latest, candidate);
    if (overlap > bestOverlap || (overlap === bestOverlap && index > bestIndex)) {
      bestPrevious = candidate;
      bestIndex = index;
      bestOverlap = overlap;
    }
  }

  if (bestOverlap <= 0) {
    return {
      previous: immediatePrevious,
      latest,
      overlap: markerOverlapCount(latest, immediatePrevious),
      usedFallback: true
    };
  }

  return {
    previous: bestPrevious,
    latest,
    overlap: bestOverlap,
    usedFallback: false
  };
};

const buildLatestVsPrevious = (reports: AnalysisReportRow[]) => {
  const pair = resolveLatestComparisonPair(reports);
  if (!pair) {
    return null;
  }

  const latest = pair.latest;
  const previous = pair.previous;
  const previousByMarker = new Map(previous.markers.map((marker) => [marker.m, marker] as const));
  const latestByMarker = new Map(latest.markers.map((marker) => [marker.m, marker] as const));

  const overlapping: LatestComparisonRow[] = latest.markers
    .map((latestMarker) => {
      const previousMarker = previousByMarker.get(latestMarker.m);
      if (!previousMarker) {
        return null;
      }
      const delta = latestMarker.v - previousMarker.v;
      const percentChange = Math.abs(previousMarker.v) < 0.000001 ? null : ((latestMarker.v - previousMarker.v) / previousMarker.v) * 100;

      return {
        marker: latestMarker.m,
        unit: latestMarker.u,
        previousDate: previous.date,
        latestDate: latest.date,
        previousValue: toRounded(previousMarker.v),
        latestValue: toRounded(latestMarker.v),
        delta: toRounded(delta),
        percentChange: percentChange === null ? null : toRounded(percentChange),
        previousAbnormal: deriveAbnormalFromReference(previousMarker.v, previousMarker.ref),
        latestAbnormal: deriveAbnormalFromReference(latestMarker.v, latestMarker.ref)
      };
    })
    .filter((row): row is LatestComparisonRow => row !== null)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const newInLatest = latest.markers
    .filter((marker) => !previousByMarker.has(marker.m))
    .map((marker) => ({
      marker: marker.m,
      value: marker.v,
      unit: marker.u,
      abnormal: deriveAbnormalFromReference(marker.v, marker.ref)
    }));

  const missingInLatest = previous.markers
    .filter((marker) => !latestByMarker.has(marker.m))
    .map((marker) => ({
      marker: marker.m,
      value: marker.v,
      unit: marker.u,
      abnormal: deriveAbnormalFromReference(marker.v, marker.ref)
    }));

  return {
    previousDate: previous.date,
    latestDate: latest.date,
    pairSelection: {
      overlapMarkers: pair.overlap,
      comparedCandidates: Math.max(1, reports.length - 1),
      usedImmediateFallback: pair.usedFallback
    },
    previousAnnotations: previous.ann,
    latestAnnotations: latest.ann,
    overlapping,
    newInLatest,
    missingInLatest
  };
};

const buildDerivedSignals = (reports: AnalysisReportRow[]) => {
  const markerSeries = new Map<
    string,
    Array<{ date: string; value: number; abnormal: "low" | "high" | "normal" | "unknown"; unit: string }>
  >();

  for (const report of reports) {
    for (const marker of report.markers) {
      const points = markerSeries.get(marker.m) ?? [];
      points.push({
        date: report.date,
        value: marker.v,
        abnormal: deriveAbnormalFromReference(marker.v, marker.ref),
        unit: marker.u
      });
      markerSeries.set(marker.m, points);
    }
  }

  const markerSummaries = Array.from(markerSeries.entries())
    .map(([marker, rawPoints]) => {
      const points = [...rawPoints].sort((a, b) => {
        const left = toEpochDay(a.date) ?? 0;
        const right = toEpochDay(b.date) ?? 0;
        return left - right;
      });
      const first = points[0];
      const last = points[points.length - 1];
      const values = points.map((point) => point.value);
      const delta = last.value - first.value;
      const percentChange = Math.abs(first.value) < 0.000001 ? null : (delta / first.value) * 100;
      const firstDay = toEpochDay(first.date);
      const lastDay = toEpochDay(last.date);
      const daysSpan = firstDay !== null && lastDay !== null ? Math.max(1, (lastDay - firstDay) / (24 * 60 * 60 * 1000)) : 1;
      const slopePer30Days = (delta / daysSpan) * 30;
      const outOfRangeCount = points.filter((point) => point.abnormal === "high" || point.abnormal === "low").length;

      return {
        marker,
        unit: last.unit,
        measurements: points.length,
        firstDate: first.date,
        lastDate: last.date,
        firstValue: toRounded(first.value),
        lastValue: toRounded(last.value),
        delta: toRounded(delta),
        percentChange: percentChange === null ? null : toRounded(percentChange),
        slopePer30Days: toRounded(slopePer30Days),
        minValue: toRounded(Math.min(...values)),
        maxValue: toRounded(Math.max(...values)),
        volatility: toRounded(computeStdDev(values)),
        outOfRangeCount,
        latestAbnormalFlag: last.abnormal
      };
    })
    .sort((a, b) => a.marker.localeCompare(b.marker));

  const protocolTimeline = reports.map((report) => ({
    date: report.date,
    dosageMgPerWeek: report.ann.dose,
    compound: report.ann.compound,
    injectionFrequency: report.ann.frequency,
    protocol: report.ann.protocol,
    supplements: report.ann.supps,
    symptoms: report.ann.symptoms,
    notes: report.ann.notes
  }));

  const protocolChangeEvents: Array<{
    date: string;
    changes: string[];
    context: {
      dosageMgPerWeek: number | null;
      compound: string;
      injectionFrequency: string;
      protocol: string;
      supplements: string;
      symptoms: string;
      notes: string;
    };
  }> = [];

  for (let index = 0; index < protocolTimeline.length; index += 1) {
    const current = protocolTimeline[index];
    if (index === 0) {
      protocolChangeEvents.push({
        date: current.date,
        changes: ["Baseline context"],
        context: {
          dosageMgPerWeek: current.dosageMgPerWeek,
          compound: current.compound,
          injectionFrequency: current.injectionFrequency,
          protocol: current.protocol,
          supplements: current.supplements,
          symptoms: current.symptoms,
          notes: current.notes
        }
      });
      continue;
    }

    const previous = protocolTimeline[index - 1];
    const changes: string[] = [];

    if (current.dosageMgPerWeek !== previous.dosageMgPerWeek) {
      changes.push(`Dosage: ${previous.dosageMgPerWeek ?? "none"} -> ${current.dosageMgPerWeek ?? "none"} mg/week`);
    }
    if (normalizeText(current.compound) !== normalizeText(previous.compound)) {
      changes.push("Compound changed");
    }
    if (normalizeText(current.injectionFrequency) !== normalizeText(previous.injectionFrequency)) {
      changes.push("Injection frequency changed");
    }
    if (normalizeText(current.protocol) !== normalizeText(previous.protocol)) {
      changes.push("Protocol details changed");
    }
    if (normalizeText(current.supplements) !== normalizeText(previous.supplements)) {
      changes.push("Supplements changed");
    }
    if (normalizeText(current.symptoms) !== normalizeText(previous.symptoms)) {
      changes.push("Symptoms changed");
    }

    if (changes.length > 0) {
      protocolChangeEvents.push({
        date: current.date,
        changes,
        context: {
          dosageMgPerWeek: current.dosageMgPerWeek,
          compound: current.compound,
          injectionFrequency: current.injectionFrequency,
          protocol: current.protocol,
          supplements: current.supplements,
          symptoms: current.symptoms,
          notes: current.notes
        }
      });
    }
  }

  const markersPresent = new Set(markerSummaries.map((summary) => summary.marker));
  const sparseMarkers = markerSummaries.filter((summary) => summary.measurements < 2).map((summary) => summary.marker);
  const missingSignalMarkers = SIGNAL_MARKERS.filter((marker) => !markersPresent.has(marker));
  const reportsWithNotes = reports.filter((report) => report.ann.notes.trim().length > 0).length;
  const reportsWithSymptoms = reports.filter((report) => report.ann.symptoms.trim().length > 0).length;

  return {
    period: {
      reportCount: reports.length,
      firstDate: reports[0]?.date ?? null,
      lastDate: reports[reports.length - 1]?.date ?? null
    },
    markerSummaries,
    protocolChangeEvents,
    contextCompleteness: {
      reportsWithNotes,
      reportsWithSymptoms,
      sparseMarkers,
      missingSignalMarkers
    }
  };
};

const buildSignals = (
  derivedSignals: ReturnType<typeof buildDerivedSignals>,
  context: AnalyzeLabDataOptions["context"],
  criticalMarkers: Set<string>
) => {
  const markerTrends: PremiumTrendSignal[] = [...derivedSignals.markerSummaries]
    .map((summary) => {
      const outOfRangeFlag =
        summary.outOfRangeCount > 0 || summary.latestAbnormalFlag === "high" || summary.latestAbnormalFlag === "low";
      return {
        marker: summary.marker,
        directionTag: trendDirectionFromSummary(summary),
        severityTag: compactTrendSeverity(summary),
        outOfRangeFlag,
        relevanceTag: compactTrendRelevance(summary.marker, criticalMarkers)
      };
    })
    .sort((left, right) => {
      const scoreDelta = compactTrendPriorityScore(right) - compactTrendPriorityScore(left);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return left.marker.localeCompare(right.marker);
    })
    .slice(0, MAX_MARKER_TRENDS_IN_PROMPT);

  return {
    period: derivedSignals.period,
    markerTrends,
    protocolChanges: derivedSignals.protocolChangeEvents.slice(-MAX_PROTOCOL_CHANGES_IN_PROMPT),
    stability: context?.trtStability ?? null,
    alerts:
      context?.alerts
        ?.filter((alert) => alert.severity === "high" || alert.severity === "medium")
        ?.sort((left, right) => {
          const severityRank = (value: MarkerAlert["severity"]): number => (value === "high" ? 2 : value === "medium" ? 1 : 0);
          const bySeverity = severityRank(right.severity) - severityRank(left.severity);
          if (bySeverity !== 0) {
            return bySeverity;
          }
          return right.date.localeCompare(left.date);
        })
        ?.slice(0, MAX_ALERTS_IN_PROMPT)
        ?.map((alert) => ({
          marker: alert.marker,
          type: alert.type,
          severity: alert.severity,
          message: alert.message
        })) ?? [],
    dosePredictions: compactDosePredictionsForPrompt(context?.dosePredictions),
    wellbeing: context?.wellbeingSummary ?? null,
    gaps: derivedSignals.contextCompleteness,
    samplingFilter: context?.samplingFilter ?? "all"
  };
};

const buildActionabilityDecision = ({
  signals,
  analysisType
}: {
  signals: ReturnType<typeof buildSignals>;
  analysisType: "full" | "latestComparison";
}): AnalysisActionabilityDecision => {
  const highAlerts = signals.alerts.filter((alert) => alert.severity === "high");
  const mediumAlerts = signals.alerts.filter((alert) => alert.severity === "medium");
  const worseningTrends = signals.markerTrends.filter((trend) => trend.directionTag === "worsening");

  const adverseTrendScore = worseningTrends.reduce((score, trend) => {
    const relevanceWeight = trend.relevanceTag === "critical" ? 2 : trend.relevanceTag === "important" ? 1 : 0;
    const severityWeight = trend.severityTag === "high" ? 2 : trend.severityTag === "medium" ? 1 : 0;
    return score + relevanceWeight + severityWeight + (trend.outOfRangeFlag ? 1 : 0);
  }, 0);

  const wellbeingFallingCount = Object.values(signals.wellbeing?.metricTrends ?? {}).filter(
    (trend) => trend === "falling"
  ).length;
  const wellbeingConsistentDecline =
    wellbeingFallingCount >= 2 ||
    (wellbeingFallingCount >= 1 && typeof signals.wellbeing?.latestAverage === "number" && signals.wellbeing.latestAverage <= 5);
  const adverseBiomarkerContext =
    highAlerts.length > 0 ||
    mediumAlerts.length > 0 ||
    worseningTrends.some(
      (trend) => trend.relevanceTag !== "background" && (trend.outOfRangeFlag || trend.severityTag !== "low")
    );

  const reasons: string[] = [];
  let confidence: AnalysisActionabilityDecision["actionConfidence"] = "low";

  if (highAlerts.length > 0) {
    reasons.push("high_priority_alerts");
    confidence = "high";
  }
  if (mediumAlerts.length > 0) {
    reasons.push("medium_priority_alerts");
    if (confidence === "low") {
      confidence = "medium";
    }
  }
  if (adverseTrendScore >= 2) {
    reasons.push("adverse_trend_pattern");
    if (confidence === "low") {
      confidence = "medium";
    }
  }
  if (wellbeingConsistentDecline && adverseBiomarkerContext) {
    reasons.push("wellbeing_decline_with_biomarker_context");
    if (confidence === "low") {
      confidence = "medium";
    }
  }

  if (analysisType === "latestComparison" && highAlerts.length > 0 && confidence !== "high") {
    confidence = "high";
  }

  const actionReasons = reasons.slice(0, 4);
  const actionsNeeded = actionReasons.length > 0 && confidence !== "low";
  return {
    actionsNeeded,
    actionReasons,
    actionConfidence: actionsNeeded ? confidence : "low"
  };
};

interface ParsedNarrativeSection {
  heading: string;
  lines: string[];
}

interface QualityGuardResult {
  text: string;
  supplementAdviceIncluded: boolean;
  qualityGuardApplied: boolean;
  qualityIssues: string[];
}

const H2_HEADING_PATTERN = /^##\s+(.+?)\s*$/;
const SUPPLEMENT_SECTION_HEADING_KEY = "supplement_tweaks";

const canonicalNarrativeHeading = (heading: string): NarrativeSectionKey | string => {
  const normalized = heading.trim().toLowerCase();
  if (normalized.includes("what changed") || normalized.includes("wat er veranderde")) {
    return "what_changed";
  }
  if (normalized.includes("direct answer") || normalized.includes("short answer") || normalized.includes("direct antwoord")) {
    return "direct_answer";
  }
  if (
    normalized.includes("why this fits your data") ||
    normalized.includes("why this answer fits") ||
    normalized.includes("waarom dit past bij jouw data")
  ) {
    return "why_this_fits_your_data";
  }
  if (normalized.includes("what to watch next") || normalized.includes("wat nu te volgen")) {
    return "what_to_watch_next";
  }
  if (normalized.includes("suggested next step") || normalized.includes("voorgestelde volgende stap")) {
    return "suggested_next_step";
  }
  if (normalized.includes("why it moved") || normalized.includes("waarom het bewoog")) {
    return "why_it_moved";
  }
  if (normalized.includes("here's where you stand") || normalized.includes("waar je nu staat")) {
    return "heres_where_you_stand";
  }
  if (normalized.includes("what's driving these numbers") || normalized.includes("wat deze waarden waarschijnlijk drijft")) {
    return "whats_driving_these_numbers";
  }
  if (normalized.includes("clinical story")) {
    return "heres_where_you_stand";
  }
  if (normalized.includes("the story so far")) {
    return "heres_where_you_stand";
  }
  if (normalized.includes("protocol, supplements, and wellbeing links")) {
    return "whats_driving_these_numbers";
  }
  if (normalized.includes("why this likely happened")) {
    return "whats_driving_these_numbers";
  }
  if (normalized.includes("what to focus on") || normalized.includes("waar je op moet focussen")) {
    return "what_to_focus_on";
  }
  if (normalized.includes("what matters most now")) {
    return "what_to_focus_on";
  }
  if (normalized.includes("next steps") || normalized.includes("volgende stappen")) {
    return "next_steps";
  }
  if (normalized.includes("what to do next")) {
    return "next_steps";
  }
  if (
    normalized.includes("supplement advice") ||
    normalized.includes("supplement changes") ||
    normalized.includes("supplement tweaks") ||
    normalized.includes("supplement-aanpassingen")
  ) {
    return SUPPLEMENT_SECTION_HEADING_KEY;
  }
  return heading.trim();
};

const parseNarrativeSections = (text: string): { preamble: string[]; sections: ParsedNarrativeSection[] } => {
  const lines = text.split(/\r?\n/);
  const preamble: string[] = [];
  const sections: ParsedNarrativeSection[] = [];
  let activeSection: ParsedNarrativeSection | null = null;

  lines.forEach((line) => {
    const headingMatch = line.match(H2_HEADING_PATTERN);
    if (headingMatch) {
      const heading = canonicalNarrativeHeading(headingMatch[1] ?? "");
      activeSection = {
        heading,
        lines: []
      };
      sections.push(activeSection);
      return;
    }

    if (!activeSection) {
      preamble.push(line);
      return;
    }
    activeSection.lines.push(line);
  });

  return {
    preamble,
    sections
  };
};

const serializeNarrativeSections = ({
  preamble,
  sections,
  language
}: {
  preamble: string[];
  sections: ParsedNarrativeSection[];
  language: AppLanguage;
}): string => {
  const lines: string[] = [];
  if (preamble.some((line) => line.trim().length > 0)) {
    lines.push(...preamble);
    if (lines[lines.length - 1]?.trim() !== "") {
      lines.push("");
    }
  }

  sections.forEach((section, index) => {
    const displayHeading =
      typeof section.heading === "string" &&
      (
        [...QUESTION_REQUIRED_NARRATIVE_SECTION_KEYS, ...FULL_REQUIRED_NARRATIVE_SECTION_KEYS, ...COMPARISON_REQUIRED_NARRATIVE_SECTION_KEYS, SUPPLEMENT_SECTION_HEADING_KEY] as string[]
      ).includes(section.heading)
        ? narrativeHeadingLabel(section.heading as NarrativeSectionKey, language)
        : section.heading;
    lines.push(`## ${displayHeading}`);
    lines.push(...section.lines);
    if (index < sections.length - 1 && lines[lines.length - 1]?.trim() !== "") {
      lines.push("");
    }
  });

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

const hasSupplementSection = (sections: ParsedNarrativeSection[]): boolean =>
  sections.some((section) => section.heading === SUPPLEMENT_SECTION_HEADING_KEY);

const applyNarrativeQualityGuard = ({
  text,
  supplementActionsNeeded,
  analysisType,
  questionMode,
  language
}: {
  text: string;
  supplementActionsNeeded: boolean;
  analysisType: "full" | "latestComparison";
  questionMode: boolean;
  language: AppLanguage;
}): QualityGuardResult => {
  const qualityIssues: string[] = [];
  let qualityGuardApplied = false;
  const parsed = parseNarrativeSections(text);
  let sections = [...parsed.sections];

  if (questionMode) {
    const headingMap: Record<string, string> = {
      heres_where_you_stand: "direct_answer",
      what_changed: "direct_answer",
      whats_driving_these_numbers: "why_this_fits_your_data",
      why_it_moved: "why_this_fits_your_data",
      what_to_focus_on: "what_to_watch_next",
      next_steps: "suggested_next_step"
    };
    const remapped: ParsedNarrativeSection[] = [];
    sections.forEach((section) => {
      const nextHeading = headingMap[section.heading] ?? section.heading;
      const existing = remapped.find((item) => item.heading === nextHeading);
      if (!existing) {
        remapped.push({
          heading: nextHeading,
          lines: [...section.lines]
        });
        return;
      }
      if (existing.lines.length > 0 && existing.lines[existing.lines.length - 1]?.trim() !== "") {
        existing.lines.push("");
      }
      existing.lines.push(...section.lines);
    });
    if (remapped.some((section, index) => section.heading !== (sections[index]?.heading ?? ""))) {
      qualityIssues.push("question_mode_headings_remapped");
      qualityGuardApplied = true;
    }
    sections = remapped;
  }

  const supplementIndex = sections.findIndex((section) => section.heading === SUPPLEMENT_SECTION_HEADING_KEY);

  if (!supplementActionsNeeded && supplementIndex !== -1) {
    sections.splice(supplementIndex, 1);
    qualityIssues.push("supplement_section_removed_without_actionability");
    qualityGuardApplied = true;
  }

  const supplementSectionIndex = sections.findIndex((section) => section.heading === SUPPLEMENT_SECTION_HEADING_KEY);
  if (supplementSectionIndex !== -1) {
    const section = sections[supplementSectionIndex];
    const filteredLines = section.lines.filter((line) => !hasForbiddenSupplementAdviceLanguage(line));
    if (filteredLines.length !== section.lines.length) {
      section.lines = filteredLines;
      qualityIssues.push("supplement_keep_language_removed");
      qualityGuardApplied = true;
    }
    const hasMeaningfulContent = section.lines.some((line) => line.trim().length > 0);
    if (!hasMeaningfulContent) {
      sections.splice(supplementSectionIndex, 1);
      qualityIssues.push("empty_supplement_section_removed");
      qualityGuardApplied = true;
    }
  }

  const requiredNarrativeSections = questionMode
    ? QUESTION_REQUIRED_NARRATIVE_SECTION_KEYS
    : analysisType === "latestComparison"
      ? COMPARISON_REQUIRED_NARRATIVE_SECTION_KEYS
      : FULL_REQUIRED_NARRATIVE_SECTION_KEYS;
  const sectionHeadings = new Set(sections.map((section) => section.heading));
  requiredNarrativeSections.forEach((heading) => {
    if (sectionHeadings.has(heading)) {
      return;
    }
    qualityGuardApplied = true;
    qualityIssues.push(`missing_section_${heading}`);
    if (heading === "direct_answer") {
      sections.unshift({
        heading,
        lines: [
          language === "nl"
            ? "Kort antwoord: op basis van de beschikbare data was de directe conclusie maar deels duidelijk."
            : "Short answer: based on the available data, the direct conclusion was only partially clear."
        ]
      });
      return;
    }
    if (heading === "why_this_fits_your_data") {
      sections.push({
        heading,
        lines: [
          language === "nl"
            ? "De koppeling tussen bewijs en conclusie was deels onduidelijk door beperkte of conflicterende contextsignalen."
            : "The evidence-to-conclusion chain was partially unclear due to limited or conflicting context signals."
        ]
      });
      return;
    }
    if (heading === "what_to_watch_next") {
      sections.push({
        heading,
        lines:
          language === "nl"
            ? ["- Controleer de belangrijkste marker die aan je vraag gekoppeld is opnieuw.", "- Houd protocol en afnamemoment stabiel tot het volgende panel."]
            : ["- Re-check the key marker linked to your question.", "- Keep protocol and sampling context stable until the next panel."]
      });
      return;
    }
    if (heading === "suggested_next_step") {
      sections.push({
        heading,
        lines: [
          language === "nl"
            ? "- Bespreek een gerichte volgende stap met je arts en herhaal de relevante marker onder consistente omstandigheden."
            : "- Discuss one focused next adjustment with your clinician and retest the relevant marker in a consistent context."
        ]
      });
      return;
    }
    if (heading === "heres_where_you_stand" || heading === "what_changed") {
      sections.unshift({
        heading,
        lines: [
          language === "nl"
            ? "Er kon geen volledig heldere samenvatting uit de modeloutput worden afgeleid."
            : "A clear narrative summary could not be fully inferred from the model output."
        ]
      });
      return;
    }
    if (heading === "whats_driving_these_numbers" || heading === "why_it_moved") {
      sections.push({
        heading,
        lines: [
          language === "nl"
            ? "De waarschijnlijke drijvers waren deels onduidelijk door beperkte of conflicterende contextsignalen."
            : "The likely drivers were partially unclear due to limited or conflicting context signals."
        ]
      });
      return;
    }
    if (heading === "what_to_focus_on") {
      sections.push({
        heading,
        lines:
          language === "nl"
            ? ["- Geef prioriteit aan een stabiele uitvoering van je protocol.", "- Controleer belangrijke risicomarkers opnieuw bij de volgende test."]
            : ["- Prioritize stable protocol execution.", "- Re-check key risk markers on the next test."]
      });
      return;
    }
    sections.push({
      heading: "next_steps",
      lines:
        language === "nl"
          ? [
              "- Nu: houd dataverzameling consistent en verander niet meerdere dingen tegelijk.",
              "- Volgende test: herhaal belangrijke markers in dezelfde afnamecontext.",
              "- Herzie keuzes wanneer het nieuwe panel de richting bevestigt."
            ]
          : [
              "- Now: keep data collection consistent and avoid multiple simultaneous changes.",
              "- Next test: repeat key markers in the same sampling context.",
              "- Revisit decisions when the new panel confirms direction."
            ]
    });
  });

  if (supplementActionsNeeded && !hasSupplementSection(sections)) {
    sections.push({
      heading: SUPPLEMENT_SECTION_HEADING_KEY,
      lines:
        language === "nl"
          ? [
              "- Een supplementaanpassing lijkt waarschijnlijk zinvol op basis van de huidige risicosignalen.",
              "- Bespreek toevoegen/verhogen/verlagen/wisselen met je arts."
            ]
          : [
              "- A supplement change is likely warranted based on current risk signals.",
              "- Discuss add/increase/decrease/switch options with your clinician."
            ]
    });
    qualityIssues.push("supplement_section_added_from_actionability");
    qualityGuardApplied = true;
  }

  const outputText = serializeNarrativeSections({
    preamble: parsed.preamble,
    sections,
    language
  });

  return {
    text: outputText,
    supplementAdviceIncluded: hasSupplementSection(sections),
    qualityGuardApplied,
    qualityIssues
  };
};

export const analyzeLabDataWithClaude = async ({
  reports,
  protocols,
  supplementTimeline = [],
  personalInfo,
  unitSystem,
  profile = "trt",
  memory = null,
  language: _language = "nl",
  analysisType = "full",
  deepMode = false,
  customQuestion,
  externalAiAllowed = false,
  aiConsent,
  providerPreference = "auto",
  signal,
  onStreamEvent,
  context
}: AnalyzeLabDataOptions): Promise<AnalyzeLabDataResult> => {
  if (reports.length === 0) {
    throw new Error("Er zijn nog geen rapporten om te analyseren.");
  }
  if (!externalAiAllowed) {
    throw new Error("AI_CONSENT_REQUIRED");
  }
  if (analysisType === "latestComparison" && reports.length < 2) {
    throw new Error("Voor 'laatste vs vorige' zijn minimaal 2 rapporten nodig.");
  }

  const today = new Date().toISOString().slice(0, 10);
  const normalizedCustomQuestion = customQuestion?.trim() ? customQuestion.trim().slice(0, 280) : null;
  const priorityMarkers = buildPriorityMarkerSet(context);
  const rawPayload = buildPayload(reports, protocols, supplementTimeline, unitSystem, priorityMarkers);
  const sanitizedPayload = sanitizeAnalysisPayloadForAI(rawPayload, {
    includeSymptoms: aiConsent?.includeSymptoms ?? false,
    includeNotes: aiConsent?.includeNotes ?? false
  });
  const payload = compactReportsForPrompt(sanitizedPayload, analysisType);
  const markerPresenceAcrossScope = buildMarkerPresenceAcrossScope(sanitizedPayload);
  const latestReportAllMarkers = buildLatestReportAllMarkers(sanitizedPayload);
  const personalContext = buildPersonalContext(personalInfo, today);
  const derivedSignals = buildDerivedSignals(sanitizedPayload);
  const criticalMarkers = PROFILE_CRITICAL_MARKERS[profile] ?? PROFILE_CRITICAL_MARKERS.trt;
  const signals = buildSignals(derivedSignals, context, criticalMarkers);
  const fullActionability = buildActionabilityDecision({
    signals,
    analysisType: "full"
  });
  const fullPremiumInsightPack: PremiumInsightPack = buildPremiumInsightPack({
    profile,
    reports: sanitizedPayload,
    markerTrends: signals.markerTrends,
    alerts: signals.alerts,
    protocolImpact: context?.protocolImpact ?? { events: [], insights: [] },
    trtStability: signals.stability,
    wellbeing: signals.wellbeing,
    samplingFilter: signals.samplingFilter
  });
  const fullSupplementActionability: SupplementActionabilityDecision = buildSupplementActionabilityDecision({
    profile,
    generalActionability: fullActionability,
    markerTrends: signals.markerTrends,
    alerts: signals.alerts,
    premiumInsightPack: fullPremiumInsightPack
  });
  const latestComparison = buildLatestVsPrevious(sanitizedPayload);
  const supplementContext = buildSupplementContext(sanitizedPayload, supplementTimeline, today);
  const trackedMarkerNames = Array.from(new Set(payload.flatMap((report) => report.markers.map((marker) => marker.m))));
  const benchmarkSection = buildBenchmarkContext(trackedMarkerNames.slice(0, MAX_BENCHMARK_MARKERS_IN_PROMPT));
  const maxTokens = deepMode ? BASE_DEEP_ANALYSIS_MAX_TOKENS : BASE_ANALYSIS_MAX_TOKENS;

  const fullPrompt = buildFullAnalysisPrompt({
    today,
    unitSystem,
    language: _language,
    profile,
    personalContext,
    markerPresenceAcrossScope,
    latestReportAllMarkers,
    memory,
    payload,
    supplementContext,
    signals,
    fullPremiumInsightPack,
    fullActionability,
    fullSupplementActionability,
    benchmarkSection,
    supplementActionsNeeded: fullSupplementActionability.supplementActionsNeeded,
    customQuestion: normalizedCustomQuestion
  });
  const questionPrompt = normalizedCustomQuestion
    ? buildQuestionPrompt({
        today,
        unitSystem,
        language: _language,
        profile,
        personalContext,
        markerPresenceAcrossScope,
        latestReportAllMarkers,
        memory,
        payload,
        supplementContext,
        signals,
        fullPremiumInsightPack,
        fullActionability,
        fullSupplementActionability,
        benchmarkSection,
        supplementActionsNeeded: fullSupplementActionability.supplementActionsNeeded,
        customQuestion: normalizedCustomQuestion
      })
    : null;

  const latestComparisonConfig = (() => {
    const relevantPayload = payload.slice(-2);
    const relevantComparison = buildLatestVsPrevious(relevantPayload);
    const relevantSupplementContext = buildSupplementContext(relevantPayload, supplementTimeline, today);
    const relevantMarkers = new Set(relevantPayload.flatMap((report) => report.markers.map((marker) => marker.m)));
    const relevantBenchmarkSection = buildBenchmarkContext(
      Array.from(relevantMarkers).slice(0, MAX_BENCHMARK_MARKERS_IN_PROMPT)
    );
    const startDate = relevantPayload[0]?.date ?? null;
    const endDate = relevantPayload[1]?.date ?? null;

    const comparisonSignals = {
      ...signals,
      markerTrends: signals.markerTrends.filter((trend) => relevantMarkers.has(trend.marker)),
      protocolChanges:
        startDate && endDate
          ? signals.protocolChanges.filter((event) => event.date >= startDate && event.date <= endDate)
          : signals.protocolChanges
    };
    const comparisonActionability = buildActionabilityDecision({
      signals: comparisonSignals,
      analysisType: "latestComparison"
    });
    const comparisonPremiumInsightPack: PremiumInsightPack = buildPremiumInsightPack({
      profile,
      reports: relevantPayload,
      markerTrends: comparisonSignals.markerTrends,
      alerts: comparisonSignals.alerts,
      protocolImpact: context?.protocolImpact ?? { events: [], insights: [] },
      trtStability: comparisonSignals.stability,
      wellbeing: comparisonSignals.wellbeing,
      samplingFilter: comparisonSignals.samplingFilter
    });
    const comparisonSupplementActionability: SupplementActionabilityDecision = buildSupplementActionabilityDecision({
      profile,
      generalActionability: comparisonActionability,
      markerTrends: comparisonSignals.markerTrends,
      alerts: comparisonSignals.alerts,
      premiumInsightPack: comparisonPremiumInsightPack
    });

    return {
      prompt: buildComparisonPrompt({
        today,
        unitSystem,
        language: _language,
        profile,
        personalContext,
        markerPresenceAcrossScope,
        latestReportAllMarkers,
        memory,
        relevantComparison,
        latestComparison,
        relevantPayload,
        relevantSupplementContext,
        comparisonSignals,
        comparisonPremiumInsightPack,
        comparisonActionability,
        comparisonSupplementActionability,
        relevantBenchmarkSection,
        supplementActionsNeeded: comparisonSupplementActionability.supplementActionsNeeded
      }),
      actionability: comparisonActionability,
      supplementActionability: comparisonSupplementActionability
    };
  })();

  const isQuestionFocusedRun = analysisType === "full" && Boolean(normalizedCustomQuestion);
  const prompt =
    analysisType === "latestComparison"
      ? latestComparisonConfig.prompt
      : isQuestionFocusedRun && questionPrompt
        ? questionPrompt
        : fullPrompt;
  const actionability = analysisType === "latestComparison" ? latestComparisonConfig.actionability : fullActionability;
  const supplementActionability =
    analysisType === "latestComparison"
      ? latestComparisonConfig.supplementActionability
      : fullSupplementActionability;

  const tryModel = async (
    model: string,
    provider: AnalysisProvider,
    promptText: string
  ): Promise<{ status: number; body: ClaudeResponse; retryAfterSeconds: number | null }> => {
    const endpoint = provider === "gemini" ? "/api/gemini?action=analysis" : "/api/claude/messages";
    const providerMaxTokens = provider === "gemini" ? Math.max(maxTokens, GEMINI_MIN_OUTPUT_TOKENS) : maxTokens;
    const shouldStreamClaude = provider === "claude" && typeof onStreamEvent === "function";
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        signal,
        body: JSON.stringify({
          requestType: "analysis",
          payload: {
            model,
            max_tokens: providerMaxTokens,
            temperature: 0.3,
            ...(shouldStreamClaude ? { stream: true } : {}),
            messages: [{ role: "user", content: promptText }]
          }
        })
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new Error("AI_REQUEST_ABORTED");
      }
      throw new Error("PROXY_UNREACHABLE");
    }

    const responseContentType = response.headers.get("content-type") ?? "";
    if (shouldStreamClaude && response.ok && responseContentType.includes("text/event-stream")) {
      const streamed = await parseAnthropicEventStream({
        response,
        signal,
        onStreamEvent
      });
      return {
        status: response.status,
        body: {
          content: [{ type: "text", text: streamed.text }],
          stop_reason: streamed.stopReason ?? "end_turn"
        },
        retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("retry-after"))
      };
    }

    const text = await response.text();
    let body: ClaudeResponse = {};
    try {
      body = text ? (JSON.parse(text) as ClaudeResponse) : {};
    } catch {
      body = text
        ? {
            error: {
              message: text.slice(0, 280)
            }
          }
        : {};
    }
    return {
      status: response.status,
      body,
      retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("retry-after"))
    };
  };

  let lastStatus = 0;
  let lastErrorMessage = "";

  const providerPlan: AnalysisProvider[] =
    providerPreference === "claude"
      ? ["claude", "gemini"]
      : providerPreference === "gemini"
        ? ["gemini", "claude"]
        : ["claude", "gemini"];

  const primaryProvider = providerPlan[0] ?? "claude";
  providerLoop: for (const provider of providerPlan) {
    const modelCandidates = provider === "gemini" ? GEMINI_ANALYSIS_MODEL_CANDIDATES : ANALYSIS_MODEL_CANDIDATES;

    modelLoop: for (const model of modelCandidates) {
      for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES_PER_MODEL; attempt += 1) {
        let result: { status: number; body: ClaudeResponse; retryAfterSeconds: number | null };
        try {
        result = await tryModel(model, provider, prompt);
        } catch (error) {
          if (error instanceof Error && error.message === "AI_REQUEST_ABORTED") {
            throw error;
          }
          if (error instanceof Error && error.message === "PROXY_UNREACHABLE") {
            throw new Error("AI_PROXY_UNREACHABLE");
          }
          throw error;
        }
        lastStatus = result.status;

        if (result.status >= 200 && result.status < 300) {
          const text = result.body.content?.find((item) => item.type === "text")?.text?.trim();
          if (!text) {
            throw new Error("AI_EMPTY_RESPONSE");
          }
          let finalized = text;
          let truncated = result.body.stop_reason === "max_tokens";
          if (truncated) {
            for (let continuationIndex = 0; continuationIndex < MAX_CONTINUATION_CALLS; continuationIndex += 1) {
              const continuationPrompt = [
                prompt,
                "",
                "The previous answer was cut off by token limit.",
                "Continue from where you stopped, do not repeat earlier text, keep it concise and insight-focused.",
                "",
                "PARTIAL ANSWER START",
                finalized,
                "PARTIAL ANSWER END"
              ].join("\n");
              const continuation = await tryModel(model, provider, continuationPrompt);
              if (!(continuation.status >= 200 && continuation.status < 300)) {
                break;
              }
              const continuationText =
                continuation.body.content?.find((item) => item.type === "text")?.text?.trim() ?? "";
              if (!continuationText) {
                truncated = false;
                break;
              }
              finalized = `${finalized}\n\n${continuationText}`;
              truncated = continuation.body.stop_reason === "max_tokens";
              if (!truncated) {
                break;
              }
            }
          }
          const maybeTruncated = truncated
            ? `${finalized}\n\n_Note: output may be incomplete due to output token limit._`
            : finalized;
          const outputText = stripComplexFormatting(maybeTruncated);
          const questionMode = analysisType === "full" && Boolean(normalizedCustomQuestion);
          const qualityResult = applyNarrativeQualityGuard({
            text: outputText,
            supplementActionsNeeded: supplementActionability.supplementActionsNeeded,
            analysisType,
            questionMode,
            language: _language
          });
          return {
            text: qualityResult.text,
            provider,
            model,
            fallbackUsed: provider !== primaryProvider,
            actionsNeeded: actionability.actionsNeeded,
            actionReasons: actionability.actionReasons,
            actionConfidence: actionability.actionConfidence,
            supplementActionsNeeded: supplementActionability.supplementActionsNeeded,
            supplementAdviceIncluded: qualityResult.supplementAdviceIncluded,
            qualityGuardApplied: qualityResult.qualityGuardApplied,
            qualityIssues: qualityResult.qualityIssues
          };
        }

        const errorBody = result.body as {
          error?: { code?: string; detail?: string; message?: string; details?: string };
          message?: string;
          detail?: string;
          details?: string;
        };
        const errorMeta = errorBody.error;
        const errorMessage =
          errorMeta?.message ??
          errorMeta?.detail ??
          errorMeta?.details ??
          errorBody.message ??
          errorBody.detail ??
          errorBody.details ??
          "";
        const errorCode = errorMeta?.code ?? "";

        if (result.status === 429) {
          const retryAfterRaw = (result.body as { retryAfter?: number })?.retryAfter;
          const retryAfter =
            typeof retryAfterRaw === "number" && Number.isFinite(retryAfterRaw) ? Math.max(1, Math.round(retryAfterRaw)) : 0;
          throw new Error(`AI_RATE_LIMITED:${retryAfter}`);
        }
        if (result.status === 503 && errorCode === "AI_LIMITS_UNAVAILABLE") {
          throw new Error("AI_LIMITS_UNAVAILABLE");
        }
        if (
          (result.status === 403 || result.status === 500) &&
          (errorCode === "AI_ENTITLEMENT_REQUIRED" || errorCode === "AI_PLAN_LIMIT" || errorCode === "AI_ENTITLEMENT_MISCONFIGURED")
        ) {
          throw new Error(errorCode);
        }

        const missingServerApiKey = result.status === 401 && /Missing\s+\w+_API_KEY\s+on\s+server/i.test(errorMessage);
        if (missingServerApiKey) {
          continue providerLoop;
        }

        const missingModel = result.status === 404 || (result.status === 400 && /model/i.test(errorMessage));
        if (missingModel) {
          continue modelLoop;
        }

        const transientError = shouldRetryTransientAnalysisError(result.status, errorCode);
        lastErrorMessage = errorMessage;
        if (transientError) {
          if (attempt < MAX_TRANSIENT_RETRIES_PER_MODEL) {
            await waitMs(nextTransientRetryDelayMs(attempt, result.retryAfterSeconds));
            continue;
          }
          continue modelLoop;
        }

        break providerLoop;
      }
    }
  }

  if (lastStatus === 529) {
    throw new Error("AI_OVERLOADED");
  }
  throw new Error(`AI_REQUEST_FAILED:${lastStatus || "unknown"}:${lastErrorMessage || ""}`);
};
