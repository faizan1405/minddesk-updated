import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, Download, Loader2, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { displayNameOf, initialsOf, meKey, useAuth, type AuthUser } from "@/hooks/use-auth";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { DisplayName, START_PAGES, START_PAGE_LABEL, isTimeZone, type Settings } from "@/lib/settings-shared";
import { formatTime } from "@/lib/calendar";
import { fmtMinute } from "@/lib/plan-shared";
import { Card, Row, Segmented, Toggle } from "./controls";

function useSet() {
  const m = useUpdateSettings();
  return <K extends keyof Settings>(k: K, v: Settings[K]) => m.mutate({ [k]: v } as Partial<Settings>);
}

function PreviewNote({ children }: { children: string }) {
  return <p className="rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">{children}</p>;
}

// ---------------- 1. Profile & Account ----------------
export function ProfileSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const name = displayNameOf(user);
  const [value, setValue] = useState(user?.display_name ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (display_name: string) => api<{ user: AuthUser }>("/api/auth/profile", { method: "PATCH", body: { display_name } }),
    onSuccess: ({ user: u }) => {
      qc.setQueryData(meKey, { user: u });
      toast.success("Name updated");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't save"),
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    const r = DisplayName.safeParse(value);
    if (!r.success) return setError(r.error.issues[0]?.message ?? "Invalid name");
    setError(null);
    save.mutate(r.data);
  }
  const joined = user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : null;
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xl font-semibold text-primary" aria-hidden>
            {initialsOf(name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{name}</p>
            <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>
      </Card>
      <Card title="Display name" description="Shown in the menu and on your profile.">
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <Input value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} placeholder={user?.email.split("@")[0]}
            aria-label="Display name" aria-invalid={!!error} className="h-11 rounded-xl" />
          <Button type="submit" className="h-11 rounded-xl" disabled={save.isPending || value.trim() === (user?.display_name ?? "")}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </form>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>
      <Card title="Account">
        <Row label="Email" hint="Changing your email isn't available yet."><span className="text-sm text-muted-foreground">{user?.email}</span></Row>
        {joined && <Row label="Member since"><span className="text-sm text-muted-foreground">{joined}</span></Row>}
      </Card>
      {user?.preview && <PreviewNote>Preview Mode: this is a temporary test identity. Name changes last until the page reloads.</PreviewNote>}
    </div>
  );
}

// ---------------- 2. Appearance & Theme ----------------
const THEMES = [
  { value: "dark", label: "Dark", swatch: ["oklch(0.165 0.004 60)", "oklch(0.195 0.005 60)", "oklch(0.95 0.006 80)"] },
  { value: "light", label: "Light", swatch: ["oklch(0.985 0.003 80)", "oklch(1 0 0)", "oklch(0.2 0.01 60)"] },
  { value: "system", label: "System", swatch: ["oklch(0.165 0.004 60)", "oklch(0.985 0.003 80)", "oklch(0.6 0.01 60)"] },
] as const;
const ACCENTS = [
  { value: "gold", label: "Warm Gold", color: "oklch(0.82 0.11 75)" },
  { value: "blue", label: "Blue", color: "oklch(0.72 0.13 250)" },
  { value: "emerald", label: "Emerald", color: "oklch(0.76 0.14 160)" },
  { value: "violet", label: "Violet", color: "oklch(0.74 0.13 295)" },
] as const;

