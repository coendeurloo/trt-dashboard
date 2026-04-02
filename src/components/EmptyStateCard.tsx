import { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface EmptyStateCardProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  icon?: ReactNode;
  isDarkTheme?: boolean;
}

const EmptyStateCard = ({
  title,
  description,
  actionLabel,
  onAction,
  actionDisabled = false,
  icon,
  isDarkTheme = true
}: EmptyStateCardProps) => {
  return (
    <section
      className={
        isDarkTheme
          ? "rounded-xl border border-dashed border-slate-700/80 bg-slate-900/40 px-5 py-8 text-center"
          : "rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-5 py-8 text-center"
      }
    >
      {icon ? <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center">{icon}</div> : null}
      <p className={isDarkTheme ? "text-base font-semibold text-slate-100" : "text-base font-semibold text-slate-900"}>{title}</p>
      <p className={isDarkTheme ? "mx-auto mt-1 max-w-xl text-sm text-slate-400" : "mx-auto mt-1 max-w-xl text-sm text-slate-600"}>{description}</p>
      {actionLabel && onAction ? (
        <Button
          onClick={onAction}
          disabled={actionDisabled}
          className="mt-4"
        >
          {actionLabel}
        </Button>
      ) : null}
    </section>
  );
};

export default EmptyStateCard;
