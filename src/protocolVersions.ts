import { createId } from "./utils";
import { CompoundEntry, InterventionSnapshot, Protocol, ProtocolVersion, ReportAnnotations } from "./types";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const todayIsoDate = (): string => new Date().toISOString().slice(0, 10);

const normalizeIsoDate = (value: unknown, fallback: string): string => {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!ISO_DATE_PATTERN.test(trimmed)) {
    return fallback;
  }
  const parsed = Date.parse(`${trimmed}T00:00:00Z`);
  return Number.isFinite(parsed) ? trimmed : fallback;
};

const toIsoDateFromDateTime = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (ISO_DATE_PATTERN.test(trimmed)) {
    return normalizeIsoDate(trimmed, "");
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
};

const normalizeCompoundEntry = (value: CompoundEntry): CompoundEntry | null => {
  const name = String(value?.name ?? "").trim();
  if (!name) {
    return null;
  }
  const dose = String(value?.dose ?? value?.doseMg ?? "").trim();
  const frequency = String(value?.frequency ?? "unknown").trim() || "unknown";
  const route = String(value?.route ?? "").trim();
  return {
    name,
    dose,
    doseMg: dose,
    frequency,
    route
  };
};

export const cloneCompoundEntries = (values: CompoundEntry[]): CompoundEntry[] =>
  (Array.isArray(values) ? values : [])
    .map((value) => normalizeCompoundEntry(value))
    .filter((entry): entry is CompoundEntry => entry !== null);

const normalizeProtocolVersion = (
  value: Partial<ProtocolVersion>,
  fallbackEffectiveFrom: string,
  fallbackCreatedAt: string,
  fallbackName: string
): ProtocolVersion | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawItems = Array.isArray(value.items)
    ? value.items
    : Array.isArray(value.compounds)
      ? value.compounds
      : [];
  const items = cloneCompoundEntries(rawItems);
  const normalizedCreatedAt =
    typeof value.createdAt === "string" && value.createdAt.trim().length > 0 ? value.createdAt : fallbackCreatedAt;
  const effectiveFrom = normalizeIsoDate(value.effectiveFrom, fallbackEffectiveFrom);
  return {
    id: typeof value.id === "string" && value.id.trim().length > 0 ? value.id : createId(),
    name: typeof value.name === "string" && value.name.trim().length > 0 ? value.name.trim() : fallbackName,
    effectiveFrom,
    items,
    compounds: items,
    notes: typeof value.notes === "string" ? value.notes : "",
    createdAt: normalizedCreatedAt
  };
};

const fallbackEffectiveFrom = (protocol: Partial<Protocol>): string =>
  toIsoDateFromDateTime(protocol.updatedAt) ??
  toIsoDateFromDateTime(protocol.createdAt) ??
  todayIsoDate();

export const sortProtocolVersions = (versions: ProtocolVersion[]): ProtocolVersion[] =>
  [...versions].sort(
    (left, right) =>
      left.effectiveFrom.localeCompare(right.effectiveFrom) ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id)
  );

export const ensureProtocolVersions = (protocol: Partial<Protocol>): ProtocolVersion[] => {
  const baseCreatedAt =
    typeof protocol.createdAt === "string" && protocol.createdAt.trim().length > 0
      ? protocol.createdAt
      : new Date().toISOString();
  const baseEffectiveFrom = fallbackEffectiveFrom(protocol);
  const baseName = typeof protocol.name === "string" ? protocol.name.trim() : "";
  const explicitVersions = Array.isArray(protocol.versions) ? protocol.versions : [];
  const normalizedVersions = explicitVersions
    .map((version) => normalizeProtocolVersion(version, baseEffectiveFrom, baseCreatedAt, baseName))
    .filter((version): version is ProtocolVersion => version !== null);

  if (normalizedVersions.length > 0) {
    return sortProtocolVersions(normalizedVersions);
  }

  const rawItems = Array.isArray(protocol.items)
    ? protocol.items
    : Array.isArray(protocol.compounds)
      ? protocol.compounds
      : [];
  const items = cloneCompoundEntries(rawItems);
  return [
    {
      id: createId(),
      name: baseName,
      effectiveFrom: baseEffectiveFrom,
      items,
      compounds: items,
      notes: typeof protocol.notes === "string" ? protocol.notes : "",
      createdAt: baseCreatedAt
    }
  ];
};

export const getLatestProtocolVersion = (protocol: Partial<Protocol>): ProtocolVersion | null => {
  const versions = ensureProtocolVersions(protocol);
  return versions.length > 0 ? versions[versions.length - 1] ?? null : null;
};

