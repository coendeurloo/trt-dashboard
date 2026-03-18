interface AIAnalysisHeaderProps {
  title: string;
  subtitle: string;
  memoryLabel: string | null;
  isDarkTheme: boolean;
}

const AIAnalysisHeader = ({ title, subtitle, memoryLabel, isDarkTheme }: AIAnalysisHeaderProps) => {
  return (
    <header
      className={
        isDarkTheme
          ? "rounded-2xl border border-slate-700/70 bg-slate-900/55 p-5"
          : "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      }
    >
      <div className="space-y-1">
        <h3 className={isDarkTheme ? "text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl" : "text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl"}>
          {title}
        </h3>
        <p className={isDarkTheme ? "max-w-3xl text-sm text-slate-300" : "max-w-3xl text-sm text-slate-600"}>{subtitle}</p>
      </div>
      {memoryLabel ? (
        <p className={isDarkTheme ? "mt-3 text-xs text-slate-400" : "mt-3 text-xs text-slate-600"}>
          {memoryLabel}
        </p>
      ) : null}
    </header>
  );
};

export default AIAnalysisHeader;
