// Server-only helpers for the MindDesk REST API (MySQL via Prisma).
import { PrismaClient, type Task as DbTask, type TaskList as DbList } from "@prisma/client";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

const g = globalThis as unknown as { __prisma?: PrismaClient };
export function db() {
  if (!process.env["DATABASE_URL"]) throw new ApiError(503, "Database is not configured (DATABASE_URL missing).");
  g.__prisma ??= new PrismaClient();
  return g.__prisma;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...(init.headers ?? {}) },
  });

/** Wrap a handler: converts thrown errors into JSON error responses. */
export async function handle(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message }, { status: e.status });
    if (e && typeof e === "object" && "issues" in e) return json({ error: "Invalid input" }, { status: 400 });
    console.error("[api]", e);
    return json({ error: "Server error" }, { status: 500 });
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
}

// ---------- passwords ----------
export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}
export async function verifyPassword(pw: string, stored: string) {
  const [alg, saltHex, keyHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !keyHex) return false;
  const key = await scryptAsync(pw, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(keyHex, "hex");
  return expected.length === key.length && timingSafeEqual(expected, key);
}

// ---------- owner bootstrap ----------
let bootstrapPromise: Promise<void> | null = null;
let bootstrapCompleted = false;

export function _resetBootstrapForTesting() {
  bootstrapCompleted = false;
  bootstrapPromise = null;
}

export async function bootstrapOwnerAccount(): Promise<void> {
  if (bootstrapCompleted) return;
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    try {
      if (!process.env["DATABASE_URL"]) return;

      const adminEmail = process.env["ADMIN_EMAIL"]?.trim().toLowerCase();
      const adminPassword = process.env["ADMIN_PASSWORD"];

      // If credentials are not provided (e.g. removed or not set), nothing to bootstrap
      if (!adminEmail || !adminPassword) {
        return;
      }

      // Check if users table is empty. Only bootstrap when users table is completely empty.
      const userCount = await db().user.count();
      if (userCount > 0) {
        bootstrapCompleted = true;
        return;
      }

      // Hash password using the existing scrypt mechanism and store account
      const passwordHash = await hashPassword(adminPassword);
      await db().user.create({
        data: {
          email: adminEmail,
          passwordHash,
        },
      });

      bootstrapCompleted = true;
      console.log("[auth] Initial owner account created successfully.");
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : undefined;
      if (code === "P2002") {
        // Unique constraint violation (e.g. created concurrently by another worker)
        bootstrapCompleted = true;
        return;
      }
      console.error("[auth] Owner account bootstrap check failed:", err instanceof Error ? err.message : "Unknown error");
      bootstrapPromise = null;
    }
  })();

  return bootstrapPromise;
}


// ---------- sessions (HTTP-only cookie) ----------
const COOKIE = "md_session";
const SESSION_DAYS = 30;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function cookieAttrs(maxAge: number) {
  const secure = process.env["NODE_ENV"] === "production" || process.env["COOKIE_SECURE"] === "true";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await db().session.create({
    data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5) },
  });
  return `${COOKIE}=${token}; ${cookieAttrs(SESSION_DAYS * 86400)}`;
}

function readToken(request: Request) {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return v.join("=");
  }
  return null;
}

export async function destroySession(request: Request) {
  const token = readToken(request);
  if (token) await db().session.deleteMany({ where: { tokenHash: sha256(token) } });
  return `${COOKIE}=; ${cookieAttrs(0)}`;
}

export async function getUser(request: Request) {
  const token = readToken(request);
  if (!token) return null;
  const s = await db().session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!s) return null;
  if (s.expiresAt < new Date()) {
    await db().session.delete({ where: { id: s.id } }).catch(() => {});
    return null;
  }
  return s.user;
}

export async function requireUser(request: Request) {
  const u = await getUser(request);
  if (!u) throw new ApiError(401, "Not signed in");
  return u;
}

