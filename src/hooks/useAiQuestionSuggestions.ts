import { useMemo } from "react";
import { MarkerTrendSummary } from "../analytics";
import { getSuggestedAiQuestions, SuggestedAiQuestion } from "../analysisSuggestions";
import { AppLanguage, LabReport, UserProfile } from "../types";

interface UseAiQuestionSuggestionsOptions {
  reports: LabReport[];
  trendByMarker: Record<string, MarkerTrendSummary>;
  language: AppLanguage;
  userProfile: UserProfile;
  hasActiveProtocol: boolean;
}

export const useAiQuestionSuggestions = ({
  reports,
  trendByMarker,
  language,
  userProfile,
  hasActiveProtocol
}: UseAiQuestionSuggestionsOptions): SuggestedAiQuestion[] =>
  useMemo(
    () =>
      getSuggestedAiQuestions({
        reports,
        trendByMarker,
        language,
        userProfile,
        hasActiveProtocol
      }),
    [reports, trendByMarker, language, userProfile, hasActiveProtocol]
  );

export default useAiQuestionSuggestions;
