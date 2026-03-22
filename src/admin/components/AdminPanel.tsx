import { ReactNode } from "react";

interface AdminPanelProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

const AdminPanel = ({ title, subtitle, actions, children }: AdminPanelProps) => {
  return (
    <section className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-100">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
};

export default AdminPanel;
