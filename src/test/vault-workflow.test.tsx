import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { VaultProvider, useVault } from "@/components/vault/VaultContext";
import { createVaultKeys } from "@/lib/vault-crypto";
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
      initialized: false,
      salt: null,
      wrapped_key: null,
      wrapped_key_iv: null,
      iterations: 3,
      memory_cost: 19456,
      parallelism: 1,
      version: 1,
      ...initialMeta,
    });

    vi.spyOn(vaultClient, "initializeVaultApi").mockImplementation(async (data) => ({
      initialized: true,
      salt: data.salt,
      wrapped_key: data.wrapped_key,
      wrapped_key_iv: data.wrapped_key_iv,
      iterations: 3,
      memory_cost: 19456,
      parallelism: 1,
      version: 1,
    }));

    vi.spyOn(vaultClient, "fetchVaultEntries").mockResolvedValue([]);
    vi.spyOn(vaultClient, "fetchVaultDocuments").mockResolvedValue([]);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <VaultProvider>{children}</VaultProvider>
    );

    const { result } = renderHook(() => useVault(), { wrapper });

    // Setup vault to enter unlocked state with real crypto keys
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

    vi.spyOn(vaultClient, "createVaultDocumentApi").mockImplementation(async (data) => {
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

    vi.spyOn(vaultClient, "uploadVaultAttachmentApi").mockImplementation(async (docId, attId) => {
      callOrder.push(`uploadAtt:${docId}:${attId}`);
      return { id: attId, encrypted_size: 1024, iv: "ivBase64" };
    });

    vi.spyOn(vaultClient, "updateVaultDocumentApi").mockImplementation(async (id, data) => {
      callOrder.push(`updateDocManifest:${id}:v${data.expected_version}`);
      return {
        id,
        encrypted_data: data.encrypted_data,
        iv: data.iv,
        version: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        attachments: [
          {
            id: "att_1",
            encrypted_size: 1024,
            iv: "ivBase64",
            created_at: new Date().toISOString(),
          },
        ],
      };
    });

    const testPdf = new File(["%PDF-1.4 mock content"], "document.pdf", {
      type: "application/pdf",
    });

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
  // PARTIAL FAILURE RECOVERY: ROLLBACK OF ABANDONED ATTEMPTS
  // -------------------------------------------------------------------------
  it("rolls back created document and newly uploaded files when an upload fails midway", async () => {
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
  // SAFE ATTACHMENT RETIREMENT ORDER: COMMITS METADATA FIRST
  // -------------------------------------------------------------------------
  it("preserves removed attachments until metadata commit, passing obsolete IDs to server", async () => {
    const vault = await setupUnlockedVault();

    let passedObsoleteIds: string[] | undefined;
    let passedRetainedIds: string[] | undefined;

    vi.spyOn(vaultClient, "updateVaultDocumentApi").mockImplementation(async (id, data) => {
      passedObsoleteIds = data.obsolete_attachment_ids;
      passedRetainedIds = data.retained_attachment_ids;
      return {
        id,
        encrypted_data: data.encrypted_data,
        iv: data.iv,
        version: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        attachments: [],
      };
    });

    // deleteVaultAttachmentApi MUST NOT be called prior to updateVaultDocumentApi
    const deleteSpy = vi.spyOn(vaultClient, "deleteVaultAttachmentApi");

    await act(async () => {
      await vault.current.saveDocument(
        {
          title: "PAN Card",
          category: "Identity Documents",
          notes: "PAN notes",
          attachments: [
            {
              id: "att_kept_1",
              label: "Front",
              fileName: "front.png",
              fileSize: 100,
              mimeType: "image/png",
              iv: "iv1",
            },
            {
              id: "att_to_remove_456",
              label: "Old Back",
              fileName: "back.png",
              fileSize: 100,
              mimeType: "image/png",
              iv: "iv2",
            },
          ],
        },
        "doc_existing_123",
        undefined,
        ["att_to_remove_456"], // removed attachment ID
        1, // expected version
      );
    });

    // Pre-commit deletion was NOT called on client
    expect(deleteSpy).not.toHaveBeenCalled();
    // Server was instructed to retire obsolete attachments post-commit
    expect(passedObsoleteIds).toEqual(["att_to_remove_456"]);
    expect(passedRetainedIds).toEqual(["att_kept_1"]);
  });

  it("preserves existing attachments intact when document update encounters 409 Conflict", async () => {
    const vault = await setupUnlockedVault();

    vi.spyOn(vaultClient, "updateVaultDocumentApi").mockRejectedValue({
      status: 409,
      message: "Conflict: Document was modified by another session. Please reload.",
    });

    const deleteSpy = vi.spyOn(vaultClient, "deleteVaultAttachmentApi");

    await expect(
      act(async () => {
        await vault.current.saveDocument(
          {
            title: "Passport",
            category: "Identity Documents",
            notes: "Passport",
            attachments: [
              {
                id: "att_important_1",
                label: "Page 1",
                fileName: "passport.pdf",
                fileSize: 100,
                mimeType: "application/pdf",
                iv: "iv",
              },
            ],
          },
          "doc_passport_123",
          undefined,
          ["att_important_1"], // removed in UI
          1, // Stale version
        );
      }),
    ).rejects.toMatchObject({ status: 409 });

    // CRITICAL: deleteVaultAttachmentApi was NEVER called!
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("handles document edit with both newly added and removed attachments", async () => {
    const vault = await setupUnlockedVault();

    const uploadOrder: string[] = [];

    vi.spyOn(vaultClient, "uploadVaultAttachmentApi").mockImplementation(async (docId, attId) => {
      uploadOrder.push(`upload:${attId}`);
      return { id: attId, encrypted_size: 500, iv: "iv" };
    });

    vi.spyOn(vaultClient, "updateVaultDocumentApi").mockImplementation(async (id, data) => {
      uploadOrder.push(`commitMetadata:${data.expected_version}`);
      return {
        id,
        encrypted_data: data.encrypted_data,
        iv: data.iv,
        version: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        attachments: [
          {
            id: "att_new_789",
            encrypted_size: 500,
            iv: "iv",
            created_at: new Date().toISOString(),
          },
        ],
      };
    });

    const newBackFile = new File(["new-back"], "new_back.png", { type: "image/png" });

    await act(async () => {
      await vault.current.saveDocument(
        {
          title: "Aadhaar Card",
          category: "Identity Documents",
          notes: "Updated back side",
          attachments: [
            {
              id: "att_old_back_123",
              label: "Old Back",
              fileName: "old_back.png",
              fileSize: 100,
              mimeType: "image/png",
              iv: "iv",
            },
          ],
        },
        "doc_aadhaar",
        [{ label: "New Back", file: newBackFile }],
        ["att_old_back_123"], // removed
        2, // expected version
      );
    });

    // Verify correct order: new upload happens FIRST, then metadata commits with version check
    expect(uploadOrder[0]).toMatch(/^upload:/);
    expect(uploadOrder[1]).toBe("commitMetadata:2");
  });

  // -------------------------------------------------------------------------
  // MASTER PASSWORD CHANGE SECURITY WORKFLOW
  // -------------------------------------------------------------------------
  describe("Master Password Change Security", () => {
    it("rejects password change if current master password is incorrect without making network requests", async () => {
      const vault = await setupUnlockedVault();

      const apiSpy = vi.spyOn(vaultClient, "changeVaultPasswordApi");

      await expect(
        act(async () => {
          await vault.current.changeMasterPassword("WrongCurrentPassword!", "NewValidPassword123!");
        }),
      ).rejects.toThrow("Current master password is incorrect");

      // Verify no network request was sent to the server
      expect(apiSpy).not.toHaveBeenCalled();
    });

    it("successfully changes master password when current password is verified locally", async () => {
      const vault = await setupUnlockedVault();

      const apiSpy = vi.spyOn(vaultClient, "changeVaultPasswordApi").mockResolvedValue({
        success: true,
        version: 2,
      });

      await act(async () => {
        // "MasterPass123!" was used in setupUnlockedVault
        await vault.current.changeMasterPassword("MasterPass123!", "BrandNewMasterPass456!");
      });

      expect(apiSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          expected_version: 1,
          salt: expect.any(String),
          wrapped_key: expect.any(String),
          wrapped_key_iv: expect.any(String),
        }),
      );

      expect(vault.current.vaultMeta?.version).toBe(2);
    });

    it("handles 409 conflict when master password was modified from another device", async () => {
      const vault = await setupUnlockedVault();

      vi.spyOn(vaultClient, "changeVaultPasswordApi").mockRejectedValue({
        status: 409,
        message: "Conflict: Master password was changed from another session. Please reload.",
      });

      await expect(
        act(async () => {
          await vault.current.changeMasterPassword("MasterPass123!", "BrandNewMasterPass456!");
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  // -------------------------------------------------------------------------
  // LOCK & ASYNC OPERATION SAFETY
  // -------------------------------------------------------------------------
  it("prevents async operations from updating state if vault is locked midway", async () => {
    const vault = await setupUnlockedVault();

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
