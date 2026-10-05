import { describe, expect, it } from "vitest";
import {
  DEFAULT_DICTATION_STATS,
  addDays,
  currentStreak,
  longestStreak,
  parseStoredDictationStats,
  recordDictation,
  summarizeDictationStats,
  toLocalDateKey,
  wordsPerMinute,
  type DailyDictation,
} from "./dictationStats";

const day = (count = 1, words = 10): DailyDictation => ({
  words,
  seconds: 5,
  count,
});

describe("date keys", () => {
  it("formats local dates with zero padding", () => {
    expect(toLocalDateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("adds days across month, year and leap-day boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("is not thrown off by daylight-saving changes", () => {
    // Spring-forward / fall-back dates in Europe and the US.
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
  });
});

describe("wordsPerMinute", () => {
  it("computes speed", () => {
    expect(wordsPerMinute(30, 15)).toBe(120);
  });

  it("ignores dictations shorter than 2 seconds or with no words", () => {
    expect(wordsPerMinute(5, 1.9)).toBeNull();
    expect(wordsPerMinute(0, 10)).toBeNull();
    expect(wordsPerMinute(4, 2)).toBe(120);
  });
});

describe("currentStreak", () => {
  const today = new Date(2026, 9, 5, 9, 0);

  it("counts back from today when today has a dictation", () => {
    const days = {
      "2026-10-05": day(),
      "2026-10-04": day(),
      "2026-10-03": day(),
      "2026-10-01": day(),
    };
    expect(currentStreak(days, today)).toBe(3);
  });

  it("counts from yesterday when nothing has been dictated yet today", () => {
    const days = { "2026-10-04": day(), "2026-10-03": day() };
    expect(currentStreak(days, today)).toBe(2);
  });

  it("is 0 when neither today nor yesterday has a dictation", () => {
    expect(currentStreak({ "2026-10-03": day() }, today)).toBe(0);
  });

  it("ignores days with zero dictations", () => {
    const days = { "2026-10-05": day(0), "2026-10-04": day() };
    expect(currentStreak(days, today)).toBe(1);
  });

  it("crosses month boundaries", () => {
    const days = {
      "2026-10-02": day(),
      "2026-10-01": day(),
      "2026-09-30": day(),
    };
    expect(currentStreak(days, new Date(2026, 9, 2))).toBe(3);
  });
});

describe("longestStreak", () => {
  it("finds the longest consecutive run regardless of key order", () => {
    const days = {
      "2026-09-03": day(),
      "2026-09-01": day(),
      "2026-09-02": day(),
      "2026-09-10": day(),
      "2026-09-11": day(),
    };
    expect(longestStreak(days)).toBe(3);
  });

  it("is 0 with no dictations", () => {
    expect(longestStreak({})).toBe(0);
    expect(longestStreak({ "2026-09-01": day(0) })).toBe(0);
  });
});

describe("recordDictation", () => {
  const at = new Date(2026, 9, 5, 14, 30);

  it("adds totals, a day record and speed", () => {
    const stats = recordDictation(DEFAULT_DICTATION_STATS, {
      words: 30,
      seconds: 18,
      speakingSeconds: 15,
      at,
    });
    expect(stats.totalWords).toBe(30);
    expect(stats.totalSeconds).toBe(18);
    expect(stats.totalDictations).toBe(1);
    expect(stats.days["2026-10-05"]).toEqual({
      words: 30,
      seconds: 18,
      count: 1,
    });
    expect(stats.lastWordsPerMinute).toBe(120);
    expect(stats.speedWords).toBe(30);
    expect(stats.speedSeconds).toBe(15);
  });

  it("accumulates into the same day", () => {
    let stats = recordDictation(DEFAULT_DICTATION_STATS, {
      words: 10,
      seconds: 6,
      speakingSeconds: 5,
      at,
    });
    stats = recordDictation(stats, {
      words: 20,
      seconds: 12,
      speakingSeconds: 10,
      at,
    });
    expect(stats.days["2026-10-05"]).toEqual({
      words: 30,
      seconds: 18,
      count: 2,
    });
  });

  it("leaves short dictations out of speed but keeps them in totals", () => {
    const base = recordDictation(DEFAULT_DICTATION_STATS, {
      words: 30,
      seconds: 16,
      speakingSeconds: 15,
      at,
    });
    const stats = recordDictation(base, {
      words: 3,
      seconds: 2.5,
      speakingSeconds: 1.5,
      at,
    });
    expect(stats.totalWords).toBe(33);
    expect(stats.speedWords).toBe(30);
    expect(stats.lastWordsPerMinute).toBe(120);
  });

  it("adds time but no dictation count for empty dictations", () => {
    const stats = recordDictation(DEFAULT_DICTATION_STATS, {
      words: 0,
      seconds: 1,
      speakingSeconds: 1,
      at,
    });
    expect(stats.totalSeconds).toBe(1);
    expect(stats.totalDictations).toBe(0);
    expect(stats.days["2026-10-05"].count).toBe(0);
    expect(currentStreak(stats.days, at)).toBe(0);
  });

  it("does not mutate the input", () => {
    const input = structuredClone(DEFAULT_DICTATION_STATS);
    recordDictation(input, { words: 5, seconds: 3, speakingSeconds: 3, at });
    expect(input).toEqual(DEFAULT_DICTATION_STATS);
  });
});

describe("parseStoredDictationStats", () => {
  it("migrates v1 totals when there is no v2 data", () => {
    const { stats, migrated } = parseStoredDictationStats(
      null,
      JSON.stringify({ totalWords: 1247, totalSeconds: 2520 }),
    );
    expect(migrated).toBe(true);
    expect(stats.totalWords).toBe(1247);
    expect(stats.totalSeconds).toBe(2520);
    expect(stats.days).toEqual({});
    expect(stats.version).toBe(2);
  });

  it("prefers v2 over v1", () => {
    const v2 = recordDictation(DEFAULT_DICTATION_STATS, {
      words: 10,
      seconds: 5,
      speakingSeconds: 5,
      at: new Date(2026, 9, 5),
    });
    const { stats, migrated } = parseStoredDictationStats(
      JSON.stringify(v2),
      JSON.stringify({ totalWords: 999, totalSeconds: 999 }),
    );
    expect(migrated).toBe(false);
    expect(stats).toEqual(v2);
  });

  it("sanitizes bad values and bad day keys", () => {
    const { stats } = parseStoredDictationStats(
      JSON.stringify({
        totalWords: -5,
        totalSeconds: "x",
        lastWordsPerMinute: "fast",
        days: {
          "2026-10-05": { words: 3, seconds: -1, count: 1.7 },
          "not-a-date": { words: 1, seconds: 1, count: 1 },
        },
      }),
      null,
    );
    expect(stats.totalWords).toBe(0);
    expect(stats.totalSeconds).toBe(0);
    expect(stats.lastWordsPerMinute).toBeNull();
    expect(stats.days).toEqual({
      "2026-10-05": { words: 3, seconds: 0, count: 1 },
    });
  });

  it("falls back to defaults on corrupt or missing data", () => {
    expect(parseStoredDictationStats("{oops", null).stats).toEqual(
      DEFAULT_DICTATION_STATS,
    );
    expect(parseStoredDictationStats(null, null).stats).toEqual(
      DEFAULT_DICTATION_STATS,
    );
  });
});

describe("summarizeDictationStats", () => {
  it("builds a 7-day strip ending today with day initials", () => {
    const stats = {
      ...DEFAULT_DICTATION_STATS,
      days: { "2026-10-05": day(1, 50), "2026-09-30": day(1, 20) },
    };
    // 2026-10-05 is a Monday.
    const { week } = summarizeDictationStats(stats, new Date(2026, 9, 5, 8));
    expect(week.map((d) => d.initial).join("")).toBe("TWTFSSM");
    expect(week.map((d) => d.words)).toEqual([0, 20, 0, 0, 0, 0, 50]);
    expect(week[6].isToday).toBe(true);
    expect(week[0].key).toBe("2026-09-29");
  });

  it("reports overall speed, or null before any measurable dictation", () => {
    expect(
      summarizeDictationStats(DEFAULT_DICTATION_STATS, new Date())
        .wordsPerMinute,
    ).toBeNull();
    const stats = { ...DEFAULT_DICTATION_STATS, speedWords: 300, speedSeconds: 120 };
    expect(summarizeDictationStats(stats, new Date()).wordsPerMinute).toBe(150);
  });
});
