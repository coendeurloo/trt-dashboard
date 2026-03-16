import { useCallback, useEffect, useState } from "react";
import { dedupeMarkersInReport, markerSimilarity } from "../chartHelpers";
import { trLocale } from "../i18n";
import { inferDashboardChartPresetFromSettings } from "../chartHelpers";
import {
  AppSettings,
  LabReport,
  PersonalInfo,
  Protocol,
  ProtocolUpdateMode,
  ReportAnnotations,
  StoredAppData,
  SupplementPeriod,
  SymptomCheckIn
} from "../types";
import { clearAnalystMemory, coerceStoredAppData, loadAppData, saveAppData } from "../storage";
import { withResolvedInterventionAnnotations } from "../protocolUtils";
import {
  createProtocolVersion,
  normalizeInterventionSnapshot,
  normalizeProtocolMirrors,
  todayIsoDate
} from "../protocolVersions";
import { normalizeMarkerAliasOverrides, setMarkerAliasOverrides } from "../markerNormalization";
import { canMergeMarkersBySpecimen } from "../markerSpecimen";
import { canonicalizeMarker, normalizeMarkerMeasurement } from "../unitConversion";
import { createId, deriveAbnormalFlag, sortReportsChronological } from "../utils";
import { findBaselineOverlapMarkers, normalizeBaselineFlagsByMarkerOverlap } from "../baselineUtils";

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

const normalizeBaselineFlags = (reportsToNormalize: LabReport[]): LabReport[] =>
  normalizeBaselineFlagsByMarkerOverlap(reportsToNormalize);

