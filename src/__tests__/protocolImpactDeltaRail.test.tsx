/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ProtocolImpactDeltaRail from "../components/ProtocolImpactDeltaRail";

describe("ProtocolImpactDeltaRail", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders before, after and delta", () => {
    render(
      <ProtocolImpactDeltaRail
        beforeValue={24.8}
        afterValue={18.1}
        deltaPct={-27.02}
        unit="nmol/L"
        trend="down"
        language="en"
        unitSystem="eu"
        isInsufficient={false}
      />
    );

    expect(screen.getByText(/Before/)).toBeTruthy();
    expect(screen.getByText(/After/)).toBeTruthy();
    expect(screen.getByText(/-27%/)).toBeTruthy();
  });

  it("renders directional arrow state", () => {
    const { container } = render(
      <ProtocolImpactDeltaRail
        beforeValue={95}
        afterValue={128}
        deltaPct={34.74}
        unit="pmol/L"
        trend="up"
        language="en"
        unitSystem="eu"
        isInsufficient={false}
      />
    );

    expect(container.querySelector(".protocol-impact-delta-rail")).toBeTruthy();
    expect(screen.getByText("↗")).toBeTruthy();
  });

  it("shows placeholder when data is insufficient", () => {
    render(
      <ProtocolImpactDeltaRail
        beforeValue={null}
        afterValue={95}
        deltaPct={null}
        unit="pmol/L"
        trend="insufficient"
        language="en"
        unitSystem="eu"
        isInsufficient={true}
      />
    );

    expect(screen.getByText("Not enough data yet")).toBeTruthy();
  });
});
