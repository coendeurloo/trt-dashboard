import { type ChangeEvent, type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Copy, Download, FileText, Link2, Lock, Pencil } from "lucide-react";
import { FEEDBACK_EMAIL } from "../constants";
import { APP_LANGUAGE_OPTIONS, getMarkerDisplayName, trLocale } from "../i18n";
import { inferSpecimenFromCanonicalMarker } from "../markerSpecimen";
import { ShareOptions } from "../share";
import { AppLanguage, AppSettings, LabReport } from "../types";
import { ImportResult, MarkerMergeSuggestion } from "../hooks/useAppData";
import { AI_ANALYSIS_MARKER_CAP } from "../aiAnalysis";

interface MarkerUsageRow {
  marker: string;
  valueCount: number;
  reportCount: number;
}

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
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onRemapMarker: (sourceCanonical: string, targetLabel: string) => void;
  onOpenRenameDialog: (sourceCanonical: string) => void;
  onExportJson: () => void;
  onExportCsv: (selectedMarkers: string[]) => void;
  onExportPdf: () => void;
  onImportData: (incoming: unknown, mode: "merge" | "replace") => ImportResult;
  onClearAllData: () => void;
  onAddMarkerSuggestions: (suggestions: MarkerMergeSuggestion[]) => void;
  onShareOptionsChange: Dispatch<SetStateAction<ShareOptions>>;
  onGenerateShareLink: () => void;
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
        className={`absolute top-0.5 h-3 w-3 rounded-full transition-transform duration-200 ${
          checked ? "translate-x-3 bg-cyan-400" : "translate-x-0.5 bg-slate-500"
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
  reports,
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
  onUpdateSettings,
  onRemapMarker,
  onOpenRenameDialog,
  onExportJson,
  onExportCsv,
  onExportPdf,
  onImportData,
  onClearAllData,
  onAddMarkerSuggestions,
  onShareOptionsChange,
  onGenerateShareLink
}: SettingsViewProps) => {
  const isNl = language === "nl";
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  const [mergeFromMarker, setMergeFromMarker] = useState("");
  const [mergeIntoMarker, setMergeIntoMarker] = useState("");
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importStatus, setImportStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [csvMarkerSelection, setCsvMarkerSelection] = useState<string[]>(allMarkers);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const showParserDebugControls =
    import.meta.env.DEV || /^(1|true|yes)$/i.test(String(import.meta.env.VITE_ENABLE_PARSER_DEBUG ?? "").trim());
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

  const settingsFeedbackMailto = useMemo(() => {
    const subject = tr("Feedback PDF-verwerking", "PDF Parsing Feedback");
    const body = isNl
      ? [
          "Hoi,",
          "",
          "Ik loop tegen problemen aan met het verwerken van lab-PDF's.",
          "",
          "Lab / land: [vul in]",
          "Wat ging er mis: [vul in]",
          "",
          "---",
          "Stuur bij voorkeur geen PDF mee vanwege medische privacy.",
          "Omschrijf liever welke markers ontbraken of verkeerd waren."
        ].join("\n")
      : [
          "Hi,",
          "",
          "I'm having trouble with lab PDF parsing.",
          "",
          "Lab / country: [fill in]",
          "What went wrong: [fill in]",
          "",
          "---",
          "Please avoid attaching medical PDFs for privacy.",
          "Describe which markers were missing or incorrect."
        ].join("\n");
    return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [isNl, tr]);

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

  const aiCostMetrics = useMemo(() => {
    const totalUploads = reports.length;
    const aiReports = reports.filter((report) => report.extraction?.aiUsed);
    const localSuccessReports = reports.filter((report) => !report.extraction?.aiUsed && report.markers.length > 0);
    const aiCallRate = totalUploads > 0 ? aiReports.length / totalUploads : 0;
    const localSuccessRate = totalUploads > 0 ? localSuccessReports.length / totalUploads : 0;

    const usageRows = aiReports
      .map((report) => ({
        input: report.extraction?.debug?.aiInputTokens ?? 0,
        output: report.extraction?.debug?.aiOutputTokens ?? 0
      }))
      .filter((usage) => usage.input > 0 || usage.output > 0);

    const totalInputTokens = usageRows.reduce((sum, usage) => sum + usage.input, 0);
    const totalOutputTokens = usageRows.reduce((sum, usage) => sum + usage.output, 0);
    const avgInputTokens = usageRows.length > 0 ? Math.round(totalInputTokens / usageRows.length) : 0;
    const avgOutputTokens = usageRows.length > 0 ? Math.round(totalOutputTokens / usageRows.length) : 0;
    const estimatedCostEur =
      (totalInputTokens / 1_000_000) * 0.08 +
      (totalOutputTokens / 1_000_000) * 0.3;
    const estimatedCostPer100Uploads =
      totalUploads > 0 ? (estimatedCostEur / totalUploads) * 100 : 0;

    return {
      totalUploads,
      aiCalls: aiReports.length,
      aiCallRate,
      localSuccessRate,
      avgInputTokens,
      avgOutputTokens,
      estimatedCostPer100Uploads
    };
  }, [reports]);

  return (
    <section className="space-y-3 fade-in">
      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold text-slate-100">{tr("Voorkeuren", "Preferences")}</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
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

          <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm">
            <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("Eenhedensysteem", "Unit system")}</span>
            <select
              className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
              value={settings.unitSystem}
              onChange={(event) => onUpdateSettings({ unitSystem: event.target.value as AppSettings["unitSystem"] })}
            >
              <option value="eu">{tr("Europees", "European")}</option>
              <option value="us">US</option>
            </select>
          </label>

          <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm">
            <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("Grafiek Y-as", "Chart Y-axis")}</span>
            <select
              className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
              value={settings.yAxisMode}
              onChange={(event) => onUpdateSettings({ yAxisMode: event.target.value as AppSettings["yAxisMode"] })}
            >
              <option value="zero">{tr("Start op nul", "Start at zero")}</option>
              <option value="data">{tr("Gebruik databereik", "Use data range")}</option>
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

          <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-3 text-sm md:col-span-2">
            <span className="block text-xs uppercase tracking-wide text-emerald-300">{tr("Privacy & AI", "Privacy & AI")}</span>
            <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-slate-700 bg-slate-900/50 p-3">
              <div>
                <p className="text-sm text-slate-200">{tr("Externe AI toestaan", "Allow external AI")}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {tr(
                    "Zonder permanente toestemming tonen we per run eerst een consent-check.",
                    "Without persistent consent, we show a consent check before each run."
                  )}
                </p>
              </div>
              <button
                type="button"
                className={`inline-flex h-6 w-11 items-center rounded-full border transition ${
                  settings.aiExternalConsent ? "border-emerald-500/60 bg-emerald-500/25" : "border-slate-600 bg-slate-700"
                }`}
                onClick={() => onUpdateSettings({ aiExternalConsent: !settings.aiExternalConsent })}
                aria-label={tr("Externe AI toestaan", "Allow external AI")}
                aria-pressed={settings.aiExternalConsent}
              >
                <span
                  className={`h-4 w-4 rounded-full transition ${
                    settings.aiExternalConsent ? "translate-x-5 bg-emerald-300" : "translate-x-1 bg-slate-300"
                  }`}
                />
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {tr(
                "Standaard verwerken we lokaal op je apparaat. Pas na opt-in sturen we alleen noodzakelijke velden naar externe AI.",
                "By default processing stays local on your device. Only after opt-in do we send required fields to external AI."
              )}
            </p>
          </div>

          {showParserDebugControls ? (
            <div className="rounded-lg border border-cyan-900/60 bg-cyan-950/20 p-3 text-sm md:col-span-2">
              <span className="block text-xs uppercase tracking-wide text-cyan-300">
                {tr("Parser debug (intern)", "Parser debug (internal)")}
              </span>

              <label className="mt-2 block rounded-md border border-slate-700 bg-slate-900/50 p-3 text-sm">
                <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("PDF parsermodus", "PDF parser mode")}</span>
                <select
                  className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
                  value={settings.parserDebugMode}
                  onChange={(event) => onUpdateSettings({ parserDebugMode: event.target.value as AppSettings["parserDebugMode"] })}
                >
                  <option value="text_only">{tr("Alleen tekstlaag", "Text layer only")}</option>
                  <option value="text_ocr">{tr("Tekstlaag + OCR", "Text layer + OCR")}</option>
                  <option value="text_ocr_ai">{tr("Tekstlaag + OCR + AI", "Text layer + OCR + AI")}</option>
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  {tr(
                    "Debug-only keuze voor parserpad. Niet bedoeld voor eindgebruikers.",
                    "Debug-only parser pipeline selector. Not meant for end users."
                  )}
                </p>
              </label>

              <label className="mt-2 block rounded-md border border-slate-700 bg-slate-900/50 p-3 text-sm">
                <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("AI kostenmodus", "AI cost mode")}</span>
                <select
                  className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
                  value={settings.aiCostMode}
                  onChange={(event) => onUpdateSettings({ aiCostMode: event.target.value as AppSettings["aiCostMode"] })}
                >
                  <option value="balanced">{tr("Gebalanceerd", "Balanced")}</option>
                  <option value="ultra_low_cost">{tr("Ultra lage kosten", "Ultra low cost")}</option>
                  <option value="max_accuracy">{tr("Maximale nauwkeurigheid", "Max extraction accuracy")}</option>
                </select>
              </label>

              <div className="mt-2 rounded-md border border-slate-700 bg-slate-900/50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-300">{tr("Automatisch verbeteren met AI", "Auto-improve extraction with AI")}</p>
                  <button
                    type="button"
                    className={`inline-flex h-6 w-11 items-center rounded-full border transition ${
                      settings.aiAutoImproveEnabled ? "border-cyan-500/60 bg-cyan-500/25" : "border-slate-600 bg-slate-700"
                    }`}
                    onClick={() => onUpdateSettings({ aiAutoImproveEnabled: !settings.aiAutoImproveEnabled })}
                    aria-label={tr("Automatisch verbeteren met AI", "Auto-improve extraction with AI")}
                    aria-pressed={settings.aiAutoImproveEnabled}
                  >
                    <span
                      className={`h-4 w-4 rounded-full transition ${
                        settings.aiAutoImproveEnabled ? "translate-x-5 bg-cyan-300" : "translate-x-1 bg-slate-300"
                      }`}
                    />
                  </button>
                </div>
              </div>

              <p className="mt-2 text-xs text-slate-400">
                {tr(
                  `AI Analysis gebruikt maximaal ${AI_ANALYSIS_MARKER_CAP} markers per rapport in promptcontext (alleen voor AI Analysis, niet voor parser-output).`,
                  `AI Analysis uses a maximum of ${AI_ANALYSIS_MARKER_CAP} markers per report in prompt context (AI Analysis only, not parser output).`
                )}
              </p>

              <div className="mt-2 grid gap-2 text-sm text-slate-200 sm:grid-cols-2 lg:grid-cols-3">
                <p>{tr("Uploads", "Uploads")}: {aiCostMetrics.totalUploads}</p>
                <p>{tr("AI calls", "AI calls")}: {aiCostMetrics.aiCalls}</p>
                <p>{tr("AI call-rate", "AI call rate")}: {(aiCostMetrics.aiCallRate * 100).toFixed(1)}%</p>
                <p>{tr("Lokale succesrate", "Local success rate")}: {(aiCostMetrics.localSuccessRate * 100).toFixed(1)}%</p>
                <p>{tr("Gem. input tokens/call", "Avg input tokens/call")}: {aiCostMetrics.avgInputTokens}</p>
                <p>{tr("Gem. output tokens/call", "Avg output tokens/call")}: {aiCostMetrics.avgOutputTokens}</p>
              </div>
              <p className="mt-1 text-sm font-medium text-cyan-200">
                {tr("Geschatte kosten per 100 uploads", "Estimated cost per 100 uploads")}: €{aiCostMetrics.estimatedCostPer100Uploads.toFixed(2)}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold text-slate-100">{tr("Data", "Data")}</h2>

        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">{tr("Backup & Herstel", "Backup & Restore")}</h3>
          <p className="mt-1 text-sm text-slate-400">
            {tr(
              "Maak een JSON-backup van al je data. Je kunt die later importeren als merge of volledige restore.",
              "Create a JSON backup of all your data. You can later import it as a merge or full restore."
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
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
              className="inline-flex items-center gap-1 rounded-md border border-red-800/60 bg-red-900/30 px-3 py-1.5 text-sm text-red-300 transition hover:bg-red-900/50 hover:text-red-200"
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
          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">{tr("Export", "Export")}</h3>
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

        <div className="mt-6 border-t border-slate-800 pt-6">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">{tr("Delen", "Share")}</h3>
          <p className="mt-1 text-sm text-slate-400">
            {tr(
              "Genereer een korte read-only snapshotlink zonder API keys. We delen slim alleen recente rapporten als dat nodig is.",
              "Generate a short read-only snapshot link without API keys. We smartly share only recent reports when needed."
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-200">
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
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
            <span
              className="group relative inline-flex"
              title={tr("Binnenkort beschikbaar", "Coming soon")}
            >
              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-slate-600/50 bg-slate-800/50 px-3 py-1.5 text-sm text-slate-500 opacity-60"
              >
                <Lock className="h-4 w-4" /> {tr("Artsen-PDF (Premium)", "Doctor PDF (Premium)")}
              </button>
              <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-700 px-2 py-1 text-xs text-slate-200 opacity-0 transition-opacity group-hover:opacity-100">
                {tr("Binnenkort beschikbaar", "Coming soon")}
              </span>
            </span>
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

      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold text-slate-100">{tr("Marker Manager", "Marker Manager")}</h2>
        <p className="mt-1 text-sm text-slate-400">
          {tr(
            "Beheer markernaam-normalisatie zonder je dashboard te verstoren. Je kunt markers handmatig samenvoegen of hernoemen.",
            "Manage marker-name normalization without cluttering the dashboard. You can manually merge or rename markers."
          )}
        </p>
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
            onClick={() => onRemapMarker(mergeFromMarker, mergeIntoMarker)}
          >
            {tr("Voer merge uit", "Merge markers")}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
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

      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
        <button type="button" onClick={() => setShowAdvanced((value) => !value)} className="flex w-full items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">{tr("Geavanceerd", "Advanced")}</h2>
          {showAdvanced ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
        </button>

        {showAdvanced ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                {tr("Geavanceerde meetmoment-filters", "Advanced sampling filters")}
              </h3>
              <div className="mt-2">
                <ToggleSwitch
                  checked={samplingControlsEnabled}
                  onChange={(checked) => onUpdateSettings({ enableSamplingControls: checked })}
                  label={tr("Toon sampling filter + baseline vergelijking op dashboard", "Show sampling filter + baseline comparison on dashboard")}
                />
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {tr(
                  "Standaard uit. Als uitgeschakeld worden trough/peak- en baseline-opties verborgen.",
                  "Off by default. When disabled, trough/peak and baseline options are hidden."
                )}
              </p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">{tr("Afgeleide marker", "Derived marker")}</h3>
              <div className="mt-2">
                <ToggleSwitch
                  checked={settings.enableCalculatedFreeTestosterone}
                  onChange={(checked) => onUpdateSettings({ enableCalculatedFreeTestosterone: checked })}
                  label={tr("Bereken Vrij Testosteron (afgeleid)", "Enable calculated Free Testosterone (derived)")}
                />
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {tr(
                  "Berekend uit totaal testosteron + SHBG (+ albumine). Vervangt gemeten vrij testosteron nooit en vult alleen ontbrekende punten aan.",
                  "Computed from Total T + SHBG (+ Albumin). Never replaces measured Free T; it only fills missing points."
                )}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold text-slate-100">{tr("Account & Privacy", "Account & Privacy")}</h2>

        <div className="mt-4 rounded-2xl border border-red-900/40 bg-red-950/20 p-4">
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
            className="mt-3 rounded-lg border border-red-800/60 bg-red-900/30 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-900/50 hover:text-red-300"
          >
            {tr("Verwijder alle data", "Delete all data")}
          </button>
        </div>

        <p className="mt-6 text-xs text-slate-600">
          {tr(
            "Deze tool is alleen voor persoonlijke tracking en geeft geen medisch advies.",
            "This tool is for personal tracking only and does not provide medical advice."
          )}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold text-slate-100">{tr("Feedback", "Feedback")}</h2>
        <p className="mt-1 text-sm text-slate-400">
          {tr(
            "Problemen met het verwerken van PDF's? Laat ons weten welke labformaten niet werken.",
            "Having trouble with PDF parsing? Let us know which lab formats don't work."
          )}
        </p>
        <a
          href={settingsFeedbackMailto}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-cyan-200 hover:text-cyan-100"
        >
          <AlertTriangle className="h-4 w-4" />
          {tr("Meld een verwerkingsprobleem", "Report a parsing issue")}
        </a>
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
