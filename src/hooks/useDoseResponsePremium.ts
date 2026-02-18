import { useEffect, useMemo, useState } from "react";
import { DosePrediction, applyDosePriorsToPredictions, isPersonalDosePredictionEligible } from "../analytics";
import { TOP_PRIOR_MARKERS, getLocalDosePriors } from "../data/dosePriors";
import {
  DOSE_RESPONSE_ASSISTED_LIMITS,
  checkDoseResponseAssistedLimit,
  getRemainingDoseResponseAssistedRuns,
  recordDoseResponseAssistedUsage
} from "../doseResponseLimits";
import { buildDosePriorRequestPayload, fetchDosePriorsFromApi } from "../doseResponsePriors";
import { DosePrior, UnitSystem } from "../types";
import { canonicalizeMarker } from "../unitConversion";

interface UseDoseResponsePremiumOptions {
  basePredictions: DosePrediction[];
  unitSystem: UnitSystem;
  enabled?: boolean;
}

interface CachedPriorsState {
  priors: DosePrior[];
  apiAssistedMarkers: string[];
  offlineFallback: boolean;
}

const priorCache = new Map<string, CachedPriorsState>();
const usageRecordedKeys = new Set<string>();

const shouldRequestAssistedPrior = (prediction: DosePrediction): boolean => {
  if (isPersonalDosePredictionEligible(prediction)) {
    return false;
  }
  return TOP_PRIOR_MARKERS.has(canonicalizeMarker(prediction.marker));
};

const buildFingerprint = (unitSystem: UnitSystem, predictions: DosePrediction[], candidateMarkers: string[]): string => {
  const candidateSet = new Set(candidateMarkers);
  const markerContext = predictions
    .filter((prediction) => candidateSet.has(prediction.marker))
    .map((prediction) => ({
      marker: prediction.marker,
      n: prediction.sampleCount,
      d: prediction.uniqueDoseLevels,
      r: prediction.correlationR === null ? null : Number(prediction.correlationR.toFixed(3)),
      cd: Number(prediction.currentDose.toFixed(2)),
      tm: prediction.troughSampleCount,
      am: prediction.allSampleCount
    }))
    .sort((left, right) => left.marker.localeCompare(right.marker));

  return JSON.stringify({
    unitSystem,
    markers: candidateMarkers.slice().sort((left, right) => left.localeCompare(right)),
    markerContext
  });
};

