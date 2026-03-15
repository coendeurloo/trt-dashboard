import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import ProtocolEditor from "../components/ProtocolEditor";
import { ProtocolDraft, blankProtocolDraft } from "../components/protocolEditorModel";
import { trLocale } from "../i18n";
import { getProtocolCompoundsText, getReportProtocol } from "../protocolUtils";
import {
  createProtocolVersion,
  ensureProtocolVersions,
  getLatestProtocolVersion,
  getLinkedInterventionId,
  getLinkedInterventionVersionId,
  resolveProtocolVersionByDate,
  todayIsoDate
} from "../protocolVersions";
import { AppLanguage, LabReport, Protocol, ProtocolSaveMode, UserProfile } from "../types";
import { createId } from "../utils";

interface ProtocolViewProps {
  protocols: Protocol[];
  reports: LabReport[];
  language: AppLanguage;
  userProfile: UserProfile;
  isShareMode: boolean;
  onAddProtocol: (protocol: Protocol) => void;
  onUpdateProtocol: (
    id: string,
    updates: Partial<Protocol> & { effectiveFrom?: string; saveMode?: ProtocolSaveMode }
  ) => void;
  onDeleteProtocol: (id: string) => boolean;
  getProtocolUsageCount: (id: string) => number;
}

interface VersionRangeRow {
  versionId: string;
  name: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  itemCount: number;
  reportCount: number;
}

const formatDateLabel = (value: string, language: AppLanguage): string => {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  return new Intl.DateTimeFormat(language === "nl" ? "nl-NL" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(parsed));
};

const previousIsoDate = (value: string): string | null => {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const previous = new Date(parsed - 24 * 60 * 60 * 1000);
  return previous.toISOString().slice(0, 10);
};

const protocolToDraft = (protocol: Protocol): ProtocolDraft => {
  const latestVersion = getLatestProtocolVersion(protocol);
  const compounds = latestVersion
    ? latestVersion.compounds
    : protocol.compounds.length > 0
      ? protocol.compounds
      : protocol.items;
  return {
    name: protocol.name,
    effectiveFrom: todayIsoDate(),
    items: compounds,
    compounds,
    notes: latestVersion?.notes ?? protocol.notes
  };
};

const canonicalizeDraftForCompare = (draft: ProtocolDraft): string =>
  JSON.stringify({
    name: draft.name.trim(),
    effectiveFrom: draft.effectiveFrom.trim(),
    notes: draft.notes.trim(),
    compounds: draft.compounds.map((compound) => ({
      name: compound.name.trim(),
      dose: (compound.dose ?? compound.doseMg ?? "").trim(),
      frequency: compound.frequency.trim(),
      route: compound.route.trim()
    }))
  });

