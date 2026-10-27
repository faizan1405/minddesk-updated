/* eslint-disable @typescript-eslint/no-explicit-any */
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
    process.env = {
      ...originalEnv,
      DATABASE_URL: "mysql://mock",
      DATA_PRESERVATION_MODE: "disabled",
    };
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
            {
              id: "tl_1",
              userId: mockUser.id,
              title: "Work List",
              deletedAt,
              tasks: [{ id: "t_1" }],
            },
          ]),
        },
        task: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "t_1",
              userId: mockUser.id,
              title: "Fix Bug",
              deletedAt,
              list: { title: "Work List" },
              parent: null,
              subtasks: [],
            },
          ]),
        },
        project: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "proj_1",
              userId: mockUser.id,
              title: "Website Redesign",
              deletedAt,
              pages: [{ id: "pg_1" }],
            },
          ]),
        },
        page: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "pg_1",
              userId: mockUser.id,
              title: "Home Wireframe",
              deletedAt,
              project: { title: "Website Redesign" },
              parent: null,
            },
          ]),
        },
        event: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "ev_1",
              userId: mockUser.id,
              title: "Client Demo",
              deletedAt,
              startAt: new Date("2026-10-20T09:00:00.000Z"),
              allDay: false,
            },
          ]),
        },
        mindMap: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "map_1",
              userId: mockUser.id,
              title: "System Architecture",
              deletedAt,
              isLocked: false,
              nodeCount: 12,
            },
          ]),
        },
        routine: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "r_1",
              userId: mockUser.id,
              title: "Morning Routine",
              deletedAt,
              habits: [{ id: "h_1" }],
            },
          ]),
        },
        habit: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "h_1",
              userId: mockUser.id,
              title: "Drink Water",
              deletedAt,
              routine: { title: "Morning Routine" },
              routineId: "r_1",
            },
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
            {
              id: "pg_note",
              userId: mockUser.id,
              title: "Meeting Notes",
              deletedAt,
              project: null,
              parent: null,
            },
          ]),
        },
        event: { findMany: vi.fn().mockResolvedValue([]) },
        mindMap: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "map_1",
              userId: mockUser.id,
              title: "Brainstorm",
              deletedAt,
              isLocked: false,
              nodeCount: 3,
            },
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
            {
              id: "t_1",
              userId: mockUser.id,
              title: "Important Client Follow-up",
              deletedAt,
              list: { title: "Work" },
              parent: null,
              subtasks: [],
            },
            {
              id: "t_2",
              userId: mockUser.id,
              title: "Buy groceries",
              deletedAt,
              list: { title: "Personal" },
              parent: null,
              subtasks: [],
            },
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
      const mockList = {
        id: "00000000-0000-0000-0000-000000000001",
        userId: mockUser.id,
        title: "Sprint 42",
        deletedAt: new Date(),
      };

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
        findFirst: vi
          .fn()
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
      const mockProj = {
        id: "00000000-0000-0000-0000-000000000003",
        userId: mockUser.id,
        title: "Mobile App",
        deletedAt: new Date(),
      };

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
      const mockRoutine = {
        id: "00000000-0000-0000-0000-000000000004",
        userId: mockUser.id,
        title: "Night Routine",
        deletedAt: new Date(),
      };

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
        data: JSON.stringify({
          nodes: [{ id: "1" }],
          links: [{ id: "l1", source: "1", target: "2" }],
        }),
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
          findMany: vi.fn().mockResolvedValue([
            {
              id: "00000000-0000-0000-0000-000000000001",
              userId: mockUser.id,
              title: "List",
              deletedAt,
              tasks: [],
            },
          ]),
          findFirst: vi.fn().mockResolvedValue({
            id: "00000000-0000-0000-0000-000000000001",
            userId: mockUser.id,
            deletedAt,
          }),
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
        $transaction: vi.fn().mockImplementation(async (callback) => callback(mockPrisma)),
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
        $transaction: vi.fn().mockImplementation(async (callback) => callback(mockPrisma)),
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
          findMany: vi
            .fn()
            .mockResolvedValue([
              { id: "tl_1", userId: mockUser.id, title: "List", deletedAt, tasks: [] },
            ]),
          findFirst: vi.fn().mockResolvedValue({ id: "tl_1", userId: mockUser.id, deletedAt }),
          delete: vi.fn().mockResolvedValue({}),
        },
        task: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        project: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), delete: vi.fn() },
        page: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), delete: vi.fn() },
        event: { findMany: vi.fn().mockResolvedValue([]) },
        mindMap: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "map_unlocked",
              userId: mockUser.id,
              title: "Unlocked",
              deletedAt,
              isLocked: false,
              nodeCount: 1,
            },
            {
              id: "map_locked",
              userId: mockUser.id,
              title: "Locked",
              deletedAt,
              isLocked: true,
              nodeCount: 1,
            },
          ]),
          findFirst: vi.fn().mockResolvedValue({
            id: "map_unlocked",
            userId: mockUser.id,
            isLocked: false,
            deletedAt,
          }),
          delete: vi.fn().mockResolvedValue({}),
        },
        routine: { findMany: vi.fn().mockResolvedValue([]) },
        habit: { findMany: vi.fn().mockResolvedValue([]) },
        $transaction: vi.fn().mockImplementation(async (callback) => callback(mockPrisma)),
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

  describe("Parent Validation Order, Transaction Atomicity & Cascade Protection", () => {
    it("causes zero database changes when parent ID does not exist (nonexistent ID)", async () => {
      const mockTx = {
        taskList: {
          findFirst: vi.fn().mockResolvedValue(null),
          delete: vi.fn(),
          create: vi.fn(),
        },
        task: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn(),
          updateMany: vi.fn(),
          delete: vi.fn(),
        },
        project: {
          findFirst: vi.fn().mockResolvedValue(null),
          delete: vi.fn(),
        },
        page: {
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn(),
          delete: vi.fn(),
        },
        mindMap: {
          findFirst: vi.fn().mockResolvedValue(null),
          delete: vi.fn(),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
      };
      (globalThis as any).__prisma = mockPrisma;

      // 1. task_list nonexistent
      await expect(
        permanentlyDeleteItem(mockUser.id, "task_list", "00000000-0000-0000-0000-nonexistent1"),
      ).rejects.toThrow("Item not found in Recycle Bin");
      expect(mockTx.task.findMany).not.toHaveBeenCalled();
      expect(mockTx.task.updateMany).not.toHaveBeenCalled();
      expect(mockTx.taskList.delete).not.toHaveBeenCalled();

      // 2. task nonexistent
      await expect(
        permanentlyDeleteItem(mockUser.id, "task", "00000000-0000-0000-0000-nonexistent2"),
      ).rejects.toThrow("Item not found in Recycle Bin");
      expect(mockTx.task.updateMany).not.toHaveBeenCalled();
      expect(mockTx.task.delete).not.toHaveBeenCalled();

      // 3. project nonexistent
      await expect(
        permanentlyDeleteItem(mockUser.id, "project", "00000000-0000-0000-0000-nonexistent3"),
      ).rejects.toThrow("Item not found in Recycle Bin");
      expect(mockTx.page.updateMany).not.toHaveBeenCalled();
      expect(mockTx.project.delete).not.toHaveBeenCalled();

      // 4. note nonexistent
      await expect(
        permanentlyDeleteItem(mockUser.id, "note", "00000000-0000-0000-0000-nonexistent4"),
      ).rejects.toThrow("Item not found in Recycle Bin");
      expect(mockTx.page.updateMany).not.toHaveBeenCalled();
      expect(mockTx.page.delete).not.toHaveBeenCalled();
    });

    it("causes zero database changes when parent item is ACTIVE (deletedAt: null)", async () => {
      // If the parent is active, findFirst({ where: { id, userId, deletedAt: { not: null } } }) returns null
      const mockTx = {
        taskList: {
          findFirst: vi.fn().mockResolvedValue(null),
          delete: vi.fn(),
        },
        task: {
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn(),
          delete: vi.fn(),
        },
        project: {
          findFirst: vi.fn().mockResolvedValue(null),
          delete: vi.fn(),
        },
        page: {
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn(),
          delete: vi.fn(),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
      };
      (globalThis as any).__prisma = mockPrisma;

      await expect(
        permanentlyDeleteItem(mockUser.id, "task_list", "active_list_id"),
      ).rejects.toThrow("Item not found in Recycle Bin");
      expect(mockTx.taskList.findFirst).toHaveBeenCalledWith({
        where: { id: "active_list_id", userId: mockUser.id, deletedAt: { not: null } },
      });
      expect(mockTx.task.updateMany).not.toHaveBeenCalled();
      expect(mockTx.taskList.delete).not.toHaveBeenCalled();

      await expect(permanentlyDeleteItem(mockUser.id, "task", "active_task_id")).rejects.toThrow(
        "Item not found in Recycle Bin",
      );
      expect(mockTx.task.updateMany).not.toHaveBeenCalled();
      expect(mockTx.task.delete).not.toHaveBeenCalled();

      await expect(permanentlyDeleteItem(mockUser.id, "project", "active_proj_id")).rejects.toThrow(
        "Item not found in Recycle Bin",
      );
      expect(mockTx.page.updateMany).not.toHaveBeenCalled();
      expect(mockTx.project.delete).not.toHaveBeenCalled();

      await expect(permanentlyDeleteItem(mockUser.id, "note", "active_page_id")).rejects.toThrow(
        "Item not found in Recycle Bin",
      );
      expect(mockTx.page.updateMany).not.toHaveBeenCalled();
      expect(mockTx.page.delete).not.toHaveBeenCalled();
    });

    it("causes zero database changes when parent belongs to another user (unauthorized)", async () => {
      const mockTx = {
        taskList: {
          findFirst: vi.fn().mockResolvedValue(null), // query scopes by attacker userId, returns null
          delete: vi.fn(),
        },
        task: {
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn(),
          delete: vi.fn(),
        },
        project: {
          findFirst: vi.fn().mockResolvedValue(null),
          delete: vi.fn(),
        },
        page: {
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn(),
          delete: vi.fn(),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
      };
      (globalThis as any).__prisma = mockPrisma;

      const attackerUserId = "attacker_user_999";
      const victimListId = "victim_list_123";

      await expect(
        permanentlyDeleteItem(attackerUserId, "task_list", victimListId),
      ).rejects.toThrow("Item not found in Recycle Bin");

      expect(mockTx.taskList.findFirst).toHaveBeenCalledWith({
        where: { id: victimListId, userId: attackerUserId, deletedAt: { not: null } },
      });
      expect(mockTx.task.updateMany).not.toHaveBeenCalled();
      expect(mockTx.taskList.delete).not.toHaveBeenCalled();
    });

    it("preserves BOTH active and recently trashed child tasks before deleting task list", async () => {
      const trashedListId = "list_trashed_100";
      const activeFallbackListId = "list_fallback_200";

      const mockTx = {
        taskList: {
          findFirst: vi.fn().mockImplementation(async (args) => {
            if (args.where.id === trashedListId) {
              return { id: trashedListId, userId: mockUser.id, deletedAt: new Date() };
            }
            if (args.where.deletedAt === null) {
              return { id: activeFallbackListId, userId: mockUser.id, deletedAt: null };
            }
            return null;
          }),
          delete: vi.fn().mockResolvedValue({ id: trashedListId }),
        },
        task: {
          // Both active task and recently trashed task survive under this list
          findMany: vi
            .fn()
            .mockResolvedValue([
              { id: "task_child_active" },
              { id: "task_child_recently_trashed" },
            ]),
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
      };
      (globalThis as any).__prisma = mockPrisma;

      const result = await permanentlyDeleteItem(mockUser.id, "task_list", trashedListId);
      expect(result.success).toBe(true);

      // 1. First step must be parent validation with deletedAt != null
      expect(mockTx.taskList.findFirst).toHaveBeenCalledWith({
        where: { id: trashedListId, userId: mockUser.id, deletedAt: { not: null } },
      });

      // 2. Child lookup is strictly scoped by userId
      expect(mockTx.task.findMany).toHaveBeenCalledWith({
        where: { listId: trashedListId, userId: mockUser.id },
        select: { id: true },
      });

      // 3. All surviving child tasks (active and recently trashed) reparented to fallback list
      expect(mockTx.task.updateMany).toHaveBeenCalledWith({
        where: { listId: trashedListId, userId: mockUser.id },
        data: { listId: activeFallbackListId },
      });

      // 4. Parent list permanently deleted
      expect(mockTx.taskList.delete).toHaveBeenCalledWith({
        where: { id: trashedListId },
      });
    });

    it("preserves child subtasks when parent task is permanently deleted", async () => {
      const trashedTaskId = "task_parent_100";

      const mockTx = {
        task: {
          findFirst: vi.fn().mockResolvedValue({
            id: trashedTaskId,
            userId: mockUser.id,
            deletedAt: new Date(),
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
          delete: vi.fn().mockResolvedValue({ id: trashedTaskId }),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
      };
      (globalThis as any).__prisma = mockPrisma;

      const result = await permanentlyDeleteItem(mockUser.id, "task", trashedTaskId);
      expect(result.success).toBe(true);

      // 1. Parent validated first
      expect(mockTx.task.findFirst).toHaveBeenCalledWith({
        where: { id: trashedTaskId, userId: mockUser.id, deletedAt: { not: null } },
      });

      // 2. Child subtasks unparented with userId scoping
      expect(mockTx.task.updateMany).toHaveBeenCalledWith({
        where: { parentId: trashedTaskId, userId: mockUser.id },
        data: { parentId: null },
      });

      // 3. Parent deleted
      expect(mockTx.task.delete).toHaveBeenCalledWith({
        where: { id: trashedTaskId },
      });
    });

    it("preserves child pages when parent project is permanently deleted", async () => {
      const trashedProjectId = "project_parent_100";

      const mockTx = {
        project: {
          findFirst: vi.fn().mockResolvedValue({
            id: trashedProjectId,
            userId: mockUser.id,
            deletedAt: new Date(),
          }),
          delete: vi.fn().mockResolvedValue({ id: trashedProjectId }),
        },
        page: {
          updateMany: vi.fn().mockResolvedValue({ count: 3 }),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
      };
      (globalThis as any).__prisma = mockPrisma;

      const result = await permanentlyDeleteItem(mockUser.id, "project", trashedProjectId);
      expect(result.success).toBe(true);

      // 1. Parent validated first
      expect(mockTx.project.findFirst).toHaveBeenCalledWith({
        where: { id: trashedProjectId, userId: mockUser.id, deletedAt: { not: null } },
      });

      // 2. Project pages unlinked to standalone notes with userId scoping
      expect(mockTx.page.updateMany).toHaveBeenCalledWith({
        where: { projectId: trashedProjectId, userId: mockUser.id },
        data: { projectId: null },
      });

      // 3. Parent project deleted
      expect(mockTx.project.delete).toHaveBeenCalledWith({
        where: { id: trashedProjectId },
      });
    });

    it("preserves subpages when parent note is permanently deleted", async () => {
      const trashedPageId = "page_parent_100";

      const mockTx = {
        page: {
          findFirst: vi.fn().mockResolvedValue({
            id: trashedPageId,
            userId: mockUser.id,
            deletedAt: new Date(),
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
          delete: vi.fn().mockResolvedValue({ id: trashedPageId }),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
      };
      (globalThis as any).__prisma = mockPrisma;

      const result = await permanentlyDeleteItem(mockUser.id, "note", trashedPageId);
      expect(result.success).toBe(true);

      // 1. Parent validated first
      expect(mockTx.page.findFirst).toHaveBeenCalledWith({
        where: { id: trashedPageId, userId: mockUser.id, deletedAt: { not: null } },
      });

      // 2. Subpages unparented with userId scoping
      expect(mockTx.page.updateMany).toHaveBeenCalledWith({
        where: { parentId: trashedPageId, userId: mockUser.id },
        data: { parentId: null },
      });

      // 3. Parent page deleted
      expect(mockTx.page.delete).toHaveBeenCalledWith({
        where: { id: trashedPageId },
      });
    });
  });

  describe("Automatic 30-Day Permanent Deletion Cleanup (Hostinger Scheduled Cron)", () => {
    const createMockTx = (overrides: any = {}) => ({
      habit: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }), ...overrides.habit },
      routine: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }), ...overrides.routine },
      task: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 10 }),
        ...overrides.task,
      },
      taskList: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({ id: "list_active_1", userId: mockUser.id }),
        create: vi.fn().mockResolvedValue({ id: "list_new_1", userId: mockUser.id }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
        ...overrides.taskList,
      },
      page: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 5 }),
        ...overrides.page,
      },
      project: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        ...overrides.project,
      },
      event: { deleteMany: vi.fn().mockResolvedValue({ count: 4 }), ...overrides.event },
      mindMap: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }), ...overrides.mindMap },
    });

    it("permanently removes expired items older than 30 days and never touches active items", async () => {
      const simulatedNow = new Date("2026-10-18T12:00:00.000Z");
      const simulatedCutoff = getExpirationCutoff(30, simulatedNow);

      const tx = createMockTx();
      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (callback) => callback(tx)),
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

      // Verify queries strictly target deletedAt <= cutoff (active items with deletedAt: null are never selected)
      expect(tx.task.deleteMany).toHaveBeenCalledWith({
        where: { deletedAt: { lte: simulatedCutoff } },
      });
      expect(tx.mindMap.deleteMany).toHaveBeenCalledWith({
        where: { deletedAt: { lte: simulatedCutoff }, isLocked: false },
      });
    });

    it("prevents premature deletion: items trashed less than 30 days ago are preserved", async () => {
      const now = new Date("2026-10-18T12:00:00.000Z");
      const cutoff30d = getExpirationCutoff(30, now);

      // 10 days ago is within the 30-day retention window
      const itemDeleted10DaysAgo = new Date("2026-10-08T12:00:00.000Z");
      expect(itemDeleted10DaysAgo.getTime()).toBeGreaterThan(cutoff30d.getTime());

      // 29 days ago is within retention
      const itemDeleted29DaysAgo = new Date("2026-09-19T12:00:00.000Z");
      expect(itemDeleted29DaysAgo.getTime()).toBeGreaterThan(cutoff30d.getTime());

      // Exactly 30 days or older is expired
      const itemDeleted30DaysAgo = new Date("2026-09-18T12:00:00.000Z");
      expect(itemDeleted30DaysAgo.getTime()).toBeLessThanOrEqual(cutoff30d.getTime());
    });

    it("preserves active and restored child records when an expired parent is deleted", async () => {
      const simulatedNow = new Date("2026-10-18T12:00:00.000Z");
      const simulatedCutoff = getExpirationCutoff(30, simulatedNow);

      const expiredPageId = "page_parent_expired_1";
      const expiredProjectId = "proj_expired_1";
      const expiredTaskId = "task_parent_expired_1";
      const expiredListId = "list_expired_1";

      const tx = createMockTx({
        page: {
          findMany: vi.fn().mockImplementation(async (args) => {
            if (args.where?.deletedAt?.lte) {
              return [{ id: expiredPageId }];
            }
            return [];
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        project: {
          findMany: vi.fn().mockResolvedValue([{ id: expiredProjectId }]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        task: {
          findMany: vi.fn().mockImplementation(async (args) => {
            if (args.where?.parentId) {
              return [{ id: expiredTaskId }];
            }
            if (args.where?.listId) {
              // Active task inside expired list
              return [{ id: "task_active_in_expired_list", userId: mockUser.id }];
            }
            return [{ id: expiredTaskId }];
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        taskList: {
          findMany: vi.fn().mockResolvedValue([{ id: expiredListId, userId: mockUser.id }]),
          findFirst: vi.fn().mockResolvedValue({ id: "list_active_fallback", userId: mockUser.id }),
          create: vi.fn().mockResolvedValue({ id: "list_new", userId: mockUser.id }),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      });

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (callback) => callback(tx)),
      };

      (globalThis as any).__prisma = mockPrisma;

      await cleanupExpiredTrash({ simulatedCutoff });

      // 1. Verify subpages: active child pages of expired parent page were unparented
      expect(tx.page.updateMany).toHaveBeenCalledWith({
        where: {
          parentId: { in: [expiredPageId] },
          OR: [{ deletedAt: null }, { deletedAt: { gt: simulatedCutoff } }],
        },
        data: { parentId: null },
      });

      // 2. Verify project notes: active notes in expired project were converted to standalone notes
      expect(tx.page.updateMany).toHaveBeenCalledWith({
        where: {
          projectId: { in: [expiredProjectId] },
          OR: [{ deletedAt: null }, { deletedAt: { gt: simulatedCutoff } }],
        },
        data: { projectId: null },
      });

      // 3. Verify subtasks: active subtasks of expired parent task were unparented
      expect(tx.task.updateMany).toHaveBeenCalledWith({
        where: {
          parentId: { in: [expiredTaskId] },
          OR: [{ deletedAt: null }, { deletedAt: { gt: simulatedCutoff } }],
        },
        data: { parentId: null },
      });

      // 4. Verify list tasks: active tasks inside expired list were reparented to an active list
      expect(tx.task.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["task_active_in_expired_list"] } },
        data: { listId: "list_active_fallback" },
      });
    });

    describe("/api/trash/cleanup Endpoint Security", () => {
      beforeEach(() => {
        process.env["CRON_SECRET"] = "super-secret-cron-token-12345";
      });

      it("rejects unauthorized requests with 401 when CRON_SECRET is missing", async () => {
        const handlers = (CleanupRoute.options as any).server.handlers;
        const unauthReq = new Request("http://localhost/api/trash/cleanup", { method: "POST" });
        const res = await handlers.POST({ request: unauthReq });
        expect(res.status).toBe(401);
      });

      it("rejects requests with incorrect CRON_SECRET with 401", async () => {
        const handlers = (CleanupRoute.options as any).server.handlers;
        const badReq = new Request("http://localhost/api/trash/cleanup", {
          method: "POST",
          headers: { Authorization: "Bearer wrong-secret" },
        });
        const res = await handlers.POST({ request: badReq });
        expect(res.status).toBe(401);
      });

      it("rejects authenticated user sessions without CRON_SECRET (session auth strictly removed)", async () => {
        vi.spyOn(apiServer, "getUser").mockResolvedValue(mockUser as any);

        const handlers = (CleanupRoute.options as any).server.handlers;
        const sessionOnlyReq = new Request("http://localhost/api/trash/cleanup", {
          method: "POST",
          headers: { Cookie: "session=valid_user_session_token" },
        });

        const res = await handlers.POST({ request: sessionOnlyReq });
        expect(res.status).toBe(401);
      });

      it("accepts valid Bearer token authorization and executes cleanup", async () => {
        const tx = createMockTx();
        const mockPrisma = {
          $transaction: vi.fn().mockImplementation(async (callback) => callback(tx)),
        };
        (globalThis as any).__prisma = mockPrisma;

        const handlers = (CleanupRoute.options as any).server.handlers;
        const authReq = new Request("http://localhost/api/trash/cleanup", {
          method: "POST",
          headers: { Authorization: "Bearer super-secret-cron-token-12345" },
        });

        const res = await handlers.POST({ request: authReq });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.ok).toBe(true);
      });

      it("accepts valid x-cron-secret header authorization", async () => {
        const tx = createMockTx();
        const mockPrisma = {
          $transaction: vi.fn().mockImplementation(async (callback) => callback(tx)),
        };
        (globalThis as any).__prisma = mockPrisma;

        const handlers = (CleanupRoute.options as any).server.handlers;
        const headerReq = new Request("http://localhost/api/trash/cleanup", {
          method: "POST",
          headers: { "x-cron-secret": "super-secret-cron-token-12345" },
        });

        const res = await handlers.POST({ request: headerReq });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.ok).toBe(true);
      });

      it("only defines POST handler (GET method is not allowed)", () => {
        const handlers = (CleanupRoute.options as any).server.handlers;
        expect(handlers.POST).toBeDefined();
        expect(handlers.GET).toBeUndefined();
      });
    });

    it("cleanup is completely idempotent and safe to retry", async () => {
      const tx = createMockTx();
      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (callback) => callback(tx)),
      };

      (globalThis as any).__prisma = mockPrisma;

      // Call 1
      const res1 = await cleanupExpiredTrash();
      // Call 2 immediately after
      const res2 = await cleanupExpiredTrash();

      expect(res1.deleted.tasks).toBe(10);
      expect(res2.deleted.tasks).toBe(10);
    });
  });
});
