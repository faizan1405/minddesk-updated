/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import * as apiServer from "@/lib/server/api.server";
import * as vaultStorage from "@/lib/server/vault-storage.server";
import { Route as VaultMetaRoute } from "@/routes/api.vault.meta";
import { Route as VaultPasswordRoute } from "@/routes/api.vault.password";
import { Route as VaultEntriesRoute } from "@/routes/api.vault.entries";
import { Route as VaultEntryItemRoute } from "@/routes/api.vault.entries.$id";
import { Route as VaultDocumentsRoute } from "@/routes/api.vault.documents";
import { Route as VaultDocumentItemRoute } from "@/routes/api.vault.documents.$id";
import { Route as VaultDocUploadRoute } from "@/routes/api.vault.documents.upload";
import { Route as VaultDocFilesRoute } from "@/routes/api.vault.documents.files.$id";

describe("My Private Vault API Endpoints", () => {
  const originalEnv = { ...process.env };
  const mockUser = { id: "user_vault_test_1", email: "vault-tester@minddesk.com" };
  const validAttachmentUuid = "a1b2c3d4-e5f6-4a5b-8c7d-9e0f1a2b3c4d";
  const validDocumentUuid = "f1e2d3c4-b5a6-4987-a123-456789abcdef";

  beforeEach(() => {
    process.env = { ...originalEnv, DATABASE_URL: "mysql://mock" };
    delete (globalThis as any).__prisma;
    vi.restoreAllMocks();
  });

  describe("GET & POST /api/vault/meta", () => {
    it("returns initialized: false when vault is not yet setup", async () => {
      const mockPrisma = {
        vaultMeta: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (VaultMetaRoute.options as any).server.handlers;
      const res = await handlers.GET({ request: new Request("http://localhost/api/vault/meta") });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.initialized).toBe(false);
      expect(json.salt).toBeNull();
    });

    it("initializes vault and saves wrapped root key", async () => {
      const mockPrisma = {
        vaultMeta: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            userId: mockUser.id,
            salt: "0123456789abcdef0123456789abcdef",
            wrappedKey: "wrappedKeyBase64String",
            wrappedKeyIv: "wrappedKeyIvBase64String",
            iterations: 3,
            memoryCost: 19456,
            parallelism: 1,
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (VaultMetaRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/vault/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salt: "0123456789abcdef0123456789abcdef",
          wrapped_key: "wrappedKeyBase64String",
          wrapped_key_iv: "wrappedKeyIvBase64String",
        }),
      });

      const res = await handlers.POST({ request: req });
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.initialized).toBe(true);
      expect(json.salt).toBe("0123456789abcdef0123456789abcdef");
      expect(json.version).toBe(1);
    });

    it("rejects duplicate initialization with 409 Conflict", async () => {
      const mockPrisma = {
        vaultMeta: {
          findUnique: vi.fn().mockResolvedValue({
            userId: mockUser.id,
          }),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (VaultMetaRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/vault/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salt: "0123456789abcdef0123456789abcdef",
          wrapped_key: "wrappedKeyBase64String",
          wrapped_key_iv: "wrappedKeyIvBase64String",
        }),
      });

      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(409);
    });

    it("returns descriptive 500 error when database table is missing (P2021)", async () => {
      const p2021Error = new Prisma.PrismaClientKnownRequestError(
        "Table minddesk.vault_meta does not exist",
        { code: "P2021", clientVersion: "6.0.0", meta: { table: "vault_meta" } },
      );
      const mockPrisma = {
        vaultMeta: {
          findUnique: vi.fn().mockRejectedValue(p2021Error),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (VaultMetaRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/vault/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salt: "0123456789abcdef0123456789abcdef",
          wrapped_key: "wrappedKeyBase64String",
          wrapped_key_iv: "wrappedKeyIvBase64String",
        }),
      });

      const res = await handlers.POST({ request: req });
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toContain("Database table not found (vault_meta)");
      expect(json.error).toContain("0011_my_private_vault");
    });
  });

  describe("POST /api/vault/password", () => {
    it("updates wrapped key when correct account password is provided", async () => {
      const mockPrisma = {
        vaultMeta: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            version: 2,
            updatedAt: new Date("2026-10-26T22:00:00Z"),
          }),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);
      vi.spyOn(apiServer, "verifyPassword").mockResolvedValue(true);

      const handlers = (VaultPasswordRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/vault/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salt: "newSaltHex1234567890abcdef123456",
          wrapped_key: "newWrappedKeyBase64",
          wrapped_key_iv: "newWrappedKeyIvBase64",
          expected_version: 1,
          account_password: "ValidAccountPassword123!",
        }),
      });

      const res = await handlers.POST({ request: req });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.version).toBe(2);
      expect(mockPrisma.vaultMeta.updateMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id, version: 1 },
        data: expect.objectContaining({ version: { increment: 1 } }),
      });
    });

    it("rejects master password change if account password is incorrect without touching vault metadata", async () => {
      const mockPrisma = {
        vaultMeta: {
          updateMany: vi.fn(),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);
      vi.spyOn(apiServer, "verifyPassword").mockResolvedValue(false);

      const handlers = (VaultPasswordRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/vault/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salt: "newSaltHex1234567890abcdef123456",
          wrapped_key: "newWrappedKeyBase64",
          wrapped_key_iv: "newWrappedKeyIvBase64",
          expected_version: 1,
          account_password: "WrongAccountPassword!",
        }),
      });

      const res = await handlers.POST({ request: req });
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toContain("Incorrect account password");
      expect(mockPrisma.vaultMeta.updateMany).not.toHaveBeenCalled();
    });

    it("rejects request missing account_password with 400 Bad Request", async () => {
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (VaultPasswordRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/vault/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salt: "newSaltHex1234567890abcdef123456",
          wrapped_key: "newWrappedKeyBase64",
          wrapped_key_iv: "newWrappedKeyIvBase64",
          expected_version: 1,
        }),
      });

      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(400);
    });

    it("rejects concurrent master password changes with 409 Conflict", async () => {
      const mockPrisma = {
        vaultMeta: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findUnique: vi.fn().mockResolvedValue({ userId: mockUser.id, version: 2 }),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);
      vi.spyOn(apiServer, "verifyPassword").mockResolvedValue(true);

      const handlers = (VaultPasswordRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/vault/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salt: "newSaltHex1234567890abcdef123456",
          wrapped_key: "newWrappedKeyBase64",
          wrapped_key_iv: "newWrappedKeyIvBase64",
          expected_version: 1,
          account_password: "ValidAccountPassword123!",
        }),
      });

      const res = await handlers.POST({ request: req });
      expect(res.status).toBe(409);
    });
  });

  describe("Password Entries CRUD", () => {
    it("creates an encrypted password entry", async () => {
      const mockPrisma = {
        vaultEntry: {
          create: vi.fn().mockResolvedValue({
            id: "entry_123",
            userId: mockUser.id,
            encryptedData: "ciphertextBase64",
            iv: "dGVzdGl2YmFzZTY0Cg==",
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (VaultEntriesRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/vault/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encrypted_data: "ciphertextBase64",
          iv: "dGVzdGl2YmFzZTY0Cg==",
        }),
      });

      const res = await handlers.POST({ request: req });
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.id).toBe("entry_123");
      expect(json.encrypted_data).toBe("ciphertextBase64");
    });

    it("updates password entry with atomic version check and deletes entry", async () => {
      const mockPrisma = {
        vaultEntry: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: "entry_123",
            encryptedData: "updatedCiphertext",
            iv: "dGVzdGl2YmFzZTY0Cg==",
            version: 2,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
          findFirst: vi.fn().mockResolvedValue({ id: "entry_123", userId: mockUser.id }),
          delete: vi.fn().mockResolvedValue({ id: "entry_123" }),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const itemHandlers = (VaultEntryItemRoute.options as any).server.handlers;

      // PATCH
      const patchReq = new Request("http://localhost/api/vault/entries/entry_123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encrypted_data: "updatedCiphertext",
          iv: "dGVzdGl2YmFzZTY0Cg==",
          expected_version: 1,
        }),
      });
      const patchRes = await itemHandlers.PATCH({ request: patchReq, params: { id: "entry_123" } });
      const patchJson = await patchRes.json();
      expect(patchJson.version).toBe(2);
      expect(mockPrisma.vaultEntry.updateMany).toHaveBeenCalledWith({
        where: { id: "entry_123", userId: mockUser.id, version: 1 },
        data: expect.objectContaining({ version: { increment: 1 } }),
      });

      // DELETE
      const delReq = new Request("http://localhost/api/vault/entries/entry_123", {
        method: "DELETE",
      });
      const delRes = await itemHandlers.DELETE({ request: delReq, params: { id: "entry_123" } });
      const delJson = await delRes.json();
      expect(delJson.success).toBe(true);
    });

    it("returns 409 Conflict when updating password entry with mismatched version", async () => {
      const mockPrisma = {
        vaultEntry: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: "entry_123", userId: mockUser.id, version: 2 }),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const itemHandlers = (VaultEntryItemRoute.options as any).server.handlers;
      const patchReq = new Request("http://localhost/api/vault/entries/entry_123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encrypted_data: "updatedCiphertext",
          iv: "dGVzdGl2YmFzZTY0Cg==",
          expected_version: 1,
        }),
      });
      const patchRes = await itemHandlers.PATCH({ request: patchReq, params: { id: "entry_123" } });
      expect(patchRes.status).toBe(409);
    });
  });

  describe("Document Keeper CRUD & Storage", () => {
    it("creates an encrypted document record", async () => {
      const mockPrisma = {
        vaultDocument: {
          create: vi.fn().mockResolvedValue({
            id: validDocumentUuid,
            userId: mockUser.id,
            encryptedData: "docMetaCiphertext",
            iv: "dGVzdGl2YmFzZTY0Cg==",
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            attachments: [],
          }),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (VaultDocumentsRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/vault/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encrypted_data: "docMetaCiphertext",
          iv: "dGVzdGl2YmFzZTY0Cg==",
        }),
      });

      const res = await handlers.POST({ request: req });
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.id).toBe(validDocumentUuid);
      expect(json.attachments).toEqual([]);
    });

    it("fetches single document by ID with attachments and validates tenancy", async () => {
      const mockPrisma = {
        vaultDocument: {
          findFirst: vi.fn().mockResolvedValue({
            id: validDocumentUuid,
            userId: mockUser.id,
            encryptedData: "docMetaCiphertext",
            iv: "dGVzdGl2YmFzZTY0Cg==",
            version: 2,
            createdAt: new Date("2026-01-01T00:00:00Z"),
            updatedAt: new Date("2026-01-02T00:00:00Z"),
            attachments: [
              {
                id: validAttachmentUuid,
                encryptedSize: 1024,
                iv: "attachmentIv",
                createdAt: new Date("2026-01-01T00:00:00Z"),
              },
            ],
          }),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (VaultDocumentItemRoute.options as any).server.handlers;
      const req = new Request(`http://localhost/api/vault/documents/${validDocumentUuid}`);
      const res = await handlers.GET({ request: req, params: { id: validDocumentUuid } });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.id).toBe(validDocumentUuid);
      expect(json.version).toBe(2);
      expect(json.attachments).toHaveLength(1);
      expect(json.attachments[0].id).toBe(validAttachmentUuid);
    });

    it("returns 404 when fetching document that does not exist", async () => {
      const mockPrisma = {
        vaultDocument: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };
      (globalThis as any).__prisma = mockPrisma;
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);

      const handlers = (VaultDocumentItemRoute.options as any).server.handlers;
      const req = new Request("http://localhost/api/vault/documents/non-existent-id");
      const res = await handlers.GET({ request: req, params: { id: "non-existent-id" } });

      expect(res.status).toBe(404);
    });

    it("downloads encrypted attachment stream with private no-cache headers", async () => {
      vi.spyOn(apiServer, "requireUser").mockResolvedValue(mockUser as any);
      vi.spyOn(vaultStorage, "readEncryptedAttachmentFile").mockResolvedValue({
        buffer: Buffer.from("encrypted-binary-content"),
        iv: "attachmentIvBase64",
        storageKey: `${validAttachmentUuid}.enc`,
      });

      const handlers = (VaultDocFilesRoute.options as any).server.handlers;
      const req = new Request(`http://localhost/api/vault/documents/files/${validAttachmentUuid}`);
      const res = await handlers.GET({ request: req, params: { id: validAttachmentUuid } });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
      expect(res.headers.get("X-Attachment-IV")).toBe("attachmentIvBase64");
      expect(res.headers.get("Cache-Control")).toContain("no-store");
    });
  });
});
