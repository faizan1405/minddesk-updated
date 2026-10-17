import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { AlertTriangle, ChevronDown, Lightbulb, RotateCcw, Timer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { colorVar } from "@/lib/calendar";
import {
  DAY_LETTERS, REPEAT_LABEL, daysFor, durationOf, fmtDuration, fmtMinute, inputToMinute, minuteToInput,
  overlapsWith, presetFor, suggestSlots, usePlanActions, type Block, type PlanCategory, type RepeatPreset, type RoutineType,
} from "@/lib/plan";

export type EditorTarget = { mode: "new"; start: number; end: number } | { mode: "edit"; block: Block };

type Form = {
  title: string; categoryId: string | null; start: number; dur: number; description: string;
  preset: RepeatPreset; customDays: number; routine: RoutineType; until: string; scope: "day" | "series";
};

const PX = 1.6; // px per minute in the zoomed timeline
const SNAP = 5;

function initialForm(t: EditorTarget, categories: PlanCategory[]): Form {
  if (t.mode === "new") {
    return {
      title: "", categoryId: categories[0]?.id ?? null, start: t.start, dur: Math.max(SNAP, t.end - t.start), description: "",
      preset: "none", customDays: 0, routine: "fixed", until: "", scope: "series",
    };
  }
  const a = t.block.activity;
  const recurring = a.repeat_days > 0;
  return {
    title: a.title, categoryId: a.category_id, start: t.block.fullStart, dur: durationOf(t.block.fullStart, t.block.fullEnd),
    description: a.description ?? "", preset: presetFor(a.repeat_days, a.start_date), customDays: a.repeat_days,
    routine: a.routine_type, until: a.end_date ?? "", scope: recurring && a.routine_type === "flexible" ? "day" : "series",
  };
}

export function ZoomEditor({
  target, onClose, day, blocks, categories, onFocus,
}: { target: EditorTarget | null; onClose: () => void; day: string; blocks: Block[]; categories: PlanCategory[]; onFocus?: (activityId: string) => void }) {
  const isMobile = useIsMobile();
  const actions = usePlanActions();
  const [form, setForm] = useState<Form | null>(null);
  const initial = useRef<string>("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (target) {
      const f = initialForm(target, categories);
      setForm(f);
      initial.current = JSON.stringify(f);
      setError(null);
      setMore(target.mode === "edit" && (!!target.block.activity.description || target.block.activity.repeat_days > 0));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const editing = target?.mode === "edit" ? target.block : null;
  const activityId = editing?.activity.id;
  const recurring = !!editing && editing.activity.repeat_days > 0;
  const dayOnly = recurring && form?.scope === "day";
  const occurrenceDate = editing?.occurrenceDate ?? day;
  const dirty = !!form && JSON.stringify(form) !== initial.current;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => (p ? { ...p, [k]: v } : p));

  const end = form ? (form.start + form.dur) % 1440 || 1440 : 0;
  const overlaps = useMemo(
    () => (form ? overlapsWith(blocks, form.start, end, activityId) : []),
    [blocks, form, end, activityId],
  );
  const suggestions = useMemo(
    () => (form && overlaps.length ? suggestSlots(blocks, form.dur, form.start, activityId).filter((s) => s.start !== form.start) : []),
    [blocks, form, overlaps.length, activityId],
  );

  function requestClose() {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  // ---------- zoomed timeline drag ----------
  const drag = useRef<{ kind: "move" | "top" | "bottom"; y0: number; start0: number; dur0: number } | null>(null);
  function startDrag(e: RPointerEvent, kind: "move" | "top" | "bottom") {
    if (!form) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, y0: e.clientY, start0: form.start, dur0: form.dur };
  }
  function onDrag(e: RPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const delta = Math.round((e.clientY - d.y0) / PX / SNAP) * SNAP;
    setForm((p) => {
      if (!p) return p;
      if (d.kind === "move") return { ...p, start: Math.min(1439, Math.max(0, d.start0 + delta)) };
      if (d.kind === "bottom") return { ...p, dur: Math.min(1435, Math.max(SNAP, d.dur0 + delta)) };
      const s = Math.min(d.start0 + d.dur0 - SNAP, Math.max(0, d.start0 + delta));
      return { ...p, start: s, dur: d.start0 + d.dur0 - s };
    });
  }
  const endDrag = () => { drag.current = null; };

  if (!form) return null;

  const winStart = Math.max(0, Math.floor((form.start - 60) / 60) * 60);
  const winEnd = Math.max(winStart + 180, Math.ceil((form.start + form.dur + 60) / 60) * 60);
  const others = blocks.filter((b) => b.activity.id !== activityId && b.end > winStart && b.start < winEnd);
  const cat = categories.find((c) => c.id === form.categoryId);

  async function save() {
    if (!form) return;
    if (!form.title.trim()) { setError("Add a title"); return; }
    if (form.dur < SNAP || form.dur >= 1440) { setError("Choose a valid duration"); return; }
    if (form.preset === "custom" && !form.customDays) { setError("Pick at least one day"); return; }
    setError(null);
    const repeatDays = daysFor(form.preset, editing?.activity.start_date ?? day, form.customDays);
    try {
      if (editing && dayOnly) {
        await actions.setException.mutateAsync({ id: editing.activity.id, date: occurrenceDate, body: { cancelled: false, start_minute: form.start, end_minute: end } });
      } else {
        const body = {
          title: form.title.trim(), category_id: form.categoryId, description: form.description.trim() || null,
          start_date: editing?.activity.start_date ?? day, end_date: repeatDays && form.until ? form.until : null,
          start_minute: form.start, end_minute: end, repeat_days: repeatDays, routine_type: form.routine,
        };
        if (editing) await actions.updateActivity.mutateAsync({ id: editing.activity.id, body });
        else await actions.createActivity.mutateAsync(body);
      }
      onClose();
    } catch {
      /* toast shown */
    }
  }

  async function skipDay() {
    if (!editing) return;
    await actions.setException.mutateAsync({ id: editing.activity.id, date: occurrenceDate, body: { cancelled: true } }).catch(() => {});
    onClose();
  }
  async function resetDay() {
    if (!editing) return;
    await actions.clearException.mutateAsync({ id: editing.activity.id, date: occurrenceDate }).catch(() => {});
    onClose();
  }

  const busy = actions.createActivity.isPending || actions.updateActivity.isPending || actions.setException.isPending;

  return (
    <>
      <Sheet open={!!target} onOpenChange={(o) => !o && requestClose()}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn("flex flex-col gap-0 overflow-hidden p-0", isMobile ? "max-h-[92dvh] rounded-t-2xl" : "w-full sm:max-w-md")}
          onInteractOutside={(e) => { if (dirty) { e.preventDefault(); setConfirmDiscard(true); } }}
          onEscapeKeyDown={(e) => { if (dirty) { e.preventDefault(); setConfirmDiscard(true); } }}
        >
          <SheetHeader className="border-b px-5 py-4 text-left">
            <SheetTitle>{editing ? "Edit block" : "Add block"}</SheetTitle>
            <SheetDescription>
              {fmtMinute(form.start)} – {fmtMinute(end)} · {fmtDuration(form.dur)}
              {form.start + form.dur > 1440 && " · ends tomorrow"}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {recurring && (
              <div className="space-y-1.5">
                <Label>This is a repeating routine. Change…</Label>
                <div className="grid grid-cols-2 gap-1 rounded-xl border p-1 text-sm">
                  {(["day", "series"] as const).map((s) => (
                    <button key={s} type="button" onClick={() => set("scope", s)}
                      className={cn("rounded-lg py-1.5 transition-colors", form.scope === s ? "bg-accent font-medium" : "text-muted-foreground")}>
                      {s === "day" ? "This day only" : "Entire routine"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {dayOnly ? "Only the time changes for this day. Name, category and repeat stay as the routine."
                    : "Changes apply to every day of this routine."}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="pl-title">Activity name</Label>
              <Input id="pl-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Website development"
                className="h-11 text-base" maxLength={200} disabled={dayOnly} autoFocus={!editing}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } }} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pl-start">Start time</Label>
                <Input id="pl-start" type="time" step={60} value={minuteToInput(form.start)} className="h-10"
                  onChange={(e) => { const m = inputToMinute(e.target.value); if (m !== null) set("start", m); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pl-end">End time</Label>
                <Input id="pl-end" type="time" step={60} value={minuteToInput(end)} className="h-10"
                  onChange={(e) => { const m = inputToMinute(e.target.value); if (m !== null && m !== form.start) set("dur", durationOf(form.start, m)); }} />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick duration">
              {[30, 60, 120].map((d) => (
                <button key={d} type="button" onClick={() => set("dur", d)} aria-pressed={form.dur === d}
                  className={cn("rounded-full border px-3 py-1 text-xs transition-colors",
                    form.dur === d ? "border-primary bg-primary/15 font-medium text-primary" : "text-muted-foreground hover:text-foreground")}>
                  {d === 30 ? "30 min" : d === 60 ? "1 hour" : "2 hours"}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label>Category</Label>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <button key={c.id} type="button" disabled={dayOnly} onClick={() => set("categoryId", c.id)} aria-pressed={form.categoryId === c.id}
                    className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
                      form.categoryId === c.id ? "border-foreground/60 bg-accent text-foreground" : "text-muted-foreground")}>
                    <span className="h-2 w-2 rounded-full" style={{ background: colorVar(c.color) }} /> {c.name}
                  </button>
                ))}
              </div>
            </div>

            {overlaps.length > 0 && (
              <div className="rounded-xl border border-dashed p-3 text-xs">
                <p className="flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Overlaps with {overlaps.map((b) => b.activity.title).join(", ")}
                </p>
                {suggestions.length > 0 && (
                  <div className="mt-2.5">
                    <p className="mb-1.5 flex items-center gap-2 font-medium"><Lightbulb className="h-3.5 w-3.5 text-primary" /> Free slots that fit {fmtDuration(form.dur)}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((s) => (
                        <button key={s.start} type="button" onClick={() => set("start", s.start)}
                          className="rounded-full border px-2.5 py-1 hover:border-primary hover:text-primary">
                          {fmtMinute(s.start)} – {fmtMinute(s.end)}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-muted-foreground">Picking a slot only changes this form — nothing is saved until you press Save.</p>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-xl border">
              <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more}
                className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium">
                More options
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", more && "rotate-180")} />
              </button>
              {more && (
                <div className="space-y-4 border-t px-3 py-3 animate-in fade-in">
                  <div className="space-y-1.5">
                    <Label>Repeat</Label>
                    <Select value={form.preset} onValueChange={(v) => set("preset", v as RepeatPreset)} disabled={dayOnly}>
                      <SelectTrigger aria-label="Repeat"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(REPEAT_LABEL) as RepeatPreset[]).map((r) => <SelectItem key={r} value={r}>{REPEAT_LABEL[r]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {form.preset === "custom" && !dayOnly && (
                      <div className="flex gap-1">
                        {DAY_LETTERS.map((l, i) => {
                          const on = !!(form.customDays & (1 << i));
                          return (
                            <button key={i} type="button" aria-pressed={on} aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]}
                              onClick={() => set("customDays", form.customDays ^ (1 << i))}
                              className={cn("h-9 w-9 rounded-full border text-xs font-medium", on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}>
                              {l}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {form.preset !== "none" && !dayOnly && (
                      <>
                        <div className="grid grid-cols-2 gap-1 rounded-xl border p-1 text-sm">
                          {(["fixed", "flexible"] as const).map((r) => (
                            <button key={r} type="button" onClick={() => set("routine", r)}
                              className={cn("rounded-lg py-1.5", form.routine === r ? "bg-accent font-medium" : "text-muted-foreground")}>
                              {r === "fixed" ? "Fixed routine" : "Flexible routine"}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {form.routine === "fixed" ? "Same time every time. Edits apply to the whole routine unless you choose this day only."
                            : "A default time you adjust day by day. Edits apply to that day only unless you choose entire routine."}
                        </p>
                        <div className="flex items-center gap-2">
                          <Label htmlFor="pl-until" className="shrink-0 text-xs text-muted-foreground">Ends on (optional)</Label>
                          <Input id="pl-until" type="date" value={form.until} min={editing?.activity.start_date ?? day} onChange={(e) => set("until", e.target.value)} className="h-9" />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="pl-desc">Description</Label>
                    <Textarea id="pl-desc" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Notes (optional)" rows={2} disabled={dayOnly} />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Fine-tune on the timeline</Label>
                    <p className="text-xs text-muted-foreground">Drag the block to move it, or its edges to resize (5-minute steps).</p>
                    <div className="max-h-64 overflow-y-auto rounded-xl border bg-muted/20" aria-label="Zoomed timeline">
                      <div className="relative ml-14 mr-2" style={{ height: (winEnd - winStart) * PX }} onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
                        {Array.from({ length: Math.floor((winEnd - winStart) / 15) + 1 }, (_, i) => {
                          const m = winStart + i * 15;
                          return (
                            <div key={m} className={cn("absolute inset-x-0 border-t", m % 60 === 0 ? "border-border" : "border-border/40")} style={{ top: (m - winStart) * PX }}>
                              {m % 60 === 0 && <span className="absolute -left-14 -top-2 w-12 text-right text-[10px] text-muted-foreground">{fmtMinute(m).replace(":00", "")}</span>}
                            </div>
                          );
                        })}
                        {others.map((b) => (
                          <div key={b.key} className="absolute left-0 right-1/3 truncate rounded-md px-2 py-0.5 text-[11px] text-muted-foreground"
                            style={{ top: (Math.max(b.start, winStart) - winStart) * PX, height: (Math.min(b.end, winEnd) - Math.max(b.start, winStart)) * PX,
                              background: `color-mix(in srgb, ${colorVar(categories.find((c) => c.id === b.activity.category_id)?.color ?? "gray")} 25%, transparent)` }}>
                            {b.activity.title}
                          </div>
                        ))}
                        <div
                          role="slider"
                          aria-label="Drag to move the activity"
                          aria-valuenow={form.start}
                          tabIndex={0}
                          onPointerDown={(e) => startDrag(e, "move")}
                          className="absolute left-1/4 right-0 z-10 cursor-grab touch-none rounded-lg px-2 text-xs font-medium shadow-md ring-2 ring-ring active:cursor-grabbing"
                          style={{ top: (form.start - winStart) * PX, height: Math.max(form.dur * PX, 18), background: `color-mix(in srgb, ${colorVar(cat?.color ?? "gray")} 70%, var(--card))` }}
                        >
                          <div onPointerDown={(e) => startDrag(e, "top")} className="absolute inset-x-0 -top-1.5 h-3 cursor-ns-resize touch-none" aria-label="Drag to change start" />
                          <div className="truncate pt-1">{form.title || "New block"}</div>
                          <div onPointerDown={(e) => startDrag(e, "bottom")} className="absolute inset-x-0 -bottom-1.5 flex h-4 cursor-ns-resize touch-none justify-center" aria-label="Drag to change duration">
                            <span className="mt-1 h-1 w-8 rounded-full bg-foreground/50" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
            {editing && (recurring ? (
              <>
                <Button variant="ghost" size="sm" onClick={skipDay}>Skip this day</Button>
                {editing.modified && <Button variant="ghost" size="sm" className="gap-1.5" onClick={resetDay}><RotateCcw className="h-3.5 w-3.5" />Restore day</Button>}
                <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> Routine
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            ))}
            {editing && onFocus && (
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => { const id = editing.activity.id; onClose(); onFocus(id); }}>
                <Timer className="h-3.5 w-3.5" /> Focus
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={requestClose}>Cancel</Button>
            <Button size="sm" className="rounded-full px-4" onClick={save} disabled={busy}>Save block</Button>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} title="Discard changes?"
        description="Your edits to this activity haven't been saved." confirmLabel="Discard"
        onConfirm={() => { setConfirmDiscard(false); onClose(); }} />
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete}
        title={recurring ? "Delete this whole routine?" : "Delete this activity?"}
        description={recurring ? "It will be removed from every day. To remove just this day, use Skip this day." : "This can't be undone."}
        onConfirm={async () => {
          if (editing) await actions.deleteActivity.mutateAsync(editing.activity.id).catch(() => {});
          setConfirmDelete(false); onClose();
        }} />
    </>
  );
}
