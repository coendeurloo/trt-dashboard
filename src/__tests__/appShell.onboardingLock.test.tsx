/* @vitest-environment jsdom */

import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TAB_ITEMS } from "../constants";
import AppShell, { AppShellActions, AppShellState, AppShellUploadState } from "../components/AppShell";
import { TabKey } from "../types";

const allVisibleTabKeys = new Set(TAB_ITEMS.map((tab) => tab.key as TabKey));

const buildProps = (overrides?: Partial<AppShellState>) => {
  const shellState: AppShellState = {
    activeTab: "dashboard",
    activeTabTitle: "Dashboard",
    activeTabSubtitle: null,
    isReviewMode: false,
    isOnboardingLocked: true,
    visibleTabKeys: allVisibleTabKeys,
    isMobileMenuOpen: false,
    quickUploadDisabled: false,
    language: "en",
    theme: "dark",
    userProfile: "trt",
    isShareMode: false,
    isNl: false,
    sharedSnapshotGeneratedAt: null,
    hasReports: false,
    latestReportDate: null,
    markersTrackedCount: 0,
    stabilityScore: null,
    activeProtocolCompound: null,
    outOfRangeCount: 0,
    reportsCount: 0,
    headerStats: [],
    sidebarCollapsedDesktop: false,
    ...overrides
  };

  const uploadState: AppShellUploadState = {
    uploadPanelRef: createRef<HTMLDivElement>(),
    hiddenUploadInputRef: createRef<HTMLInputElement>(),
    isProcessing: false,
    uploadStage: null,
    uploadError: "",
    uploadNotice: ""
  };

  const actions: AppShellActions = {
    onRequestTabChange: vi.fn(),
    onToggleMobileMenu: vi.fn(),
    onCloseMobileMenu: vi.fn(),
    onQuickUpload: vi.fn(),
    onToggleTheme: vi.fn(),
    onUploadFileSelected: vi.fn(),
    onUploadIntent: vi.fn(),
    onStartManualEntry: vi.fn(),
    onOpenCloudAuth: vi.fn(),
    onToggleDesktopSidebar: vi.fn()
  };

  return {
    shellState,
    uploadState,
    actions,
    tr: (_nl: string, en: string) => en
  };
};

