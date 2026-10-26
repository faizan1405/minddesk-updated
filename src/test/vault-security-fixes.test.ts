/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as apiServer from "@/lib/server/api.server";
import * as vaultStorage from "@/lib/server/vault-storage.server";
import { validateDocumentFileMagicBytes } from "@/components/vault/DocumentDialog";
import { Route as VaultDocUploadRoute } from "@/routes/api.vault.documents.upload";
import { Route as VaultDocumentItemRoute } from "@/routes/api.vault.documents.$id";
import { Route as VaultDocAttachmentRoute } from "@/routes/api.vault.documents.attachments.$id";

describe("Vault Security and Functional Fixes Regression Suite", () => {
  const originalEnv = { ...process.env };
  const mockUser = { id: "user_sec_test_1", email: "sec-tester@minddesk.com" };
  const validDocId = "11111111-2222-4333-8444-555555555555";
  const validAttId = "66666666-7777-4888-8999-000000000000";

  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "minddesk-vault-test-"));
    process.env = {
      ...originalEnv,
      DATABASE_URL: "mysql://mock",
      VAULT_STORAGE_DIR: tempDir,
    };
    delete (globalThis as any).__prisma;
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // =========================================================================
  // P0 — ATTACHMENT FILE PATH TRAVERSAL, ID VALIDATION & CONFINEMENT
  // =========================================================================
  describe("P0: Path Traversal & Storage Confinement", () => {
    it("rejects non-UUID and traversal sequences in isValidUuid", () => {
      expect(vaultStorage.isValidUuid(validDocId)).toBe(true);
      expect(vaultStorage.isValidUuid(validAttId)).toBe(true);

      expect(vaultStorage.isValidUuid("../../etc/passwd")).toBe(false);
      expect(vaultStorage.isValidUuid("..\\..\\windows\\system32")).toBe(false);
      expect(vaultStorage.isValidUuid("malformed-id")).toBe(false);
      expect(vaultStorage.isValidUuid("")).toBe(false);
      expect(vaultStorage.isValidUuid("   ")).toBe(false);
      expect(vaultStorage.isValidUuid(null)).toBe(false);
      expect(vaultStorage.isValidUuid(undefined)).toBe(false);
      expect(vaultStorage.isValidUuid(`${validAttId}/subfolder`)).toBe(false);
    });

    it("verifies getSafeAttachmentPath confines files to storage directory", () => {
      const safePath = vaultStorage.getSafeAttachmentPath(tempDir, `${validAttId}.enc`);
      expect(safePath.startsWith(tempDir)).toBe(true);
      expect(safePath.endsWith(`${validAttId}.enc`)).toBe(true);

      // Traversal sequences must throw
      expect(() =>
        vaultStorage.getSafeAttachmentPath(tempDir, "../../secret.enc"),
      ).toThrow();
      expect(() =>
        vaultStorage.getSafeAttachmentPath(tempDir, `..\\..\\secret.enc`),
      ).toThrow();
      expect(() =>
        vaultStorage.getSafeAttachmentPath(tempDir, `${validAttId}.txt`),
      ).toThrow();
      expect(() =>
        vaultStorage.getSafeAttachmentPath(tempDir, "malicious/nested.enc"),
      ).toThrow();
    });

    it("rejects saveEncryptedAttachmentFile if documentId or attachmentId is malformed or traversal", async () => {
      const buffer = Buffer.from("encrypted-data");
      await expect(
        vaultStorage.saveEncryptedAttachmentFile(
          mockUser.id,
          "../../traversal-doc",
          validAttId,
          buffer,
          "iv1234567890",
        ),
      ).rejects.toThrow("Invalid document ID");

      await expect(
        vaultStorage.saveEncryptedAttachmentFile(
          mockUser.id,
          validDocId,
          "../../traversal-att",
          buffer,
          "iv1234567890",
        ),
      ).rejects.toThrow("Invalid attachment ID");
    });

    it("enforces exclusive file creation: fails with 409 Conflict if file already exists", async () => {
      const existingFile = join(tempDir, `${validAttId}.enc`);
      await writeFile(existingFile, Buffer.from("original-protected-file-data"));

      const buffer = Buffer.from("new-attempted-overwrite-data");

      await expect(
        vaultStorage.saveEncryptedAttachmentFile(
          mockUser.id,
          validDocId,
          validAttId,
          buffer,
          "newiv12345678",
        ),
      ).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining("already exists"),
      });

      // SAFE CLEANUP: Original file MUST NOT be deleted or overwritten!
      const content = await readFile(existingFile, "utf8");
      expect(content).toBe("original-protected-file-data");
    });

    it("safely unlinks only newly created file when database insert fails", async () => {
      const mockPrisma = {
        vaultDocumentAttachment: {
          create: vi.fn().mockRejectedValue(new Error("Database connection dropped")),
        },
      };
      (globalThis as any).__prisma = mockPrisma;

      const buffer = Buffer.from("temporary-encrypted-content");
      const targetFile = join(tempDir, `${validAttId}.enc`);

      await expect(
        vaultStorage.saveEncryptedAttachmentFile(
          mockUser.id,
          validDocId,
          validAttId,
          buffer,
          "iv1234567890",
        ),
      ).rejects.toThrow("Database connection dropped");

      // Verify the failed file was cleaned up and does not linger on disk
      await expect(readFile(targetFile)).rejects.toThrow();
    });
  });

  // =========================================================================
  // P1 — UPLOAD RESOURCE LIMITS & CONTENT-LENGTH CHECK
  // =========================================================================
  describe("P1: Upload Resource Limits", () => {
    it("rejects oversized request upfront based on Content-Length header with 413", async () => {
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (VaultDocUploadRoute.options as any).server.handlers;
      const oversizedLength = (26 * 1024 * 1024).toString(); // 26 MB

      const req = new Request("http://localhost/api/vault/documents/upload", {
        method: "POST",
        headers: {
          "Content-Type": "multipart/form-data; boundary=----WebKitFormBoundary",
          "Content-Length": oversizedLength,
        },
      });

      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(413);
      const json = await res.json();
      expect(json.error).toContain("Payload Too Large");
    });
  });

  // =========================================================================
  // P1 — ATTACHMENT LIFECYCLE & DELETION ENDPOINT
  // =========================================================================
  describe("P1: Attachment Lifecycle Deletion", () => {
    it("deletes attachment disk file and database record", async () => {
      const diskFile = join(tempDir, `${validAttId}.enc`);
      await writeFile(diskFile, Buffer.from("encrypted-file-content"));

      const mockPrisma = {
        vaultDocumentAttachment: {
          findFirst: vi.fn().mockResolvedValue({
            id: validAttId,
            userId: mockUser.id,
            storageKey: `${validAttId}.enc`,
          }),
          delete: vi.fn().mockResolvedValue({ id: validAttId }),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (VaultDocAttachmentRoute.options as any).server.handlers;
      const req = new Request(`http://localhost/api/vault/documents/attachments/${validAttId}`, {
        method: "DELETE",
      });

      const res = await handlers.DELETE({ request: req, params: { id: validAttId } });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.id).toBe(validAttId);
      expect(mockPrisma.vaultDocumentAttachment.delete).toHaveBeenCalledWith({
        where: { id: validAttId },
      });

      // Verify physical file was removed from disk
      await expect(readFile(diskFile)).rejects.toThrow();
    });

    it("rejects attachment deletion with non-UUID id", async () => {
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);
      const handlers = (VaultDocAttachmentRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/vault/documents/attachments/invalid-id", {
        method: "DELETE",
      });

      const res = await handlers.DELETE({ request: req, params: { id: "invalid-id" } });
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // P1 — OPTIMISTIC CONCURRENCY PROTECTION FOR DOCUMENTS
  // =========================================================================
  describe("P1: Document Concurrency Protection", () => {
    it("updates document metadata when expected_version matches", async () => {
      const mockPrisma = {
        vaultDocument: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: validDocId,
            encryptedData: "updatedDocEncryptedData",
            iv: "dGVzdGl2YmFzZTY0Cg==",
            version: 2,
            createdAt: new Date(),
            updatedAt: new Date(),
            attachments: [],
          }),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (VaultDocumentItemRoute.options as any).server.handlers;
      const req = new Request(`http://localhost/api/vault/documents/${validDocId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encrypted_data: "updatedDocEncryptedData",
          iv: "dGVzdGl2YmFzZTY0Cg==",
          expected_version: 1,
        }),
      });

      const res = await handlers.PATCH({ request: req, params: { id: validDocId } });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.version).toBe(2);
      expect(mockPrisma.vaultDocument.updateMany).toHaveBeenCalledWith({
        where: { id: validDocId, userId: mockUser.id, version: 1 },
        data: expect.objectContaining({ version: { increment: 1 } }),
      });
    });

    it("returns 409 Conflict when expected_version does not match current version", async () => {
      const mockPrisma = {
        vaultDocument: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findFirst: vi.fn().mockResolvedValue({
            id: validDocId,
            userId: mockUser.id,
            version: 3, // already updated by another device
          }),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (VaultDocumentItemRoute.options as any).server.handlers;
      const req = new Request(`http://localhost/api/vault/documents/${validDocId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encrypted_data: "updatedDocEncryptedData",
          iv: "dGVzdGl2YmFzZTY0Cg==",
          expected_version: 1, // Stale version
        }),
      });

      const res = await handlers.PATCH({ request: req, params: { id: validDocId } });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain("Conflict");
    });
  });

  // =========================================================================
  // CLIENT-SIDE MAGIC BYTES VALIDATION
  // =========================================================================
  describe("Client-side Magic Bytes Validation", () => {
    it("validates authentic PDF files", async () => {
      const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
      const file = new File([pdfHeader], "doc.pdf", { type: "application/pdf" });
      expect(await validateDocumentFileMagicBytes(file)).toBe(true);
    });

    it("validates authentic PNG files", async () => {
      const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
      const file = new File([pngHeader], "image.png", { type: "image/png" });
      expect(await validateDocumentFileMagicBytes(file)).toBe(true);
    });

    it("validates authentic JPEG files", async () => {
      const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const file = new File([jpegHeader], "photo.jpg", { type: "image/jpeg" });
      expect(await validateDocumentFileMagicBytes(file)).toBe(true);
    });

    it("validates authentic WebP files", async () => {
      // RIFF....WEBP
      const webpHeader = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x20, 0x00, 0x00, 0x00, // length
        0x57, 0x45, 0x42, 0x50, // WEBP
      ]);
      const file = new File([webpHeader], "graphic.webp", { type: "image/webp" });
      expect(await validateDocumentFileMagicBytes(file)).toBe(true);
    });

    it("rejects disguised files with invalid magic bytes", async () => {
      // An executable header (MZ) renamed to .pdf
      const exeHeader = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
      const file = new File([exeHeader], "fake.pdf", { type: "application/pdf" });
      expect(await validateDocumentFileMagicBytes(file)).toBe(false);

      // Plain text disguised as image
      const textHeader = new TextEncoder().encode("Hello world this is not a png");
      const fakePng = new File([textHeader], "fake.png", { type: "image/png" });
      expect(await validateDocumentFileMagicBytes(fakePng)).toBe(false);
    });
  });
});
