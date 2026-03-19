import { format, parseISO } from "date-fns";
import { FileText, Loader2 } from "lucide-react";
import { Suspense, lazy } from "react";
import { AnalysisScopeNotice } from "../../analysisScope";
import { StudyBenchmark } from "../../data/studyBenchmarks";

const AnalysisMarkdownBlock = lazy(() => import("../AnalysisMarkdownBlock"));

interface AnalysisModelInfo {
  provider: "claude" | "gemini";
  model: string;
  fallbackUsed: boolean;
  actionsNeeded: boolean;
  actionReasons: string[];
  actionConfidence: "high" | "medium" | "low";
  supplementActionsNeeded: boolean;
  supplementAdviceIncluded: boolean;
  qualityGuardApplied: boolean;
  qualityIssues: string[];
}

interface AIOutputPanelProps {
  analysisRequestState: "idle" | "preparing" | "streaming" | "completed" | "error";
  analysisError: string;
  analysisResult: string;
  analysisResultDisplay: string;
  analysisGeneratedAt: string | null;
  analysisCopied: boolean;
  analysisModelInfo: AnalysisModelInfo | null;
  analysisKind: "full" | "latestComparison" | "question" | null;
  analysisQuestion: string | null;
  analysisScopeNotice: AnalysisScopeNotice | null;
  relevantBenchmarks: StudyBenchmark[];
  isDarkTheme: boolean;
  titleOutput: string;
  titleLatestComparison: string;
  titleQuestionAnswer: string;
  copyLabel: string;
  copiedLabel: string;
  styleLabel: string;
  styleValue: string;
  modelLabel: string;
  providerLabel: string;
  supplementActionsLabel: string;
  noneLabel: string;
  outputGuardLabel: string;
  lastRunLabel: string;
  loadingLabel: string;
  loadingFormatLabel: string;
  emptyBody: string;
  disclaimerLabel: string;
  aiUsesPrefix: string;
  aiUsesMiddle: string;
  aiUsesSuffix: string;
  questionPrefixLabel: string;
  preparingStatusLabel: string;
  streamingStatusLabel: string;
  streamingHintLabel: string;
  onCopyAnalysis: () => void;
}

const formatTimestamp = (value: string): string => {
  try {
    return format(parseISO(value), "dd MMM yyyy HH:mm");
  } catch {
    return value;
  }
};

