import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";

export interface EditableCellProps {
  value: string | number | null;
  align?: "left" | "right";
  placeholder?: string;
  editLabel?: string;
  clickToEdit?: boolean;
  inlineIcon?: boolean;
  onCommit: (value: string) => void;
}

const EditableCell = ({
  value,
  align = "left",
  placeholder = "",
  editLabel = "Edit value",
  clickToEdit = false,
  inlineIcon = false,
  onCommit
}: EditableCellProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value === null ? "" : String(value));

  useEffect(() => {
    setDraft(value === null ? "" : String(value));
  }, [value]);

  if (isEditing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          onCommit(draft);
          setIsEditing(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onCommit(draft);
            setIsEditing(false);
          }
          if (event.key === "Escape") {
            setDraft(value === null ? "" : String(value));
            setIsEditing(false);
          }
        }}
        placeholder={placeholder}
        className={`w-full rounded-md border border-cyan-500/40 bg-slate-900/80 px-2 py-1 text-sm text-slate-100 focus:outline-none ${
          align === "right" ? "text-right" : "text-left"
        }`}
      />
    );
  }

  const renderedValue = value === null || value === "" ? "-" : String(value);
  const startEditing = () => setIsEditing(true);

  if (inlineIcon) {
    return (
      <div className={`min-h-7 ${align === "right" ? "text-right" : "text-left"}`}>
        <button
          type="button"
          className={`group inline-flex items-center gap-1 rounded px-0.5 text-sm text-slate-200 hover:text-cyan-200 ${
            align === "right" ? "ml-auto" : ""
          }`}
          onClick={startEditing}
          aria-label={editLabel}
        >
          <span>{renderedValue}</span>
          <Pencil className="h-3 w-3 text-slate-500/55 transition group-hover:text-slate-300" />
        </button>
      </div>
    );
  }

  if (clickToEdit) {
    return (
      <div className={`min-h-7 ${align === "right" ? "text-right" : "text-left"}`}>
        <button
          type="button"
          className={`group inline-flex items-center gap-1 rounded px-0.5 text-sm text-slate-200 hover:text-cyan-200 ${
            align === "right" ? "ml-auto" : ""
          }`}
          onClick={startEditing}
          aria-label={editLabel}
        >
          <span>{renderedValue}</span>
          <Pencil className="h-3 w-3 text-slate-500/50 transition group-hover:text-slate-300" />
        </button>
      </div>
    );
  }

  return (
    <div className={`group relative min-h-7 ${align === "right" ? "text-right" : "text-left"}`}>
      <span className="pr-6 text-sm text-slate-200">{renderedValue}</span>
      <button
        type="button"
        className="absolute right-0 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:text-cyan-300"
        onClick={startEditing}
        aria-label={editLabel}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default EditableCell;
