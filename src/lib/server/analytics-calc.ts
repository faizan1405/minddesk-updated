// Pure calculation functions for MindDesk Productivity Analytics.
// Safe for server, client, and isolated automated testing.
import { addDays, dayDiff, habitStats, isScheduled, weekday, DAY_SHORT } from "@/lib/habits-shared";

export type AnalyticsRange = "7d" | "30d" | "90d";
export type TrendDirection = "up" | "down" | "neutral";

export type MetricComparison = {
  current: number;
  previous: number;
  diff: number;
  percentageChange: number;
  direction: TrendDirection;
};

export type DailyProductivityPoint = {
  date: string; // "YYYY-MM-DD"
  label: string; // e.g. "Oct 18"
  dayOfWeek: string; // "Sun", "Mon", etc.
  tasksCompleted: number;
  focusMinutes: number;
  habitsScheduled: number;
  habitsCompleted: number;
  habitRate: number | null;
};

export type WeeklyProductivityPoint = {
  weekKey: string;
  label: string;
  tasksCompleted: number;
  focusMinutes: number;
  focusHours: number;
  habitsScheduled: number;
  habitsCompleted: number;
  habitRate: number | null;
};

export type WeekdayConsistency = {
  dayIndex: number; // 0 = Sun, 1 = Mon ... 6 = Sat
  dayName: string;
  scheduled: number;
  completed: number;
  rate: number; // 0 - 100
};

export type HabitStreakSummary = {
  id: string;
  title: string;
  color: string;
  currentStreak: number;
  bestStreak: number;
  totalCompletions: number;
  completionRate: number | null;
};

export type ProductivityAnalyticsResult = {
  period: AnalyticsRange;
  dateRange: {
    start: string;
    end: string;
    prevStart: string;
    prevEnd: string;
    today: string;
    timeZone: string;
  };
  metrics: {
    tasksCompleted: MetricComparison;
    tasksRemaining: number;
    tasksOverdue: number;
    totalTasks: number;
    completionRatio: number; // 0-100% of tasks completed in period vs (completedInPeriod + remaining)
    focusTimeMinutes: MetricComparison;
    focusSessionsCount: MetricComparison;
    habitCompletionRate: {
      current: number | null;
      previous: number | null;
      diff: number | null;
      percentageChange: number | null;
      direction: TrendDirection;
      scheduledDays: number;
      completedDays: number;
    };
    habitStreaks: {
      maxCurrentStreak: number;
      activeHabitsCount: number;
      habitsWithActiveStreak: number;
      streakList: HabitStreakSummary[];
    };
  };
  charts: {
    dailyTimeline: DailyProductivityPoint[];
    weeklySummary: WeeklyProductivityPoint[];
    weekdayConsistency: WeekdayConsistency[];
    taskStatusDistribution: {
      completed: number;
      remaining: number;
      overdue: number;
    };
  };
};

export type RawTask = {
  id: string;
  completed: boolean;
  completedAt: Date | string | null;
  dueDate: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type RawFocusSession = {
  id: string;
  date: Date | string;
  plannedMinutes: number;
  focusedSeconds: number;
  completed: boolean;
  startedAt: Date | string;
  endedAt: Date | string;
};

export type RawHabit = {
  id: string;
  title: string;
  color: string;
  repeatDays: number;
  startDate: string;
  completions: string[];
};

export type AnalyticsCalculationInput = {
  tasks: RawTask[];
  focusSessions: RawFocusSession[];
  habits: RawHabit[];
  range: AnalyticsRange;
  timeZone: string;
  now?: Date;
};

/** Validate timezone string safely, defaulting to Asia/Kolkata */
export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz || typeof tz !== "string") return "Asia/Kolkata";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "Asia/Kolkata";
  }
}

/** Formats date into local "YYYY-MM-DD" key in specified timezone */
export function getLocalDateKey(date: Date | string | null | undefined, tz: string): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatDateLabel(dateKey: string): string {
  const parts = dateKey.split("-");
  if (parts.length < 3) return dateKey;
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  return `${MONTH_NAMES[monthIdx] || ""} ${day}`.trim();
}

