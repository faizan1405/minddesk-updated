/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as apiServer from "@/lib/server/api.server";
import {
  extractImageIdsFromContent,
  getSafeImagePath,
  unlinkImageFiles,
  cleanupNoteImagesForPages,
  cleanupAllUserImages,
  reconcileOrphanedNoteImages,
  getStorageDir,
} from "@/lib/server/images.server";
import { permanentlyDeleteItem, emptyTrash, cleanupExpiredTrash } from "@/lib/server/trash.server";
import { deleteUserData } from "@/lib/server/api.server";

describe("MindDesk — Note Image Cleanup & Workspace Deletion Semantics", () => {
  const originalEnv = { ...process.env };
  const mockUserId = "user-test-uuid-123";
  const mockUserB = "user-test-uuid-456";

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
    it("extracts image IDs from structured JSON blocks", () => {
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
  // 2. Single Note Permanent Deletion & Image Sharing Protection
  // ---------------------------------------------------------------------------
  describe("Note Permanent Deletion & Shared Image Protection", () => {
    it("deletes NoteImage DB record and unlinks file when deleting note with unshared image", async () => {
      const imageId = "img-unshared-1";
      const storageKey = `${imageId}.png`;
      const filePath = path.join(tempTestStorageDir, storageKey);
      fs.writeFileSync(filePath, "dummy-image-content");

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
          findMany: vi.fn().mockResolvedValue([]), // No surviving pages reference this image
        },
        noteImage: {
          findMany: vi.fn().mockResolvedValue([{ id: imageId, storageKey, userId: mockUserId }]),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        $transaction: vi.fn().mockImplementation((cb: (tx: any) => any) => cb(mockPrisma)),
      };

      vi.spyOn(apiServer, "db").mockReturnValue(mockPrisma);

      const result = await permanentlyDeleteItem(mockUserId, "note", "note-1");
      expect(result.success).toBe(true);

      // Verify NoteImage record was deleted
      expect(mockPrisma.noteImage.deleteMany).toHaveBeenCalledWith({
        where: { userId: mockUserId, id: { in: [imageId] } },
      });

      // Verify physical file was unlinked
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it("PRESERVES image when note is deleted but an active surviving note still references it", async () => {
      const sharedImageId = "img-shared-active";
      const storageKey = `${sharedImageId}.png`;
      const filePath = path.join(tempTestStorageDir, storageKey);
      fs.writeFileSync(filePath, "dummy-image-content");

      const deletingNote = {
        id: "note-delete",
        userId: mockUserId,
        content: JSON.stringify({
          blocks: [{ id: "b1", type: "image", url: `/api/images/${sharedImageId}` }],
        }),
        deletedAt: new Date(),
      };

      const survivingActiveNote = {
        id: "note-surviving-active",
        userId: mockUserId,
        content: JSON.stringify({
          blocks: [{ id: "b2", type: "image", url: `/api/images/${sharedImageId}` }],
        }),
        deletedAt: null, // Active
      };

      const mockPrisma: any = {
        page: {
          findFirst: vi.fn().mockResolvedValue(deletingNote),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          delete: vi.fn().mockResolvedValue(deletingNote),
          // Surviving query returns the active note that references the image
          findMany: vi.fn().mockResolvedValue([survivingActiveNote]),
        },
        noteImage: {
          findMany: vi.fn(),
          deleteMany: vi.fn(),
        },
        $transaction: vi.fn().mockImplementation((cb: (tx: any) => any) => cb(mockPrisma)),
      };

      vi.spyOn(apiServer, "db").mockReturnValue(mockPrisma);

      const result = await permanentlyDeleteItem(mockUserId, "note", "note-delete");
      expect(result.success).toBe(true);

      // NoteImage DB record MUST NOT be deleted
      expect(mockPrisma.noteImage.deleteMany).not.toHaveBeenCalled();

      // Physical file MUST NOT be unlinked
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("PRESERVES image when note is deleted but another TRASHED note still references it", async () => {
      const sharedImageId = "img-shared-trashed";
      const storageKey = `${sharedImageId}.png`;
      const filePath = path.join(tempTestStorageDir, storageKey);
      fs.writeFileSync(filePath, "dummy-image-content");

      const deletingNote = {
        id: "note-delete-1",
        userId: mockUserId,
        content: JSON.stringify({
          blocks: [{ id: "b1", type: "image", url: `/api/images/${sharedImageId}` }],
        }),
        deletedAt: new Date(),
      };

      const survivingTrashedNote = {
        id: "note-surviving-trash",
        userId: mockUserId,
        content: JSON.stringify({
          blocks: [{ id: "b2", type: "image", url: `/api/images/${sharedImageId}` }],
        }),
        deletedAt: new Date(), // Trashed, but not permanently deleted yet!
      };

      const mockPrisma: any = {
        page: {
          findFirst: vi.fn().mockResolvedValue(deletingNote),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          delete: vi.fn().mockResolvedValue(deletingNote),
          findMany: vi.fn().mockResolvedValue([survivingTrashedNote]),
        },
        noteImage: {
          findMany: vi.fn(),
          deleteMany: vi.fn(),
        },
        $transaction: vi.fn().mockImplementation((cb: (tx: any) => any) => cb(mockPrisma)),
      };

      vi.spyOn(apiServer, "db").mockReturnValue(mockPrisma);

      const result = await permanentlyDeleteItem(mockUserId, "note", "note-delete-1");
      expect(result.success).toBe(true);

      // DB record & file must remain intact so surviving trashed note can be restored cleanly
      expect(mockPrisma.noteImage.deleteMany).not.toHaveBeenCalled();
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("deletes shared image when the LAST referencing note is permanently deleted", async () => {
      const sharedImageId = "img-last-ref";
      const storageKey = `${sharedImageId}.png`;
      const filePath = path.join(tempTestStorageDir, storageKey);
      fs.writeFileSync(filePath, "dummy-image-content");

      const lastNote = {
        id: "note-last",
        userId: mockUserId,
        content: JSON.stringify({
          blocks: [{ id: "b1", type: "image", url: `/api/images/${sharedImageId}` }],
        }),
        deletedAt: new Date(),
      };

      const mockPrisma: any = {
        page: {
          findFirst: vi.fn().mockResolvedValue(lastNote),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          delete: vi.fn().mockResolvedValue(lastNote),
          // No surviving notes left!
          findMany: vi.fn().mockResolvedValue([]),
        },
        noteImage: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: sharedImageId, storageKey, userId: mockUserId }]),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        $transaction: vi.fn().mockImplementation((cb: (tx: any) => any) => cb(mockPrisma)),
      };

      vi.spyOn(apiServer, "db").mockReturnValue(mockPrisma);

      const result = await permanentlyDeleteItem(mockUserId, "note", "note-last");
      expect(result.success).toBe(true);

      expect(mockPrisma.noteImage.deleteMany).toHaveBeenCalledWith({
        where: { userId: mockUserId, id: { in: [sharedImageId] } },
      });
      expect(fs.existsSync(filePath)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. 30-Day Recycle Bin Automatic Cleanup
  // ---------------------------------------------------------------------------
  describe("30-Day Automatic Trash Cleanup (cleanupExpiredTrash)", () => {
    it("deletes note images of expired notes while preserving images of active notes", async () => {
      const expiredImgId = "img-expired-only";
      const sharedImgId = "img-shared-with-active";

      const expiredImgFile = path.join(tempTestStorageDir, `${expiredImgId}.png`);
      const sharedImgFile = path.join(tempTestStorageDir, `${sharedImgId}.png`);
      fs.writeFileSync(expiredImgFile, "expired-file");
      fs.writeFileSync(sharedImgFile, "shared-file");

      const expiredPage = {
        id: "page-expired-1",
        userId: mockUserId,
        content: JSON.stringify({
          blocks: [
            { id: "b1", type: "image", url: `/api/images/${expiredImgId}` },
            { id: "b2", type: "image", url: `/api/images/${sharedImgId}` },
          ],
        }),
        deletedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
      };

      const survivingActivePage = {
        id: "page-active-1",
        userId: mockUserId,
        content: JSON.stringify({
          blocks: [{ id: "b3", type: "image", url: `/api/images/${sharedImgId}` }],
        }),
      };

      const mockPrisma: any = {
        page: {
          findMany: vi.fn().mockImplementation(({ where }) => {
            if (where.deletedAt?.lte) {
              // expired pages query
              return Promise.resolve([expiredPage]);
            }
            if (where.id?.notIn) {
              // surviving pages query
              return Promise.resolve([survivingActivePage]);
            }
            return Promise.resolve([]);
          }),
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
          findMany: vi.fn().mockImplementation(({ where }) => {
            const requestedIds = where.id.in;
            // Only expiredImgId should be in requestedIds, sharedImgId is preserved!
            if (requestedIds.includes(expiredImgId)) {
              return Promise.resolve([
                { id: expiredImgId, storageKey: `${expiredImgId}.png`, userId: mockUserId },
              ]);
            }
            return Promise.resolve([]);
          }),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        $transaction: vi.fn().mockImplementation((cb: (tx: any) => any) => cb(mockPrisma)),
      };

      vi.spyOn(apiServer, "db").mockReturnValue(mockPrisma);

      const res = await cleanupExpiredTrash();
      expect(res.deleted.pages).toBe(1);

      // Verify expired-only image was deleted from DB and unlinked
      expect(mockPrisma.noteImage.deleteMany).toHaveBeenCalledWith({
        where: { userId: mockUserId, id: { in: [expiredImgId] } },
      });
      expect(fs.existsSync(expiredImgFile)).toBe(false);

      // Verify shared image was preserved
      expect(fs.existsSync(sharedImgFile)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Filesystem Tolerance & Missing File Handling
  // ---------------------------------------------------------------------------
  describe("Filesystem Tolerance, Partial Failure & Idempotency", () => {
    it("handles missing physical files (ENOENT) without crashing or failing database transaction", async () => {
      const missingImageId = "img-missing-disk";
      const storageKey = `${missingImageId}.png`;
      // Note: we do NOT create the file on disk!

      const page = {
        id: "note-with-missing-file",
        userId: mockUserId,
        content: JSON.stringify({
          blocks: [{ id: "b1", type: "image", url: `/api/images/${missingImageId}` }],
        }),
      };

      const mockPrisma: any = {
        page: {
          findMany: vi.fn().mockResolvedValue([]), // No surviving
        },
        noteImage: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: missingImageId, storageKey, userId: mockUserId }]),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      const res = await cleanupNoteImagesForPages(mockUserId, [page], mockPrisma);
      expect(res.deletedImageIds).toContain(missingImageId);
      expect(mockPrisma.noteImage.deleteMany).toHaveBeenCalled();
    });

    it("unlinkImageFiles is idempotent and safe against repeated calls", async () => {
      const testFile = path.join(tempTestStorageDir, "idempotent.png");
      fs.writeFileSync(testFile, "data");

      // First unlink -> removes file
      const unlinked1 = await unlinkImageFiles(["idempotent.png"]);
      expect(unlinked1).toBe(1);
      expect(fs.existsSync(testFile)).toBe(false);

      // Second unlink on same key -> handles ENOENT gracefully, does not throw
      const unlinked2 = await unlinkImageFiles(["idempotent.png"]);
      expect(unlinked2).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Cross-User Protection
  // ---------------------------------------------------------------------------
  describe("User Ownership Protection", () => {
    it("never deletes or cleans up note images belonging to another user", async () => {
      const userBImageId = "img-owned-by-user-b";
      const storageKey = `${userBImageId}.png`;
      const filePath = path.join(tempTestStorageDir, storageKey);
      fs.writeFileSync(filePath, "user-b-image");

      // User A creates a note referencing User B's image ID
      const userAPage = {
        id: "user-a-note",
        content: JSON.stringify({
          blocks: [{ id: "b1", type: "image", url: `/api/images/${userBImageId}` }],
        }),
      };

      const mockPrisma: any = {
        page: {
          findMany: vi.fn().mockResolvedValue([]), // No surviving pages for User A
        },
        noteImage: {
          // When querying for User A, DB returns empty because image belongs to User B!
          findMany: vi.fn().mockImplementation(({ where }) => {
            if (where.userId === mockUserId) return Promise.resolve([]);
            return Promise.resolve([{ id: userBImageId, storageKey, userId: mockUserB }]);
          }),
          deleteMany: vi.fn(),
        },
      };

      const res = await cleanupNoteImagesForPages(mockUserId, [userAPage], mockPrisma);

      // Nothing should be deleted for User A
      expect(res.deletedImageIds).toEqual([]);
      expect(mockPrisma.noteImage.deleteMany).not.toHaveBeenCalled();

      // User B's file on disk must remain untouched
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Workspace Data Deletion Semantics & Private Vault Isolation
  // ---------------------------------------------------------------------------
  describe("Workspace Data Deletion Semantics (deleteUserData)", () => {
    it("deletes NoteImages and disk files while STRICTLY PRESERVING Private Vault tables and files", async () => {
      const userImgId = "workspace-img-1";
      const imgFile = path.join(tempTestStorageDir, `${userImgId}.png`);
      fs.writeFileSync(imgFile, "note-image-content");

      const deletedTables: string[] = [];

      const mockPrisma: any = {
        noteImage: {
          findMany: vi.fn().mockResolvedValue([{ storageKey: `${userImgId}.png` }]),
          deleteMany: vi.fn().mockImplementation(() => {
            deletedTables.push("noteImage");
            return Promise.resolve({ count: 1 });
          }),
        },
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
        // Vault tables — should NEVER be touched by deleteUserData!
        vaultMeta: { delete: vi.fn(), deleteMany: vi.fn() },
        vaultEntry: { deleteMany: vi.fn() },
        vaultDocument: { deleteMany: vi.fn() },
        vaultDocumentAttachment: { deleteMany: vi.fn() },
        $transaction: vi.fn().mockImplementation((promises: any[]) => Promise.all(promises)),
      };

      vi.spyOn(apiServer, "db").mockReturnValue(mockPrisma);
      (globalThis as any).__prisma = mockPrisma;

      await deleteUserData(mockUserId);

      // Verify NoteImage is among deleted workspace tables
      expect(deletedTables).toContain("noteImage");
      expect(deletedTables).toContain("page");
      expect(deletedTables).toContain("task");
      expect(deletedTables).toContain("project");

      // Verify physical note image file was unlinked
      expect(fs.existsSync(imgFile)).toBe(false);

      // Verify VAULT tables were NOT touched
      expect(mockPrisma.vaultMeta.delete).not.toHaveBeenCalled();
      expect(mockPrisma.vaultMeta.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.vaultEntry.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.vaultDocument.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.vaultDocumentAttachment.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Storage Reconciliation Maintenance Utility
  // ---------------------------------------------------------------------------
  describe("Operational Storage Reconciliation (reconcileOrphanedNoteImages)", () => {
    it("dry-run mode identifies orphaned disk files and DB records without modifying them", async () => {
      // 1. Abandoned file on disk (> 2 hours old) with no DB record
      const abandonedKey = "11111111-2222-4333-8444-555555555555.png";
      const abandonedFile = path.join(tempTestStorageDir, abandonedKey);
      fs.writeFileSync(abandonedFile, "abandoned");
      const pastTime = (Date.now() - 3 * 3600 * 1000) / 1000;
      fs.utimesSync(abandonedFile, pastTime, pastTime);

      // 2. Orphaned DB record (> 2 hours old) not referenced by any note
      const orphanedRecordId = "66666666-7777-4888-8999-000000000000";
      const orphanedRecordKey = `${orphanedRecordId}.jpg`;
      const orphanedRecordFile = path.join(tempTestStorageDir, orphanedRecordKey);
      fs.writeFileSync(orphanedRecordFile, "orphaned-record-file");

      const mockPrisma: any = {
        noteImage: {
          findUnique: vi.fn().mockResolvedValue(null), // Abandoned disk file has no DB record
          findMany: vi
            .fn()
            .mockResolvedValue([
              { id: orphanedRecordId, userId: mockUserId, storageKey: orphanedRecordKey },
            ]),
          delete: vi.fn(),
        },
        page: {
          findFirst: vi.fn().mockResolvedValue(null), // No note references this record
        },
      };

      vi.spyOn(apiServer, "db").mockReturnValue(mockPrisma);

      const dryRunRes = await reconcileOrphanedNoteImages({
        olderThanMs: 2 * 3600 * 1000,
        dryRun: true,
      });

      expect(dryRunRes.dryRun).toBe(true);
      expect(dryRunRes.scannedFiles).toBeGreaterThan(0);
      expect(dryRunRes.unlinkedFiles).toBe(1);
      expect(dryRunRes.deletedDbRecords).toBe(1);

      // Because dryRun=true, neither file nor DB record was removed
      expect(fs.existsSync(abandonedFile)).toBe(true);
      expect(fs.existsSync(orphanedRecordFile)).toBe(true);
      expect(mockPrisma.noteImage.delete).not.toHaveBeenCalled();
    });

    it("execute mode deletes orphaned files and unreferenced DB records older than grace period", async () => {
      const abandonedKey = "11111111-2222-4333-8444-555555555555.png";
      const abandonedFile = path.join(tempTestStorageDir, abandonedKey);
      fs.writeFileSync(abandonedFile, "abandoned");
      const pastTime = (Date.now() - 3 * 3600 * 1000) / 1000;
      fs.utimesSync(abandonedFile, pastTime, pastTime);

      const orphanedRecordId = "66666666-7777-4888-8999-000000000000";
      const orphanedRecordKey = `${orphanedRecordId}.jpg`;
      const orphanedRecordFile = path.join(tempTestStorageDir, orphanedRecordKey);
      fs.writeFileSync(orphanedRecordFile, "orphaned-record-file");

      const mockPrisma: any = {
        noteImage: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi
            .fn()
            .mockResolvedValue([
              { id: orphanedRecordId, userId: mockUserId, storageKey: orphanedRecordKey },
            ]),
          delete: vi.fn().mockResolvedValue({ id: orphanedRecordId }),
        },
        page: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      vi.spyOn(apiServer, "db").mockReturnValue(mockPrisma);

      const execRes = await reconcileOrphanedNoteImages({
        olderThanMs: 2 * 3600 * 1000,
        dryRun: false,
      });

      expect(execRes.dryRun).toBe(false);
      expect(execRes.unlinkedFiles).toBe(1);
      expect(execRes.deletedDbRecords).toBe(1);

      // Verify files were unlinked and DB row deleted
      expect(fs.existsSync(abandonedFile)).toBe(false);
      expect(fs.existsSync(orphanedRecordFile)).toBe(false);
      expect(mockPrisma.noteImage.delete).toHaveBeenCalledWith({
        where: { id: orphanedRecordId },
      });
    });
  });
});
