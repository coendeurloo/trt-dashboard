import { AppLanguage, TabKey, UserProfile } from "./types";
import { trLocale } from "./i18n";

type Localized = {
  nl: string;
  en: string;
};

const TAB_VISIBILITY_BY_PROFILE: Record<UserProfile, Set<TabKey>> = {
  trt: new Set(["dashboard", "checkIns", "reports", "alerts", "protocol", "supplements", "protocolImpact", "doseResponse", "analysis", "settings"]),
  enhanced: new Set(["dashboard", "checkIns", "reports", "alerts", "protocol", "supplements", "protocolImpact", "doseResponse", "analysis", "settings"]),
  health: new Set(["dashboard", "checkIns", "reports", "alerts", "protocol", "supplements", "protocolImpact", "analysis", "settings"]),
  biohacker: new Set(["dashboard", "checkIns", "reports", "alerts", "protocol", "supplements", "protocolImpact", "analysis", "settings"])
};

const TAB_LABEL_OVERRIDES: Record<UserProfile, Partial<Record<TabKey, Localized>>> = {
  trt: {},
  enhanced: {},
  health: {
    protocol: { nl: "Interventies", en: "Interventions" },
    protocolImpact: { nl: "Interventie-impact", en: "Intervention Impact" }
  },
  biohacker: {
    protocol: { nl: "Stack", en: "Stack" },
    protocolImpact: { nl: "Stack-impact", en: "Stack Impact" }
  }
};

const SIDEBAR_CURRENT_LABEL: Record<UserProfile, Localized> = {
  trt: { nl: "Huidig protocol", en: "Current protocol" },
  enhanced: { nl: "Huidig protocol", en: "Current protocol" },
  health: { nl: "Huidige interventie", en: "Current intervention" },
  biohacker: { nl: "Huidige stack", en: "Current stack" }
};

const NAV_SECTION_LABEL: Record<UserProfile, Localized> = {
  trt: { nl: "Protocol", en: "Protocol" },
  enhanced: { nl: "Protocol", en: "Protocol" },
  health: { nl: "Interventies", en: "Interventions" },
  biohacker: { nl: "Stack", en: "Stack" }
};

const STABILITY_SHORT_LABEL: Record<UserProfile, Localized> = {
  trt: { nl: "Hormonale stabiliteit", en: "Hormone stability" },
  enhanced: { nl: "Hormonale stabiliteit", en: "Hormone stability" },
  health: { nl: "Markerstabiliteit", en: "Marker stability" },
  biohacker: { nl: "Markerstabiliteit", en: "Marker stability" }
};

const pick = (language: AppLanguage, text: Localized): string => trLocale(language, text.nl, text.en);

export const isTabVisibleForProfile = (profile: UserProfile, key: TabKey): boolean =>
  TAB_VISIBILITY_BY_PROFILE[profile].has(key);

export const getPersonaTabLabel = (
  profile: UserProfile,
  key: TabKey,
  language: AppLanguage,
  fallback: string
): string => {
  const override = TAB_LABEL_OVERRIDES[profile][key];
  return override ? pick(language, override) : fallback;
};

export const getPersonaSidebarCurrentLabel = (profile: UserProfile, language: AppLanguage): string =>
  pick(language, SIDEBAR_CURRENT_LABEL[profile]);

export const getPersonaNavSectionLabel = (profile: UserProfile, language: AppLanguage): string =>
  pick(language, NAV_SECTION_LABEL[profile]);

export const getPersonaStabilityShortLabel = (profile: UserProfile, language: AppLanguage): string =>
  pick(language, STABILITY_SHORT_LABEL[profile]);
