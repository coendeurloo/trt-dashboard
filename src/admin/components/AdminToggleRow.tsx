interface AdminToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: (next: boolean) => void;
}

const AdminToggleRow = ({
  label,
  description,
  checked,
  disabled = false,
  onToggle
}: AdminToggleRowProps) => {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-700/70 bg-slate-900/40 p-3">
      <div>
        <p className="text-sm font-medium text-slate-100">{label}</p>
        <p className="mt-1 text-xs text-slate-400">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onToggle(!checked)}
        disabled={disabled}
        aria-pressed={checked}
        className={`relative inline-flex h-6 w-11 items-center rounded-full border transition ${
          checked
            ? "border-cyan-400/70 bg-cyan-500/20"
            : "border-slate-600 bg-slate-800"
        } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full transition ${
            checked ? "translate-x-5 bg-cyan-300" : "translate-x-1 bg-slate-400"
          }`}
        />
      </button>
    </div>
  );
};

export default AdminToggleRow;
