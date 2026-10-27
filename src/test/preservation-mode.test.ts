/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as apiServer from "@/lib/server/api.server";
import {
  isDataPreservationMode,
  isStrictPreservationMode,
  assertBulkDeletionAllowed,
} from "@/lib/server/preservation.server";
import {
  emptyTrash,
  cleanupExpiredTrash,
  permanentlyDeleteItem,
  restoreItem,
  restoreAll,
} from "@/lib/server/trash.server";
import { deleteUserData } from "@/lib/server/api.server";
import { Route as TrashListRoute } from "@/routes/api.trash";
import { Route as EmptyRoute } from "@/routes/api.trash.empty";
import { Route as CleanupRoute } from "@/routes/api.trash.cleanup";
import { Route as DeleteDataRoute } from "@/routes/api.data.delete";
import { Route as PermanentRoute } from "@/routes/api.trash.permanent";
import { Route as DataSummaryRoute } from "@/routes/api.data.summary";

describe("MindDesk — Data Preservation Mode Safety Gate", () => {
  const originalEnv = { ...process.env };
  const mockUser = {
    id: "user_preservation_test",
    email: "user@minddesk.com",
    passwordHash: "mock_hash",
  };

  beforeEach(() => {
    process.env = { ...originalEnv, DATABASE_URL: "mysql://mock" };
    delete process.env["DATA_PRESERVATION_MODE"];
    delete process.env["DATA_PRESERVATION_STRICT"];
    delete (globalThis as any).__prisma;
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. Safety Invariant: Defaults to Protected and Strict by Default
  // ---------------------------------------------------------------------------
  describe("Preservation Mode Configuration & Safety Defaults", () => {
    it("defaults to ACTIVE (protected) when DATA_PRESERVATION_MODE is unset", () => {
      delete process.env["DATA_PRESERVATION_MODE"];
      expect(isDataPreservationMode()).toBe(true);
    });

    it("remains ACTIVE when DATA_PRESERVATION_MODE is empty, whitespace, or invalid", () => {
      process.env["DATA_PRESERVATION_MODE"] = "";
      expect(isDataPreservationMode()).toBe(true);

      process.env["DATA_PRESERVATION_MODE"] = "   ";
      expect(isDataPreservationMode()).toBe(true);

      process.env["DATA_PRESERVATION_MODE"] = "true";
      expect(isDataPreservationMode()).toBe(true);

      process.env["DATA_PRESERVATION_MODE"] = "enabled";
      expect(isDataPreservationMode()).toBe(true);
    });

    it("is deactivated ONLY when DATA_PRESERVATION_MODE is explicitly 'false', 'disabled', or 'off'", () => {
      process.env["DATA_PRESERVATION_MODE"] = "false";
      expect(isDataPreservationMode()).toBe(false);

      process.env["DATA_PRESERVATION_MODE"] = "disabled";
      expect(isDataPreservationMode()).toBe(false);

      process.env["DATA_PRESERVATION_MODE"] = "off";
      expect(isDataPreservationMode()).toBe(false);

      process.env["DATA_PRESERVATION_MODE"] = " DISABLED ";
      expect(isDataPreservationMode()).toBe(false);
    });

    it("defaults strict mode to TRUE whenever Data Preservation Mode is active, even if DATA_PRESERVATION_STRICT is missing", () => {
      delete process.env["DATA_PRESERVATION_STRICT"];
      expect(isDataPreservationMode()).toBe(true);
      expect(isStrictPreservationMode()).toBe(true);

      process.env["DATA_PRESERVATION_STRICT"] = "";
      expect(isStrictPreservationMode()).toBe(true);

      process.env["DATA_PRESERVATION_STRICT"] = "   ";
      expect(isStrictPreservationMode()).toBe(true);

      process.env["DATA_PRESERVATION_STRICT"] = "true";
      expect(isStrictPreservationMode()).toBe(true);
    });

    it("strict mode is deactivated ONLY when DATA_PRESERVATION_STRICT is explicitly 'false', 'disabled', or 'off'", () => {
      process.env["DATA_PRESERVATION_STRICT"] = "false";
      expect(isStrictPreservationMode()).toBe(false);

      process.env["DATA_PRESERVATION_STRICT"] = "disabled";
      expect(isStrictPreservationMode()).toBe(false);

      process.env["DATA_PRESERVATION_STRICT"] = "off";
      expect(isStrictPreservationMode()).toBe(false);
    });

    it("strict mode is always FALSE if overall Data Preservation Mode is disabled", () => {
      process.env["DATA_PRESERVATION_MODE"] = "disabled";
      process.env["DATA_PRESERVATION_STRICT"] = "true";
      expect(isStrictPreservationMode()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Automated Retention Purges Protection
  // ---------------------------------------------------------------------------
  describe("Automated Retention Purges Protection (cleanupExpiredTrash & /api/trash/cleanup)", () => {
    it("suppresses permanent cleanup queries and returns 0 deleted records with preservation_mode flag", async () => {
      const mockPrisma = {
        $transaction: vi.fn(),
        task: { deleteMany: vi.fn() },
        page: { deleteMany: vi.fn() },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "db").mockReturnValue(mockPrisma as any);

      // DATA_PRESERVATION_MODE is unset -> protected
      const result = await cleanupExpiredTrash();

      expect(result.preservation_mode).toBe(true);
      expect(result.deleted).toEqual({
        tasks: 0,
        task_lists: 0,
        pages: 0,
        projects: 0,
        mind_maps: 0,
        events: 0,
        habits: 0,
        routines: 0,
      });

      // No database transactions or delete mutations were executed!
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.task.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.page.deleteMany).not.toHaveBeenCalled();
    });

    it("serves /api/trash/cleanup with 200 OK, preservation_mode: true, and 0 deleted records", async () => {
      process.env["CRON_SECRET"] = "valid_cron_secret_123";

      const mockPrisma = {
        $transaction: vi.fn(),
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "db").mockReturnValue(mockPrisma as any);

      const handlers = (CleanupRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/trash/cleanup", {
        method: "POST",
        headers: { "x-cron-secret": "valid_cron_secret_123" },
      });

      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.preservation_mode).toBe(true);
      expect(body.deleted.tasks).toBe(0);
      expect(body.deleted.pages).toBe(0);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("ensures scripts/cleanup-trash.mjs exits safely with 0 deleted records under default settings", async () => {
      const { execSync } = await import("node:child_process");
      const output = execSync("node scripts/cleanup-trash.mjs", {
        cwd: process.cwd(),
        env: { ...process.env, DATA_PRESERVATION_MODE: undefined },
        encoding: "utf8",
      });

      expect(output).toContain("DATA PRESERVATION MODE IS ACTIVE");
      expect(output).toContain("Zero records were deleted");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Irreversible Bulk Deletion Protection
  // ---------------------------------------------------------------------------
  describe("Irreversible Bulk Deletion Protection (emptyTrash & deleteUserData)", () => {
    it("blocks emptyTrash() with ApiError(423 Locked)", async () => {
      expect(isDataPreservationMode()).toBe(true);
      await expect(emptyTrash(mockUser.id)).rejects.toThrowError(
        /Data Preservation Mode is active: Emptying the Recycle Bin is disabled/i,
      );
    });

    it("blocks /api/trash/empty endpoint with HTTP 423 Locked", async () => {
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (EmptyRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/trash/empty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter: "all" }),
      });

      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(423);

      const json = await res.json();
      expect(json.error).toMatch(/Data Preservation Mode is active/i);
    });

    it("blocks deleteUserData() with ApiError(423 Locked)", async () => {
      expect(isDataPreservationMode()).toBe(true);
      await expect(deleteUserData(mockUser.id)).rejects.toThrowError(
        /Data Preservation Mode is active: Workspace-wide deletion is disabled/i,
      );
    });

    it("blocks /api/data/delete endpoint with HTTP 423 Locked before password check", async () => {
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (DeleteDataRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/data/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "any_password", confirm: "DELETE" }),
      });

      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(423);

      const json = await res.json();
      expect(json.error).toMatch(/Data Preservation Mode is active/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Single-Item Permanent Deletion & Default Strict Protection
  // ---------------------------------------------------------------------------
  describe("Single-Item Permanent Deletion & Strict by Default Protection", () => {
    it("blocks single-item permanent deletion BY DEFAULT when DATA_PRESERVATION_STRICT is missing", async () => {
      delete process.env["DATA_PRESERVATION_STRICT"];
      expect(isDataPreservationMode()).toBe(true);
      expect(isStrictPreservationMode()).toBe(true);

      expect(() => assertBulkDeletionAllowed("single_permanent_delete")).toThrowError(
        /Data Preservation Mode is active: Permanent single-item deletion is disabled/i,
      );

      await expect(permanentlyDeleteItem(mockUser.id, "note", "note-uuid-1")).rejects.toThrowError(
        /Data Preservation Mode is active/i,
      );
    });

    it("blocks /api/trash/permanent with HTTP 423 Locked BY DEFAULT", async () => {
      delete process.env["DATA_PRESERVATION_STRICT"];
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (PermanentRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/trash/permanent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "note", id: "550e8400-e29b-41d4-a716-446655440000" }),
      });

      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(423);

      const json = await res.json();
      expect(json.error).toMatch(/Data Preservation Mode is active/i);
    });

    it("allows deliberate single-item deletion ONLY when DATA_PRESERVATION_STRICT is explicitly set to 'false' or 'disabled'", () => {
      process.env["DATA_PRESERVATION_STRICT"] = "disabled";
      expect(isDataPreservationMode()).toBe(true);
      expect(isStrictPreservationMode()).toBe(false);

      expect(() => assertBulkDeletionAllowed("single_permanent_delete")).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 5. API Status Propagation to UI (Recycle Bin & Settings)
  // ---------------------------------------------------------------------------
  describe("Preservation Status Propagation to UI API Endpoints", () => {
    it("returns preservation_mode: true and strict_mode: true in /api/trash", async () => {
      const mockPrisma = {
        taskList: { findMany: vi.fn().mockResolvedValue([]) },
        task: { findMany: vi.fn().mockResolvedValue([]) },
        project: { findMany: vi.fn().mockResolvedValue([]) },
        page: { findMany: vi.fn().mockResolvedValue([]) },
        event: { findMany: vi.fn().mockResolvedValue([]) },
        mindMap: { findMany: vi.fn().mockResolvedValue([]) },
        routine: { findMany: vi.fn().mockResolvedValue([]) },
        habit: { findMany: vi.fn().mockResolvedValue([]) },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "db").mockReturnValue(mockPrisma as any);
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (TrashListRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/trash", { method: "GET" });

      const res = await handlers.GET({ request: req });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.preservation_mode).toBe(true);
      expect(json.strict_mode).toBe(true);
    });

    it("returns preservation_mode: true in /api/data/summary", async () => {
      const mockPrisma = {
        taskList: { count: vi.fn().mockResolvedValue(0) },
        task: { count: vi.fn().mockResolvedValue(0) },
        page: { count: vi.fn().mockResolvedValue(0) },
        project: { count: vi.fn().mockResolvedValue(0) },
        event: { count: vi.fn().mockResolvedValue(0) },
        planActivity: { count: vi.fn().mockResolvedValue(0) },
        mindMap: { count: vi.fn().mockResolvedValue(0) },
        habit: { count: vi.fn().mockResolvedValue(0) },
        routine: { count: vi.fn().mockResolvedValue(0) },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "db").mockReturnValue(mockPrisma as any);
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (DataSummaryRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/data/summary", { method: "GET" });

      const res = await handlers.GET({ request: req });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.preservation_mode).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Normal User Workflows Remain 100% Operational
  // ---------------------------------------------------------------------------
  describe("Preservation of Ordinary User Workflows", () => {
    it("allows restoring an item from Recycle Bin while Preservation Mode is active", async () => {
      const mockPrisma: any = {
        $transaction: vi.fn().mockImplementation(async (cb: any) => cb(mockPrisma)),
        page: {
          findFirst: vi.fn().mockResolvedValue({
            id: "note-1",
            userId: mockUser.id,
            deletedAt: new Date(),
            parentId: null,
            projectId: null,
          }),
          update: vi.fn().mockResolvedValue({ id: "note-1", deletedAt: null }),
          findMany: vi.fn().mockResolvedValue([]),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "db").mockReturnValue(mockPrisma as any);

      const res = await restoreItem(mockUser.id, "note", "note-1");
      expect(res.success).toBe(true);
      expect(res.id).toBe("note-1");
      expect(mockPrisma.page.update).toHaveBeenCalledWith({
        where: { id: "note-1" },
        data: { deletedAt: null, parentId: null, projectId: null },
      });
    });

    it("allows restoreAll() from Recycle Bin while Preservation Mode is active", async () => {
      const mockPrisma: any = {
        $transaction: vi.fn().mockImplementation(async (cb: any) => cb(mockPrisma)),
        taskList: { findMany: vi.fn().mockResolvedValue([]) },
        task: { findMany: vi.fn().mockResolvedValue([]) },
        project: { findMany: vi.fn().mockResolvedValue([]) },
        page: {
          findMany: vi.fn().mockImplementation((args: any) => {
            if (args?.where?.parentId) {
              return Promise.resolve([]);
            }
            return Promise.resolve([
              {
                id: "note-1",
                title: "Preserved Note",
                deletedAt: new Date(),
                project: null,
                parent: null,
              },
            ]);
          }),
          findFirst: vi.fn().mockResolvedValue({
            id: "note-1",
            userId: mockUser.id,
            deletedAt: new Date(),
            parentId: null,
            projectId: null,
          }),
          update: vi.fn().mockResolvedValue({ id: "note-1", deletedAt: null }),
        },
        event: { findMany: vi.fn().mockResolvedValue([]) },
        mindMap: { findMany: vi.fn().mockResolvedValue([]) },
        routine: { findMany: vi.fn().mockResolvedValue([]) },
        habit: { findMany: vi.fn().mockResolvedValue([]) },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "db").mockReturnValue(mockPrisma as any);

      const res = await restoreAll(mockUser.id);
      expect(res.restoredCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Explicit Bypass in Disabled Mode
  // ---------------------------------------------------------------------------
  describe("Explicit Bypass when DATA_PRESERVATION_MODE='disabled'", () => {
    it("allows bulk operations when preservation mode is explicitly disabled", () => {
      process.env["DATA_PRESERVATION_MODE"] = "disabled";
      expect(isDataPreservationMode()).toBe(false);

      expect(() => assertBulkDeletionAllowed("workspace_deletion")).not.toThrow();
      expect(() => assertBulkDeletionAllowed("empty_trash")).not.toThrow();
      expect(() => assertBulkDeletionAllowed("auto_cleanup")).not.toThrow();
      expect(() => assertBulkDeletionAllowed("single_permanent_delete")).not.toThrow();
    });
  });
});