const mergeProtocolsById = (existing: Protocol[], incoming: Protocol[]): Protocol[] => {
  const byId = new Map<string, Protocol>();
  existing.forEach((protocol) => byId.set(protocol.id, normalizeProtocolMirrors(protocol)));
  incoming.forEach((protocol) => byId.set(protocol.id, normalizeProtocolMirrors(protocol)));
  return Array.from(byId.values()).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

const resolveProtocols = (data: Pick<StoredAppData, "interventions" | "protocols">): Protocol[] =>
  data.interventions ?? data.protocols ?? [];

const resolveCheckIns = (data: Pick<StoredAppData, "wellbeingEntries" | "checkIns">): SymptomCheckIn[] =>
  data.wellbeingEntries ?? data.checkIns ?? [];

const withProtocols = <T extends StoredAppData>(data: T, protocols: Protocol[]): T => ({
  ...data,
  interventions: protocols,
  protocols
});

const withCheckIns = <T extends StoredAppData>(data: T, checkIns: SymptomCheckIn[]): T => ({
  ...data,
  wellbeingEntries: checkIns,
  checkIns
});

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
  const [appData, setAppData] = useState<StoredAppData>(() => {
    if (sharedData) {
      return sharedData;
    }
    if (isShareMode) {
      return coerceStoredAppData({});
    }
    return loadAppData();
  });
  const isNl = appData.settings.language === "nl";
  const tr = useCallback((nl: string, en: string): string => trLocale(appData.settings.language, nl, en), [appData.settings.language]);
  const samplingControlsEnabled = appData.settings.enableSamplingControls;

  useEffect(() => {
    if (!isShareMode || !sharedData) {
      return;
    }
    setAppData(coerceStoredAppData(sharedData));
  }, [isShareMode, sharedData]);

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
    setAppData((prev) => {
      const nextSettings: AppSettings = {
        ...prev.settings,
        ...patch
      };
      const visualSettingsTouched =
        patch.showReferenceRanges !== undefined ||
        patch.showAbnormalHighlights !== undefined ||
        patch.showAnnotations !== undefined ||
        patch.showTrtTargetZone !== undefined ||
        patch.showLongevityTargetZone !== undefined ||
        patch.yAxisMode !== undefined;

      if (visualSettingsTouched && patch.dashboardChartPreset === undefined) {
        nextSettings.dashboardChartPreset = inferDashboardChartPresetFromSettings({
          showReferenceRanges: nextSettings.showReferenceRanges,
          showAbnormalHighlights: nextSettings.showAbnormalHighlights,
          showAnnotations: nextSettings.showAnnotations,
          showTrtTargetZone: nextSettings.showTrtTargetZone,
          showLongevityTargetZone: nextSettings.showLongevityTargetZone,
          yAxisMode: nextSettings.yAxisMode
        });
      }

      return {
        ...prev,
        settings: nextSettings
      };
    });
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
      const normalizedAnchorState =
        annotations.supplementAnchorState === "inherit" ||
        annotations.supplementAnchorState === "anchor" ||
        annotations.supplementAnchorState === "none" ||
        annotations.supplementAnchorState === "unknown"
          ? annotations.supplementAnchorState
          : annotations.supplementOverrides === null
            ? "inherit"
            : annotations.supplementOverrides.length > 0
              ? "anchor"
              : "none";
      setAppData((prev) => ({
        ...prev,
        reports: prev.reports.map((report) =>
          report.id === reportId
            ? (() => {
                const selectedInterventionId = annotations.interventionId ?? annotations.protocolId ?? null;
                const selectedInterventionLabel = annotations.interventionLabel ?? annotations.protocol ?? "";
                const normalizedAnnotations: ReportAnnotations = {
                  ...annotations,
                  interventionId: selectedInterventionId,
                  interventionLabel: selectedInterventionLabel,
                  protocolId: selectedInterventionId,
                  protocol: selectedInterventionLabel,
                  supplementAnchorState: normalizedAnchorState,
                  supplementOverrides:
                    normalizedAnchorState === "anchor"
                      ? annotations.supplementOverrides ?? []
                      : normalizedAnchorState === "none"
                        ? []
                        : null
                };
                const resolved = withResolvedInterventionAnnotations(
                  normalizedAnnotations,
                  selectedInterventionId,
                  report.testDate,
                  resolveProtocols(prev)
                );
                const explicitSnapshot = normalizeInterventionSnapshot(
                  (annotations as ReportAnnotations & { interventionSnapshot?: unknown }).interventionSnapshot
                );
                if (!explicitSnapshot) {
                  return {
                    ...report,
                    annotations: resolved
                  };
                }
                const explicitInterventionId =
                  selectedInterventionId ?? explicitSnapshot.interventionId ?? resolved.interventionId ?? null;
                const explicitVersionRaw =
                  annotations.interventionVersionId ?? annotations.protocolVersionId ?? explicitSnapshot.versionId;
                const explicitVersionId =
                  typeof explicitVersionRaw === "string" && explicitVersionRaw.trim().length > 0
                    ? explicitVersionRaw
                    : explicitSnapshot.versionId ?? null;
                const explicitLabel = (
                  annotations.interventionLabel ??
                  annotations.protocol ??
                  explicitSnapshot.name
                ).trim() || explicitSnapshot.name;
                return {
                  ...report,
                  annotations: {
                    ...resolved,
                    interventionId: explicitInterventionId,
                    interventionLabel: explicitLabel,
                    interventionVersionId: explicitVersionId,
                    interventionSnapshot: explicitSnapshot,
                    protocolId: explicitInterventionId,
                    protocolVersionId: explicitVersionId,
                    protocol: explicitLabel
                  }
                };
              })()
            : report
        )
      }));
    },
    [isShareMode]
  );

  const addProtocol = useCallback(
    (protocol: Protocol) => {
      if (isShareMode) {
        return;
      }
      setAppData((prev) =>
        withProtocols(prev, mergeProtocolsById(resolveProtocols(prev), [normalizeProtocolMirrors(protocol)]))
      );
    },
    [isShareMode]
  );

  const updateProtocol = useCallback(
    (
      protocolId: string,
      updates: Partial<Protocol> & { effectiveFrom?: string },
      mode: ProtocolUpdateMode = "create_new"
    ) => {
      if (isShareMode) {
        return;
      }
      setAppData((prev) => {
        const currentProtocols = resolveProtocols(prev);
        const target = currentProtocols.find((protocol) => protocol.id === protocolId);
        if (!target) {
          return prev;
        }
        const now = new Date().toISOString();
        const requestedName = typeof updates.name === "string" ? updates.name.trim() : "";
        const nextName = requestedName || target.name;
        const nextItems = Array.isArray(updates.items)
          ? updates.items
          : Array.isArray(updates.compounds)
            ? updates.compounds
            : target.compounds;
        const nextNotes = typeof updates.notes === "string" ? updates.notes : target.notes;
        const nextVersion = createProtocolVersion({
          name: nextName,
          effectiveFrom: updates.effectiveFrom ?? todayIsoDate(),
          items: nextItems,
          notes: nextNotes,
          createdAt: now
        });
        const usageCount = prev.reports.filter(
          (report) => (report.annotations.interventionId ?? report.annotations.protocolId ?? null) === protocolId
        ).length;
        if (usageCount > 0 && mode === "create_new") {
          const forkedProtocol = normalizeProtocolMirrors({
            ...target,
            id: createId(),
            name: nextName,
            items: nextVersion.items,
            compounds: nextVersion.compounds,
            versions: [nextVersion],
            notes: nextVersion.notes,
            createdAt: now,
            updatedAt: now
          });
          return withProtocols(prev, mergeProtocolsById(currentProtocols, [forkedProtocol]));
        }
        const nextProtocols = currentProtocols.map((protocol) =>
          protocol.id === protocolId
            ? normalizeProtocolMirrors({
                ...protocol,
                name: nextName,
                items: nextVersion.items,
                compounds: nextVersion.compounds,
                versions: [nextVersion],
                notes: nextVersion.notes,
                updatedAt: now
              })
            : protocol
        );
        if (usageCount > 0 && mode === "replace_existing") {
          const nextReports = prev.reports.map((report) => {
            const linkedProtocolId = report.annotations.interventionId ?? report.annotations.protocolId ?? null;
            if (linkedProtocolId !== protocolId) {
              return report;
            }
            return {
              ...report,
              annotations: {
                ...report.annotations,
                interventionId: protocolId,
                interventionLabel: nextName,
                interventionVersionId: null,
                interventionSnapshot: null,
                protocolId: protocolId,
                protocolVersionId: null,
                protocol: nextName
              }
            };
          });
          return {
            ...withProtocols(prev, nextProtocols),
            reports: nextReports
          };
        }
        return withProtocols(prev, nextProtocols);
      });
    },
    [isShareMode]
  );

  const getProtocolUsageCount = useCallback(
    (protocolId: string): number =>
      appData.reports.filter(
        (report) => (report.annotations.interventionId ?? report.annotations.protocolId ?? null) === protocolId
      ).length,
    [appData.reports]
  );

  const deleteProtocol = useCallback(
    (protocolId: string): boolean => {
      if (isShareMode) {
        return false;
      }
      const usageCount = appData.reports.filter(
        (report) => (report.annotations.interventionId ?? report.annotations.protocolId ?? null) === protocolId
      ).length;
      if (usageCount > 0) {
        return false;
      }
      setAppData((prev) => withProtocols(prev, resolveProtocols(prev).filter((protocol) => protocol.id !== protocolId)));
      return true;
    },
    [appData.reports, isShareMode]
  );

  const setBaseline = useCallback(
    (reportId: string) => {
      if (isShareMode) {
        return;
      }
      const targetReport = appData.reports.find((report) => report.id === reportId);
      if (!targetReport) {
        return;
      }

      if (targetReport.isBaseline) {
        setAppData((prev) => ({
          ...prev,
          reports: prev.reports.map((report) =>
            report.id === reportId
              ? {
                  ...report,
                  isBaseline: false
                }
              : report
          )
        }));
        return;
      }

      const overlappingMarkers = findBaselineOverlapMarkers(targetReport, appData.reports);
      if (overlappingMarkers.length > 0) {
        return;
      }

      setAppData((prev) => ({
        ...prev,
        reports: prev.reports.map((report) =>
          report.id === reportId
            ? {
                ...report,
                isBaseline: true
              }
            : report
        )
      }));
    },
    [isShareMode, appData.reports]
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
        reports: normalizeBaselineFlags(
          prev.reports.map((report) => {
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
        )
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
          ...withCheckIns(withProtocols(incoming, resolveProtocols(incoming)), resolveCheckIns(incoming)),
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
        const mergedProtocols = mergeProtocolsById(resolveProtocols(prev), resolveProtocols(incoming));
        const mergedCheckIns = [...resolveCheckIns(prev), ...resolveCheckIns(incoming)].sort((left, right) =>
          left.date.localeCompare(right.date)
        );
        return {
          ...withCheckIns(withProtocols(prev, mergedProtocols), mergedCheckIns),
          reports: merged,
          supplementTimeline: [...prev.supplementTimeline, ...incoming.supplementTimeline].sort(
            (left, right) => left.startDate.localeCompare(right.startDate) || left.name.localeCompare(right.name)
          ),
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
    clearAnalystMemory();
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
      setAppData((prev) =>
        withCheckIns(
          prev,
          [...resolveCheckIns(prev), checkIn].sort((left, right) => left.date.localeCompare(right.date))
        )
      );
    },
    [isShareMode]
  );

  const updateCheckIn = useCallback(
    (id: string, updates: Partial<SymptomCheckIn>) => {
      if (isShareMode) {
        return;
      }
      setAppData((prev) =>
        withCheckIns(
          prev,
          resolveCheckIns(prev)
            .map((checkIn) => (checkIn.id === id ? { ...checkIn, ...updates, id: checkIn.id } : checkIn))
            .sort((left, right) => left.date.localeCompare(right.date))
        )
      );
    },
    [isShareMode]
  );

  const deleteCheckIn = useCallback(
    (id: string) => {
      if (isShareMode) {
        return;
      }
      setAppData((prev) => withCheckIns(prev, resolveCheckIns(prev).filter((checkIn) => checkIn.id !== id)));
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
      ...withCheckIns(withProtocols(appData, resolveProtocols(appData)), resolveCheckIns(appData)),
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

  const updatePersonalInfo = (patch: Partial<PersonalInfo>) => {
    setAppData((prev) => ({
      ...prev,
      personalInfo: { ...prev.personalInfo, ...patch }
    }));
  };

  return {
    appData,
    setAppData,
    updateSettings,
    updatePersonalInfo,
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
