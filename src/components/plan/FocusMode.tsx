import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { colorVar } from "@/lib/calendar";
import { playChime, useSettings } from "@/hooks/use-settings";
import { fmtMinute, useFocusSessions, usePlanActions, type Block, type PlanCategory } from "@/lib/plan";

type Phase = "focus" | "break";
type Timer = {
  phase: Phase; totalMs: number;
  endsAt: number | null; // running: wall-clock deadline; paused: null
  remainingMs: number; // authoritative while paused
  focusedMs: number; // focus time accumulated before the current run segment
  runStartedAt: number | null; sessionStartedAt: number | null;
};

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Pomodoro timer. Remaining time is always derived from Date.now() and a stored deadline,
 * so it stays correct when the tab is hidden or the browser throttles timers.
 */
export function FocusMode({
  open, onOpenChange, blocks, categories, day, initialActivityId,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; blocks: Block[]; categories: PlanCategory[]; day: string; initialActivityId: string | null;
}) {
  const { saveFocusSession } = usePlanActions();
  const sessions = useFocusSessions(day);
  const [activityId, setActivityId] = useState<string>("none");
  const prefs = useSettings();
  const [focusMin, setFocusMin] = useState(prefs.focus_minutes);
  const [breakMin, setBreakMin] = useState(prefs.short_break_minutes);
  const longMin = prefs.long_break_minutes;
  const [t, setT] = useState<Timer>(() => idle(prefs.focus_minutes));
  const [cycles, setCycles] = useState(0); // completed focus sessions since opening; every 4th earns a long break
  const [longBreak, setLongBreak] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [, force] = useState(0);
  const tRef = useRef(t);
  tRef.current = t;

  function idle(min: number): Timer {
    return { phase: "focus", totalMs: min * 60_000, endsAt: null, remainingMs: min * 60_000, focusedMs: 0, runStartedAt: null, sessionStartedAt: null };
  }

  useEffect(() => {
    if (open) setActivityId(initialActivityId ?? "none");
  }, [open, initialActivityId]);

  const unique = Array.from(new Map(blocks.map((b) => [b.activity.id, b])).values());
  const activity = unique.find((b) => b.activity.id === activityId)?.activity ?? null;
  const cat = categories.find((c) => c.id === activity?.category_id);
  const title = activity?.title ?? "Focus session";

  const running = t.endsAt !== null;
  const remaining = running ? t.endsAt! - Date.now() : t.remainingMs;
  const started = t.sessionStartedAt !== null;

  // Re-render a few times per second while running; also recompute when the tab becomes visible.
  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => force((n) => n + 1), 250);
    const vis = () => force((n) => n + 1);
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", vis); };
  }, [running]);

  function record(completed: boolean, focusedMs: number, startedAt: number) {
    if (focusedMs < 60_000 && !completed) return; // ignore sessions under a minute
    saveFocusSession.mutate({
      activity_id: activity?.id ?? null, title, date: day, planned_minutes: focusMin,
      focused_seconds: Math.round(focusedMs / 1000), completed,
      started_at: new Date(startedAt).toISOString(), ended_at: new Date().toISOString(),
    });
  }

  // Phase transitions when the deadline passes.
  useEffect(() => {
    if (!running || remaining > 0) return;
    const cur = tRef.current;
    if (cur.phase === "focus") {
      record(true, cur.focusedMs + ((cur.endsAt ?? Date.now()) - (cur.runStartedAt ?? Date.now())), cur.sessionStartedAt ?? Date.now());
      const n = cycles + 1;
      const isLong = n % 4 === 0;
      setCycles(n); setLongBreak(isLong);
      const ms = (isLong ? longMin : breakMin) * 60_000;
      const now = Date.now();
      setT(prefs.auto_start
        ? { phase: "break", totalMs: ms, endsAt: now + ms, remainingMs: ms, focusedMs: 0, runStartedAt: now, sessionStartedAt: now }
        : { phase: "break", totalMs: ms, endsAt: null, remainingMs: ms, focusedMs: 0, runStartedAt: null, sessionStartedAt: null });
      announce("Focus session complete — time for a break.");
    } else {
      const next = idle(focusMin);
      const now = Date.now();
      setT(prefs.auto_start ? { ...next, endsAt: now + next.remainingMs, runStartedAt: now, sessionStartedAt: now } : next);
      announce("Break over — ready to focus.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  function announce(msg: string) {
    setNotice(msg);
    if (prefs.sound && prefs.volume > 0) playChime(prefs.volume);
    setTimeout(() => setNotice((m) => (m === msg ? null : m)), 8000);
  }

  function start() {
    const now = Date.now();
    setT((p) => ({ ...p, endsAt: now + p.remainingMs, runStartedAt: now, sessionStartedAt: p.sessionStartedAt ?? now }));
  }
  function pause() {
    const now = Date.now();
    setT((p) => ({
      ...p, endsAt: null, remainingMs: Math.max(0, (p.endsAt ?? now) - now), runStartedAt: null,
      focusedMs: p.phase === "focus" ? p.focusedMs + (now - (p.runStartedAt ?? now)) : p.focusedMs,
    }));
  }
  const focusedSoFar = () => t.focusedMs + (running && t.phase === "focus" ? Date.now() - (t.runStartedAt ?? Date.now()) : 0);
  function end() {
    if (t.phase === "focus" && t.sessionStartedAt) record(false, focusedSoFar(), t.sessionStartedAt);
    setT(idle(focusMin));
  }
  function reset() { setT(idle(t.phase === "focus" ? focusMin : breakMin)); }

  const progress = 1 - Math.max(0, remaining) / t.totalMs;
  const R = 110, C = 2 * Math.PI * R;
  const doneToday = (sessions.data ?? []).filter((s) => s.completed).length;
  const focusedToday = Math.round((sessions.data ?? []).reduce((n, s) => n + s.focused_seconds, 0) / 60);

  function close(o: boolean) {
    if (!o && started && t.phase === "focus") record(false, focusedSoFar(), t.sessionStartedAt!);
    if (!o) setT(idle(focusMin));
    onOpenChange(o);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex h-[100dvh] max-w-none flex-col items-center justify-center gap-0 rounded-none border-0 p-4 sm:h-[100dvh] sm:max-w-none sm:rounded-none [&>button:last-child]:hidden">
        <button type="button" onClick={() => close(false)} aria-label="Close focus mode"
          className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
        <DialogTitle className="sr-only">Focus mode</DialogTitle>
        <DialogDescription className="sr-only">Pomodoro timer for a planned activity</DialogDescription>

        <div className="flex w-full max-w-sm flex-col items-center">
          <p className={cn("mb-2 text-xs font-medium uppercase tracking-[0.2em]", t.phase === "focus" ? "text-primary" : "text-muted-foreground")}>
            {t.phase === "focus" ? "Focus" : "Break"}
          </p>
          <div className="mb-6 flex max-w-full items-center gap-2">
            {cat && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorVar(cat.color) }} />}
            <h2 className="truncate text-lg font-semibold tracking-tight">{t.phase === "focus" ? title : longBreak ? "Take a long break" : "Take a short break"}</h2>
          </div>

          <p role="status" aria-live="polite" className={cn("mb-4 min-h-5 rounded-full px-3 text-center text-sm font-medium", notice && "bg-primary/15 py-1 text-primary")}>
            {notice ?? ""}
          </p>
          <div className="relative mb-8 h-64 w-64">
            <svg viewBox="0 0 240 240" className="h-full w-full -rotate-90">
              <circle cx="120" cy="120" r={R} fill="none" stroke="var(--border)" strokeWidth="6" />
              <circle cx="120" cy="120" r={R} fill="none" stroke={t.phase === "focus" ? "var(--primary)" : "var(--event-teal)"} strokeWidth="6"
                strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} className="transition-[stroke-dashoffset] duration-300" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-6xl font-medium tabular-nums tracking-tight" aria-live="off" aria-label="Remaining time">{fmt(remaining)}</span>
              <span className="mt-1 text-xs text-muted-foreground">{running ? "running" : started ? "paused" : "ready"}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" className="h-12 w-12 rounded-full" onClick={reset} aria-label="Reset timer"><RotateCcw className="h-5 w-5" /></Button>
            {running ? (
              <Button size="icon" className="h-16 w-16 rounded-full" onClick={pause} aria-label="Pause"><Pause className="h-7 w-7" /></Button>
            ) : (
              <Button size="icon" className="h-16 w-16 rounded-full" onClick={start} aria-label={started ? "Resume" : "Start"}><Play className="ml-1 h-7 w-7" /></Button>
            )}
            <Button variant="outline" size="icon" className="h-12 w-12 rounded-full" onClick={end} disabled={!started} aria-label="End session"><Square className="h-4 w-4" /></Button>
          </div>

          {!started && (
            <div className="mt-8 w-full space-y-3 rounded-2xl border bg-card/60 p-4">
              <Select value={activityId} onValueChange={setActivityId}>
                <SelectTrigger aria-label="Activity"><SelectValue placeholder="Choose an activity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No activity (free focus)</SelectItem>
                  {unique.map((b) => (
                    <SelectItem key={b.activity.id} value={b.activity.id}>{b.activity.title} · {fmtMinute(b.fullStart)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="fm-focus" className="text-xs text-muted-foreground">Focus (min)</Label>
                  <Input id="fm-focus" type="number" inputMode="numeric" min={1} max={240} value={focusMin}
                    onChange={(e) => { const v = Math.min(240, Math.max(1, Number(e.target.value) || 1)); setFocusMin(v); if (t.phase === "focus") setT(idle(v)); }} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fm-break" className="text-xs text-muted-foreground">Break (min)</Label>
                  <Input id="fm-break" type="number" inputMode="numeric" min={1} max={60} value={breakMin}
                    onChange={(e) => setBreakMin(Math.min(60, Math.max(1, Number(e.target.value) || 1)))} />
                </div>
              </div>
            </div>
          )}

          <p className="mt-6 text-xs text-muted-foreground">
            Today: {doneToday} completed session{doneToday === 1 ? "" : "s"} · {focusedToday} min focused
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
