import { CompoundEntry } from "../types";

export interface ProtocolDraft {
  name: string;
  items: CompoundEntry[];
  compounds: CompoundEntry[];
  notes: string;
}

export const blankProtocolDraft = (): ProtocolDraft => ({
  name: "",
  items: [],
  compounds: [],
  notes: ""
});
