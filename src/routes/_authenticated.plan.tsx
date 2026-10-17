import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Clock, MousePointerClick, Plus, Repeat, Tags, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/app/PageStates";
import { DayMap } from "@/components/plan/DayMap";
import { ZoomEditor, type EditorTarget } from "@/components/plan/ZoomEditor";
import { FocusMode } from "@/components/plan/FocusMode";
import { CategoryManager } from "@/components/plan/CategoryManager";
import { colorVar } from "@/lib/calendar";
import {
  addDaysKey, blocksForDay, durationOf, fmtDuration, fmtMinute, freeGaps, localToday, nowMinute, repeatSummary, suggestSlots,
  usePlanActivities, usePlanCategories, type Block,
} from "@/lib/plan";

export const Route = createFileRoute("/_authenticated/plan")({
  validateSearch: (s: Record<string, unknown>): { date?: string | undefined } => {
    const d = s["date"];
    return { date: typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined };
  },
  head: () => ({
    meta: [
      { title: "Plan Your Day — MindDesk" },
      { name: "description", content: "A 24-hour planner with time blocking and focus sessions." },
      { property: "og:title", content: "Plan Your Day — MindDesk" },
      { property: "og:description", content: "A 24-hour planner with time blocking and focus sessions." },
    ],
  }),
  component: PlanPage,
});

const keyDate = (k: string) => {
  const [y = 0, m = 1, d = 1] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};

function PlanPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/plan" });
  const today = localToday();
  const day = search.date ?? today;
  const go = (date: string) => navigate({ search: { date: date === today ? undefined : date }, replace: true });

  const categories = usePlanCategories();
  const activities = usePlanActivities(day, day);
  const blocks = useMemo(() => (activities.data ? blocksForDay(activities.data, day) : []), [activities.data, day]);

  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const [focusActivity, setFocusActivity] = useState<string | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const [rangeMode, setRangeMode] = useState(false);

  const cats = categories.data ?? [];
  const catOf = (id: string | null) => cats.find((c) => c.id === id);
  const scheduled = 1440 - freeGaps(blocks).reduce((n, [s, e]) => n + (e - s), 0); // overlaps not double-counted
  const gaps = freeGaps(blocks).filter(([s, e]) => e - s >= 30);

  function quickCreate() {
    // Suggest the first free hour from now (today) or from 9 AM (other days), based on what's scheduled.
    const from = day === today ? nowMinute() : 9 * 60;
    const slot = suggestSlots(blocks, 60, from, undefined, day === today ? from : 0, 1)[0] ?? suggestSlots(blocks, 30, from, undefined, 0, 1)[0];
    const start = slot?.start ?? Math.ceil(from / 30) * 30 % 1440;
    setTarget({ mode: "new", start, end: Math.min(1440, start + (slot ? slot.end - slot.start : 60)) });
  }
  const openFocus = (id: string | null) => { setFocusActivity(id); setFocusOpen(true); };

  const loading = categories.isPending || activities.isPending;
  const error = categories.error ?? activities.error;

  return (
    <div className="mx-auto max-w-5xl px-3 pb-24 pt-4 md:px-8 md:pt-6">
      <header className="mb-5 space-y-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Plan your day · {day === today ? "Today" : format(keyDate(day), "EEEE")}</p>
            <h1 className="truncate text-xl font-semibold tracking-tight md:text-2xl">{format(keyDate(day), "MMMM d, yyyy")}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => go(today)} disabled={day === today}>Today</Button>
            <Button variant="ghost" size="icon" aria-label="Previous day" onClick={() => go(addDaysKey(day, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" aria-label="Next day" onClick={() => go(addDaysKey(day, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto flex w-full items-center gap-2 text-xs sm:w-auto">
            <span className="rounded-full bg-muted px-2.5 py-1"><span className="font-semibold text-foreground">{fmtDuration(scheduled)}</span> <span className="text-muted-foreground">planned</span></span>
            <span className="rounded-full bg-muted px-2.5 py-1"><span className="font-semibold text-foreground">{fmtDuration(Math.max(0, 1440 - scheduled))}</span> <span className="text-muted-foreground">open</span></span>
          </div>
          <Button variant="ghost" size="sm" className="gap-1.5" aria-pressed={rangeMode} onClick={() => setRangeMode((m) => !m)} disabled={loading}>
            <MousePointerClick className="h-4 w-4" /> {rangeMode ? "Cancel range" : "Select range"}
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setCatsOpen(true)}><Tags className="h-4 w-4" /><span className="hidden sm:inline">Categories</span></Button>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => openFocus(null)}><Timer className="h-4 w-4" /><span className="hidden sm:inline">Focus</span></Button>
          <Button size="sm" className="gap-1.5 rounded-full px-4 shadow-sm" onClick={quickCreate} disabled={loading}><Plus className="h-4 w-4" /> Add block</Button>
        </div>
      </header>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <div className="mx-auto mt-16 max-w-sm text-center">
          <p className="font-medium">Couldn't load your plan</p>
          <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
          <Button className="mt-4" variant="outline" onClick={() => { categories.refetch(); activities.refetch(); }}>Try again</Button>
        </div>
      ) : (
        <>
          <section className="rounded-2xl border bg-card p-3 shadow-sm md:p-5" aria-label="Day map">
            <p className="mb-3 text-xs text-muted-foreground">Tap an empty half-hour to add a block · tap a block to edit it</p>
            <DayMap
              blocks={blocks} categories={cats} isToday={day === today}
              rangeMode={rangeMode} onCancelRange={() => setRangeMode(false)}
              onPickRange={(start, end) => { setRangeMode(false); setTarget({ mode: "new", start, end }); }}
              onOpenBlock={(block) => setTarget({ mode: "edit", block })}
            />
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-3">
              {cats.map((c) => (
                <span key={c.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ background: colorVar(c.color) }} /> {c.name}
                </span>
              ))}
            </div>
          </section>

          <div className="mt-6 grid gap-6 md:grid-cols-[1fr_16rem]">
            <section aria-label="Schedule">
              <h2 className="mb-2 text-sm font-semibold">Schedule</h2>
              {blocks.length === 0 ? (
                <div className="rounded-2xl border border-dashed px-4 py-10 text-center">
                  <Clock className="mx-auto mb-3 h-5 w-5 text-primary" />
                  <p className="font-medium">Your day is wide open</p>
                  <p className="mt-1 text-sm text-muted-foreground">Tap a half-hour on the map above or use Add block.</p>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {blocks.map((b) => <ScheduleItem key={b.key} b={b} color={catOf(b.activity.category_id)?.color ?? "gray"}
                    category={catOf(b.activity.category_id)?.name ?? "Uncategorised"}
                    onOpen={() => setTarget({ mode: "edit", block: b })} onFocus={() => openFocus(b.activity.id)} />)}
                </ul>
              )}
            </section>
            <aside aria-label="Open time">
              <h2 className="mb-2 text-sm font-semibold">Open time</h2>
              {gaps.length === 0 ? (
                <p className="text-sm text-muted-foreground">No gaps of 30 minutes or more.</p>
              ) : (
                <ul className="space-y-1">
                  {gaps.map(([s, e]) => (
                    <li key={s}>
                      <button type="button" onClick={() => setTarget({ mode: "new", start: s, end: e === 1440 && s === 0 ? 60 : e })}
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent">
                        <span>{fmtMinute(s)} – {fmtMinute(e)}</span>
                        <span className="text-xs text-muted-foreground">{fmtDuration(e - s)} free</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        </>
      )}

      <ZoomEditor target={target} onClose={() => setTarget(null)} day={day} blocks={blocks} categories={cats} onFocus={openFocus} />
      <FocusMode open={focusOpen} onOpenChange={setFocusOpen} blocks={blocks} categories={cats} day={day} initialActivityId={focusActivity} />
      <CategoryManager open={catsOpen} onOpenChange={setCatsOpen} categories={cats} />
    </div>
  );
}

function ScheduleItem({ b, color, category, onOpen, onFocus }: { b: Block; color: string; category: string; onOpen: () => void; onFocus: () => void }) {
  const a = b.activity;
  return (
    <li className="group flex items-stretch gap-1 rounded-xl border bg-card transition-colors hover:border-foreground/20">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left">
        <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: colorVar(color) }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{a.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>{fmtMinute(b.fullStart)} – {fmtMinute(b.fullEnd)} · {fmtDuration(durationOf(b.fullStart, b.fullEnd))}</span>
            {b.continued === "from-yesterday" && <span>(from yesterday)</span>}
            {b.continued === "into-tomorrow" && <span>(ends tomorrow)</span>}
            <span>· {category}</span>
            {a.repeat_days > 0 && (
              <span className="flex items-center gap-1"><Repeat className="h-3 w-3" />{repeatSummary(a)}{a.routine_type === "flexible" ? " · flexible" : ""}</span>
            )}
            {b.modified && <span className="text-primary">· changed today</span>}
          </span>
        </span>
      </button>
      <button type="button" onClick={onFocus} aria-label={`Focus on ${a.title}`}
        className="flex shrink-0 items-center px-3 text-muted-foreground hover:text-primary">
        <Timer className="h-4 w-4" />
      </button>
    </li>
  );
}
