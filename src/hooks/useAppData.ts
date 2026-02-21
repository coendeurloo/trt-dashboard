import { useCallback, useEffect, useState } from "react";
import { dedupeMarkersInReport, markerSimilarity } from "../chartHelpers";
import { trLocale } from "../i18n";
import {
  AppSettings,
  LabReport,
  MarkerValue,
  Protocol,
  ReportAnnotations,
  StoredAppData,
  SupplementPeriod,
  SymptomCheckIn
} from "../types";
import { coerceStoredAppData, loadAppData, saveAppData } from "../storage";
import {
  normalizeMarkerAliasOverrides,
  setMarkerAliasOverrides
} from "../markerNormalization";
import { canMergeMarkersBySpecimen } from "../markerSpecimen";
import { canonicalizeMarker, normalizeMarkerMeasurement } from "../unitConversion";
import { createId, deriveAbnormalFlag, sortReportsChronological } from "../utils";

export interface MarkerMergeSuggestion {
  sourceCanonical: string;
  targetCanonical: string;
  score: number;
}

export interface ImportResult {
  success: boolean;
  message: string;
  mergeSuggestions: MarkerMergeSuggestion[];
}

interface UseAppDataOptions {
  sharedData: StoredAppData | null;
  isShareMode: boolean;
}

const normalizeBaselineFlags = (reportsToNormalize: LabReport[]): LabReport[] => {
  let baselineSeen = false;
  return reportsToNormalize.map((report) => {
    if (!report.isBaseline) {
      return report;
    }
    if (!baselineSeen) {
      baselineSeen = true;
      return report;
    }
    return {
      ...report,
      isBaseline: false
    };
  });
};

