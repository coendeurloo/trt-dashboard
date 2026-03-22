/* @vitest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AIOutputPanel from "../components/analysis/AIOutputPanel";

describe("AIOutputPanel", () => {
  it("renders markdown during streaming instead of plain preformatted text", async () => {
    const { container } = render(
      <AIOutputPanel
        analysisRequestState="streaming"
        analysisError=""
        analysisResult="## Streaming heading\nThis is **live** markdown."
        analysisResultDisplay="## Streaming heading\nThis is **live** markdown."
        analysisGeneratedAt={null}
        analysisCopied={false}
        analysisModelInfo={null}
        analysisKind="question"
        analysisQuestion="Test question"
        analysisScopeNotice={null}
        relevantBenchmarks={[]}
        isDarkTheme={false}
        titleOutput="Analysis output"
        titleLatestComparison="Analysis output (latest vs previous)"
        titleQuestionAnswer="Answer"
        copyLabel="Copy analysis"
        copiedLabel="Copied"
        styleLabel="Style"
        styleValue="Narrative premium"
        modelLabel="Model"
        providerLabel="Provider"
        supplementActionsLabel="Supplement actions"
        noneLabel="none"
        outputGuardLabel="Output guard applied"
        lastRunLabel="Last run"
        loadingLabel="Loading"
        loadingFormatLabel="Loading formatting"
        emptyBody="Empty"
        disclaimerLabel="Disclaimer"
        aiUsesPrefix="AI uses"
        aiUsesMiddle="of"
        aiUsesSuffix="reports"
        questionPrefixLabel="Question:"
        preparingStatusLabel="Preparing"
        streamingStatusLabel="Streaming"
        streamingHintLabel="Live hint"
        onCopyAnalysis={() => undefined}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Streaming heading/i)).toBeTruthy();
    });
    expect(container.querySelector("pre")).toBeNull();
  });
});
