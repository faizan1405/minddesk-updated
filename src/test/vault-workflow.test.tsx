/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { VaultProvider, useVault } from "@/components/vault/VaultContext";
import * as vaultClient from "@/lib/vault-client";

// Mock user auth
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "workflow-user-1", email: "workflow@minddesk.com" },
  }),
}));

describe("Vault Workflow: Document Creation, Lifecycle, Concurrency & Rollback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function setupUnlockedVault(initialMeta?: Partial<vaultClient.VaultMetaResponse>) {
    vi.spyOn(vaultClient, "fetchVaultMeta").mockResolvedValue({
      initialized: true,
      salt: "0123456789abcdef0123456789abcdef",
      wrapped_key: "wrappedKeyBase64",
      wrapped_key_iv: "dGVzdGl2YmFzZTY0Cg==",
      iterations: 3,
      memory_cost: 19456,
      parallelism: 1,
      version: 1,
      ...initialMeta,
    });

    vi.spyOn(vaultClient, "fetchVaultEntries").mockResolvedValue([]);
    vi.spyOn(vaultClient, "fetchVaultDocuments").mockResolvedValue([]);

    // Mock initialize
    vi.spyOn(vaultClient, "initializeVaultApi").mockResolvedValue({
      initialized: true,
      salt: "0123456789abcdef0123456789abcdef",
      wrapped_key: "wrappedKeyBase64",
      wrapped_key_iv: "dGVzdGl2YmFzZTY0Cg==",
      iterations: 3,
      memory_cost: 19456,
      parallelism: 1,
      version: 1,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <VaultProvider>{children}</VaultProvider>
    );

    const { result } = renderHook(() => useVault(), { wrapper });

    // Setup vault to enter unlocked state with valid crypto keys
    await act(async () => {
      await result.current.setupVault("MasterPass123!");
    });

    return result;
  }

  // -------------------------------------------------------------------------
  // DOCUMENT CREATION ORDER: RECORD CREATED BEFORE UPLOAD
  // -------------------------------------------------------------------------
  it("creates document record before uploading attachments, then finalizes manifest", async () => {
    const vault = await setupUnlockedVault();

    const callOrder: string[] = [];

    const mockCreateDoc = vi.spyOn(vaultClient, "createVaultDocumentApi").mockImplementation(async (data) => {
      callOrder.push(`createDoc:${data.id}`);
      return {
        id: data.id || "doc_created_1",
        encrypted_data: data.encrypted_data,
        iv: data.iv,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        attachments: [],
      };
    });

    const mockUpload = vi.spyOn(vaultClient, "uploadVaultAttachmentApi").mockImplementation(async (docId, attId) => {
      callOrder.push(`uploadAtt:${docId}:${attId}`);
      return { id: attId, encrypted_size: 1024, iv: "ivBase64" };
    });

    const mockUpdateDoc = vi.spyOn(vaultClient, "updateVaultDocumentApi").mockImplementation(async (id, data) => {
      callOrder.push(`updateDocManifest:${id}:v${data.expected_version}`);
      return {
        id,
        encrypted_data: data.encrypted_data,
        iv: data.iv,
        version: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        attachments: [{ id: "att_1", encrypted_size: 1024, iv: "ivBase64", created_at: new Date().toISOString() }],
      };
    });

    const testPdf = new File(["%PDF-1.4 mock content"], "document.pdf", { type: "application/pdf" });

    await act(async () => {
      await vault.current.saveDocument(
        {
          title: "Driving Licence",
          category: "Identity Documents",
          notes: "DL note",
          attachments: [],
        },
        undefined, // new document
        [{ label: "Front Side", file: testPdf }],
      );
    });

    expect(callOrder.length).toBe(3);
    // 1. First: create document
    expect(callOrder[0]).toMatch(/^createDoc:/);
    // 2. Second: upload attachment
    expect(callOrder[1]).toMatch(/^uploadAtt:/);
    // 3. Third: update document manifest with expected_version
    expect(callOrder[2]).toMatch(/^updateDocManifest:.*:v1$/);

    expect(vault.current.documents.length).toBe(1);
    expect(vault.current.documents[0]?.data.title).toBe("Driving Licence");
  });

  // -------------------------------------------------------------------------
  // MULTI-ATTACHMENT CREATION (FRONT AND BACK IMAGES)
  // -------------------------------------------------------------------------
  it("creates document with front and back images successfully", async () => {
    const vault = await setupUnlockedVault();

    const uploadedIds: string[] = [];
    vi.spyOn(vaultClient, "createVaultDocumentApi").mockImplementation(async (data) => ({
      id: data.id || "doc_multi",
      encrypted_data: data.encrypted_data,
      iv: data.iv,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      attachments: [],
    }));

    vi.spyOn(vaultClient, "uploadVaultAttachmentApi").mockImplementation(async (_docId, attId) => {
      uploadedIds.push(attId);
      return { id: attId, encrypted_size: 2048, iv: "ivBase64" };
    });

    vi.spyOn(vaultClient, "updateVaultDocumentApi").mockImplementation(async (id, data) => ({
      id,
      encrypted_data: data.encrypted_data,
      iv: data.iv,
      version: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      attachments: uploadedIds.map((aId) => ({
        id: aId,
        encrypted_size: 2048,
        iv: "ivBase64",
        created_at: new Date().toISOString(),
      })),
    }));

    const frontImg = new File(["\x89PNG front"], "front.png", { type: "image/png" });
    const backImg = new File(["\x89PNG back"], "back.png", { type: "image/png" });

    await act(async () => {
      await vault.current.saveDocument(
        {
          title: "Voter ID",
          category: "Identity Documents",
          notes: "Voter ID card",
          attachments: [],
        },
        undefined,
        [
          { label: "Front Side", file: frontImg },
          { label: "Back Side", file: backImg },
        ],
      );
    });

    expect(uploadedIds.length).toBe(2);
    expect(vault.current.documents[0]?.data.attachments.length).toBe(2);
  });

  // -------------------------------------------------------------------------
  // CREATING DOCUMENT WITHOUT ATTACHMENTS
  // -------------------------------------------------------------------------
  it("creates document without attachments cleanly", async () => {
    const vault = await setupUnlockedVault();

    vi.spyOn(vaultClient, "createVaultDocumentApi").mockImplementation(async (data) => ({
      id: data.id || "doc_no_att",
      encrypted_data: data.encrypted_data,
      iv: data.iv,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      attachments: [],
    }));

    vi.spyOn(vaultClient, "updateVaultDocumentApi").mockImplementation(async (id, data) => ({
      id,
      encrypted_data: data.encrypted_data,
      iv: data.iv,
      version: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      attachments: [],
    }));

    await act(async () => {
      await vault.current.saveDocument(
        {
          title: "Birth Certificate Notes",
          category: "Other",
          notes: "Original certificate is in physical safe #2",
          attachments: [],
        },
        undefined,
        [],
      );
    });

    expect(vault.current.documents.length).toBe(1);
    expect(vault.current.documents[0]?.data.title).toBe("Birth Certificate Notes");
  });

  // -------------------------------------------------------------------------
  // PARTIAL FAILURE ROLLBACK: NO ORPHANED DOCS OR FILES
  // -------------------------------------------------------------------------
  it("rolls back created document and already uploaded files when an upload fails midway", async () => {
    const vault = await setupUnlockedVault();

    const deletedAtts: string[] = [];
    let docDeleted: string | null = null;

    vi.spyOn(vaultClient, "createVaultDocumentApi").mockImplementation(async (data) => ({
      id: data.id || "doc_rollback_test",
      encrypted_data: data.encrypted_data,
      iv: data.iv,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      attachments: [],
    }));

    let uploadCount = 0;
    vi.spyOn(vaultClient, "uploadVaultAttachmentApi").mockImplementation(async (_docId, attId) => {
      uploadCount++;
      if (uploadCount === 2) {
        throw new Error("Network dropped while uploading back side");
      }
      return { id: attId, encrypted_size: 1024, iv: "iv" };
    });

    vi.spyOn(vaultClient, "deleteVaultAttachmentApi").mockImplementation(async (attId) => {
      deletedAtts.push(attId);
      return { success: true, id: attId };
    });

    vi.spyOn(vaultClient, "deleteVaultDocumentApi").mockImplementation(async (docId) => {
      docDeleted = docId;
      return { success: true, id: docId };
    });

    const file1 = new File(["file1"], "page1.pdf", { type: "application/pdf" });
    const file2 = new File(["file2"], "page2.pdf", { type: "application/pdf" });

    await expect(
      act(async () => {
        await vault.current.saveDocument(
          {
            title: "College Degree",
            category: "Educational Documents",
            notes: "Degree test",
            attachments: [],
          },
          undefined,
          [
            { label: "Page 1", file: file1 },
            { label: "Page 2", file: file2 },
          ],
        );
      }),
    ).rejects.toThrow("Network dropped");

    // Verify rollback cleanup: the 1st successfully uploaded attachment was deleted
    expect(deletedAtts.length).toBe(1);
    // The created document record was deleted
    expect(docDeleted).not.toBeNull();
    // Vault state remains clean
    expect(vault.current.documents.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // EDITING: ADD ATTACHMENTS AND REMOVE ATTACHMENTS LIFECYCLE
  // -------------------------------------------------------------------------
  it("deletes removed attachments from storage and server during document update", async () => {
    const vault = await setupUnlockedVault();

    const deletedAtts: string[] = [];
    vi.spyOn(vaultClient, "deleteVaultAttachmentApi").mockImplementation(async (id) => {
      deletedAtts.push(id);
      return { success: true, id };
    });

    vi.spyOn(vaultClient, "updateVaultDocumentApi").mockImplementation(async (id, data) => ({
      id,
      encrypted_data: data.encrypted_data,
      iv: data.iv,
      version: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      attachments: [],
    }));

    await act(async () => {
      await vault.current.saveDocument(
        {
          title: "PAN Card",
          category: "Identity Documents",
          notes: "PAN notes",
          attachments: [],
        },
        "doc_existing_123",
        undefined,
        ["att_to_remove_456"], // removed attachment ID
        1,
      );
    });

    // P1 Attachment Lifecycle: explicitly calls deleteVaultAttachmentApi
    expect(deletedAtts).toContain("att_to_remove_456");
  });

  // -------------------------------------------------------------------------
  // OPTIMISTIC CONCURRENCY ON PASSWORD UPDATE
  // -------------------------------------------------------------------------
  it("rejects concurrent password edit with 409 Conflict", async () => {
    const vault = await setupUnlockedVault();

    vi.spyOn(vaultClient, "updateVaultEntryApi").mockRejectedValue({
      status: 409,
      message: "Conflict: Password entry was modified by another session. Please reload.",
    });

    await expect(
      act(async () => {
        await vault.current.savePassword(
          {
            name: "GitHub",
            username: "faizan",
            password: "newPassword123!",
            notes: "",
          },
          "entry_123",
          1, // Stale version
        );
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  // -------------------------------------------------------------------------
  // LOCK & ASYNC OPERATION SAFETY
  // -------------------------------------------------------------------------
  it("prevents async operations from updating state if vault is locked midway", async () => {
    const vault = await setupUnlockedVault();

    // Trigger savePassword, but lock vault immediately before API returns
    vi.spyOn(vaultClient, "createVaultEntryApi").mockImplementation(async (data) => {
      // Simulate slow network during which user locks the vault
      vault.current.lockVault();
      return {
        id: data.id || "delayed_entry",
        encrypted_data: data.encrypted_data,
        iv: data.iv,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    await act(async () => {
      await vault.current.savePassword({
        name: "Delayed Account",
        username: "user",
        password: "pw",
        notes: "",
      });
    });

    // Since vault was locked, passwords array MUST remain empty!
    expect(vault.current.status).toBe("locked");
    expect(vault.current.passwords).toEqual([]);
  });
});