const mergeProtocolsById = (existing: Protocol[], incoming: Protocol[]): Protocol[] => {
  const byId = new Map<string, Protocol>();
  existing.forEach((protocol) => byId.set(protocol.id, protocol));
  incoming.forEach((protocol) => byId.set(protocol.id, protocol));
  return Array.from(byId.values()).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

export const detectMarkerMergeSuggestions = (
  incomingCanonicalMarkers: string[],
  existingCanonicalMarkers: string[]
): MarkerMergeSuggestion[] => {
  const existingSet = new Set(existingCanonicalMarkers);
  const suggestions = incomingCanonicalMarkers
    .map((source) => {
      if (existingSet.has(source) || source === "Unknown Marker") {
        return null;
      }
      let bestTarget = "";
      let bestScore = 0;
      for (const candidate of existingCanonicalMarkers) {
        if (candidate === source) {
          continue;
        }
        if (!canMergeMarkersBySpecimen(source, candidate)) {
          continue;
        }
        const score = markerSimilarity(source, candidate);
        if (score > bestScore) {
          bestScore = score;
          bestTarget = candidate;
        }
      }
      if (!bestTarget || bestScore < 0.82) {
        return null;
      }
      return {
        sourceCanonical: source,
        targetCanonical: bestTarget,
        score: Number(bestScore.toFixed(2))
      } satisfies MarkerMergeSuggestion;
    })
    .filter((item): item is MarkerMergeSuggestion => item !== null);

  return Array.from(
    suggestions
      .reduce((map, suggestion) => {
        const key = `${suggestion.sourceCanonical}|${suggestion.targetCanonical}`;
        const existing = map.get(key);
        if (!existing || suggestion.score > existing.score) {
          map.set(key, suggestion);
        }
        return map;
      }, new Map<string, MarkerMergeSuggestion>())
      .values()
  );
};

export const useAppData = ({ sharedData, isShareMode }: UseAppDataOptions) => {
  const [appData, setAppData] = useState<StoredAppData>(() => (sharedData ? sharedData : loadAppData()));
  const isNl = appData.settings.language === "nl";
  const tr = useCallback((nl: string, en: string): string => trLocale(appData.settings.language, nl, en), [appData.settings.language]);
  const samplingControlsEnabled = appData.settings.enableSamplingControls;

  useEffect(() => {
    if (isShareMode) {
      return;
    }
    saveAppData(appData);
  }, [appData, isShareMode]);

  useEffect(() => {
    setMarkerAliasOverrides(appData.markerAliasOverrides);
  }, [appData.markerAliasOverrides]);

  const updateSettings = (patch: Partial<AppSettings>) => {
    setAppData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...patch
      }
    }));
  };

  const addReport = useCallback(
    (report: LabReport) => {
      if (isShareMode) {
        return;
      }
      setAppData((prev) => ({
        ...prev,
        reports: sortReportsChronological([...prev.reports, report])
      }));
    },
    [isShareMode]
  );

  const deleteReport = useCallback(
    (reportId: string) => {
      if (isShareMode) {
        return;
      }
      setAppData((prev) => ({
        ...prev,
        reports: prev.reports.filter((report) => report.id !== reportId)
      }));
    },
    [isShareMode]
  );

  const deleteReports = useCallback(
    (reportIds: string[]) => {
      if (isShareMode || reportIds.length === 0) {
        return;
      }
      const selected = new Set(reportIds);
      setAppData((prev) => ({
        ...prev,
        reports: prev.reports.filter((report) => !selected.has(report.id))
      }));
    },
    [isShareMode]
  );

  const updateReportAnnotations = useCallback(
    (reportId: string, annotations: ReportAnnotations) => {
      if (isShareMode) {
        return;
      }
      const normalizedAnnotations: ReportAnnotations = samplingControlsEnabled
        ? annotations
        : {
            ...annotations,
            samplingTiming: "trough"
          };

      setAppData((prev) => ({
        ...prev,
        reports: prev.reports.map((report) =>
          report.id === reportId
            ? {
                ...report,
                annotations: normalizedAnnotations
              }
            : report
        )
      }));
    },
    [isShareMode, samplingControlsEnabled]
  );

  const addProtocol = useCallback(
    (protocol: Protocol) => {
      if (isShareMode) {
        return;
      }
      setAppData((prev) => ({
        ...prev,
        protocols: mergeProtocolsById(prev.protocols, [protocol])
      }));
    },
    [isShareMode]
  );

  const updateProtocol = useCallback(
    (protocolId: string, updates: Partial<Protocol>) => {
      if (isShareMode) {
        return;
      }
      setAppData((prev) => ({
        ...prev,
        protocols: prev.protocols.map((protocol) =>
          protocol.id === protocolId
            ? {
                ...protocol,
                ...updates,
                id: protocol.id,
                updatedAt: new Date().toISOString()
              }
            : protocol
        )
      }));
    },
    [isShareMode]
  );

  const getProtocolUsageCount = useCallback(
    (protocolId: string): number => appData.reports.filter((report) => report.annotations.protocolId === protocolId).length,
    [appData.reports]
  );

  const deleteProtocol = useCallback(
    (protocolId: string): boolean => {
      if (isShareMode) {
        return false;
      }
      const usageCount = appData.reports.filter((report) => report.annotations.protocolId === protocolId).length;
      if (usageCount > 0) {
        return false;
      }
      setAppData((prev) => ({
        ...prev,
        protocols: prev.protocols.filter((protocol) => protocol.id !== protocolId)
      }));
      return true;
    },
    [appData.reports, isShareMode]
  );

  const setBaseline = useCallback(
    (reportId: string) => {
      if (isShareMode) {
        return;
      }
      setAppData((prev) => ({
        ...prev,
        reports: prev.reports.map((report) => ({
          ...report,
          isBaseline: report.id === reportId
        }))
      }));
    },
    [isShareMode]
  );

  const remapMarker = useCallback(
    (sourceCanonical: string, targetLabel: string) => {
      const cleanLabel = targetLabel.trim();
      if (!cleanLabel || isShareMode) {
        return;
      }
      const targetCanonical = canonicalizeMarker(cleanLabel);
      if (!canMergeMarkersBySpecimen(sourceCanonical, targetCanonical)) {
        return;
      }
      setAppData((prev) => ({
        ...prev,
        reports: prev.reports.map((report) => {
          const rewritten = report.markers.map((marker) => {
            if (marker.canonicalMarker !== sourceCanonical || marker.isCalculated) {
              return marker;
            }
            const normalized = normalizeMarkerMeasurement({
              canonicalMarker: targetCanonical,
              value: marker.value,
              unit: marker.unit,
              referenceMin: marker.referenceMin,
              referenceMax: marker.referenceMax
            });
            return {
              ...marker,
              marker: cleanLabel,
              canonicalMarker: targetCanonical,
              value: normalized.value,
              unit: normalized.unit,
              referenceMin: normalized.referenceMin,
              referenceMax: normalized.referenceMax,
              abnormal: deriveAbnormalFlag(normalized.value, normalized.referenceMin, normalized.referenceMax)
            };
          });
          return {
            ...report,
            markers: dedupeMarkersInReport(rewritten)
          };
        })
      }));
    },
    [isShareMode]
  );

  const upsertMarkerAliasOverrides = useCallback(
    (overrides: Record<string, string>) => {
      if (isShareMode) {
        return;
      }
      const normalized = normalizeMarkerAliasOverrides(overrides);
      if (Object.keys(normalized).length === 0) {
        return;
      }

      setAppData((prev) => {
        const merged = {
          ...prev.markerAliasOverrides,
          ...normalized
        };

        return {
          ...prev,
          markerAliasOverrides: merged
        };
      });
    },
    [isShareMode]
  );

  const importData = useCallback(
    (incomingRaw: unknown, mode: "merge" | "replace"): ImportResult => {
      if (isShareMode) {
        return {
          success: false,
          message: tr("Niet beschikbaar in gedeelde weergave.", "Not available in shared view."),
          mergeSuggestions: []
        };
      }

      const incoming = coerceStoredAppData(incomingRaw as Record<string, unknown>);
      const importedReports = sortReportsChronological(incoming.reports);
      const incomingCanonicalMarkers = Array.from(
        new Set(importedReports.flatMap((report) => report.markers.map((marker) => marker.canonicalMarker)))
      );
      const existingCanonicalMarkers = Array.from(
        new Set(appData.reports.flatMap((report) => report.markers.map((marker) => marker.canonicalMarker)))
      );

      if (mode === "replace") {
        const replaceConfirmed =
          typeof window === "undefined"
            ? true
            : window.confirm(
                tr(
                  "Dit vervangt al je huidige data. Weet je het zeker?",
                  "This will replace your current data. Are you sure?"
                )
              );
        if (!replaceConfirmed) {
          return {
            success: false,
            message: tr("Herstellen geannuleerd.", "Restore canceled."),
            mergeSuggestions: []
          };
        }

        setAppData({
          ...incoming,
          settings: {
            ...incoming.settings
          },
          reports: normalizeBaselineFlags(importedReports),
          markerAliasOverrides: incoming.markerAliasOverrides ?? {}
        });

        return {
          success: true,
          message: tr(
            `Backup hersteld: ${importedReports.length} rapporten geladen.`,
            `Backup restored: ${importedReports.length} reports loaded.`
          ),
          mergeSuggestions: []
        };
      }

      const mergeSuggestions = detectMarkerMergeSuggestions(incomingCanonicalMarkers, existingCanonicalMarkers);

      setAppData((prev) => {
        const byId = new Map<string, LabReport>();
        prev.reports.forEach((report) => {
          byId.set(report.id, report);
        });
        importedReports.forEach((report) => {
          byId.set(report.id, report);
        });
        const merged = normalizeBaselineFlags(sortReportsChronological(Array.from(byId.values())));
        return {
          ...prev,
          reports: merged,
          protocols: mergeProtocolsById(prev.protocols, incoming.protocols),
          supplementTimeline: [...prev.supplementTimeline, ...incoming.supplementTimeline].sort(
            (left, right) => left.startDate.localeCompare(right.startDate) || left.name.localeCompare(right.name)
          ),
          checkIns: [...prev.checkIns, ...incoming.checkIns].sort((left, right) => left.date.localeCompare(right.date)),
          markerAliasOverrides: {
            ...prev.markerAliasOverrides,
            ...incoming.markerAliasOverrides
          }
        };
      });

      return {
        success: true,
        message: tr(
          `Backup samengevoegd: ${importedReports.length} rapporten verwerkt.`,
          `Backup merged: processed ${importedReports.length} reports.`
        ),
        mergeSuggestions
      };
    },
    [appData.reports, isShareMode, tr]
  );

  const clearAllData = useCallback(() => {
    if (isShareMode) {
      return;
    }
    setAppData(coerceStoredAppData({}));
  }, [isShareMode]);

  const addSupplementPeriod = useCallback(
    (period: SupplementPeriod) => {
      if (isShareMode) {
        return;
      }
      setAppData((prev) => ({
        ...prev,
        supplementTimeline: [...prev.supplementTimeline, period].sort(
          (left, right) => left.startDate.localeCompare(right.startDate) || left.name.localeCompare(right.name)
        )
      }));
    },
    [isShareMode]
  );

  const updateSupplementPeriod = useCallback(
    (id: string, updates: Partial<SupplementPeriod>) => {
      if (isShareMode) {
        return;
      }
      setAppData((prev) => ({
        ...prev,
        supplementTimeline: prev.supplementTimeline
          .map((period) => (period.id === id ? { ...period, ...updates, id: period.id } : period))
          .sort((left, right) => left.startDate.localeCompare(right.startDate) || left.name.localeCompare(right.name))
      }));
    },
    [isShareMode]
  );

  const stopSupplement = useCallback(
    (id: string, endDate?: string) => {
      if (isShareMode) {
        return;
      }
      const fallbackDate = new Date().toISOString().slice(0, 10);
      setAppData((prev) => ({
        ...prev,
        supplementTimeline: prev.supplementTimeline.map((period) =>
          period.id === id
            ? {
                ...period,
                endDate: endDate && endDate.trim().length > 0 ? endDate : fallbackDate
              }
            : period
        )
      }));
    },
    [isShareMode]
  );

  const deleteSupplementPeriod = useCallback(
    (id: string) => {
      if (isShareMode) {
        return;
      }
      setAppData((prev) => ({
        ...prev,
        supplementTimeline: prev.supplementTimeline.filter((period) => period.id !== id)
      }));
    },
    [isShareMode]
  );

  const addCheckIn = useCallback(
    (checkIn: SymptomCheckIn) => {
      if (isShareMode) {
        return;
      }
      setAppData((prev) => ({
        ...prev,
        checkIns: [...prev.checkIns, checkIn].sort((left, right) => left.date.localeCompare(right.date))
      }));
    },
    [isShareMode]
  );

  const updateCheckIn = useCallback(
    (id: string, updates: Partial<SymptomCheckIn>) => {
      if (isShareMode) {
        return;
      }
      setAppData((prev) => ({
        ...prev,
        checkIns: prev.checkIns
          .map((checkIn) => (checkIn.id === id ? { ...checkIn, ...updates, id: checkIn.id } : checkIn))
          .sort((left, right) => left.date.localeCompare(right.date))
      }));
    },
    [isShareMode]
  );

  const deleteCheckIn = useCallback(
    (id: string) => {
      if (isShareMode) {
        return;
      }
      setAppData((prev) => ({
        ...prev,
        checkIns: prev.checkIns.filter((checkIn) => checkIn.id !== id)
      }));
    },
    [isShareMode]
  );

  const exportJson = useCallback(() => {
    const reportsForExport = appData.reports.map((report) => ({
      ...report,
      markers: report.markers
        .filter((marker) => appData.settings.enableCalculatedFreeTestosterone || !marker.isCalculated)
        .map((marker) => ({
          ...marker,
          source: marker.isCalculated ? "calculated" : "measured"
        }))
    }));
    const exportPayload = {
      ...appData,
      reports: reportsForExport
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `trt-lab-data-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [appData]);

  return {
    appData,
    setAppData,
    updateSettings,
    isNl,
    samplingControlsEnabled,
    addReport,
    deleteReport,
    deleteReports,
    updateReportAnnotations,
    addProtocol,
    updateProtocol,
    deleteProtocol,
    getProtocolUsageCount,
    setBaseline,
    remapMarker,
    upsertMarkerAliasOverrides,
    addSupplementPeriod,
    updateSupplementPeriod,
    stopSupplement,
    deleteSupplementPeriod,
    addCheckIn,
    updateCheckIn,
    deleteCheckIn,
    importData,
    clearAllData,
    exportJson
  };
};

export default useAppData;
