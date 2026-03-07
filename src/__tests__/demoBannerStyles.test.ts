import { describe, expect, it } from "vitest";
import { getDemoBannerButtonClassNames } from "../ui/demoBannerStyles";

describe("demo banner CTA styles", () => {
  it("keeps Upload your own PDF as filled primary and clear action as outlined secondary in dark mode", () => {
    const { uploadOwnPdfButtonClassName, clearDemoButtonClassName } = getDemoBannerButtonClassNames(true);
    expect(uploadOwnPdfButtonClassName).toContain("bg-cyan-400");
    expect(clearDemoButtonClassName).toContain("bg-transparent");
  });

  it("keeps Upload your own PDF as filled primary and clear action as outlined secondary in light mode", () => {
    const { uploadOwnPdfButtonClassName, clearDemoButtonClassName } = getDemoBannerButtonClassNames(false);
    expect(uploadOwnPdfButtonClassName).toContain("bg-cyan-500");
    expect(clearDemoButtonClassName).toContain("bg-white");
    expect(clearDemoButtonClassName).not.toContain("font-semibold");
  });
});

