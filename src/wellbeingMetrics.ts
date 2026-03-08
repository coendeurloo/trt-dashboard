import { SymptomCheckIn, UserProfile, WellbeingMetricId } from "./types";

export interface WellbeingMetricDefinition {
  id: WellbeingMetricId;
  labelNl: string;
  labelEn: string;
  icon: string;
  color: string;
}

export const WELLBEING_METRICS: Record<WellbeingMetricId, WellbeingMetricDefinition> = {
  energy: { id: "energy", labelNl: "Energie", labelEn: "Energy", icon: "⚡", color: "#06b6d4" },
  mood: { id: "mood", labelNl: "Stemming", labelEn: "Mood", icon: "💭", color: "#a855f7" },
  sleep: { id: "sleep", labelNl: "Slaap", labelEn: "Sleep", icon: "🌙", color: "#3b82f6" },
  libido: { id: "libido", labelNl: "Libido", labelEn: "Libido", icon: "❤️", color: "#ec4899" },
  motivation: { id: "motivation", labelNl: "Motivatie", labelEn: "Motivation", icon: "🎯", color: "#f97316" },
  recovery: { id: "recovery", labelNl: "Herstel", labelEn: "Recovery", icon: "🛌", color: "#22c55e" },
  stress: { id: "stress", labelNl: "Stress", labelEn: "Stress", icon: "🧠", color: "#f59e0b" },
  focus: { id: "focus", labelNl: "Focus", labelEn: "Focus", icon: "🎯", color: "#14b8a6" }
};

export const WELLBEING_PRESETS: Record<UserProfile, WellbeingMetricId[]> = {
  trt: ["energy", "mood", "sleep", "libido", "motivation"],
  enhanced: ["energy", "mood", "sleep", "libido", "recovery"],
  health: ["energy", "mood", "sleep", "stress", "recovery"],
  biohacker: ["energy", "sleep", "focus", "stress", "recovery"]
};

const legacyValueForMetric = (checkIn: SymptomCheckIn, metricId: WellbeingMetricId): number | null => {
  if (metricId === "energy") return checkIn.energy ?? null;
  if (metricId === "mood") return checkIn.mood ?? null;
  if (metricId === "sleep") return checkIn.sleep ?? null;
  if (metricId === "libido") return checkIn.libido ?? null;
  if (metricId === "motivation") return checkIn.motivation ?? null;
  return null;
};

export const getCheckInMetricValue = (checkIn: SymptomCheckIn, metricId: WellbeingMetricId): number | null => {
  const fromValues = checkIn.values?.[metricId];
  if (typeof fromValues === "number" && Number.isFinite(fromValues)) {
    return fromValues;
  }
  const legacy = legacyValueForMetric(checkIn, metricId);
  return typeof legacy === "number" && Number.isFinite(legacy) ? legacy : null;
};

export const getCheckInValues = (checkIn: SymptomCheckIn): Partial<Record<WellbeingMetricId, number>> => {
  const ids = Object.keys(WELLBEING_METRICS) as WellbeingMetricId[];
  return ids.reduce(
    (acc, metricId) => {
      const value = getCheckInMetricValue(checkIn, metricId);
      if (value !== null) {
        acc[metricId] = value;
      }
      return acc;
    },
    {} as Partial<Record<WellbeingMetricId, number>>
  );
};

export const getCheckInAverage = (checkIn: SymptomCheckIn): number | null => {
  const values = Object.values(getCheckInValues(checkIn)).filter((value): value is number => Number.isFinite(value));
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};
