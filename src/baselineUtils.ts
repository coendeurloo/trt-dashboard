import { LabReport } from "./types";

const normalizeMarkerName = (value: string): string => value.trim().toLowerCase();

const reportMarkerNames = (report: LabReport): string[] =>
  Array.from(
    new Set(
      report.markers
        .map((marker) => marker.canonicalMarker.trim())
        .filter((name) => name.length > 0)
    )
  );

const baselineMarkerIndex = (reports: LabReport[], excludeReportId?: string): Map<string, string> => {
  const markerByNormalized = new Map<string, string>();
  reports.forEach((report) => {
    if (!report.isBaseline || report.id === excludeReportId) {
      return;
    }
    reportMarkerNames(report).forEach((marker) => {
      const key = normalizeMarkerName(marker);
      if (!markerByNormalized.has(key)) {
        markerByNormalized.set(key, marker);
      }
    });
  });
  return markerByNormalized;
};

export const findBaselineOverlapMarkers = (report: LabReport, reports: LabReport[]): string[] => {
  const baselineMarkers = baselineMarkerIndex(reports, report.id);
  const overlaps = reportMarkerNames(report)
    .filter((marker) => baselineMarkers.has(normalizeMarkerName(marker)))
    .sort((left, right) => left.localeCompare(right));
  return Array.from(new Set(overlaps));
};

export const normalizeBaselineFlagsByMarkerOverlap = (reports: LabReport[]): LabReport[] => {
  const occupied = new Set<string>();

  return reports.map((report) => {
    if (!report.isBaseline) {
      return report;
    }
    const markers = reportMarkerNames(report);
    const hasOverlap = markers.some((marker) => occupied.has(normalizeMarkerName(marker)));
    if (hasOverlap) {
      return {
        ...report,
        isBaseline: false
      };
    }
    markers.forEach((marker) => occupied.add(normalizeMarkerName(marker)));
    return report;
  });
};

export const buildBaselineReportByMarker = (reports: LabReport[]): Map<string, LabReport> => {
  const byMarker = new Map<string, LabReport>();
  reports.forEach((report) => {
    if (!report.isBaseline) {
      return;
    }
    reportMarkerNames(report).forEach((marker) => {
      if (!byMarker.has(marker)) {
        byMarker.set(marker, report);
      }
    });
  });
  return byMarker;
};
