import { MarkerTrendSummary } from "./analytics";
import { PRIMARY_MARKERS } from "./constants";
import { getMarkerDisplayName, trLocale } from "./i18n";
import { AppLanguage, LabReport, UserProfile } from "./types";
import { sortReportsChronological } from "./utils";

type SuggestionCategory = "generic" | "abnormal" | "delta" | "trend" | "protocol";

interface ScoredSuggestion {
  id: string;
  question: string;
  category: SuggestionCategory;
  score: number;
}

export interface SuggestedAiQuestion {
  id: string;
  question: string;
  category: SuggestionCategory;
}

interface SuggestionInput {
  reports: LabReport[];
  trendByMarker: Record<string, MarkerTrendSummary>;
  language: AppLanguage;
  userProfile: UserProfile;
  hasActiveProtocol: boolean;
}

const IMPORTANT_MARKERS = new Set<string>([
  ...PRIMARY_MARKERS,
  "Apolipoprotein B",
  "LDL Cholesterol",
  "Non-HDL Cholesterol",
  "Triglyceriden",
  "Hemoglobin",
  "eGFR",
  "Creatinine",
  "PSA",
  "CRP",
  "HbA1c"
]);

const MAJOR_DELTA_THRESHOLD_PCT = 18;

const tr = (language: AppLanguage, nl: string, en: string): string => trLocale(language, nl, en);

const safePercentChange = (latest: number, previous: number): number | null => {
  if (Math.abs(previous) <= 0.000001) {
    return null;
  }
  const pct = ((latest - previous) / previous) * 100;
  return Number.isFinite(pct) ? pct : null;
};

const markerValueByCanonical = (report: LabReport): Map<string, LabReport["markers"][number]> => {
  const byMarker = new Map<string, LabReport["markers"][number]>();
  report.markers.forEach((marker) => {
    if (!byMarker.has(marker.canonicalMarker)) {
      byMarker.set(marker.canonicalMarker, marker);
    }
  });
  return byMarker;
};

const markerMeasurementCount = (reports: LabReport[]): Map<string, number> => {
  const counts = new Map<string, number>();
  reports.forEach((report) => {
    const seenInReport = new Set<string>();
    report.markers.forEach((marker) => {
      if (seenInReport.has(marker.canonicalMarker)) {
        return;
      }
      seenInReport.add(marker.canonicalMarker);
      counts.set(marker.canonicalMarker, (counts.get(marker.canonicalMarker) ?? 0) + 1);
    });
  });
  return counts;
};

const pickProfileGenericQuestion = (language: AppLanguage, profile: UserProfile): string => {
  if (profile === "trt") {
    return tr(
      language,
      "Welke marker moet ik als eerste bespreken voor protocolveiligheid?",
      "Which marker should I prioritize first for protocol safety?"
    );
  }
  if (profile === "enhanced") {
    return tr(
      language,
      "Welke marker vraagt als eerste aandacht voor risicobeperking?",
      "Which marker needs attention first for risk reduction?"
    );
  }
  if (profile === "biohacker") {
    return tr(
      language,
      "Welke signalen zijn nu het meest actiegericht in mijn trends?",
      "Which signals are most actionable in my trends right now?"
    );
  }
  return tr(
    language,
    "Welke markers vragen nu als eerste aandacht?",
    "Which markers need attention first right now?"
  );
};

