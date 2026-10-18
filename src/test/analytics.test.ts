import { describe, expect, it } from "vitest";
import {
  calculateProductivityAnalytics,
  compareMetric,
  formatDateLabel,
  safeTimeZone,
  getLocalDateKey,
} from "@/lib/server/analytics-calc";

describe("Productivity Analytics Calculations", () => {
  const FIXED_NOW = new Date("2026-10-18T10:00:00Z"); // Oct 18, 2026

  describe("Timezone & Date Helpers", () => {
    it("safely handles valid and invalid timezones", () => {
      expect(safeTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
      expect(safeTimeZone("America/New_York")).toBe("America/New_York");
      expect(safeTimeZone("Invalid/Timezone")).toBe("Asia/Kolkata");
      expect(safeTimeZone(null)).toBe("Asia/Kolkata");
    });

    it("extracts correct local date keys based on timezone offset", () => {
      // 2026-10-17 21:00:00 UTC is 2026-10-18 02:30:00 in Asia/Kolkata (+5:30)
      const instant = new Date("2026-10-17T21:00:00Z");
      expect(getLocalDateKey(instant, "Asia/Kolkata")).toBe("2026-10-18");
      expect(getLocalDateKey(instant, "America/New_York")).toBe("2026-10-17");
      expect(getLocalDateKey(instant, "UTC")).toBe("2026-10-17");
    });

    it("formats human-readable date labels", () => {
      expect(formatDateLabel("2026-10-18")).toBe("Oct 18");
      expect(formatDateLabel("2026-01-05")).toBe("Jan 5");
    });

    it("calculates metric comparisons and directions correctly", () => {
      const up = compareMetric(15, 10);
      expect(up.current).toBe(15);
      expect(up.previous).toBe(10);
      expect(up.diff).toBe(5);
      expect(up.percentageChange).toBe(50);
      expect(up.direction).toBe("up");

      const down = compareMetric(6, 12);
      expect(down.diff).toBe(-6);
      expect(down.percentageChange).toBe(50);
      expect(down.direction).toBe("down");

      const zeroPrev = compareMetric(5, 0);
      expect(zeroPrev.percentageChange).toBe(100);
      expect(zeroPrev.direction).toBe("up");

      const bothZero = compareMetric(0, 0);
      expect(bothZero.percentageChange).toBe(0);
      expect(bothZero.direction).toBe("neutral");
    });
  });

  describe("Empty dataset handling", () => {
    it("handles zero records cleanly without errors or NaN values", () => {
      const result = calculateProductivityAnalytics({
        tasks: [],
        focusSessions: [],
        habits: [],
        range: "7d",
        timeZone: "Asia/Kolkata",
        now: FIXED_NOW,
      });

      expect(result.period).toBe("7d");
      expect(result.dateRange.today).toBe("2026-10-18");
      expect(result.dateRange.start).toBe("2026-10-12");
      expect(result.dateRange.end).toBe("2026-10-18");
      expect(result.dateRange.prevStart).toBe("2026-10-05");
      expect(result.dateRange.prevEnd).toBe("2026-10-11");

      // Metrics should all be clean zero / null
      expect(result.metrics.tasksCompleted.current).toBe(0);
      expect(result.metrics.tasksCompleted.previous).toBe(0);
      expect(result.metrics.tasksCompleted.percentageChange).toBe(0);
      expect(result.metrics.tasksCompleted.direction).toBe("neutral");

      expect(result.metrics.tasksRemaining).toBe(0);
      expect(result.metrics.tasksOverdue).toBe(0);
      expect(result.metrics.totalTasks).toBe(0);
      expect(result.metrics.completionRatio).toBe(0);

      expect(result.metrics.focusTimeMinutes.current).toBe(0);
      expect(result.metrics.focusSessionsCount.current).toBe(0);

      expect(result.metrics.habitCompletionRate.current).toBeNull();
      expect(result.metrics.habitCompletionRate.previous).toBeNull();
      expect(result.metrics.habitCompletionRate.scheduledDays).toBe(0);
      expect(result.metrics.habitCompletionRate.completedDays).toBe(0);

      expect(result.metrics.habitStreaks.maxCurrentStreak).toBe(0);
      expect(result.metrics.habitStreaks.streakList).toEqual([]);

      // Charts
      expect(result.charts.dailyTimeline).toHaveLength(7);
      for (const pt of result.charts.dailyTimeline) {
        expect(pt.tasksCompleted).toBe(0);
        expect(pt.focusMinutes).toBe(0);
        expect(pt.habitsScheduled).toBe(0);
        expect(pt.habitsCompleted).toBe(0);
        expect(pt.habitRate).toBeNull();
      }

      expect(result.charts.weekdayConsistency).toHaveLength(7);
      for (const wd of result.charts.weekdayConsistency) {
        expect(wd.scheduled).toBe(0);
        expect(wd.completed).toBe(0);
        expect(wd.rate).toBe(0);
      }
    });

    it("supports 30d and 90d ranges with accurate day counts", () => {
      const res30 = calculateProductivityAnalytics({
        tasks: [],
        focusSessions: [],
        habits: [],
        range: "30d",
        timeZone: "Asia/Kolkata",
        now: FIXED_NOW,
      });
      expect(res30.charts.dailyTimeline).toHaveLength(30);

      const res90 = calculateProductivityAnalytics({
        tasks: [],
        focusSessions: [],
        habits: [],
        range: "90d",
        timeZone: "Asia/Kolkata",
        now: FIXED_NOW,
      });
      expect(res90.charts.dailyTimeline).toHaveLength(90);
    });
  });

  describe("Known sample datasets", () => {
    it("accurately calculates tasks completed, remaining, and overdue", () => {
      const sampleTasks = [
        // Completed in current period (between 2026-10-12 and 2026-10-18)
        {
          id: "t1",
          completed: true,
          completedAt: new Date("2026-10-14T12:00:00Z"),
          dueDate: null,
          createdAt: new Date("2026-10-10"),
          updatedAt: new Date("2026-10-14"),
        },
        {
          id: "t2",
          completed: true,
          completedAt: new Date("2026-10-16T15:00:00Z"),
          dueDate: new Date("2026-10-15T00:00:00Z"),
          createdAt: new Date("2026-10-10"),
          updatedAt: new Date("2026-10-16"),
        },
        // Completed in previous period (between 2026-10-05 and 2026-10-11)
        {
          id: "t3",
          completed: true,
          completedAt: new Date("2026-10-08T10:00:00Z"),
          dueDate: null,
          createdAt: new Date("2026-10-01"),
          updatedAt: new Date("2026-10-08"),
        },
        // Remaining - Overdue (due Oct 15, today is Oct 18)
        {
          id: "t4",
          completed: false,
          completedAt: null,
          dueDate: new Date("2026-10-15T00:00:00Z"),
          createdAt: new Date("2026-10-10"),
          updatedAt: new Date("2026-10-10"),
        },
        // Remaining - Future due date (due Oct 25)
        {
          id: "t5",
          completed: false,
          completedAt: null,
          dueDate: new Date("2026-10-25T00:00:00Z"),
          createdAt: new Date("2026-10-10"),
          updatedAt: new Date("2026-10-10"),
        },
        // Remaining - No due date
        {
          id: "t6",
          completed: false,
          completedAt: null,
          dueDate: null,
          createdAt: new Date("2026-10-10"),
          updatedAt: new Date("2026-10-10"),
        },
      ];

      const res = calculateProductivityAnalytics({
        tasks: sampleTasks,
        focusSessions: [],
        habits: [],
        range: "7d",
        timeZone: "Asia/Kolkata",
        now: FIXED_NOW,
      });

      expect(res.metrics.tasksCompleted.current).toBe(2); // t1 and t2
      expect(res.metrics.tasksCompleted.previous).toBe(1); // t3
      expect(res.metrics.tasksCompleted.percentageChange).toBe(100);
      expect(res.metrics.tasksCompleted.direction).toBe("up");

      expect(res.metrics.tasksRemaining).toBe(3); // t4, t5, t6
      expect(res.metrics.tasksOverdue).toBe(1); // t4 is overdue
      expect(res.metrics.totalTasks).toBe(6);

      // Distribution chart
      expect(res.charts.taskStatusDistribution).toEqual({
        completed: 2,
        remaining: 2, // 3 remaining minus 1 overdue = 2 on-track remaining
        overdue: 1,
      });

      // Daily timeline should have 1 task completed on 2026-10-14 and 1 on 2026-10-16
      const d14 = res.charts.dailyTimeline.find((p) => p.date === "2026-10-14");
      expect(d14?.tasksCompleted).toBe(1);
      const d16 = res.charts.dailyTimeline.find((p) => p.date === "2026-10-16");
      expect(d16?.tasksCompleted).toBe(1);
    });

    it("accurately calculates focus sessions and focus durations", () => {
      const sampleSessions = [
        // Current period: Oct 13, 50 minutes (3000 seconds)
        {
          id: "f1",
          date: new Date("2026-10-13"),
          plannedMinutes: 50,
          focusedSeconds: 3000,
          completed: true,
          startedAt: new Date("2026-10-13T09:00:00Z"),
          endedAt: new Date("2026-10-13T09:50:00Z"),
        },
        // Current period: Oct 13, 25 minutes (1500 seconds)
        {
          id: "f2",
          date: new Date("2026-10-13"),
          plannedMinutes: 25,
          focusedSeconds: 1500,
          completed: true,
          startedAt: new Date("2026-10-13T14:00:00Z"),
          endedAt: new Date("2026-10-13T14:25:00Z"),
        },
        // Previous period: Oct 10, 40 minutes (2400 seconds)
        {
          id: "f3",
          date: new Date("2026-10-10"),
          plannedMinutes: 40,
          focusedSeconds: 2400,
          completed: true,
          startedAt: new Date("2026-10-10T11:00:00Z"),
          endedAt: new Date("2026-10-10T11:40:00Z"),
        },
      ];

      const res = calculateProductivityAnalytics({
        tasks: [],
        focusSessions: sampleSessions,
        habits: [],
        range: "7d",
        timeZone: "Asia/Kolkata",
        now: FIXED_NOW,
      });

      // Total focus minutes: (3000 + 1500) / 60 = 75 minutes
      expect(res.metrics.focusTimeMinutes.current).toBe(75);
      expect(res.metrics.focusTimeMinutes.previous).toBe(40);
      expect(res.metrics.focusSessionsCount.current).toBe(2);
      expect(res.metrics.focusSessionsCount.previous).toBe(1);

      // Check daily timeline on Oct 13
      const d13 = res.charts.dailyTimeline.find((p) => p.date === "2026-10-13");
      expect(d13?.focusMinutes).toBe(75);
    });

    it("accurately calculates habit rates, streaks, and weekday consistency", () => {
      // Repeat days: 127 = every day
      const dailyHabit = {
        id: "h1",
        title: "Morning Meditation",
        color: "teal",
        repeatDays: 127,
        startDate: "2026-10-01",
        // Completed on Oct 12, 13, 14, 15, 16, 17, 18 (7 days straight in current period!)
        // Also completed on Oct 10, 11
        completions: [
          "2026-10-10",
          "2026-10-11",
          "2026-10-12",
          "2026-10-13",
          "2026-10-14",
          "2026-10-15",
          "2026-10-16",
          "2026-10-17",
          "2026-10-18",
        ],
      };

      // Weekdays only habit (repeatDays = 62 = 0b0111110)
      // Mon (12), Tue (13), Wed (14), Thu (15), Fri (16) = 5 weekdays in current period
      const weekdayHabit = {
        id: "h2",
        title: "Code Review",
        color: "violet",
        repeatDays: 62,
        startDate: "2026-10-01",
        // Completed only on Mon 12, Wed 14, Fri 16 (3 out of 5)
        completions: ["2026-10-12", "2026-10-14", "2026-10-16"],
      };

      const res = calculateProductivityAnalytics({
        tasks: [],
        focusSessions: [],
        habits: [dailyHabit, weekdayHabit],
        range: "7d",
        timeZone: "Asia/Kolkata",
        now: FIXED_NOW,
      });

      // Daily habit: 7 scheduled, 7 completed
      // Weekday habit: 5 scheduled, 3 completed
      // Total: 12 scheduled, 10 completed = 83%
      expect(res.metrics.habitCompletionRate.scheduledDays).toBe(12);
      expect(res.metrics.habitCompletionRate.completedDays).toBe(10);
      expect(res.metrics.habitCompletionRate.current).toBe(83);

      // Streak check
      expect(res.metrics.habitStreaks.maxCurrentStreak).toBeGreaterThanOrEqual(7);
      expect(res.metrics.habitStreaks.habitsWithActiveStreak).toBeGreaterThanOrEqual(1);

      const h1Summary = res.metrics.habitStreaks.streakList.find((s) => s.id === "h1");
      expect(h1Summary?.currentStreak).toBe(9); // Oct 10 to Oct 18 consecutive
    });
  });
});
