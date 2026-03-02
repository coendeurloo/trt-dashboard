import { AnalystMemory } from "./types/analystMemory";

const RESPONSE_LEVELS = new Set(["low", "moderate", "high", "unknown"] as const);
const SUPPLEMENT_EFFECTS = new Set(["positive", "negative", "neutral", "unclear"] as const);
const MAX_PROTOCOL_HISTORY = 4;
const MAX_WATCH_LIST = 5;

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toIsoDate = (value: unknown, fallback: string): string => {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return fallback;
  }
  const parsed = Date.parse(`${trimmed}T00:00:00Z`);
  return Number.isFinite(parsed) ? trimmed : fallback;
};

const toCleanText = (value: unknown): string => (typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "");

const truncateWords = (input: string, maxWords: number): string => {
  const words = input.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return words.join(" ");
  }
  return `${words.slice(0, maxWords).join(" ")}...`;
};

const toResponseLevel = (value: unknown): "low" | "moderate" | "high" | "unknown" =>
  typeof value === "string" && RESPONSE_LEVELS.has(value as "low" | "moderate" | "high" | "unknown")
    ? (value as "low" | "moderate" | "high" | "unknown")
    : "unknown";

const toSupplementEffect = (value: unknown): "positive" | "negative" | "neutral" | "unclear" =>
  typeof value === "string" && SUPPLEMENT_EFFECTS.has(value as "positive" | "negative" | "neutral" | "unclear")
    ? (value as "positive" | "negative" | "neutral" | "unclear")
    : "unclear";

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const coerceAnalystMemory = (raw: unknown): AnalystMemory | null => {
  if (!isRecord(raw)) {
    return null;
  }

  const fallbackDate = todayIso();
  const responderRaw = isRecord(raw.responderProfile) ? raw.responderProfile : {};
  const baselinesRaw = isRecord(raw.personalBaselines) ? raw.personalBaselines : {};
  const supplementRaw = Array.isArray(raw.supplementHistory) ? raw.supplementHistory : [];
  const protocolRaw = Array.isArray(raw.protocolHistory) ? raw.protocolHistory : [];
  const watchListRaw = Array.isArray(raw.watchList) ? raw.watchList : [];

  const personalBaselines: AnalystMemory["personalBaselines"] = {};
  Object.entries(baselinesRaw).forEach(([markerName, value]) => {
    if (!isRecord(value) || !markerName.trim()) {
      return;
    }
    const mean = toFiniteNumber(value.mean);
    const sd = toFiniteNumber(value.sd);
    const basedOnN = Math.max(0, Math.round(toFiniteNumber(value.basedOnN) ?? 0));
    const unit = toCleanText(value.unit);
    if (mean === null || sd === null || basedOnN < 3 || !unit) {
      return;
    }
    personalBaselines[markerName.trim()] = {
      mean,
      sd,
      unit,
      basedOnN
    };
  });

  const supplementHistory: AnalystMemory["supplementHistory"] = supplementRaw
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }
      const name = toCleanText(entry.name);
      if (!name) {
        return null;
      }
      const affectedMarkers = Array.isArray(entry.affectedMarkers)
        ? Array.from(
            new Set(
              entry.affectedMarkers
                .map((marker) => toCleanText(marker))
                .filter(Boolean)
            )
          )
        : [];
      return {
        name,
        effect: toSupplementEffect(entry.effect),
        affectedMarkers,
        observation: truncateWords(toCleanText(entry.observation), 24)
      };
    })
    .filter((entry): entry is AnalystMemory["supplementHistory"][number] => entry !== null);

  const protocolHistory: AnalystMemory["protocolHistory"] = protocolRaw
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }
      const date = toIsoDate(entry.date, fallbackDate);
      const change = truncateWords(toCleanText(entry.change), 24);
      const observedEffect = truncateWords(toCleanText(entry.observedEffect), 24);
      if (!change || !observedEffect) {
        return null;
      }
      return {
        date,
        change,
        observedEffect
      };
    })
    .filter((entry): entry is AnalystMemory["protocolHistory"][number] => entry !== null)
    .slice(-MAX_PROTOCOL_HISTORY);

  const watchList: AnalystMemory["watchList"] = watchListRaw
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }
      const marker = toCleanText(entry.marker);
      const reason = truncateWords(toCleanText(entry.reason), 24);
      const since = toIsoDate(entry.since, fallbackDate);
      if (!marker || !reason) {
        return null;
      }
      return {
        marker,
        reason,
        since
      };
    })
    .filter((entry): entry is AnalystMemory["watchList"][number] => entry !== null)
    .slice(0, MAX_WATCH_LIST);

  const analysisCount = Math.max(0, Math.round(toFiniteNumber(raw.analysisCount) ?? 0));

  const memory: AnalystMemory = {
    version: 1,
    lastUpdated: toIsoDate(raw.lastUpdated, fallbackDate),
    analysisCount,
    responderProfile: {
      testosteroneResponse: toResponseLevel(responderRaw.testosteroneResponse),
      aromatizationTendency: toResponseLevel(responderRaw.aromatizationTendency),
      hematocritSensitivity: toResponseLevel(responderRaw.hematocritSensitivity),
      notes: truncateWords(toCleanText(responderRaw.notes), 60)
    },
    personalBaselines,
    supplementHistory,
    protocolHistory,
    watchList,
    analystNotes: truncateWords(toCleanText(raw.analystNotes), 120)
  };

  return memory;
};