const AIOutputPanel = ({
  analysisRequestState,
  analysisError,
  analysisResult,
  analysisResultDisplay,
  analysisGeneratedAt,
  analysisCopied,
  analysisModelInfo,
  analysisKind,
  analysisQuestion,
  analysisScopeNotice,
  relevantBenchmarks,
  isDarkTheme,
  titleOutput,
  titleLatestComparison,
  titleQuestionAnswer,
  copyLabel,
  copiedLabel,
  styleLabel,
  styleValue,
  modelLabel,
  providerLabel,
  supplementActionsLabel,
  noneLabel,
  outputGuardLabel,
  lastRunLabel,
  loadingLabel,
  loadingFormatLabel,
  emptyBody,
  disclaimerLabel,
  aiUsesPrefix,
  aiUsesMiddle,
  aiUsesSuffix,
  questionPrefixLabel,
  preparingStatusLabel,
  streamingStatusLabel,
  streamingHintLabel,
  onCopyAnalysis
}: AIOutputPanelProps) => {
  const outputShellClass = isDarkTheme
    ? "rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/80 to-slate-950/75 p-4 shadow-soft sm:p-6"
    : "rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/50 sm:p-6";

  const outputTitle =
    analysisKind === "latestComparison"
      ? titleLatestComparison
      : analysisKind === "question"
        ? titleQuestionAnswer
        : titleOutput;
  const loadingMessage = loadingLabel;
  const isPreparing = analysisRequestState === "preparing";
  const isStreaming = analysisRequestState === "streaming";
  const showLiveOutput = (isPreparing || isStreaming) && analysisResult.length > 0;
  const showLoadingCard = (isPreparing || isStreaming) && analysisResult.length === 0;
  const metadataParts: string[] = [];
  if (analysisModelInfo) {
    metadataParts.push(`${styleLabel}: ${styleValue}`);
    metadataParts.push(`${modelLabel}: ${analysisModelInfo.model}`);
    metadataParts.push(`${providerLabel}: ${analysisModelInfo.provider}`);
    metadataParts.push(
      `${supplementActionsLabel}: ${analysisModelInfo.supplementActionsNeeded ? analysisModelInfo.actionReasons.length : noneLabel}`
    );
    if (analysisModelInfo.fallbackUsed) {
      metadataParts.push("Fallback");
    }
    if (analysisModelInfo.qualityGuardApplied) {
      metadataParts.push(outputGuardLabel);
    }
  }
  if (analysisGeneratedAt) {
    metadataParts.push(`${lastRunLabel}: ${formatTimestamp(analysisGeneratedAt)}`);
  }

  return (
    <article className={outputShellClass}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h4 className={isDarkTheme ? "text-base font-semibold text-slate-100" : "text-base font-semibold text-slate-900"}>{outputTitle}</h4>
          {analysisQuestion ? (
            <p className={isDarkTheme ? "text-xs text-slate-400" : "text-xs text-slate-600"}>
              {questionPrefixLabel} {analysisQuestion}
            </p>
          ) : null}
        </div>
        {(analysisResult || isPreparing || isStreaming) ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={
                isDarkTheme
                  ? "inline-flex items-center gap-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-500 disabled:opacity-50"
                  : "inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:border-slate-400 disabled:opacity-50"
              }
              onClick={onCopyAnalysis}
              disabled={!analysisResult || isPreparing || isStreaming}
            >
              <FileText className="h-4 w-4" /> {analysisCopied ? copiedLabel : copyLabel}
            </button>
          </div>
        ) : null}
      </div>

      {analysisScopeNotice ? (
        <p className={isDarkTheme ? "mt-3 text-xs text-cyan-200/90" : "mt-3 text-xs text-cyan-800"}>
          {aiUsesPrefix} {analysisScopeNotice.usedReports} {aiUsesMiddle} {analysisScopeNotice.totalReports} {aiUsesSuffix}
        </p>
      ) : null}

      {metadataParts.length > 0 ? (
        <p className={isDarkTheme ? "mt-2 text-xs text-slate-400" : "mt-2 text-xs text-slate-600"}>
          {metadataParts.join(" · ")}
        </p>
      ) : null}

      {analysisError ? (
        <div
          className={
            isDarkTheme
              ? "mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200"
              : "mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"
          }
        >
          {analysisError}
        </div>
      ) : null}

      {showLoadingCard ? (
        <div className={isDarkTheme ? "mt-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300" : "mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"}>
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
            {isPreparing ? preparingStatusLabel : loadingMessage}
          </span>
        </div>
      ) : null}

      {!showLoadingCard && !showLiveOutput && !analysisResult ? (
        <div className={isDarkTheme ? "mt-4 rounded-xl border border-dashed border-slate-700 bg-slate-900/45 p-4 text-sm text-slate-300" : "mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-700"}>
          <p className={isDarkTheme ? "text-sm text-slate-400" : "text-sm text-slate-500"}>{emptyBody}</p>
        </div>
      ) : null}

      {showLiveOutput ? (
        <div
          className={
            isDarkTheme
              ? "mt-4 rounded-xl border border-cyan-500/25 bg-slate-950/65 p-4 text-sm text-slate-100"
              : "mt-4 rounded-xl border border-cyan-300/60 bg-cyan-50/70 p-4 text-sm text-slate-800"
          }
        >
          <p className={isDarkTheme ? "mb-2 text-xs uppercase tracking-wide text-cyan-200" : "mb-2 text-xs uppercase tracking-wide text-cyan-700"}>
            {isPreparing ? preparingStatusLabel : streamingStatusLabel}
          </p>
          <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed">{analysisResult}</pre>
          <span className={isDarkTheme ? "mt-2 inline-flex items-center text-xs text-slate-400" : "mt-2 inline-flex items-center text-xs text-slate-600"}>
            <span className="mr-1 h-4 w-[2px] animate-pulse bg-current" /> {streamingHintLabel}
          </span>
        </div>
      ) : null}

      {analysisResult && !showLiveOutput ? (
        <div className={isDarkTheme ? "prose-premium-dark mt-4 overflow-x-auto" : "prose-premium-light mt-4 overflow-x-auto"}>
          <Suspense
            fallback={
              <div className={isDarkTheme ? "rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-300" : "rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"}>
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                  {loadingFormatLabel}
                </span>
              </div>
            }
          >
            <AnalysisMarkdownBlock content={analysisResultDisplay} isDarkTheme={isDarkTheme} />
          </Suspense>
        </div>
      ) : null}

      {analysisResult && relevantBenchmarks.length > 0 ? (
        <p className={isDarkTheme ? "mt-4 border-t border-slate-800 pt-3 text-[11px] text-slate-500" : "mt-4 border-t border-slate-200 pt-3 text-[11px] text-slate-600"}>
          {disclaimerLabel}{" "}
          {relevantBenchmarks.slice(0, 3).map((benchmark, index) => (
            <span key={`${benchmark.source.url}-${benchmark.marker}-${index}`}>
              <a
                href={benchmark.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className={isDarkTheme ? "underline decoration-slate-700 hover:text-slate-300" : "underline decoration-slate-300 hover:text-slate-800"}
              >
                {benchmark.source.authors} ({benchmark.source.year})
              </a>
              {index < Math.min(2, relevantBenchmarks.length - 1) ? ", " : "."}
            </span>
          ))}
        </p>
      ) : null}
    </article>
  );
};

export default AIOutputPanel;
