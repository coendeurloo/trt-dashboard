interface AdminMetricCardProps {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn";
}

const toneClassName = (tone: AdminMetricCardProps["tone"]): string => {
  if (tone === "good") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
  }
  if (tone === "warn") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  }
  return "border-slate-700 bg-slate-900/40 text-slate-100";
};

const AdminMetricCard = ({ label, value, tone = "neutral" }: AdminMetricCardProps) => {
  return (
    <article className={`rounded-xl border p-3 ${toneClassName(tone)}`}>
      <p className="text-xs uppercase tracking-wide text-slate-300">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </article>
  );
};

export default AdminMetricCard;
