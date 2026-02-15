import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";

export interface EditableCellProps {
  value: string | number | null;
  align?: "left" | "right";
  placeholder?: string;
  editLabel?: string;
  onCommit: (value: string) => void;
}

const EditableCell = ({ value, align = "left", placeholder = "", editLabel = "Edit value", onCommit }: EditableCellProps) => {
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

  return (
    <div className={`group relative min-h-7 ${align === "right" ? "text-right" : "text-left"}`}>
      <span className="pr-6 text-sm text-slate-200">{value === null || value === "" ? "-" : String(value)}</span>
      <button
        type="button"
        className="absolute right-0 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:text-cyan-300"
        onClick={() => setIsEditing(true)}
        aria-label={editLabel}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default EditableCell;
