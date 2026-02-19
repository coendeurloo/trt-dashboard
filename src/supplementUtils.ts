import { LabReport, SupplementPeriod } from "./types";

const parseDay = (isoDate: string): number => {
  const timestamp = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
};

const normalizeSupplementKey = (item: SupplementPeriod): string =>
  `${item.name.trim().toLowerCase()}|${item.dose.trim().toLowerCase()}|${item.frequency.trim().toLowerCase()}`;

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

export const getEffectiveSupplements = (report: LabReport, timeline: SupplementPeriod[]): SupplementPeriod[] => {
  if (report.annotations.supplementOverrides) {
    return sortSupplementPeriods(report.annotations.supplementOverrides);
  }
  return getActiveSupplementsAtDate(timeline, report.testDate);
};

export const buildSupplementStackKey = (periods: SupplementPeriod[]): string[] =>
  Array.from(new Set(periods.map((period) => normalizeSupplementKey(period)))).sort((a, b) => a.localeCompare(b));
