import { SuggestedAiQuestion } from "../../analysisSuggestions";

interface AISuggestedQuestionsProps {
  suggestions: SuggestedAiQuestion[];
  selectedQuestion: string;
  onSelectSuggestion: (question: string) => void;
  isDarkTheme: boolean;
}

const AISuggestedQuestions = ({
  suggestions,
  selectedQuestion,
  onSelectSuggestion,
  isDarkTheme
}: AISuggestedQuestionsProps) => {
  return (
    <div className="flex flex-wrap gap-2.5">
      {suggestions.map((suggestion) => {
        const isSelected = suggestion.question === selectedQuestion;
        const baseChipClass = "inline-flex min-h-[36px] items-center rounded-full px-3.5 py-1.5 text-sm leading-5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/35";
        const chipClassName = isSelected
          ? isDarkTheme
            ? `${baseChipClass} border border-cyan-400/55 bg-cyan-500/14 text-cyan-100`
            : `${baseChipClass} border border-cyan-400/70 bg-cyan-50 text-cyan-900`
          : isDarkTheme
            ? `${baseChipClass} border border-slate-700/90 bg-slate-900/65 text-slate-200 hover:border-cyan-500/30 hover:text-cyan-100`
            : `${baseChipClass} border border-slate-300/85 bg-white text-slate-700 hover:border-cyan-300 hover:text-cyan-900`;

        return (
          <button
            key={suggestion.id}
            type="button"
            onClick={() => onSelectSuggestion(suggestion.question)}
            className={chipClassName}
          >
            {suggestion.question}
          </button>
        );
      })}
    </div>
  );
};

export default AISuggestedQuestions;
