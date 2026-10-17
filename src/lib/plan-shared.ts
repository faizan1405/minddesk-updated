import { prefs } from "@/lib/prefs-runtime";
// Plan Your Day: shared types and pure scheduling logic (used by the UI and the preview adapter).
// Times are wall-clock minutes of a local calendar day (0–1440); dates are "YYYY-MM-DD".
// An activity whose end_minute <= start_minute runs overnight into the next day.

export const DEFAULT_PLAN_CATEGORIES = [
  { name: "Work & Focus", color: "blue" },
  { name: "Health", color: "green" },
  { name: "Personal", color: "violet" },
  { name: "Breaks", color: "amber" },
  { name: "Sleep", color: "gray" },
] as const;

export type PlanCategory = { id: string; name: string; color: string; position: number; is_default: boolean };
export type PlanException = { date: string; cancelled: boolean; start_minute: number | null; end_minute: number | null };
export type RoutineType = "fixed" | "flexible";
export type PlanActivity = {
  id: string; category_id: string | null; title: string; description: string | null;
  start_date: string; end_date: string | null; start_minute: number; end_minute: number;
  /** Weekday bitmask, bit 0 = Sunday … bit 6 = Saturday. 0 = one-off on start_date. */
  repeat_days: number; routine_type: RoutineType;
  exceptions: PlanException[]; created_at: string; updated_at: string;
};
export type PlanActivityInput = Omit<PlanActivity, "id" | "exceptions" | "created_at" | "updated_at">;
export type FocusSession = {
  id: string; activity_id: string | null; title: string; date: string; planned_minutes: number;
  focused_seconds: number; completed: boolean; started_at: string; ended_at: string;
};

export const ALL_DAYS = 0b1111111;
export const WEEKDAYS = 0b0111110;
export type RepeatPreset = "none" | "daily" | "weekdays" | "weekly" | "custom";
export const REPEAT_LABEL: Record<RepeatPreset, string> = {
  none: "Does not repeat", daily: "Every day", weekdays: "Weekdays (Mon–Fri)", weekly: "Weekly", custom: "Selected days",
};
export const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ---------- dates ----------
const toUtc = (k: string) => {
  const [y = 0, m = 1, d = 1] = k.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
export const addDaysKey = (k: string, n: number) => new Date(toUtc(k) + n * 864e5).toISOString().slice(0, 10);
export const weekdayOf = (k: string) => new Date(toUtc(k)).getUTCDay();
/** Today's date key in the time zone chosen in Settings. */
export function localToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: prefs.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
/** Minutes since midnight now, in the time zone chosen in Settings. */
export const nowMinute = () => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: prefs.timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date());
  const g = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0);
  return (g("hour") % 24) * 60 + g("minute") + g("second") / 60;
};

export function presetFor(days: number, startDate: string): RepeatPreset {
  if (days === 0) return "none";
  if (days === ALL_DAYS) return "daily";
  if (days === WEEKDAYS) return "weekdays";
  if (days === 1 << weekdayOf(startDate)) return "weekly";
  return "custom";
}
export function daysFor(preset: RepeatPreset, startDate: string, custom: number) {
  if (preset === "none") return 0;
  if (preset === "daily") return ALL_DAYS;
  if (preset === "weekdays") return WEEKDAYS;
  if (preset === "weekly") return 1 << weekdayOf(startDate);
  return custom || 1 << weekdayOf(startDate);
}
export function repeatSummary(a: Pick<PlanActivity, "repeat_days" | "start_date">) {
  const p = presetFor(a.repeat_days, a.start_date);
  if (p === "weekly") return `Every ${DAY_NAMES[weekdayOf(a.start_date)]}`;
  if (p === "custom") return DAY_NAMES.filter((_, i) => a.repeat_days & (1 << i)).join(", ");
  return REPEAT_LABEL[p];
}

