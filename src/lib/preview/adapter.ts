// DEVELOPMENT-ONLY in-memory API used by Preview Mode (see src/lib/api-client.ts).
// Never imported by production builds. Data lives in memory and resets on page reload.
// It starts empty (except the default planner categories, which every real account also gets).
import { DocSchema, newDoc } from "@/lib/mindmap-doc";
import {
  HabitInput,
  HabitPatch,
  OrderInput,
  RoutineInput,
  RoutinePatch,
  completionError,
  isDateKey,
  todayIn,
} from "@/lib/habits-shared";
import { emptyContent } from "@/lib/page-content";
import { DisplayName, SettingsPatch, parseSettings, type Settings } from "@/lib/settings-shared";
import { DEFAULT_PLAN_CATEGORIES, activityInRange, type PlanActivity } from "@/lib/plan-shared";
import { calculateProductivityAnalytics } from "@/lib/analytics-calc";

type Res = { status: number; data: unknown };
type Row = Record<string, unknown> & { id: string };

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const ok = (data: unknown, status = 200): Res => ({ status, data });
const err = (status: number, error: string): Res => ({ status, data: { error } });

const PREVIEW_USER: {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string | null;
  preview: true;
} = {
  id: "preview-user",
  email: "preview@minddesk.local",
  display_name: null,
  created_at: null,
  preview: true,
};
// Seeded from the cached appearance so a reload keeps the theme you were testing.
let previewSettings: Settings = parseSettings(
  (() => {
    try {
      return JSON.parse(localStorage.getItem("md_appearance") ?? "{}");
    } catch {
      return {};
    }
  })(),
);
let signedIn = true;

function loadSessionDb(): Partial<typeof db> | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    const raw = window.sessionStorage.getItem("md_preview_db");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      pageContent: new Map(parsed.pageContent || []),
      mapData: new Map(parsed.mapData || []),
      images: new Map(parsed.images || []),
      vaultAttachments: new Map(parsed.vaultAttachments || []),
    };
  } catch {
    return null;
  }
}

function saveSessionDb() {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return;
    const serializable = {
      ...db,
      pageContent: Array.from(db.pageContent.entries()),
      mapData: Array.from(db.mapData.entries()),
      images: Array.from(db.images.entries()),
      vaultAttachments: Array.from(db.vaultAttachments.entries()),
    };
    window.sessionStorage.setItem("md_preview_db", JSON.stringify(serializable));
  } catch {
    // Ignore storage quota or disabled storage errors
  }
}

const db = {
  lists: [] as Row[],
  tasks: [] as Row[],
  projects: [] as Row[],
  pages: [] as Row[],
  pageContent: new Map<string, unknown>(),
  events: [] as Row[],
  categories: DEFAULT_PLAN_CATEGORIES.map((c, i) => ({
    id: uid(),
    name: c.name,
    color: c.color,
    position: i,
    is_default: true,
    created_at: now(),
    updated_at: now(),
  })) as Row[],
  activities: [] as Row[],
  exceptions: [] as Row[],
  focus: [] as Row[],
  maps: [] as Row[],
  mapData: new Map<string, unknown>(),
  habits: [] as Row[],
  routines: [] as Row[],
  images: new Map<string, unknown>(),
  vaultMeta: null as Record<string, unknown> | null,
  vaultEntries: [] as Row[],
  vaultDocuments: [] as Row[],
  vaultAttachments: new Map<string, { base64: string; iv: string }>(),
};

const restored = loadSessionDb();
if (restored) {
  Object.assign(db, restored);
}

const touch = (r: Row, patch: Record<string, unknown>) => {
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) r[k] = v;
  r["updated_at"] = now();
  return r;
};
const sortPos = (rows: Row[]) =>
  [...rows].sort((a, b) => (a["position"] as number) - (b["position"] as number));
const find = (rows: Row[], id: string) => rows.find((r) => r.id === id);
const remove = (rows: Row[], pred: (r: Row) => boolean) => {
  for (let i = rows.length - 1; i >= 0; i--) if (pred(rows[i]!)) rows.splice(i, 1);
};
function descendants(rows: Row[], id: string, key: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const r of rows) if (r[key] === out[i]) out.push(r.id);
  return out;
}