const ProtocolView = ({
  protocols,
  reports,
  language,
  userProfile,
  isShareMode,
  onAddProtocol,
  onUpdateProtocol,
  onDeleteProtocol,
  getProtocolUsageCount
}: ProtocolViewProps) => {
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);
  const isProtocolProfile = userProfile === "trt" || userProfile === "enhanced";
  const entitySingular = isProtocolProfile
    ? tr("protocol", "protocol")
    : userProfile === "health"
      ? tr("interventie", "intervention")
      : tr("stack", "stack");
  const entityPlural = isProtocolProfile
    ? tr("protocollen", "protocols")
    : userProfile === "health"
      ? tr("interventies", "interventions")
      : tr("stacks", "stacks");
  const entityTitle = isProtocolProfile
    ? tr("Protocolbeheer", "Protocol management")
    : userProfile === "health"
      ? tr("Interventiebeheer", "Intervention management")
      : tr("Stackbeheer", "Stack management");
  const entitySummary = isProtocolProfile
    ? tr("Bewaar compounds als herbruikbare protocollen.", "Store compounds as reusable protocols.")
    : userProfile === "health"
      ? tr("Bewaar interventies als herbruikbare plannen.", "Store interventions as reusable plans.")
      : tr("Bewaar je stack-varianten als herbruikbare plannen.", "Store stack variants as reusable plans.");
  const itemLabel = isProtocolProfile ? tr("compound", "compound") : tr("item", "item");

  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProtocolDraft>(blankProtocolDraft());
  const [initialDraft, setInitialDraft] = useState<ProtocolDraft>(blankProtocolDraft());
  const [feedback, setFeedback] = useState("");
  const [showSaveModeDialog, setShowSaveModeDialog] = useState(false);
  const [saveMode, setSaveMode] = useState<ProtocolSaveMode>("new_version");

  const activeProtocolId = useMemo(() => {
    const sorted = [...reports].sort((left, right) => {
      const byDate = right.testDate.localeCompare(left.testDate);
      if (byDate !== 0) {
        return byDate;
      }
      return right.createdAt.localeCompare(left.createdAt);
    });
    const latestWithProtocol = sorted.find((report) => getReportProtocol(report, protocols) !== null);
    return latestWithProtocol?.annotations.interventionId ?? latestWithProtocol?.annotations.protocolId ?? null;
  }, [reports, protocols]);

  const versionUsageByProtocol = useMemo(() => {
    const usage = new Map<string, Map<string, number>>();
    const protocolById = new Map(protocols.map((protocol) => [protocol.id, protocol]));
    reports.forEach((report) => {
      const protocolId = getLinkedInterventionId(report.annotations);
      if (!protocolId) {
        return;
      }
      const protocol = protocolById.get(protocolId);
      if (!protocol) {
        return;
      }
      const linkedVersionId = getLinkedInterventionVersionId(report.annotations);
      const resolvedVersionId = linkedVersionId ?? resolveProtocolVersionByDate(protocol, report.testDate)?.id ?? null;
      if (!resolvedVersionId) {
        return;
      }
      if (!usage.has(protocolId)) {
        usage.set(protocolId, new Map<string, number>());
      }
      const protocolUsage = usage.get(protocolId);
      if (!protocolUsage) {
        return;
      }
      protocolUsage.set(resolvedVersionId, (protocolUsage.get(resolvedVersionId) ?? 0) + 1);
    });
    return usage;
  }, [protocols, reports]);

  const startCreate = () => {
    const nextDraft = blankProtocolDraft();
    setEditorMode("create");
    setEditingId(null);
    setDraft(nextDraft);
    setInitialDraft(nextDraft);
    setFeedback("");
    setShowSaveModeDialog(false);
    setSaveMode("new_version");
  };

  const startEdit = (protocol: Protocol) => {
    const normalizedProtocol: Protocol = {
      ...protocol,
      versions: ensureProtocolVersions(protocol)
    };
    const nextDraft = protocolToDraft(normalizedProtocol);
    setEditorMode("edit");
    setEditingId(protocol.id);
    setDraft(nextDraft);
    setInitialDraft(nextDraft);
    setFeedback("");
    setShowSaveModeDialog(false);
    setSaveMode("new_version");
  };

  const duplicateAndEdit = (protocol: Protocol) => {
    const nextDraft: ProtocolDraft = {
      ...protocolToDraft(protocol),
      effectiveFrom: todayIsoDate(),
      name: `${tr("Kopie van", "Copy of")} ${protocol.name}`
    };
    setEditorMode("create");
    setEditingId(null);
    setDraft(nextDraft);
    setInitialDraft(nextDraft);
    setFeedback("");
    setShowSaveModeDialog(false);
    setSaveMode("new_version");
  };

  const hasUnsavedChanges =
    editorMode !== null && canonicalizeDraftForCompare(draft) !== canonicalizeDraftForCompare(initialDraft);

  const closeEditor = () => {
    setEditorMode(null);
    setEditingId(null);
    const nextDraft = blankProtocolDraft();
    setDraft(nextDraft);
    setInitialDraft(nextDraft);
    setFeedback("");
    setShowSaveModeDialog(false);
    setSaveMode("new_version");
  };

  const requestCloseEditor = () => {
    if (
      hasUnsavedChanges &&
      typeof window !== "undefined" &&
      !window.confirm(
        tr(
          "Je hebt niet-opgeslagen wijzigingen. Weet je zeker dat je wilt sluiten?",
          "You have unsaved changes. Are you sure you want to close?"
        )
      )
    ) {
      return;
    }
    closeEditor();
  };

  const saveEditor = (mode: ProtocolSaveMode = "new_version") => {
    const name = draft.name.trim();
    const effectiveFrom = draft.effectiveFrom.trim() || todayIsoDate();
    if (!name) {
      setFeedback(tr(`Geef een naam voor dit ${entitySingular}.`, `Please enter a name for this ${entitySingular}.`));
      return;
    }
    if (!effectiveFrom) {
      setFeedback(tr("Kies een geldige ingangsdatum.", "Choose a valid effective date."));
      return;
    }
    if (draft.compounds.length === 0) {
      setFeedback(tr(`Voeg minimaal 1 ${itemLabel} toe.`, `Add at least 1 ${itemLabel}.`));
      return;
    }

    if (editorMode === "edit" && editingId) {
      if (
        mode === "overwrite_history" &&
        typeof window !== "undefined" &&
        !window.confirm(
          tr(
            "Historie overschrijven vervangt alle versies en werkt door in gekoppelde rapporten. Weet je het zeker?",
            "Overwrite history replaces all versions and updates linked reports. Are you sure?"
          )
        )
      ) {
        return;
      }
      onUpdateProtocol(editingId, {
        name,
        effectiveFrom,
        items: draft.compounds,
        compounds: draft.compounds,
        notes: draft.notes,
        saveMode: mode
      });
      closeEditor();
      return;
    }

    const now = new Date().toISOString();
    const version = createProtocolVersion({
      name,
      effectiveFrom,
      items: draft.compounds,
      notes: draft.notes,
      createdAt: now
    });
    onAddProtocol({
      id: createId(),
      name,
      items: version.items,
      compounds: version.compounds,
      versions: [version],
      notes: version.notes,
      createdAt: now,
      updatedAt: now
    });
    closeEditor();
  };

  const requestSaveEditor = () => {
    if (editorMode === "edit") {
      setShowSaveModeDialog(true);
      setSaveMode("new_version");
      return;
    }
    saveEditor("new_version");
  };

  const modalTitle = editorMode === "edit"
    ? tr(`${entitySingular.charAt(0).toUpperCase() + entitySingular.slice(1)} bewerken`, `Edit ${entitySingular}`)
    : tr(`${entitySingular.charAt(0).toUpperCase() + entitySingular.slice(1)} aanmaken`, `Create ${entitySingular}`);

  return (
    <section className="space-y-3 fade-in">
      <div className="app-teal-glow-surface rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-100">{entityTitle}</h3>
            <p className="text-sm text-slate-300">{entitySummary}</p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200 disabled:opacity-50"
            onClick={startCreate}
            disabled={isShareMode}
          >
            <Plus className="h-4 w-4" /> {tr(`Nieuw ${entitySingular}`, `New ${entitySingular}`)}
          </button>
        </div>
      </div>

      {feedback ? (
        <p className="px-1 text-sm text-cyan-300">{feedback}</p>
      ) : null}

      {protocols.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-400">
          {tr(`Nog geen ${entityPlural} opgeslagen.`, `No ${entityPlural} saved yet.`)}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {protocols.map((protocol) => {
            const usageCount = getProtocolUsageCount(protocol.id);
            const canDelete = usageCount === 0;
            const versions = ensureProtocolVersions(protocol);
            const latestVersion = versions[versions.length - 1] ?? null;
            const usageByVersion = versionUsageByProtocol.get(protocol.id) ?? new Map<string, number>();
            const activeVersionReportCount = latestVersion ? usageByVersion.get(latestVersion.id) ?? 0 : 0;
            const versionRows: VersionRangeRow[] = versions.map((version, index) => {
              const nextVersion = versions[index + 1] ?? null;
              return {
                versionId: version.id,
                name: version.name || protocol.name,
                effectiveFrom: version.effectiveFrom,
                effectiveUntil: nextVersion ? previousIsoDate(nextVersion.effectiveFrom) : null,
                itemCount: version.compounds.length,
                reportCount: usageByVersion.get(version.id) ?? 0
              };
            });
            const visibleHistoryRows = [...versionRows].reverse().slice(0, 4);
            return (
              <article
                key={protocol.id}
                className="app-teal-glow-surface rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-base font-semibold text-slate-100">{protocol.name}</h4>
                    <p className="mt-1 text-sm text-slate-300">{getProtocolCompoundsText(protocol) || "-"}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {tr("Rapporten", "Reports")}: {usageCount} ({tr("actieve versie", "active version")}: {activeVersionReportCount})
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {tr("Actief sinds", "Active since")}:{" "}
                      {latestVersion ? formatDateLabel(latestVersion.effectiveFrom, language) : "-"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {tr("Items", "Items")}: {latestVersion?.compounds.length ?? protocol.compounds.length}
                    </p>
                  </div>
                  {activeProtocolId === protocol.id ? (
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
                      {tr("Actief", "Active")}
                    </span>
                  ) : null}
                </div>

                {visibleHistoryRows.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-900/40 p-2.5">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">
                      {tr("Versiehistorie", "Version history")}
                    </p>
                    <div className="mt-2 space-y-2">
                      {visibleHistoryRows.map((row) => (
                        <div key={row.versionId} className="rounded-lg border border-slate-700/60 bg-slate-800/50 px-2.5 py-2">
                          <p className="text-xs font-medium text-slate-100">{row.name}</p>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {formatDateLabel(row.effectiveFrom, language)}{" "}
                            {row.effectiveUntil
                              ? `${tr("tot", "to")} ${formatDateLabel(row.effectiveUntil, language)}`
                              : tr("tot nu", "to present")}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {tr("Rapporten", "Reports")}: {row.reportCount} | {tr("Items", "Items")}: {row.itemCount}
                          </p>
                        </div>
                      ))}
                    </div>
                    {versionRows.length > visibleHistoryRows.length ? (
                      <p className="mt-2 text-[11px] text-slate-500">
                        {tr(
                          `Laatste ${visibleHistoryRows.length} van ${versionRows.length} versies zichtbaar.`,
                          `Showing latest ${visibleHistoryRows.length} of ${versionRows.length} versions.`
                        )}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-xs text-cyan-200"
                    onClick={() => startEdit(protocol)}
                    disabled={isShareMode}
                  >
                    <Pencil className="h-3.5 w-3.5" /> {tr("Bewerken", "Edit")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-2.5 py-1.5 text-xs text-slate-200"
                    onClick={() => duplicateAndEdit(protocol)}
                    disabled={isShareMode}
                  >
                    <Copy className="h-3.5 w-3.5" /> {tr("Dupliceer & bewerk", "Duplicate & edit")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-200 disabled:opacity-50"
                    onClick={() => {
                      if (!canDelete) {
                        setFeedback(
                          tr(
                            `Kan niet verwijderen, gebruikt door ${usageCount} rapporten.`,
                            `Cannot delete, used by ${usageCount} reports.`
                          )
                        );
                        return;
                      }
                      onDeleteProtocol(protocol.id);
                      setFeedback(tr(
                        `${entitySingular.charAt(0).toUpperCase() + entitySingular.slice(1)} verwijderd.`,
                        `${entitySingular.charAt(0).toUpperCase() + entitySingular.slice(1)} deleted.`
                      ));
                    }}
                    disabled={isShareMode}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {tr("Verwijderen", "Delete")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editorMode
        ? createPortal(
            <div
              className="app-modal-overlay z-[92]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="protocol-editor-modal-title"
            >
              <div
                className="app-modal-shell relative w-full max-w-5xl bg-slate-900"
                onClick={(event) => event.stopPropagation()}
              >
                {/* Header */}
                <div className="app-modal-header p-5">
                  <div className="app-modal-header-glow" aria-hidden />
                  <div className="relative flex items-start justify-between gap-3">
                    <h4
                      id="protocol-editor-modal-title"
                      className="text-lg font-semibold text-slate-50"
                    >
                      {modalTitle}
                    </h4>
                    <button
                      type="button"
                      className="app-modal-close-btn"
                      onClick={requestCloseEditor}
                      aria-label={tr("Sluiten", "Close")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Body */}
                <div className="max-h-[calc(100vh-18rem)] overflow-y-auto p-5">
                  {editorMode === "edit" && editingId && getProtocolUsageCount(editingId) > 0 ? (
                    <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                      {tr(
                        `Dit ${entitySingular} is gekoppeld aan ${getProtocolUsageCount(editingId)} rapporten. Kies bij opslaan voor Nieuwe versie (veilig) of Historie overschrijven (retroactief).`,
                        `This ${entitySingular} is linked to ${getProtocolUsageCount(editingId)} reports. On save choose New version (safe) or Overwrite history (retroactive).`
                      )}
                    </div>
                  ) : null}

                  <ProtocolEditor value={draft} language={language} onChange={setDraft} />

                  {feedback ? (
                    <p className="mt-3 text-sm text-rose-300">{feedback}</p>
                  ) : null}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 border-t border-slate-700/60 p-4">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600/70 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-slate-100"
                    onClick={requestCloseEditor}
                  >
                    <X className="h-4 w-4" /> {tr("Annuleren", "Cancel")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:border-emerald-400/70 hover:bg-emerald-500/22"
                    onClick={requestSaveEditor}
                  >
                    <Save className="h-4 w-4" /> {tr("Opslaan", "Save")}
                  </button>
                </div>
              </div>

              {showSaveModeDialog ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/70 p-4">
                  <div className="w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-xl">
                    <h5 className="text-base font-semibold text-slate-100">
                      {tr("Hoe wil je opslaan?", "How do you want to save?")}
                    </h5>
                    <p className="mt-1 text-xs text-slate-400">
                      {tr(
                        "Standaard is Nieuwe versie. Historie overschrijven past ook bestaande rapportcontext aan.",
                        "Default is New version. Overwrite history also updates existing report context."
                      )}
                    </p>

                    <div className="mt-3 space-y-2">
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-2 text-sm text-slate-100">
                        <input
                          type="radio"
                          name="protocol-save-mode"
                          checked={saveMode === "new_version"}
                          onChange={() => setSaveMode("new_version")}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="block font-medium">{tr("Nieuwe versie", "New version")}</span>
                          <span className="block text-xs text-slate-300">
                            {tr(
                              "Veilig: oude rapporten blijven zoals ze waren, nieuwe datum start een nieuwe versie.",
                              "Safe: old reports stay as they were, this creates a new version from the chosen date."
                            )}
                          </span>
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-rose-500/35 bg-rose-500/10 p-2 text-sm text-slate-100">
                        <input
                          type="radio"
                          name="protocol-save-mode"
                          checked={saveMode === "overwrite_history"}
                          onChange={() => setSaveMode("overwrite_history")}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="block font-medium">{tr("Historie overschrijven", "Overwrite history")}</span>
                          <span className="block text-xs text-slate-300">
                            {tr(
                              "Expert: vervangt alle bestaande versies en werkt door in gekoppelde rapporten.",
                              "Expert: replaces all existing versions and updates linked reports."
                            )}
                          </span>
                        </span>
                      </label>
                    </div>

                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600/70 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-slate-100"
                        onClick={() => setShowSaveModeDialog(false)}
                      >
                        <X className="h-4 w-4" /> {tr("Annuleren", "Cancel")}
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:border-emerald-400/70 hover:bg-emerald-500/22"
                        onClick={() => {
                          saveEditor(saveMode);
                        }}
                      >
                        <Save className="h-4 w-4" /> {tr("Bevestig opslaan", "Confirm save")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </section>
  );
};

export default ProtocolView;
