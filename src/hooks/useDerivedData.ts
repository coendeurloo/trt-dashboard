import { useMemo } from "react";
import {
  MarkerAlert,
  DosePrediction,
  MarkerSeriesPoint,
  MarkerTrendSummary,
  DoseCorrelationInsight,
  ProtocolImpactDoseEvent,
  ProtocolImpactSummary,
  TrtStabilityResult,
  buildAlerts,
  buildAlertsByMarker,
  buildDoseCorrelationInsights,
  buildDosePhaseBlocks,
  buildMarkerSeries,
  buildProtocolImpactDoseEvents,
  buildProtocolImpactSummary,
  buildTrtStabilitySeries,
  classifyMarkerTrend,
  computeTrtStabilityIndex,
  enrichReportsWithCalculatedMarkers,
  estimateDoseResponse,
  filterReportsBySampling
} from "../analytics";
import { CARDIO_PRIORITY_MARKERS, PRIMARY_MARKERS } from "../constants";
import { AppSettings, Protocol, StoredAppData, SupplementPeriod } from "../types";
import { safeNumber, sortReportsChronological, withinRange } from "../utils";
import { buildBaselineReportByMarker } from "../baselineUtils";

interface UseCoreDerivedDataOptions {
  appData: StoredAppData;
  protocols: Protocol[];
  samplingControlsEnabled: boolean;
}

interface UseDashboardDerivedDataOptions {
  enabled: boolean;
  visibleReports: ReturnType<typeof sortReportsChronological>;
  allMarkers: string[];
  settings: AppSettings;
  protocols: Protocol[];
  supplementTimeline: SupplementPeriod[];
}

interface UseProtocolDerivedDataOptions {
  enabled: boolean;
  visibleReports: ReturnType<typeof sortReportsChronological>;
  allMarkers: string[];
  settings: AppSettings;
  protocols: Protocol[];
  supplementTimeline: SupplementPeriod[];
  protocolWindowSize: number;
  doseResponseInput: string;
}

const EMPTY_ALERTS: MarkerAlert[] = [];
const EMPTY_ALERTS_BY_MARKER = {} as Record<string, MarkerAlert[]>;
const EMPTY_ALERT_SERIES = {} as Record<string, MarkerSeriesPoint[]>;
const EMPTY_TREND_BY_MARKER = {} as Record<string, MarkerTrendSummary>;
const EMPTY_PROTOCOL_SUMMARY: ProtocolImpactSummary = { events: [], insights: [] };
const EMPTY_PROTOCOL_EVENTS: ProtocolImpactDoseEvent[] = [];
const EMPTY_PROTOCOL_OVERVIEW: DoseCorrelationInsight[] = [];
const EMPTY_DOSE_PREDICTIONS: DosePrediction[] = [];
const EMPTY_STABILITY: TrtStabilityResult = {
  score: null,
  components: {}
};
const EMPTY_STABILITY_SERIES: MarkerSeriesPoint[] = [];

const useMarkerSeriesFactory = (
  visibleReports: ReturnType<typeof sortReportsChronological>,
  unitSystem: AppSettings["unitSystem"],
  protocols: Protocol[],
  supplementTimeline: SupplementPeriod[]
) => {
  return useMemo(() => {
    const cache = new Map<string, MarkerSeriesPoint[]>();
    return (marker: string): MarkerSeriesPoint[] => {
      const cached = cache.get(marker);
      if (cached) {
        return cached;
      }
      const nextSeries = buildMarkerSeries(
        visibleReports,
        marker,
        unitSystem,
        protocols,
        supplementTimeline
      );
      cache.set(marker, nextSeries);
      return nextSeries;
    };
  }, [visibleReports, unitSystem, protocols, supplementTimeline]);
};

