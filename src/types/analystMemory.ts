export interface AnalystMemory {
  version: 1;
  lastUpdated: string;
  analysisCount: number;
  responderProfile: {
    testosteroneResponse: "low" | "moderate" | "high" | "unknown";
    aromatizationTendency: "low" | "moderate" | "high" | "unknown";
    hematocritSensitivity: "low" | "moderate" | "high" | "unknown";
    notes: string;
  };
  personalBaselines: {
    [markerName: string]: {
      mean: number;
      sd: number;
      unit: string;
      basedOnN: number;
    };
  };
  supplementHistory: {
    name: string;
    effect: "positive" | "negative" | "neutral" | "unclear";
    affectedMarkers: string[];
    observation: string;
  }[];
  protocolHistory: {
    date: string;
    change: string;
    observedEffect: string;
  }[];
  watchList: {
    marker: string;
    reason: string;
    since: string;
  }[];
  analystNotes: string;
}