const dedupeByQuestion = (items: ScoredSuggestion[]): ScoredSuggestion[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.question.trim().toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const pickTopByCategory = (items: ScoredSuggestion[], category: SuggestionCategory): ScoredSuggestion | null => {
  const filtered = items.filter((item) => item.category === category);
  if (filtered.length === 0) {
    return null;
  }
  return [...filtered].sort((left, right) => right.score - left.score)[0];
};

export const getSuggestedAiQuestions = ({
  reports,
  trendByMarker,
  language,
  userProfile,
  hasActiveProtocol
}: SuggestionInput): SuggestedAiQuestion[] => {
  const orderedReports = sortReportsChronological(reports);
  const latest = orderedReports[orderedReports.length - 1];
  const previous = orderedReports[orderedReports.length - 2];
  const countsByMarker = markerMeasurementCount(orderedReports);

  const candidates: ScoredSuggestion[] = [
    {
      id: "generic-latest-changes",
      question: tr(language, "Wat is er veranderd sinds mijn laatste rapport?", "What changed since my last report?"),
      category: "generic",
      score: 1
    },
    {
      id: "generic-priority",
      question: pickProfileGenericQuestion(language, userProfile),
      category: "generic",
      score: 2
    },
    {
      id: "generic-retest",
      question: tr(language, "Wat moet ik bij de volgende test opnieuw controleren?", "What should I retest next time?"),
      category: "generic",
      score: 1
    }
  ];

  if (latest) {
    const outOfRange = latest.markers
      .filter((marker) => marker.abnormal === "high" || marker.abnormal === "low")
      .map((marker) => {
        const baseScore = 3;
        const importanceScore = IMPORTANT_MARKERS.has(marker.canonicalMarker) ? 1 : 0;
        return {
          marker,
          score: baseScore + importanceScore
        };
      })
      .sort((left, right) => right.score - left.score);

    if (outOfRange.length > 0) {
      const top = outOfRange[0];
      const markerLabel = getMarkerDisplayName(top.marker.canonicalMarker, language);
      const directionLabel =
        top.marker.abnormal === "high"
          ? tr(language, "stijgend", "high")
          : tr(language, "laag", "low");
      candidates.push({
        id: `abnormal-${top.marker.canonicalMarker}`,
        question: tr(
          language,
          `Waarom is mijn ${markerLabel} ${directionLabel}?`,
          `Why is my ${markerLabel} ${directionLabel}?`
        ),
        category: "abnormal",
        score: top.score
      });
      candidates.push({
        id: "abnormal-priority-bundle",
        question: tr(
          language,
          "Welke afwijkende markers moet ik als eerste aanpakken?",
          "Which out-of-range markers should I address first?"
        ),
        category: "abnormal",
        score: top.score - 0.4
      });
    }
  }

  if (latest && previous) {
    const latestByMarker = markerValueByCanonical(latest);
    const previousByMarker = markerValueByCanonical(previous);
    const deltas: Array<{
      marker: string;
      percent: number;
      score: number;
    }> = [];

    latestByMarker.forEach((latestMarker, markerName) => {
      const previousMarker = previousByMarker.get(markerName);
      if (!previousMarker) {
        return;
      }
      const percent = safePercentChange(latestMarker.value, previousMarker.value);
      if (percent === null || Math.abs(percent) < MAJOR_DELTA_THRESHOLD_PCT) {
        return;
      }
      let score = 2;
      if (Math.abs(percent) >= 35) {
        score += 1;
      }
      if (IMPORTANT_MARKERS.has(markerName)) {
        score += 1;
      }
      deltas.push({ marker: markerName, percent, score });
    });

    deltas.sort((left, right) => right.score - left.score || Math.abs(right.percent) - Math.abs(left.percent));
    if (deltas.length > 0) {
      const topDelta = deltas[0];
      const markerLabel = getMarkerDisplayName(topDelta.marker, language);
      candidates.push({
        id: `delta-${topDelta.marker}`,
        question: tr(
          language,
          `Waarom veranderde mijn ${markerLabel} zo sterk sinds de vorige test?`,
          `Why did my ${markerLabel} change so much since the previous test?`
        ),
        category: "delta",
        score: topDelta.score
      });
    }
  }

  const trendCandidates = Object.entries(trendByMarker)
    .filter(([, trend]) => trend.direction === "rising" || trend.direction === "falling")
    .map(([marker, trend]) => {
      const measurementCount = countsByMarker.get(marker) ?? 0;
      if (measurementCount < 3) {
        return null;
      }
      let score = 2;
      if (IMPORTANT_MARKERS.has(marker)) {
        score += 1;
      }
      return {
        marker,
        trend,
        score
      };
    })
    .filter((entry): entry is { marker: string; trend: MarkerTrendSummary; score: number } => Boolean(entry))
    .sort((left, right) => right.score - left.score);

  if (trendCandidates.length > 0) {
    const topTrend = trendCandidates[0];
    const markerLabel = getMarkerDisplayName(topTrend.marker, language);
    const trendVerb = topTrend.trend.direction === "rising" ? tr(language, "stijgend", "rising") : tr(language, "dalend", "falling");
    candidates.push({
      id: `trend-${topTrend.marker}`,
      question: tr(
        language,
        `Is mijn ${markerLabel} trend (${trendVerb}) iets om nu op te sturen?`,
        `Is my ${markerLabel} trend (${trendVerb}) something to act on now?`
      ),
      category: "trend",
      score: topTrend.score
    });
  }

  if (hasActiveProtocol) {
    candidates.push({
      id: "protocol-relevance",
      question: tr(
        language,
        "Verklaart mijn actieve protocol deze uitslagen?",
        "Does my active protocol explain these results?"
      ),
      category: "protocol",
      score: 2
    });
  }

  const deduped = dedupeByQuestion(candidates);
  const selected: ScoredSuggestion[] = [];

  const preferredOrder: SuggestionCategory[] = ["generic", "abnormal", "trend", "protocol", "delta"];
  preferredOrder.forEach((category) => {
    const top = pickTopByCategory(deduped, category);
    if (!top) {
      return;
    }
    if (selected.some((item) => item.question === top.question)) {
      return;
    }
    selected.push(top);
  });

  if (selected.length < 3) {
    const fill = [...deduped]
      .sort((left, right) => right.score - left.score)
      .filter((item) => !selected.some((picked) => picked.question === item.question))
      .slice(0, 5 - selected.length);
    selected.push(...fill);
  }

  return selected
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      question: item.question,
      category: item.category
    }));
};
