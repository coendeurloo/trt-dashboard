import { type ChangeEvent, type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Copy, Download, FileText, Link2, Pencil } from "lucide-react";
import { FEEDBACK_EMAIL } from "../constants";
import { getMarkerDisplayName, t } from "../i18n";
import { ShareOptions } from "../share";
import { AppLanguage, AppSettings } from "../types";
import { ImportResult, MarkerMergeSuggestion } from "../hooks/useAppData";

interface MarkerUsageRow {
  marker: string;
  valueCount: number;
  reportCount: number;
}

interface SettingsViewProps {
  settings: AppSettings;
  language: AppLanguage;
  samplingControlsEnabled: boolean;
  allMarkers: string[];
  editableMarkers: string[];
  markerUsage: MarkerUsageRow[];
  shareOptions: ShareOptions;
  shareLink: string;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onRemapMarker: (sourceCanonical: string, targetLabel: string) => void;
  onOpenRenameDialog: (sourceCanonical: string) => void;
  onExportJson: () => void;
  onExportCsv: (selectedMarkers: string[]) => void;
  onExportPdf: () => void;
  onImportData: (incoming: unknown, mode: "merge" | "replace") => ImportResult;
  onAddMarkerSuggestions: (suggestions: MarkerMergeSuggestion[]) => void;
  onShareOptionsChange: Dispatch<SetStateAction<ShareOptions>>;
  onGenerateShareLink: () => void;
}

