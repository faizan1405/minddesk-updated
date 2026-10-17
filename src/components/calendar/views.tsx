import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { format } from "date-fns";
import { CalendarDays, MapPin, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  addDays, colorVar, dayStart, formatHour, formatTime, keyToLocalDate, occursOn, startOfWeek, todayKey, weekday,
  type Occurrence,
} from "@/lib/calendar";
import type { EventDraft } from "./EventDialog";

type Handlers = { onOpen: (o: Occurrence) => void; onCreate: (d: EventDraft) => void; tz: string };

function Chip({ o, tz, onOpen, compact }: { o: Occurrence; tz: string; onOpen: (o: Occurrence) => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(o); }}
      className={cn("flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left text-xs leading-5 transition-colors hover:bg-accent",
        o.allDay && "text-background hover:opacity-90")}
      style={o.allDay ? { background: colorVar(o.event.color) } : undefined}
      title={o.event.title}
    >
      {!o.allDay && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorVar(o.event.color) }} />}
      {!o.allDay && !compact && <span className="shrink-0 text-muted-foreground">{formatTime(o.start, tz).replace(":00", "")}</span>}
      <span className="truncate font-medium">{o.event.title}</span>
    </button>
  );
}

// ---------------- Month ----------------
export function MonthView({
  cursor, occurrences, onOpen, onCreate, onShowDay, tz, compact,
}: Handlers & { cursor: string; occurrences: Occurrence[]; onShowDay: (d: string) => void; compact: boolean }) {
  const month = cursor.slice(0, 7);
  const first = startOfWeek(`${month}-01`);
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const today = todayKey(tz);
  const max = compact ? 2 : 3;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 border-b text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {days.slice(0, 7).map((d) => (
          <div key={d} className="py-2">{format(keyToLocalDate(d), compact ? "EEEEE" : "EEE")}</div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 grid-rows-6">
        {days.map((d) => {
          const items = occurrences.filter((o) => occursOn(o, d));
          const outside = d.slice(0, 7) !== month;
          const shown = items.slice(0, items.length > max ? max - 1 : max);
          const more = items.length - shown.length;
          return (
            <div
              key={d}
              role="button"
              tabIndex={0}
              aria-label={`Create event on ${format(keyToLocalDate(d), "MMMM d")}`}
              onClick={() => onCreate({ day: d })}
              onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onCreate({ day: d })}
              className={cn("flex min-h-[72px] min-w-0 cursor-pointer flex-col gap-0.5 border-b border-r p-1 transition-colors hover:bg-accent/40 md:min-h-[104px]",
                weekday(d) === 6 && "border-r-0", outside && "bg-muted/20")}
            >
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onShowDay(d); }}
                className={cn("mx-auto mb-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors hover:bg-accent",
                  outside && "text-muted-foreground/60",
                  d === today && "bg-primary text-primary-foreground hover:bg-primary")}
                aria-label={`Open ${format(keyToLocalDate(d), "MMMM d")}`}
              >
                {Number(d.slice(8))}
              </button>
              {shown.map((o) => <Chip key={o.key} o={o} tz={tz} onOpen={onOpen} compact={compact} />)}
              {more > 0 && (
                <button type="button" onClick={(e) => { e.stopPropagation(); onShowDay(d); }}
                  className="rounded-md px-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
                  +{more} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- Week / Day time grid ----------------
const HOUR = 48; // px per hour

type Placed = { o: Occurrence; top: number; height: number; col: number; cols: number };

/** Clip timed occurrences to the day and lay out overlapping ones side by side. */
function layoutDay(items: Occurrence[], day: string, tz: string): Placed[] {
  const s0 = dayStart(day, tz).getTime(), s1 = dayStart(addDays(day, 1), tz).getTime();
  const len = (s1 - s0) / 60000;
  const segs = items
    .map((o) => ({ o, a: Math.max(o.start.getTime(), s0), b: Math.min(o.end.getTime(), s1) }))
    .filter((x) => x.b > x.a)
    .map((x) => ({ o: x.o, start: ((x.a - s0) / 60000) * (1440 / len), end: ((x.b - s0) / 60000) * (1440 / len) }))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const out: Placed[] = [];
  let cluster: { seg: (typeof segs)[number]; col: number }[] = [];
  let colsEnd: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const c of cluster) {
      const vEnd = Math.max(c.seg.end, c.seg.start + 20); // visual min height
      out.push({ o: c.seg.o, top: (c.seg.start / 60) * HOUR, height: ((vEnd - c.seg.start) / 60) * HOUR, col: c.col, cols: colsEnd.length });
    }
    cluster = []; colsEnd = []; clusterEnd = -1;
  };
  for (const seg of segs) {
    const vEnd = Math.max(seg.end, seg.start + 20);
    if (seg.start >= clusterEnd && cluster.length) flush();
    let col = colsEnd.findIndex((e) => e <= seg.start);
    if (col === -1) { col = colsEnd.length; colsEnd.push(vEnd); } else colsEnd[col] = vEnd;
    cluster.push({ seg, col });
    clusterEnd = Math.max(clusterEnd, vEnd);
  }
  flush();
  return out;
}

function nowMinutes(tz: string) {
  const s = dayStart(todayKey(tz), tz).getTime();
  return (Date.now() - s) / 60000;
}

export function TimeGridView({
  days, occurrences, onOpen, onCreate, onShowDay, tz,
}: Handlers & { days: string[]; occurrences: Occurrence[]; onShowDay: (d: string) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const today = todayKey(tz);
  const [now, setNow] = useState(() => nowMinutes(tz));
  useEffect(() => {
    const t = setInterval(() => setNow(nowMinutes(tz)), 60_000);
    return () => clearInterval(t);
  }, [tz]);
  useEffect(() => {
    // Start scrolled to ~7 AM (or just above the current time when today is visible).
    const target = days.includes(today) ? Math.max(0, (now / 60 - 2) * HOUR) : 7 * HOUR;
    scroller.current?.scrollTo({ top: target });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.join(",")]);

  const allDay = useMemo(
    () => days.map((d) => occurrences.filter((o) => o.allDay && occursOn(o, d))),
    [days, occurrences],
  );
  const timed = useMemo(
    () => days.map((d) => layoutDay(occurrences.filter((o) => !o.allDay && occursOn(o, d)), d, tz)),
    [days, occurrences, tz],
  );
  const cols = { gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` };

  function slotClick(e: MouseEvent<HTMLDivElement>, day: string) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mins = Math.floor(((e.clientY - rect.top) / HOUR) * 2) * 30;
    const m = Math.min(Math.max(mins, 0), 1410);
    onCreate({ day, time: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}` });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid border-b" style={cols}>
        <div />
        {days.map((d) => (
          <button key={d} type="button" onClick={() => onShowDay(d)} className="flex flex-col items-center gap-0.5 py-2 hover:bg-accent/40">
            <span className={cn("text-[11px] font-medium uppercase tracking-wide text-muted-foreground", d === today && "text-primary")}>
              {format(keyToLocalDate(d), "EEE")}
            </span>
            <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-lg font-medium", d === today && "bg-primary text-primary-foreground")}>
              {Number(d.slice(8))}
            </span>
          </button>
        ))}
      </div>
      <div className="grid border-b" style={cols}>
        <div className="flex items-center justify-end pr-2 text-[10px] text-muted-foreground">All day</div>
        {days.map((d, i) => (
          <div key={d} onClick={() => onCreate({ day: d, allDay: true })}
            className="flex min-h-8 min-w-0 cursor-pointer flex-col gap-0.5 border-l p-1 hover:bg-accent/40">
            {allDay[i]?.map((o) => <Chip key={o.key} o={o} tz={tz} onOpen={onOpen} />)}
          </div>
        ))}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="relative grid" style={{ ...cols, height: HOUR * 24 }}>
          <div className="relative">
            {Array.from({ length: 23 }, (_, h) => (
              <div key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground" style={{ top: (h + 1) * HOUR }}>
                {formatHour(h + 1)}
              </div>
            ))}
          </div>
          {days.map((d, i) => (
            <div key={d} className="relative border-l" onClick={(e) => slotClick(e, d)}
              style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR - 1}px, var(--border) ${HOUR - 1}px, var(--border) ${HOUR}px)` }}>
              {timed[i]?.map((p) => (
                <button
                  key={p.o.key}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOpen(p.o); }}
                  className="absolute overflow-hidden rounded-md border-l-[3px] bg-card px-1.5 py-0.5 text-left text-xs shadow-sm ring-1 ring-border transition hover:z-10 hover:ring-ring"
                  style={{
                    top: p.top + 1, height: Math.max(p.height - 2, 18),
                    left: `calc(${(p.col / p.cols) * 100}% + 2px)`, width: `calc(${100 / p.cols}% - 4px)`,
                    borderLeftColor: colorVar(p.o.event.color),
                    background: `color-mix(in srgb, ${colorVar(p.o.event.color)} 28%, var(--card))`,
                  }}
                  title={p.o.event.title}
                >
                  <div className="truncate font-medium leading-4">{p.o.event.title}</div>
                  {p.height >= 34 && (
                    <div className="truncate text-[10px] leading-4 text-muted-foreground">
                      {formatTime(p.o.start, tz)} – {formatTime(p.o.end, tz)}
                    </div>
                  )}
                </button>
              ))}
              {d === today && (
                <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: (now / 60) * HOUR }}>
                  <span className="-ml-1.5 h-3 w-3 rounded-full" style={{ background: "var(--event-now)" }} />
                  <span className="h-0.5 flex-1" style={{ background: "var(--event-now)" }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------- Agenda ----------------
export function AgendaView({ occurrences, from, onOpen, tz }: { occurrences: Occurrence[]; from: string; onOpen: (o: Occurrence) => void; tz: string }) {
  const today = todayKey(tz);
  const groups = useMemo(() => {
    const m = new Map<string, Occurrence[]>();
    for (const o of occurrences) {
      const k = o.startDay < from ? from : o.startDay; // ongoing events appear on the first visible day
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(o);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [occurrences, from]);

  if (groups.length === 0) {
    return (
      <div className="mx-auto mt-20 max-w-sm px-4 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border bg-card">
          <CalendarDays className="h-5 w-5 text-primary" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">Nothing scheduled</h2>
        <p className="mt-1 text-sm text-muted-foreground">No events in this period. Create one to see it here.</p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl divide-y px-2 md:px-6">
        {groups.map(([day, items]) => (
          <section key={day} className="flex gap-4 py-4">
            <div className="w-14 shrink-0 text-center">
              <div className={cn("text-2xl font-semibold leading-none", day === today && "text-primary")}>{Number(day.slice(8))}</div>
              <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{format(keyToLocalDate(day), "MMM, EEE")}</div>
            </div>
            <ul className="min-w-0 flex-1 space-y-1">
              {items.map((o) => (
                <li key={o.key}>
                  <button type="button" onClick={() => onOpen(o)}
                    className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-accent">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorVar(o.event.color) }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{o.event.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>{o.allDay ? "All day" : `${formatTime(o.start, tz)} – ${formatTime(o.end, tz)}${o.endDay !== o.startDay ? ` (${format(keyToLocalDate(o.endDay), "MMM d")})` : ""}`}</span>
                        {o.event.location && <span className="flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{o.event.location}</span></span>}
                        {o.event.recurrence_rule && <Repeat className="h-3 w-3" aria-label="Repeats" />}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
