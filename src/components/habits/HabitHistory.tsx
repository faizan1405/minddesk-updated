import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { colorVar } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { addDays, completionError, dayState, habitStats, scheduleLabel, weekday, type Habit } from "@/lib/habits-shared";

export function HabitHistory({
  habit, today, open, onOpenChange, onToggle,
}: {
  habit: Habit | null; today: string; open: boolean; onOpenChange: (o: boolean) => void;
  onToggle: (date: string, done: boolean) => void;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  if (!habit) return null;
  const s = habitStats(habit, today);
  const first = `${month}-01`;
  const lead = (weekday(first) + 6) % 7; // Monday-first grid
  const [y, m] = month.split("-").map(Number) as [number, number];
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const shift = (n: number) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)); };
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setMonth(today.slice(0, 7)); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: colorVar(habit.color) }} />{habit.title}
          </DialogTitle>
          <DialogDescription>{scheduleLabel(habit.repeat_days)} · tracking since {habit.start_date}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Current streak" value={`${s.current}`} />
          <Stat label="Best streak" value={`${s.best}`} />
          <Stat label="Completion" value={s.percent === null ? "—" : `${s.percent}%`} />
        </div>
        <div className="flex items-center justify-between">
          <Button size="icon" variant="ghost" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-medium">{label}</span>
          <Button size="icon" variant="ghost" aria-label="Next month" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}
          {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
          {Array.from({ length: daysIn }, (_, i) => {
            const date = addDays(first, i);
            const st = dayState(habit, date, today);
            const can = completionError(habit, date, today) === null && date <= today;
            return (
              <button key={date} type="button" disabled={!can} title={`${date}: ${st}`}
                onClick={() => onToggle(date, st !== "done")}
                className={cn("flex aspect-square items-center justify-center rounded-lg text-xs font-medium transition",
                  st === "done" && "text-background",
                  st === "missed" && "bg-destructive/15 text-destructive",
                  st === "pending" && "ring-1 ring-primary text-foreground",
                  (st === "future" || st === "off") && "text-muted-foreground/50",
                  can && "hover:opacity-80", date === today && "font-bold")}
                style={st === "done" ? { background: colorVar(habit.color) } : undefined}>
                {i + 1}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">Tap a past scheduled day to fix a missed check-in. Only scheduled days count toward streaks.</p>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
