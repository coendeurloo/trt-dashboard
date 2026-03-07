export const getDemoBannerButtonClassNames = (isDarkTheme: boolean): { clearDemoButtonClassName: string; uploadOwnPdfButtonClassName: string } => {
  const clearDemoButtonClassName = isDarkTheme
    ? "rounded-md border border-cyan-500/55 bg-transparent px-3 py-1.5 text-sm text-cyan-100 hover:border-cyan-400 hover:bg-cyan-500/10"
    : "rounded-md border border-cyan-300 bg-white px-3 py-1.5 text-sm text-cyan-900 hover:border-cyan-400 hover:bg-cyan-50";
  const uploadOwnPdfButtonClassName = isDarkTheme
    ? "rounded-md border border-cyan-300/70 bg-cyan-400 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
    : "rounded-md border border-cyan-500 bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-cyan-600";
  return {
    clearDemoButtonClassName,
    uploadOwnPdfButtonClassName
  };
};

