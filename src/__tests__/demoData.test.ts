import { describe, expect, it } from "vitest";
import { buildProtocolImpactDoseEvents } from "../analytics";
import { getDemoProtocols, getDemoReports } from "../demoData";

describe("demo data", () => {
  it("contains multiple protocol transitions for Protocol Impact", () => {
    const protocols = getDemoProtocols();
    const reports = getDemoReports();
    const events = buildProtocolImpactDoseEvents(reports, "eu", 45, protocols);

    expect(protocols.length).toBeGreaterThanOrEqual(4);
    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(events.some((event) => event.headlineNarrative.toLowerCase().includes("baseline"))).toBe(true);
  });

  it("has an early post-baseline testosterone value flagged as high", () => {
    const reports = [...getDemoReports()].sort((left, right) => Date.parse(left.testDate) - Date.parse(right.testDate));
    const baseline = reports.find((report) => report.isBaseline);
    expect(baseline).toBeTruthy();

    const firstAfterBaseline = reports.find((report) => {
      if (!baseline) {
        return false;
      }
      return Date.parse(report.testDate) > Date.parse(baseline.testDate);
    });

    expect(firstAfterBaseline).toBeTruthy();
    const testosterone = firstAfterBaseline?.markers.find((marker) => marker.canonicalMarker === "Testosterone");
    expect(testosterone).toBeTruthy();
    expect(testosterone?.abnormal).toBe("high");
  });
});
