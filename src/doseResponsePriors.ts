import { DosePrediction } from "./analytics";
import { DosePrior, UnitSystem } from "./types";

export interface DosePriorRequestContext {
  marker: string;
  currentDose: number | null;
  sampleCount: number;
  uniqueDoseLevels: number;
  correlationR: number | null;
  samplingModeDistribution: {
    trough: number;
    mixed: number;
  };
}

export interface DosePriorRequestPayload {
  unitSystem: UnitSystem;
  markers: string[];
  context: DosePriorRequestContext[];
}

interface DosePriorApiResponse {
  priors?: DosePrior[];
}

const round3 = (value: number): number => Number(value.toFixed(3));

export const buildDosePriorRequestPayload = (
  predictions: DosePrediction[],
  unitSystem: UnitSystem,
  markers: string[]
): DosePriorRequestPayload => {
  const markerSet = new Set(markers);
  const context = predictions
    .filter((prediction) => markerSet.has(prediction.marker))
    .map((prediction) => ({
      marker: prediction.marker,
      currentDose: Number.isFinite(prediction.currentDose) ? round3(prediction.currentDose) : null,
      sampleCount: prediction.sampleCount,
      uniqueDoseLevels: prediction.uniqueDoseLevels,
      correlationR: prediction.correlationR === null ? null : round3(prediction.correlationR),
      samplingModeDistribution: {
        trough: prediction.troughSampleCount,
        mixed: Math.max(0, prediction.allSampleCount - prediction.troughSampleCount)
      }
    }));

  return {
    unitSystem,
    markers,
    context
  };
};

export const fetchDosePriorsFromApi = async (payload: DosePriorRequestPayload): Promise<DosePrior[]> => {
  let response: Response;
  try {
    response = await fetch("/api/dose/priors", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new Error("DOSE_PRIOR_PROXY_UNREACHABLE");
  }

  const responseText = await response.text();
  let body: DosePriorApiResponse = {};
  try {
    body = responseText ? (JSON.parse(responseText) as DosePriorApiResponse) : {};
  } catch {
    body = {};
  }

  if (!response.ok) {
    throw new Error(`DOSE_PRIOR_REQUEST_FAILED:${response.status}`);
  }

  return Array.isArray(body.priors) ? body.priors : [];
};
