import { type ChangeEvent, type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Copy, Download, FileText, Link2, Pencil } from "lucide-react";
import { USER_PROFILES } from "../data/userProfiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { APP_LANGUAGE_OPTIONS, getMarkerDisplayName, trLocale } from "../i18n";
import { inferSpecimenFromCanonicalMarker } from "../markerSpecimen";
import { ShareOptions } from "../share";
import { AppLanguage, AppSettings, BiologicalSex, PersonalInfo, UserProfile } from "../types";
import { ImportResult, MarkerMergeSuggestion } from "../hooks/useAppData";
import { inferDashboardChartPresetFromSettings } from "../chartHelpers";

interface MarkerUsageRow {
  marker: string;
  valueCount: number;
  reportCount: number;
}

type SettingsTab = "profile" | "appearance" | "lab_data";

interface SettingsViewProps {
  settings: AppSettings;
  resolvedTheme: Exclude<AppSettings["theme"], "system">;
  language: AppLanguage;
  editableMarkers: string[];
  markerUsage: MarkerUsageRow[];
  shareOptions: ShareOptions;
  shareLink: string;
  shareStatus: "idle" | "loading" | "success" | "error";
  shareMessage: string;
  shareIncludedReports: number | null;
  shareExpiresAt: string | null;
  personalInfo: PersonalInfo;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onUpdatePersonalInfo: (patch: Partial<PersonalInfo>) => void;
  onRemapMarker: (sourceCanonical: string, targetLabel: string) => void;
  onOpenRenameDialog: (sourceCanonical: string) => void;
  onCreateBackup: () => void;
  onImportData: (incoming: unknown, mode: "merge" | "replace") => ImportResult;
  onClearAllData: () => void;
  onResetOnboarding: () => void;
  onAddMarkerSuggestions: (suggestions: MarkerMergeSuggestion[]) => void;
  onShareOptionsChange: Dispatch<SetStateAction<ShareOptions>>;
  onGenerateShareLink: () => void;
  onReportIssue: () => void;
  cloudUserEmail?: string | null;
  onSignOut?: () => void;
}

interface AppearanceToggleProps {
  checked: boolean;
  label: string;
  description?: string;
  onChange: (checked: boolean) => void;
}

const AppearanceToggle = ({ checked, label, description, onChange }: AppearanceToggleProps) => (
  <div className="flex w-full items-start justify-between gap-3 rounded-xl border border-slate-700/70 bg-slate-900/45 px-3 py-3 text-left transition hover:border-cyan-500/40">
    <div className="min-w-0">
      <p className="text-sm font-medium text-slate-100">{label}</p>
      {description ? <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p> : null}
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);

