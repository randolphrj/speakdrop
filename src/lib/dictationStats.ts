/** Per local calendar day (key "YYYY-MM-DD"). */
export type DailyDictation = {
  words: number;
  seconds: number;
  count: number;
};

export type DictationStats = {
  version: 2;
  totalWords: number;
  totalSeconds: number;
  totalDictations: number;
  /** Words and speaking seconds from dictations long enough to measure speed. */
  speedWords: number;
  speedSeconds: number;
  lastWordsPerMinute: number | null;
  days: Record<string, DailyDictation>;
};

export const DEFAULT_DICTATION_STATS: DictationStats = {
  version: 2,
  totalWords: 0,
  totalSeconds: 0,
  totalDictations: 0,
  speedWords: 0,
  speedSeconds: 0,
  lastWordsPerMinute: null,
  days: {},
};

export const DICTATION_STATS_V1_STORAGE_KEY = "gladiaflow.dictation.stats.v1";
export const DICTATION_STATS_STORAGE_KEY = "gladiaflow.dictation.stats.v2";

/** Dictations shorter than this are left out of speed numbers. */
export const MIN_SECONDS_FOR_SPEED = 2;

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

const nonNegative = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;

export const toLocalDateKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const fromLocalDateKey = (key: string): Date => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** Shift a date key by whole calendar days (DST-safe: uses local midnight). */
export const addDays = (key: string, days: number): string => {
  const date = fromLocalDateKey(key);
  return toLocalDateKey(
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + days),
  );
};

export const wordsPerMinute = (
  words: number,
  seconds: number,
): number | null =>
  seconds >= MIN_SECONDS_FOR_SPEED && words > 0
    ? (words / seconds) * 60
    : null;

const hasDictation = (days: Record<string, DailyDictation>, key: string) =>
  (days[key]?.count ?? 0) > 0;

/**
 * Consecutive days with a dictation, counting back from today — or from
 * yesterday if there's none yet today, so the streak survives the morning.
 */
export const currentStreak = (
  days: Record<string, DailyDictation>,
  today: Date,
): number => {
  const todayKey = toLocalDateKey(today);
  let key = hasDictation(days, todayKey) ? todayKey : addDays(todayKey, -1);
  let streak = 0;
  while (hasDictation(days, key)) {
    streak++;
    key = addDays(key, -1);
  }
  return streak;
};

export const longestStreak = (days: Record<string, DailyDictation>): number => {
  const keys = Object.keys(days)
    .filter((key) => hasDictation(days, key))
    .sort();
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const key of keys) {
    run = previous !== null && addDays(previous, 1) === key ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = key;
  }
  return longest;
};

export type DictationInput = {
  words: number;
  /** Wall time from start to finished transcript (feeds total time). */
  seconds: number;
  /** Time actually spent speaking, start to stop (feeds speed). */
  speakingSeconds: number;
  at: Date;
};

/**
 * Add one finished dictation. Empty dictations (0 words) still add time,
 * as before, but don't count as a dictation for the day or the streak.
 */
export const recordDictation = (
  stats: DictationStats,
  { words, seconds, speakingSeconds, at }: DictationInput,
): DictationStats => {
  const safeWords = nonNegative(words);
  const safeSeconds = nonNegative(seconds);
  const key = toLocalDateKey(at);
  const day = stats.days[key] ?? { words: 0, seconds: 0, count: 0 };
  const counted = safeWords > 0;
  const wpm = wordsPerMinute(safeWords, nonNegative(speakingSeconds));
  return {
    ...stats,
    totalWords: stats.totalWords + safeWords,
    totalSeconds: stats.totalSeconds + safeSeconds,
    totalDictations: stats.totalDictations + (counted ? 1 : 0),
    speedWords: stats.speedWords + (wpm !== null ? safeWords : 0),
    speedSeconds:
      stats.speedSeconds + (wpm !== null ? nonNegative(speakingSeconds) : 0),
    lastWordsPerMinute: wpm ?? stats.lastWordsPerMinute,
    days: {
      ...stats.days,
      [key]: {
        words: day.words + safeWords,
        seconds: day.seconds + safeSeconds,
        count: day.count + (counted ? 1 : 0),
      },
    },
  };
};

