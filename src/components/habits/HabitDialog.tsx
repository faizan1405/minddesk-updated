import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { colorVar } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import {
  ALL_DAYS, DAY_SHORT, HABIT_COLORS, WEEKDAYS, WEEKENDS, presetOf,
  type Habit, type HabitColor, type Routine,
} from "@/lib/habits-shared";

export type HabitForm = { title: string; description: string | null; color: HabitColor; repeat_days: number; routine_id: string | null };

export function HabitDialog({
  open, onOpenChange, habit, routines, defaultRoutine = null, onSubmit,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; habit?: Habit | null; routines: Routine[];
  defaultRoutine?: string | null; onSubmit: (v: HabitForm) => Promise<unknown>;
}) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [color, setColor] = useState<HabitColor>("blue");
  const [days, setDays] = useState(ALL_DAYS);
  const [routine, setRoutine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(habit?.title ?? ""); setDesc(habit?.description ?? ""); setColor(habit?.color ?? "blue");
    setDays(habit?.repeat_days ?? ALL_DAYS); setRoutine(habit ? habit.routine_id : defaultRoutine);
  }, [open, habit, defaultRoutine]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !days) return;
    setBusy(true);
    try {
      await onSubmit({ title: title.trim(), description: desc.trim() || null, color, repeat_days: days, routine_id: routine });
      onOpenChange(false);
    } catch { /* toast shown by mutation */ } finally { setBusy(false); }
  }

  const preset = presetOf(days);
  const presets: [string, number][] = [["Every day", ALL_DAYS], ["Weekdays", WEEKDAYS], ["Weekends", WEEKENDS]];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader><DialogTitle>{habit ? "Edit habit" : "New habit"}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="habit-title">Name</Label>
            <Input id="habit-title" autoFocus value={title} maxLength={200} placeholder="e.g. Drink water"
              onChange={(e) => setTitle(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="habit-desc">Description (optional)</Label>
            <Textarea id="habit-desc" value={desc} maxLength={2000} rows={2} onChange={(e) => setDesc(e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label>Repeat</Label>
            <div className="flex flex-wrap gap-2">
              {presets.map(([l, v]) => (
                <Button key={l} type="button" size="sm" variant={days === v ? "default" : "outline"} className="rounded-full" onClick={() => setDays(v)}>{l}</Button>
              ))}
              <span className={cn("self-center text-xs", preset === "custom" ? "text-foreground" : "text-muted-foreground")}>or pick days:</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const on = (days & (1 << d)) !== 0;
                return (
                  <button key={d} type="button" aria-pressed={on} aria-label={DAY_SHORT[d]}
                    onClick={() => setDays(days ^ (1 << d))}
                    className={cn("h-10 rounded-lg border text-xs font-medium transition-colors",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent")}>
                    {DAY_SHORT[d]!.slice(0, 2)}
                  </button>
                );
              })}
            </div>
            {!days && <p className="text-xs text-destructive">Pick at least one day</p>}
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {HABIT_COLORS.map((c) => (
                <button key={c} type="button" aria-label={c} aria-pressed={color === c} onClick={() => setColor(c)}
                  className={cn("h-9 w-9 rounded-full ring-offset-2 ring-offset-background transition", color === c && "ring-2 ring-foreground")}
                  style={{ background: colorVar(c) }} />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="habit-routine">Routine</Label>
            <select id="habit-routine" value={routine ?? ""} onChange={(e) => setRoutine(e.target.value || null)}
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm">
              <option value="">No routine</option>
              {routines.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !title.trim() || !days}>{habit ? "Save" : "Add habit"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
