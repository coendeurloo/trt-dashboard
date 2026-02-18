import { describe, expect, it } from "vitest";
import {
  DOSE_RESPONSE_ASSISTED_LIMITS,
  checkDoseResponseAssistedLimit,
  getRemainingDoseResponseAssistedRuns
} from "../doseResponseLimits";

describe("doseResponseLimits (non-browser fallback)", () => {
  it("returns full remaining quota when localStorage is unavailable", () => {
    const remaining = getRemainingDoseResponseAssistedRuns();
    expect(remaining.dailyRemaining).toBe(DOSE_RESPONSE_ASSISTED_LIMITS.maxRunsPerDay);
    expect(remaining.monthlyRemaining).toBe(DOSE_RESPONSE_ASSISTED_LIMITS.maxRunsPerMonth);
  });

  it("allows assisted usage when below limits", () => {
    const check = checkDoseResponseAssistedLimit();
    expect(check.allowed).toBe(true);
  });
});
