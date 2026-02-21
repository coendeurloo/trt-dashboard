import { describe, expect, it } from "vitest";
import { sanitizeAnalysisPayloadForAI, sanitizeParserTextForAI } from "../privacy/sanitizeForAI";

describe("sanitizeForAI", () => {
  it("redacts common PII in parser text", () => {
    const input = [
      "Patient ID: MRN-123456",
      "Email: test.user@example.com",
      "Phone: +1 (555) 222-3333",
      "DOB: 1988-06-12",
      "Estradiol 110 pmol/L 40 - 160"
    ].join("\n");

    const sanitized = sanitizeParserTextForAI(input, "john-doe-results.pdf");

    expect(sanitized.text).toContain("[REDACTED_ID]");
    expect(sanitized.text).toContain("[REDACTED_EMAIL]");
    expect(sanitized.text).toContain("[REDACTED_PHONE]");
    expect(sanitized.text).toContain("[REDACTED_DOB]");
    expect(sanitized.text).toContain("Estradiol 110 pmol/L");
    expect(sanitized.redactionCount).toBeGreaterThanOrEqual(4);
  });

  it("keeps symptoms/notes off by default in analysis payload", () => {
    const payload = [
      {
        date: "2026-01-01",
        ann: {
          compound: "Testosterone",
          frequency: "2x/week",
          protocol: "TRT",
          supps: "Fish oil",
          symptoms: "Mood swings",
          notes: "Contact me at test@example.com"
        },
        markers: []
      }
    ];

    const sanitized = sanitizeAnalysisPayloadForAI(payload);

    expect(sanitized[0]?.ann.symptoms).toBe("");
    expect(sanitized[0]?.ann.notes).toBe("");
  });

  it("includes opted-in symptoms/notes with redaction", () => {
    const payload = [
      {
        date: "2026-01-01",
        ann: {
          compound: "Testosterone",
          frequency: "2x/week",
          protocol: "TRT",
          supps: "Fish oil",
          symptoms: "Call +1 555 222 3333",
          notes: "Email me at test@example.com"
        },
        markers: []
      }
    ];

    const sanitized = sanitizeAnalysisPayloadForAI(payload, {
      includeSymptoms: true,
      includeNotes: true
    });

    expect(sanitized[0]?.ann.symptoms).toContain("[REDACTED_PHONE]");
    expect(sanitized[0]?.ann.notes).toContain("[REDACTED_EMAIL]");
  });
});