const SettingsView = ({
  settings,
  language,
  samplingControlsEnabled,
  allMarkers,
  editableMarkers,
  markerUsage,
  shareOptions,
  shareLink,
  onUpdateSettings,
  onRemapMarker,
  onOpenRenameDialog,
  onExportJson,
  onExportCsv,
  onExportPdf,
  onImportData,
  onAddMarkerSuggestions,
  onShareOptionsChange,
  onGenerateShareLink
}: SettingsViewProps) => {
  const isNl = language === "nl";
  const tr = (nl: string, en: string): string => (isNl ? nl : en);

  const [mergeFromMarker, setMergeFromMarker] = useState("");
  const [mergeIntoMarker, setMergeIntoMarker] = useState("");
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importStatus, setImportStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [csvMarkerSelection, setCsvMarkerSelection] = useState<string[]>(allMarkers);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editableMarkers.length === 0) {
      setMergeFromMarker("");
      setMergeIntoMarker("");
      return;
    }
    setMergeFromMarker((current) => (editableMarkers.includes(current) ? current : editableMarkers[0]));
    setMergeIntoMarker((current) => {
      if (editableMarkers.includes(current) && current !== (editableMarkers[0] ?? "")) {
        return current;
      }
      return editableMarkers.find((marker) => marker !== (editableMarkers[0] ?? "")) ?? "";
    });
  }, [editableMarkers]);

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
    const subject = isNl ? "Feedback PDF-verwerking" : "PDF Parsing Feedback";
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
  }, [isNl]);

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
          "Import mislukt: dit lijkt geen geldig TRT backup JSON-bestand.",
          "Import failed: this does not look like a valid TRT backup JSON file."
        )
      });
    } finally {
      event.target.value = "";
    }
  };

  return (
    <section className="space-y-3 fade-in">
      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
        <h3 className="text-base font-semibold text-slate-100">{tr("Voorkeuren", "Preferences")}</h3>
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
            <span className="block text-xs uppercase tracking-wide text-slate-400">{t(language, "language")}</span>
            <select
              className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-2"
              value={settings.language}
              onChange={(event) => onUpdateSettings({ language: event.target.value as AppSettings["language"] })}
            >
              <option value="nl">Nederlands</option>
              <option value="en">English</option>
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

          <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm">
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

          <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm md:col-span-2">
            <span className="block text-xs uppercase tracking-wide text-slate-400">
              {tr("Geavanceerde meetmoment-filters", "Advanced sampling filters")}
            </span>
            <div className="mt-2 flex items-center gap-2 text-slate-200">
              <input
                type="checkbox"
                checked={samplingControlsEnabled}
                onChange={(event) => onUpdateSettings({ enableSamplingControls: event.target.checked })}
              />
              <span>{tr("Toon sampling filter + baseline vergelijking op dashboard", "Show sampling filter + baseline comparison on dashboard")}</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {tr(
                "Standaard uit. Als uitgeschakeld worden trough/peak- en baseline-opties verborgen.",
                "Off by default. When disabled, trough/peak and baseline options are hidden."
              )}
            </p>
          </label>

          <label className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-sm md:col-span-2">
            <span className="block text-xs uppercase tracking-wide text-slate-400">{tr("Afgeleide marker", "Derived marker")}</span>
            <div className="mt-2 flex items-center gap-2 text-slate-200">
              <input
                type="checkbox"
                checked={settings.enableCalculatedFreeTestosterone}
                onChange={(event) => onUpdateSettings({ enableCalculatedFreeTestosterone: event.target.checked })}
              />
              <span>{tr("Bereken Vrij Testosteron (afgeleid)", "Enable calculated Free Testosterone (derived)")}</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {tr(
                "Berekend uit totaal testosteron + SHBG (+ albumine). Vervangt gemeten vrij testosteron nooit en vult alleen ontbrekende punten aan.",
                "Computed from Total T + SHBG (+ Albumin). Never replaces measured Free T; it only fills missing points."
              )}
            </p>
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
        <h3 className="text-base font-semibold text-slate-100">{tr("Feedback", "Feedback")}</h3>
        <p className="mt-1 text-sm text-slate-400">
          {tr(
            "Problemen met het verwerken van PDF's? Laat ons weten welke labformaten niet werken.",
            "Having trouble with PDF parsing? Let us know which lab formats don't work."
          )}
        </p>
        <a href={settingsFeedbackMailto} className="mt-3 inline-flex items-center gap-1.5 text-sm text-cyan-200 hover:text-cyan-100">
          <AlertTriangle className="h-4 w-4" />
          {tr("Meld een verwerkingsprobleem", "Report a parsing issue")}
        </a>
      </div>

      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
        <h3 className="text-base font-semibold text-slate-100">{tr("Marker Manager", "Marker Manager")}</h3>
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
            {editableMarkers
              .filter((marker) => marker !== mergeFromMarker)
              .map((marker) => (
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
        <h3 className="text-base font-semibold text-slate-100">{tr("Backup & Herstel", "Backup & Restore")}</h3>
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
            className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-200"
            onClick={() => {
              setImportMode("replace");
              importFileInputRef.current?.click();
            }}
          >
            <FileText className="h-4 w-4" /> {tr("Herstel backup (vervangen)", "Restore backup (replace)")}
          </button>
        </div>

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

      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
        <h3 className="text-base font-semibold text-slate-100">{tr("Deelmodus", "Share mode")}</h3>
        <p className="mt-1 text-sm text-slate-400">
          {tr(
            "Genereer een read-only snapshotlink zonder API keys. De gedeelde weergave staat geen bewerken toe.",
            "Generate a read-only snapshot link without API keys. Shared view does not allow editing."
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
            className="inline-flex items-center gap-1 rounded-md border border-cyan-500/50 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200"
            onClick={onGenerateShareLink}
          >
            <Link2 className="h-4 w-4" /> {tr("Genereer deellink", "Generate share link")}
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
        {shareLink ? (
          <p className="mt-2 break-all rounded-md border border-slate-700 bg-slate-800/70 px-3 py-2 text-xs text-slate-300">{shareLink}</p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
        <h3 className="text-base font-semibold text-slate-100">{tr("Export", "Export")}</h3>
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

      <div className="medical-disclaimer rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
        <p className="font-semibold">{tr("Medische disclaimer", "Medical disclaimer")}</p>
        <p className="mt-1">
          {tr(
            "Deze tool is alleen voor persoonlijke tracking en geeft geen medisch advies.",
            "This tool is for personal tracking only and does not provide medical advice."
          )}
        </p>
      </div>
    </section>
  );
};

export default SettingsView;