// ---------- time formatting ----------
export function fmtMinute(m: number) {
  const mm = ((Math.round(m) % 1440) + 1440) % 1440;
  const h = Math.floor(mm / 60), mi = mm % 60;
  if (prefs.clock === "24") return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mi).padStart(2, "0")} ${ap}`;
}
export const minuteToInput = (m: number) => {
  const mm = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
};
export const inputToMinute = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return h === undefined || m === undefined || isNaN(h) || isNaN(m) ? null : h * 60 + m;
};
export const durationOf = (s: number, e: number) => (e > s ? e - s : e + 1440 - s);
export function fmtDuration(min: number) {
  const h = Math.floor(min / 60), m = min % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}

// ---------- occurrences ----------
/** Does the activity have an occurrence starting on `date`? Returns its effective times or null. */
export function occurrenceOn(a: PlanActivity, date: string): { start: number; end: number; exception: PlanException | null } | null {
  if (date < a.start_date) return null;
  if (a.repeat_days === 0) {
    if (date !== a.start_date) return null;
  } else {
    if (a.end_date && date > a.end_date) return null;
    if (!(a.repeat_days & (1 << weekdayOf(date)))) return null;
  }
  const ex = a.exceptions.find((e) => e.date === date) ?? null;
  if (ex?.cancelled) return null;
  return { start: ex?.start_minute ?? a.start_minute, end: ex?.end_minute ?? a.end_minute, exception: ex };
}

export type Block = {
  key: string; activity: PlanActivity; occurrenceDate: string;
  start: number; end: number; // visible minutes within the viewed day
  fullStart: number; fullEnd: number; // the occurrence's own times
  continued: "none" | "from-yesterday" | "into-tomorrow"; modified: boolean;
};

/** All blocks visible on `day`, including overnight parts carried over from the previous day. */
export function blocksForDay(activities: PlanActivity[], day: string): Block[] {
  const prev = addDaysKey(day, -1);
  const out: Block[] = [];
  for (const a of activities) {
    const o = occurrenceOn(a, day);
    if (o) {
      const overnight = o.end <= o.start;
      out.push({
        key: `${a.id}:${day}`, activity: a, occurrenceDate: day, start: o.start, end: overnight ? 1440 : o.end,
        fullStart: o.start, fullEnd: o.end, continued: overnight ? "into-tomorrow" : "none", modified: !!o.exception,
      });
    }
    const y = occurrenceOn(a, prev);
    if (y && y.end <= y.start && y.end > 0) {
      out.push({
        key: `${a.id}:${prev}:tail`, activity: a, occurrenceDate: prev, start: 0, end: y.end,
        fullStart: y.start, fullEnd: y.end, continued: "from-yesterday", modified: !!y.exception,
      });
    }
  }
  return out.sort((x, z) => x.start - z.start || z.end - x.end);
}

/** Assign side-by-side lanes to overlapping blocks. */
export function withLanes(blocks: Block[]) {
  const res: { block: Block; lane: number; lanes: number }[] = [];
  let group: { block: Block; lane: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;
  const flush = () => {
    for (const g of group) res.push({ ...g, lanes: laneEnds.length });
    group = []; laneEnds = []; groupEnd = -1;
  };
  for (const b of blocks) {
    if (b.start >= groupEnd && group.length) flush();
    let lane = laneEnds.findIndex((e) => e <= b.start);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(b.end); } else laneEnds[lane] = b.end;
    group.push({ block: b, lane });
    groupEnd = Math.max(groupEnd, b.end);
  }
  flush();
  return res;
}

export function overlapsWith(blocks: Block[], start: number, end: number, ignoreActivityId?: string) {
  const segs = end > start ? [[start, end]] : [[start, 1440], [0, end]];
  return blocks.filter((b) => b.activity.id !== ignoreActivityId && segs.some(([s, e]) => b.start < e! && b.end > s!));
}

/** Free gaps of the day (minutes), based only on what is actually scheduled. */
export function freeGaps(blocks: Block[], ignoreActivityId?: string) {
  const busy = blocks.filter((b) => b.activity.id !== ignoreActivityId).map((b) => [b.start, b.end] as const).sort((a, b) => a[0] - b[0]);
  const gaps: [number, number][] = [];
  let cur = 0;
  for (const [s, e] of busy) {
    if (s > cur) gaps.push([cur, s]);
    cur = Math.max(cur, e);
  }
  if (cur < 1440) gaps.push([cur, 1440]);
  return gaps;
}

/** Up to `limit` start times where an activity of `duration` fits, nearest to `preferred` first. */
export function suggestSlots(blocks: Block[], duration: number, preferred: number, ignoreActivityId?: string, notBefore = 0, limit = 3) {
  const out: { start: number; end: number }[] = [];
  for (const [gs, ge] of freeGaps(blocks, ignoreActivityId)) {
    const s0 = Math.max(gs, Math.ceil(notBefore / 15) * 15);
    if (ge - s0 < duration) continue;
    // Candidate: preferred time if inside the gap, else the gap start (rounded to 15 min).
    const ideal = Math.min(Math.max(preferred, s0), ge - duration);
    const start = Math.ceil(ideal / 15) * 15 <= ge - duration ? Math.ceil(ideal / 15) * 15 : s0;
    out.push({ start, end: start + duration });
  }
  return out.sort((a, b) => Math.abs(a.start - preferred) - Math.abs(b.start - preferred)).slice(0, limit);
}

/** One-off activities visible in [from, to] plus overlapping series — mirrors the server query. */
export function activityInRange(a: Pick<PlanActivity, "start_date" | "end_date" | "repeat_days">, from: string, to: string) {
  if (a.start_date > to) return false;
  if (a.repeat_days === 0) return a.start_date >= addDaysKey(from, -1);
  return !a.end_date || a.end_date >= addDaysKey(from, -1);
}
