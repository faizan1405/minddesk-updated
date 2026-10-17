// Calendar: time-zone helpers, recurrence expansion and data hooks.
// Day keys are "YYYY-MM-DD" strings in the viewer's time zone; timed instants are UTC Dates.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { prefs } from "@/lib/prefs-runtime";

export const DEFAULT_TIME_ZONE = "Asia/Kolkata";
/** The viewer's time zone from Settings (defaults to Asia/Kolkata). */
export function useTimeZone() {
  return prefs.timeZone;
}

export const EVENT_COLORS = ["blue", "green", "amber", "red", "violet", "teal", "gray"] as const;
export type EventColor = (typeof EVENT_COLORS)[number];
export const colorVar = (c: string) => `var(--event-${EVENT_COLORS.includes(c as EventColor) ? c : "blue"})`;

export type Recurrence = "none" | "daily" | "weekly" | "monthly" | "yearly";
export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: "Does not repeat", daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly",
};
export const ruleToRecurrence = (r: string | null): Recurrence =>
  (r?.replace("FREQ=", "").toLowerCase() as Recurrence | undefined) ?? "none";
export const recurrenceToRule = (r: Recurrence) => (r === "none" ? null : `FREQ=${r.toUpperCase()}`);

export type CalEvent = {
  id: string; title: string; description: string | null; location: string | null;
  start_at: string; end_at: string; all_day: boolean; color: string;
  recurrence_rule: string | null; time_zone: string; created_at: string; updated_at: string;
};
export type EventInput = Omit<CalEvent, "id" | "created_at" | "updated_at">;

export type Occurrence = {
  key: string; event: CalEvent; allDay: boolean;
  start: Date; end: Date; // UTC instants (for all-day: start of first day / start of day after last)
  startDay: string; endDay: string; // inclusive day keys in viewer tz
};

// ---------- day-key arithmetic (pure calendar dates, UTC-based so no DST surprises) ----------
const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parseKey = (k: string) => k.split("-").map(Number) as [number, number, number];
const keyToUtc = (k: string) => {
  const [y, m, d] = parseKey(k);
  return Date.UTC(y, m - 1, d);
};
const utcToKey = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (k: string, n: number) => utcToKey(keyToUtc(k) + n * 864e5);
export const diffDays = (a: string, b: string) => Math.round((keyToUtc(b) - keyToUtc(a)) / 864e5);
export const weekday = (k: string) => new Date(keyToUtc(k)).getUTCDay();
/** First day of the week containing k, following the Monday/Sunday preference. */
export const startOfWeek = (k: string) => addDays(k, -((weekday(k) - prefs.weekStart + 7) % 7));
export const keyToLocalDate = (k: string) => {
  const [y, m, d] = parseKey(k);
  return new Date(y, m - 1, d); // only for date-fns formatting of the calendar date
};
export function addMonths(k: string, n: number) {
  const [y, m, d] = parseKey(k);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12), nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return dayKey(ny, nm, Math.min(d, last));
}

