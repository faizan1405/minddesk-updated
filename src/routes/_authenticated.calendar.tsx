import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState, LoadingState } from "@/components/app/PageStates";
import { EventDialog, type EventDraft } from "@/components/calendar/EventDialog";
import { EventDetailsDialog } from "@/components/calendar/EventDetailsDialog";
import { AgendaView, MonthView, TimeGridView } from "@/components/calendar/views";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  addDays, addMonths, expandAll, keyToLocalDate, startOfWeek, todayKey, useEvents, useTimeZone,
  type CalEvent, type Occurrence,
} from "@/lib/calendar";

const VIEWS = ["month", "week", "day", "agenda"] as const;
type View = (typeof VIEWS)[number];
const AGENDA_DAYS = 30;

export const Route = createFileRoute("/_authenticated/calendar")({
  validateSearch: (s: Record<string, unknown>): { view?: View | undefined; date?: string | undefined } => {
    const v = s["view"], d = s["date"];
    return {
      view: VIEWS.includes(v as View) ? (v as View) : undefined,
      date: typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Calendar — MindDesk" },
      { name: "description", content: "Month, week, day and agenda views of your schedule." },
      { property: "og:title", content: "Calendar — MindDesk" },
      { property: "og:description", content: "Month, week, day and agenda views of your schedule." },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const tz = useTimeZone();
  const isMobile = useIsMobile();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/calendar" });
  const view: View = search.view ?? "month";
  const cursor = search.date ?? todayKey(tz);
  const go = (next: { view?: View; date?: string }) =>
    navigate({ search: (p) => ({ ...p, ...next }), replace: true });

  const weekDays = isMobile ? 3 : 7;
  const range = useMemo(() => {
    if (view === "month") {
      const first = startOfWeek(`${cursor.slice(0, 7)}-01`);
      return { from: first, to: addDays(first, 41) };
    }
    if (view === "week") {
      const from = isMobile ? cursor : startOfWeek(cursor);
      return { from, to: addDays(from, weekDays - 1) };
    }
    if (view === "day") return { from: cursor, to: cursor };
    return { from: cursor, to: addDays(cursor, AGENDA_DAYS - 1) };
  }, [view, cursor, isMobile, weekDays]);

  const events = useEvents(range.from, range.to, tz);
  const occurrences = useMemo(
    () => (events.data ? expandAll(events.data, range.from, range.to, tz) : []),
    [events.data, range.from, range.to, tz],
  );

  const [selected, setSelected] = useState<Occurrence | null>(null);
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const openCreate = (d: EventDraft) => { setEditing(null); setDraft(d); setFormOpen(true); };

  function step(dir: 1 | -1) {
    if (view === "month") go({ date: addMonths(`${cursor.slice(0, 7)}-01`, dir) });
    else if (view === "week") go({ date: addDays(cursor, dir * weekDays) });
    else if (view === "day") go({ date: addDays(cursor, dir) });
    else go({ date: addDays(cursor, dir * AGENDA_DAYS) });
  }

  const heading = (() => {
    const f = (k: string, p: string) => format(keyToLocalDate(k), p);
    if (view === "month") return f(cursor, "MMMM yyyy");
    if (view === "day") return f(cursor, isMobile ? "EEE, MMM d" : "EEEE, MMMM d, yyyy");
    const { from, to } = range;
    if (isMobile) return from.slice(0, 7) === to.slice(0, 7) ? `${f(from, "MMM d")}–${f(to, "d")}` : `${f(from, "MMM d")}–${f(to, "MMM d")}`;
    if (from.slice(0, 7) === to.slice(0, 7)) return `${f(from, "MMM d")} – ${f(to, "d, yyyy")}`;
    if (from.slice(0, 4) === to.slice(0, 4)) return `${f(from, "MMM d")} – ${f(to, "MMM d, yyyy")}`;
    return `${f(from, "MMM d, yyyy")} – ${f(to, "MMM d, yyyy")}`;
  })();

  const showDay = (d: string) => go({ view: "day", date: d });

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-3 md:px-6">
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => go({ date: todayKey(tz) })}>Today</Button>
        <div className="flex">
          <Button variant="ghost" size="icon" aria-label="Previous" onClick={() => step(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" aria-label="Next" onClick={() => step(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <h1 className="order-first w-full truncate text-lg font-semibold tracking-tight sm:order-none sm:w-auto sm:min-w-0 sm:flex-1 md:text-xl">{heading}</h1>
        <div className="flex-1 sm:hidden" />
        <Select value={view} onValueChange={(v) => go({ view: v as View })}>
          <SelectTrigger className="h-9 w-[104px] rounded-full" aria-label="View"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Month</SelectItem>
            <SelectItem value="week">Week</SelectItem>
            <SelectItem value="day">Day</SelectItem>
            <SelectItem value="agenda">Agenda</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" aria-label="Create event" className="gap-1.5 rounded-full" onClick={() => openCreate({ day: view === "month" || view === "agenda" ? todayKey(tz) : cursor })}>
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Create</span>
        </Button>
      </header>

      {events.isPending ? (
        <LoadingState />
      ) : events.error ? (
        <ErrorState message={events.error.message} onRetry={() => events.refetch()} />
      ) : view === "month" ? (
        <MonthView cursor={cursor} occurrences={occurrences} onOpen={setSelected} onCreate={openCreate} onShowDay={showDay} tz={tz} compact={isMobile} />
      ) : view === "agenda" ? (
        <AgendaView occurrences={occurrences} from={range.from} onOpen={setSelected} tz={tz} />
      ) : (
        <>
          {isMobile && view === "week" && (
            <nav aria-label="Pick a day" className="grid grid-cols-7 gap-1 border-b px-2 py-2">
              {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)).map((d) => {
                const shown = d >= range.from && d <= range.to;
                const isToday = d === todayKey(tz);
                return (
                  <button key={d} type="button" onClick={() => go({ date: d })} aria-pressed={d === cursor}
                    aria-label={format(new Date(d + "T00:00:00"), "EEEE, MMMM d")}
                    className={`flex min-h-12 flex-col items-center justify-center rounded-xl text-xs transition-colors active:scale-95 ${shown ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}>
                    <span className="text-[11px] uppercase">{format(new Date(d + "T00:00:00"), "EEEEE")}</span>
                    <span className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold ${isToday ? "bg-primary text-primary-foreground" : ""}`}>
                      {Number(d.slice(8))}
                    </span>
                  </button>
                );
              })}
            </nav>
          )}
          <TimeGridView
            days={Array.from({ length: view === "day" ? 1 : weekDays }, (_, i) => addDays(range.from, i))}
            occurrences={occurrences} onOpen={setSelected} onCreate={openCreate} onShowDay={showDay} tz={tz}
          />
        </>
      )}

      <EventDetailsDialog
        occurrence={selected}
        tz={tz}
        onClose={() => setSelected(null)}
        onEdit={() => { if (selected) { setEditing(selected.event); setDraft(null); setSelected(null); setFormOpen(true); } }}
        onGoToDate={showDay}
      />
      <EventDialog open={formOpen} onOpenChange={setFormOpen} event={editing} draft={draft} tz={tz} />
    </div>
  );
}
