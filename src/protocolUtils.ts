import { frequencyPerWeekFromSelectionOrProtocol, injectionFrequencyLabel } from "./protocolStandards";
import {
  AppLanguage,
  CompoundEntry,
  InterventionSnapshot,
  LabReport,
  Protocol,
  ReportAnnotations,
  SupplementPeriod
} from "./types";
import {
  buildInterventionSnapshot,
  buildProtocolWithVersion,
  getLinkedInterventionId,
  getLinkedInterventionVersionId,
  normalizeInterventionSnapshot,
  resolveProtocolVersionByDate,
  resolveProtocolVersionById
} from "./protocolVersions";
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

const protocolFromSnapshot = (
  report: LabReport,
  snapshot: InterventionSnapshot
): Protocol => {
  const versionId = snapshot.versionId ?? `snapshot-version-${report.id}`;
  return {
    id: snapshot.interventionId ?? `snapshot-protocol-${report.id}`,
    name: snapshot.name,
    items: snapshot.items,
    compounds: snapshot.compounds,
    versions: [
      {
        id: versionId,
        name: snapshot.name,
        effectiveFrom: snapshot.effectiveFrom,
        items: snapshot.items,
        compounds: snapshot.compounds,
        notes: snapshot.notes,
        createdAt: report.createdAt
      }
    ],
    notes: snapshot.notes,
    createdAt: report.createdAt,
    updatedAt: report.createdAt
  };
};

export interface ResolvedInterventionLink {
  interventionId: string | null;
  interventionLabel: string;
  interventionVersionId: string | null;
  interventionSnapshot: InterventionSnapshot | null;
}

export const resolveInterventionLinkForReport = (
  protocolId: string | null,
  reportDate: string,
  protocols: Protocol[]
): ResolvedInterventionLink => {
  if (!protocolId) {
    return {
      interventionId: null,
      interventionLabel: "",
      interventionVersionId: null,
      interventionSnapshot: null
    };
  }
  const protocol = protocols.find((entry) => entry.id === protocolId) ?? null;
  if (!protocol) {
    return {
      interventionId: protocolId,
      interventionLabel: "",
      interventionVersionId: null,
      interventionSnapshot: null
    };
  }
  const resolvedVersion = resolveProtocolVersionByDate(protocol, reportDate);
  const resolvedLabel = resolvedVersion?.name?.trim() ? resolvedVersion.name : protocol.name;
  return {
    interventionId: protocol.id,
    interventionLabel: resolvedLabel,
    interventionVersionId: resolvedVersion?.id ?? null,
    interventionSnapshot: resolvedVersion ? buildInterventionSnapshot(protocol, resolvedVersion) : null
  };
};

export const withResolvedInterventionAnnotations = (
  annotations: ReportAnnotations,
  protocolId: string | null,
  reportDate: string,
  protocols: Protocol[]
): ReportAnnotations => {
  const resolved = resolveInterventionLinkForReport(protocolId, reportDate, protocols);
  const existingLabel = (annotations.interventionLabel ?? annotations.protocol ?? "").trim();
  const resolvedLabel = existingLabel || resolved.interventionLabel;
  return {
    ...annotations,
    interventionId: resolved.interventionId,
    interventionLabel: resolvedLabel,
    interventionVersionId: resolved.interventionVersionId,
    interventionSnapshot: resolved.interventionSnapshot,
    protocolId: resolved.interventionId,
    protocolVersionId: resolved.interventionVersionId,
    protocol: resolvedLabel
  };
};

export const getReportProtocol = (report: LabReport, protocols: Protocol[]): Protocol | null => {
  const snapshot = normalizeInterventionSnapshot(report.annotations.interventionSnapshot);
  if (snapshot) {
    return protocolFromSnapshot(report, snapshot);
  }

  const linkedId = getLinkedInterventionId(report.annotations);
  if (!linkedId) {
    return null;
  }
  const linkedProtocol = protocols.find((protocol) => protocol.id === linkedId) ?? null;
  if (!linkedProtocol) {
    return null;
  }
  const versionId = getLinkedInterventionVersionId(report.annotations);
  const resolvedVersion =
    resolveProtocolVersionById(linkedProtocol, versionId) ??
    resolveProtocolVersionByDate(linkedProtocol, report.testDate);
  if (!resolvedVersion) {
    return linkedProtocol;
  }
  return buildProtocolWithVersion(linkedProtocol, resolvedVersion);
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
