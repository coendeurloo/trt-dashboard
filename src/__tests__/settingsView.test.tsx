/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../constants";
import { ShareOptions } from "../share";
import SettingsView from "../views/SettingsView";

afterEach(() => {
  cleanup();
});

const createProps = () => {
  const shareOptions: ShareOptions = {
    hideNotes: false,
    hideProtocol: false,
    hideSymptoms: false
  };

  return {
    settings: {
      ...DEFAULT_SETTINGS,
      language: "en" as const,
      theme: "dark" as const
    },
    resolvedTheme: "dark" as const,
    language: "en" as const,
    editableMarkers: ["Testosterone", "Estradiol"],
    markerUsage: [{ marker: "Testosterone", valueCount: 3, reportCount: 2 }],
    shareOptions,
    shareLink: "",
    shareStatus: "idle" as const,
    shareMessage: "",
    shareIncludedReports: null,
    shareExpiresAt: null,
    personalInfo: {
      name: "",
      dateOfBirth: "",
      biologicalSex: "prefer_not_to_say" as const,
      heightCm: null,
      weightKg: null
    },
    onUpdateSettings: vi.fn(),
    onUpdatePersonalInfo: vi.fn(),
    onRemapMarker: vi.fn(),
    onOpenRenameDialog: vi.fn(),
    onCreateBackup: vi.fn(),
    onImportData: vi.fn(() => ({ success: true, message: "ok", mergeSuggestions: [] })),
    onClearAllData: vi.fn(),
    onResetOnboarding: vi.fn(),
    onAddMarkerSuggestions: vi.fn(),
    onShareOptionsChange: vi.fn(),
    onGenerateShareLink: vi.fn(),
    onReportIssue: vi.fn(),
    cloudUserEmail: "coen@example.com",
    onSignOut: vi.fn(async () => undefined),
    onDeleteAccount: vi.fn(async () => undefined)
  };
};

describe("SettingsView", () => {
  it("shows only the simplified tabs and keeps lab/data tools in the merged tab", () => {
    render(<SettingsView {...createProps()} />);

    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getByRole("button", { name: "Profile" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Appearance" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lab & Data" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Analysis" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Data" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Markers" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Account" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Lab & Data" }));

    expect(screen.getByText("Backup & Restore")).toBeTruthy();
    expect(screen.getByText("Share")).toBeTruthy();
    expect(screen.getByText("Biomarker Manager")).toBeTruthy();
    expect(screen.queryByText("Core toggles")).toBeNull();
    expect(screen.queryByRole("button", { name: "Export JSON" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export CSV" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export PDF" })).toBeNull();
  });

  it("autosaves personal info changes immediately", () => {
    const props = createProps();
    render(<SettingsView {...props} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Coen" } });
    fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "1983-02-06" } });
    fireEvent.click(screen.getByLabelText("Male"));
    fireEvent.change(screen.getByLabelText("Height (cm)"), { target: { value: "187" } });
    fireEvent.change(screen.getByLabelText("Weight (kg)"), { target: { value: "83" } });

    expect(props.onUpdatePersonalInfo).toHaveBeenNthCalledWith(1, { name: "Coen" });
    expect(props.onUpdatePersonalInfo).toHaveBeenNthCalledWith(2, { dateOfBirth: "1983-02-06" });
    expect(props.onUpdatePersonalInfo).toHaveBeenNthCalledWith(3, { biologicalSex: "male" });
    expect(props.onUpdatePersonalInfo).toHaveBeenNthCalledWith(4, { heightCm: 187 });
    expect(props.onUpdatePersonalInfo).toHaveBeenNthCalledWith(5, { weightKg: 83 });
  });

  it("shows refined appearance controls with a live tooltip preview", () => {
    const props = createProps();
    const { rerender } = render(<SettingsView {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));

    expect(screen.getByText("Dashboard & Charts")).toBeTruthy();
    expect(screen.getByText("Context & Tooltips")).toBeTruthy();
    expect(screen.getByText("Theme mode")).toBeTruthy();
    expect(screen.getByText("Interface density")).toBeTruthy();
    expect(screen.queryByText("Compact sidebar on desktop")).toBeNull();
    expect(screen.getByText("Show reference ranges")).toBeTruthy();
    expect(screen.getByText("Highlight out-of-range values")).toBeTruthy();
    expect(screen.getByText("Protocol overlay")).toBeTruthy();
    expect(screen.getByText("Wellbeing check-ins")).toBeTruthy();
    expect(screen.getByText("Live tooltip preview")).toBeTruthy();
    expect(screen.getByText("Example biomarker: Testosterone")).toBeTruthy();
    expect(screen.getByText("Change: +10.1%")).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue("Compact (quick overview)"), { target: { value: "full" } });
    expect(props.onUpdateSettings).toHaveBeenCalledWith({ tooltipDetailMode: "full" });

    rerender(
      <SettingsView
        {...props}
        settings={{
          ...props.settings,
          tooltipDetailMode: "full"
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    expect(screen.getByText("Reference range: 250-1100 ng/dL")).toBeTruthy();
    expect(screen.getByText("Change since prior test: +10.1%")).toBeTruthy();
  });

  it("shows cloud account actions in the profile privacy section", () => {
    render(<SettingsView {...createProps()} />);

    expect(screen.getByText("Signed-in account")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete account" })).toBeTruthy();
    expect(screen.getByText("Deletes your account and cloud data. Your local data on this device stays intact.")).toBeTruthy();
  });
});
