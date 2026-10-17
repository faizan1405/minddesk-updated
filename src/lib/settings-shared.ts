// User preferences: one validated JSON document per user (shared by server, preview adapter and UI).
import { z } from "zod";

export const START_PAGES = ["tasks", "starred", "notes", "projects", "calendar", "plan", "mind-maps", "habits"] as const;
export const START_PAGE_LABEL: Record<(typeof START_PAGES)[number], string> = {
  tasks: "My Tasks", starred: "Starred", notes: "Notes", projects: "Projects", calendar: "Calendar",
  plan: "Plan Your Day", "mind-maps": "Mind Maps", habits: "Habits & Routines",
};

export function isTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const fields = {
  theme: z.enum(["dark", "light", "system"]),
  accent: z.enum(["gold", "blue", "emerald", "violet"]),
  time_zone: z.string().min(1).max(64).refine(isTimeZone, "Unknown time zone"),
  clock: z.enum(["12", "24"]),
  week_start: z.enum(["monday", "sunday"]),
  task_sort: z.enum(["manual", "due", "newest"]),
  show_completed: z.boolean(),
  default_due: z.enum(["none", "today", "tomorrow"]),
  focus_minutes: z.number().int().min(1).max(180),
  short_break_minutes: z.number().int().min(1).max(60),
  long_break_minutes: z.number().int().min(1).max(90),
  auto_start: z.boolean(),
  sound: z.boolean(),
  volume: z.number().int().min(0).max(100),
  density: z.enum(["comfortable", "compact"]),
  start_page: z.enum(START_PAGES),
  sidebar_tasks_open: z.boolean(),
  text_size: z.enum(["default", "large"]),
  reduce_motion: z.boolean(),
  high_contrast: z.boolean(),
};

export type Settings = { [K in keyof typeof fields]: z.infer<(typeof fields)[K]> };

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark", accent: "gold", time_zone: "Asia/Kolkata", clock: "12", week_start: "monday",
  task_sort: "manual", show_completed: false, default_due: "none",
  focus_minutes: 25, short_break_minutes: 5, long_break_minutes: 15, auto_start: false, sound: true, volume: 60,
  density: "comfortable", start_page: "tasks", sidebar_tasks_open: false,
  text_size: "default", reduce_motion: false, high_contrast: false,
};

/** Strict schema for updates: every key optional, unknown keys rejected. */
export const SettingsPatch = z.object(fields).partial().strict();

/** Lenient read: stored JSON merged over defaults; any invalid or unknown value falls back to its default. */
export function parseSettings(raw: unknown): Settings {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch { obj = {}; }
  }
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  if (obj && typeof obj === "object") {
    for (const [k, schema] of Object.entries(fields)) {
      const r = (schema as z.ZodTypeAny).safeParse((obj as Record<string, unknown>)[k]);
      if (r.success) out[k] = r.data;
    }
  }
  return out as Settings;
}

export const DisplayName = z.string().trim().min(1, "Enter a name").max(80, "Use 80 characters or fewer");
export const PasswordChange = z.object({
  current_password: z.string().min(1).max(200),
  new_password: z.string().min(8, "Use at least 8 characters").max(200),
});
export const BACKUP_FORMAT = "minddesk-backup";
export const BACKUP_VERSION = 1;
