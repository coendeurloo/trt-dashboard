import { frequencyPerWeekFromSelectionOrProtocol, injectionFrequencyLabel } from "./protocolStandards";
import { AppLanguage, CompoundEntry, LabReport, Protocol, SupplementPeriod } from "./types";
import { getEffectiveSupplements, supplementPeriodsToText } from "./supplementUtils";

export const PROTOCOL_ROUTE_OPTIONS = ["", "IM", "SubQ", "Oral", "Other"] as const;

export const getReportProtocol = (report: LabReport, protocols: Protocol[]): Protocol | null => {
  if (!report.annotations.protocolId) {
    return null;
  }
  return protocols.find((protocol) => protocol.id === report.annotations.protocolId) ?? null;
};

export const getPrimaryProtocolCompound = (protocol: Protocol | null): CompoundEntry | null => {
  if (!protocol || protocol.compounds.length === 0) {
    return null;
  }
  const testosterone = protocol.compounds.find((entry) => entry.name.toLowerCase().includes("testosterone"));
  return testosterone ?? protocol.compounds[0] ?? null;
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
  return parseDoseMgFromText(primary.doseMg);
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
  return frequencyPerWeekFromSelectionOrProtocol(primary.frequency, primary.doseMg);
};

export const getProtocolCompoundsText = (protocol: Protocol | null): string => {
  if (!protocol || protocol.compounds.length === 0) {
    return "";
  }
  return protocol.compounds
    .map((entry) => {
      const dose = entry.doseMg.trim();
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

  const withProtocol = sorted.find((report) => report.annotations.protocolId);
  return withProtocol?.annotations.protocolId ?? null;
};
