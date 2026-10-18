import { beforeEach, describe, expect, it, vi } from "vitest";
import * as apiServer from "@/lib/server/api.server";
import { Route as MapIdRoute } from "@/routes/api.mind-maps.$id";
import { Route as MapListRoute } from "@/routes/api.mind-maps";

describe("Mind Map Lock / Unlock System", () => {
  const originalEnv = { ...process.env };
  const mockUser = { id: "user_owner_1", email: "owner@minddesk.com" };

  beforeEach(() => {
    process.env = { ...originalEnv, DATABASE_URL: "mysql://mock" };
    delete (globalThis as any).__prisma;
    vi.restoreAllMocks();
  });

  describe("Backend API Lock Enforcement (PATCH /api/mind-maps/:id)", () => {
    it("allows authenticated owner to lock an unlocked mind map", async () => {
      const currentMap = {
        id: "map_1",
        userId: mockUser.id,
        title: "Strategy 2026",
        data: JSON.stringify({ version: 1, rootId: "r", layout: "map", nodes: [{ id: "r", title: "Strategy" }], links: [] }),
        nodeCount: 1,
        isLocked: false,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedMap = {
        ...currentMap,
        isLocked: true,
      };

      const mockPrisma = {
        mindMap: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(currentMap) // initial check
            .mockResolvedValueOnce(updatedMap), // returned meta
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (MapIdRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/mind-maps/map_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_locked: true }),
      });

      const res = await handlers.PATCH({ request: req, params: { id: "map_1" } });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.is_locked).toBe(true);
      expect(json.id).toBe("map_1");
      expect(mockPrisma.mindMap.updateMany).toHaveBeenCalledWith({
        where: { id: "map_1", userId: mockUser.id },
        data: { isLocked: true },
      });
    });

    it("allows authenticated owner to unlock a locked mind map", async () => {
      const lockedMap = {
        id: "map_1",
        userId: mockUser.id,
        title: "Locked Map",
        data: JSON.stringify({ version: 1, rootId: "r", layout: "map", nodes: [{ id: "r", title: "Locked" }], links: [] }),
        nodeCount: 1,
        isLocked: true,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const unlockedMap = {
        ...lockedMap,
        isLocked: false,
      };

      const mockPrisma = {
        mindMap: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(lockedMap)
            .mockResolvedValueOnce(unlockedMap),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (MapIdRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/mind-maps/map_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_locked: false }),
      });

      const res = await handlers.PATCH({ request: req, params: { id: "map_1" } });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.is_locked).toBe(false);
      expect(mockPrisma.mindMap.updateMany).toHaveBeenCalledWith({
        where: { id: "map_1", userId: mockUser.id },
        data: { isLocked: false },
      });
    });

    it("rejects document content edits with 423 when mind map is locked", async () => {
      const lockedMap = {
        id: "map_1",
        userId: mockUser.id,
        title: "Locked Map",
        data: JSON.stringify({ version: 1, rootId: "r", layout: "map", nodes: [{ id: "r", title: "Locked" }], links: [] }),
        nodeCount: 1,
        isLocked: true,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockPrisma = {
        mindMap: {
          findFirst: vi.fn().mockResolvedValue(lockedMap),
          updateMany: vi.fn(),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (MapIdRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/mind-maps/map_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            layout: "radial",
            nodes: [
              { id: "r", parentId: null, title: "Edited Title", x: 0, y: 0, color: "default", size: "m", notes: "", link: "", collapsed: false },
            ],
            links: [],
          },
          base_version: 1,
        }),
      });

      const res = await handlers.PATCH({ request: req, params: { id: "map_1" } });
      expect(res.status).toBe(423);
      const json = await res.json();
      expect(json.error).toContain("423 Locked — Unlock this mind map before editing.");
      expect(mockPrisma.mindMap.updateMany).not.toHaveBeenCalled();
    });

    it("rejects title edits with 423 when mind map is locked", async () => {
      const lockedMap = {
        id: "map_1",
        userId: mockUser.id,
        title: "Original Title",
        data: JSON.stringify({ version: 1, rootId: "r", layout: "map", nodes: [{ id: "r", title: "Original" }], links: [] }),
        nodeCount: 1,
        isLocked: true,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockPrisma = {
        mindMap: {
          findFirst: vi.fn().mockResolvedValue(lockedMap),
          updateMany: vi.fn(),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (MapIdRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/mind-maps/map_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Attempted New Title" }),
      });

      const res = await handlers.PATCH({ request: req, params: { id: "map_1" } });
      expect(res.status).toBe(423);
      const json = await res.json();
      expect(json.error).toContain("423 Locked — Unlock this mind map before editing.");
      expect(mockPrisma.mindMap.updateMany).not.toHaveBeenCalled();
    });

    it("strictly prevents modifying content and unlocking in a single request", async () => {
      const lockedMap = {
        id: "map_1",
        userId: mockUser.id,
        title: "Original Title",
        data: JSON.stringify({ version: 1, rootId: "r", layout: "map", nodes: [{ id: "r", title: "Original" }], links: [] }),
        nodeCount: 1,
        isLocked: true,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockPrisma = {
        mindMap: {
          findFirst: vi.fn().mockResolvedValue(lockedMap),
          updateMany: vi.fn(),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (MapIdRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/mind-maps/map_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Sneaky Rename", is_locked: false }),
      });

      const res = await handlers.PATCH({ request: req, params: { id: "map_1" } });
      expect(res.status).toBe(423);
      expect(mockPrisma.mindMap.updateMany).not.toHaveBeenCalled();
    });

    it("allows edits when the map is unlocked", async () => {
      const unlockedMap = {
        id: "map_1",
        userId: mockUser.id,
        title: "Old Title",
        data: JSON.stringify({ version: 1, rootId: "r", layout: "map", nodes: [{ id: "r", title: "Old" }], links: [] }),
        nodeCount: 1,
        isLocked: false,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedMap = {
        ...unlockedMap,
        title: "Brand New Title",
      };

      const mockPrisma = {
        mindMap: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(unlockedMap)
            .mockResolvedValueOnce(updatedMap),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (MapIdRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/mind-maps/map_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Brand New Title" }),
      });

      const res = await handlers.PATCH({ request: req, params: { id: "map_1" } });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.title).toBe("Brand New Title");
      expect(mockPrisma.mindMap.updateMany).toHaveBeenCalledWith({
        where: { id: "map_1", userId: mockUser.id },
        data: { title: "Brand New Title" },
      });
    });
  });

  describe("Backend API Deletion Protection (DELETE /api/mind-maps/:id)", () => {
    it("rejects deletion with 423 when mind map is locked", async () => {
      const lockedMap = {
        id: "map_1",
        userId: mockUser.id,
        title: "Locked Map",
        isLocked: true,
      };

      const mockPrisma = {
        mindMap: {
          findFirst: vi.fn().mockResolvedValue(lockedMap),
          deleteMany: vi.fn(),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (MapIdRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/mind-maps/map_1", { method: "DELETE" });

      const res = await handlers.DELETE({ request: req, params: { id: "map_1" } });
      expect(res.status).toBe(423);
      const json = await res.json();
      expect(json.error).toContain("423 Locked — Unlock this mind map before deleting.");
      expect(mockPrisma.mindMap.deleteMany).not.toHaveBeenCalled();
    });

    it("allows deletion when mind map is unlocked", async () => {
      const unlockedMap = {
        id: "map_1",
        userId: mockUser.id,
        title: "Unlocked Map",
        isLocked: false,
      };

      const mockPrisma = {
        mindMap: {
          findFirst: vi.fn().mockResolvedValue(unlockedMap),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (MapIdRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/mind-maps/map_1", { method: "DELETE" });

      const res = await handlers.DELETE({ request: req, params: { id: "map_1" } });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(mockPrisma.mindMap.updateMany).toHaveBeenCalledWith({
        where: { id: "map_1", userId: mockUser.id },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe("Independent Lock Status Across Maps", () => {
    it("maintains separate lock status for different mind maps", async () => {
      const mapA = {
        id: "map_a",
        userId: mockUser.id,
        title: "Map A",
        isLocked: true,
        nodeCount: 1,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mapB = {
        id: "map_b",
        userId: mockUser.id,
        title: "Map B",
        isLocked: false,
        nodeCount: 1,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockPrisma = {
        mindMap: {
          findFirst: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
            if (where.id === "map_a") return Promise.resolve(mapA);
            if (where.id === "map_b") return Promise.resolve(mapB);
            return Promise.resolve(null);
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (MapIdRoute.options as any).server.handlers;

      // Map A is locked, editing title fails with 423
      const reqA = new Request("http://localhost/api/mind-maps/map_a", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Edit Map A" }),
      });
      const resA = await handlers.PATCH({ request: reqA, params: { id: "map_a" } });
      expect(resA.status).toBe(423);

      // Map B is unlocked, editing title succeeds
      const reqB = new Request("http://localhost/api/mind-maps/map_b", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Edit Map B" }),
      });
      const resB = await handlers.PATCH({ request: reqB, params: { id: "map_b" } });
      expect(resB.status).toBe(200);
    });
  });

  describe("Mind Map Creation Default State", () => {
    it("creates mind maps unlocked by default (isLocked: false)", async () => {
      const createdRecord = {
        id: "map_new",
        userId: mockUser.id,
        title: "Fresh Central Idea",
        nodeCount: 1,
        isLocked: false,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockPrisma = {
        mindMap: {
          create: vi.fn().mockResolvedValue(createdRecord),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (MapListRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/mind-maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Fresh Central Idea" }),
      });

      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.is_locked).toBe(false);
      expect(mockPrisma.mindMap.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isLocked: false,
          }),
        })
      );
    });
  });
});
