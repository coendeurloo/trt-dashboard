import { LabReport, Protocol, StoredAppData, SupplementPeriod, SymptomCheckIn } from "./types";

export type UndoPatch = (current: StoredAppData) => StoredAppData;

export const restoreReportsPatch = (reports: LabReport[]): UndoPatch => (current) => ({
  ...current,
  reports
});

export const restoreSupplementsPatch = (supplementTimeline: SupplementPeriod[]): UndoPatch => (current) => ({
  ...current,
  supplementTimeline
});

export const restoreProtocolsPatch = (protocols: Protocol[], interventions: Protocol[]): UndoPatch => (current) => ({
  ...current,
  protocols,
  interventions
});

export const restoreCheckInsPatch = (checkIns: SymptomCheckIn[]): UndoPatch => (current) => ({
  ...current,
  checkIns,
  wellbeingEntries: checkIns
});
