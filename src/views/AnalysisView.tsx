import { format, parseISO } from "date-fns";
import { ReactNode } from "react";
import { AlertTriangle, FileText, LineChart, Loader2, Pill, Shield, Sparkles, Stethoscope } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { AppLanguage, AppSettings, LabReport } from "../types";

interface AnalysisViewProps {
  isAnalyzingLabs: boolean;
  analysisError: string;
  analysisResult: string;
  analysisResultDisplay: string;
  analysisGeneratedAt: string | null;
  analysisCopied: boolean;
  analysisKind: "full" | "latestComparison" | null;
  analyzingKind: "full" | "latestComparison" | null;
  visibleReports: LabReport[];
  samplingControlsEnabled: boolean;
  allMarkersCount: number;
  betaRemaining: {
    dailyRemaining: number;
    monthlyRemaining: number;
  };
  betaLimits: {
    maxAnalysesPerDay: number;
    maxAnalysesPerMonth: number;
  };
  settings: AppSettings;
  language: AppLanguage;
  onRunAnalysis: (mode: "full" | "latestComparison") => void;
  onCopyAnalysis: () => void;
}

const AnalysisView = ({
  isAnalyzingLabs,
  analysisError,
  analysisResult,
  analysisResultDisplay,
  analysisGeneratedAt,
  analysisCopied,
  analysisKind,
  analyzingKind,
  visibleReports,
  samplingControlsEnabled,
  allMarkersCount,
  betaRemaining,
  betaLimits,
  settings,
  language,
  onRunAnalysis,
  onCopyAnalysis
}: AnalysisViewProps) => {
  const isNl = language === "nl";
  const tr = (nl: string, en: string): string => (isNl ? nl : en);
  const isDarkTheme = settings.theme === "dark";
  const betaBannerClassName =
    isDarkTheme
      ? "mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/80"
      : "mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900";
  const panelClassName = isDarkTheme
    ? "rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4"
    : "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";
  const panelTitleClassName = isDarkTheme ? "text-base font-semibold text-slate-100" : "text-base font-semibold text-slate-900";
  const panelBodyClassName = isDarkTheme ? "mt-1 text-sm text-slate-400" : "mt-1 text-sm text-slate-600";
  const metaRowClassName = isDarkTheme ? "mt-3 flex flex-wrap gap-4 text-xs text-slate-400" : "mt-3 flex flex-wrap gap-4 text-xs text-slate-600";
  const loadingTextClassName = isDarkTheme ? "inline-flex items-center gap-2 text-sm text-slate-300" : "inline-flex items-center gap-2 text-sm text-slate-700";
  const articleClassName = isDarkTheme
    ? "rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/80 to-slate-950/70 p-4 shadow-xl shadow-slate-950/20"
    : "rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/60";
  const outputTitleClassName = isDarkTheme ? "text-sm font-semibold text-slate-100" : "text-sm font-semibold text-slate-900";
  const outputBodyClassName = isDarkTheme ? "prose-premium-dark mt-3 overflow-x-auto" : "prose-premium-light mt-3 overflow-x-auto";
  const isAnalyzingFull = isAnalyzingLabs && analyzingKind === "full";
  const isAnalyzingLatest = isAnalyzingLabs && analyzingKind === "latestComparison";

  const extractText = (node: ReactNode): string => {
    if (typeof node === "string" || typeof node === "number") {
      return String(node);
    }
    if (Array.isArray(node)) {
      return node.map(extractText).join(" ");
    }
    if (node && typeof node === "object" && "props" in node) {
      const withProps = node as { props?: { children?: ReactNode } };
      return extractText(withProps.props?.children ?? "");
    }
    return "";
  };

  const getHeadingIcon = (headingText: string) => {
    const text = headingText.toLowerCase();
    if (text.includes("supplement")) {
      return { Icon: Pill, emoji: "💊" };
    }
    if (text.includes("safety") || text.includes("veilig")) {
      return { Icon: Shield, emoji: "🛡️" };
    }
    if (text.includes("alert") || text.includes("risk") || text.includes("waarschu")) {
      return { Icon: AlertTriangle, emoji: "⚠️" };
    }
    if (text.includes("trend") || text.includes("pattern") || text.includes("verloop") || text.includes("timeline")) {
      return { Icon: LineChart, emoji: "📈" };
    }
    if (text.includes("summary") || text.includes("samenvatting") || text.includes("conclusion") || text.includes("conclusie")) {
      return { Icon: Sparkles, emoji: "✨" };
    }
    return { Icon: Stethoscope, emoji: "🧪" };
  };

  const renderHeading = (level: "h1" | "h2" | "h3" | "h4", children: ReactNode) => {
    const text = extractText(children);
    const { Icon, emoji } = getHeadingIcon(text);
    const wrapClass =
      level === "h1"
        ? "mt-5 border-b pb-2"
        : level === "h2"
          ? "mt-6 border-b pb-2"
          : level === "h3"
            ? "mt-4"
            : "mt-3";
    const borderClass = isDarkTheme ? "border-slate-700/70" : "border-slate-200";
    const iconChipClass = isDarkTheme
      ? "inline-flex h-7 w-7 items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/10 text-cyan-200"
      : "inline-flex h-7 w-7 items-center justify-center rounded-full border border-cyan-300 bg-cyan-50 text-cyan-800";
    const textClass =
      level === "h1"
        ? isDarkTheme
          ? "text-xl font-semibold text-slate-100"
          : "text-xl font-semibold text-slate-900"
        : level === "h2"
          ? isDarkTheme
            ? "text-lg font-semibold text-cyan-200"
            : "text-lg font-semibold text-cyan-900"
          : level === "h3"
            ? isDarkTheme
              ? "text-base font-semibold text-slate-100"
              : "text-base font-semibold text-slate-900"
            : isDarkTheme
              ? "text-sm font-semibold text-slate-100"
              : "text-sm font-semibold text-slate-900";
    const HeadingTag = level;

    return (
      <div className={`${wrapClass} ${borderClass}`}>
        <div className="flex items-center gap-2">
          <span className={iconChipClass}>
            <Icon className="h-4 w-4" />
          </span>
          <HeadingTag className={textClass}>
            <span className="mr-1">{emoji}</span>
            {children}
          </HeadingTag>
        </div>
      </div>
    );
  };

  return (
    <section className="space-y-3 fade-in">
      <div className={panelClassName}>
        <h3 className={panelTitleClassName}>{tr("AI Lab Analyse", "AI Lab Analysis")}</h3>
        <p className={panelBodyClassName}>
          {tr(
            "Laat AI je labwaardes analyseren, inclusief protocol, supplementen en symptomen. Gratis tijdens de beta.",
            "Let AI analyze your lab values including protocol, supplements, and symptoms. Free during beta."
          )}
        </p>

        <div className={betaBannerClassName}>
          <span className="font-medium">Free beta</span>
          {" - "}
          {betaRemaining.dailyRemaining}/{betaLimits.maxAnalysesPerDay} analyses today
          {" · "}
          {betaRemaining.monthlyRemaining}/{betaLimits.maxAnalysesPerMonth} this month
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-cyan-500/50 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200 disabled:opacity-50"
            onClick={() => onRunAnalysis("full")}
            disabled={
              isAnalyzingLabs ||
              visibleReports.length === 0 ||
              betaRemaining.dailyRemaining === 0 ||
              betaRemaining.monthlyRemaining === 0
            }
          >
            {isAnalyzingFull ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isAnalyzingFull ? tr("Analyseren...", "Analyzing...") : tr("Volledige AI-analyse", "Full AI analysis")}
          </button>
          <button
            type="button"
            className="analysis-latest-btn inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-200 disabled:opacity-50"
            onClick={() => onRunAnalysis("latestComparison")}
            disabled={
              isAnalyzingLabs ||
              visibleReports.length < 2 ||
              betaRemaining.dailyRemaining === 0 ||
              betaRemaining.monthlyRemaining === 0
            }
          >
            {isAnalyzingLatest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isAnalyzingLatest ? tr("Analyseren...", "Analyzing...") : tr("Laatste vs vorige", "Latest vs previous")}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-50"
            onClick={onCopyAnalysis}
            disabled={!analysisResult}
          >
            <FileText className="h-4 w-4" /> {analysisCopied ? tr("Gekopieerd", "Copied") : tr("Kopieer analyse", "Copy analysis")}
          </button>
        </div>

        <div className={metaRowClassName}>
          <span>
            {tr("Rapporten in scope", "Reports in scope")}: {visibleReports.length}
            {visibleReports.length > 4 ? tr(" (laatste 4 volledig + trends)", " (latest 4 full + trends)") : ""}
          </span>
          {samplingControlsEnabled ? <span>{tr("Meetmoment-filter", "Sampling filter")}: {settings.samplingFilter}</span> : null}
          <span>{tr("Markers gevolgd", "Markers tracked")}: {allMarkersCount}</span>
          <span>{tr("Eenheden", "Unit system")}: {settings.unitSystem.toUpperCase()}</span>
          <span>{tr("Formaat: alleen tekst (geen tabellen)", "Format: text-only (no tables)")}</span>
          {analysisGeneratedAt ? (
            <span>{tr("Laatste run", "Last run")}: {format(parseISO(analysisGeneratedAt), "dd MMM yyyy HH:mm")}</span>
          ) : null}
        </div>
      </div>

      {analysisError ? (
        <div
          className={
            isDarkTheme
              ? "rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"
              : "rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
          }
        >
          {analysisError}
        </div>
      ) : null}

      {isAnalyzingLabs ? (
        <div className={isDarkTheme ? "rounded-2xl border border-slate-700/70 bg-slate-900/60 p-5" : "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"}>
          <div className={loadingTextClassName}>
            <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
            {tr("AI is je trendanalyse aan het opstellen...", "AI is preparing your trend analysis...")}
          </div>
        </div>
      ) : null}

      {analysisResult ? (
        <article className={articleClassName}>
          <h4 className={outputTitleClassName}>
            {analysisKind === "latestComparison"
              ? tr("Analyse-output (laatste vs vorige)", "Analysis output (latest vs previous)")
              : tr("Analyse-output (volledig)", "Analysis output (full)")}
          </h4>
          <div className={outputBodyClassName}>
            <ReactMarkdown
              skipHtml
              remarkPlugins={[remarkBreaks]}
              allowedElements={["h1", "h2", "h3", "h4", "p", "strong", "em", "ul", "ol", "li", "blockquote", "code", "pre", "br", "hr"]}
              components={{
                h1: ({ children }) => renderHeading("h1", children),
                h2: ({ children }) => renderHeading("h2", children),
                h3: ({ children }) => renderHeading("h3", children),
                h4: ({ children }) => renderHeading("h4", children),
                p: ({ children }) => (
                  <p className={isDarkTheme ? "mt-2 text-sm leading-7 text-slate-200" : "mt-2 text-sm leading-7 text-slate-700"}>{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className={isDarkTheme ? "mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-200" : "mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-700"}>
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className={isDarkTheme ? "mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-200" : "mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-700"}>
                    {children}
                  </ol>
                ),
                li: ({ children }) => <li className="leading-7">{children}</li>,
                strong: ({ children }) => <strong className={isDarkTheme ? "font-semibold text-slate-100" : "font-semibold text-slate-900"}>{children}</strong>,
                em: ({ children }) => <em className={isDarkTheme ? "italic text-slate-200" : "italic text-slate-700"}>{children}</em>,
                blockquote: ({ children }) => (
                  <blockquote
                    className={
                      isDarkTheme
                        ? "mt-3 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-300"
                        : "mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                    }
                  >
                    {children}
                  </blockquote>
                ),
                code: ({ children }) => (
                  <code
                    className={
                      isDarkTheme
                        ? "rounded bg-slate-800/80 px-1 py-0.5 text-[13px] text-slate-100"
                        : "rounded bg-slate-100 px-1 py-0.5 text-[13px] text-slate-900"
                    }
                  >
                    {children}
                  </code>
                ),
                pre: ({ children }) => (
                  <pre
                    className={
                      isDarkTheme
                        ? "mt-2 overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-200"
                        : "mt-2 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800"
                    }
                  >
                    {children}
                  </pre>
                ),
                hr: () => <hr className={isDarkTheme ? "my-4 border-slate-700" : "my-4 border-slate-200"} />
              }}
            >
              {analysisResultDisplay}
            </ReactMarkdown>
          </div>
        </article>
      ) : null}
    </section>
  );
};

export default AnalysisView;
