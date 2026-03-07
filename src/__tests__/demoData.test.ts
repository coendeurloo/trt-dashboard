import { describe, expect, it } from "vitest";
import { buildAlerts } from "../analytics";
import { buildProtocolImpactDoseEvents } from "../analytics";
import { CARDIO_PRIORITY_MARKERS, PRIMARY_MARKERS } from "../constants";
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

  it("routes demo actionable alert to ferritin and not ApoB", () => {
    const reports = getDemoReports();
    const markerNames = Array.from(new Set(reports.flatMap((report) => report.markers.map((marker) => marker.canonicalMarker))));
    const alerts = buildAlerts(reports, markerNames, "eu", "en");
    const actionable = alerts.filter((alert) => alert.actionNeeded);

    expect(actionable.some((alert) => alert.marker === "Ferritine" || alert.marker === "Ferritin")).toBe(true);
    expect(actionable.some((alert) => alert.marker === "Apolipoprotein B")).toBe(false);
  });

  it("shows exactly one actionable alert in primary markers and it is Estradiol", () => {
    const reports = getDemoReports();
    const markerNames = Array.from(new Set(reports.flatMap((report) => report.markers.map((marker) => marker.canonicalMarker))));
    const alerts = buildAlerts(reports, markerNames, "eu", "en");
    const actionable = alerts.filter((alert) => alert.actionNeeded);
    const selectedCardioMarker = CARDIO_PRIORITY_MARKERS.find((marker) => markerNames.includes(marker)) ?? "LDL Cholesterol";
    const primaryMarkers: string[] = Array.from(new Set([...PRIMARY_MARKERS, selectedCardioMarker]));
    const primaryActionableMarkers = Array.from(
      new Set(actionable.map((alert) => alert.marker).filter((marker) => primaryMarkers.includes(marker)))
    );

    expect(primaryActionableMarkers).toEqual(["Estradiol"]);
  });
});