// ---------- time-zone conversion via Intl ----------
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsIn(d: Date, tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  const p = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const x of f.formatToParts(d)) if (x.type in p) p[x.type as keyof typeof p] = Number(x.value);
  return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
}
const offsetMs = (t: number, tz: string) => {
  const p = partsIn(new Date(t), tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000;
};
/** Wall-clock date + "HH:mm" in `tz` → UTC instant (handles DST gaps/overlaps sensibly). */
export function zonedToUtc(day: string, hm: string, tz: string) {
  const [y, m, d] = parseKey(day);
  const [h = 0, mi = 0] = hm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const o1 = offsetMs(guess, tz);
  let t = guess - o1;
  const o2 = offsetMs(t, tz);
  if (o2 !== o1) t = guess - o2;
  return new Date(t);
}
export function dayIn(d: Date, tz: string) {
  const p = partsIn(d, tz);
  return dayKey(p.y, p.m, p.d);
}
export function timeIn(d: Date, tz: string) {
  const p = partsIn(d, tz);
  return `${pad(p.h)}:${pad(p.mi)}`;
}
export const todayKey = (tz: string) => dayIn(new Date(), tz);
export const dayStart = (k: string, tz: string) => zonedToUtc(k, "00:00", tz);

export function formatTime(d: Date, tz: string) {
  return prefs.clock === "24"
    ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d)
    : new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
}
export function formatHour(h: number) {
  if (prefs.clock === "24") return `${String(h).padStart(2, "0")}:00`;
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

// ---------- recurrence expansion ----------
const MAX_OCCURRENCES = 2000;

/** Expand an event into occurrences intersecting [from, to] (inclusive day keys in `viewTz`). */
export function expandEvent(ev: CalEvent, from: string, to: string, viewTz: string): Occurrence[] {
  const out: Occurrence[] = [];
  const rec = ruleToRecurrence(ev.recurrence_rule);
  const s = new Date(ev.start_at), e = new Date(ev.end_at);
  // Base pattern in the event's own zone so wall-clock times stay fixed across DST.
  const baseStart = ev.all_day ? ev.start_at.slice(0, 10) : dayIn(s, ev.time_zone);
  const baseEnd = ev.all_day ? ev.end_at.slice(0, 10) : dayIn(e, ev.time_zone);
  const span = diffDays(baseStart, baseEnd);
  const sTime = ev.all_day ? "00:00" : timeIn(s, ev.time_zone);
  const eTime = ev.all_day ? "00:00" : timeIn(e, ev.time_zone);
  const [by, bm, bd] = parseKey(baseStart);

  const make = (startKey: string): Occurrence | null => {
    const endKey = addDays(startKey, span);
    if (ev.all_day) {
      if (endKey < from || startKey > to) return null;
      return {
        key: `${ev.id}:${startKey}`, event: ev, allDay: true,
        start: dayStart(startKey, viewTz), end: dayStart(addDays(endKey, 1), viewTz), startDay: startKey, endDay: endKey,
      };
    }
    const start = zonedToUtc(startKey, sTime, ev.time_zone);
    const end = zonedToUtc(endKey, eTime, ev.time_zone);
    const sd = dayIn(start, viewTz), ed = dayIn(new Date(end.getTime() - 1), viewTz);
    if (ed < from || sd > to) return null;
    return { key: `${ev.id}:${startKey}`, event: ev, allDay: false, start, end, startDay: sd, endDay: ed < sd ? sd : ed };
  };

  if (rec === "none") {
    const o = make(baseStart);
    return o ? [o] : [];
  }
  const fromPad = addDays(from, -span - 1);
  const toPad = addDays(to, 1);
  if (rec === "daily" || rec === "weekly") {
    const step = rec === "daily" ? 1 : 7;
    let n = Math.max(0, Math.floor(diffDays(baseStart, fromPad) / step));
    for (let i = 0; i < MAX_OCCURRENCES; i++, n++) {
      const k = addDays(baseStart, n * step);
      if (k > toPad) break;
      const o = make(k);
      if (o) out.push(o);
    }
    return out;
  }
  // Monthly / yearly: same day-of-month; months without that day are skipped (like Google Calendar).
  const stepMonths = rec === "monthly" ? 1 : 12;
  const [fy, fm] = parseKey(fromPad);
  let n = Math.max(0, Math.floor(((fy - by) * 12 + (fm - bm)) / stepMonths) - 1);
  for (let i = 0; i < MAX_OCCURRENCES; i++, n++) {
    const total = by * 12 + (bm - 1) + n * stepMonths;
    const y = Math.floor(total / 12), m = (total % 12) + 1;
    const first = dayKey(y, m, 1);
    if (first > toPad) break;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (bd > last) continue;
    const o = make(dayKey(y, m, bd));
    if (o) out.push(o);
  }
  return out;
}

export function expandAll(events: CalEvent[], from: string, to: string, tz: string) {
  return events
    .flatMap((ev) => expandEvent(ev, from, to, tz))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime() || a.event.title.localeCompare(b.event.title));
}

export const occursOn = (o: Occurrence, k: string) => o.startDay <= k && o.endDay >= k;

// ---------- data hooks ----------
export const eventsKey = ["events"] as const;

export function useEvents(from: string, to: string, tz: string) {
  return useQuery({
    queryKey: [...eventsKey, from, to, tz],
    queryFn: () => {
      const qs = new URLSearchParams({
        from: dayStart(from, tz).toISOString(),
        to: dayStart(addDays(to, 1), tz).toISOString(),
      });
      return api<CalEvent[]>(`/api/events?${qs}`);
    },
    placeholderData: keepPreviousData,
  });
}

const fail = (msg: string) => (e: unknown) => toast.error(msg, { description: e instanceof Error ? e.message : undefined });

export function useEventActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: eventsKey });
  const createEvent = useMutation({
    mutationFn: (body: EventInput) => api<CalEvent>("/api/events", { method: "POST", body }),
    onSuccess: () => { refresh(); toast.success("Event created"); },
    onError: fail("Couldn't create event"),
  });
  const updateEvent = useMutation({
    mutationFn: ({ id, body }: { id: string; body: EventInput }) => api<CalEvent>(`/api/events/${id}`, { method: "PUT", body }),
    onSuccess: () => { refresh(); toast.success("Event updated"); },
    onError: fail("Couldn't update event"),
  });
  const deleteEvent = useMutation({
    mutationFn: (id: string) => api(`/api/events/${id}`, { method: "DELETE" }),
    onSuccess: () => { refresh(); toast.success("Event deleted"); },
    onError: fail("Couldn't delete event"),
  });
  return { createEvent, updateEvent, deleteEvent };
}