const parseDays = (raw: unknown): Record<string, DailyDictation> => {
  if (!raw || typeof raw !== "object") return {};
  const days: Record<string, DailyDictation> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !value || typeof value !== "object")
      continue;
    const v = value as Record<string, unknown>;
    days[key] = {
      words: nonNegative(v.words),
      seconds: nonNegative(v.seconds),
      count: Math.floor(nonNegative(v.count)),
    };
  }
  return days;
};

/**
 * Build stats from stored JSON. Prefers v2; otherwise migrates v1 totals
 * (v1 had no per-day or speed data, so those start empty).
 */
export const parseStoredDictationStats = (
  v2Json: string | null,
  v1Json: string | null,
): { stats: DictationStats; migrated: boolean } => {
  const parse = (json: string | null): Record<string, unknown> | null => {
    if (!json) return null;
    try {
      const value = JSON.parse(json);
      return value && typeof value === "object" ? value : null;
    } catch {
      return null;
    }
  };

  const v2 = parse(v2Json);
  if (v2) {
    const lastWpm = v2.lastWordsPerMinute;
    return {
      migrated: false,
      stats: {
        version: 2,
        totalWords: nonNegative(v2.totalWords),
        totalSeconds: nonNegative(v2.totalSeconds),
        totalDictations: Math.floor(nonNegative(v2.totalDictations)),
        speedWords: nonNegative(v2.speedWords),
        speedSeconds: nonNegative(v2.speedSeconds),
        lastWordsPerMinute:
          typeof lastWpm === "number" && Number.isFinite(lastWpm)
            ? lastWpm
            : null,
        days: parseDays(v2.days),
      },
    };
  }

  const v1 = parse(v1Json);
  if (v1) {
    return {
      migrated: true,
      stats: {
        ...DEFAULT_DICTATION_STATS,
        totalWords: nonNegative(v1.totalWords),
        totalSeconds: nonNegative(v1.totalSeconds),
      },
    };
  }

  return { migrated: false, stats: DEFAULT_DICTATION_STATS };
};

export type WeekDay = {
  key: string;
  initial: string;
  words: number;
  isToday: boolean;
};

export type DictationSummary = {
  totalWords: number;
  totalSeconds: number;
  currentStreak: number;
  longestStreak: number;
  wordsPerMinute: number | null;
  lastWordsPerMinute: number | null;
  /** Oldest first, ending with today. */
  week: WeekDay[];
};

export const summarizeDictationStats = (
  stats: DictationStats,
  today: Date,
): DictationSummary => {
  const todayKey = toLocalDateKey(today);
  const week = Array.from({ length: 7 }, (_, i) => {
    const key = addDays(todayKey, i - 6);
    return {
      key,
      initial: DAY_INITIALS[fromLocalDateKey(key).getDay()],
      words: stats.days[key]?.words ?? 0,
      isToday: key === todayKey,
    };
  });
  return {
    totalWords: stats.totalWords,
    totalSeconds: stats.totalSeconds,
    currentStreak: currentStreak(stats.days, today),
    longestStreak: longestStreak(stats.days),
    wordsPerMinute:
      stats.speedSeconds > 0
        ? (stats.speedWords / stats.speedSeconds) * 60
        : null,
    lastWordsPerMinute: stats.lastWordsPerMinute,
    week,
  };
};

export const getDictationComment = (totalSeconds: number): string => {
  const totalMinutes = totalSeconds / 60;
  if (totalMinutes < 5) return "Warming up the vocal cords. Keep going.";
  if (totalMinutes < 30) return "Nice pace. Your keyboard is getting jealous.";
  if (totalMinutes < 120) return "You definitely really like to talk.";
  if (totalMinutes < 300)
    return "At this point your voice has a gym membership.";
  return "Legendary mic endurance unlocked.";
};