// ---------- DTOs (shape consumed by the frontend) ----------
const iso = (d: Date | null) => (d ? d.toISOString() : null);
export const listDto = (l: DbList) => ({
  id: l.id, user_id: l.userId, title: l.title, position: l.position,
  created_at: l.createdAt.toISOString(), updated_at: l.updatedAt.toISOString(),
});
export const taskDto = (t: DbTask) => ({
  id: t.id, user_id: t.userId, list_id: t.listId, parent_id: t.parentId, title: t.title,
  description: t.description, completed: t.completed, completed_at: iso(t.completedAt), starred: t.starred,
  due_date: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null, recurrence_rule: t.recurrenceRule,
  position: t.position, created_at: t.createdAt.toISOString(), updated_at: t.updatedAt.toISOString(),
});
export const userDto = (u: { id: string; email: string; displayName?: string | null; createdAt?: Date }) => ({
  id: u.id, email: u.email, display_name: u.displayName ?? null, created_at: u.createdAt?.toISOString() ?? null,
});
export const toDate = (d: string | null | undefined) => (d ? new Date(`${d}T00:00:00.000Z`) : d === null ? null : undefined);

/** Drop undefined keys so partial updates only touch provided fields. */
export function defined<T extends object>(o: T) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]-?: Exclude<T[K], undefined>;
  };
}

// ---------- notes & projects ----------
import type { Page as DbPage, Project as DbProject } from "@prisma/client";
export const projectDto = (p: DbProject) => ({
  id: p.id, title: p.title, position: p.position, is_pinned: Boolean(p.isPinned),
  created_at: p.createdAt.toISOString(), updated_at: p.updatedAt.toISOString(),
});
export const pageMetaDto = (p: Omit<DbPage, "content">) => ({
  id: p.id, project_id: p.projectId, parent_id: p.parentId, title: p.title, position: p.position,
  is_pinned: Boolean(p.isPinned),
  version: p.version, created_at: p.createdAt.toISOString(), updated_at: p.updatedAt.toISOString(),
});
export const pageMetaSelect = {
  id: true, userId: true, projectId: true, parentId: true, title: true, position: true, isPinned: true, version: true,
  createdAt: true, updatedAt: true, deletedAt: true,
} as const;

// ---------- calendar ----------
import type { Event as DbEvent } from "@prisma/client";
import { z } from "zod";
export const eventDto = (e: DbEvent) => ({
  id: e.id, title: e.title, description: e.description, location: e.location,
  start_at: e.startAt.toISOString(), end_at: e.endAt.toISOString(), all_day: e.allDay, color: e.color,
  recurrence_rule: e.recurrenceRule, time_zone: e.timeZone,
  created_at: e.createdAt.toISOString(), updated_at: e.updatedAt.toISOString(),
});
export const EVENT_COLORS = ["blue", "green", "amber", "red", "violet", "teal", "gray"] as const;
export const EventInput = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(10000).nullable().optional(),
  location: z.string().trim().max(300).nullable().optional(),
  start_at: z.string().datetime(),
  end_at: z.string().datetime(),
  all_day: z.boolean(),
  color: z.enum(EVENT_COLORS),
  recurrence_rule: z.enum(["FREQ=DAILY", "FREQ=WEEKLY", "FREQ=MONTHLY", "FREQ=YEARLY"]).nullable(),
  time_zone: z.string().min(1).max(64),
});
/** Validate and convert an event body into Prisma data. */
export function eventData(raw: unknown) {
  const b = EventInput.parse(raw);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: b.time_zone });
  } catch {
    throw new ApiError(400, "Unknown time zone");
  }
  const startAt = new Date(b.start_at);
  const endAt = new Date(b.end_at);
  if (b.all_day) {
    const midnight = (d: Date) => d.getUTCHours() + d.getUTCMinutes() + d.getUTCSeconds() + d.getUTCMilliseconds() === 0;
    if (!midnight(startAt) || !midnight(endAt)) throw new ApiError(400, "All-day events must use whole dates");
    if (endAt < startAt) throw new ApiError(400, "End date can't be before the start date");
  } else if (endAt <= startAt) {
    throw new ApiError(400, "End must be after the start");
  }
  if (endAt.getTime() - startAt.getTime() > 366 * 864e5) throw new ApiError(400, "Events can't be longer than a year");
  return {
    title: b.title, description: b.description?.trim() || null, location: b.location?.trim() || null,
    startAt, endAt, allDay: b.all_day, color: b.color, recurrenceRule: b.recurrence_rule, timeZone: b.time_zone,
  };
}

