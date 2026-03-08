import { frequencyPerWeekFromSelectionOrProtocol, injectionFrequencyLabel } from "./protocolStandards";
import { AppLanguage, CompoundEntry, LabReport, Protocol, SupplementPeriod } from "./types";
import { getEffectiveSupplements, supplementPeriodsToText } from "./supplementUtils";

export const PROTOCOL_ROUTE_OPTIONS = ["", "IM", "SubQ", "Oral", "Other"] as const;

const getPlanItems = (protocol: Protocol | null): CompoundEntry[] => {
  if (!protocol) {
    return [];
  }
  if (Array.isArray(protocol.items) && protocol.items.length > 0) {
    return protocol.items;
  }
  return Array.isArray(protocol.compounds) ? protocol.compounds : [];
};

const getEntryDoseText = (entry: CompoundEntry | null | undefined): string => {
  if (!entry) {
    return "";
  }
  return (entry.dose ?? entry.doseMg ?? "").trim();
};

export const getReportProtocol = (report: LabReport, protocols: Protocol[]): Protocol | null => {
  const linkedId = report.annotations.interventionId ?? report.annotations.protocolId;
  if (!linkedId) {
    return null;
  }
  return protocols.find((protocol) => protocol.id === linkedId) ?? null;
};

export const getPrimaryProtocolCompound = (protocol: Protocol | null): CompoundEntry | null => {
  const items = getPlanItems(protocol);
  if (items.length === 0) {
    return null;
  }
  const testosterone = items.find((entry) => entry.name.toLowerCase().includes("testosterone"));
  return testosterone ?? items[0] ?? null;
};

export const parseDoseMgFromText = (value: string): number | null => {
  const normalized = value.replace(/,/g, ".");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getProtocolDoseMgPerWeek = (protocol: Protocol | null): number | null => {
  const primary = getPrimaryProtocolCompound(protocol);
  if (!primary) {
    return null;
  }
  return parseDoseMgFromText(getEntryDoseText(primary));
};

export const getProtocolInjectionFrequency = (protocol: Protocol | null): string => {
  const primary = getPrimaryProtocolCompound(protocol);
  return primary?.frequency ?? "unknown";
};

export const getProtocolFrequencyPerWeek = (protocol: Protocol | null): number | null => {
  const primary = getPrimaryProtocolCompound(protocol);
  if (!primary) {
    return null;
  }
  return frequencyPerWeekFromSelectionOrProtocol(primary.frequency, getEntryDoseText(primary));
};

export const getProtocolCompoundsText = (protocol: Protocol | null): string => {
  const items = getPlanItems(protocol);
  if (items.length === 0) {
    return "";
  }
  return items
    .map((entry) => {
      const dose = getEntryDoseText(entry);
      return dose ? `${entry.name} (${dose})` : entry.name;
    })
    .join(" + ");
};

export const getReportSupplementsText = (report: LabReport, timeline: SupplementPeriod[], reports: LabReport[] = [report]): string =>
  supplementPeriodsToText(getEffectiveSupplements(report, timeline, reports));

export const getProtocolDisplayLabel = (protocol: Protocol | null): string => {
  if (!protocol) {
    return "";
  }
  return protocol.name || getProtocolCompoundsText(protocol);
};

export const getProtocolFrequencyLabel = (protocol: Protocol | null, language: AppLanguage): string => {
  return injectionFrequencyLabel(getProtocolInjectionFrequency(protocol), language);
};

export const getMostRecentlyUsedProtocolId = (reports: LabReport[]): string | null => {
  const sorted = [...reports].sort((left, right) => {
    const byDate = right.testDate.localeCompare(left.testDate);
    if (byDate !== 0) {
      return byDate;
    }
    return right.createdAt.localeCompare(left.createdAt);
  });

  const withProtocol = sorted.find((report) => (report.annotations.interventionId ?? report.annotations.protocolId) !== null);
  return withProtocol?.annotations.interventionId ?? withProtocol?.annotations.protocolId ?? null;
};
