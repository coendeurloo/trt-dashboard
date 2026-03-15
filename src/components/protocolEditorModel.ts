import { CompoundEntry } from "../types";
import { todayIsoDate } from "../protocolVersions";

export interface ProtocolDraft {
  name: string;
  effectiveFrom: string;
  items: CompoundEntry[];
  compounds: CompoundEntry[];
  notes: string;
}

export const blankProtocolDraft = (): ProtocolDraft => ({
  name: "",
  effectiveFrom: todayIsoDate(),
  items: [],
  compounds: [],
  notes: ""
});