export const useCoreDerivedData = ({
  appData,
  protocols,
  samplingControlsEnabled
}: UseCoreDerivedDataOptions) => {
  const reports = useMemo(
    () =>
      sortReportsChronological(
        enrichReportsWithCalculatedMarkers(appData.reports, {
          enableCalculatedFreeTestosterone: appData.settings.enableCalculatedFreeTestosterone,
          logCalculatedFreeTestosteroneDebug: appData.settings.enableCalculatedFreeTestosterone
        })
      ),
    [appData.reports, appData.settings.enableCalculatedFreeTestosterone]
  );

  const rangeFilteredReports = useMemo(
    () =>
      reports.filter((report) =>
        withinRange(
          report.testDate,
          appData.settings.timeRange,
          appData.settings.customRangeStart,
          appData.settings.customRangeEnd
        )
      ),
    [reports, appData.settings.timeRange, appData.settings.customRangeStart, appData.settings.customRangeEnd]
  );

  const visibleReports = useMemo(() => {
    if (!samplingControlsEnabled) {
      return rangeFilteredReports;
    }
    return filterReportsBySampling(rangeFilteredReports, appData.settings.samplingFilter);
  }, [rangeFilteredReports, samplingControlsEnabled, appData.settings.samplingFilter]);

  const allMarkers = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((report) => {
      report.markers.forEach((marker) => set.add(marker.canonicalMarker));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [reports]);

  const editableMarkers = useMemo(
    () =>
      allMarkers.filter((marker) =>
        reports.some((report) => report.markers.some((entry) => entry.canonicalMarker === marker && !entry.isCalculated))
      ),
    [allMarkers, reports]
  );

  const markerUsage = useMemo(() => {
    const byMarker = new Map<
      string,
      {
        marker: string;
        valueCount: number;
        reportCount: number;
      }
    >();

    reports.forEach((report) => {
      const seenInReport = new Set<string>();
      report.markers.forEach((entry) => {
        if (entry.isCalculated) {
          return;
        }
        const current = byMarker.get(entry.canonicalMarker) ?? {
          marker: entry.canonicalMarker,
          valueCount: 0,
          reportCount: 0
        };
        current.valueCount += 1;
        if (!seenInReport.has(entry.canonicalMarker)) {
          current.reportCount += 1;
          seenInReport.add(entry.canonicalMarker);
        }
        byMarker.set(entry.canonicalMarker, current);
      });
    });

    return Array.from(byMarker.values()).sort((a, b) => b.valueCount - a.valueCount || a.marker.localeCompare(b.marker));
  }, [reports]);

  const primaryMarkers = useMemo(() => {
    const base: string[] = [...PRIMARY_MARKERS];
    const selectedCardioMarker = CARDIO_PRIORITY_MARKERS.find((marker) => allMarkers.includes(marker)) ?? "LDL Cholesterol";
    if (!base.includes(selectedCardioMarker)) {
      base.push(selectedCardioMarker);
    }
    return Array.from(new Set(base));
  }, [allMarkers]);

  const baselineReports = useMemo(() => reports.filter((report) => report.isBaseline), [reports]);
  const baselineReportByMarker = useMemo(() => buildBaselineReportByMarker(baselineReports), [baselineReports]);
  const dosePhaseBlocks = useMemo(() => buildDosePhaseBlocks(visibleReports, protocols), [visibleReports, protocols]);

  return {
    reports,
    rangeFilteredReports,
    visibleReports,
    allMarkers,
    editableMarkers,
    markerUsage,
    primaryMarkers,
    baselineReports,
    baselineReportByMarker,
    dosePhaseBlocks
  };
};

export const useDashboardDerivedData = ({
  enabled,
  visibleReports,
  allMarkers,
  settings,
  protocols,
  supplementTimeline
}: UseDashboardDerivedDataOptions) => {
  const getMarkerSeries = useMarkerSeriesFactory(
    visibleReports,
    settings.unitSystem,
    protocols,
    supplementTimeline
  );

  const trendByMarker = useMemo(() => {
    if (!enabled) {
      return EMPTY_TREND_BY_MARKER;
    }
    return allMarkers.reduce(
      (acc, marker) => {
        acc[marker] = classifyMarkerTrend(getMarkerSeries(marker), marker);
        return acc;
      },
      {} as Record<string, MarkerTrendSummary>
    );
  }, [enabled, allMarkers, getMarkerSeries]);

  const alerts = useMemo(() => {
    if (!enabled) {
      return EMPTY_ALERTS;
    }
    return buildAlerts(visibleReports, allMarkers, settings.unitSystem, settings.language);
  }, [enabled, visibleReports, allMarkers, settings.unitSystem, settings.language]);

  const actionableAlerts = useMemo(() => {
    if (!enabled) {
      return EMPTY_ALERTS;
    }
    return alerts.filter((alert) => alert.actionNeeded);
  }, [enabled, alerts]);

  const positiveAlerts = useMemo(() => {
    if (!enabled) {
      return EMPTY_ALERTS;
    }
    return alerts.filter((alert) => !alert.actionNeeded);
  }, [enabled, alerts]);

  const alertsByMarker = useMemo(() => {
    if (!enabled) {
      return EMPTY_ALERTS_BY_MARKER;
    }
    return buildAlertsByMarker(actionableAlerts);
  }, [enabled, actionableAlerts]);

  const alertSeriesByMarker = useMemo(() => {
    if (!enabled) {
      return EMPTY_ALERT_SERIES;
    }
    return allMarkers.reduce(
      (acc, marker) => {
        acc[marker] = getMarkerSeries(marker);
        return acc;
      },
      {} as Record<string, MarkerSeriesPoint[]>
    );
  }, [enabled, allMarkers, getMarkerSeries]);

  const trtStability = useMemo(() => {
    if (!enabled) {
      return EMPTY_STABILITY;
    }
    return computeTrtStabilityIndex(visibleReports, settings.unitSystem);
  }, [enabled, visibleReports, settings.unitSystem]);

  const trtStabilitySeries = useMemo(() => {
    if (!enabled) {
      return EMPTY_STABILITY_SERIES;
    }
    return buildTrtStabilitySeries(visibleReports, settings.unitSystem);
  }, [enabled, visibleReports, settings.unitSystem]);

  return {
    trendByMarker,
    alerts,
    actionableAlerts,
    positiveAlerts,
    alertsByMarker,
    alertSeriesByMarker,
    trtStability,
    trtStabilitySeries
  };
};

export const useProtocolDerivedData = ({
  enabled,
  visibleReports,
  allMarkers,
  settings,
  protocols,
  supplementTimeline,
  protocolWindowSize,
  doseResponseInput
}: UseProtocolDerivedDataOptions) => {
  const protocolImpactSummary = useMemo(() => {
    if (!enabled) {
      return EMPTY_PROTOCOL_SUMMARY;
    }
    return buildProtocolImpactSummary(visibleReports, settings.unitSystem, protocols, supplementTimeline);
  }, [enabled, visibleReports, settings.unitSystem, protocols, supplementTimeline]);

  const protocolDoseEvents = useMemo(() => {
    if (!enabled) {
      return EMPTY_PROTOCOL_EVENTS;
    }
    return buildProtocolImpactDoseEvents(
      visibleReports,
      settings.unitSystem,
      protocolWindowSize,
      protocols,
      supplementTimeline
    );
  }, [enabled, visibleReports, settings.unitSystem, protocolWindowSize, protocols, supplementTimeline]);

  const protocolDoseOverview = useMemo(() => {
    if (!enabled) {
      return EMPTY_PROTOCOL_OVERVIEW;
    }
    return buildDoseCorrelationInsights(visibleReports, allMarkers, settings.unitSystem, protocols, supplementTimeline);
  }, [enabled, visibleReports, allMarkers, settings.unitSystem, protocols, supplementTimeline]);

  const dosePredictions = useMemo(() => {
    if (!enabled) {
      return EMPTY_DOSE_PREDICTIONS;
    }
    return estimateDoseResponse(visibleReports, allMarkers, settings.unitSystem, protocols, supplementTimeline);
  }, [enabled, visibleReports, allMarkers, settings.unitSystem, protocols, supplementTimeline]);

  const customDoseValue = useMemo(() => safeNumber(doseResponseInput), [doseResponseInput]);
  const hasCustomDose = customDoseValue !== null && customDoseValue >= 0;

  return {
    protocolImpactSummary,
    protocolDoseEvents,
    protocolDoseOverview,
    dosePredictions,
    customDoseValue,
    hasCustomDose
  };
};

interface UseDerivedDataOptions extends UseCoreDerivedDataOptions {
  supplementTimeline: SupplementPeriod[];
  protocolWindowSize: number;
  doseResponseInput: string;
}

export const useDerivedData = ({
  appData,
  protocols,
  supplementTimeline,
  samplingControlsEnabled,
  protocolWindowSize,
  doseResponseInput
}: UseDerivedDataOptions) => {
  const core = useCoreDerivedData({
    appData,
    protocols,
    samplingControlsEnabled
  });

  const dashboard = useDashboardDerivedData({
    enabled: true,
    visibleReports: core.visibleReports,
    allMarkers: core.allMarkers,
    settings: appData.settings,
    protocols,
    supplementTimeline
  });

  const protocol = useProtocolDerivedData({
    enabled: true,
    visibleReports: core.visibleReports,
    allMarkers: core.allMarkers,
    settings: appData.settings,
    protocols,
    supplementTimeline,
    protocolWindowSize,
    doseResponseInput
  });

  return {
    ...core,
    ...dashboard,
    ...protocol
  };
};

export default useDerivedData;
