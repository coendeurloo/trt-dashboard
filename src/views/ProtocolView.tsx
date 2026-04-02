import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Copy, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import EmptyStateCard from "../components/EmptyStateCard";
import ProtocolEditor from "../components/ProtocolEditor";
import { ProtocolDraft, blankProtocolDraft } from "../components/protocolEditorModel";
import { trLocale } from "../i18n";
import { getMostRecentlyUpdatedProtocolId, getProtocolCompoundsText } from "../protocolUtils";
import {
  createProtocolVersion,
  ensureProtocolVersions,
  getLatestProtocolVersion,
  todayIsoDate
} from "../protocolVersions";
import { AppLanguage, LabReport, Protocol, ProtocolUpdateMode, UserProfile } from "../types";
import { createId, formatDate } from "../utils";

interface ProtocolViewProps {
  protocols: Protocol[];
  reports: LabReport[];
  language: AppLanguage;
  userProfile: UserProfile;
  isShareMode: boolean;
  onAddProtocol: (protocol: Protocol) => void;
  onUpdateProtocol: (
    id: string,
    updates: Partial<Protocol> & { effectiveFrom?: string },
    mode?: ProtocolUpdateMode
  ) => void;
  onDeleteProtocol: (id: string) => boolean;
  getProtocolUsageCount: (id: string) => number;
}

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
  const [showSaveChoiceDialog, setShowSaveChoiceDialog] = useState(false);

  const activeProtocolId = useMemo(() => getMostRecentlyUpdatedProtocolId(protocols), [protocols]);
  const sortedProtocols = useMemo(
    () =>
      [...protocols].sort((left, right) => {
        const leftActive = left.id === activeProtocolId;
        const rightActive = right.id === activeProtocolId;
        if (leftActive !== rightActive) {
          return leftActive ? -1 : 1;
        }
        const leftCreatedAt = left.createdAt || left.updatedAt;
        const rightCreatedAt = right.createdAt || right.updatedAt;
        const byCreatedAt = rightCreatedAt.localeCompare(leftCreatedAt);
        if (byCreatedAt !== 0) {
          return byCreatedAt;
        }
        return right.updatedAt.localeCompare(left.updatedAt);
      }),
    [protocols, activeProtocolId]
  );
  const linkedReportsForEditing = useMemo(() => {
    if (!editingId) {
      return [];
    }
    return reports
      .filter((report) => (report.annotations.interventionId ?? report.annotations.protocolId ?? null) === editingId)
      .sort((left, right) => {
        const byDate = right.testDate.localeCompare(left.testDate);
        if (byDate !== 0) {
          return byDate;
        }
        return right.createdAt.localeCompare(left.createdAt);
      });
  }, [editingId, reports]);

  const startCreate = () => {
    const nextDraft = blankProtocolDraft();
    setEditorMode("create");
    setEditingId(null);
    setShowSaveChoiceDialog(false);
    setDraft(nextDraft);
    setInitialDraft(nextDraft);
    setFeedback("");
  };

  const startEdit = (protocol: Protocol) => {
    const normalizedProtocol: Protocol = {
      ...protocol,
      versions: ensureProtocolVersions(protocol)
    };
    const nextDraft = protocolToDraft(normalizedProtocol);
    setEditorMode("edit");
    setEditingId(protocol.id);
    setShowSaveChoiceDialog(false);
    setDraft(nextDraft);
    setInitialDraft(nextDraft);
    setFeedback("");
  };

  const duplicateAndEdit = (protocol: Protocol) => {
    const nextDraft: ProtocolDraft = {
      ...protocolToDraft(protocol),
      effectiveFrom: todayIsoDate(),
      name: `${tr("Kopie van", "Copy of")} ${protocol.name}`
    };
    setEditorMode("create");
    setEditingId(null);
    setShowSaveChoiceDialog(false);
    setDraft(nextDraft);
    setInitialDraft(nextDraft);
    setFeedback("");
  };

  const hasUnsavedChanges =
    editorMode !== null && canonicalizeDraftForCompare(draft) !== canonicalizeDraftForCompare(initialDraft);

  const closeEditor = () => {
    setEditorMode(null);
    setEditingId(null);
    setShowSaveChoiceDialog(false);
    const nextDraft = blankProtocolDraft();
    setDraft(nextDraft);
    setInitialDraft(nextDraft);
    setFeedback("");
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

  const applyEditUpdate = (mode: ProtocolUpdateMode) => {
    if (!editingId) {
      return;
    }
    const name = draft.name.trim();
    const effectiveFrom = draft.effectiveFrom.trim() || todayIsoDate();
    onUpdateProtocol(
      editingId,
      {
        name,
        effectiveFrom,
        items: draft.compounds,
        compounds: draft.compounds,
        notes: draft.notes
      },
      mode
    );
    closeEditor();
  };

  const saveEditor = () => {
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
      if (linkedReportsForEditing.length > 0) {
        setShowSaveChoiceDialog(true);
        return;
      }
      applyEditUpdate("replace_existing");
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
          <Button
            onClick={startCreate}
            disabled={isShareMode}
            className="gap-1"
          >
            <Plus className="h-4 w-4" /> {tr(`Nieuw ${entitySingular}`, `New ${entitySingular}`)}
          </Button>
        </div>
      </div>

      {feedback ? (
        <p className="px-1 text-sm text-cyan-300">{feedback}</p>
      ) : null}

      {sortedProtocols.length === 0 ? (
        <EmptyStateCard
          title={tr(`Nog geen ${entityPlural} opgeslagen`, `No ${entityPlural} saved yet`)}
          description={tr(
            `Maak je eerste ${entitySingular} om doseringen, frequenties en wijzigingen gestructureerd te volgen.`,
            `Create your first ${entitySingular} to track doses, frequencies, and changes in one place.`
          )}
          actionLabel={tr(`Nieuw ${entitySingular}`, `New ${entitySingular}`)}
          onAction={startCreate}
          actionDisabled={isShareMode}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {sortedProtocols.map((protocol) => {
            const usageCount = getProtocolUsageCount(protocol.id);
            const canDelete = usageCount === 0;
            const latestVersion = getLatestProtocolVersion(protocol);
            const isActive = protocol.id === activeProtocolId;
            return (
              <article
                key={protocol.id}
                className="app-teal-glow-surface rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="truncate text-base font-semibold text-slate-100">{protocol.name}</h4>
                    <p className="mt-1 text-sm text-slate-300">{getProtocolCompoundsText(protocol) || "-"}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {tr("Rapporten", "Reports")}: {usageCount}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {tr("Items", "Items")}: {latestVersion?.compounds.length ?? protocol.compounds.length}
                    </p>
                  </div>
                  {isActive ? (
                    <span className="shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-200">
                      {tr("Actief", "Active")}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    onClick={() => startEdit(protocol)}
                    disabled={isShareMode}
                    variant="default"
                    size="sm"
                    className="gap-1"
                  >
                    <Pencil className="h-3.5 w-3.5" /> {tr("Bewerken", "Edit")}
                  </Button>
                  <Button
                    onClick={() => duplicateAndEdit(protocol)}
                    disabled={isShareMode}
                    variant="outline"
                    size="sm"
                    className="gap-1"
                  >
                    <Copy className="h-3.5 w-3.5" /> {tr("Dupliceer & bewerk", "Duplicate & edit")}
                  </Button>
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
                      if (
                        typeof window !== "undefined" &&
                        !window.confirm(
                          tr(
                            `Weet je zeker dat je ${protocol.name} wilt verwijderen?`,
                            `Are you sure you want to delete ${protocol.name}?`
                          )
                        )
                      ) {
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
                    onClick={saveEditor}
                  >
                    <Save className="h-4 w-4" /> {tr("Opslaan", "Save")}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {showSaveChoiceDialog && editorMode === "edit" && editingId
        ? createPortal(
            <div
              className="app-modal-overlay z-[96]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="protocol-save-choice-title"
            >
              <div
                className="app-modal-shell protocol-save-choice-modal relative w-full max-w-3xl bg-slate-900"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="app-modal-header p-5">
                  <div className="app-modal-header-glow" aria-hidden />
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/15 text-amber-200">
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h4 id="protocol-save-choice-title" className="text-lg font-semibold text-slate-50">
                          {tr("Dit protocol wordt al gebruikt", "This protocol is already in use")}
                        </h4>
                        <p className="mt-1 text-sm text-slate-300">
                          {tr(
                            `Dit ${entitySingular} is gekoppeld aan ${linkedReportsForEditing.length} rapporten.`,
                            `This ${entitySingular} is linked to ${linkedReportsForEditing.length} reports.`
                          )}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {tr(
                            "Kies of je een nieuw protocol wilt maken, of dit protocol retroactief wilt aanpassen.",
                            "Choose whether to create a new protocol, or update this protocol retroactively."
                          )}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="app-modal-close-btn"
                      onClick={() => setShowSaveChoiceDialog(false)}
                      aria-label={tr("Sluiten", "Close")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="max-h-[calc(100vh-18rem)] overflow-y-auto p-5">
                  <div className="protocol-save-choice-report-list rounded-lg border border-slate-700/70 bg-slate-800/55 p-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                    {tr("Gekoppelde rapporten", "Linked reports")}
                    </p>
                    <div className="max-h-48 space-y-1 overflow-y-auto pr-1 text-sm text-slate-200">
                      {linkedReportsForEditing.map((report) => (
                        <div
                          key={`linked-report-${report.id}`}
                          className="protocol-save-choice-report-row flex items-center justify-between gap-3 rounded-md border border-slate-700/60 bg-slate-900/55 px-2.5 py-1.5"
                        >
                          <span className="shrink-0 text-slate-300">{formatDate(report.testDate)}</span>
                          <span className="min-w-0 truncate text-right text-slate-400">{report.sourceFileName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-700/60 p-4">
                  <button
                    type="button"
                    className="inline-flex items-center rounded-lg border border-slate-600/80 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-slate-100"
                    onClick={() => setShowSaveChoiceDialog(false)}
                  >
                    {tr("Annuleren", "Cancel")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200 transition hover:border-amber-400/70 hover:bg-amber-500/18"
                    onClick={() => applyEditUpdate("replace_existing")}
                  >
                    {tr("Bestaand aanpassen", "Update existing")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center rounded-lg border border-cyan-500/45 bg-cyan-500/15 px-3 py-2 text-sm font-medium text-cyan-100 transition hover:border-cyan-400/70 hover:bg-cyan-500/24"
                    onClick={() => applyEditUpdate("create_new")}
                  >
                    {tr("Nieuw protocol maken", "Create new protocol")}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </section>
  );
};

export default ProtocolView;