// ---------- plan your day ----------
import type { FocusSession as DbFocus, PlanActivity as DbAct, PlanActivityException as DbEx, PlanCategory as DbCat } from "@prisma/client";
const dkey = (d: Date) => d.toISOString().slice(0, 10);
export const planCategoryDto = (c: DbCat) => ({ id: c.id, name: c.name, color: c.color, position: c.position, is_default: c.isDefault });
export const planActivityDto = (a: DbAct & { exceptions: DbEx[] }) => ({
  id: a.id, category_id: a.categoryId, title: a.title, description: a.description,
  start_date: dkey(a.startDate), end_date: a.endDate ? dkey(a.endDate) : null,
  start_minute: a.startMinute, end_minute: a.endMinute, repeat_days: a.repeatDays,
  routine_type: a.routineType === "flexible" ? "flexible" : "fixed",
  exceptions: a.exceptions.map((e) => ({ date: dkey(e.date), cancelled: e.cancelled, start_minute: e.startMinute, end_minute: e.endMinute })),
  created_at: a.createdAt.toISOString(), updated_at: a.updatedAt.toISOString(),
});
export const focusDto = (f: DbFocus) => ({
  id: f.id, activity_id: f.activityId, title: f.title, date: dkey(f.date), planned_minutes: f.plannedMinutes,
  focused_seconds: f.focusedSeconds, completed: f.completed, started_at: f.startedAt.toISOString(), ended_at: f.endedAt.toISOString(),
});
export const PLAN_COLORS = EVENT_COLORS;
export const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !isNaN(Date.parse(`${s}T00:00:00Z`)), "Invalid date");
const minuteStart = z.number().int().min(0).max(1439);
const minuteEnd = z.number().int().min(1).max(1440);
export const ActivityInput = z.object({
  category_id: z.string().uuid().nullable(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  start_date: DateKey,
  end_date: DateKey.nullable().optional(),
  start_minute: minuteStart,
  end_minute: minuteEnd,
  repeat_days: z.number().int().min(0).max(127),
  routine_type: z.enum(["fixed", "flexible"]),
});
export const ExceptionInput = z.object({
  cancelled: z.boolean(),
  start_minute: minuteStart.nullable().optional(),
  end_minute: minuteEnd.nullable().optional(),
});
/** Validate an activity body (including category ownership) and convert to Prisma data. */
export async function activityData(raw: unknown, userId: string) {
  const b = ActivityInput.parse(raw);
  if (b.start_minute === b.end_minute % 1440 && b.end_minute !== 1440) throw new ApiError(400, "End time must differ from the start time");
  if (b.end_date && b.end_date < b.start_date) throw new ApiError(400, "Repeat end date is before the start date");
  if (b.category_id) {
    const c = await db().planCategory.findFirst({ where: { id: b.category_id, userId } });
    if (!c) throw new ApiError(404, "Category not found");
  }
  return {
    categoryId: b.category_id, title: b.title, description: b.description?.trim() || null,
    startDate: new Date(`${b.start_date}T00:00:00Z`), endDate: b.repeat_days && b.end_date ? new Date(`${b.end_date}T00:00:00Z`) : null,
    startMinute: b.start_minute, endMinute: b.end_minute, repeatDays: b.repeat_days, routineType: b.routine_type,
  };
}

// ---------- mind maps ----------
import type { MindMap as DbMap } from "@prisma/client";
export const mindMapMetaDto = (m: Omit<DbMap, "data">) => ({
  id: m.id, title: m.title, is_locked: Boolean(m.isLocked), is_pinned: Boolean(m.isPinned), node_count: m.nodeCount, version: m.version,
  created_at: m.createdAt.toISOString(), updated_at: m.updatedAt.toISOString(),
});
export const mindMapMetaSelect = { id: true, userId: true, title: true, isLocked: true, isPinned: true, nodeCount: true, version: true, createdAt: true, updatedAt: true, deletedAt: true } as const;

// ---------- habits & routines ----------
import type { Habit as DbHabit, Routine as DbRoutine } from "@prisma/client";
export const routineDto = (r: DbRoutine) => ({
  id: r.id, title: r.title, position: r.position, collapsed: r.collapsed,
  created_at: r.createdAt.toISOString(), updated_at: r.updatedAt.toISOString(),
});
export const habitDto = (h: DbHabit & { completions: { date: string }[] }) => ({
  id: h.id, routine_id: h.routineId, title: h.title, description: h.description, color: h.color,
  repeat_days: h.repeatDays, position: h.position, start_date: h.startDate,
  completions: h.completions.map((c) => c.date).sort(),
  created_at: h.createdAt.toISOString(), updated_at: h.updatedAt.toISOString(),
});
export const habitInclude = { completions: { select: { date: true } } } as const;
/** Throws 404 unless the routine belongs to the user. */
export async function ownRoutine(id: string | null | undefined, userId: string) {
  if (!id) return;
  const r = await db().routine.findFirst({ where: { id, userId, deletedAt: null }, select: { id: true } });
  if (!r) throw new ApiError(404, "Routine not found");
}

// ---------- account data: counts, export, delete ----------
export async function currentSessionId(request: Request) {
  const token = readToken(request);
  if (!token) return null;
  const s = await db().session.findUnique({ where: { tokenHash: sha256(token) }, select: { id: true } });
  return s?.id ?? null;
}

export async function dataCounts(userId: string) {
  const p = db();
  const where = { userId, deletedAt: null };
  const [task_lists, tasks, notes, project_pages, projects, events, plan_activities, mind_maps, habits, routines] = await Promise.all([
    p.taskList.count({ where }), p.task.count({ where }),
    p.page.count({ where: { userId, projectId: null, deletedAt: null } }), p.page.count({ where: { userId, NOT: { projectId: null }, deletedAt: null } }),
    p.project.count({ where }), p.event.count({ where }), p.planActivity.count({ where: { userId } }),
    p.mindMap.count({ where }), p.habit.count({ where }), p.routine.count({ where }),
  ]);
  return { task_lists, tasks, notes, project_pages, projects, events, plan_activities, mind_maps, habits, routines };
}

const omitUser = <T extends { userId?: unknown }>(rows: T[]) => rows.map(({ userId: _u, ...r }) => r);

/** Versioned JSON backup (format "minddesk-backup", version 1). Never includes password hashes or sessions. */
export async function exportUserData(user: { id: string; email: string; displayName?: string | null; createdAt: Date }) {
  const p = db();
  const where = { userId: user.id };
  const whereActive = { userId: user.id, deletedAt: null };
  const [settings, lists, tasks, projects, pages, events, cats, acts, focus, maps, routines, habits, completions] = await Promise.all([
    p.userSettings.findUnique({ where }), p.taskList.findMany({ where: whereActive }), p.task.findMany({ where: whereActive }),
    p.project.findMany({ where: whereActive }), p.page.findMany({ where: whereActive }), p.event.findMany({ where: whereActive }),
    p.planCategory.findMany({ where }), p.planActivity.findMany({ where, include: { exceptions: true } }),
    p.focusSession.findMany({ where }), p.mindMap.findMany({ where: whereActive }), p.routine.findMany({ where: whereActive }),
    p.habit.findMany({ where: whereActive }), p.habitCompletion.findMany({ where: { userId: user.id, habit: { deletedAt: null } } }),
  ]);
  const parse = (s: string) => { try { return JSON.parse(s); } catch { return s; } };
  return {
    format: "minddesk-backup", version: 1, exported_at: new Date().toISOString(),
    notes: "Records keep their original ids; parent/child links use those ids (e.g. tasks.listId, pages.parentId, habits.routineId).",
    account: { email: user.email, display_name: user.displayName ?? null, created_at: user.createdAt.toISOString() },
    preferences: settings ? parse(settings.data) : null,
    task_lists: omitUser(lists), tasks: omitUser(tasks), projects: omitUser(projects),
    pages: omitUser(pages).map((pg) => ({ ...pg, content: parse(pg.content) })),
    calendar_events: omitUser(events), plan_categories: omitUser(cats), plan_activities: omitUser(acts),
    focus_sessions: omitUser(focus), mind_maps: omitUser(maps).map((m) => ({ ...m, data: parse(m.data) })),
    routines: omitUser(routines), habits: omitUser(habits), habit_completions: omitUser(completions),
  };
}

/** Removes all workspace content for one user in a single transaction. The account and preferences remain. */
export async function deleteUserData(userId: string) {
  const p = db();
  const where = { userId };
  await p.$transaction([
    p.habitCompletion.deleteMany({ where }), p.habit.deleteMany({ where }), p.routine.deleteMany({ where }),
    p.focusSession.deleteMany({ where }), p.planActivity.deleteMany({ where }), p.planCategory.deleteMany({ where }),
    p.mindMap.deleteMany({ where }), p.event.deleteMany({ where }),
    p.page.updateMany({ where, data: { parentId: null } }), p.page.deleteMany({ where }), p.project.deleteMany({ where }),
    p.task.updateMany({ where, data: { parentId: null } }), p.task.deleteMany({ where }), p.taskList.deleteMany({ where }),
  ]);
}
