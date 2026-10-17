import { prefs } from "@/lib/prefs-runtime";
// Habits & Routines: pure, browser- and server-safe rules (schedules, streaks, progress).
// Dates are "YYYY-MM-DD" keys in the app time zone; completions store that key directly (no UTC shifting).
import { z } from "zod";

export const HABIT_COLORS = ["blue", "green", "amber", "red", "violet", "teal", "gray"] as const;
export type HabitColor = (typeof HABIT_COLORS)[number];
export const HABIT_TIME_ZONE = "Asia/Kolkata";

export type Habit = {
  id: string; routine_id: string | null; title: string; description: string | null; color: HabitColor;
  repeat_days: number; position: number; start_date: string; completions: string[];
  created_at: string; updated_at: string;
};
export type Routine = { id: string; title: string; position: number; collapsed: boolean; created_at: string; updated_at: string };
export type HabitsData = { habits: Habit[]; routines: Routine[] };

export const ALL_DAYS = 0b1111111, WEEKDAYS = 0b0111110, WEEKENDS = 0b1000001; // bit 0 = Sunday
export type SchedulePreset = "daily" | "weekdays" | "weekends" | "custom";
export const PRESET_LABEL: Record<SchedulePreset, string> = { daily: "Every day", weekdays: "Weekdays", weekends: "Weekends", custom: "Selected days" };
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const presetOf = (d: number): SchedulePreset => (d === ALL_DAYS ? "daily" : d === WEEKDAYS ? "weekdays" : d === WEEKENDS ? "weekends" : "custom");
export function scheduleLabel(d: number) {
  const p = presetOf(d);
  if (p !== "custom") return PRESET_LABEL[p];
  const days = [1, 2, 3, 4, 5, 6, 0].filter((i) => d & (1 << i));
  // Contiguous Mon-based run → "Mon – Sat"
  const order = [1, 2, 3, 4, 5, 6, 0];
  const idx = days.map((x) => order.indexOf(x));
  if (days.length >= 3 && idx.every((v, i) => i === 0 || v === idx[i - 1]! + 1)) return `${DAY_SHORT[days[0]!]} – ${DAY_SHORT[days[days.length - 1]!]}`;
  return days.map((x) => DAY_SHORT[x]).join(", ");
}

// ---------- dates ----------
const toUtc = (k: string) => { const [y = 0, m = 1, d = 1] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); };
export const addDays = (k: string, n: number) => new Date(toUtc(k) + n * 864e5).toISOString().slice(0, 10);
export const weekday = (k: string) => new Date(toUtc(k)).getUTCDay();
export const dayDiff = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / 864e5);
/** Today in the viewer's chosen time zone (browser); the server keeps Asia/Kolkata unless told otherwise. */
export function todayIn(tz = prefs.timeZone || HABIT_TIME_ZONE, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export const isDateKey = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(toUtc(s)) && new Date(toUtc(s)).toISOString().slice(0, 10) === s;

// ---------- schedule & stats ----------
export const isScheduled = (h: Pick<Habit, "repeat_days" | "start_date">, date: string) =>
  date >= h.start_date && (h.repeat_days & (1 << weekday(date))) !== 0;

export type HabitStats = { current: number; best: number; done: number; scheduled: number; percent: number | null };
/**
 * Streaks count consecutive *scheduled* days that were completed; unscheduled days are skipped.
 * Today (if scheduled and not yet done) neither counts nor breaks the streak.
 */
export function habitStats(h: Pick<Habit, "repeat_days" | "start_date" | "completions">, today: string): HabitStats {
  const done = new Set(h.completions);
  let best = 0, run = 0, doneCount = 0, scheduled = 0;
  const span = Math.min(dayDiff(h.start_date, today), 3660);
  for (let i = span; i >= 0; i--) {
    const d = addDays(today, -i);
    if (!isScheduled(h, d)) continue;
    const ok = done.has(d);
    if (d === today && !ok) continue;
    scheduled++;
    if (ok) { doneCount++; run++; best = Math.max(best, run); } else run = 0;
  }
  return { current: run, best, done: doneCount, scheduled, percent: scheduled ? Math.round((doneCount / scheduled) * 100) : null };
}

export type DayState = "done" | "missed" | "pending" | "future" | "off";
export function dayState(h: Pick<Habit, "repeat_days" | "start_date" | "completions">, date: string, today: string): DayState {
  if (!isScheduled(h, date)) return h.completions.includes(date) ? "done" : "off";
  if (h.completions.includes(date)) return "done";
  if (date > today) return "future";
  return date === today ? "pending" : "missed";
}

/** Progress over the habits scheduled on `date`; null when nothing is scheduled (never a fake 100%). */
export function progressOf(habits: Habit[], date: string) {
  const sched = habits.filter((h) => isScheduled(h, date));
  const done = sched.filter((h) => h.completions.includes(date)).length;
  return { done, total: sched.length, percent: sched.length ? Math.round((done / sched.length) * 100) : null };
}

// ---------- validation (server + preview) ----------
export const HabitInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  color: z.enum(HABIT_COLORS),
  repeat_days: z.number().int().min(1, "Pick at least one day").max(127),
  routine_id: z.string().uuid().nullable().optional(),
  start_date: z.string().refine(isDateKey, "Invalid date").optional(),
});
export const HabitPatch = HabitInput.partial();
export const RoutineInput = z.object({ title: z.string().trim().min(1).max(200) });
export const RoutinePatch = z.object({ title: z.string().trim().min(1).max(200).optional(), collapsed: z.boolean().optional() });
export const OrderInput = z.object({ routine_id: z.string().uuid().nullable(), habit_ids: z.array(z.string().uuid()).max(500) });

/** A completion date is valid when it's a real date, scheduled for the habit, and not in the future. */
export function completionError(h: Pick<Habit, "repeat_days" | "start_date">, date: string, today = todayIn()): string | null {
  if (!isDateKey(date)) return "Invalid date";
  if (date > addDays(today, 1)) return "Can't complete a future day";
  if (date < h.start_date) return "This habit wasn't being tracked on that day";
  if (!isScheduled(h, date)) return "This habit isn't scheduled on that day";
  return null;
}
