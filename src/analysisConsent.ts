import { AIConsentDecision } from "./types";

export const buildImplicitAnalysisConsent = (): AIConsentDecision => ({
  action: "analysis",
  scope: "once",
  allowExternalAi: true,
  parserRescueEnabled: false,
  includeSymptoms: true,
  includeNotes: true,
  allowPdfAttachment: false
});
