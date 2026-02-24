import { MarkerSeriesPoint } from "./analytics";
import { UnitSystem } from "./types";

export interface PredictiveAlert {
  marker: string;
  unit: string;
  currentValue: number;
  predictedValue: number;
  predictedDate: string;
  daysUntil: number;
  direction: "rising" | "falling";
  threshold: number;
  thresholdLabel: string;
  confidence: "low" | "medium" | "high";
  narrativeEn: string;
  narrativeNl: string;
}

interface ThresholdDef {
  marker: string;
  thresholdEu: number;
  thresholdUs: number;
  unitEu: string;
  unitUs: string;
  direction: "rising" | "falling";
  labelEn: string;
  labelNl: string;
}

const DAY_MS = 86_400_000;

const PREDICTIVE_THRESHOLDS: ThresholdDef[] = [
  {
    marker: "Hematocrit",
    thresholdEu: 52,
    thresholdUs: 52,
    unitEu: "%",
    unitUs: "%",
    direction: "rising",
    labelEn: "polycythemia concern level",
    labelNl: "polycytemie waakdrempel"
  },
  {
    marker: "Hematocrit",
    thresholdEu: 54,
    thresholdUs: 54,
    unitEu: "%",
    unitUs: "%",
    direction: "rising",
    labelEn: "clinical stop threshold",
    labelNl: "klinische stopdrempel"
  },
  {
    marker: "PSA",
    thresholdEu: 4.0,
    thresholdUs: 4.0,
    unitEu: "ug/L",
    unitUs: "ng/mL",
    direction: "rising",
    labelEn: "urologist referral threshold",
    labelNl: "uroloog verwijsdrempel"
  },
  {
    marker: "LDL Cholesterol",
    thresholdEu: 4.0,
    thresholdUs: 155,
    unitEu: "mmol/L",
    unitUs: "mg/dL",
    direction: "rising",
    labelEn: "elevated cardiovascular risk level",
    labelNl: "verhoogd cardiovasculair risico"
  },
  {
    marker: "Testosterone",
    thresholdEu: 12.1,
    thresholdUs: 350,
    unitEu: "nmol/L",
    unitUs: "ng/dL",
    direction: "falling",
    labelEn: "lower therapeutic target (trough)",
    labelNl: "ondergrens therapeutisch doel (dal)"
  },
  {
    marker: "ALT",
    thresholdEu: 45,
    thresholdUs: 45,
    unitEu: "U/L",
    unitUs: "U/L",
    direction: "rising",
    labelEn: "upper reference limit",
    labelNl: "bovengrens referentiewaarde"
  },
  {
    marker: "Ferritine",
    thresholdEu: 300,
    thresholdUs: 300,
    unitEu: "ug/L",
    unitUs: "ng/mL",
    direction: "rising",
    labelEn: "upper reference limit",
    labelNl: "bovengrens referentiewaarde"
  }
];

const linearSlope = (points: Array<{ dateMs: number; value: number }>): number => {
  if (points.length < 2) {
    return 0;
  }
  const n = points.length;
  const xs = points.map((point) => point.dateMs / DAY_MS);
  const ys = points.map((point) => point.value);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n;
  const numerator = xs.reduce((sum, x, index) => sum + (x - meanX) * (ys[index] - meanY), 0);
  const denominator = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  return denominator === 0 ? 0 : numerator / denominator;
};

const toPredictiveConfidence = (pointCount: number): PredictiveAlert["confidence"] => {
  if (pointCount >= 4) {
    return "high";
  }
  if (pointCount === 3) {
    return "medium";
  }
  return "low";
};

