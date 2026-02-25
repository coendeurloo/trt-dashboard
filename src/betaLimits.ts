const BETA_STORAGE_KEY = "trt_beta_usage";

export const BETA_LIMITS = {
  maxAnalysesPerDay: 5,
  maxAnalysesPerMonth: 25
} as const;

const betaLimitsDisabled = (): boolean => {
  const raw = String(import.meta.env.VITE_DISABLE_BETA_LIMITS ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
};

interface BetaUsage {
  dailyCount: number;
  dailyResetDate: string;
  monthlyCount: number;
  monthlyResetMonth: string;
}

const getToday = (): string => new Date().toISOString().slice(0, 10);
const getCurrentMonth = (): string => new Date().toISOString().slice(0, 7);

const hasLocalStorage = (): boolean => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const createFreshUsage = (): BetaUsage => ({
  dailyCount: 0,
  dailyResetDate: getToday(),
  monthlyCount: 0,
  monthlyResetMonth: getCurrentMonth()
});

const loadUsage = (): BetaUsage => {
  if (!hasLocalStorage()) {
    return createFreshUsage();
  }

  try {
    const raw = window.localStorage.getItem(BETA_STORAGE_KEY);
    if (!raw) {
      return createFreshUsage();
    }
    return JSON.parse(raw) as BetaUsage;
  } catch {
    return createFreshUsage();
  }
};

const saveUsage = (usage: BetaUsage): void => {
  if (!hasLocalStorage()) {
    return;
  }
  window.localStorage.setItem(BETA_STORAGE_KEY, JSON.stringify(usage));
};

export const getUsage = (): BetaUsage => {
  const usage = loadUsage();
  const today = getToday();
  const currentMonth = getCurrentMonth();

  let changed = false;

  if (usage.dailyResetDate !== today) {
    usage.dailyCount = 0;
    usage.dailyResetDate = today;
    changed = true;
  }

  if (usage.monthlyResetMonth !== currentMonth) {
    usage.monthlyCount = 0;
    usage.monthlyResetMonth = currentMonth;
    changed = true;
  }

  if (changed) {
    saveUsage(usage);
  }

  return usage;
};

export const checkBetaLimit = (): { allowed: boolean; reason?: string } => {
  if (betaLimitsDisabled()) {
    return { allowed: true };
  }
  const usage = getUsage();

  if (usage.dailyCount >= BETA_LIMITS.maxAnalysesPerDay) {
    return {
      allowed: false,
      reason: `Daily limit reached (${BETA_LIMITS.maxAnalysesPerDay}/${BETA_LIMITS.maxAnalysesPerDay}). Resets tomorrow.`
    };
  }

  if (usage.monthlyCount >= BETA_LIMITS.maxAnalysesPerMonth) {
    return {
      allowed: false,
      reason: `Monthly limit reached (${BETA_LIMITS.maxAnalysesPerMonth}/${BETA_LIMITS.maxAnalysesPerMonth}). Resets next month.`
    };
  }

  return { allowed: true };
};

export const recordAnalysisUsage = (): void => {
  if (betaLimitsDisabled()) {
    return;
  }
  const usage = getUsage();
  usage.dailyCount += 1;
  usage.monthlyCount += 1;
  saveUsage(usage);
};

export const getRemainingAnalyses = (): { dailyRemaining: number; monthlyRemaining: number } => {
  const usage = getUsage();
  return {
    dailyRemaining: Math.max(0, BETA_LIMITS.maxAnalysesPerDay - usage.dailyCount),
    monthlyRemaining: Math.max(0, BETA_LIMITS.maxAnalysesPerMonth - usage.monthlyCount)
  };
};
