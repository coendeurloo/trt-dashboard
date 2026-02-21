import { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";

interface AnalysisMarkdownBlockProps {
  content: string;
  isDarkTheme: boolean;
}

const AnalysisMarkdownBlock = ({ content, isDarkTheme }: AnalysisMarkdownBlockProps) => {
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

  const getHeadingEmoji = (headingText: string): string => {
    const text = headingText.toLowerCase();
    if (text.includes("supplement")) {
      return "💊";
    }
    if (text.includes("alert") || text.includes("risk")) {
      return "🚨";
    }
    if (text.includes("protocol") || text.includes("dose")) {
      return "🧬";
    }
    if (text.includes("symptom")) {
      return "🤒";
    }
    if (text.includes("compare") || text.includes("comparison") || text.includes("vs")) {
      return "🆚";
    }
    if (text.includes("trend") || text.includes("pattern")) {
      return "📈";
    }
    if (text.includes("summary") || text.includes("conclusion")) {
      return "🧠";
    }
    if (text.includes("lab") || text.includes("blood") || text.includes("hormone")) {
      return "🩸";
    }
    return "📋";
  };

  const renderHeading = (level: "h1" | "h2" | "h3" | "h4", children: ReactNode) => {
    const text = extractText(children);
    const emoji = getHeadingEmoji(text);
    const wrapClass =
      level === "h1"
        ? "mt-5 border-b pb-2"
        : level === "h2"
          ? "mt-6 border-b pb-2"
          : level === "h3"
            ? "mt-4"
            : "mt-3";
    const borderClass = isDarkTheme ? "border-slate-700/70" : "border-slate-200";
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
        <HeadingTag className={textClass}>
          <span className="mr-2" aria-hidden="true">
            {emoji}
          </span>
          {children}
        </HeadingTag>
      </div>
    );
  };

  return (
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
      {content}
    </ReactMarkdown>
  );
};

export default AnalysisMarkdownBlock;
