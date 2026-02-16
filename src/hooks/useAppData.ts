import { useCallback, useEffect, useState } from "react";
import { dedupeMarkersInReport, markerSimilarity } from "../chartHelpers";
import { normalizeCompounds, normalizeInjectionFrequency, normalizeSupplementContext } from "../protocolStandards";
import { AppSettings, LabReport, MarkerValue, ReportAnnotations, StoredAppData } from "../types";
import { coerceStoredAppData, loadAppData, saveAppData } from "../storage";
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
  const tr = useCallback((nl: string, en: string): string => (isNl ? nl : en), [isNl]);
  const samplingControlsEnabled = appData.settings.enableSamplingControls;

  useEffect(() => {
    if (isShareMode) {
      return;
    }
    saveAppData(appData);
  }, [appData, isShareMode]);

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
      const compounds = normalizeCompounds({
        compounds: annotations.compounds,
        compound: annotations.compound,
        protocolFallback: annotations.protocol
      });
      const supplements = normalizeSupplementContext(annotations.supplementEntries, annotations.supplements);
      const normalizedAnnotations: ReportAnnotations = {
        ...annotations,
        compounds: compounds.compounds,
        compound: compounds.compound,
        injectionFrequency: normalizeInjectionFrequency(annotations.injectionFrequency),
        supplementEntries: supplements.supplementEntries,
        supplements: supplements.supplements
      };
      setAppData((prev) => ({
        ...prev,
        reports: prev.reports.map((report) =>
          report.id === reportId
            ? {
                ...report,
                annotations: samplingControlsEnabled
                  ? normalizedAnnotations
                  : {
                      ...normalizedAnnotations,
                      samplingTiming: "trough"
                    }
              }
            : report
        )
      }));
    },
    [isShareMode, samplingControlsEnabled]
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
          reports: normalizeBaselineFlags(importedReports)
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
          reports: merged
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
    setBaseline,
    remapMarker,
    importData,
    exportJson
  };
};

export default useAppData;
