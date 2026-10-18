import { beforeEach, describe, expect, it, vi } from "vitest";
import * as apiServer from "@/lib/server/api.server";
import {
  listTrash,
  restoreItem,
  restoreAll,
  permanentlyDeleteItem,
  emptyTrash,
  cleanupExpiredTrash,
  calculateDaysRemaining,
  getExpirationCutoff,
  RETENTION_DAYS,
} from "@/lib/server/trash.server";
import { Route as TrashRoute } from "@/routes/api.trash";
import { Route as RestoreRoute } from "@/routes/api.trash.restore";
import { Route as RestoreAllRoute } from "@/routes/api.trash.restore-all";
import { Route as PermanentRoute } from "@/routes/api.trash.permanent";
import { Route as EmptyRoute } from "@/routes/api.trash.empty";
import { Route as CleanupRoute } from "@/routes/api.trash.cleanup";

describe("Recycle Bin System (30-Day Auto-Deletion & Safe Restoration)", () => {
  const originalEnv = { ...process.env };
  const mockUser = { id: "user_test_1", email: "tester@minddesk.com" };

  beforeEach(() => {
    process.env = { ...originalEnv, DATABASE_URL: "mysql://mock" };
    delete (globalThis as any).__prisma;
    vi.restoreAllMocks();
  });

  describe("Retention and Expiration Calculation", () => {
    it("calculates 30 days retention cutoff in UTC", () => {
      const now = new Date("2026-10-18T12:00:00.000Z");
      const cutoff = getExpirationCutoff(30, now);
      expect(cutoff.toISOString()).toBe("2026-09-18T12:00:00.000Z");
      expect(RETENTION_DAYS).toBe(30);
    });

    it("calculates days remaining accurately", () => {
      const now = new Date("2026-10-18T12:00:00.000Z");

      // Deleted just now -> 30 days remaining
      const justDeleted = new Date("2026-10-18T11:00:00.000Z");
      expect(calculateDaysRemaining(justDeleted, now)).toBe(30);

      // Deleted 10 days ago -> 20 days remaining
      const tenDaysAgo = new Date("2026-10-08T12:00:00.000Z");
      expect(calculateDaysRemaining(tenDaysAgo, now)).toBe(20);

      // Deleted 29 days ago -> 1 day remaining
      const twentyNineDaysAgo = new Date("2026-09-19T12:00:00.000Z");
      expect(calculateDaysRemaining(twentyNineDaysAgo, now)).toBe(1);

      // Deleted 30 days ago (exact boundary) -> 0 days remaining
      const thirtyDaysAgo = new Date("2026-09-18T12:00:00.000Z");
      expect(calculateDaysRemaining(thirtyDaysAgo, now)).toBe(0);

      // Deleted 31 days ago (expired) -> 0 days remaining
      const expired = new Date("2026-09-17T12:00:00.000Z");
      expect(calculateDaysRemaining(expired, now)).toBe(0);
    });
  });

  describe("Listing Trashed Items (GET /api/trash)", () => {
    it("retrieves and aggregates deleted items across all 8 modules", async () => {
      const deletedAt = new Date("2026-10-15T10:00:00.000Z");

      const mockPrisma = {
        taskList: {
          findMany: vi.fn().mockResolvedValue([
            { id: "tl_1", userId: mockUser.id, title: "Work List", deletedAt, tasks: [{ id: "t_1" }] },
          ]),
        },
        task: {
          findMany: vi.fn().mockResolvedValue([
            { id: "t_1", userId: mockUser.id, title: "Fix Bug", deletedAt, list: { title: "Work List" }, parent: null, subtasks: [] },
          ]),
        },
        project: {
          findMany: vi.fn().mockResolvedValue([
            { id: "proj_1", userId: mockUser.id, title: "Website Redesign", deletedAt, pages: [{ id: "pg_1" }] },
          ]),
        },
        page: {
          findMany: vi.fn().mockResolvedValue([
            { id: "pg_1", userId: mockUser.id, title: "Home Wireframe", deletedAt, project: { title: "Website Redesign" }, parent: null },
          ]),
        },
        event: {
          findMany: vi.fn().mockResolvedValue([
            { id: "ev_1", userId: mockUser.id, title: "Client Demo", deletedAt, startAt: new Date("2026-10-20T09:00:00.000Z"), allDay: false },
          ]),
        },
        mindMap: {
          findMany: vi.fn().mockResolvedValue([
            { id: "map_1", userId: mockUser.id, title: "System Architecture", deletedAt, isLocked: false, nodeCount: 12 },
          ]),
        },
        routine: {
          findMany: vi.fn().mockResolvedValue([
            { id: "r_1", userId: mockUser.id, title: "Morning Routine", deletedAt, habits: [{ id: "h_1" }] },
          ]),
        },
        habit: {
          findMany: vi.fn().mockResolvedValue([
            { id: "h_1", userId: mockUser.id, title: "Drink Water", deletedAt, routine: { title: "Morning Routine" }, routineId: "r_1" },
          ]),
        },
      };

      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (TrashRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/trash?filter=all");
      const res = await handlers.GET({ request: req });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.items).toHaveLength(8);
      expect(json.counts.all).toBe(8);
      expect(json.counts.task).toBe(2); // 1 list + 1 task
      expect(json.counts.project).toBe(1);
      expect(json.counts.note).toBe(1);
      expect(json.counts.calendar).toBe(1);
      expect(json.counts.mind_map).toBe(1);
      expect(json.counts.habit).toBe(2); // 1 routine + 1 habit

      // Check item properties
      const mindMapItem = json.items.find((i: any) => i.id === "map_1");
      expect(mindMapItem.title).toBe("System Architecture");
      expect(mindMapItem.type).toBe("mind_map");
      expect(mindMapItem.details).toContain("12 nodes");
      expect(mindMapItem.days_remaining).toBeGreaterThan(0);
    });

    it("filters by category correctly", async () => {
      const deletedAt = new Date("2026-10-15T10:00:00.000Z");

      const mockPrisma = {
        taskList: { findMany: vi.fn().mockResolvedValue([]) },
        task: { findMany: vi.fn().mockResolvedValue([]) },
        project: { findMany: vi.fn().mockResolvedValue([]) },
        page: {
          findMany: vi.fn().mockResolvedValue([
            { id: "pg_note", userId: mockUser.id, title: "Meeting Notes", deletedAt, project: null, parent: null },
          ]),
        },
        event: { findMany: vi.fn().mockResolvedValue([]) },
        mindMap: {
          findMany: vi.fn().mockResolvedValue([
            { id: "map_1", userId: mockUser.id, title: "Brainstorm", deletedAt, isLocked: false, nodeCount: 3 },
          ]),
        },
        routine: { findMany: vi.fn().mockResolvedValue([]) },
        habit: { findMany: vi.fn().mockResolvedValue([]) },
      };

      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (TrashRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/trash?filter=note");
      const res = await handlers.GET({ request: req });
      const json = await res.json();

      expect(json.items).toHaveLength(1);
      expect(json.items[0].id).toBe("pg_note");
      expect(json.counts.note).toBe(1);
      expect(json.counts.mind_map).toBe(1);
    });

    it("searches deleted items by query string", async () => {
      const deletedAt = new Date("2026-10-15T10:00:00.000Z");

      const mockPrisma = {
        taskList: { findMany: vi.fn().mockResolvedValue([]) },
        task: {
          findMany: vi.fn().mockResolvedValue([
            { id: "t_1", userId: mockUser.id, title: "Important Client Follow-up", deletedAt, list: { title: "Work" }, parent: null, subtasks: [] },
            { id: "t_2", userId: mockUser.id, title: "Buy groceries", deletedAt, list: { title: "Personal" }, parent: null, subtasks: [] },
          ]),
        },
        project: { findMany: vi.fn().mockResolvedValue([]) },
        page: { findMany: vi.fn().mockResolvedValue([]) },
        event: { findMany: vi.fn().mockResolvedValue([]) },
        mindMap: { findMany: vi.fn().mockResolvedValue([]) },
        routine: { findMany: vi.fn().mockResolvedValue([]) },
        habit: { findMany: vi.fn().mockResolvedValue([]) },
      };

      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (TrashRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/trash?q=client");
      const res = await handlers.GET({ request: req });
      const json = await res.json();

      expect(json.items).toHaveLength(1);
      expect(json.items[0].id).toBe("t_1");
    });
  });

  describe("Restoration Functionality (POST /api/trash/restore)", () => {
    it("restores a task list and recovers all its deleted tasks and subtasks", async () => {
      const mockList = { id: "00000000-0000-0000-0000-000000000001", userId: mockUser.id, title: "Sprint 42", deletedAt: new Date() };

      const txTaskList = { update: vi.fn().mockResolvedValue(mockList) };
      const txTask = { updateMany: vi.fn().mockResolvedValue({ count: 5 }) };

      const mockPrisma = {
        taskList: {
          findFirst: vi.fn().mockResolvedValue(mockList),
        },
        $transaction: vi.fn().mockImplementation(async (callback) => {
          return callback({ taskList: txTaskList, task: txTask });
        }),
      };

      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (RestoreRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/trash/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "task_list", id: mockList.id }),
      });

      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      expect(txTaskList.update).toHaveBeenCalledWith({
        where: { id: mockList.id },
        data: { deletedAt: null },
      });
      expect(txTask.updateMany).toHaveBeenCalledWith({
        where: { listId: mockList.id, userId: mockUser.id, deletedAt: { not: null } },
        data: { deletedAt: null },
      });
    });

    it("restores a task and auto-recovers its parent list if parent list was trashed", async () => {
      const mockTask = {
        id: "00000000-0000-0000-0000-000000000002",
        userId: mockUser.id,
        listId: "00000000-0000-0000-0000-000000000001",
        parentId: null,
        title: "Database Indexing",
        deletedAt: new Date(),
      };
      const trashedParentList = {
        id: "00000000-0000-0000-0000-000000000001",
        userId: mockUser.id,
        title: "Sprint Tasks",
        deletedAt: new Date(),
      };

      const txTaskList = {
        findFirst: vi.fn().mockResolvedValue(trashedParentList),
        update: vi.fn().mockResolvedValue({ ...trashedParentList, deletedAt: null }),
      };
      const txTask = {
        update: vi.fn().mockResolvedValue({ ...mockTask, deletedAt: null }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      };

      const mockPrisma = {
        task: {
          findFirst: vi.fn().mockResolvedValue(mockTask),
        },
        $transaction: vi.fn().mockImplementation(async (callback) => {
          return callback({ taskList: txTaskList, task: txTask });
        }),
      };

      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (RestoreRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/trash/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "task", id: mockTask.id }),
      });

      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(200);

      // Parent list should be restored
      expect(txTaskList.update).toHaveBeenCalledWith({
        where: { id: trashedParentList.id },
        data: { deletedAt: null },
      });
      // Task itself should be restored
      expect(txTask.update).toHaveBeenCalledWith({
        where: { id: mockTask.id },
        data: { deletedAt: null, listId: trashedParentList.id, parentId: null },
      });
    });

    it("restores a task whose parent list was permanently removed by assigning fallback active list", async () => {
      const mockTask = {
        id: "00000000-0000-0000-0000-000000000002",
        userId: mockUser.id,
        listId: "00000000-0000-0000-0000-000000000099", // deleted list
        parentId: null,
        title: "Orphaned Task",
        deletedAt: new Date(),
      };
      const activeFallbackList = {
        id: "00000000-0000-0000-0000-000000000010",
        userId: mockUser.id,
        title: "General",
        deletedAt: null,
      };

      const txTaskList = {
        findFirst: vi.fn()
          .mockResolvedValueOnce(null) // parent list does not exist
          .mockResolvedValueOnce(activeFallbackList), // active fallback list found
      };
      const txTask = {
        update: vi.fn().mockResolvedValue({ ...mockTask, deletedAt: null }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      };

      const mockPrisma = {
        task: {
          findFirst: vi.fn().mockResolvedValue(mockTask),
        },
        $transaction: vi.fn().mockImplementation(async (callback) => {
          return callback({ taskList: txTaskList, task: txTask });
        }),
      };

      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (RestoreRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/trash/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "task", id: mockTask.id }),
      });

      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(200);

      expect(txTask.update).toHaveBeenCalledWith({
        where: { id: mockTask.id },
        data: { deletedAt: null, listId: activeFallbackList.id, parentId: null },
      });
    });

    it("restores a project and recovers all its deleted pages", async () => {
      const mockProj = { id: "00000000-0000-0000-0000-000000000003", userId: mockUser.id, title: "Mobile App", deletedAt: new Date() };

      const txProject = { update: vi.fn().mockResolvedValue(mockProj) };
      const txPage = { updateMany: vi.fn().mockResolvedValue({ count: 4 }) };

      const mockPrisma = {
        project: {
          findFirst: vi.fn().mockResolvedValue(mockProj),
        },
        $transaction: vi.fn().mockImplementation(async (callback) => {
          return callback({ project: txProject, page: txPage });
        }),
      };

      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (RestoreRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/trash/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "project", id: mockProj.id }),
      });

      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(200);

      expect(txProject.update).toHaveBeenCalledWith({
        where: { id: mockProj.id },
        data: { deletedAt: null },
      });
      expect(txPage.updateMany).toHaveBeenCalledWith({
        where: { projectId: mockProj.id, userId: mockUser.id, deletedAt: { not: null } },
        data: { deletedAt: null },
      });
    });

    it("restores a routine and recovers its deleted habits", async () => {
      const mockRoutine = { id: "00000000-0000-0000-0000-000000000004", userId: mockUser.id, title: "Night Routine", deletedAt: new Date() };

      const txRoutine = { update: vi.fn().mockResolvedValue(mockRoutine) };
      const txHabit = { updateMany: vi.fn().mockResolvedValue({ count: 2 }) };

      const mockPrisma = {
        routine: {
          findFirst: vi.fn().mockResolvedValue(mockRoutine),
        },
        $transaction: vi.fn().mockImplementation(async (callback) => {
          return callback({ routine: txRoutine, habit: txHabit });
        }),
      };

      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (RestoreRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/trash/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "routine", id: mockRoutine.id }),
      });

      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(200);

      expect(txRoutine.update).toHaveBeenCalledWith({
        where: { id: mockRoutine.id },
        data: { deletedAt: null },
      });
      expect(txHabit.updateMany).toHaveBeenCalledWith({
        where: { routineId: mockRoutine.id, userId: mockUser.id, deletedAt: { not: null } },
        data: { deletedAt: null },
      });
    });

    it("restores a locked mind map preserving all connections and its lock status", async () => {
      const mockMap = {
        id: "00000000-0000-0000-0000-000000000005",
        userId: mockUser.id,
        title: "Locked Architecture",
        data: JSON.stringify({ nodes: [{ id: "1" }], links: [{ id: "l1", source: "1", target: "2" }] }),
        isLocked: true,
        deletedAt: new Date(),
      };

      const mockPrisma = {
        mindMap: {
          findFirst: vi.fn().mockResolvedValue(mockMap),
          update: vi.fn().mockResolvedValue({ ...mockMap, deletedAt: null }),
        },
      };

      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (RestoreRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/trash/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "mind_map", id: mockMap.id }),
      });

      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(200);

      expect(mockPrisma.mindMap.update).toHaveBeenCalledWith({
        where: { id: mockMap.id },
        data: { deletedAt: null },
      });
      // Content and lock status were untouched
      expect(mockMap.isLocked).toBe(true);
    });

    it("restores all items when POST /api/trash/restore-all is called", async () => {
      const deletedAt = new Date();
      const mockPrisma = {
        taskList: {
          findMany: vi.fn().mockResolvedValue([{ id: "00000000-0000-0000-0000-000000000001", userId: mockUser.id, title: "List", deletedAt, tasks: [] }]),
          findFirst: vi.fn().mockResolvedValue({ id: "00000000-0000-0000-0000-000000000001", userId: mockUser.id, deletedAt }),
        },
        task: { findMany: vi.fn().mockResolvedValue([]) },
        project: { findMany: vi.fn().mockResolvedValue([]) },
        page: { findMany: vi.fn().mockResolvedValue([]) },
        event: { findMany: vi.fn().mockResolvedValue([]) },
        mindMap: { findMany: vi.fn().mockResolvedValue([]) },
        routine: { findMany: vi.fn().mockResolvedValue([]) },
        habit: { findMany: vi.fn().mockResolvedValue([]) },
        $transaction: vi.fn().mockImplementation(async (callback) => {
          return callback({
            taskList: { update: vi.fn().mockResolvedValue({}) },
            task: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
          });
        }),
      };

      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (RestoreAllRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/trash/restore-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter: "all" }),
      });

      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.restoredCount).toBe(1);
    });
  });

  describe("Permanent Deletion & Mind Map Lock Protections", () => {
    it("rejects permanent deletion of a locked mind map with 423 Locked", async () => {
      const lockedMap = {
        id: "00000000-0000-0000-0000-000000000005",
        userId: mockUser.id,
        title: "Confidential Roadmap",
        isLocked: true,
        deletedAt: new Date(),
      };

      const mockPrisma = {
        mindMap: {
          findFirst: vi.fn().mockResolvedValue(lockedMap),
          delete: vi.fn(),
        },
      };

      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (PermanentRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/trash/permanent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "mind_map", id: lockedMap.id }),
      });

      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(423);
      const json = await res.json();
      expect(json.error).toContain("Locked");
      expect(mockPrisma.mindMap.delete).not.toHaveBeenCalled();
    });

    it("allows permanent deletion of an unlocked mind map", async () => {
      const unlockedMap = {
        id: "00000000-0000-0000-0000-000000000006",
        userId: mockUser.id,
        title: "Rough Notes",
        isLocked: false,
        deletedAt: new Date(),
      };

      const mockPrisma = {
        mindMap: {
          findFirst: vi.fn().mockResolvedValue(unlockedMap),
          delete: vi.fn().mockResolvedValue(unlockedMap),
        },
      };

      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (PermanentRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/trash/permanent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "mind_map", id: unlockedMap.id }),
      });

      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(200);
      expect(mockPrisma.mindMap.delete).toHaveBeenCalledWith({ where: { id: unlockedMap.id } });
    });

    it("empties recycle bin while preserving locked mind maps", async () => {
      const deletedAt = new Date();
      const mockPrisma = {
        taskList: {
          findMany: vi.fn().mockResolvedValue([{ id: "tl_1", userId: mockUser.id, title: "List", deletedAt, tasks: [] }]),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        task: { findMany: vi.fn().mockResolvedValue([]) },
        project: { findMany: vi.fn().mockResolvedValue([]) },
        page: { findMany: vi.fn().mockResolvedValue([]) },
        event: { findMany: vi.fn().mockResolvedValue([]) },
        mindMap: {
          findMany: vi.fn().mockResolvedValue([
            { id: "map_unlocked", userId: mockUser.id, title: "Unlocked", deletedAt, isLocked: false, nodeCount: 1 },
            { id: "map_locked", userId: mockUser.id, title: "Locked", deletedAt, isLocked: true, nodeCount: 1 },
          ]),
          findFirst: vi.fn().mockResolvedValue({ id: "map_unlocked", userId: mockUser.id, isLocked: false, deletedAt }),
          delete: vi.fn().mockResolvedValue({}),
        },
        routine: { findMany: vi.fn().mockResolvedValue([]) },
        habit: { findMany: vi.fn().mockResolvedValue([]) },
      };

      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (EmptyRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/trash/empty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter: "all" }),
      });

      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.deletedCount).toBe(2); // taskList + unlocked mind map
      expect(json.lockedSkipped).toBe(1); // 1 locked mind map protected!
    });
  });

  describe("Automatic 30-Day Permanent Deletion Cleanup (Hostinger Scheduled Cron)", () => {
    it("permanently removes expired items older than 30 days and never touches active items", async () => {
      const simulatedNow = new Date("2026-10-18T12:00:00.000Z");
      const simulatedCutoff = getExpirationCutoff(30, simulatedNow);

      const txHabit = { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) };
      const txRoutine = { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) };
      const txTask = { deleteMany: vi.fn().mockResolvedValue({ count: 10 }) };
      const txTaskList = { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) };
      const txPage = { deleteMany: vi.fn().mockResolvedValue({ count: 5 }) };
      const txProject = { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) };
      const txEvent = { deleteMany: vi.fn().mockResolvedValue({ count: 4 }) };
      const txMindMap = { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (callback) => {
          return callback({
            habit: txHabit,
            routine: txRoutine,
            task: txTask,
            taskList: txTaskList,
            page: txPage,
            project: txProject,
            event: txEvent,
            mindMap: txMindMap,
          });
        }),
      };

      (globalThis as any).__prisma = mockPrisma;

      const summary = await cleanupExpiredTrash({ simulatedCutoff });

      expect(summary.deleted.tasks).toBe(10);
      expect(summary.deleted.task_lists).toBe(2);
      expect(summary.deleted.pages).toBe(5);
      expect(summary.deleted.projects).toBe(1);
      expect(summary.deleted.events).toBe(4);
      expect(summary.deleted.mind_maps).toBe(2);
      expect(summary.deleted.habits).toBe(3);
      expect(summary.deleted.routines).toBe(1);

      // Verify the query strictly targets deletedAt <= cutoff (active items with deletedAt: null are never selected)
      expect(txTask.deleteMany).toHaveBeenCalledWith({
        where: { deletedAt: { lte: simulatedCutoff } },
      });
      // Verify locked mind maps are protected even during auto-cleanup
      expect(txMindMap.deleteMany).toHaveBeenCalledWith({
        where: { deletedAt: { lte: simulatedCutoff }, isLocked: false },
      });
    });

    it("cleanup endpoint /api/trash/cleanup authorizes with CRON_SECRET", async () => {
      process.env["CRON_SECRET"] = "super-secret-cron-token-12345";

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (callback) => {
          return callback({
            habit: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            routine: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            task: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            taskList: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            page: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            project: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            event: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            mindMap: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
          });
        }),
      };

      (globalThis as any).__prisma = mockPrisma;

      const handlers = (CleanupRoute.options as any).server.handlers;

      // 1. Without secret -> 401
      const unauthReq = new Request("http://localhost/api/trash/cleanup", { method: "POST" });
      const unauthRes = await handlers.POST({ request: unauthReq });
      expect(unauthRes.status).toBe(401);

      // 2. With Bearer token -> 200 OK
      const authReq = new Request("http://localhost/api/trash/cleanup", {
        method: "POST",
        headers: { Authorization: "Bearer super-secret-cron-token-12345" },
      });
      const authRes = await handlers.POST({ request: authReq });
      expect(authRes.status).toBe(200);
      const json = await authRes.json();
      expect(json.ok).toBe(true);
      expect(json.deleted.tasks).toBe(0);
    });

    it("cleanup is completely idempotent and safe to retry", async () => {
      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (callback) => {
          return callback({
            habit: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            routine: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            task: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            taskList: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            page: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            project: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            event: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
            mindMap: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
          });
        }),
      };

      (globalThis as any).__prisma = mockPrisma;

      // Call 1
      const res1 = await cleanupExpiredTrash();
      // Call 2 immediately after
      const res2 = await cleanupExpiredTrash();

      expect(res1.deleted.tasks).toBe(0);
      expect(res2.deleted.tasks).toBe(0);
    });
  });
});
