import { useEffect, useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  EVENT_COLORS, RECURRENCE_LABEL, addDays, colorVar, dayIn, diffDays, recurrenceToRule, ruleToRecurrence,
  timeIn, useEventActions, zonedToUtc, type CalEvent, type EventColor, type Recurrence,
} from "@/lib/calendar";

export type EventDraft = { day: string; time?: string; allDay?: boolean };

type Form = {
  title: string; allDay: boolean; startDate: string; startTime: string; endDate: string; endTime: string;
  description: string; location: string; color: EventColor; recurrence: Recurrence;
};

function plusHour(day: string, t: string) {
  const [h = 0, m = 0] = t.split(":").map(Number);
  const total = h * 60 + m + 60;
  const nd = total >= 1440 ? addDays(day, 1) : day;
  const mm = total % 1440;
  return { day: nd, time: `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}` };
}

function initial(event: CalEvent | null, draft: EventDraft | null, tz: string): Form {
  if (event) {
    const s = new Date(event.start_at), e = new Date(event.end_at);
    return {
      title: event.title, allDay: event.all_day,
      startDate: event.all_day ? event.start_at.slice(0, 10) : dayIn(s, tz),
      endDate: event.all_day ? event.end_at.slice(0, 10) : dayIn(e, tz),
      startTime: event.all_day ? "09:00" : timeIn(s, tz), endTime: event.all_day ? "10:00" : timeIn(e, tz),
      description: event.description ?? "", location: event.location ?? "",
      color: (EVENT_COLORS as readonly string[]).includes(event.color) ? (event.color as EventColor) : "blue",
      recurrence: ruleToRecurrence(event.recurrence_rule),
    };
  }
  const day = draft?.day ?? dayIn(new Date(), tz);
  const time = draft?.time ?? "09:00";
  const end = plusHour(day, time);
  return {
    title: "", allDay: !!draft?.allDay, startDate: day, startTime: time, endDate: end.day, endTime: end.time,
    description: "", location: "", color: "blue", recurrence: "none",
  };
}

export function EventDialog({
  open, onOpenChange, event, draft, tz,
}: { open: boolean; onOpenChange: (o: boolean) => void; event: CalEvent | null; draft: EventDraft | null; tz: string }) {
  const { createEvent, updateEvent } = useEventActions();
  const [f, setF] = useState<Form>(() => initial(event, draft, tz));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (open) { setF(initial(event, draft, tz)); setError(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function changeStartDate(v: string) {
    if (!v) return set("startDate", v);
    // Keep the event's length when moving its start date.
    const span = f.startDate && f.endDate ? diffDays(f.startDate, f.endDate) : 0;
    setF((p) => ({ ...p, startDate: v, endDate: addDays(v, Math.max(0, span)) }));
  }

  function validate() {
    if (!f.title.trim()) return "Add a title";
    if (!f.startDate || !f.endDate) return "Choose start and end dates";
    if (f.allDay) return f.endDate < f.startDate ? "End date can't be before the start date" : null;
    if (!f.startTime || !f.endTime) return "Choose start and end times";
    const s = zonedToUtc(f.startDate, f.startTime, tz), e = zonedToUtc(f.endDate, f.endTime, tz);
    if (e <= s) {
      return f.endDate === f.startDate
        ? "End time must be after the start time. For an overnight event, set the end date to the next day."
        : "End must be after the start";
    }
    return null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const err = validate();
    setError(err);
    if (err) return;
    const body = {
      title: f.title.trim(), description: f.description.trim() || null, location: f.location.trim() || null,
      all_day: f.allDay, color: f.color, recurrence_rule: recurrenceToRule(f.recurrence),
      time_zone: event?.time_zone ?? tz,
      start_at: f.allDay ? `${f.startDate}T00:00:00.000Z` : zonedToUtc(f.startDate, f.startTime, tz).toISOString(),
      end_at: f.allDay ? `${f.endDate}T00:00:00.000Z` : zonedToUtc(f.endDate, f.endTime, tz).toISOString(),
    };
    try {
      if (event) await updateEvent.mutateAsync({ id: event.id, body });
      else await createEvent.mutateAsync(body);
      onOpenChange(false);
    } catch {
      /* toast already shown */
    }
  }

  const busy = createEvent.isPending || updateEvent.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{event ? "Edit event" : "New event"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Input autoFocus value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Add title"
            className="h-11 text-base" maxLength={300} aria-label="Title" />

          <div className="flex items-center justify-between">
            <Label htmlFor="ev-allday">All day</Label>
            <Switch id="ev-allday" checked={f.allDay} onCheckedChange={(v) => set("allDay", v)} />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input type="date" aria-label="Start date" value={f.startDate} onChange={(e) => changeStartDate(e.target.value)} />
            {!f.allDay && <Input type="time" aria-label="Start time" className="w-32" value={f.startTime} onChange={(e) => set("startTime", e.target.value)} />}
            <Input type="date" aria-label="End date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} />
            {!f.allDay && <Input type="time" aria-label="End time" className="w-32" value={f.endTime} onChange={(e) => set("endTime", e.target.value)} />}
          </div>

          <Select value={f.recurrence} onValueChange={(v) => set("recurrence", v as Recurrence)}>
            <SelectTrigger aria-label="Repeat"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => (
                <SelectItem key={r} value={r}>{RECURRENCE_LABEL[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {event?.recurrence_rule && (
            <p className="text-xs text-muted-foreground">Changes apply to every occurrence in this series.</p>
          )}

          <Input value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Add location" maxLength={300} aria-label="Location" />
          <Textarea value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Add description" rows={3} aria-label="Description" />

          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Color">
            {EVENT_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={f.color === c} aria-label={c}
                onClick={() => set("color", c)}
                className={cn("flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition",
                  f.color === c && "ring-2 ring-ring")}
                style={{ background: colorVar(c) }}>
                {f.color === c && <Check className="h-4 w-4 text-background" />}
              </button>
            ))}
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{event ? "Save" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
