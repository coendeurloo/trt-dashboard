import { describe, expect, it } from "vitest";
import { buildImplicitAnalysisConsent } from "../analysisConsent";

describe("buildImplicitAnalysisConsent", () => {
  it("always enables external AI and includes notes and symptoms", () => {
    expect(buildImplicitAnalysisConsent()).toEqual({
      action: "analysis",
      scope: "once",
      allowExternalAi: true,
      parserRescueEnabled: false,
      includeSymptoms: true,
      includeNotes: true,
      allowPdfAttachment: false
    });
  });
});
