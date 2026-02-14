import { format, isAfter, isBefore, parseISO, subMonths } from "date-fns";
import { LabReport, MarkerValue, TimeRangeKey } from "./types";

export const createId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const safeNumber = (value: string | number | null | undefined): number | null => {
  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return value;
    }
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim().replace(/,/g, ".").replace(/[^0-9.+-]/g, "");
  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

export const deriveAbnormalFlag = (
  value: number,
  referenceMin: number | null,
  referenceMax: number | null
): MarkerValue["abnormal"] => {
  if (referenceMin !== null && value < referenceMin) {
    return "low";
  }
  if (referenceMax !== null && value > referenceMax) {
    return "high";
  }
  if (referenceMin === null && referenceMax === null) {
    return "unknown";
  }
  return "normal";
};

export const formatDate = (dateValue: string): string => {
  try {
    return format(parseISO(dateValue), "dd MMM yyyy");
  } catch {
    return dateValue;
  }
};

export const withinRange = (
  testDate: string,
  range: TimeRangeKey,
  customStart: string,
  customEnd: string
): boolean => {
  if (range === "all") {
    return true;
  }

  const parsedDate = parseISO(testDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  if (range === "custom") {
    if (!customStart || !customEnd) {
      return true;
    }
    const start = parseISO(customStart);
    const end = parseISO(customEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return true;
    }
    return !isBefore(parsedDate, start) && !isAfter(parsedDate, end);
  }

  const monthsMap: Record<Exclude<TimeRangeKey, "all" | "custom">, number> = {
    "3m": 3,
    "6m": 6,
    "12m": 12
  };

  const fromDate = subMonths(new Date(), monthsMap[range]);
  return !isBefore(parsedDate, fromDate);
};

export const sortReportsChronological = (reports: LabReport[]): LabReport[] => {
  return [...reports].sort((a, b) => {
    return parseISO(a.testDate).getTime() - parseISO(b.testDate).getTime();
  });
};

export const clip = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};
