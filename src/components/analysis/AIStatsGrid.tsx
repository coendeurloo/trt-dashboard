interface AIStatsGridProps {
  reportsInScope: number;
  markersTracked: number;
  unitSystemLabel: string;
  activeProtocolLabel: string;
  reportsLabel: string;
  markersLabel: string;
  unitLabel: string;
  protocolLabel: string;
  usageLabelTitle: string;
  usageLabel: string;
  usageHint: string | null;
  isDarkTheme: boolean;
}

const statLabelClass = (isDarkTheme: boolean): string =>
  isDarkTheme ? "text-[11px] uppercase tracking-wide text-slate-500" : "text-[11px] uppercase tracking-wide text-slate-500";
const statValueClass = (isDarkTheme: boolean): string =>
  isDarkTheme ? "mt-1 text-sm font-semibold text-slate-100" : "mt-1 text-sm font-semibold text-slate-900";

const AIStatsGrid = ({
  reportsInScope,
  markersTracked,
  unitSystemLabel,
  activeProtocolLabel,
  reportsLabel,
  markersLabel,
  unitLabel,
  protocolLabel,
  usageLabelTitle,
  usageLabel,
  usageHint,
  isDarkTheme
}: AIStatsGridProps) => {
  const statItems = [
    { label: reportsLabel, value: String(reportsInScope) },
    { label: markersLabel, value: String(markersTracked) },
    { label: unitLabel, value: unitSystemLabel },
    { label: protocolLabel, value: activeProtocolLabel },
    { label: usageLabelTitle, value: usageLabel }
  ];

  return (
    <section
      className={
        isDarkTheme
          ? "rounded-2xl border border-slate-700/70 bg-slate-900/55 px-3 py-3 sm:px-4"
          : "rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm sm:px-4"
      }
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-5">
        {statItems.map((item) => (
          <article key={item.label} className="min-w-0">
            <p className={statLabelClass(isDarkTheme)}>{item.label}</p>
            <p className={`${statValueClass(isDarkTheme)} truncate`}>{item.value}</p>
          </article>
        ))}
      </div>
      {usageHint ? <p className={isDarkTheme ? "mt-2 text-xs text-amber-300" : "mt-2 text-xs text-amber-700"}>{usageHint}</p> : null}
    </section>
  );
};

export default AIStatsGrid;