export function AppearanceSection() {
  const s = useSettings();
  const set = useSet();
  return (
    <div className="space-y-4">
      <Card title="Theme" description="Applies everywhere right away.">
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2 sm:gap-3">
          {THEMES.map((t) => (
            <button key={t.value} type="button" role="radio" aria-checked={s.theme === t.value} onClick={() => set("theme", t.value)}
              className={cn("rounded-xl border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                s.theme === t.value ? "border-primary ring-1 ring-primary" : "hover:bg-accent/50")}>
              {/* Fixed preview swatches: they illustrate each theme regardless of the current one. */}
              <span className="relative block h-14 overflow-hidden rounded-lg" style={{ background: t.swatch[0] }} aria-hidden>
                {t.value === "system" && <span className="absolute inset-y-0 right-0 w-1/2" style={{ background: t.swatch[1] }} />}
                <span className="absolute left-2 top-2 h-2 w-8 rounded-full" style={{ background: t.swatch[2], opacity: 0.8 }} />
                <span className="absolute left-2 top-6 h-5 w-12 rounded-md" style={{ background: t.value === "system" ? t.swatch[2] : t.swatch[1], opacity: t.value === "system" ? 0.3 : 1 }} />
              </span>
              <span className="mt-2 flex items-center justify-between text-sm font-medium">
                {t.label}{s.theme === t.value && <Check className="h-4 w-4 text-primary" />}
              </span>
            </button>
          ))}
        </div>
      </Card>
      <Card title="Accent colour" description="Buttons, highlights and selected items. Your own topic, event and category colours are never changed.">
        <div role="radiogroup" aria-label="Accent colour" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ACCENTS.map((a) => (
            <button key={a.value} type="button" role="radio" aria-checked={s.accent === a.value} onClick={() => set("accent", a.value)}
              className={cn("flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                s.accent === a.value ? "border-primary font-medium" : "hover:bg-accent/50")}>
              <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: a.color }} aria-hidden />
              <span className="truncate">{a.label}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---------------- 3. Date & Time ----------------
export function DateTimeSection() {
  const s = useSettings();
  const set = useSet();
  const zones = useMemo(() => {
    try { return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? []; } catch { return []; }
  }, []);
  const [tz, setTz] = useState(s.time_zone);
  const valid = isTimeZone(tz) && tz.trim() !== "";
  const now = new Date();
  return (
    <div className="space-y-4">
      <Card title="Time zone" description="Used for today's date, the calendar, Plan Your Day and habits. Saved events and history are not changed.">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (valid) set("time_zone", tz.trim()); }}>
          <Input list="md-zones" value={tz} onChange={(e) => setTz(e.target.value)} aria-label="Time zone" aria-invalid={!valid}
            className="h-11 rounded-xl" placeholder="Asia/Kolkata" />
          <datalist id="md-zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
          <Button type="submit" className="h-11 rounded-xl" disabled={!valid || tz.trim() === s.time_zone}>Save</Button>
        </form>
        {!valid && <p className="text-sm text-destructive">Pick a time zone from the list, e.g. Asia/Kolkata.</p>}
        <p className="text-xs text-muted-foreground">Now in {s.time_zone}: {formatTime(now, s.time_zone)}</p>
      </Card>
      <Card>
        <Row label="Clock format" hint={`Example: ${fmtMinute(9 * 60 + 30)}`}>
          <Segmented label="Clock format" value={s.clock} onChange={(v) => set("clock", v)}
            options={[{ value: "12", label: "12-hour" }, { value: "24", label: "24-hour" }]} />
        </Row>
        <Row label="Week starts on" hint="Calendar month and week views.">
          <Segmented label="Week starts on" value={s.week_start} onChange={(v) => set("week_start", v)}
            options={[{ value: "monday", label: "Monday" }, { value: "sunday", label: "Sunday" }]} />
        </Row>
      </Card>
    </div>
  );
}

// ---------------- 4. Task Preferences ----------------
export function TaskSection() {
  const s = useSettings();
  const set = useSet();
  return (
    <Card>
      <Row label="Sort tasks by" hint="Due date and newest only change what you see; your manual order is kept. Move up/down works in Manual order.">
        <Segmented label="Sort tasks by" value={s.task_sort} onChange={(v) => set("task_sort", v)}
          options={[{ value: "manual", label: "Manual" }, { value: "due", label: "Due date" }, { value: "newest", label: "Newest" }]} />
      </Row>
      <Toggle id="st-done" label="Show completed tasks" hint="Start with the Completed section open. You can still open or close it."
        checked={s.show_completed} onChange={(v) => set("show_completed", v)} />
      <Row label="Default due date" hint="Only for new tasks.">
        <Segmented label="Default due date" value={s.default_due} onChange={(v) => set("default_due", v)}
          options={[{ value: "none", label: "No date" }, { value: "today", label: "Today" }, { value: "tomorrow", label: "Tomorrow" }]} />
      </Row>
      <Row label="Open My Tasks on" hint="Used when MindDesk opens on My Tasks.">
        <Segmented label="Default task view" value={s.start_page === "starred" ? "starred" : "tasks"}
          onChange={(v) => set("start_page", v)}
          options={[{ value: "tasks", label: "Lists" }, { value: "starred", label: "Starred" }]} />
      </Row>
    </Card>
  );
}

// ---------------- 5. Focus & Productivity ----------------
function MinutesField({ id, label, value, min, max, onSave }: { id: string; label: string; value: number; min: number; max: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const n = Number(v);
  const ok = Number.isInteger(n) && n >= min && n <= max;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">{label}</label>
      <Input id={id} type="number" inputMode="numeric" min={min} max={max} value={v} aria-invalid={!ok}
        onChange={(e) => setV(e.target.value)} onBlur={() => (ok ? n !== value && onSave(n) : setV(String(value)))}
        className="h-11 rounded-xl" />
      <p className={cn("text-[11px]", ok ? "text-muted-foreground" : "text-destructive")}>{min}–{max} min</p>
    </div>
  );
}

export function FocusSection() {
  const s = useSettings();
  const set = useSet();
  return (
    <div className="space-y-4">
      <Card title="Timer lengths" description="Used by Focus Mode in Plan Your Day. Every 4th break is a long break.">
        <div className="grid grid-cols-3 gap-3">
          <MinutesField id="sf-focus" label="Focus" value={s.focus_minutes} min={1} max={180} onSave={(v) => set("focus_minutes", v)} />
          <MinutesField id="sf-short" label="Short break" value={s.short_break_minutes} min={1} max={60} onSave={(v) => set("short_break_minutes", v)} />
          <MinutesField id="sf-long" label="Long break" value={s.long_break_minutes} min={1} max={90} onSave={(v) => set("long_break_minutes", v)} />
        </div>
      </Card>
      <Card>
        <Toggle id="sf-auto" label="Auto-start next session" hint="Start the break or next focus as soon as one ends. Only while Focus Mode is open."
          checked={s.auto_start} onChange={(v) => set("auto_start", v)} />
        <Toggle id="sf-sound" label="Completion sound" hint="A short chime when a session ends. A message is always shown too."
          checked={s.sound} onChange={(v) => set("sound", v)} />
        <Row label="Volume" hint={`${s.volume}%`}>
          <div className="w-48">
            <Slider aria-label="Volume" min={0} max={100} step={5} value={[s.volume]} disabled={!s.sound}
              onValueChange={([v]) => v !== undefined && set("volume", v)} />
          </div>
        </Row>
      </Card>
    </div>
  );
}

// ---------------- 6. Workspace & Layout ----------------
export function WorkspaceSection() {
  const s = useSettings();
  const set = useSet();
  return (
    <Card>
      <Row label="Display density" hint="Compact tightens spacing on tablets and computers. Phones keep comfortable touch sizes.">
        <Segmented label="Display density" value={s.density} onChange={(v) => set("density", v)}
          options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} />
      </Row>
      <Row label="Opening page" hint="Where MindDesk opens. Links to a specific page still open that page.">
        <select value={s.start_page} onChange={(e) => set("start_page", e.target.value as Settings["start_page"])} aria-label="Opening page"
          className="h-10 rounded-xl border bg-background px-3 text-sm">
          {START_PAGES.map((p) => <option key={p} value={p}>{START_PAGE_LABEL[p]}</option>)}
        </select>
      </Row>
      <Toggle id="sw-side" label="Expand My Tasks in the sidebar" hint="Computers and tablets. Applies next time MindDesk opens."
        checked={s.sidebar_tasks_open} onChange={(v) => set("sidebar_tasks_open", v)} />
    </Card>
  );
}

// ---------------- 7. Accessibility ----------------
const SHORTCUTS: { area: string; items: [string, string][] }[] = [
  { area: "Notes", items: [["Enter (in title)", "Jump to the first line"], ["Enter", "New line of the same type"], ["Backspace (at start)", "Turn into text / join with the line above"], ["↑ / ↓", "Move between lines"]] },
  { area: "Mind Maps", items: [["Tab", "Add child topic"], ["Enter", "Add sibling topic"], ["F2 / Space / double-click", "Edit title"], ["Delete / Backspace", "Delete topic or connection"], ["Ctrl/⌘ + D", "Duplicate branch"], [". or /", "Collapse / expand branch"], ["Ctrl/⌘ + Z", "Undo"], ["Ctrl/⌘ + Shift + Z, Ctrl + Y", "Redo"], ["Ctrl/⌘ + F", "Search topics"], ["Esc", "Deselect / cancel"], ["Alt/Option + drag", "Move only this topic"]] },
  { area: "Everywhere", items: [["Tab / Shift + Tab", "Move between controls"], ["Esc", "Close dialogs and menus"]] },
];

export function AccessibilitySection() {
  const s = useSettings();
  const set = useSet();
  return (
    <div className="space-y-4">
      <Card>
        <Row label="Text size">
          <Segmented label="Text size" value={s.text_size} onChange={(v) => set("text_size", v)}
            options={[{ value: "default", label: "Default" }, { value: "large", label: "Large" }]} />
        </Row>
        <Toggle id="sa-motion" label="Reduce motion" hint="Turns off non-essential animation. Your device's reduce-motion setting is always respected."
          checked={s.reduce_motion} onChange={(v) => set("reduce_motion", v)} />
        <Toggle id="sa-contrast" label="High contrast" hint="Stronger text, borders and focus outlines."
          checked={s.high_contrast} onChange={(v) => set("high_contrast", v)} />
      </Card>
      <Card title="Keyboard shortcuts">
        {SHORTCUTS.map((g) => (
          <div key={g.area}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.area}</p>
            <dl className="grid grid-cols-[minmax(0,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
              {g.items.map(([k, v]) => (
                <div key={k} className="contents"><dt><kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs">{k}</kbd></dt><dd className="text-muted-foreground">{v}</dd></div>
              ))}
            </dl>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ---------------- 8. Data & Backup ----------------
type Counts = Record<"task_lists" | "tasks" | "notes" | "project_pages" | "projects" | "events" | "plan_activities" | "mind_maps" | "habits" | "routines", number> & { preservation_mode?: boolean };
const COUNT_LABEL: [keyof Counts, string][] = [
  ["tasks", "Tasks"], ["task_lists", "Task lists"], ["notes", "Notes"], ["projects", "Projects"], ["project_pages", "Project pages"],
  ["events", "Calendar events"], ["plan_activities", "Planned activities"], ["mind_maps", "Mind maps"], ["habits", "Habits"], ["routines", "Routines"],
];

export function DataSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const counts = useQuery({ queryKey: ["data-summary"], queryFn: () => api<Counts>("/api/data/summary") });
  const [exporting, setExporting] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const isPreservationActive = counts.data?.preservation_mode ?? true;

  async function exportData() {
    setExporting(true);
    try {
      const data = await api<unknown>("/api/data/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `minddesk-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast.success("Backup downloaded");
    } catch (e) {
      toast.error("Couldn't export", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Your data" description="What's stored in your account right now.">
        {counts.isPending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : counts.error ? (
          <p className="text-sm text-destructive">Couldn't load counts. <button className="underline" onClick={() => counts.refetch()}>Retry</button></p>
        ) : (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {COUNT_LABEL.map(([k, l]) => (
              <div key={k} className="rounded-xl bg-muted/50 px-3 py-2">
                <dt className="text-xs text-muted-foreground">{l}</dt>
                <dd className="text-lg font-semibold tabular-nums">{counts.data[k]}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
      <Card title="Export my data" description="Downloads a JSON backup (format minddesk-backup, version 1) with tasks, notes, projects, calendar, plans, mind maps, habits and your preferences. Passwords and sign-in data are never included.">
        <Button onClick={exportData} disabled={exporting} className="h-11 gap-2 rounded-xl">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export my data
        </Button>
        {user?.preview && <PreviewNote>Preview Mode: the backup contains only this session's temporary test data.</PreviewNote>}
      </Card>
      <Card title="Import a backup">
        <p className="text-sm text-muted-foreground">Restoring from a backup isn't available yet. Keep your exported files safe — they'll work with import once it's added.</p>
      </Card>
      <Card tone="danger" title="Delete workspace data" description="Permanently deletes all your tasks, lists, notes, projects, calendar events, plans and focus history, mind maps, habits and routines. Your account, sign-in, preferences, and My Private Vault (passwords & documents) remain safe.">
        <Button variant="destructive" className="h-11 rounded-xl" disabled={!!user?.preview || isPreservationActive} onClick={() => setDelOpen(true)}>
          {isPreservationActive ? "Workspace deletion disabled" : "Delete workspace data…"}
        </Button>
        {isPreservationActive && (
          <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
            Disabled: Data Preservation Mode is active to safeguard your workspace records from permanent deletion.
          </p>
        )}
        {user?.preview && <PreviewNote>Not available in Preview Mode.</PreviewNote>}
      </Card>
      <DeleteDataDialog open={delOpen} onOpenChange={setDelOpen} onDone={() => { qc.clear(); window.location.assign("/"); }} isPreservationActive={isPreservationActive} />
    </div>
  );
}

function DeleteDataDialog({ open, onOpenChange, onDone, isPreservationActive = true }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void; isPreservationActive?: boolean }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const del = useMutation({
    mutationFn: () => api("/api/data/delete", { method: "POST", body: { password, confirm } }),
    onSuccess: () => { toast.success("Workspace data was deleted"); onDone(); },
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't delete"),
  });
  useEffect(() => { if (open) { setPassword(""); setConfirm(""); setError(null); } }, [open]);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete workspace data?</AlertDialogTitle>
          <AlertDialogDescription>This permanently deletes all your workspace notes, tasks, projects, plans, mind maps, habits and routines. Your account, sign-in, preferences, and My Private Vault (passwords and documents) remain safe. This cannot be undone. Export a backup first if you might need it.</AlertDialogDescription>
        </AlertDialogHeader>
        {isPreservationActive && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
            Data Preservation Mode is active. Permanent workspace deletion is disabled to prevent accidental data loss.
          </div>
        )}
        <form id="del-form" className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!isPreservationActive) del.mutate(); }}>
          <Input type="password" autoComplete="current-password" placeholder="Your password" value={password}
            onChange={(e) => setPassword(e.target.value)} aria-label="Password" className="h-11 rounded-xl" />
          <Input placeholder='Type DELETE to confirm' value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Type DELETE to confirm" className="h-11 rounded-xl" />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button type="submit" form="del-form" variant="destructive" disabled={isPreservationActive || !password || confirm !== "DELETE" || del.isPending}>
            {isPreservationActive ? "Deletion disabled" : del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete workspace data"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------- 9. Security & Privacy ----------------
export function SecuritySection() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: () => api("/api/auth/password", { method: "POST", body: { current_password: cur, new_password: next } }),
    onSuccess: () => { setCur(""); setNext(""); setAgain(""); toast.success("Password changed. Other devices were signed out."); },
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't change password"),
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (next.length < 8) return setError("New password must be at least 8 characters.");
    if (next !== again) return setError("New passwords don't match.");
    setError(null);
    change.mutate();
  }
  const disabled = !!user?.preview;
  return (
    <div className="space-y-4">
      <Card title="Change password">
        {disabled ? <PreviewNote>Not available in Preview Mode — there is no real account to change.</PreviewNote> : (
          <form onSubmit={submit} className="space-y-3">
            <Input type="password" autoComplete="current-password" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} aria-label="Current password" className="h-11 rounded-xl" />
            <Input type="password" autoComplete="new-password" placeholder="New password (8+ characters)" value={next} onChange={(e) => setNext(e.target.value)} aria-label="New password" className="h-11 rounded-xl" />
            <Input type="password" autoComplete="new-password" placeholder="Confirm new password" value={again} onChange={(e) => setAgain(e.target.value)} aria-label="Confirm new password" className="h-11 rounded-xl" />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="h-11 gap-2 rounded-xl" disabled={!cur || !next || !again || change.isPending}>
              {change.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Change password
            </Button>
          </form>
        )}
      </Card>
      <Card title="Sign out" description="Ends your session on this device.">
        <Button variant="outline" className="h-11 rounded-xl" onClick={async () => { await signOut(); navigate({ to: "/auth", replace: true }); }}>Sign out</Button>
      </Card>
      <Card>
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            Your workspace is private to your account: every request is checked against your sign-in, and other accounts can't read or change your data.
            Passwords are stored only as secure one-way hashes.
          </p>
        </div>
      </Card>
    </div>
  );
}
