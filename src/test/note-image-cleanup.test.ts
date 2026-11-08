/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as apiServer from "@/lib/server/api.server";
import {
  extractImageIdsFromContent,
  getSafeImagePath,
  scanOrphanedNoteImages,
} from "@/lib/server/images.server";
import { permanentlyDeleteItem, cleanupExpiredTrash } from "@/lib/server/trash.server";
import { deleteUserData } from "@/lib/server/api.server";

describe("MindDesk — Non-Destructive Protection & Zero Data Loss Guarantees", () => {
  const originalEnv = { ...process.env };
  const mockUserId = "user-test-uuid-123";

  let tempTestStorageDir: string;

  beforeEach(() => {
    tempTestStorageDir = path.resolve(
      process.cwd(),
      "tmp_test_uploads_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    );
    fs.mkdirSync(tempTestStorageDir, { recursive: true });
    process.env = {
      ...originalEnv,
      STORAGE_DIR: tempTestStorageDir,
      DATABASE_URL: "mysql://mock",
      DATA_PRESERVATION_MODE: "disabled",
    };
    delete (globalThis as any).__prisma;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempTestStorageDir)) {
        fs.rmSync(tempTestStorageDir, { recursive: true, force: true });
      }
    } catch {
      // Best-effort
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Reference Extraction & Path Traversal Protection
  // ---------------------------------------------------------------------------
  describe("Image Reference Extraction & Path Confinement", () => {
    it("extracts image IDs from structured JSON blocks without mutating data", () => {
      const content = {
        blocks: [
          { id: "b1", type: "p", text: "Hello world" },
          { id: "b2", type: "image", url: "/api/images/img-uuid-001" },
          { id: "b3", type: "image", url: "/api/images/img-uuid-002.png" },
          { id: "b4", type: "p", text: "More text" },
        ],
      };

      const ids = extractImageIdsFromContent(content);
      expect(ids).toContain("img-uuid-001");
      expect(ids).toContain("img-uuid-002");
      expect(ids.length).toBe(2);
    });

    it("extracts image IDs from stringified JSON and raw URLs", () => {
      const rawContent = JSON.stringify({
        blocks: [
          {
            id: "b1",
            type: "image",
            url: "https://minddesk.joinscaleflow.in/api/images/uuid-alpha-999.webp",
          },
        ],
      });

      const ids = extractImageIdsFromContent(rawContent);
      expect(ids).toContain("uuid-alpha-999");
    });

    it("deduplicates identical image IDs within note content", () => {
      const content = {
        blocks: [
          { id: "b1", type: "image", url: "/api/images/duplicate-id" },
          { id: "b2", type: "image", url: "/api/images/duplicate-id" },
          { id: "b3", type: "p", text: "Check /api/images/duplicate-id inline" },
        ],
      };

      const ids = extractImageIdsFromContent(content);
      expect(ids).toEqual(["duplicate-id"]);
    });

    it("returns empty array for empty or image-free content", () => {
      expect(extractImageIdsFromContent(null)).toEqual([]);
      expect(extractImageIdsFromContent("")).toEqual([]);
      expect(
        extractImageIdsFromContent({ blocks: [{ type: "p", text: "No images here" }] }),
      ).toEqual([]);
    });

    it("prevents directory traversal attempts in getSafeImagePath", () => {
      expect(() => getSafeImagePath(tempTestStorageDir, "../secret.txt")).toThrow(
        "directory traversal",
      );
      expect(() => getSafeImagePath(tempTestStorageDir, "foo/../../secret.txt")).toThrow(
        "directory traversal",
      );
      expect(() => getSafeImagePath(tempTestStorageDir, "sub\\file.png")).toThrow(
        "directory traversal",
      );
      expect(() => getSafeImagePath(tempTestStorageDir, "\0bad.png")).toThrow(
        "directory traversal",
      );
      expect(() => getSafeImagePath(tempTestStorageDir, "")).toThrow("Invalid storage key");

      const safePath = getSafeImagePath(tempTestStorageDir, "valid-file.png");
      expect(safePath).toBe(path.resolve(tempTestStorageDir, "valid-file.png"));
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Note Permanent Deletion Does NOT Delete Images (Zero Data Loss)
  // ---------------------------------------------------------------------------
  describe("Note Permanent Deletion — Zero NoteImage Deletion", () => {
    it("deletes only the Page row and leaves NoteImage rows and disk files completely intact", async () => {
      const imageId = "img-persist-1";
      const storageKey = `${imageId}.png`;
      const filePath = path.join(tempTestStorageDir, storageKey);
      fs.writeFileSync(filePath, "persisted-image-binary");

      const noteContent = JSON.stringify({
        blocks: [{ id: "b1", type: "image", url: `/api/images/${imageId}` }],
      });

      const mockNote = {
        id: "note-1",
        userId: mockUserId,
        content: noteContent,
        deletedAt: new Date(),
      };

      const mockPrisma: any = {
        page: {
          findFirst: vi.fn().mockResolvedValue(mockNote),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          delete: vi.fn().mockResolvedValue(mockNote),
        },
        noteImage: {
          delete: vi.fn(),
          deleteMany: vi.fn(),
        },
        $transaction: vi.fn().mockImplementation((cb: (tx: any) => any) => cb(mockPrisma)),
      };

      vi.spyOn(apiServer, "db").mockReturnValue(mockPrisma);

      const result = await permanentlyDeleteItem(mockUserId, "note", "note-1");
      expect(result.success).toBe(true);

      // Verify page was deleted from database
      expect(mockPrisma.page.delete).toHaveBeenCalledWith({ where: { id: "note-1" } });

      // GUARANTEE: NoteImage row was NOT deleted
      expect(mockPrisma.noteImage.delete).not.toHaveBeenCalled();
      expect(mockPrisma.noteImage.deleteMany).not.toHaveBeenCalled();

      // GUARANTEE: Physical file on disk was NOT unlinked
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. 30-Day Recycle Bin Automatic Cleanup Does NOT Delete Images
  // ---------------------------------------------------------------------------
  describe("30-Day Automatic Trash Cleanup — Zero NoteImage Deletion", () => {
    it("cleans expired pages without touching note_images table or disk files", async () => {
      const expiredImgId = "img-expired-page";
      const filePath = path.join(tempTestStorageDir, `${expiredImgId}.png`);
      fs.writeFileSync(filePath, "persisted-expired-image");

      const expiredPage = {
        id: "page-expired-1",
        userId: mockUserId,
        content: JSON.stringify({
          blocks: [{ id: "b1", type: "image", url: `/api/images/${expiredImgId}` }],
        }),
        deletedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
      };

      const mockPrisma: any = {
        page: {
          findMany: vi.fn().mockResolvedValue([expiredPage]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        project: {
          findMany: vi.fn().mockResolvedValue([]),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        task: {
          findMany: vi.fn().mockResolvedValue([]),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        taskList: {
          findMany: vi.fn().mockResolvedValue([]),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        habit: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        routine: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        event: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        mindMap: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        noteImage: {
          delete: vi.fn(),
          deleteMany: vi.fn(),
        },
        $transaction: vi.fn().mockImplementation((cb: (tx: any) => any) => cb(mockPrisma)),
      };

      vi.spyOn(apiServer, "db").mockReturnValue(mockPrisma);

      const res = await cleanupExpiredTrash();
      expect(res.deleted.pages).toBe(1);

      // GUARANTEE: NoteImage table was NOT touched
      expect(mockPrisma.noteImage.delete).not.toHaveBeenCalled();
      expect(mockPrisma.noteImage.deleteMany).not.toHaveBeenCalled();

      // GUARANTEE: Physical file remains on disk
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Workspace Data Deletion Semantics & Private Vault Isolation
  // ---------------------------------------------------------------------------
  describe("Workspace Data Deletion Semantics (deleteUserData)", () => {
    it("deletes workspace items while STRICTLY PRESERVING NoteImages and Private Vault", async () => {
      const userImgId = "workspace-img-1";
      const imgFile = path.join(tempTestStorageDir, `${userImgId}.png`);
      fs.writeFileSync(imgFile, "note-image-content");

      const deletedTables: string[] = [];

      const mockPrisma: any = {
        habitCompletion: {
          deleteMany: vi.fn().mockImplementation(() => {
            deletedTables.push("habitCompletion");
            return Promise.resolve();
          }),
        },
        habit: {
          deleteMany: vi.fn().mockImplementation(() => {
            deletedTables.push("habit");
            return Promise.resolve();
          }),
        },
        routine: {
          deleteMany: vi.fn().mockImplementation(() => {
            deletedTables.push("routine");
            return Promise.resolve();
          }),
        },
        focusSession: {
          deleteMany: vi.fn().mockImplementation(() => {
            deletedTables.push("focusSession");
            return Promise.resolve();
          }),
        },
        planActivity: {
          deleteMany: vi.fn().mockImplementation(() => {
            deletedTables.push("planActivity");
            return Promise.resolve();
          }),
        },
        planCategory: {
          deleteMany: vi.fn().mockImplementation(() => {
            deletedTables.push("planCategory");
            return Promise.resolve();
          }),
        },
        mindMap: {
          deleteMany: vi.fn().mockImplementation(() => {
            deletedTables.push("mindMap");
            return Promise.resolve();
          }),
        },
        event: {
          deleteMany: vi.fn().mockImplementation(() => {
            deletedTables.push("event");
            return Promise.resolve();
          }),
        },
        page: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          deleteMany: vi.fn().mockImplementation(() => {
            deletedTables.push("page");
            return Promise.resolve();
          }),
        },
        project: {
          deleteMany: vi.fn().mockImplementation(() => {
            deletedTables.push("project");
            return Promise.resolve();
          }),
        },
        task: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          deleteMany: vi.fn().mockImplementation(() => {
            deletedTables.push("task");
            return Promise.resolve();
          }),
        },
        taskList: {
          deleteMany: vi.fn().mockImplementation(() => {
            deletedTables.push("taskList");
            return Promise.resolve();
          }),
        },
        noteImage: {
          deleteMany: vi.fn(),
          delete: vi.fn(),
        },
        // Vault tables — should NEVER be touched!
        vaultMeta: { delete: vi.fn(), deleteMany: vi.fn() },
        vaultEntry: { deleteMany: vi.fn() },
        vaultDocument: { deleteMany: vi.fn() },
        vaultDocumentAttachment: { deleteMany: vi.fn() },
        $transaction: vi.fn().mockImplementation((promises: any[]) => Promise.all(promises)),
      };

      vi.spyOn(apiServer, "db").mockReturnValue(mockPrisma);
      (globalThis as any).__prisma = mockPrisma;

      await deleteUserData(mockUserId);

      // Workspace content tables are wiped
      expect(deletedTables).toContain("page");
      expect(deletedTables).toContain("task");
      expect(deletedTables).toContain("project");

      // GUARANTEE: NoteImage rows are NOT deleted
      expect(mockPrisma.noteImage.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.noteImage.delete).not.toHaveBeenCalled();

      // GUARANTEE: Physical note image file remains on disk
      expect(fs.existsSync(imgFile)).toBe(true);

      // GUARANTEE: Private Vault tables are completely untouched
      expect(mockPrisma.vaultMeta.delete).not.toHaveBeenCalled();
      expect(mockPrisma.vaultMeta.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.vaultEntry.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.vaultDocument.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.vaultDocumentAttachment.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Strictly Read-Only Audit Scanner (scanOrphanedNoteImages)
  // ---------------------------------------------------------------------------
  describe("Strictly Read-Only Audit Scanner (scanOrphanedNoteImages)", () => {
    it("reports unreferenced disk files and DB records without deleting or modifying anything", async () => {
      // 1. Unreferenced file on disk (> 2 hours old) with no DB record
      const diskKey = "11111111-2222-4333-8444-555555555555.png";
      const diskFile = path.join(tempTestStorageDir, diskKey);
      fs.writeFileSync(diskFile, "disk-binary");
      const pastTime = (Date.now() - 3 * 3600 * 1000) / 1000;
      fs.utimesSync(diskFile, pastTime, pastTime);

      // 2. Unreferenced DB record (> 2 hours old) not in any note
      const dbRecordId = "66666666-7777-4888-8999-000000000000";
      const dbRecordKey = `${dbRecordId}.jpg`;
      const dbRecordFile = path.join(tempTestStorageDir, dbRecordKey);
      fs.writeFileSync(dbRecordFile, "db-binary");

      const mockPrisma: any = {
        noteImage: {
          findUnique: vi.fn().mockResolvedValue(null), // Disk file has no DB record
          findMany: vi.fn().mockResolvedValue([
            {
              id: dbRecordId,
              userId: mockUserId,
              storageKey: dbRecordKey,
              createdAt: new Date(Date.now() - 3 * 3600 * 1000),
            },
          ]),
          delete: vi.fn(),
          deleteMany: vi.fn(),
        },
        page: {
          findFirst: vi.fn().mockResolvedValue(null), // No note references this record
        },
      };

      vi.spyOn(apiServer, "db").mockReturnValue(mockPrisma);

      const auditRes = await scanOrphanedNoteImages({
        olderThanMs: 2 * 3600 * 1000,
      });

      expect(auditRes.scannedFiles).toBeGreaterThan(0);
      expect(auditRes.unreferencedDiskFiles.length).toBe(1);
      expect(auditRes.unreferencedDiskFiles[0]?.fileName).toBe(diskKey);
      expect(auditRes.unreferencedDbRecords.length).toBe(1);
      expect(auditRes.unreferencedDbRecords[0]?.id).toBe(dbRecordId);

      // GUARANTEE: Scanner did NOT delete or unlink anything
      expect(fs.existsSync(diskFile)).toBe(true);
      expect(fs.existsSync(dbRecordFile)).toBe(true);
      expect(mockPrisma.noteImage.delete).not.toHaveBeenCalled();
      expect(mockPrisma.noteImage.deleteMany).not.toHaveBeenCalled();
    });
  });
});
