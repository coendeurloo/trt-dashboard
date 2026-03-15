import { type ChangeEvent, type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Copy, Download, FileText, Link2, Pencil } from "lucide-react";
import { USER_PROFILES } from "../data/userProfiles";
import { APP_LANGUAGE_OPTIONS, getMarkerDisplayName, trLocale } from "../i18n";
import { inferSpecimenFromCanonicalMarker } from "../markerSpecimen";
import { ShareOptions } from "../share";
import { AppLanguage, AppSettings, BiologicalSex, LabReport, PersonalInfo, UserProfile } from "../types";
import { ImportResult, MarkerMergeSuggestion } from "../hooks/useAppData";

interface MarkerUsageRow {
  marker: string;
  valueCount: number;
  reportCount: number;
}

type SettingsTab = "profile" | "appearance" | "analysis" | "data" | "markers" | "account";

interface SettingsViewProps {
  settings: AppSettings;
  language: AppLanguage;
  reports: LabReport[];
  samplingControlsEnabled: boolean;
  allMarkers: string[];
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
  onExportJson: () => void;
  onExportCsv: (selectedMarkers: string[]) => void;
  onExportPdf: () => void;
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

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  tooltip?: string;
}

const ToggleSwitch = ({ checked, onChange, label, tooltip }: ToggleSwitchProps) => (
  <label className="group relative inline-flex cursor-pointer items-center gap-2 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:text-slate-100 sm:text-sm">
    <button
      type="button"
      aria-pressed={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-4 w-7 shrink-0 rounded-full border transition-colors duration-200 ${
        checked ? "border-cyan-500/60 bg-cyan-500/20" : "border-slate-600 bg-slate-700"
      }`}
    >
      <span
        className={`absolute left-0.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full transition-transform duration-200 ${
          checked ? "translate-x-[11px] bg-cyan-400" : "translate-x-0 bg-slate-500"
        }`}
      />
    </button>
    {label}
    {tooltip ? (
      <span className="chart-tooltip pointer-events-none absolute left-0 top-full z-40 mt-1 w-72 rounded-xl border border-slate-600 bg-slate-950/95 p-2.5 text-[11px] leading-relaxed text-slate-200 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
        {tooltip}
      </span>
    ) : null}
  </label>
);

const SettingsView = ({
  settings,
  language,
  reports: _reports,
  samplingControlsEnabled,
  allMarkers,
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
  onExportJson,
  onExportCsv,
  onExportPdf,
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
  const isLightTheme = settings.theme === "light";
  const tr = useCallback((nl: string, en: string): string => trLocale(language, nl, en), [language]);

  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>("profile");
  const [mergeFromMarker, setMergeFromMarker] = useState("");
  const [mergeIntoMarker, setMergeIntoMarker] = useState("");
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importStatus, setImportStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [csvMarkerSelection, setCsvMarkerSelection] = useState<string[]>(allMarkers);
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

  useEffect(() => {
    setCsvMarkerSelection((current) => {
      if (current.length === 0) {
        return allMarkers;
      }
      const next = current.filter((marker) => allMarkers.includes(marker));
      return next.length > 0 ? next : allMarkers;
    });
  }, [allMarkers]);

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
    { id: "analysis", label: tr("Analyse", "Analysis") },
    { id: "data", label: tr("Data", "Data") },
    { id: "markers", label: tr("Markers", "Markers") },
    { id: "account", label: tr("Account", "Account") }
  ];

  return (
    <section className="space-y-3 fade-in">
      <div className="settings-card app-teal-glow-surface rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
        {/* Tab Bar */}
        <div className="sticky top-0 -mx-4 -mt-4 flex overflow-x-auto border-b border-slate-700 bg-slate-900/60 px-4 py-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSettingsTab(tab.id)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
                activeSettingsTab === tab.id
                  ? "bg-cyan-500/25 text-cyan-100"
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
                        className="h-4 w-4"
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
                {tr("Bepaalt toon, focusmarkers en AI-context. Later altijd aanpasbaar.", "Sets tone, focus markers, and AI context. You can change this any time.")}
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
          </div>
        )}

        {/* Appearance Tab */}
        {activeSettingsTab === "appearance" && (
          <div className="space-y-4 pt-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">{tr("Vormgeving", "Appearance")}</h2>
              <p className="mt-1 text-sm text-slate-400">
                {tr("Thema, taal en interfacedetails.", "Theme, language and interface details.")}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm">
                <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("Thema", "Theme")}</span>
                <select
                  className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
                  value={settings.theme}
                  onChange={(event) => onUpdateSettings({ theme: event.target.value as AppSettings["theme"] })}
                >
                  <option value="dark">{tr("Donker", "Dark")}</option>
                  <option value="light">{tr("Licht", "Light")}</option>
                </select>
              </label>

              <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm">
                <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("Taal", "Language")}</span>
                <select
                  className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
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

              <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm md:col-span-2">
                <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("Tooltip-detail", "Tooltip detail")}</span>
                <select
                  className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
                  value={settings.tooltipDetailMode}
                  onChange={(event) => onUpdateSettings({ tooltipDetailMode: event.target.value as AppSettings["tooltipDetailMode"] })}
                >
                  <option value="compact">{tr("Compact (snel overzicht)", "Compact (quick overview)")}</option>
                  <option value="full">{tr("Uitgebreid (alle context)", "Extended (full context)")}</option>
                </select>
              </label>
            </div>
          </div>
        )}

        {/* Analysis Tab */}
        {activeSettingsTab === "analysis" && (
          <div className="space-y-4 pt-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">{tr("Analyse", "Analysis")}</h2>
              <p className="mt-1 text-sm text-slate-400">
                {tr("AI-provider, eenheden en rekenmogelijkheden.", "AI provider, units and calculation options.")}
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

            <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-3 text-sm">
              <span className="block text-xs uppercase tracking-wide text-emerald-300">{tr("Core toggles", "Core toggles")}</span>
              <div className="settings-toggle-row mt-2 flex flex-wrap gap-2">
                <ToggleSwitch
                  checked={settings.aiExternalConsent}
                  onChange={(checked) => onUpdateSettings({ aiExternalConsent: checked })}
                  label={tr("Allow external AI", "Allow external AI")}
                  tooltip={tr(
                    "Standaard blijft alles lokaal. Met deze optie kan de app externe AI gebruiken na jouw toestemming.",
                    "By default everything stays local. This allows the app to use external AI after your consent."
                  )}
                />
                <ToggleSwitch
                  checked={settings.enableCalculatedFreeTestosterone}
                  onChange={(checked) => onUpdateSettings({ enableCalculatedFreeTestosterone: checked })}
                  label={tr(
                    "Toon berekend Vrij Testosteron als het ontbreekt",
                    "Show calculated Free Testosterone if missing"
                  )}
                  tooltip={tr(
                    "Als een lab alleen totaal testosteron en SHBG bevat (optioneel met albumine), berekent de app automatisch een geschatte Vrij Testosteron-waarde zodat je trends beter kunt volgen.",
                    "If a lab has Total Testosterone and SHBG (optionally Albumin) but no Free Testosterone, the app calculates an estimate so trend views stay complete."
                  )}
                />
                <ToggleSwitch
                  checked={samplingControlsEnabled}
                  onChange={(checked) => onUpdateSettings({ enableSamplingControls: checked })}
                  label={tr("Show trough/peak filter controls", "Show trough/peak filter controls")}
                  tooltip={tr(
                    "Toont trough/peak-filters en baseline-vergelijking op het dashboard om eerlijker te vergelijken tussen meetmomenten.",
                    "Shows trough/peak filters and baseline comparison on dashboard for fairer comparisons between sampling moments."
                  )}
                />
              </div>
            </div>
          </div>
        )}

        {/* Data Tab */}
        {activeSettingsTab === "data" && (
          <div className="space-y-4 pt-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">{tr("Data", "Data")}</h2>
              <p className="mt-1 text-sm text-slate-400">
                {tr("Backup, herstel, delen en synchronisatie.", "Backup, restore, sharing and synchronization.")}
              </p>
            </div>

            <div className="mt-4 border-t border-slate-800 pt-4">
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
                  onClick={onExportJson}
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

            <div className="mt-6 border-t border-slate-800 pt-6">
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
          </div>
        )}

        {/* Markers Tab */}
        {activeSettingsTab === "markers" && (
          <div className="space-y-4 pt-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">{tr("Marker Manager", "Marker Manager")}</h2>
              <p className="mt-1 text-sm text-slate-400">
                {tr(
                  "Beheer markernaam-normalisatie zonder je dashboard te verstoren. Je kunt markers handmatig samenvoegen of hernoemen.",
                  "Manage marker-name normalization without cluttering the dashboard. You can manually merge or rename markers."
                )}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                {tr(
                  "Gebruik merge wanneer twee markers inhoudelijk hetzelfde zijn maar net anders heten (bijv. spelling, afkorting, lab-variant).",
                  "Use merge when two markers mean the same thing but have slightly different names (spelling, abbreviation, lab variant)."
                )}
              </p>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
              <select
                className="rounded-md border border-slate-600 bg-slate-800 px-2 py-2 text-sm"
                value={mergeFromMarker}
                onChange={(event) => setMergeFromMarker(event.target.value)}
              >
                {editableMarkers.length === 0 ? (
                  <option value="">{tr("Geen markers beschikbaar", "No markers available")}</option>
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
                {tr("Voer merge uit", "Merge markers")}
              </button>
            </div>
            <p className="text-xs text-slate-400">
              {tr(
                "Veilige merge: urine-markers en bloed-markers worden nooit samengevoegd.",
                "Safe merge: urine markers and blood markers are never merged."
              )}
            </p>

            <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-slate-700 bg-slate-900/40">
              <table className="min-w-full divide-y divide-slate-700 text-sm">
                <thead className="bg-slate-900/70 text-slate-300">
                  <tr>
                    <th className="px-3 py-2 text-left">{tr("Marker", "Marker")}</th>
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
                          aria-label={tr("Marker hernoemen", "Rename marker")}
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
        )}

        {/* Account Tab */}
        {activeSettingsTab === "account" && (
          <div className="space-y-4 pt-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">{tr("Account & Privacy", "Account & Privacy")}</h2>
              <p className="mt-1 text-sm text-slate-400">
                {tr("Onboarding, data verwijdering en feedback.", "Onboarding, data deletion and feedback.")}
              </p>
            </div>

            {cloudUserEmail && onSignOut ? (
              <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-4">
                <h3 className="text-sm font-semibold text-slate-300">{tr("Ingelogd account", "Signed-in account")}</h3>
                <p className="mt-1 text-sm text-slate-400">{cloudUserEmail}</p>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="mt-3 rounded-lg border border-slate-600/60 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700/60 hover:text-slate-100"
                >
                  {tr("Uitloggen", "Sign out")}
                </button>
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-4">
              <h3 className="text-sm font-semibold text-slate-300">{tr("Onboarding wizard", "Onboarding wizard")}</h3>
              <p className="mt-1 text-sm text-slate-400">
                {tr(
                  "Bekijk de introductiewizard opnieuw. Handig als je iets hebt geskipt of wil laten zien aan iemand anders.",
                  "Replay the intro wizard. Useful if you skipped something or want to show it to someone else."
                )}
              </p>
              <button
                type="button"
                onClick={onResetOnboarding}
                className="mt-3 rounded-lg border border-slate-600/60 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-700/60 hover:text-slate-100"
              >
                {tr("Opnieuw bekijken", "Replay onboarding")}
              </button>
            </div>

            <div className="settings-danger-card rounded-2xl border border-red-900/40 bg-red-950/20 p-4">
              <h3 className="text-sm font-semibold text-red-400">{tr("Verwijder alle data", "Delete all data")}</h3>
              <p className="mt-1 text-sm text-slate-400">
                {tr(
                  "Verwijder permanent alle rapporten, markers, protocollen, supplementen en instellingen. Dit kan niet ongedaan worden gemaakt.",
                  "Permanently delete all reports, markers, protocols, supplements, and settings. This cannot be undone."
                )}
              </p>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="settings-danger-btn mt-3 rounded-lg border border-red-800/60 bg-red-900/30 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-900/50 hover:text-red-300"
              >
                {tr("Verwijder alle data", "Delete all data")}
              </button>
            </div>

            <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-4">
              <h3 className="text-sm font-semibold text-slate-300">{tr("Feedback", "Feedback")}</h3>
              <p className="mt-1 text-sm text-slate-400">
                {tr(
                  "Problemen met het verwerken van PDF's? Laat ons weten welke labformaten niet werken.",
                  "Having trouble with PDF parsing? Let us know which lab formats don't work."
                )}
              </p>
              <button
                type="button"
                onClick={onReportIssue}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-cyan-500/45 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-100 transition hover:border-cyan-300/70 hover:bg-cyan-500/20"
              >
                <AlertTriangle className="h-4 w-4" />
                {tr("Meld probleem + stuur PDF", "Report issue + send PDF")}
              </button>
            </div>

            <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-4">
              <h3 className="text-sm font-semibold text-slate-300">{tr("Export", "Export")}</h3>
              <p className="mt-1 text-sm text-slate-400">
                {tr(
                  "Exporteer alle opgeslagen data als JSON, geselecteerde markers als CSV, of grafieken als PDF.",
                  "Export all stored data as JSON, selected markers as CSV, or charts as PDF."
                )}
              </p>

              <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">{tr("CSV markerselectie", "CSV marker selection")}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {allMarkers.map((marker) => {
                    const selected = csvMarkerSelection.includes(marker);
                    return (
                      <button
                        key={marker}
                        type="button"
                        className={`rounded-full border px-3 py-1 text-xs ${
                          selected ? "border-cyan-500/60 bg-cyan-500/20 text-cyan-200" : "border-slate-600 text-slate-300"
                        }`}
                        onClick={() => {
                          setCsvMarkerSelection((current) => {
                            if (current.includes(marker)) {
                              return current.filter((item) => item !== marker);
                            }
                            return [...current, marker];
                          });
                        }}
                      >
                        {getMarkerDisplayName(marker, language)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                  onClick={onExportJson}
                >
                  <FileText className="h-4 w-4" /> {tr("Exporteer JSON", "Export JSON")}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                  onClick={() => onExportCsv(csvMarkerSelection)}
                >
                  <Download className="h-4 w-4" /> {tr("Exporteer CSV", "Export CSV")}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                  onClick={onExportPdf}
                >
                  <FileText className="h-4 w-4" /> {tr("Exporteer PDF-rapport", "Export PDF report")}
                </button>
              </div>
            </div>

            <p className="mt-6 text-xs text-slate-600">
              {tr(
                "Deze tool is alleen voor persoonlijke tracking en geeft geen medisch advies.",
                "This tool is for personal tracking only and does not provide medical advice."
              )}
            </p>
          </div>
        )}
      </div>

      {showDeleteConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-red-400">{tr("Alle data verwijderen?", "Delete all data?")}</h3>
            <p className="mt-2 text-sm text-slate-400">
              {tr(
                "Dit verwijdert permanent al je rapporten, markers, protocollen, supplementen en instellingen. Je kunt dit alleen herstellen met een eerdere backup.",
                "This will permanently delete all your reports, markers, protocols, supplements, and settings. There is no way to recover this data unless you have a backup."
              )}
            </p>

            <p className="mt-4 text-xs font-medium text-slate-500">
              {tr("Typ", "Type")} <span className="font-bold text-slate-300">DELETE</span> {tr("om te bevestigen", "to confirm")}
            </p>
            <input
              type="text"
              value={deleteInput}
              onChange={(event) => setDeleteInput(event.target.value)}
              placeholder="DELETE"
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-red-700 focus:outline-none"
            />

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeDeleteModal} className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
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
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-30"
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