export const resolveProtocolVersionByDate = (protocol: Partial<Protocol>, reportDate: string): ProtocolVersion | null => {
  const versions = ensureProtocolVersions(protocol);
  if (versions.length === 0) {
    return null;
  }
  const normalizedDate = normalizeIsoDate(reportDate, todayIsoDate());
  const applicable = versions.filter((version) => version.effectiveFrom <= normalizedDate);
  return applicable[applicable.length - 1] ?? versions[0] ?? null;
};

export const resolveProtocolVersionById = (
  protocol: Partial<Protocol>,
  versionId: string | null | undefined
): ProtocolVersion | null => {
  if (!versionId || !versionId.trim()) {
    return null;
  }
  const versions = ensureProtocolVersions(protocol);
  return versions.find((version) => version.id === versionId) ?? null;
};

export const buildProtocolWithVersion = (protocol: Protocol, version: ProtocolVersion): Protocol => {
  const versions = ensureProtocolVersions(protocol);
  const items = cloneCompoundEntries(Array.isArray(version.items) ? version.items : version.compounds);
  return {
    ...protocol,
    name: version.name || protocol.name,
    items,
    compounds: items,
    notes: version.notes,
    versions
  };
};

export const createProtocolVersion = (input: {
  name?: string;
  effectiveFrom: string;
  items: CompoundEntry[];
  notes: string;
  id?: string;
  createdAt?: string;
}): ProtocolVersion => {
  const createdAt = input.createdAt && input.createdAt.trim().length > 0 ? input.createdAt : new Date().toISOString();
  const items = cloneCompoundEntries(input.items);
  return {
    id: input.id && input.id.trim().length > 0 ? input.id : createId(),
    name: typeof input.name === "string" && input.name.trim().length > 0 ? input.name.trim() : "",
    effectiveFrom: normalizeIsoDate(input.effectiveFrom, todayIsoDate()),
    items,
    compounds: items,
    notes: input.notes,
    createdAt
  };
};

export const normalizeProtocolMirrors = (protocol: Protocol): Protocol => {
  const versions = ensureProtocolVersions(protocol);
  const latest = versions[versions.length - 1] ?? createProtocolVersion({
    name: protocol.name,
    effectiveFrom: todayIsoDate(),
    items: protocol.compounds,
    notes: protocol.notes,
    createdAt: protocol.createdAt
  });
  return {
    ...protocol,
    name: latest.name || protocol.name,
    items: cloneCompoundEntries(latest.items),
    compounds: cloneCompoundEntries(latest.compounds),
    notes: latest.notes,
    versions
  };
};

export const getLinkedInterventionId = (annotations: Partial<ReportAnnotations> | null | undefined): string | null => {
  const raw = annotations?.interventionId ?? annotations?.protocolId;
  return typeof raw === "string" && raw.trim().length > 0 ? raw : null;
};

export const getLinkedInterventionVersionId = (
  annotations: Partial<ReportAnnotations> | null | undefined
): string | null => {
  const raw = annotations?.interventionVersionId ?? annotations?.protocolVersionId;
  return typeof raw === "string" && raw.trim().length > 0 ? raw : null;
};

export const buildInterventionSnapshot = (protocol: Protocol, version: ProtocolVersion): InterventionSnapshot => {
  const compounds = cloneCompoundEntries(Array.isArray(version.compounds) ? version.compounds : version.items);
  return {
    interventionId: protocol.id,
    versionId: version.id,
    name: version.name || protocol.name,
    items: compounds,
    compounds,
    notes: version.notes,
    effectiveFrom: normalizeIsoDate(version.effectiveFrom, todayIsoDate())
  };
};

export const normalizeInterventionSnapshot = (value: unknown): InterventionSnapshot | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Partial<InterventionSnapshot>;
  const rawItems = Array.isArray(row.items)
    ? row.items
    : Array.isArray(row.compounds)
      ? row.compounds
      : [];
  const compounds = cloneCompoundEntries(rawItems);
  if (typeof row.name !== "string" || row.name.trim().length === 0) {
    return null;
  }
  return {
    interventionId: typeof row.interventionId === "string" && row.interventionId.trim().length > 0 ? row.interventionId : null,
    versionId: typeof row.versionId === "string" && row.versionId.trim().length > 0 ? row.versionId : null,
    name: row.name.trim(),
    items: compounds,
    compounds,
    notes: typeof row.notes === "string" ? row.notes : "",
    effectiveFrom: normalizeIsoDate(row.effectiveFrom, todayIsoDate())
  };
};