describe("AppShell onboarding lock", () => {
  afterEach(() => {
    cleanup();
  });

  it("hides the desktop dashboard context row on first visit", () => {
    const props = buildProps();
    render(
      <AppShell {...props}>
        <div>Content</div>
      </AppShell>
    );

    expect(screen.queryByRole("heading", { name: "Dashboard", level: 2 })).toBeNull();
    expect(screen.queryByText("Language:")).toBeNull();
  });

  it("shows the desktop dashboard context row after onboarding unlock", () => {
    const props = buildProps({
      isOnboardingLocked: false,
      hasReports: true,
      reportsCount: 1,
      markersTrackedCount: 18,
      outOfRangeCount: 0,
      stabilityScore: 66,
      headerStats: [
        { id: "reports", value: "1", label: "Reports" },
        { id: "markers", value: "18", label: "Markers tracked" },
        { id: "oor", value: "0", label: "Out of range", tone: "positive" }
      ]
    });
    render(
      <AppShell {...props}>
        <div>Content</div>
      </AppShell>
    );

    expect(screen.getByRole("heading", { name: "Dashboard", level: 2 })).toBeTruthy();
    expect(screen.getByText((_, node) => node?.textContent?.trim() === "1Reports")).toBeTruthy();
    expect(screen.getByText((_, node) => node?.textContent?.trim() === "18Markers tracked")).toBeTruthy();
    const outOfRangeStat = screen.getByText((_, node) => node?.textContent?.trim() === "0Out of range");
    const outOfRangeValue = outOfRangeStat.querySelector("strong");
    expect(outOfRangeValue?.className).toContain("text-emerald-300");
    expect(screen.getByRole("button", { name: "Open Stability Index" })).toBeTruthy();
    expect(screen.queryByText("Changed")).toBeNull();
  });

  it("keeps out-of-range value amber when above zero in dashboard header stats", () => {
    const props = buildProps({
      isOnboardingLocked: false,
      hasReports: true,
      reportsCount: 1,
      markersTrackedCount: 18,
      outOfRangeCount: 2,
      stabilityScore: 66,
      headerStats: [
        { id: "reports", value: "1", label: "Reports" },
        { id: "markers", value: "18", label: "Markers tracked" },
        { id: "oor", value: "2", label: "Out of range", tone: "warning" }
      ]
    });
    render(
      <AppShell {...props}>
        <div>Content</div>
      </AppShell>
    );

    const outOfRangeStat = screen.getByText((_, node) => node?.textContent?.trim() === "2Out of range");
    const outOfRangeValue = outOfRangeStat.querySelector("strong");
    expect(outOfRangeValue?.className).toContain("text-amber-300");
  });

  it("scrolls to stability index from the dashboard header badge", () => {
    const props = buildProps({
      isOnboardingLocked: false,
      hasReports: true,
      reportsCount: 1,
      markersTrackedCount: 18,
      outOfRangeCount: 0,
      stabilityScore: 66,
      headerStats: [
        { id: "reports", value: "1", label: "Reports" },
        { id: "markers", value: "18", label: "Markers tracked" },
        { id: "oor", value: "0", label: "Out of range", tone: "positive" }
      ]
    });
    render(
      <AppShell {...props}>
        <div id="dashboard-stability-index" tabIndex={-1}>
          Stability Section
        </div>
      </AppShell>
    );

    const target = document.getElementById("dashboard-stability-index");
    expect(target).toBeTruthy();
    const scrollIntoView = vi.fn();
    if (target) {
      (target as HTMLElement).scrollIntoView = scrollIntoView;
    }

    screen.getByRole("button", { name: "Open Stability Index" }).click();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("keeps Dashboard and Settings enabled before the first upload", () => {
    const props = buildProps();
    render(
      <AppShell {...props}>
        <div>Content</div>
      </AppShell>
    );

    expect((screen.getByRole("button", { name: "Dashboard" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Settings" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Protocols" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Supplements" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /AI Lab Analysis/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("unlocks all tabs once a report exists", () => {
    const props = buildProps({ isOnboardingLocked: false, hasReports: true, reportsCount: 1 });
    render(
      <AppShell {...props}>
        <div>Content</div>
      </AppShell>
    );

    expect((screen.getByRole("button", { name: "Protocols" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Supplements" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: /AI Lab Analysis/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("applies the same lock state inside mobile navigation", () => {
    const props = buildProps({ isMobileMenuOpen: true });
    render(
      <AppShell {...props}>
        <div>Content</div>
      </AppShell>
    );

    const protocolButtons = screen.getAllByRole("button", { name: "Protocols" });
    const settingsButtons = screen.getAllByRole("button", { name: "Settings" });

    expect(protocolButtons.length).toBeGreaterThan(1);
    expect(settingsButtons.length).toBeGreaterThan(1);
    protocolButtons.forEach((button) => expect((button as HTMLButtonElement).disabled).toBe(true));
    settingsButtons.forEach((button) => expect((button as HTMLButtonElement).disabled).toBe(false));
  });

  it("shows subtle Sign up and Sign in buttons in sidebar header when unauthenticated", () => {
    const props = buildProps({
      cloudConfigured: true,
      cloudAuthStatus: "unauthenticated"
    });
    render(
      <AppShell {...props}>
        <div>Content</div>
      </AppShell>
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Sign up" })[0]);
    expect(props.actions.onOpenCloudAuth).toHaveBeenCalledWith("signup");
    fireEvent.click(screen.getAllByRole("button", { name: "Sign in" })[0]);
    expect(props.actions.onOpenCloudAuth).toHaveBeenCalledWith("signin");
  });

  it("shows account badge with sync status and opens Settings when authenticated", () => {
    const props = buildProps({
      cloudConfigured: true,
      cloudAuthStatus: "authenticated",
      cloudUserEmail: "alice@example.com",
      appMode: "cloud",
      syncStatus: "idle"
    });
    render(
      <AppShell {...props}>
        <div>Content</div>
      </AppShell>
    );

    const accountButton = screen.getByRole("button", { name: /open settings/i });
    expect(accountButton).toBeTruthy();
    expect(screen.getByText(/alice@example.com/i)).toBeTruthy();
    expect(screen.getByText("Synced")).toBeTruthy();
    fireEvent.click(accountButton);
    expect(props.actions.onRequestTabChange).toHaveBeenCalledWith("settings");
  });

  it("renders custom header stats on non-dashboard tabs", () => {
    const props = buildProps({
      activeTab: "reports",
      activeTabTitle: "All Reports",
      isOnboardingLocked: false,
      hasReports: true,
      headerStats: [
        { id: "reports", value: "9", label: "reports" },
        { id: "latest", value: "19 Feb", label: "latest report" }
      ]
    });
    render(
      <AppShell {...props}>
        <div>Content</div>
      </AppShell>
    );

    expect(screen.getByText((_, node) => node?.textContent?.trim() === "9reports")).toBeTruthy();
    expect(screen.getByText((_, node) => node?.textContent?.trim() === "19 Feblatest report")).toBeTruthy();
  });

  it("supports compact desktop sidebar mode with icon-first navigation", () => {
    const props = buildProps({
      isOnboardingLocked: false,
      hasReports: true,
      sidebarCollapsedDesktop: true
    });
    render(
      <AppShell {...props}>
        <div>Content</div>
      </AppShell>
    );

    expect(screen.queryByText("Core")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Upload PDF" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Protocols" })).toBeTruthy();
  });

  it("shows Local-only instead of pending when authenticated outside cloud mode", () => {
    const props = buildProps({
      cloudConfigured: true,
      cloudAuthStatus: "authenticated",
      cloudUserEmail: "alice@example.com",
      appMode: "local",
      syncStatus: "pending"
    });
    render(
      <AppShell {...props}>
        <div>Content</div>
      </AppShell>
    );

    expect(screen.getByText("Local-only")).toBeTruthy();
    expect(screen.queryByText("Sync pending")).toBeNull();
  });
});
