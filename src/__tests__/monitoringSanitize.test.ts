import { describe, expect, it } from "vitest";
import {
  sanitizeMonitoringRecord,
  sanitizeMonitoringText,
  sanitizeMonitoringUrl,
  sanitizeMonitoringValue
} from "../monitoring/sanitize";

describe("monitoring sanitize helpers", () => {
  it("removes sensitive query strings and share paths from urls", () => {
    expect(
      sanitizeMonitoringUrl("https://labtracker.app/s/AbCdEf123456?share=secret-token#frag")
    ).toBe("https://labtracker.app/s/[redacted]");
  });

  it("redacts emails and auth tokens from text", () => {
    expect(
      sanitizeMonitoringText("access_token=abc123 contact coen@example.com")
    ).toBe("access_token=[redacted] contact [redacted-email]");
  });

  it("redacts sensitive object keys while keeping safe context", () => {
    expect(
      sanitizeMonitoringRecord({
        notes: "private",
        fileName: "report.pdf",
        status: "AI_OVERLOADED",
        nested: {
          email: "coen@example.com"
        }
      })
    ).toEqual({
      notes: "[redacted]",
      fileName: "[redacted]",
      status: "AI_OVERLOADED",
      nested: {
        email: "[redacted]"
      }
    });
  });

  it("sanitizes arrays recursively", () => {
    expect(
      sanitizeMonitoringValue([
        "https://labtracker.app/?s=secret",
        {
          symptoms: "tired"
        }
      ])
    ).toEqual([
      "https://labtracker.app/?s=[redacted]",
      {
        symptoms: "[redacted]"
      }
    ]);
  });
});
