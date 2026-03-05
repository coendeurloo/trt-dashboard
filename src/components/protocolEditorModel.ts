import { CompoundEntry } from "../types";

export interface ProtocolDraft {
  name: string;
  compounds: CompoundEntry[];
  notes: string;
}

export const blankProtocolDraft = (): ProtocolDraft => ({
  name: "",
  compounds: [],
  notes: ""
});
