import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import ProtocolEditor from "../components/ProtocolEditor";
import { ProtocolDraft, blankProtocolDraft } from "../components/protocolEditorModel";
import { trLocale } from "../i18n";
import { getProtocolCompoundsText, getReportProtocol } from "../protocolUtils";
import { AppLanguage, LabReport, Protocol, UserProfile } from "../types";
import { createId } from "../utils";

interface ProtocolViewProps {
  protocols: Protocol[];
  reports: LabReport[];
  language: AppLanguage;
  userProfile: UserProfile;
  isShareMode: boolean;
  onAddProtocol: (protocol: Protocol) => void;
  onUpdateProtocol: (id: string, updates: Partial<Protocol>) => void;
  onDeleteProtocol: (id: string) => boolean;
  getProtocolUsageCount: (id: string) => number;
}

const protocolToDraft = (protocol: Protocol): ProtocolDraft => ({
  name: protocol.name,
  items: protocol.items,
  compounds: protocol.compounds,
  notes: protocol.notes
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
  const [feedback, setFeedback] = useState("");

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

  const startCreate = () => {
    setEditorMode("create");
    setEditingId(null);
    setDraft(blankProtocolDraft());
    setFeedback("");
  };

  const startEdit = (protocol: Protocol) => {
    setEditorMode("edit");
    setEditingId(protocol.id);
    setDraft(protocolToDraft(protocol));
    setFeedback("");
  };

  const duplicateAndEdit = (protocol: Protocol) => {
    setEditorMode("create");
    setEditingId(null);
    setDraft({
      ...protocolToDraft(protocol),
      name: `${tr("Kopie van", "Copy of")} ${protocol.name}`
    });
    setFeedback("");
  };

  const cancelEditor = () => {
    setEditorMode(null);
    setEditingId(null);
    setDraft(blankProtocolDraft());
    setFeedback("");
  };

  const saveEditor = () => {
    const name = draft.name.trim();
    if (!name) {
      setFeedback(tr(`Geef een naam voor dit ${entitySingular}.`, `Please enter a name for this ${entitySingular}.`));
      return;
    }
    if (draft.compounds.length === 0) {
      setFeedback(tr(`Voeg minimaal 1 ${itemLabel} toe.`, `Add at least 1 ${itemLabel}.`));
      return;
    }

    if (editorMode === "edit" && editingId) {
      onUpdateProtocol(editingId, {
        name,
        items: draft.compounds,
        compounds: draft.compounds,
        notes: draft.notes
      });
      setEditorMode(null);
      setEditingId(null);
      setDraft(blankProtocolDraft());
      setFeedback("");
      return;
    }

    const now = new Date().toISOString();
    onAddProtocol({
      id: createId(),
      name,
      items: draft.compounds,
      compounds: draft.compounds,
      notes: draft.notes,
      createdAt: now,
      updatedAt: now
    });
    setEditorMode(null);
    setEditingId(null);
    setDraft(blankProtocolDraft());
    setFeedback("");
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
                      {tr("Rapporten", "Reports")}: {usageCount}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {tr("Items", "Items")}: {protocol.compounds.length}
                    </p>
                  </div>
                  {activeProtocolId === protocol.id ? (
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
                      {tr("Actief", "Active")}
                    </span>
                  ) : null}
                </div>

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
              onClick={cancelEditor}
            >
              <div
                className="app-modal-shell w-full max-w-5xl bg-slate-900"
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
                      onClick={cancelEditor}
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
                        `Dit ${entitySingular} is gekoppeld aan ${getProtocolUsageCount(editingId)} rapporten. Wijzigingen gelden voor toekomstig gebruik.`,
                        `This ${entitySingular} is linked to ${getProtocolUsageCount(editingId)} reports. Changes apply to future use.`
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
                    onClick={cancelEditor}
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
    </section>
  );
};

export default ProtocolView;
