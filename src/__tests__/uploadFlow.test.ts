import { describe, expect, it } from "vitest";
import { resolveUploadTriggerAction } from "../uploadFlow";

describe("uploadFlow.resolveUploadTriggerAction", () => {
  it("returns fallback picker action when no upload panel exists and app is idle", () => {
    const action = resolveUploadTriggerAction({
      isShareMode: false,
      hasUploadPanel: false,
      isProcessing: false
    });
    expect(action).toBe("open-hidden-picker");
  });

  it("returns scroll action when upload panel is present", () => {
    const action = resolveUploadTriggerAction({
      isShareMode: false,
      hasUploadPanel: true,
      isProcessing: false
    });
    expect(action).toBe("scroll-to-panel");
  });

  it("returns noop in share mode or while processing", () => {
    expect(
      resolveUploadTriggerAction({
        isShareMode: true,
        hasUploadPanel: false,
        isProcessing: false
      })
    ).toBe("noop");
    expect(
      resolveUploadTriggerAction({
        isShareMode: false,
        hasUploadPanel: false,
        isProcessing: true
      })
    ).toBe("noop");
  });
});
