/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MobileNavDrawer from "../components/MobileNavDrawer";

describe("MobileNavDrawer", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when closed", () => {
    render(
      <MobileNavDrawer open={false} title="Navigation" onClose={vi.fn()}>
        <div>Menu</div>
      </MobileNavDrawer>
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes when clicking the overlay", () => {
    const onClose = vi.fn();
    render(
      <MobileNavDrawer open title="Navigation" onClose={onClose}>
        <div>Menu</div>
      </MobileNavDrawer>
    );

    fireEvent.click(screen.getByTestId("mobile-nav-overlay"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on escape", () => {
    const onClose = vi.fn();
    render(
      <MobileNavDrawer open title="Navigation" onClose={onClose}>
        <div>Menu</div>
      </MobileNavDrawer>
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("locks body scroll while open and restores on close", async () => {
    const { rerender, unmount } = render(
      <MobileNavDrawer open title="Navigation" onClose={vi.fn()}>
        <div>Menu</div>
      </MobileNavDrawer>
    );

    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <MobileNavDrawer open={false} title="Navigation" onClose={vi.fn()}>
        <div>Menu</div>
      </MobileNavDrawer>
    );
    await waitFor(() => {
      expect(document.body.style.overflow).toBe("");
    });

    rerender(
      <MobileNavDrawer open title="Navigation" onClose={vi.fn()}>
        <div>Menu</div>
      </MobileNavDrawer>
    );
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    await waitFor(() => {
      expect(document.body.style.overflow).toBe("");
    });
  });
});