export function compareMetric(current: number, previous: number): MetricComparison {
  const diff = current - previous;
  let percentageChange = 0;
  let direction: TrendDirection = "neutral";

  if (previous > 0) {
    percentageChange = Math.round((Math.abs(diff) / previous) * 100);
    direction = diff > 0 ? "up" : diff < 0 ? "down" : "neutral";
  } else if (current > 0) {
    percentageChange = 100;
    direction = "up";
  }

  return {
    current,
    previous,
    diff,
    percentageChange,
    direction,
  };
}

/**
 * Calculates complete productivity analytics for an authenticated user's real data.
 */
export function calculateProductivityAnalytics(
  input: AnalyticsCalculationInput,
): ProductivityAnalyticsResult {
  const tz = safeTimeZone(input.timeZone);
  const now = input.now ?? new Date();
  const todayKey = getLocalDateKey(now, tz) ?? "2026-10-18";

  const numDays = input.range === "7d" ? 7 : input.range === "90d" ? 90 : 30;

  // Calculate current period [startDate, endDate] and previous period [prevStartDate, prevEndDate]
  const startDate = addDays(todayKey, -(numDays - 1));
  const endDate = todayKey;
  const prevStartDate = addDays(todayKey, -(numDays * 2 - 1));
  const prevEndDate = addDays(todayKey, -numDays);

  // 1. Task metrics
  let completedInPeriod = 0;
  let completedInPrevPeriod = 0;
  let remainingCount = 0;
  let overdueCount = 0;

  const dailyTaskCompletions = new Map<string, number>();

  for (const t of input.tasks) {
    if (t.completed) {
      const compDate = t.completedAt
        ? getLocalDateKey(t.completedAt, tz)
        : getLocalDateKey(t.updatedAt, tz);
      if (compDate) {
        if (compDate >= startDate && compDate <= endDate) {
          completedInPeriod++;
          dailyTaskCompletions.set(compDate, (dailyTaskCompletions.get(compDate) ?? 0) + 1);
        } else if (compDate >= prevStartDate && compDate <= prevEndDate) {
          completedInPrevPeriod++;
        }
      }
    } else {
      remainingCount++;
      // Check overdue: due date in UTC date representation < todayKey in local timezone
      const dueDateKey = t.dueDate ? getLocalDateKey(t.dueDate, "UTC") : null;
      if (dueDateKey && dueDateKey < todayKey) {
        overdueCount++;
      }
    }
  }

  const tasksCompletedComp = compareMetric(completedInPeriod, completedInPrevPeriod);
  const totalTasks = input.tasks.length;
  const activeAndCompleted = completedInPeriod + remainingCount;
  const completionRatio =
    activeAndCompleted > 0 ? Math.round((completedInPeriod / activeAndCompleted) * 100) : 0;

  // 2. Focus Session metrics
  let focusSecondsCurrent = 0;
  let focusSecondsPrev = 0;
  let focusSessionsCurrent = 0;
  let focusSessionsPrev = 0;

  const dailyFocusSeconds = new Map<string, number>();

  for (const f of input.focusSessions) {
    const sessionDate = getLocalDateKey(f.startedAt, tz);
    if (!sessionDate) continue;

    if (sessionDate >= startDate && sessionDate <= endDate) {
      focusSecondsCurrent += f.focusedSeconds;
      focusSessionsCurrent++;
      dailyFocusSeconds.set(
        sessionDate,
        (dailyFocusSeconds.get(sessionDate) ?? 0) + f.focusedSeconds,
      );
    } else if (sessionDate >= prevStartDate && sessionDate <= prevEndDate) {
      focusSecondsPrev += f.focusedSeconds;
      focusSessionsPrev++;
    }
  }

  const focusMinutesCurrent = Math.round(focusSecondsCurrent / 60);
  const focusMinutesPrev = Math.round(focusSecondsPrev / 60);

  const focusTimeComp = compareMetric(focusMinutesCurrent, focusMinutesPrev);
  const focusSessionsComp = compareMetric(focusSessionsCurrent, focusSessionsPrev);

  // 3. Habit metrics
  // Scheduled vs completed in current and previous periods
  let habitsScheduledCurrent = 0;
  let habitsCompletedCurrent = 0;
  let habitsScheduledPrev = 0;
  let habitsCompletedPrev = 0;

  const dailyHabitStats = new Map<string, { scheduled: number; completed: number }>();
  // Pre-fill daily map
  for (let i = 0; i < numDays; i++) {
    const d = addDays(startDate, i);
    dailyHabitStats.set(d, { scheduled: 0, completed: 0 });
  }

  // Weekday consistency: Mon (1) to Sun (0)
  const weekdayTotals: Record<number, { scheduled: number; completed: number }> = {
    1: { scheduled: 0, completed: 0 },
    2: { scheduled: 0, completed: 0 },
    3: { scheduled: 0, completed: 0 },
    4: { scheduled: 0, completed: 0 },
    5: { scheduled: 0, completed: 0 },
    6: { scheduled: 0, completed: 0 },
    0: { scheduled: 0, completed: 0 },
  };

  for (const h of input.habits) {
    const habitObj = {
      repeat_days: h.repeatDays,
      start_date: h.startDate,
      completions: h.completions,
    };

    // Current period
    for (let i = 0; i < numDays; i++) {
      const d = addDays(startDate, i);
      if (isScheduled(habitObj, d)) {
        habitsScheduledCurrent++;
        const isDone = h.completions.includes(d);
        if (isDone) habitsCompletedCurrent++;

        const st = dailyHabitStats.get(d)!;
        st.scheduled++;
        if (isDone) st.completed++;

        const wd = weekday(d);
        if (weekdayTotals[wd]) {
          weekdayTotals[wd]!.scheduled++;
          if (isDone) weekdayTotals[wd]!.completed++;
        }
      }
    }

    // Previous period
    for (let i = 0; i < numDays; i++) {
      const d = addDays(prevStartDate, i);
      if (isScheduled(habitObj, d)) {
        habitsScheduledPrev++;
        if (h.completions.includes(d)) habitsCompletedPrev++;
      }
    }
  }

  const habitRateCurrent =
    habitsScheduledCurrent > 0
      ? Math.round((habitsCompletedCurrent / habitsScheduledCurrent) * 100)
      : null;
  const habitRatePrev =
    habitsScheduledPrev > 0 ? Math.round((habitsCompletedPrev / habitsScheduledPrev) * 100) : null;

  let habitRateDiff: number | null = null;
  let habitRatePctChange: number | null = null;
  let habitRateDir: TrendDirection = "neutral";

  if (habitRateCurrent !== null && habitRatePrev !== null) {
    habitRateDiff = habitRateCurrent - habitRatePrev;
    habitRateDir = habitRateDiff > 0 ? "up" : habitRateDiff < 0 ? "down" : "neutral";
    if (habitRatePrev > 0) {
      habitRatePctChange = Math.round((Math.abs(habitRateDiff) / habitRatePrev) * 100);
    } else if (habitRateCurrent > 0) {
      habitRatePctChange = 100;
    } else {
      habitRatePctChange = 0;
    }
  } else if (habitRateCurrent !== null) {
    habitRateDir = habitRateCurrent > 0 ? "up" : "neutral";
  }

  // Habit Streaks
  const streakList: HabitStreakSummary[] = input.habits.map((h) => {
    const stats = habitStats(
      {
        repeat_days: h.repeatDays,
        start_date: h.startDate,
        completions: h.completions,
      },
      todayKey,
    );
    return {
      id: h.id,
      title: h.title,
      color: h.color,
      currentStreak: stats.current,
      bestStreak: stats.best,
      totalCompletions: h.completions.length,
      completionRate: stats.percent,
    };
  });

  streakList.sort((a, b) => b.currentStreak - a.currentStreak || b.bestStreak - a.bestStreak);

  const maxCurrentStreak = streakList.reduce((max, s) => Math.max(max, s.currentStreak), 0);
  const habitsWithActiveStreak = streakList.filter((s) => s.currentStreak > 0).length;

  // 4. Daily Timeline Generation
  const dailyTimeline: DailyProductivityPoint[] = [];

  for (let i = 0; i < numDays; i++) {
    const d = addDays(startDate, i);
    const dayWk = weekday(d);
    const tasksDone = dailyTaskCompletions.get(d) ?? 0;
    const focusSecs = dailyFocusSeconds.get(d) ?? 0;
    const habitSt = dailyHabitStats.get(d) ?? { scheduled: 0, completed: 0 };
    const hRate =
      habitSt.scheduled > 0 ? Math.round((habitSt.completed / habitSt.scheduled) * 100) : null;

    dailyTimeline.push({
      date: d,
      label: formatDateLabel(d),
      dayOfWeek: DAY_SHORT[dayWk] ?? "Day",
      tasksCompleted: tasksDone,
      focusMinutes: Math.round(focusSecs / 60),
      habitsScheduled: habitSt.scheduled,
      habitsCompleted: habitSt.completed,
      habitRate: hRate,
    });
  }

  // 5. Weekly Summary Rollup
  const weeklySummary: WeeklyProductivityPoint[] = [];
  const chunkSize = 7;
  for (let i = 0; i < dailyTimeline.length; i += chunkSize) {
    const chunk = dailyTimeline.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;

    const first = chunk[0]!;
    const last = chunk[chunk.length - 1]!;
    const label = `${first.label} – ${last.label}`;
    const weekKey = `${first.date}_${last.date}`;

    let wTasks = 0;
    let wFocusMin = 0;
    let wHabitsSched = 0;
    let wHabitsDone = 0;

    for (const pt of chunk) {
      wTasks += pt.tasksCompleted;
      wFocusMin += pt.focusMinutes;
      wHabitsSched += pt.habitsScheduled;
      wHabitsDone += pt.habitsCompleted;
    }

    const wHabitRate = wHabitsSched > 0 ? Math.round((wHabitsDone / wHabitsSched) * 100) : null;

    weeklySummary.push({
      weekKey,
      label,
      tasksCompleted: wTasks,
      focusMinutes: wFocusMin,
      focusHours: Number((wFocusMin / 60).toFixed(1)),
      habitsScheduled: wHabitsSched,
      habitsCompleted: wHabitsDone,
      habitRate: wHabitRate,
    });
  }

  // 6. Weekday Consistency (ordered Mon through Sun)
  const orderedWeekdays = [1, 2, 3, 4, 5, 6, 0];
  const weekdayConsistency: WeekdayConsistency[] = orderedWeekdays.map((idx) => {
    const tot = weekdayTotals[idx] ?? { scheduled: 0, completed: 0 };
    const rate = tot.scheduled > 0 ? Math.round((tot.completed / tot.scheduled) * 100) : 0;
    return {
      dayIndex: idx,
      dayName: DAY_SHORT[idx] ?? "Day",
      scheduled: tot.scheduled,
      completed: tot.completed,
      rate,
    };
  });

  return {
    period: input.range,
    dateRange: {
      start: startDate,
      end: endDate,
      prevStart: prevStartDate,
      prevEnd: prevEndDate,
      today: todayKey,
      timeZone: tz,
    },
    metrics: {
      tasksCompleted: tasksCompletedComp,
      tasksRemaining: remainingCount,
      tasksOverdue: overdueCount,
      totalTasks,
      completionRatio,
      focusTimeMinutes: focusTimeComp,
      focusSessionsCount: focusSessionsComp,
      habitCompletionRate: {
        current: habitRateCurrent,
        previous: habitRatePrev,
        diff: habitRateDiff,
        percentageChange: habitRatePctChange,
        direction: habitRateDir,
        scheduledDays: habitsScheduledCurrent,
        completedDays: habitsCompletedCurrent,
      },
      habitStreaks: {
        maxCurrentStreak,
        activeHabitsCount: input.habits.length,
        habitsWithActiveStreak,
        streakList,
      },
    },
    charts: {
      dailyTimeline,
      weeklySummary,
      weekdayConsistency,
      taskStatusDistribution: {
        completed: completedInPeriod,
        remaining: Math.max(0, remainingCount - overdueCount),
        overdue: overdueCount,
      },
    },
  };
}
