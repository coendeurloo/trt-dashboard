import { LabReport, ReportAnnotations, SupplementAnchorState, SupplementPeriod } from "./types";

const parseDay = (isoDate: string): number => {
  const timestamp = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
};

const normalizeSupplementKey = (item: SupplementPeriod): string =>
  `${item.name.trim().toLowerCase()}|${item.dose.trim().toLowerCase()}|${item.frequency.trim().toLowerCase()}`;

const sortReportsForSupplementResolution = (reports: LabReport[]): LabReport[] =>
  [...reports].sort(
    (left, right) =>
      left.testDate.localeCompare(right.testDate) ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id)
  );

export type EffectiveSupplementState = "anchor" | "none" | "unknown";

export interface ResolvedReportSupplementContext {
  reportId: string;
  anchorState: SupplementAnchorState;
  effectiveState: EffectiveSupplementState;
  effectiveSupplements: SupplementPeriod[];
  sourceAnchorReportId: string | null;
  sourceAnchorDate: string | null;
}

export const sortSupplementPeriods = (timeline: SupplementPeriod[]): SupplementPeriod[] =>
  [...timeline].sort(
    (left, right) =>
      left.startDate.localeCompare(right.startDate) ||
      (left.endDate ?? "9999-12-31").localeCompare(right.endDate ?? "9999-12-31") ||
      left.name.localeCompare(right.name)
  );

export const isSupplementPeriodActiveAtDate = (period: SupplementPeriod, date: string): boolean => {
  const day = parseDay(date);
  const startDay = parseDay(period.startDate);
  const endDay = period.endDate ? parseDay(period.endDate) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(day) || !Number.isFinite(startDay)) {
    return false;
  }
  if (!Number.isFinite(endDay) && period.endDate) {
    return false;
  }
  return startDay <= day && day <= endDay;
};

export const getActiveSupplementsAtDate = (timeline: SupplementPeriod[], date: string): SupplementPeriod[] =>
  sortSupplementPeriods(timeline.filter((period) => isSupplementPeriodActiveAtDate(period, date)));

export const getCurrentActiveSupplementStack = (timeline: SupplementPeriod[]): SupplementPeriod[] =>
  sortSupplementPeriods(timeline.filter((period) => period.endDate === null));

export const normalizeSupplementAnchorState = (
  annotations: Pick<ReportAnnotations, "supplementAnchorState" | "supplementOverrides">
): SupplementAnchorState => {
  if (
    annotations.supplementAnchorState === "inherit" ||
    annotations.supplementAnchorState === "anchor" ||
    annotations.supplementAnchorState === "none" ||
    annotations.supplementAnchorState === "unknown"
  ) {
    return annotations.supplementAnchorState;
  }
  if (annotations.supplementOverrides === null) {
    return "inherit";
  }
  return annotations.supplementOverrides.length > 0 ? "anchor" : "none";
};

export const resolveReportSupplementContexts = (
  reports: LabReport[],
  timeline: SupplementPeriod[]
): Record<string, ResolvedReportSupplementContext> => {
  const sortedReports = sortReportsForSupplementResolution(reports);
  const baseStack = getCurrentActiveSupplementStack(timeline);

  let currentState: EffectiveSupplementState = baseStack.length > 0 ? "anchor" : "none";
  let currentSupplements: SupplementPeriod[] = [...baseStack];
  let sourceAnchorReportId: string | null = null;
  let sourceAnchorDate: string | null = null;

  const contexts: Record<string, ResolvedReportSupplementContext> = {};

  sortedReports.forEach((report) => {
    const anchorState = normalizeSupplementAnchorState(report.annotations);

    if (anchorState === "anchor") {
      const anchoredSupplements = sortSupplementPeriods(report.annotations.supplementOverrides ?? []);
      if (anchoredSupplements.length > 0) {
        currentState = "anchor";
        currentSupplements = anchoredSupplements;
      } else {
        currentState = "none";
        currentSupplements = [];
      }
      sourceAnchorReportId = report.id;
      sourceAnchorDate = report.testDate;
    } else if (anchorState === "none") {
      currentState = "none";
      currentSupplements = [];
      sourceAnchorReportId = report.id;
      sourceAnchorDate = report.testDate;
    } else if (anchorState === "unknown") {
      currentState = "unknown";
      currentSupplements = [];
      sourceAnchorReportId = report.id;
      sourceAnchorDate = report.testDate;
    }

    contexts[report.id] = {
      reportId: report.id,
      anchorState,
      effectiveState: currentState,
      effectiveSupplements: [...currentSupplements],
      sourceAnchorReportId,
      sourceAnchorDate
    };
  });

  return contexts;
};

export const getResolvedSupplementContextForReport = (
  report: LabReport,
  reports: LabReport[],
  timeline: SupplementPeriod[]
): ResolvedReportSupplementContext => {
  const reportSet = reports.some((item) => item.id === report.id) ? reports : [...reports, report];
  const contexts = resolveReportSupplementContexts(reportSet, timeline);
  return (
    contexts[report.id] ?? {
      reportId: report.id,
      anchorState: normalizeSupplementAnchorState(report.annotations),
      effectiveState: "none",
      effectiveSupplements: [],
      sourceAnchorReportId: null,
      sourceAnchorDate: null
    }
  );
};

export const getCurrentInheritedSupplementContext = (
  reports: LabReport[],
  timeline: SupplementPeriod[]
): Pick<ResolvedReportSupplementContext, "effectiveState" | "effectiveSupplements" | "sourceAnchorReportId" | "sourceAnchorDate"> => {
  const sortedReports = sortReportsForSupplementResolution(reports);
  if (sortedReports.length === 0) {
    const baseStack = getCurrentActiveSupplementStack(timeline);
    return {
      effectiveState: baseStack.length > 0 ? "anchor" : "none",
      effectiveSupplements: baseStack,
      sourceAnchorReportId: null,
      sourceAnchorDate: null
    };
  }

  const latest = sortedReports[sortedReports.length - 1];
  const contexts = resolveReportSupplementContexts(sortedReports, timeline);
  const resolved = latest ? contexts[latest.id] : null;
  if (!resolved) {
    return {
      effectiveState: "none",
      effectiveSupplements: [],
      sourceAnchorReportId: null,
      sourceAnchorDate: null
    };
  }

  return {
    effectiveState: resolved.effectiveState,
    effectiveSupplements: resolved.effectiveSupplements,
    sourceAnchorReportId: resolved.sourceAnchorReportId,
    sourceAnchorDate: resolved.sourceAnchorDate
  };
};

export const supplementPeriodsToText = (periods: SupplementPeriod[]): string =>
  periods
    .map((period) => {
      const dose = period.dose.trim();
      const frequency = period.frequency.trim();
      if (dose && frequency && frequency !== "unknown") {
        return `${period.name} ${dose} ${frequency}`;
      }
      if (dose) {
        return `${period.name} ${dose}`;
      }
      if (frequency && frequency !== "unknown") {
        return `${period.name} ${frequency}`;
      }
      return period.name;
    })
    .join(", ");

export const getEffectiveSupplements = (
  report: LabReport,
  timeline: SupplementPeriod[],
  reports: LabReport[] = [report]
): SupplementPeriod[] => getResolvedSupplementContextForReport(report, reports, timeline).effectiveSupplements;

export const buildSupplementStackKey = (periods: SupplementPeriod[]): string[] =>
  Array.from(new Set(periods.map((period) => normalizeSupplementKey(period)))).sort((a, b) => a.localeCompare(b));
