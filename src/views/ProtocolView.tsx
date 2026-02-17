import { useMemo, useState } from "react";
import { Copy, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import ProtocolEditor, { ProtocolDraft, blankProtocolDraft } from "../components/ProtocolEditor";
import { getProtocolCompoundsText, getReportProtocol } from "../protocolUtils";
import { AppLanguage, LabReport, Protocol } from "../types";
import { createId } from "../utils";

interface ProtocolViewProps {
  protocols: Protocol[];
  reports: LabReport[];
  language: AppLanguage;
  isShareMode: boolean;
  onAddProtocol: (protocol: Protocol) => void;
  onUpdateProtocol: (id: string, updates: Partial<Protocol>) => void;
  onDeleteProtocol: (id: string) => boolean;
  getProtocolUsageCount: (id: string) => number;
}

const protocolToDraft = (protocol: Protocol): ProtocolDraft => ({
  name: protocol.name,
  compounds: protocol.compounds,
  supplements: protocol.supplements,
  notes: protocol.notes
});

const ProtocolView = ({
  protocols,
  reports,
  language,
  isShareMode,
  onAddProtocol,
  onUpdateProtocol,
  onDeleteProtocol,
  getProtocolUsageCount
}: ProtocolViewProps) => {
  const isNl = language === "nl";
  const tr = (nl: string, en: string): string => (isNl ? nl : en);

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
    return latestWithProtocol?.annotations.protocolId ?? null;
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
      setFeedback(tr("Geef een protocolnaam op.", "Please enter a protocol name."));
      return;
    }
    if (draft.compounds.length === 0) {
      setFeedback(tr("Voeg minimaal 1 compound toe.", "Add at least 1 compound."));
      return;
    }

    if (editorMode === "edit" && editingId) {
      onUpdateProtocol(editingId, {
        name,
        compounds: draft.compounds,
        supplements: draft.supplements,
        notes: draft.notes
      });
      setFeedback(tr("Protocol bijgewerkt.", "Protocol updated."));
      return;
    }

    const now = new Date().toISOString();
    onAddProtocol({
      id: createId(),
      name,
      compounds: draft.compounds,
      supplements: draft.supplements,
      notes: draft.notes,
      createdAt: now,
      updatedAt: now
    });
    setFeedback(tr("Protocol opgeslagen.", "Protocol saved."));
    setEditorMode(null);
    setEditingId(null);
    setDraft(blankProtocolDraft());
  };

  return (
    <section className="space-y-3 fade-in">
      <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-100">{tr("Protocolbeheer", "Protocol management")}</h3>
            <p className="text-sm text-slate-300">
              {tr(
                "Bewaar compounds en supplementen als herbruikbare protocollen.",
                "Store compounds and supplements as reusable protocols."
              )}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200 disabled:opacity-50"
            onClick={startCreate}
            disabled={isShareMode}
          >
            <Plus className="h-4 w-4" /> {tr("Nieuw protocol", "New protocol")}
          </button>
        </div>
      </div>

      {editorMode ? (
        <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/70 p-3 shadow-soft">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-slate-100">
              {editorMode === "edit" ? tr("Protocol bewerken", "Edit protocol") : tr("Protocol aanmaken", "Create protocol")}
            </h4>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
                onClick={cancelEditor}
              >
                <X className="h-4 w-4" /> {tr("Annuleren", "Cancel")}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-200"
                onClick={saveEditor}
              >
                <Save className="h-4 w-4" /> {tr("Opslaan", "Save")}
              </button>
            </div>
          </div>

          {editorMode === "edit" && editingId && getProtocolUsageCount(editingId) > 0 ? (
            <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {tr(
                `Dit protocol is gekoppeld aan ${getProtocolUsageCount(editingId)} rapporten. Wijzigingen gelden voor toekomstig gebruik.`,
                `This protocol is linked to ${getProtocolUsageCount(editingId)} reports. Changes apply to future use.`
              )}
            </div>
          ) : null}

          <ProtocolEditor value={draft} language={language} onChange={setDraft} />

          <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-700/60 pt-3">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200"
              onClick={cancelEditor}
            >
              <X className="h-4 w-4" /> {tr("Annuleren", "Cancel")}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-200"
              onClick={saveEditor}
            >
              <Save className="h-4 w-4" /> {tr("Opslaan", "Save")}
            </button>
          </div>

          {feedback ? <p className="mt-2 text-sm text-cyan-200">{feedback}</p> : null}
        </div>
      ) : null}

      {protocols.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-400">
          {tr("Nog geen protocollen opgeslagen.", "No protocols saved yet.")}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {protocols.map((protocol) => {
            const usageCount = getProtocolUsageCount(protocol.id);
            const canDelete = usageCount === 0;
            return (
              <article
                key={protocol.id}
                className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-base font-semibold text-slate-100">{protocol.name}</h4>
                    <p className="mt-1 text-sm text-slate-300">{getProtocolCompoundsText(protocol) || "-"}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {tr("Supplementen", "Supplements")}: {protocol.supplements.length} · {tr("Rapporten", "Reports")}: {usageCount}
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
                      setFeedback(tr("Protocol verwijderd.", "Protocol deleted."));
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
    </section>
  );
};

export default ProtocolView;