export const useDoseResponsePremium = ({
  basePredictions,
  unitSystem,
  enabled = true
}: UseDoseResponsePremiumOptions) => {
  const [loading, setLoading] = useState(false);
  const [offlinePriorFallback, setOfflinePriorFallback] = useState(false);
  const [apiAssistedMarkers, setApiAssistedMarkers] = useState<Set<string>>(new Set());
  const [activePriors, setActivePriors] = useState<DosePrior[]>([]);
  const [limitReason, setLimitReason] = useState("");
  const [remainingAssisted, setRemainingAssisted] = useState(getRemainingDoseResponseAssistedRuns());

  const candidatePredictions = useMemo(
    () => basePredictions.filter((prediction) => shouldRequestAssistedPrior(prediction)),
    [basePredictions]
  );
  const candidateMarkers = useMemo(
    () => candidatePredictions.map((prediction) => prediction.marker),
    [candidatePredictions]
  );
  const localFallbackPriors = useMemo(
    () =>
      getLocalDosePriors(
        candidatePredictions.map((prediction) => ({ marker: prediction.marker, unit: prediction.unit })),
        unitSystem
      ),
    [candidatePredictions, unitSystem]
  );
  const requestFingerprint = useMemo(
    () => buildFingerprint(unitSystem, basePredictions, candidateMarkers),
    [unitSystem, basePredictions, candidateMarkers]
  );

  useEffect(() => {
    if (!enabled) {
      setActivePriors(localFallbackPriors);
      setApiAssistedMarkers(new Set());
      setOfflinePriorFallback(false);
      setLimitReason("");
      setRemainingAssisted(getRemainingDoseResponseAssistedRuns());
      return;
    }

    if (candidateMarkers.length === 0) {
      setActivePriors([]);
      setApiAssistedMarkers(new Set());
      setOfflinePriorFallback(false);
      setLimitReason("");
      setRemainingAssisted(getRemainingDoseResponseAssistedRuns());
      return;
    }

    const cached = priorCache.get(requestFingerprint);
    if (cached) {
      setActivePriors(cached.priors);
      setApiAssistedMarkers(new Set(cached.apiAssistedMarkers));
      setOfflinePriorFallback(cached.offlineFallback);
      setLimitReason("");
      setRemainingAssisted(getRemainingDoseResponseAssistedRuns());
      return;
    }

    setLoading(true);
    setLimitReason("");
    setActivePriors(localFallbackPriors);
    setApiAssistedMarkers(new Set());
    setOfflinePriorFallback(false);

    let cancelled = false;

    const load = async () => {
      const limit = checkDoseResponseAssistedLimit();
      if (!limit.allowed) {
        if (!cancelled) {
          setLimitReason(limit.reason ?? "Assisted model limit reached.");
          setOfflinePriorFallback(true);
          setRemainingAssisted(getRemainingDoseResponseAssistedRuns());
          setLoading(false);
        }
        return;
      }

      try {
        const payload = buildDosePriorRequestPayload(basePredictions, unitSystem, candidateMarkers);
        const remotePriors = await fetchDosePriorsFromApi(payload);
        if (cancelled) {
          return;
        }

        const mergedMap = new Map<string, DosePrior>();
        localFallbackPriors.forEach((prior) => {
          mergedMap.set(`${canonicalizeMarker(prior.marker)}|${prior.unitSystem}|${prior.unit.toLowerCase()}`, prior);
        });
        remotePriors.forEach((prior) => {
          mergedMap.set(`${canonicalizeMarker(prior.marker)}|${prior.unitSystem}|${prior.unit.toLowerCase()}`, prior);
        });
        const mergedPriors = Array.from(mergedMap.values());
        const remoteMarkerSet = new Set(remotePriors.map((prior) => canonicalizeMarker(prior.marker)));
        const assistedMarkers = candidateMarkers.filter((marker) => remoteMarkerSet.has(canonicalizeMarker(marker)));

        if (!usageRecordedKeys.has(requestFingerprint)) {
          recordDoseResponseAssistedUsage();
          usageRecordedKeys.add(requestFingerprint);
        }

        const nextState: CachedPriorsState = {
          priors: mergedPriors,
          apiAssistedMarkers: assistedMarkers,
          offlineFallback: false
        };
        priorCache.set(requestFingerprint, nextState);
        setActivePriors(mergedPriors);
        setApiAssistedMarkers(new Set(assistedMarkers));
        setOfflinePriorFallback(false);
        setRemainingAssisted(getRemainingDoseResponseAssistedRuns());
      } catch {
        if (cancelled) {
          return;
        }
        setOfflinePriorFallback(true);
        setActivePriors(localFallbackPriors);
        setApiAssistedMarkers(new Set());
        setRemainingAssisted(getRemainingDoseResponseAssistedRuns());
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [basePredictions, candidateMarkers, enabled, localFallbackPriors, requestFingerprint, unitSystem]);

  const predictions = useMemo(
    () =>
      applyDosePriorsToPredictions(basePredictions, activePriors, {
        apiAssistedMarkers,
        offlinePriorFallback
      }),
    [basePredictions, activePriors, apiAssistedMarkers, offlinePriorFallback]
  );

  return {
    predictions,
    loading,
    offlinePriorFallback,
    limitReason,
    remainingAssisted,
    assistedLimits: DOSE_RESPONSE_ASSISTED_LIMITS,
    apiAssistedCount: apiAssistedMarkers.size
  };
};

export default useDoseResponsePremium;