function activityDto(a: Row) {
  return {
    ...a,
    exceptions: db.exceptions
      .filter((e) => e["activity_id"] === a.id)
      .map(({ activity_id: _a, ...e }) => e),
  };
}

/** Same rules as the server's validation for planning activities. */
function checkActivity(b: Record<string, unknown>): string | null {
  const s = b["start_minute"],
    e = b["end_minute"];
  if (typeof b["title"] !== "string" || !b["title"].trim()) return "Title is required";
  if (typeof s !== "number" || typeof e !== "number" || s < 0 || s > 1439 || e < 1 || e > 1440)
    return "Invalid time";
  if (s === e) return "End time must differ from the start time";
  if (typeof b["start_date"] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b["start_date"]))
    return "Invalid date";
  return null;
}

function handlePreviewRequest(
  method: string,
  rawPath: string,
  body?: Record<string, unknown>,
): Res {
  const url = new URL(rawPath, "http://preview.local");
  const p = url.pathname.split("/").filter(Boolean); // ["api", ...]
  const q = url.searchParams;
  const b = (body ?? {}) as Record<string, unknown>;
  const route = `${method} /${p
    .slice(1)
    .map((s, i) => (i > 0 && /[0-9a-f-]{36}|\d{4}-\d{2}-\d{2}|preview/.test(s) ? ":x" : s))
    .join("/")}`;

  // ---- auth ----
  if (route === "GET /auth/me") return ok({ user: signedIn ? PREVIEW_USER : null });
  if (route === "POST /auth/signup") return err(403, "Public signup is disabled.");
  if (route === "POST /auth/login") {
    signedIn = true;
    return ok({ user: PREVIEW_USER });
  }
  if (route === "POST /auth/logout") {
    signedIn = false;
    return ok({ ok: true });
  }
  if (!signedIn) return err(401, "Not signed in");

  const id = p[2] ?? "";


  // ---- vault ----
  if (route === "GET /vault/meta") {
    if (!db.vaultMeta) {
      return ok({
        initialized: false,
        salt: null,
        wrapped_key: null,
        wrapped_key_iv: null,
        iterations: 3,
        memory_cost: 19456,
        parallelism: 1,
        version: 1,
      });
    }
    return ok({ initialized: true, ...db.vaultMeta });
  }
  if (route === "POST /vault/meta") {
    if (db.vaultMeta) return err(409, "Vault is already initialized.");
    db.vaultMeta = {
      salt: b["salt"],
      wrapped_key: b["wrapped_key"],
      wrapped_key_iv: b["wrapped_key_iv"],
      iterations: b["iterations"] ?? 3,
      memory_cost: b["memory_cost"] ?? 19456,
      parallelism: b["parallelism"] ?? 1,
      version: 1,
      created_at: now(),
      updated_at: now(),
    };
    return ok({ initialized: true, ...db.vaultMeta }, 201);
  }
  if (route === "POST /vault/password") {
    if (!db.vaultMeta) return err(404, "Vault not initialized.");
    const expected = b["expected_version"] as number | undefined;
    if (expected !== undefined && db.vaultMeta["version"] !== expected) {
      return err(409, "Conflict: Master password was changed from another session.");
    }
    db.vaultMeta["salt"] = b["salt"];
    db.vaultMeta["wrapped_key"] = b["wrapped_key"];
    db.vaultMeta["wrapped_key_iv"] = b["wrapped_key_iv"];
    db.vaultMeta["version"] = (((db.vaultMeta["version"] as number) || 1) + 1);
    db.vaultMeta["updated_at"] = now();
    return ok({ success: true, version: db.vaultMeta["version"] });
  }
  if (route === "GET /vault/entries") {
    return ok(db.vaultEntries);
  }
  if (route === "POST /vault/entries") {
    const r = {
      id: (b["id"] as string) || uid(),
      encrypted_data: b["encrypted_data"],
      iv: b["iv"],
      version: 1,
      created_at: now(),
      updated_at: now(),
    } as Row;
    db.vaultEntries.unshift(r);
    return ok(r, 201);
  }
  if (route === "PATCH /vault/entries/:x") {
    const e = find(db.vaultEntries, id);
    if (!e) return err(404, "Vault entry not found");
    const expected = b["expected_version"] as number | undefined;
    if (expected !== undefined && e["version"] !== expected) {
      return err(409, "Conflict: Entry has been modified elsewhere.");
    }
    touch(e, {
      encrypted_data: b["encrypted_data"],
      iv: b["iv"],
      version: (((e["version"] as number) || 1) + 1),
    });
    return ok(e);
  }
  if (route === "DELETE /vault/entries/:x") {
    remove(db.vaultEntries, (r) => r.id === id);
    return ok({ success: true, id });
  }
  if (route === "GET /vault/documents") {
    return ok(db.vaultDocuments);
  }
  if (route === "POST /vault/documents") {
    const r = {
      id: (b["id"] as string) || uid(),
      encrypted_data: b["encrypted_data"],
      iv: b["iv"],
      version: 1,
      created_at: now(),
      updated_at: now(),
      attachments: [],
    } as Row;
    db.vaultDocuments.unshift(r);
    return ok(r, 201);
  }
  if (route === "PATCH /vault/documents/:x") {
    const d = find(db.vaultDocuments, id);
    if (!d) return err(404, "Vault document not found");
    const expected = b["expected_version"] as number | undefined;
    if (expected !== undefined && d["version"] !== expected) {
      return err(409, "Conflict: Document has been modified elsewhere.");
    }
    // Safe post-commit obsolete attachment retirement
    const obsolete = (b["obsolete_attachment_ids"] as string[]) || [];
    for (const obsId of obsolete) {
      db.vaultAttachments.delete(obsId);
    }
    const currentAtts = (d["attachments"] as Array<{ id: string }>) || [];
    d["attachments"] = currentAtts.filter((a) => !obsolete.includes(a.id));

    touch(d, {
      encrypted_data: b["encrypted_data"],
      iv: b["iv"],
      version: (((d["version"] as number) || 1) + 1),
    });
    return ok(d);
  }
  if (route === "DELETE /vault/documents/:x") {
    const doc = find(db.vaultDocuments, id);
    if (doc) {
      const atts = (doc["attachments"] as Array<{ id: string }>) || [];
      for (const a of atts) db.vaultAttachments.delete(a.id);
    }
    remove(db.vaultDocuments, (r) => r.id === id);
    return ok({ success: true, id });
  }
  if (route === "DELETE /vault/documents/attachments/:x") {
    db.vaultAttachments.delete(id);
    for (const doc of db.vaultDocuments) {
      const atts = (doc["attachments"] as Array<{ id: string }>) || [];
      const filtered = atts.filter((a) => a.id !== id);
      if (filtered.length !== atts.length) {
        doc["attachments"] = filtered;
      }
    }
    return ok({ success: true, id });
  }
  if (route === "POST /vault/documents/upload") {
    const docId = b["document_id"] as string;
    const attId = b["attachment_id"] as string;
    const iv = b["iv"] as string;
    const base64 = (b["base64"] as string) || "";
    const doc = find(db.vaultDocuments, docId);
    if (!doc) return err(404, "Target document not found or access denied.");
    if (db.vaultAttachments.has(attId)) {
      return err(409, "Attachment file with this ID already exists.");
    }
    db.vaultAttachments.set(attId, { base64, iv });
    const atts = (doc["attachments"] as Array<Record<string, unknown>>) || [];
    atts.push({
      id: attId,
      encrypted_size: base64.length,
      iv,
      created_at: now(),
    });
    doc["attachments"] = atts;
    return ok({ id: attId, document_id: docId, encrypted_size: base64.length, iv }, 201);
  }
  if (route === "GET /vault/documents/files/:x") {
    const att = db.vaultAttachments.get(id);
    if (!att) return err(404, "Attachment not found");
    return ok(att);
  }

  // ---- settings & account (temporary; security actions are refused in Preview Mode) ----
  if (route === "GET /settings") return ok(previewSettings);
  if (route === "PUT /settings") {
    const r = SettingsPatch.safeParse(b);
    if (!r.success) return err(400, r.error.issues[0]?.message ?? "Invalid settings");
    previewSettings = parseSettings({ ...previewSettings, ...r.data });
    return ok(previewSettings);
  }
  if (route === "PATCH /auth/profile") {
    const r = DisplayName.safeParse(b["display_name"]);
    if (!r.success) return err(400, r.error.issues[0]?.message ?? "Invalid name");
    PREVIEW_USER.display_name = r.data;
    return ok({ user: PREVIEW_USER });
  }
  if (route === "POST /auth/password" || route === "POST /data/delete")
    return err(403, "Not available in Preview Mode — there is no real account here.");
  if (route === "GET /data/summary") {
    return ok({
      task_lists: db.lists.length,
      tasks: db.tasks.length,
      notes: db.pages.filter((x) => x["project_id"] === null).length,
      project_pages: db.pages.filter((x) => x["project_id"] !== null).length,
      projects: db.projects.length,
      events: db.events.length,
      plan_activities: db.activities.length,
      mind_maps: db.maps.length,
      habits: db.habits.length,
      routines: db.routines.length,
    });
  }
  if (route === "GET /data/export") {
    return ok({
      format: "minddesk-backup",
      version: 1,
      exported_at: now(),
      preview: true,
      notes: "Exported from Preview Mode: temporary data that was never stored in a database.",
      account: {
        email: PREVIEW_USER.email,
        display_name: PREVIEW_USER.display_name,
        created_at: null,
      },
      preferences: previewSettings,
      task_lists: db.lists,
      tasks: db.tasks,
      projects: db.projects,
      pages: db.pages.map((pg) => ({ ...pg, content: db.pageContent.get(pg.id) ?? null })),
      calendar_events: db.events,
      plan_categories: db.categories,
      plan_activities: db.activities.map(activityDto),
      focus_sessions: db.focus,
      mind_maps: db.maps.map((m) => ({ ...m, data: db.mapData.get(m.id) ?? null })),
      routines: db.routines,
      habits: db.habits,
      habit_completions: [],
    });
  }

  if (route === "GET /analytics") {
    const range = (q.get("range") as "7d" | "30d" | "90d") || "30d";
    const tz = q.get("tz") || previewSettings.time_zone || "Asia/Kolkata";
    return ok(
      calculateProductivityAnalytics({
        tasks: db.tasks.map((t) => ({
          id: String(t.id),
          completed: Boolean(t["completed"]),
          completedAt: (t["completed_at"] as string) || null,
          dueDate: (t["due_date"] as string) || null,
          createdAt: (t["created_at"] as string) || now(),
          updatedAt: (t["updated_at"] as string) || now(),
        })),
        focusSessions: db.focus.map((f) => ({
          id: String(f.id),
          date: String(f["date"]),
          plannedMinutes: Number(f["planned_minutes"] ?? 25),
          focusedSeconds: Number(f["focused_seconds"] ?? 0),
          completed: Boolean(f["completed"]),
          startedAt: String(f["started_at"] ?? now()),
          endedAt: String(f["ended_at"] ?? now()),
        })),
        habits: db.habits.map((h) => ({
          id: String(h.id),
          title: String(h["title"] ?? ""),
          color: String(h["color"] ?? "blue"),
          repeatDays: Number(h["repeat_days"] ?? 127),
          startDate: String(h["start_date"] ?? "2026-01-01"),
          completions: (h["completions"] as string[]) ?? [],
        })),
        range,
        timeZone: tz,
      }),
    );
  }

  switch (route) {
    // ---- task lists ----
    case "GET /task-lists":
      return ok(sortPos(db.lists));
    case "POST /task-lists": {
      const r = {
        id: uid(),
        user_id: PREVIEW_USER.id,
        title: String(b["title"]).trim(),
        position: (b["position"] as number) ?? Date.now(),
        created_at: now(),
        updated_at: now(),
      };
      db.lists.push(r);
      return ok(r, 201);
    }
    case "PATCH /task-lists/:x": {
      const r = find(db.lists, id);
      if (!r) return err(404, "List not found");
      return ok(touch(r, { title: b["title"], position: b["position"] }));
    }
    case "DELETE /task-lists/:x":
      if (!find(db.lists, id)) return err(404, "List not found");
      remove(db.lists, (r) => r.id === id);
      remove(db.tasks, (t) => t["list_id"] === id);
      return ok({ ok: true });

    // ---- tasks ----
    case "GET /tasks":
      return ok(sortPos(db.tasks));
    case "POST /tasks": {
      if (!find(db.lists, String(b["list_id"]))) return err(404, "List not found");
      const r = {
        id: uid(),
        user_id: PREVIEW_USER.id,
        list_id: b["list_id"],
        parent_id: b["parent_id"] ?? null,
        title: String(b["title"]).trim(),
        description: b["description"] ?? null,
        completed: false,
        completed_at: null,
        starred: false,
        due_date: b["due_date"] ?? null,
        recurrence_rule: null,
        position: (b["position"] as number) ?? Date.now(),
        created_at: now(),
        updated_at: now(),
      };
      db.tasks.push(r);
      return ok(r, 201);
    }
    case "PATCH /tasks/:x": {
      const t = find(db.tasks, id);
      if (!t) return err(404, "Task not found");
      if (b["completed"] !== undefined) t["completed_at"] = b["completed"] ? now() : null;
      touch(t, {
        title: b["title"],
        description: b["description"],
        starred: b["starred"],
        position: b["position"],
        list_id: b["list_id"],
        due_date: b["due_date"],
        completed: b["completed"],
      });
      if (b["list_id"])
        for (const s of db.tasks) if (s["parent_id"] === id) s["list_id"] = b["list_id"];
      return ok(t);
    }
    case "DELETE /tasks/:x":
      if (!find(db.tasks, id)) return err(404, "Task not found");
      remove(db.tasks, (t) => t.id === id || t["parent_id"] === id);
      return ok({ ok: true });

    // ---- projects ----
    case "GET /projects":
      return ok(sortPos(db.projects));
    case "POST /projects": {
      const r = {
        id: uid(),
        title: String(b["title"]).trim(),
        position: Date.now(),
        is_pinned: false,
        created_at: now(),
        updated_at: now(),
      };
      db.projects.push(r);
      return ok(r, 201);
    }
    case "PATCH /projects/:x": {
      const r = find(db.projects, id);
      if (!r) return err(404, "Project not found");
      const patchData: Record<string, unknown> = {};
      if (b["title"] !== undefined) patchData["title"] = b["title"];
      if (b["is_pinned"] !== undefined) patchData["is_pinned"] = Boolean(b["is_pinned"]);
      return ok(touch(r, patchData));
    }
    case "DELETE /projects/:x":
      if (!find(db.projects, id)) return err(404, "Project not found");
      remove(db.projects, (r) => r.id === id);
      remove(db.pages, (r) => r["project_id"] === id);
      return ok({ ok: true });

    // ---- pages ----
    case "GET /pages":
      return ok(sortPos(db.pages));
    case "POST /pages": {
      let projectId = (b["project_id"] as string | null | undefined) ?? null;
      if (b["parent_id"]) {
        const parent = find(db.pages, String(b["parent_id"]));
        if (!parent) return err(404, "Parent page not found");
        projectId = parent["project_id"] as string | null;
      }
      const r = {
        id: uid(),
        project_id: projectId,
        parent_id: b["parent_id"] ?? null,
        title: String(b["title"] ?? "").trim(),
        position: Date.now(),
        is_pinned: false,
        version: 1,
        created_at: now(),
        updated_at: now(),
      };
      db.pages.push(r);
      db.pageContent.set(r.id, b["content"] ?? emptyContent());
      return ok(r, 201);
    }
    case "GET /pages/:x": {
      const r = find(db.pages, id);
      if (!r) return err(404, "Page not found");
      return ok({ ...r, content: db.pageContent.get(id) ?? emptyContent() });
    }
    case "PATCH /pages/:x": {
      const r = find(db.pages, id);
      if (!r) return err(404, "Page not found");
      if (b["content"]) {
        if (b["base_version"] !== r["version"])
          return {
            status: 409,
            data: { error: "This page was changed elsewhere.", version: r["version"] },
          };
        db.pageContent.set(id, b["content"]);
        r["version"] = (r["version"] as number) + 1;
      }
      const patchData: Record<string, unknown> = {};
      if (b["title"] !== undefined) patchData["title"] = b["title"];
      if (b["is_pinned"] !== undefined) patchData["is_pinned"] = Boolean(b["is_pinned"]);
      return ok(touch(r, patchData));
    }
    case "DELETE /pages/:x": {
      if (!find(db.pages, id)) return err(404, "Page not found");
      const ids = new Set(descendants(db.pages, id, "parent_id"));
      remove(db.pages, (r) => ids.has(r.id));
      return ok({ ok: true });
    }

    // ---- calendar ----
    case "GET /events": {
      const from = q.get("from") ?? "",
        to = q.get("to") ?? "";
      return ok(
        db.events.filter(
          (e) =>
            e["recurrence_rule"] ||
            ((e["start_at"] as string) <= to && (e["end_at"] as string) >= from.slice(0, 10)),
        ),
      );
    }
    case "POST /events": {
      if (!b["title"] || (!b["all_day"] && String(b["end_at"]) <= String(b["start_at"])))
        return err(400, "End must be after the start");
      const r = { ...b, id: uid(), created_at: now(), updated_at: now() } as Row;
      db.events.push(r);
      return ok(r, 201);
    }
    case "GET /events/:x": {
      const r = find(db.events, id);
      return r ? ok(r) : err(404, "Event not found");
    }
    case "PUT /events/:x": {
      const r = find(db.events, id);
      return r ? ok(touch(r, b)) : err(404, "Event not found");
    }
    case "DELETE /events/:x":
      if (!find(db.events, id)) return err(404, "Event not found");
      remove(db.events, (r) => r.id === id);
      return ok({ ok: true });
  }

  // ---- habits & routines (same validation as the server) ----
  if (p[1] === "habits" || p[1] === "routines") {
    const hid = p[2] ?? "";
    const bad = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
      err(400, r.error?.issues[0]?.message ?? "Invalid input");
    const sorted = (rows: Row[]) => sortPos(rows);
    if (p[1] === "routines") {
      if (!hid && method === "POST") {
        const r = RoutineInput.safeParse(b);
        if (!r.success) return bad(r);
        const row = {
          id: uid(),
          title: r.data.title,
          position: Date.now(),
          collapsed: false,
          created_at: now(),
          updated_at: now(),
        };
        db.routines.push(row);
        return ok(row, 201);
      }
      const rt = find(db.routines, hid);
      if (!rt) return err(404, "Routine not found");
      if (method === "PATCH") {
        const r = RoutinePatch.safeParse(b);
        if (!r.success) return bad(r);
        return ok(touch(rt, r.data));
      }
      if (method === "DELETE") {
        for (const x of db.habits)
          if (x["routine_id"] === hid) touch(x, { routine_id: null, position: Date.now() });
        remove(db.routines, (x) => x.id === hid);
        return ok({ ok: true });
      }
    }
    if (p[1] === "habits") {
      if (!hid && method === "GET")
        return ok({ habits: sorted(db.habits), routines: sorted(db.routines) });
      if (!hid && method === "POST") {
        const r = HabitInput.safeParse(b);
        if (!r.success) return bad(r);
        if (r.data.routine_id && !find(db.routines, r.data.routine_id))
          return err(404, "Routine not found");
        const row = {
          id: uid(),
          routine_id: r.data.routine_id ?? null,
          title: r.data.title,
          description: r.data.description?.trim() || null,
          color: r.data.color,
          repeat_days: r.data.repeat_days,
          position: Date.now(),
          start_date: r.data.start_date ?? todayIn(),
          completions: [] as string[],
          created_at: now(),
          updated_at: now(),
        };
        db.habits.push(row);
        return ok(row, 201);
      }
      if (hid === "order" && method === "PUT") {
        const r = OrderInput.safeParse(b);
        if (!r.success) return bad(r);
        if (r.data.routine_id && !find(db.routines, r.data.routine_id))
          return err(404, "Routine not found");
        if (r.data.habit_ids.some((id) => !find(db.habits, id))) return err(404, "Habit not found");
        r.data.habit_ids.forEach((id, i) =>
          touch(find(db.habits, id)!, { routine_id: r.data.routine_id, position: i + 1 }),
        );
        return ok({ ok: true });
      }
      const hb = find(db.habits, hid);
      if (!hb) return err(404, "Habit not found");
      if (p[3] === "completions") {
        const date = p[4] ?? "";
        const list = hb["completions"] as string[];
        if (method === "PUT") {
          const msg = completionError(hb as never, date);
          if (msg) return err(400, msg);
          if (!list.includes(date)) list.push(date);
          return ok({ habit_id: hid, date, completed: true });
        }
        if (method === "DELETE") {
          if (!isDateKey(date)) return err(400, "Invalid date");
          hb["completions"] = list.filter((d) => d !== date);
          return ok({ habit_id: hid, date, completed: false });
        }
      }
      if (method === "PATCH") {
        const r = HabitPatch.safeParse(b);
        if (!r.success) return bad(r);
        if (r.data.routine_id && !find(db.routines, r.data.routine_id))
          return err(404, "Routine not found");
        const moving = r.data.routine_id !== undefined && r.data.routine_id !== hb["routine_id"];
        return ok(
          touch(hb, {
            ...r.data,
            ...(r.data.description !== undefined
              ? { description: r.data.description?.trim() || null }
              : {}),
            ...(moving ? { position: Date.now() } : {}),
          }),
        );
      }
      if (method === "DELETE") {
        remove(db.habits, (x) => x.id === hid);
        return ok({ ok: true });
      }
    }
  }

  // ---- mind maps (same validation and version checks as the server) ----
  if (p[1] === "mind-maps") {
    const mid = p[2] ?? "";
    const meta = (m: Row) => ({ ...m });
    if (!mid && method === "GET")
      return ok(
        [...db.maps]
          .sort((a, b) => String(b["updated_at"]).localeCompare(String(a["updated_at"])))
          .map(meta),
      );
    if (!mid && method === "POST") {
      const title = String(b["title"] ?? "").trim();
      if (!title) return err(400, "Title is required");
      const parsed =
        b["data"] === undefined
          ? { success: true as const, data: newDoc(title) }
          : DocSchema.safeParse(b["data"]);
      if (!parsed.success) return err(400, "Invalid input");
      const r = {
        id: uid(),
        title,
        node_count: parsed.data.nodes.length,
        is_pinned: false,
        version: 1,
        created_at: now(),
        updated_at: now(),
      } as Row;
      db.maps.push(r);
      db.mapData.set(r.id, parsed.data);
      return ok(meta(r), 201);
    }
    const m = find(db.maps, mid);
    if (!m) return err(404, "Mind map not found");
    if (method === "GET") return ok({ ...meta(m), data: db.mapData.get(mid) });
    if (method === "DELETE") {
      remove(db.maps, (r) => r.id === mid);
      db.mapData.delete(mid);
      return ok({ ok: true });
    }
    if (method === "PATCH") {
      if (b["data"] !== undefined) {
        const parsed = DocSchema.safeParse(b["data"]);
        if (!parsed.success) return err(400, "Invalid input");
        if (b["base_version"] !== m["version"])
          return {
            status: 409,
            data: { error: "This mind map was changed elsewhere.", version: m["version"] },
          };
        db.mapData.set(mid, parsed.data);
        touch(m, { version: (m["version"] as number) + 1, node_count: parsed.data.nodes.length });
      }
      const patchData: Record<string, unknown> = {};
      if (typeof b["title"] === "string" && (b["title"] as string).trim())
        patchData["title"] = (b["title"] as string).trim();
      if (b["is_pinned"] !== undefined) patchData["is_pinned"] = Boolean(b["is_pinned"]);
      if (b["is_locked"] !== undefined) patchData["is_locked"] = Boolean(b["is_locked"]);
      if (Object.keys(patchData).length > 0) touch(m, patchData);
      return ok(meta(m));
    }
  }

  // ---- images ----
  if (p[1] === "images") {
    const imgId = p[2] ?? "";
    if (!imgId && method === "POST") {
      const id = uid();
      let fileName = "screenshot.png";
      let mimeType = "image/png";
      let dataUrl = "";
      let fileSize = 1024;
      if (b && typeof b === "object") {
        const bodyObj = b as Record<string, unknown>;
        if (typeof bodyObj["fileName"] === "string") fileName = bodyObj["fileName"];
        if (typeof bodyObj["mimeType"] === "string") mimeType = bodyObj["mimeType"];
        if (typeof bodyObj["dataUrl"] === "string") dataUrl = bodyObj["dataUrl"];
        if (typeof bodyObj["fileSize"] === "number") fileSize = bodyObj["fileSize"];
      }
      db.images.set(id, { dataUrl, mimeType, fileName, fileSize });
      saveSessionDb();
      return ok(
        {
          id,
          url: dataUrl || `/api/images/${id}`,
          fileName,
          fileSize,
          mimeType,
        },
        201,
      );
    }
    if (imgId && method === "GET") {
      const img = db.images.get(imgId);
      if (!img) return err(404, "Image not found");
      return ok({ id: imgId, ...img });
    }
  }

  // ---- plan your day ----
  const sub = p[2] ?? "",
    pid = p[3] ?? "";
  if (p[1] === "plan") {
    if (sub === "categories") {
      if (method === "GET") return ok(sortPos(db.categories));
      if (method === "POST") {
        const r = {
          id: uid(),
          name: String(b["name"]).trim(),
          color: b["color"],
          position: Date.now(),
          is_default: false,
          created_at: now(),
          updated_at: now(),
        };
        db.categories.push(r);
        return ok(r, 201);
      }
      const c = find(db.categories, pid);
      if (!c) return err(404, "Category not found");
      if (method === "PATCH") return ok(touch(c, { name: b["name"], color: b["color"] }));
      if (method === "DELETE") {
        if (c["is_default"]) return err(400, "Default categories can't be deleted");
        remove(db.categories, (r) => r.id === pid);
        for (const a of db.activities) if (a["category_id"] === pid) a["category_id"] = null;
        return ok({ ok: true });
      }
    }
    if (sub === "activities") {
      if (method === "GET" && !pid) {
        const from = q.get("from") ?? "",
          to = q.get("to") ?? "";
        return ok(
          db.activities
            .filter((a) => activityInRange(a as unknown as PlanActivity, from, to))
            .map(activityDto),
        );
      }
      if (method === "POST" && !pid) {
        const e = checkActivity(b);
        if (e) return err(400, e);
        const r = { ...b, id: uid(), created_at: now(), updated_at: now() } as Row;
        db.activities.push(r);
        return ok(activityDto(r), 201);
      }
      const a = find(db.activities, pid);
      if (!a) return err(404, "Activity not found");
      if (p[4] === "exceptions") {
        const date = p[5] ?? "";
        remove(db.exceptions, (x) => x["activity_id"] === pid && x["date"] === date);
        if (method === "PUT")
          db.exceptions.push({
            id: uid(),
            activity_id: pid,
            date,
            cancelled: !!b["cancelled"],
            start_minute: b["start_minute"] ?? null,
            end_minute: b["end_minute"] ?? null,
          });
        return ok(activityDto(a));
      }
      if (method === "PUT") {
        const e = checkActivity(b);
        if (e) return err(400, e);
        return ok(activityDto(touch(a, b)));
      }
      if (method === "DELETE") {
        remove(db.activities, (r) => r.id === pid);
        remove(db.exceptions, (x) => x["activity_id"] === pid);
        return ok({ ok: true });
      }
    }
    if (sub === "focus-sessions") {
      if (method === "GET")
        return ok(db.focus.filter((f) => !q.get("date") || f["date"] === q.get("date")));
      if (method === "POST") {
        const r = { ...b, id: uid(), created_at: now() } as Row;
        db.focus.push(r);
        return ok(r, 201);
      }
    }
  }
  return err(404, `Preview Mode has no handler for ${method} ${url.pathname}`);
}

export function previewRequest(
  method: string,
  rawPath: string,
  body?: Record<string, unknown>,
): Res {
  const result = handlePreviewRequest(method, rawPath, body);
  if (method !== "GET" && result.status < 400) {
    saveSessionDb();
  }
  return result;
}
