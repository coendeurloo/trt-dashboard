import { useMemo } from "react";
import {
  MarkerSeriesPoint,
  MarkerTrendSummary,
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
import { AppSettings, Protocol, StoredAppData } from "../types";
import { safeNumber, sortReportsChronological, withinRange } from "../utils";

interface UseDerivedDataOptions {
  appData: StoredAppData;
  protocols: Protocol[];
  samplingControlsEnabled: boolean;
  protocolWindowSize: number;
  doseResponseInput: string;
}

export const useDerivedData = ({ appData, protocols, samplingControlsEnabled, protocolWindowSize, doseResponseInput }: UseDerivedDataOptions) => {
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

  const baselineReport = useMemo(() => reports.find((report) => report.isBaseline) ?? null, [reports]);
  const dosePhaseBlocks = useMemo(() => buildDosePhaseBlocks(visibleReports, protocols), [visibleReports, protocols]);

  const trendByMarker = useMemo(() => {
    return allMarkers.reduce(
      (acc, marker) => {
        const series = buildMarkerSeries(visibleReports, marker, appData.settings.unitSystem, protocols);
        acc[marker] = classifyMarkerTrend(series, marker);
        return acc;
      },
      {} as Record<string, MarkerTrendSummary>
    );
  }, [allMarkers, visibleReports, appData.settings.unitSystem]);

  const alerts = useMemo(
    () => buildAlerts(visibleReports, allMarkers, appData.settings.unitSystem, appData.settings.language),
    [visibleReports, allMarkers, appData.settings.unitSystem, appData.settings.language]
  );

  const actionableAlerts = useMemo(() => alerts.filter((alert) => alert.actionNeeded), [alerts]);
  const positiveAlerts = useMemo(() => alerts.filter((alert) => !alert.actionNeeded), [alerts]);
  const alertsByMarker = useMemo(() => buildAlertsByMarker(actionableAlerts), [actionableAlerts]);

  const alertSeriesByMarker = useMemo(() => {
    const markerSet = new Set<string>(alerts.map((alert) => alert.marker));
    return Array.from(markerSet).reduce(
      (acc, marker) => {
        acc[marker] = buildMarkerSeries(visibleReports, marker, appData.settings.unitSystem);
        return acc;
      },
      {} as Record<string, MarkerSeriesPoint[]>
    );
  }, [alerts, visibleReports, appData.settings.unitSystem]);

  const trtStability = useMemo(
    () => computeTrtStabilityIndex(visibleReports, appData.settings.unitSystem),
    [visibleReports, appData.settings.unitSystem]
  );

  const trtStabilitySeries = useMemo(
    () => buildTrtStabilitySeries(visibleReports, appData.settings.unitSystem),
    [visibleReports, appData.settings.unitSystem]
  );

  const protocolImpactSummary = useMemo(
    () => buildProtocolImpactSummary(visibleReports, appData.settings.unitSystem, protocols),
    [visibleReports, appData.settings.unitSystem, protocols]
  );

  const protocolDoseEvents = useMemo(
    () => buildProtocolImpactDoseEvents(visibleReports, appData.settings.unitSystem, protocolWindowSize, protocols),
    [visibleReports, appData.settings.unitSystem, protocolWindowSize, protocols]
  );

  const protocolDoseOverview = useMemo(
    () => buildDoseCorrelationInsights(visibleReports, allMarkers, appData.settings.unitSystem, protocols),
    [visibleReports, allMarkers, appData.settings.unitSystem, protocols]
  );

  const dosePredictions = useMemo(
    () => estimateDoseResponse(visibleReports, allMarkers, appData.settings.unitSystem, protocols),
    [visibleReports, allMarkers, appData.settings.unitSystem, protocols]
  );

  const customDoseValue = useMemo(() => safeNumber(doseResponseInput), [doseResponseInput]);
  const hasCustomDose = customDoseValue !== null && customDoseValue >= 0;

  return {
    reports,
    rangeFilteredReports,
    visibleReports,
    allMarkers,
    editableMarkers,
    markerUsage,
    primaryMarkers,
    baselineReport,
    dosePhaseBlocks,
    trendByMarker,
    alerts,
    actionableAlerts,
    positiveAlerts,
    alertsByMarker,
    alertSeriesByMarker,
    trtStability,
    trtStabilitySeries,
    protocolImpactSummary,
    protocolDoseEvents,
    protocolDoseOverview,
    dosePredictions,
    customDoseValue,
    hasCustomDose
  };
};

export default useDerivedData;