const SettingsView = ({
  settings,
  resolvedTheme,
  language,
  editableMarkers,
  markerUsage,
  shareOptions,
  shareLink,
  shareStatus,
  shareMessage,
  shareIncludedReports,
  shareExpiresAt,
  personalInfo,
  onUpdateSettings,
  onUpdatePersonalInfo,
  onRemapMarker,
  onOpenRenameDialog,
  onCreateBackup,
  onImportData,
  onClearAllData,
  onResetOnboarding,
  onAddMarkerSuggestions,
  onShareOptionsChange,
  onGenerateShareLink,
  onReportIssue,
  cloudUserEmail,
  onSignOut
}: SettingsViewProps) => {
  const isNl = language === "nl";
  const isLightTheme = resolvedTheme === "light";
  const tr = useCallback((nl: string, en: string): string => trLocale(language, nl, en), [language]);

  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>("profile");
  const [mergeFromMarker, setMergeFromMarker] = useState("");
  const [mergeIntoMarker, setMergeIntoMarker] = useState("");
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importStatus, setImportStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const mergeFromSpecimen = inferSpecimenFromCanonicalMarker(mergeFromMarker);
  const mergeTargetOptions = editableMarkers.filter(
    (marker) => marker !== mergeFromMarker && inferSpecimenFromCanonicalMarker(marker) === mergeFromSpecimen
  );

  useEffect(() => {
    if (editableMarkers.length === 0) {
      setMergeFromMarker("");
      setMergeIntoMarker("");
      return;
    }
    setMergeFromMarker((current) => (editableMarkers.includes(current) ? current : editableMarkers[0]));
  }, [editableMarkers]);

  useEffect(() => {
    setMergeIntoMarker((current) => (mergeTargetOptions.includes(current) ? current : mergeTargetOptions[0] ?? ""));
  }, [mergeTargetOptions]);

  useEffect(() => {
    if (!mergeFromMarker || mergeTargetOptions.length > 0) {
      return;
    }
    const fallbackSource = editableMarkers.find((marker) => {
      if (marker === mergeFromMarker) {
        return false;
      }
      return editableMarkers.some(
        (candidate) => candidate !== marker && inferSpecimenFromCanonicalMarker(candidate) === inferSpecimenFromCanonicalMarker(marker)
      );
    });
    if (fallbackSource) {
      setMergeFromMarker(fallbackSource);
    }
  }, [editableMarkers, mergeFromMarker, mergeTargetOptions]);

  const onImportBackupFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const result = onImportData(parsed, importMode);
      setImportStatus({
        type: result.success ? "success" : "error",
        message: result.message
      });
      if (result.mergeSuggestions.length > 0) {
        onAddMarkerSuggestions(result.mergeSuggestions);
      }
    } catch {
      setImportStatus({
        type: "error",
        message: tr(
          "Import mislukt: dit lijkt geen geldig LabTracker backup JSON-bestand.",
          "Import failed: this does not look like a valid LabTracker backup JSON file."
        )
      });
    } finally {
      event.target.value = "";
    }
  };

  const closeDeleteModal = () => {
    setShowDeleteConfirm(false);
    setDeleteInput("");
  };

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "profile", label: tr("Profiel", "Profile") },
    { id: "appearance", label: tr("Vormgeving", "Appearance") },
    { id: "lab_data", label: tr("Lab & data", "Lab & Data") }
  ];
  const updateChartAppearanceSettings = useCallback(
    (
      patch: Partial<
        Pick<
          AppSettings,
          "showReferenceRanges" | "showAbnormalHighlights" | "showAnnotations" | "showCheckInOverlay" | "yAxisMode" | "showTrtTargetZone" | "showLongevityTargetZone"
        >
      >
    ) => {
      const normalizedPatch: Partial<AppSettings> = { ...patch };
      if (patch.showReferenceRanges === true) {
        normalizedPatch.showTrtTargetZone = false;
        normalizedPatch.showLongevityTargetZone = false;
      }
      const inferredPreset = inferDashboardChartPresetFromSettings({
        showReferenceRanges: normalizedPatch.showReferenceRanges ?? settings.showReferenceRanges,
        showAbnormalHighlights: normalizedPatch.showAbnormalHighlights ?? settings.showAbnormalHighlights,
        showAnnotations: normalizedPatch.showAnnotations ?? settings.showAnnotations,
        showTrtTargetZone: normalizedPatch.showTrtTargetZone ?? settings.showTrtTargetZone,
        showLongevityTargetZone: normalizedPatch.showLongevityTargetZone ?? settings.showLongevityTargetZone,
        yAxisMode: normalizedPatch.yAxisMode ?? settings.yAxisMode
      });
      onUpdateSettings({
        ...normalizedPatch,
        dashboardChartPreset: inferredPreset
      });
    },
    [onUpdateSettings, settings]
  );
  const sectionGapClass = settings.interfaceDensity === "compact" ? "space-y-3 pt-3" : "space-y-4 pt-4";
  const shellCardClass = isLightTheme
    ? `settings-card app-teal-glow-surface rounded-2xl border border-slate-200 bg-white/90 shadow-sm ${settings.interfaceDensity === "compact" ? "p-3.5" : "p-4"}`
    : `settings-card app-teal-glow-surface rounded-2xl border border-slate-700/70 bg-slate-900/60 ${settings.interfaceDensity === "compact" ? "p-3.5" : "p-4"}`;
  const tabBarClass = isLightTheme
    ? "sticky top-0 -mx-4 -mt-4 flex overflow-x-auto rounded-t-2xl border-b border-slate-200 bg-white/95 px-4 py-3"
    : "sticky top-0 -mx-4 -mt-4 flex overflow-x-auto rounded-t-2xl border-b border-slate-700 bg-slate-900/60 px-4 py-3";
  const sectionCardClass = isLightTheme
    ? "rounded-xl border border-slate-200 bg-slate-50/70 p-4"
    : "rounded-xl border border-slate-700 bg-slate-900/40 p-4";
  const controlCardClass = isLightTheme
    ? "rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm"
    : "rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm";
  const selectClass = isLightTheme
    ? "mt-2 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-slate-900"
    : "mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2";

  return (
    <section className="space-y-3 fade-in">
      <div className={shellCardClass}>
        {/* Tab Bar */}
        <div className={tabBarClass}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSettingsTab(tab.id)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
                activeSettingsTab === tab.id
                  ? isLightTheme
                    ? "bg-cyan-100 text-cyan-900"
                    : "bg-cyan-500/25 text-cyan-100"
                  : isLightTheme
                    ? "text-slate-500 hover:text-slate-900"
                    : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Profile Tab */}
        {activeSettingsTab === "profile" && (
          <div className="space-y-4 pt-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">{tr("Persoonlijke gegevens", "Personal information")}</h2>
              <p className="mt-1 text-sm text-slate-400">
                {tr("Basisinformatie voor gepersonaliseerde analyses.", "Basic information for personalized analysis.")}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("Naam", "Name")}</span>
                <input
                  type="text"
                  value={personalInfo.name}
                  onChange={(event) => onUpdatePersonalInfo({ name: event.target.value })}
                  className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2 text-sm text-slate-100"
                  placeholder={tr("Jouw voornaam", "Your name")}
                />
              </label>

              <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("Geboortedatum", "Date of birth")}</span>
                <input
                  type="date"
                  value={personalInfo.dateOfBirth}
                  onChange={(event) => onUpdatePersonalInfo({ dateOfBirth: event.target.value })}
                  className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2 text-sm text-slate-100"
                />
              </label>

              <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 md:col-span-2">
                <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("Biologisch geslacht", "Biological sex")}</span>
                <div className="mt-2 flex gap-3">
                  {["male", "female", "prefer_not_to_say"].map((option) => (
                    <label key={option} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="biologicalSex"
                        value={option}
                        checked={personalInfo.biologicalSex === option}
                        onChange={(event) => onUpdatePersonalInfo({ biologicalSex: event.target.value as BiologicalSex })}
                        className="h-4 w-4 accent-cyan-500"
                      />
                      <span className="text-sm text-slate-300">
                        {option === "male"
                          ? tr("Man", "Male")
                          : option === "female"
                            ? tr("Vrouw", "Female")
                            : tr("Liever niet zeggen", "Prefer not to say")}
                      </span>
                    </label>
                  ))}
                </div>
              </label>

              <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("Lengte (cm)", "Height (cm)")}</span>
                <input
                  type="number"
                  value={personalInfo.heightCm ?? ""}
                  onChange={(event) => onUpdatePersonalInfo({ heightCm: event.target.value ? Number(event.target.value) : null })}
                  className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2 text-sm text-slate-100"
                  placeholder="180"
                />
              </label>

              <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("Gewicht (kg)", "Weight (kg)")}</span>
                <input
                  type="number"
                  value={personalInfo.weightKg ?? ""}
                  onChange={(event) => onUpdatePersonalInfo({ weightKg: event.target.value ? Number(event.target.value) : null })}
                  className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2 text-sm text-slate-100"
                  placeholder="80"
                />
              </label>
            </div>

            <div className="mt-6 border-t border-slate-800 pt-6">
              <h3 className="text-sm font-semibold text-slate-300">{tr("Profiel", "Profile")}</h3>
              <p className="mt-1 text-xs text-slate-400">
                {tr("Bepaalt toon, focusbiomarkers en AI-context. Later altijd aanpasbaar.", "Sets tone, focus biomarkers, and AI context. You can change this any time.")}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {USER_PROFILES.map((profile) => {
                  const active = settings.userProfile === profile.id;
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => onUpdateSettings({ userProfile: profile.id as UserProfile })}
                      className={`rounded-lg border p-3 text-left transition ${
                        isLightTheme
                          ? active
                            ? "border-cyan-500/55 bg-cyan-100/75 text-cyan-900"
                            : "border-slate-300 bg-white/90 text-slate-800 hover:border-cyan-400/50"
                          : active
                            ? "border-cyan-400/70 bg-cyan-500/15 text-cyan-100"
                            : "border-slate-700 bg-slate-900/70 text-slate-200 hover:border-slate-500"
                      }`}
                    >
                      <p className="text-sm font-semibold">{isNl ? profile.labelNl : profile.labelEn}</p>
                      <p
                        className={`mt-1 text-xs leading-5 ${
                          isLightTheme
                            ? active
                              ? "text-cyan-800/90"
                              : "text-slate-600"
                            : active
                              ? "text-cyan-200/90"
                              : "text-slate-400"
                        }`}
                      >
                        {isNl ? profile.descriptionNl : profile.descriptionEn}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 border-t border-slate-800 pt-6">
              <h3 className="text-sm font-semibold text-slate-300">{tr("Account & privacy", "Account & privacy")}</h3>
              <p className="mt-1 text-xs text-slate-400">
                {tr("Accountstatus, onboarding, support en dataverwijdering.", "Account status, onboarding, support and data deletion.")}
              </p>

              <div className="mt-3 divide-y divide-slate-700/50 rounded-lg border border-slate-700/60 bg-slate-900/30 px-4">
                {cloudUserEmail && onSignOut ? (
                  <div className="flex items-center justify-between gap-4 py-4 first:pt-0">
                    <div>
                      <p className="text-sm font-medium text-slate-200">{tr("Ingelogd account", "Signed-in account")}</p>
                      <p className="mt-0.5 text-sm text-slate-400">{cloudUserEmail}</p>
                    </div>
                    <button
                      type="button"
                      onClick={onSignOut}
                      className="shrink-0 rounded-lg border border-slate-600/60 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
                    >
                      {tr("Uitloggen", "Sign out")}
                    </button>
                  </div>
                ) : null}

                <div className="flex items-start justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-medium text-slate-200">{tr("Onboarding wizard", "Onboarding wizard")}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {tr(
                        "Bekijk de introductiewizard opnieuw.",
                        "Replay the intro wizard. Useful if you skipped something."
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onResetOnboarding}
                    className="shrink-0 rounded-lg border border-slate-600/60 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
                  >
                    {tr("Bekijk opnieuw", "Replay")}
                  </button>
                </div>

                <div className="flex items-start justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-medium text-slate-200">{tr("Feedback", "Feedback")}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {tr(
                        "Problemen met PDF's? Laat ons weten welke labformaten niet werken.",
                        "Having trouble with PDF parsing? Let us know which lab formats don't work."
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onReportIssue}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-sm text-cyan-100 transition hover:border-cyan-300/70 hover:bg-cyan-500/20"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {tr("Meld probleem", "Report issue")}
                  </button>
                </div>

                <div className="py-4">
                  <p className="text-sm font-medium text-red-400">{tr("Verwijder alle data", "Delete all data")}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {tr(
                      "Verwijder permanent alle rapporten, biomarkers, protocollen, supplementen en instellingen. Dit kan niet ongedaan worden gemaakt.",
                      "Permanently delete all reports, biomarkers, protocols, supplements, and settings. This cannot be undone."
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="settings-danger-btn mt-3 rounded-lg border border-red-800/60 bg-red-900/20 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-900/40 hover:text-red-300"
                  >
                    {tr("Verwijder alle data", "Delete all data")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Appearance Tab */}
        {activeSettingsTab === "appearance" && (
          <div className={sectionGapClass}>
            <div>
              <h2 className={isLightTheme ? "text-lg font-semibold text-slate-900" : "text-lg font-semibold text-slate-100"}>{tr("Vormgeving", "Appearance")}</h2>
              <p className={isLightTheme ? "mt-1 text-sm text-slate-600" : "mt-1 text-sm text-slate-400"}>
                {tr("Thema, dichtheid en zichtbare interface-elementen.", "Theme, density and visible interface details.")}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className={controlCardClass}>
                <span className={isLightTheme ? "block text-xs uppercase tracking-wide text-slate-500" : "block text-xs uppercase tracking-wide text-slate-400"}>{tr("Theme mode", "Theme mode")}</span>
                <select
                  className={selectClass}
                  value={settings.theme}
                  onChange={(event) => onUpdateSettings({ theme: event.target.value as AppSettings["theme"] })}
                >
                  <option value="system">{tr("Systeem", "System")}</option>
                  <option value="dark">{tr("Donker", "Dark")}</option>
                  <option value="light">{tr("Licht", "Light")}</option>
                </select>
                <p className={isLightTheme ? "mt-1 text-xs text-slate-500" : "mt-1 text-xs text-slate-400"}>
                  {tr("Systeem volgt je apparaatvoorkeur.", "System follows your device preference.")}
                </p>
              </label>

              <label className={controlCardClass}>
                <span className={isLightTheme ? "block text-xs uppercase tracking-wide text-slate-500" : "block text-xs uppercase tracking-wide text-slate-400"}>{tr("Taal", "Language")}</span>
                <select
                  className={selectClass}
                  value={settings.language}
                  onChange={(event) => onUpdateSettings({ language: event.target.value as AppSettings["language"] })}
                >
                  {APP_LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={controlCardClass}>
                <span className={isLightTheme ? "block text-xs uppercase tracking-wide text-slate-500" : "block text-xs uppercase tracking-wide text-slate-400"}>{tr("Interface density", "Interface density")}</span>
                <select
                  className={selectClass}
                  value={settings.interfaceDensity}
                  onChange={(event) => onUpdateSettings({ interfaceDensity: event.target.value as AppSettings["interfaceDensity"] })}
                >
                  <option value="comfortable">{tr("Comfortabel", "Comfortable")}</option>
                  <option value="compact">{tr("Compact", "Compact")}</option>
                </select>
              </label>
            </div>

            <div className="grid gap-3 xl:grid-cols-12">
              <div className={`${sectionCardClass} xl:col-span-7`}>
                <h3 className={isLightTheme ? "text-sm font-semibold text-slate-900" : "text-sm font-semibold text-slate-100"}>{tr("Dashboard & grafieken", "Dashboard & Charts")}</h3>
                <p className={isLightTheme ? "mt-1 text-xs text-slate-600" : "mt-1 text-xs text-slate-400"}>
                  {tr("Bepaal hoeveel klinische context en visuele nadruk je standaard ziet.", "Control how much clinical context and visual emphasis you see by default.")}
                </p>
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  <div className="sm:col-span-1">
                    <AppearanceToggle
                      checked={settings.showReferenceRanges}
                      onChange={(checked) => updateChartAppearanceSettings({ showReferenceRanges: checked })}
                      label={tr("Toon referentiebereiken", "Show reference ranges")}
                      description={tr("Laat de klinische onder- en bovengrens in grafieken zien.", "Show the clinical lower and upper range inside charts.")}
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <AppearanceToggle
                      checked={settings.showAbnormalHighlights}
                      onChange={(checked) => updateChartAppearanceSettings({ showAbnormalHighlights: checked })}
                      label={tr("Markeer afwijkende waarden", "Highlight out-of-range values")}
                      description={tr("Geef visueel meer nadruk aan waarden buiten bereik.", "Give out-of-range values stronger visual emphasis.")}
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <AppearanceToggle
                      checked={settings.showAnnotations}
                      onChange={(checked) => updateChartAppearanceSettings({ showAnnotations: checked })}
                      label={tr("Protocol-overlay", "Protocol overlay")}
                      description={tr("Toon protocolfases en contextblokken op relevante grafieken.", "Show protocol phases and context blocks on relevant charts.")}
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <AppearanceToggle
                      checked={settings.showCheckInOverlay}
                      onChange={(checked) => updateChartAppearanceSettings({ showCheckInOverlay: checked })}
                      label={tr("Welzijns check-ins", "Wellbeing check-ins")}
                      description={tr("Toon check-in momenten als contextlaag boven je biomarkertrends.", "Show check-in moments as an extra context layer over biomarker trends.")}
                    />
                  </div>
                  <div className={isLightTheme ? "rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm sm:col-span-2" : "rounded-xl border border-slate-700/70 bg-slate-900/45 px-3 py-3 sm:col-span-2"}>
                    <p className={isLightTheme ? "text-sm font-medium text-slate-900" : "text-sm font-medium text-slate-100"}>{tr("Y-as gedrag", "Y-axis behavior")}</p>
                    <p className={isLightTheme ? "mt-1 text-xs text-slate-600" : "mt-1 text-xs text-slate-400"}>
                      {tr("Kies of grafieken altijd op nul starten of strak om de data heen schalen.", "Choose whether charts always start at zero or fit tightly around the data.")}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => updateChartAppearanceSettings({ yAxisMode: "zero" })}
                        className={`rounded-lg px-3 py-1.5 text-sm transition ${
                          settings.yAxisMode === "zero"
                            ? isLightTheme
                              ? "bg-cyan-100 text-cyan-900"
                              : "bg-cyan-500/20 text-cyan-100"
                            : isLightTheme
                              ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                              : "bg-slate-800 text-slate-300 hover:text-slate-100"
                        }`}
                      >
                        {tr("Start op nul", "Start at zero")}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateChartAppearanceSettings({ yAxisMode: "data" })}
                        className={`rounded-lg px-3 py-1.5 text-sm transition ${
                          settings.yAxisMode === "data"
                            ? isLightTheme
                              ? "bg-cyan-100 text-cyan-900"
                              : "bg-cyan-500/20 text-cyan-100"
                            : isLightTheme
                              ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                              : "bg-slate-800 text-slate-300 hover:text-slate-100"
                        }`}
                      >
                        {tr("Fit op data", "Fit to data")}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${sectionCardClass} xl:col-span-5`}>
                <h3 className={isLightTheme ? "text-sm font-semibold text-slate-900" : "text-sm font-semibold text-slate-100"}>{tr("Context & tooltips", "Context & Tooltips")}</h3>
                <p className={isLightTheme ? "mt-1 text-xs text-slate-600" : "mt-1 text-xs text-slate-400"}>
                  {tr("Bepaal hoeveel extra context zichtbaar is rond trends en hoverstates.", "Control how much extra context is visible around trends and hover states.")}
                </p>
                <div className="mt-3 space-y-3">
                  <label className={isLightTheme ? "block rounded-xl border border-slate-200 bg-white p-3 shadow-sm" : "block rounded-xl border border-slate-700/70 bg-slate-900/45 p-3"}>
                    <span className={isLightTheme ? "block text-xs uppercase tracking-wide text-slate-500" : "block text-xs uppercase tracking-wide text-slate-400"}>{tr("Tooltip-detail", "Tooltip detail")}</span>
                    <select
                      className={selectClass}
                      value={settings.tooltipDetailMode}
                      onChange={(event) => onUpdateSettings({ tooltipDetailMode: event.target.value as AppSettings["tooltipDetailMode"] })}
                    >
                      <option value="compact">{tr("Compact (snel overzicht)", "Compact (quick overview)")}</option>
                      <option value="full">{tr("Uitgebreid (alle context)", "Extended (full context)")}</option>
                    </select>
                    <p className={isLightTheme ? "mt-2 text-xs text-slate-600" : "mt-2 text-xs text-slate-400"}>
                      {tr("Wijzigt direct hoe context in grafiek-tooltips wordt getoond.", "Updates chart tooltip context instantly.")}
                    </p>
                  </label>

                  <div className={isLightTheme ? "rounded-xl border border-cyan-200 bg-cyan-50/60 p-3 shadow-sm" : "rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3"}>
                    <p className={isLightTheme ? "text-xs font-semibold uppercase tracking-wide text-cyan-800" : "text-xs font-semibold uppercase tracking-wide text-cyan-200"}>
                      {tr("Live tooltip voorbeeld", "Live tooltip preview")}
                    </p>
                    <p className={isLightTheme ? "mt-0.5 text-xs text-slate-600" : "mt-0.5 text-xs text-slate-400"}>
                      {tr("Voorbeeld biomarker: Testosterone", "Example biomarker: Testosterone")}
                    </p>
                    <div className={isLightTheme ? "mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm" : "mt-2 rounded-xl border border-slate-700/70 bg-slate-900/70 p-3"}>
                      <div className="flex items-center justify-between gap-3">
                        <p className={isLightTheme ? "text-sm font-semibold text-slate-900" : "text-sm font-semibold text-slate-100"}>Testosterone</p>
                        <span
                          className={
                            isLightTheme
                              ? "rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-700"
                              : "rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-200"
                          }
                        >
                          {settings.tooltipDetailMode === "compact" ? tr("Compact", "Compact") : tr("Uitgebreid", "Extended")}
                        </span>
                      </div>
                      {settings.tooltipDetailMode === "compact" ? (
                        <div className="mt-1.5 space-y-1">
                          <p className={isLightTheme ? "text-xs text-slate-700" : "text-xs text-slate-300"}>{tr("Datum: 14 Jan 2026", "Date: 14 Jan 2026")}</p>
                          <p className={isLightTheme ? "text-xs text-slate-700" : "text-xs text-slate-300"}>{tr("Waarde: 597 ng/dL", "Value: 597 ng/dL")}</p>
                          <p className={isLightTheme ? "text-xs font-medium text-cyan-700" : "text-xs font-medium text-cyan-300"}>{tr("Verandering: +10.1%", "Change: +10.1%")}</p>
                        </div>
                      ) : (
                        <div className="mt-1.5 space-y-1">
                          <p className={isLightTheme ? "text-xs text-slate-700" : "text-xs text-slate-300"}>{tr("Datum: 14 Jan 2026", "Date: 14 Jan 2026")}</p>
                          <p className={isLightTheme ? "text-xs text-slate-700" : "text-xs text-slate-300"}>{tr("Waarde: 597 ng/dL", "Value: 597 ng/dL")}</p>
                          <p className={isLightTheme ? "text-xs text-slate-700" : "text-xs text-slate-300"}>{tr("Referentiebereik: 250-1100 ng/dL", "Reference range: 250-1100 ng/dL")}</p>
                          <p className={isLightTheme ? "text-xs text-slate-700" : "text-xs text-slate-300"}>{tr("Status: binnen bereik", "Status: in range")}</p>
                          <p className={isLightTheme ? "text-xs text-slate-700" : "text-xs text-slate-300"}>{tr("Protocol: 120 mg/week", "Protocol: 120 mg/week")}</p>
                          <p className={isLightTheme ? "text-xs font-medium text-cyan-700" : "text-xs font-medium text-cyan-300"}>{tr("Verandering sinds vorige test: +10.1%", "Change since prior test: +10.1%")}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Lab & Data Tab */}
        {activeSettingsTab === "lab_data" && (
          <div className="space-y-4 pt-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">{tr("Lab & data", "Lab & Data")}</h2>
              <p className="mt-1 text-sm text-slate-400">
                {tr("AI, eenheden, backup, delen en biomarkerbeheer.", "AI, units, backup, sharing and biomarker management.")}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm md:col-span-2">
                <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("AI analyse provider", "AI analysis provider")}</span>
                <select
                  className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
                  value={settings.aiAnalysisProvider}
                  onChange={(event) => onUpdateSettings({ aiAnalysisProvider: event.target.value as AppSettings["aiAnalysisProvider"] })}
                >
                  <option value="auto">{tr("Auto (Claude met Gemini fallback)", "Auto (Claude with Gemini fallback)")}</option>
                  <option value="claude">Claude</option>
                  <option value="gemini">Gemini</option>
                </select>
                <p className="mt-1 text-xs text-slate-400">
                  {tr(
                    "Gebruik Gemini tijdelijk als Claude overbelast is.",
                    "Use Gemini temporarily if Claude is overloaded."
                  )}
                </p>
              </label>

              <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm md:col-span-2">
                <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("Eenhedensysteem", "Unit system")}</span>
                <select
                  className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
                  value={settings.unitSystem}
                  onChange={(event) => onUpdateSettings({ unitSystem: event.target.value as AppSettings["unitSystem"] })}
                >
                  <option value="eu">{tr("SI (metrisch)", "SI (Metric)")}</option>
                  <option value="us">{tr("Conventioneel", "Conventional")}</option>
                </select>
                <p className="mt-1 text-xs text-slate-400">
                  {tr(
                    "Waarden worden automatisch omgerekend tussen SI (metrisch) en conventionele eenheden.",
                    "Values are automatically converted between SI (Metric) and Conventional units."
                  )}
                </p>
              </label>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">{tr("Backup & Herstel", "Backup & Restore")}</h3>
              <p className="mt-1 text-sm text-slate-400">
                {tr(
                  "Maak een JSON-backup van al je data. Je kunt die later importeren als merge of volledige restore.",
                  "Create a JSON backup of all your data. You can later import it as a merge or full restore."
                )}
              </p>
              <div className="settings-action-row mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200"
                  onClick={onCreateBackup}
                >
                  <Download className="h-4 w-4" /> {tr("Backup maken (JSON)", "Create backup (JSON)")}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-200"
                  onClick={() => {
                    setImportMode("merge");
                    importFileInputRef.current?.click();
                  }}
                >
                  <FileText className="h-4 w-4" /> {tr("Importeer backup (samenvoegen)", "Import backup (merge)")}
                </button>
                <button
                  type="button"
                  className="settings-restore-btn inline-flex items-center gap-1 rounded-md border border-red-800/60 bg-red-900/30 px-3 py-1.5 text-sm text-red-300 transition hover:bg-red-900/50 hover:text-red-200"
                  onClick={() => {
                    setImportMode("replace");
                    importFileInputRef.current?.click();
                  }}
                >
                  <FileText className="h-4 w-4" /> {tr("Herstel backup (vervangen)", "Restore backup (replace)")}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-600">
                {tr(
                  "Herstel (vervangen) overschrijft alle huidige data. Maak eerst een backup indien nodig.",
                  "Restore (replace) overwrites all current data. Create a backup first if needed."
                )}
              </p>
              <input ref={importFileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={onImportBackupFile} />
              {importStatus ? (
                <div
                  className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                    importStatus.type === "success"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                      : "border-rose-500/30 bg-rose-500/10 text-rose-200"
                  }`}
                >
                  {importStatus.message}
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">{tr("Delen", "Share")}</h3>
              <p className="mt-1 text-sm text-slate-400">
                {tr(
                  "Genereer een korte read-only snapshotlink zonder API keys. We delen slim alleen recente rapporten als dat nodig is.",
                  "Generate a short read-only snapshot link without API keys. We smartly share only recent reports when needed."
                )}
              </p>
              <div className="settings-action-row mt-3 flex flex-wrap gap-3 text-sm text-slate-200">
                <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5">
                  <input
                    type="checkbox"
                    checked={shareOptions.hideNotes}
                    onChange={(event) => onShareOptionsChange((current) => ({ ...current, hideNotes: event.target.checked }))}
                  />
                  {tr("Verberg notities", "Hide notes")}
                </label>
                <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5">
                  <input
                    type="checkbox"
                    checked={shareOptions.hideProtocol}
                    onChange={(event) => onShareOptionsChange((current) => ({ ...current, hideProtocol: event.target.checked }))}
                  />
                  {tr("Verberg protocol", "Hide protocol")}
                </label>
                <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5">
                  <input
                    type="checkbox"
                    checked={shareOptions.hideSymptoms}
                    onChange={(event) => onShareOptionsChange((current) => ({ ...current, hideSymptoms: event.target.checked }))}
                  />
                  {tr("Verberg symptomen", "Hide symptoms")}
                </label>
              </div>

              <div className="settings-action-row mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-cyan-500/50 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={onGenerateShareLink}
                  disabled={shareStatus === "loading"}
                >
                  <Link2 className="h-4 w-4" /> {shareStatus === "loading" ? tr("Link maken...", "Creating link...") : tr("Genereer deellink", "Generate share link")}
                </button>
                {shareLink ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(shareLink);
                      } catch {
                        // no-op
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" /> {tr("Kopieer link", "Copy link")}
                  </button>
                ) : null}
              </div>
              {shareStatus !== "idle" || shareMessage ? (
                <p className={`mt-2 text-xs ${shareStatus === "error" ? "text-rose-300" : shareStatus === "success" ? "text-emerald-300" : "text-slate-300"}`}>
                  {shareMessage ||
                    (shareStatus === "loading"
                      ? tr("Korte deellink wordt voorbereid...", "Preparing short share link...")
                      : "")}
                </p>
              ) : null}
              {shareStatus === "success" && shareIncludedReports !== null ? (
                <p className="mt-2 text-xs text-slate-400">
                  {shareExpiresAt
                    ? tr(
                        `Deze link deelt de laatste ${shareIncludedReports} rapporten en vervalt automatisch.`,
                        `This link shares the latest ${shareIncludedReports} reports and expires automatically.`
                      )
                    : tr(
                        `Deze link deelt de laatste ${shareIncludedReports} rapporten.`,
                        `This link shares the latest ${shareIncludedReports} reports.`
                      )}
                </p>
              ) : null}
              {shareLink ? (
                <p className="mt-2 break-all rounded-md border border-slate-700 bg-slate-800/70 px-3 py-2 text-xs text-slate-300">{shareLink}</p>
              ) : null}
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">{tr("Biomarker Manager", "Biomarker Manager")}</h3>
              <p className="mt-1 text-sm text-slate-400">
                {tr(
                  "Beheer biomarkernaam-normalisatie zonder je dashboard te verstoren. Je kunt biomarkers handmatig samenvoegen of hernoemen.",
                  "Manage biomarker-name normalization without cluttering the dashboard. You can manually merge or rename biomarkers."
                )}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                {tr(
                  "Gebruik merge wanneer twee biomarkers inhoudelijk hetzelfde zijn maar net anders heten (bijv. spelling, afkorting, lab-variant).",
                  "Use merge when two biomarkers mean the same thing but have slightly different names (spelling, abbreviation, lab variant)."
                )}
              </p>

              <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
                <select
                  className="rounded-md border border-slate-600 bg-slate-800 px-2 py-2 text-sm"
                  value={mergeFromMarker}
                  onChange={(event) => setMergeFromMarker(event.target.value)}
                >
                  {editableMarkers.length === 0 ? (
                    <option value="">{tr("Geen biomarkers beschikbaar", "No biomarkers available")}</option>
                  ) : (
                    editableMarkers.map((marker) => (
                      <option key={`from-${marker}`} value={marker}>
                        {getMarkerDisplayName(marker, language)}
                      </option>
                    ))
                  )}
                </select>
                <div className="self-center text-center text-xs text-slate-400">{tr("naar", "into")}</div>
                <select
                  className="rounded-md border border-slate-600 bg-slate-800 px-2 py-2 text-sm"
                  value={mergeIntoMarker}
                  onChange={(event) => setMergeIntoMarker(event.target.value)}
                >
                  <option value="">{tr("Selecteer target", "Select target")}</option>
                  {mergeTargetOptions.map((marker) => (
                    <option key={`to-${marker}`} value={marker}>
                      {getMarkerDisplayName(marker, language)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 disabled:opacity-50"
                  disabled={!mergeFromMarker || !mergeIntoMarker || mergeFromMarker === mergeIntoMarker}
                  onClick={() => {
                    const confirmed = window.confirm(
                      tr(
                        `Weet je zeker dat je "${getMarkerDisplayName(mergeFromMarker, language)}" wilt samenvoegen in "${getMarkerDisplayName(mergeIntoMarker, language)}"? Dit werkt alle bestaande rapporten bij.`,
                        `Are you sure you want to merge "${getMarkerDisplayName(mergeFromMarker, language)}" into "${getMarkerDisplayName(mergeIntoMarker, language)}"? This updates all existing reports.`
                      )
                    );
                    if (!confirmed) {
                      return;
                    }
                    onRemapMarker(mergeFromMarker, mergeIntoMarker);
                  }}
                >
                  {tr("Voer merge uit", "Merge biomarkers")}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {tr(
                  "Veilige merge: urine-biomarkers en bloed-biomarkers worden nooit samengevoegd.",
                  "Safe merge: urine biomarkers and blood biomarkers are never merged."
                )}
              </p>

              <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-slate-700 bg-slate-900/40">
                <table className="min-w-full divide-y divide-slate-700 text-sm">
                  <thead className="bg-slate-900/70 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 text-left">{tr("Biomarker", "Biomarker")}</th>
                      <th className="px-3 py-2 text-right">{tr("Waarden", "Values")}</th>
                      <th className="px-3 py-2 text-right">{tr("Rapporten", "Reports")}</th>
                      <th className="px-3 py-2 text-right">{tr("Actie", "Action")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {markerUsage.map((item) => (
                      <tr key={item.marker} className="bg-slate-900/30 text-slate-200">
                        <td className="px-3 py-2">{getMarkerDisplayName(item.marker, language)}</td>
                        <td className="px-3 py-2 text-right">{item.valueCount}</td>
                        <td className="px-3 py-2 text-right">{item.reportCount}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            className="rounded p-1 text-slate-400 transition hover:text-cyan-200"
                            onClick={() => onOpenRenameDialog(item.marker)}
                            aria-label={tr("Biomarker hernoemen", "Rename biomarker")}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              {tr(
                "Deze tool is alleen voor persoonlijke tracking en geeft geen medisch advies.",
                "This tool is for personal tracking only and does not provide medical advice."
              )}
            </p>
          </div>
        )}

      </div>

      {showDeleteConfirm ? (
        <div
          className="app-modal-overlay z-[92]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-delete-all-title"
          onClick={closeDeleteModal}
        >
          <div
            className={
              isLightTheme
                ? "app-modal-shell w-full max-w-md border-slate-300/85 bg-white p-5 shadow-soft sm:p-6"
                : "app-modal-shell w-full max-w-md bg-slate-900 p-5 shadow-soft sm:p-6"
            }
            onClick={(event) => event.stopPropagation()}
          >
            <h3
              id="settings-delete-all-title"
              className={isLightTheme ? "text-base font-semibold text-rose-700" : "text-base font-semibold text-red-400"}
            >
              {tr("Alle data verwijderen?", "Delete all data?")}
            </h3>
            <p className={isLightTheme ? "mt-2 text-sm text-slate-600" : "mt-2 text-sm text-slate-400"}>
              {tr(
                "Dit verwijdert permanent al je rapporten, biomarkers, protocollen, supplementen en instellingen. Je kunt dit alleen herstellen met een eerdere backup.",
                "This will permanently delete all your reports, biomarkers, protocols, supplements, and settings. There is no way to recover this data unless you have a backup."
              )}
            </p>

            <p className={isLightTheme ? "mt-4 text-xs font-medium text-slate-500" : "mt-4 text-xs font-medium text-slate-500"}>
              {tr("Typ", "Type")}{" "}
              <span className={isLightTheme ? "font-bold text-slate-800" : "font-bold text-slate-300"}>DELETE</span>{" "}
              {tr("om te bevestigen", "to confirm")}
            </p>
            <input
              type="text"
              value={deleteInput}
              onChange={(event) => setDeleteInput(event.target.value)}
              placeholder="DELETE"
              className={
                isLightTheme
                  ? "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none"
                  : "mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-red-700 focus:outline-none"
              }
            />

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteModal}
                className={
                  isLightTheme
                    ? "rounded-lg px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
                    : "rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-200"
                }
              >
                {tr("Annuleren", "Cancel")}
              </button>
              <button
                type="button"
                disabled={deleteInput !== "DELETE"}
                onClick={() => {
                  onClearAllData();
                  setImportStatus(null);
                  closeDeleteModal();
                }}
                className={
                  isLightTheme
                    ? "rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
                    : "rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                }
              >
                {tr("Verwijder alles", "Delete everything")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default SettingsView;