export const buildPredictiveAlerts = (
  seriesByMarker: Record<string, MarkerSeriesPoint[]>,
  unitSystem: UnitSystem
): PredictiveAlert[] => {
  const alerts: PredictiveAlert[] = [];

  for (const def of PREDICTIVE_THRESHOLDS) {
    const series = seriesByMarker[def.marker];
    if (!series || series.length < 2) {
      continue;
    }

    const sorted = [...series].sort((left, right) => left.date.localeCompare(right.date));
    const currentPoint = sorted[sorted.length - 1];
    const currentValue = currentPoint.value;
    const currentUnit = currentPoint.unit;
    const threshold = unitSystem === "us" ? def.thresholdUs : def.thresholdEu;
    const thresholdUnit = unitSystem === "us" ? def.unitUs : def.unitEu;

    const slope = linearSlope(
      sorted.map((point) => ({
        dateMs: new Date(point.date).getTime(),
        value: point.value
      }))
    );
    if (!Number.isFinite(slope) || slope === 0) {
      continue;
    }

    if (def.direction === "rising" && slope <= 0) {
      continue;
    }
    if (def.direction === "falling" && slope >= 0) {
      continue;
    }
    if (def.direction === "rising" && currentValue >= threshold) {
      continue;
    }
    if (def.direction === "falling" && currentValue <= threshold) {
      continue;
    }

    const projectedDays = Math.round(Math.abs((threshold - currentValue) / slope));
    if (!Number.isFinite(projectedDays) || projectedDays <= 0 || projectedDays > 730) {
      continue;
    }

    const lastDateMs = new Date(currentPoint.date).getTime();
    const predictedDate = new Date(lastDateMs + projectedDays * DAY_MS).toISOString().slice(0, 10);
    const predictedValue = Number((currentValue + slope * projectedDays).toFixed(2));
    const ratePerMonth = Math.abs(Number((slope * 30).toFixed(2)));
    const monthsUntil = Math.max(1, Math.round(projectedDays / 30));
    const timeEn =
      projectedDays <= 45
        ? `within ${Math.ceil(projectedDays / 7)} weeks`
        : `in approximately ${monthsUntil} month${monthsUntil !== 1 ? "s" : ""}`;
    const timeNl =
      projectedDays <= 45
        ? `binnen ${Math.ceil(projectedDays / 7)} weken`
        : `over ongeveer ${monthsUntil} maand${monthsUntil !== 1 ? "en" : ""}`;

    const narrativeEn =
      def.direction === "rising"
        ? `Based on your last ${sorted.length} measurements, ${def.marker} is trending upward at ~${ratePerMonth} ${currentUnit}/month. If you stay on your current protocol, it could reach the ${def.labelEn} of ${threshold} ${thresholdUnit} ${timeEn}.`
        : `Based on your last ${sorted.length} measurements, ${def.marker} is trending downward at ~${ratePerMonth} ${currentUnit}/month. If you stay on your current protocol, it could fall below the ${def.labelEn} of ${threshold} ${thresholdUnit} ${timeEn}.`;
    const narrativeNl =
      def.direction === "rising"
        ? `Op basis van je laatste ${sorted.length} metingen stijgt ${def.marker} met ~${ratePerMonth} ${currentUnit}/maand. Als je op dit protocol blijft, bereikt het de ${def.labelNl} van ${threshold} ${thresholdUnit} ${timeNl}.`
        : `Op basis van je laatste ${sorted.length} metingen daalt ${def.marker} met ~${ratePerMonth} ${currentUnit}/maand. Als je op dit protocol blijft, zakt het onder de ${def.labelNl} van ${threshold} ${thresholdUnit} ${timeNl}.`;

    alerts.push({
      marker: def.marker,
      unit: currentUnit,
      currentValue,
      predictedValue,
      predictedDate,
      daysUntil: projectedDays,
      direction: def.direction,
      threshold,
      thresholdLabel: def.labelEn,
      confidence: toPredictiveConfidence(sorted.length),
      narrativeEn,
      narrativeNl
    });
  }

  alerts.sort((left, right) => left.daysUntil - right.daysUntil);

  const seenMarkers = new Set<string>();
  return alerts.filter((alert) => {
    if (seenMarkers.has(alert.marker)) {
      return false;
    }
    seenMarkers.add(alert.marker);
    return true;
  });
};
