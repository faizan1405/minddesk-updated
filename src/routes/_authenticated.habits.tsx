import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDown, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, Flame, History, MoreHorizontal, Pencil, Plus, Trash2, FolderPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { TextPromptDialog } from "@/components/app/TextPromptDialog";
import { LoadingState } from "@/components/app/PageStates";
import { HabitDialog } from "@/components/habits/HabitDialog";
import { HabitHistory } from "@/components/habits/HabitHistory";
import { colorVar } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import {
  addDays, habitStats, isScheduled, progressOf, scheduleLabel, todayIn, useHabitActions, useHabitsData, useSaveState,
  type Habit, type Routine,
} from "@/lib/habits";

export const Route = createFileRoute("/_authenticated/habits")({
  head: () => ({
    meta: [
      { title: "Habits & Routines — MindDesk" },
      { name: "description", content: "Track the habits and routines that shape your days." },
      { property: "og:title", content: "Habits & Routines — MindDesk" },
      { property: "og:description", content: "Track the habits and routines that shape your days." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HabitsPage,
});

function HabitsPage() {
  const q = useHabitsData();
  const a = useHabitActions();
  const save = useSaveState();
  const today = todayIn();
  const [date, setDate] = useState(today);
  const [habitDlg, setHabitDlg] = useState<{ habit: Habit | null; routine: string | null } | null>(null);
  const [routineDlg, setRoutineDlg] = useState<{ routine: Routine | null } | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "habit" | "routine"; id: string; title: string } | null>(null);

  const habits = q.data?.habits ?? [];
  const routines = q.data?.routines ?? [];
  const groups = useMemo(() => {
    const by = (rid: string | null) => habits.filter((h) => h.routine_id === rid).sort((x, y) => x.position - y.position);
    return { loose: by(null), routines: routines.map((r) => ({ routine: r, habits: by(r.id) })) };
  }, [habits, routines]);

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return (
    <div className="mx-auto mt-16 max-w-sm text-center">
      <p className="font-medium">Couldn't load your habits</p>
      <p className="mt-1 text-sm text-muted-foreground">{q.error.message}</p>
      <Button className="mt-4" variant="outline" onClick={() => q.refetch()}>Try again</Button>
    </div>
  );

  const prog = progressOf(habits, date);
  const dateLabel = new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const rel = date === today ? "Today" : date === addDays(today, -1) ? "Yesterday" : date === addDays(today, 1) ? "Tomorrow" : null;
  const historyHabit = habits.find((h) => h.id === historyId) ?? null;

  const move = (list: Habit[], rid: string | null, i: number, dir: -1 | 1) => {
    const ids = list.map((h) => h.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    a.reorder.mutate({ routine_id: rid, habit_ids: ids });
  };

  const renderHabit = (h: Habit, list: Habit[], i: number, rid: string | null) => (
    <HabitRow key={h.id} habit={h} date={date} today={today}
      onToggle={(done) => a.setDone(h.id, date, done)}
      onEdit={() => setHabitDlg({ habit: h, routine: h.routine_id })}
      onHistory={() => setHistoryId(h.id)}
      onDelete={() => setConfirm({ kind: "habit", id: h.id, title: h.title })}
      onUp={i > 0 ? () => move(list, rid, i, -1) : undefined}
      onDown={i < list.length - 1 ? () => move(list, rid, i, 1) : undefined} />
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Habits & Routines</h1>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {save === "saving" ? "Saving…" : save === "saved" ? "Saved" : save === "error" ? "Some changes failed to save" : "\u00a0"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 rounded-full" onClick={() => setRoutineDlg({ routine: null })}>
            <FolderPlus className="h-4 w-4" /> Routine
          </Button>
          <Button className="gap-2 rounded-full" onClick={() => setHabitDlg({ habit: null, routine: null })}>
            <Plus className="h-4 w-4" /> Habit
          </Button>
        </div>
      </header>

      <section className="mt-5 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <Button size="icon" variant="ghost" className="h-10 w-10" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}><ChevronLeft className="h-5 w-5" /></Button>
          <div className="text-center">
            <div className="font-medium">{rel ?? dateLabel}</div>
            {rel && <div className="text-xs text-muted-foreground">{dateLabel}</div>}
          </div>
          <Button size="icon" variant="ghost" className="h-10 w-10" aria-label="Next day" disabled={date >= addDays(today, 1)} onClick={() => setDate(addDays(date, 1))}><ChevronRight className="h-5 w-5" /></Button>
        </div>
        <div className="mt-3">
          {prog.percent === null ? (
            <p className="text-center text-sm text-muted-foreground">Nothing scheduled for this day</p>
          ) : (
            <>
              <div className="mb-1.5 flex justify-between text-sm">
                <span>{prog.done} of {prog.total} done</span><span className="font-medium">{prog.percent}%</span>
              </div>
              <Progress value={prog.percent} className="h-2" />
            </>
          )}
        </div>
        {date !== today && <div className="mt-2 text-center"><Button variant="link" size="sm" onClick={() => setDate(today)}>Back to today</Button></div>}
      </section>

      {habits.length === 0 && routines.length === 0 ? (
        <div className="mx-auto mt-16 max-w-sm text-center">
          <h2 className="text-lg font-semibold">No habits yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Add a habit to start tracking, or group habits into a routine.</p>
          <Button className="mt-5 gap-2 rounded-full" onClick={() => setHabitDlg({ habit: null, routine: null })}><Plus className="h-4 w-4" /> Add your first habit</Button>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {groups.routines.map(({ routine: r, habits: list }) => {
            const p = progressOf(list, date);
            return (
              <section key={r.id} className="rounded-2xl border border-border bg-card">
                <div className="flex items-center gap-2 p-3">
                  <button type="button" aria-expanded={!r.collapsed} aria-label={r.collapsed ? "Expand routine" : "Collapse routine"}
                    onClick={() => a.updateRoutine.mutate({ id: r.id, collapsed: !r.collapsed })}
                    className="flex h-10 min-w-0 flex-1 items-center gap-2 text-left">
                    <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", r.collapsed && "-rotate-90")} />
                    <span className="truncate font-medium">{r.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {p.percent === null ? "nothing scheduled" : `${p.done}/${p.total} · ${p.percent}%`}
                    </span>
                  </button>
                  <Button size="icon" variant="ghost" className="h-10 w-10" aria-label={`Add habit to ${r.title}`} onClick={() => setHabitDlg({ habit: null, routine: r.id })}><Plus className="h-4 w-4" /></Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-10 w-10" aria-label="Routine options"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setRoutineDlg({ routine: r })}><Pencil className="mr-2 h-4 w-4" />Rename</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => setConfirm({ kind: "routine", id: r.id, title: r.title })}><Trash2 className="mr-2 h-4 w-4" />Delete routine</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {p.percent !== null && <Progress value={p.percent} className="mx-3 mb-2 h-1 w-auto" />}
                {!r.collapsed && (
                  <div className="space-y-1 px-2 pb-2">
                    {list.length === 0 ? <p className="px-2 py-3 text-sm text-muted-foreground">No habits in this routine yet.</p>
                      : list.map((h, i) => renderHabit(h, list, i, r.id))}
                  </div>
                )}
              </section>
            );
          })}
          {groups.loose.length > 0 && (
            <section>
              {groups.routines.length > 0 && <h2 className="mb-2 px-1 text-sm font-medium text-muted-foreground">Other habits</h2>}
              <div className="space-y-1 rounded-2xl border border-border bg-card p-2">
                {groups.loose.map((h, i) => renderHabit(h, groups.loose, i, null))}
              </div>
            </section>
          )}
        </div>
      )}

      <HabitDialog open={!!habitDlg} onOpenChange={(o) => !o && setHabitDlg(null)} habit={habitDlg?.habit ?? null} routines={routines}
        defaultRoutine={habitDlg?.routine ?? null}
        onSubmit={(v) => habitDlg?.habit ? a.updateHabit.mutateAsync({ id: habitDlg.habit.id, ...v }) : a.createHabit.mutateAsync(v)} />
      <TextPromptDialog open={!!routineDlg} onOpenChange={(o) => !o && setRoutineDlg(null)}
        title={routineDlg?.routine ? "Rename routine" : "New routine"} placeholder="e.g. Morning routine"
        initial={routineDlg?.routine?.title ?? ""} confirmLabel={routineDlg?.routine ? "Save" : "Create"}
        onSubmit={(v) => routineDlg?.routine ? a.updateRoutine.mutateAsync({ id: routineDlg.routine.id, title: v }) : a.createRoutine.mutateAsync(v)} />
      <HabitHistory habit={historyHabit} today={today} open={!!historyHabit} onOpenChange={(o) => !o && setHistoryId(null)}
        onToggle={(d, done) => historyHabit && a.setDone(historyHabit.id, d, done)} />
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === "routine" ? `Delete routine "${confirm.title}"?` : `Delete habit "${confirm?.title}"?`}
        description={confirm?.kind === "routine" ? "Its habits and their history are kept and moved to Other habits." : "This removes the habit and its check-in history."}
        onConfirm={() => { if (!confirm) return; (confirm.kind === "routine" ? a.deleteRoutine : a.deleteHabit).mutate(confirm.id); setConfirm(null); }} />
    </div>
  );
}

function HabitRow({
  habit: h, date, today, onToggle, onEdit, onHistory, onDelete, onUp, onDown,
}: {
  habit: Habit; date: string; today: string; onToggle: (done: boolean) => void; onEdit: () => void;
  onHistory: () => void; onDelete: () => void; onUp?: (() => void) | undefined; onDown?: (() => void) | undefined;
}) {
  const scheduled = isScheduled(h, date);
  const done = h.completions.includes(date);
  const canCheck = scheduled && date <= today;
  const s = habitStats(h, today);
  return (
    <div className={cn("flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-accent/40", !scheduled && "opacity-50")}>
      <button type="button" role="checkbox" aria-checked={done} aria-label={`Mark ${h.title} ${done ? "not done" : "done"}`}
        disabled={!canCheck} onClick={() => onToggle(!done)}
        className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition", !canCheck && "cursor-not-allowed")}
        style={{ borderColor: colorVar(h.color), background: done ? colorVar(h.color) : "transparent" }}>
        {done && <Check className="h-5 w-5 text-background" strokeWidth={3} />}
      </button>
      <button type="button" onClick={onHistory} className="min-w-0 flex-1 text-left">
        <div className={cn("truncate font-medium", done && "text-muted-foreground line-through")}>{h.title}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{scheduled ? scheduleLabel(h.repeat_days) : "Not scheduled this day"}</span>
          {s.current > 0 && <span className="flex shrink-0 items-center gap-0.5"><Flame className="h-3 w-3" />{s.current}</span>}
        </div>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-10 w-10 shrink-0" aria-label={`Options for ${h.title}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onHistory}><History className="mr-2 h-4 w-4" />History & streaks</DropdownMenuItem>
          <DropdownMenuItem onClick={onEdit}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
          {onUp && <DropdownMenuItem onClick={onUp}><ArrowUp className="mr-2 h-4 w-4" />Move up</DropdownMenuItem>}
          {onDown && <DropdownMenuItem onClick={onDown}><ArrowDown className="mr-2 h-4 w-4" />Move down</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={onDelete}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
