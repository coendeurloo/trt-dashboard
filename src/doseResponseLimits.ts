const DOSE_RESPONSE_LIMIT_STORAGE_KEY = "labtracker_dose_response_assisted_usage_v1";

export const DOSE_RESPONSE_ASSISTED_LIMITS = {
  maxRunsPerDay: 10,
  maxRunsPerMonth: 60
} as const;

interface DoseResponseAssistedUsage {
  dailyCount: number;
  dailyResetDate: string;
  monthlyCount: number;
  monthlyResetMonth: string;
}

const getToday = (): string => new Date().toISOString().slice(0, 10);
const getCurrentMonth = (): string => new Date().toISOString().slice(0, 7);

const hasLocalStorage = (): boolean => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const createFreshUsage = (): DoseResponseAssistedUsage => ({
  dailyCount: 0,
  dailyResetDate: getToday(),
  monthlyCount: 0,
  monthlyResetMonth: getCurrentMonth()
});

const loadUsage = (): DoseResponseAssistedUsage => {
  if (!hasLocalStorage()) {
    return createFreshUsage();
  }

  try {
    const raw = window.localStorage.getItem(DOSE_RESPONSE_LIMIT_STORAGE_KEY);
    if (!raw) {
      return createFreshUsage();
    }
    return JSON.parse(raw) as DoseResponseAssistedUsage;
  } catch {
    return createFreshUsage();
  }
};

const saveUsage = (usage: DoseResponseAssistedUsage): void => {
  if (!hasLocalStorage()) {
    return;
  }
  window.localStorage.setItem(DOSE_RESPONSE_LIMIT_STORAGE_KEY, JSON.stringify(usage));
};

export const getDoseResponseAssistedUsage = (): DoseResponseAssistedUsage => {
  const usage = loadUsage();
  const today = getToday();
  const month = getCurrentMonth();
  let changed = false;

  if (usage.dailyResetDate !== today) {
    usage.dailyCount = 0;
    usage.dailyResetDate = today;
    changed = true;
  }
  if (usage.monthlyResetMonth !== month) {
    usage.monthlyCount = 0;
    usage.monthlyResetMonth = month;
    changed = true;
  }

  if (changed) {
    saveUsage(usage);
  }
  return usage;
};

export const checkDoseResponseAssistedLimit = (): { allowed: boolean; reason?: string } => {
  const usage = getDoseResponseAssistedUsage();
  if (usage.dailyCount >= DOSE_RESPONSE_ASSISTED_LIMITS.maxRunsPerDay) {
    return {
      allowed: false,
      reason: `Daily assisted model limit reached (${DOSE_RESPONSE_ASSISTED_LIMITS.maxRunsPerDay}/${DOSE_RESPONSE_ASSISTED_LIMITS.maxRunsPerDay}). Resets tomorrow.`
    };
  }
  if (usage.monthlyCount >= DOSE_RESPONSE_ASSISTED_LIMITS.maxRunsPerMonth) {
    return {
      allowed: false,
      reason: `Monthly assisted model limit reached (${DOSE_RESPONSE_ASSISTED_LIMITS.maxRunsPerMonth}/${DOSE_RESPONSE_ASSISTED_LIMITS.maxRunsPerMonth}). Resets next month.`
    };
  }
  return { allowed: true };
};

export const recordDoseResponseAssistedUsage = (): void => {
  const usage = getDoseResponseAssistedUsage();
  usage.dailyCount += 1;
  usage.monthlyCount += 1;
  saveUsage(usage);
};

export const getRemainingDoseResponseAssistedRuns = (): { dailyRemaining: number; monthlyRemaining: number } => {
  const usage = getDoseResponseAssistedUsage();
  return {
    dailyRemaining: Math.max(0, DOSE_RESPONSE_ASSISTED_LIMITS.maxRunsPerDay - usage.dailyCount),
    monthlyRemaining: Math.max(0, DOSE_RESPONSE_ASSISTED_LIMITS.maxRunsPerMonth - usage.monthlyCount)
  };
};
