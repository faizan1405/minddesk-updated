import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  createVaultKeys,
  unlockVault,
  rewrapVaultKeys,
  getPasswordKey,
  getDocumentMetaKey,
  getAttachmentKey,
  encryptPasswordEntry,
  decryptPasswordEntry,
  encryptDocumentMeta,
  decryptDocumentMeta,
  encryptDocumentFile,
  type PasswordEntryData,
  type DocumentMetadata,
  type DocumentAttachmentMeta,
} from "@/lib/vault-crypto";
import {
  fetchVaultMeta,
  initializeVaultApi,
  changeVaultPasswordApi,
  fetchVaultEntries,
  createVaultEntryApi,
  updateVaultEntryApi,
  deleteVaultEntryApi,
  fetchVaultDocuments,
  getVaultDocumentApi,
  createVaultDocumentApi,
  updateVaultDocumentApi,
  deleteVaultDocumentApi,
  uploadVaultAttachmentApi,
  deleteVaultAttachmentApi,
  type VaultMetaResponse,
  type EncryptedAttachmentDto,
  type EncryptedDocumentDto,
} from "@/lib/vault-client";
import { useAuth } from "@/hooks/use-auth";
import { readFileAsArrayBuffer } from "./DocumentDialog";

export function isAmbiguousNetworkError(err: unknown): boolean {
  if (!err) return false;
  const status =
    (err as { status?: number; statusCode?: number })?.status ??
    (err as { status?: number; statusCode?: number })?.statusCode;
  // If it's an explicit HTTP 4xx response, it was definitively rejected before commit
  if (typeof status === "number" && status >= 400 && status < 500) {
    return false;
  }
  if (err instanceof TypeError) return true; // Standard browser network fetch failure
  if ((err as Error)?.name === "AbortError") return true;
  const msg = ((err as Error)?.message || String(err)).toLowerCase();
  if (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("abort") ||
    msg.includes("load failed") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504")
  ) {
    return true;
  }
  if (typeof status === "number" && status >= 500) {
    return true;
  }
  return false;
}

export interface DecryptedPasswordItem {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  data: PasswordEntryData;
}

export interface DecryptedDocumentItem {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  data: DocumentMetadata;
  attachments: EncryptedAttachmentDto[];
}

export type VaultStatus = "loading" | "uninitialized" | "locked" | "unlocked";

interface VaultContextType {
  status: VaultStatus;
  vaultMeta: VaultMetaResponse | null;
  timeoutMinutes: number;
  setTimeoutMinutes: (mins: number) => void;
  secondsUntilLock: number;
  isWindowBlurred: boolean;

  // Unlocked content
  passwords: DecryptedPasswordItem[];
  documents: DecryptedDocumentItem[];
  isLoadingData: boolean;

  // Actions
  setupVault: (masterPassword: string) => Promise<void>;
  unlockVault: (masterPassword: string) => Promise<boolean>;
  lockVault: () => void;
  changeMasterPassword: (
    currentPassword: string,
    newPassword: string,
    accountPassword?: string,
  ) => Promise<void>;

  // Password operations
  savePassword: (data: PasswordEntryData, id?: string, expectedVersion?: number) => Promise<void>;
  deletePassword: (id: string) => Promise<void>;

  // Document operations
  saveDocument: (
    meta: DocumentMetadata,
    id?: string,
    newFiles?: Array<{ label: string; file: File }>,
    removedAttachmentIds?: string[],
    expectedVersion?: number,
  ) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;

  // Key accessor for binary file decryption
  getAttachmentCryptoKey: (attachmentId: string) => Promise<CryptoKey | null>;
}

const VaultContext = createContext<VaultContextType | null>(null);

const DEFAULT_TIMEOUT_MINUTES = 5;

/**
 * Memory Key Management and Secure Erasure:
 * In-memory root encryption key bytes are cleared by overwriting the backing Uint8Array with zeros
 * via `rootKeyRef.current.fill(0)` and then nullifying references for garbage collection.
 *
 * LIMITATION NOTE:
 * Due to JavaScript runtime engine specifications (V8 / browser JavaScript VMs), string primitives
 * (passwords, base64 tokens) and intermediate CryptoKey internal states are immutable and handled
 * by engine-managed memory pools. Complete, deterministic zeroing of low-level process RAM cannot
 * be guaranteed in standard web runtimes until the engine executes garbage collection cycles.
 */
export function VaultProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<VaultStatus>("loading");
  const [vaultMeta, setVaultMeta] = useState<VaultMetaResponse | null>(null);

  // In-memory ONLY references
  const rootKeyRef = useRef<Uint8Array | null>(null);
  const passKeyRef = useRef<CryptoKey | null>(null);
  const docMetaKeyRef = useRef<CryptoKey | null>(null);

  // P1: Unlock generation token to guard against race conditions and async leaks across lock/logout
  const unlockGenerationRef = useRef<number>(0);

  // Decrypted records
  const [passwords, setPasswords] = useState<DecryptedPasswordItem[]>([]);
  const [documents, setDocuments] = useState<DecryptedDocumentItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Auto-lock & window focus
  const [timeoutMinutes, setTimeoutMinutesState] = useState<number>(() => {
    try {
      const stored = localStorage.getItem("md_vault_timeout");
      return stored ? parseInt(stored, 10) : DEFAULT_TIMEOUT_MINUTES;
    } catch {
      return DEFAULT_TIMEOUT_MINUTES;
    }
  });

  const [secondsUntilLock, setSecondsUntilLock] = useState<number>(timeoutMinutes * 60);
  const [isWindowBlurred, setIsWindowBlurred] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());
  const channelRef = useRef<BroadcastChannel | null>(null);

  const setTimeoutMinutes = useCallback((mins: number) => {
    setTimeoutMinutesState(mins);
    try {
      localStorage.setItem("md_vault_timeout", mins.toString());
    } catch {
      // storage disabled
    }
  }, []);

  // Securely clear memory keys and invalidate in-flight async callbacks
  const purgeKeys = useCallback(() => {
    unlockGenerationRef.current += 1;
    if (rootKeyRef.current) {
      rootKeyRef.current.fill(0);
      rootKeyRef.current = null;
    }
    passKeyRef.current = null;
    docMetaKeyRef.current = null;
    setPasswords([]);
    setDocuments([]);
    setIsLoadingData(false);
  }, []);

  // Lock vault action
  const lockVault = useCallback(() => {
    purgeKeys();
    setStatus("locked");
    try {
      channelRef.current?.postMessage({ type: "lock" });
    } catch {
      // channel closed
    }
  }, [purgeKeys]);

  // P1: Auto-lock and purge memory keys on user logout or session switch
  const previousUserIdRef = useRef<string | undefined>(user?.id);
  useEffect(() => {
    if (previousUserIdRef.current && (!user || user.id !== previousUserIdRef.current)) {
      purgeKeys();
      setStatus(user ? "locked" : "loading");
    }
    previousUserIdRef.current = user?.id;
  }, [user, purgeKeys]);

  // Initial load: check if vault is initialized
  useEffect(() => {
    let cancelled = false;
    async function checkMeta() {
      if (!user) {
        setStatus("loading");
        return;
      }
      try {
        const meta = await fetchVaultMeta();
        if (cancelled) return;
        setVaultMeta((prev) => (prev?.initialized ? prev : meta));
        setStatus((prev) => {
          if (prev === "unlocked" || prev === "locked") return prev;
          return meta.initialized ? "locked" : "uninitialized";
        });
      } catch (err) {
        console.error("[vault] Failed to fetch meta:", err);
        if (!cancelled) {
          setStatus((prev) => (prev === "unlocked" || prev === "locked" ? prev : "uninitialized"));
        }
      }
    }
    checkMeta();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Cross-tab lock synchronization
  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel("minddesk-vault-sync");
    channelRef.current = channel;

    channel.onmessage = (event) => {
      if (event.data?.type === "lock") {
        purgeKeys();
        setStatus("locked");
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [purgeKeys]);

  // Activity listeners & auto-lock ticker
  useEffect(() => {
    if (status !== "unlocked") return;

    const resetActivity = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener("pointerdown", resetActivity, { passive: true });
    window.addEventListener("keydown", resetActivity, { passive: true });
    window.addEventListener("touchstart", resetActivity, { passive: true });
    window.addEventListener("wheel", resetActivity, { passive: true });

    const handleVisibility = () => {
      setIsWindowBlurred(document.visibilityState === "hidden");
    };
    const handleBlur = () => setIsWindowBlurred(true);
    const handleFocus = () => setIsWindowBlurred(false);

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      const remaining = Math.max(0, timeoutMinutes * 60 - elapsed);
      setSecondsUntilLock(remaining);

      if (remaining <= 0) {
        lockVault();
        toast.info("Vault locked automatically due to inactivity.");
      }
    }, 1000);

    return () => {
      window.removeEventListener("pointerdown", resetActivity);
      window.removeEventListener("keydown", resetActivity);
      window.removeEventListener("touchstart", resetActivity);
      window.removeEventListener("wheel", resetActivity);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      clearInterval(interval);
    };
  }, [status, timeoutMinutes, lockVault]);

  // Decrypt all entries and documents upon unlock (with generation safety)
  const loadVaultData = useCallback(
    async (rootKeyBytes: Uint8Array, userId: string, generation: number) => {
      setIsLoadingData(true);
      try {
        const passKey = await getPasswordKey(rootKeyBytes);
        const docMetaKey = await getDocumentMetaKey(rootKeyBytes);

        if (unlockGenerationRef.current !== generation) return;

        passKeyRef.current = passKey;
        docMetaKeyRef.current = docMetaKey;

        const [encEntries, encDocs] = await Promise.all([
          fetchVaultEntries(),
          fetchVaultDocuments(),
        ]);

        if (unlockGenerationRef.current !== generation) return;

        // Decrypt passwords
        const decryptedPasswords: DecryptedPasswordItem[] = [];
        for (const entry of encEntries) {
          if (unlockGenerationRef.current !== generation) return;
          try {
            const data = await decryptPasswordEntry(
              { ciphertext: entry.encrypted_data, iv: entry.iv },
              passKey,
              entry.id,
              userId,
            );
            decryptedPasswords.push({
              id: entry.id,
              version: entry.version,
              createdAt: entry.created_at,
              updatedAt: entry.updated_at,
              data,
            });
          } catch (err) {
            console.warn(
              "[vault] Skipping tampered or undecryptable password entry:",
              entry.id,
              err,
            );
          }
        }

        // Decrypt documents
        const decryptedDocs: DecryptedDocumentItem[] = [];
        for (const doc of encDocs) {
          if (unlockGenerationRef.current !== generation) return;
          try {
            const data = await decryptDocumentMeta(
              { ciphertext: doc.encrypted_data, iv: doc.iv },
              docMetaKey,
              doc.id,
              userId,
            );
            decryptedDocs.push({
              id: doc.id,
              version: doc.version,
              createdAt: doc.created_at,
              updatedAt: doc.updated_at,
              data,
              attachments: doc.attachments,
            });
          } catch (err) {
            console.warn("[vault] Skipping tampered or undecryptable document:", doc.id, err);
          }
        }

        if (unlockGenerationRef.current !== generation) return;

        setPasswords(decryptedPasswords);
        setDocuments(decryptedDocs);
      } finally {
        if (unlockGenerationRef.current === generation) {
          setIsLoadingData(false);
        }
      }
    },
    [],
  );

  // Setup vault (first time)
  const setupVault = useCallback(
    async (masterPassword: string) => {
      if (!user) throw new Error("Must be signed in to set up vault.");
      const keys = await createVaultKeys(masterPassword);

      const meta = await initializeVaultApi({
        salt: keys.saltHex,
        wrapped_key: keys.wrappedKey,
        wrapped_key_iv: keys.wrappedKeyIv,
      });

      unlockGenerationRef.current += 1;
      const gen = unlockGenerationRef.current;

      setVaultMeta(meta);
      rootKeyRef.current = keys.rootKeyBytes;

      const passKey = await getPasswordKey(keys.rootKeyBytes);
      const docMetaKey = await getDocumentMetaKey(keys.rootKeyBytes);

      if (unlockGenerationRef.current !== gen) return;

      passKeyRef.current = passKey;
      docMetaKeyRef.current = docMetaKey;

      lastActivityRef.current = Date.now();
      setSecondsUntilLock(timeoutMinutes * 60);
      setStatus("unlocked");
      toast.success("My Private Vault created and unlocked successfully.");
    },
    [user, timeoutMinutes],
  );

  // Unlock vault
  const unlockVaultAction = useCallback(
    async (masterPassword: string): Promise<boolean> => {
      if (
        !user ||
        !vaultMeta ||
        !vaultMeta.salt ||
        !vaultMeta.wrapped_key ||
        !vaultMeta.wrapped_key_iv
      ) {
        toast.error("Vault metadata missing. Please reload.");
        return false;
      }

      try {
        const rootKeyBytes = await unlockVault(
          masterPassword,
          vaultMeta.salt,
          vaultMeta.wrapped_key,
          vaultMeta.wrapped_key_iv,
          {
            iterations: vaultMeta.iterations,
            memoryCost: vaultMeta.memory_cost,
            parallelism: vaultMeta.parallelism,
          },
        );

        unlockGenerationRef.current += 1;
        const gen = unlockGenerationRef.current;

        rootKeyRef.current = rootKeyBytes;
        lastActivityRef.current = Date.now();
        setSecondsUntilLock(timeoutMinutes * 60);
        setStatus("unlocked");

        await loadVaultData(rootKeyBytes, user.id, gen);
        toast.success("Vault unlocked.");
        return true;
      } catch {
        toast.error("Incorrect master password. Please try again.");
        return false;
      }
    },
    [user, vaultMeta, timeoutMinutes, loadVaultData],
  );

  // Change master password with local verification, account password re-auth, and optimistic concurrency protection
  const changeMasterPassword = useCallback(
    async (currentPassword: string, newPassword: string, accountPassword?: string) => {
      if (
        !rootKeyRef.current ||
        !vaultMeta ||
        !vaultMeta.salt ||
        !vaultMeta.wrapped_key ||
        !vaultMeta.wrapped_key_iv
      ) {
        throw new Error("Vault must be unlocked with valid metadata to change master password.");
      }
      if (!currentPassword) {
        throw new Error("Please enter your current master password.");
      }
      if (!newPassword || newPassword.length < 8) {
        throw new Error("New master password must be at least 8 characters.");
      }
      if (!accountPassword) {
        throw new Error("Please enter your MindDesk account password.");
      }

      const gen = unlockGenerationRef.current;

      // 1. Verify current master password locally against wrapped key (never sent to server)
      try {
        await unlockVault(
          currentPassword,
          vaultMeta.salt,
          vaultMeta.wrapped_key,
          vaultMeta.wrapped_key_iv,
          {
            iterations: vaultMeta.iterations,
            memoryCost: vaultMeta.memory_cost,
            parallelism: vaultMeta.parallelism,
          },
        );
      } catch {
        throw new Error(
          "Current master password is incorrect. Please re-enter your current password.",
        );
      }

      if (unlockGenerationRef.current !== gen) {
        throw new Error("Vault locked during password change.");
      }

      // 2. Rewrap existing root DEK with new master password (neither password sent in plaintext)
      const rewrapped = await rewrapVaultKeys(rootKeyRef.current, newPassword, {
        iterations: vaultMeta.iterations,
        memoryCost: vaultMeta.memory_cost,
        parallelism: vaultMeta.parallelism,
      });

      if (unlockGenerationRef.current !== gen) {
        throw new Error("Vault locked during password change.");
      }

      // 3. Local Self-Unwrap Verification: Verify locally that new master password successfully unwraps
      // the new wrapped key, and verify that the unwrapped key bytes match existing root encryption key
      const verifiedUnwrappedKey = await unlockVault(
        newPassword,
        rewrapped.saltHex,
        rewrapped.wrappedKey,
        rewrapped.wrappedKeyIv,
        {
          iterations: vaultMeta.iterations,
          memoryCost: vaultMeta.memory_cost,
          parallelism: vaultMeta.parallelism,
        },
      );

      const rootKey = rootKeyRef.current;
      if (
        !rootKey ||
        verifiedUnwrappedKey.length !== rootKey.length ||
        !verifiedUnwrappedKey.every((byte, idx) => byte === rootKey[idx])
      ) {
        throw new Error(
          "Cryptographic self-check failed: newly wrapped key does not match root key. Update aborted for safety.",
        );
      }

      try {
        const res = await changeVaultPasswordApi({
          salt: rewrapped.saltHex,
          wrapped_key: rewrapped.wrappedKey,
          wrapped_key_iv: rewrapped.wrappedKeyIv,
          expected_version: vaultMeta.version,
          account_password: accountPassword,
        });

        if (unlockGenerationRef.current !== gen) return;

        setVaultMeta((prev) =>
          prev
            ? {
                ...prev,
                salt: rewrapped.saltHex,
                wrapped_key: rewrapped.wrappedKey,
                wrapped_key_iv: rewrapped.wrappedKeyIv,
                version: res.version,
              }
            : prev,
        );

        toast.success("Master password updated successfully.");
      } catch (err: unknown) {
        const errorObj = err as { status?: number; message?: string; error?: string };
        const msg = errorObj?.error || errorObj?.message || "";

        // Safe recovery check: if network dropped ambiguously, verify if the server actually committed the change
        if (isAmbiguousNetworkError(err)) {
          try {
            const latestMeta = await fetchVaultMeta();
            // Strict metadata verification:
            // 1. Vault is initialized
            // 2. Exact version increment (expected_version + 1)
            // 3. Exact wrapped_key matches candidate
            // 4. Exact salt matches candidate
            // 5. Exact wrapped_key_iv matches candidate
            const isExactMetadataMatch =
              latestMeta.initialized &&
              latestMeta.version === vaultMeta.version + 1 &&
              latestMeta.wrapped_key === rewrapped.wrappedKey &&
              latestMeta.salt === rewrapped.saltHex &&
              latestMeta.wrapped_key_iv === rewrapped.wrappedKeyIv;

            if (
              isExactMetadataMatch &&
              latestMeta.salt &&
              latestMeta.wrapped_key &&
              latestMeta.wrapped_key_iv
            ) {
              // 6. Cryptographic confirmation: verify that server's committed metadata can be unlocked
              // with newPassword to yield the exact active root key byte-for-byte!
              const recoveredKey = await unlockVault(
                newPassword,
                latestMeta.salt,
                latestMeta.wrapped_key,
                latestMeta.wrapped_key_iv,
                {
                  iterations: latestMeta.iterations,
                  memoryCost: latestMeta.memory_cost,
                  parallelism: latestMeta.parallelism,
                },
              );

              const currentRootKey = rootKeyRef.current;
              const keysMatch =
                currentRootKey &&
                recoveredKey.length === currentRootKey.length &&
                recoveredKey.every((b, i) => b === currentRootKey[i]);

              if (keysMatch) {
                if (unlockGenerationRef.current !== gen) return;
                setVaultMeta(latestMeta);
                toast.success(
                  "Master password updated successfully (verified after network reconnection).",
                );
                return;
              }
            }
          } catch {
            // Verification failed or could not be confirmed
          }

          // If recovery could not verify exact metadata & cryptographic match:
          // NEVER report success! Do not alter local metadata or delete any entries/documents.
          // REJECT with a clear error so the UI keeps the dialog open and displays recovery guidance!
          const unconfirmedError = new Error(
            "Network connection was interrupted and the server update could not be verified. Your master password has NOT been changed. Please check your connection and try again.",
          );
          toast.error(unconfirmedError.message);
          throw unconfirmedError;
        }

        if (errorObj?.status === 409 || msg.includes("Conflict") || msg.includes("409")) {
          toast.error("Conflict: Master password was changed from another session. Please reload.");
        } else if (errorObj?.status === 401 || msg.includes("account password")) {
          toast.error("Incorrect MindDesk account password.");
        } else if (errorObj?.status === 429 || msg.includes("Too many")) {
          toast.error(msg || "Too many attempts. Please try again later.");
        }
        throw err;
      }
    },
    [vaultMeta],
  );

  // Save (Create or Edit) Password Entry with optimistic concurrency & async lock safety
  const savePassword = useCallback(
    async (data: PasswordEntryData, id?: string, expectedVersion?: number) => {
      if (!user || !passKeyRef.current) throw new Error("Vault is locked.");

      const gen = unlockGenerationRef.current;
      const entryId = id || crypto.randomUUID();
      const encrypted = await encryptPasswordEntry(data, passKeyRef.current, entryId, user.id);

      if (unlockGenerationRef.current !== gen) return;

      if (id) {
        try {
          const updated = await updateVaultEntryApi(id, {
            encrypted_data: encrypted.ciphertext,
            iv: encrypted.iv,
            expected_version: expectedVersion ?? 1,
          });

          if (unlockGenerationRef.current !== gen) return;

          setPasswords((prev) =>
            prev.map((p) =>
              p.id === id
                ? {
                    id,
                    version: updated.version,
                    createdAt: p.createdAt,
                    updatedAt: updated.updated_at,
                    data,
                  }
                : p,
            ),
          );
          toast.success("Password entry updated.");
        } catch (err: unknown) {
          const errorObj = err as { status?: number; message?: string };
          if (
            errorObj?.status === 409 ||
            errorObj?.message?.includes("Conflict") ||
            errorObj?.message?.includes("409")
          ) {
            toast.error("Conflict: Password entry was modified by another session. Please reload.");
          }
          throw err;
        }
      } else {
        const created = await createVaultEntryApi({
          id: entryId,
          encrypted_data: encrypted.ciphertext,
          iv: encrypted.iv,
        });

        if (unlockGenerationRef.current !== gen) return;

        setPasswords((prev) => [
          {
            id: created.id,
            version: created.version,
            createdAt: created.created_at,
            updatedAt: created.updated_at,
            data,
          },
          ...prev,
        ]);
        toast.success("Password entry saved.");
      }
    },
    [user],
  );

  // Delete Password Entry
  const deletePassword = useCallback(async (id: string) => {
    await deleteVaultEntryApi(id);
    setPasswords((prev) => prev.filter((p) => p.id !== id));
    toast.success("Password entry deleted.");
  }, []);

  // Save (Create or Edit) Document with correct upload order, recoverable network failure handling, and safe attachment lifecycle
  const saveDocument = useCallback(
    async (
      meta: DocumentMetadata,
      id?: string,
      newFiles?: Array<{ label: string; file: File }>,
      removedAttachmentIds?: string[],
      expectedVersion?: number,
    ) => {
      if (!user || !docMetaKeyRef.current || !rootKeyRef.current) {
        throw new Error("Vault is locked.");
      }

      const gen = unlockGenerationRef.current;

      // ==========================================
      // CASE 1: CREATING A NEW DOCUMENT
      // ==========================================
      if (!id) {
        const docId = crypto.randomUUID();
        const uploadedAttIds: string[] = [];

        // 1. Create document record FIRST so server-side upload endpoint ownership check succeeds
        const initialEncrypted = await encryptDocumentMeta(
          { ...meta, attachments: [] },
          docMetaKeyRef.current,
          docId,
          user.id,
        );

        if (unlockGenerationRef.current !== gen) {
          throw new Error("Vault locked during document creation.");
        }

        let createdDoc: EncryptedDocumentDto;
        try {
          createdDoc = await createVaultDocumentApi({
            id: docId,
            encrypted_data: initialEncrypted.ciphertext,
            iv: initialEncrypted.iv,
          });
        } catch (createErr) {
          // If creation request failed, verify if it was an ambiguous network error
          if (isAmbiguousNetworkError(createErr)) {
            try {
              createdDoc = await getVaultDocumentApi(docId);
            } catch {
              // Could not confirm creation; no attachments were uploaded yet, safe to reject
              throw createErr;
            }
          } else {
            throw createErr;
          }
        }

        const uploadedAttachmentsMeta: DocumentAttachmentMeta[] = [];

        // 2. Upload attachments (if any)
        try {
          if (newFiles && newFiles.length > 0) {
            for (const item of newFiles) {
              if (unlockGenerationRef.current !== gen) {
                throw new Error("Vault locked during attachment upload.");
              }

              const attachmentId = crypto.randomUUID();
              const attKey = await getAttachmentKey(rootKeyRef.current!, attachmentId);
              const fileBytes = await readFileAsArrayBuffer(item.file);

              const { ciphertextBuffer, iv } = await encryptDocumentFile(
                fileBytes,
                attKey,
                docId,
                attachmentId,
                user.id,
              );

              await uploadVaultAttachmentApi(docId, attachmentId, iv, ciphertextBuffer);
              uploadedAttIds.push(attachmentId);

              uploadedAttachmentsMeta.push({
                id: attachmentId,
                label: item.label || item.file.name,
                fileName: item.file.name,
                fileSize: item.file.size,
                mimeType: item.file.type || "application/octet-stream",
                iv,
              });
            }
          }
        } catch (uploadErr) {
          // Attachment upload failed BEFORE manifest finalization was attempted.
          // This is a confirmed failure prior to commit: clean up uploaded files and delete document record
          console.error(
            "[vault] Attachment upload failed during creation, rolling back:",
            uploadErr,
          );
          for (const attId of uploadedAttIds) {
            try {
              await deleteVaultAttachmentApi(attId);
            } catch {
              // Best-effort
            }
          }
          try {
            await deleteVaultDocumentApi(docId);
          } catch {
            // Best-effort
          }
          throw uploadErr;
        }

        // 3. Finalize manifest
        const finalMeta: DocumentMetadata = {
          ...meta,
          attachments: uploadedAttachmentsMeta,
        };

        const finalEncrypted = await encryptDocumentMeta(
          finalMeta,
          docMetaKeyRef.current,
          docId,
          user.id,
        );

        if (unlockGenerationRef.current !== gen) {
          // Vault locked before commit: clean up uncommitted files
          for (const attId of uploadedAttIds) {
            try {
              await deleteVaultAttachmentApi(attId);
            } catch {
              // Best-effort
            }
          }
          try {
            await deleteVaultDocumentApi(docId);
          } catch {
            // Best-effort
          }
          throw new Error("Vault locked during manifest finalization.");
        }

        let updated: EncryptedDocumentDto;
        try {
          updated = await updateVaultDocumentApi(docId, {
            encrypted_data: finalEncrypted.ciphertext,
            iv: finalEncrypted.iv,
            expected_version: createdDoc.version,
          });
        } catch (commitErr) {
          // Check if the commit actually succeeded on the server before response was lost!
          if (isAmbiguousNetworkError(commitErr)) {
            try {
              const serverDoc = await getVaultDocumentApi(docId);
              // Require exact verification of the intended commit (ciphertext and IV):
              if (
                serverDoc.encrypted_data === finalEncrypted.ciphertext &&
                serverDoc.iv === finalEncrypted.iv
              ) {
                // Exact intended commit verified on server despite lost response!
                updated = serverDoc;
              } else {
                // Inconclusive or differing ciphertext/version.
                // NEVER perform destructive rollback! Preserve files and document record safely.
                console.warn(
                  "[vault] Document creation commit unconfirmed or differs. Preserving files without rollback.",
                  { serverDocVersion: serverDoc.version },
                );
                toast.error(
                  "Document creation status is unconfirmed due to network interruption. Your files and record have been safely preserved on the server. Please reload to verify.",
                );
                throw new Error(
                  "NETWORK_AMBIGUOUS_COMMIT: Document creation status could not be verified due to network interruption. Files and record have been safely preserved.",
                );
              }
            } catch (recoveryErr) {
              if (
                recoveryErr instanceof Error &&
                recoveryErr.message.includes("NETWORK_AMBIGUOUS_COMMIT")
              ) {
                throw recoveryErr;
              }
              // Recovery query could NOT reach server (e.g. offline).
              // NEVER perform destructive rollback when outcome is unconfirmed!
              console.warn(
                "[vault] Network lost after document commit attempt. Preserving files without rollback.",
                recoveryErr,
              );
              toast.error(
                "Network interrupted while finalizing document. Your files are preserved safely on the server. Please check your connection and refresh.",
              );
              throw new Error(
                "NETWORK_AMBIGUOUS_COMMIT: Document status could not be verified due to network interruption. Files have been preserved.",
              );
            }
          } else {
            // Confirmed rejection by server (e.g. 409 Conflict, 400 Bad Request)
            for (const attId of uploadedAttIds) {
              try {
                await deleteVaultAttachmentApi(attId);
              } catch {
                // Best-effort
              }
            }
            try {
              await deleteVaultDocumentApi(docId);
            } catch {
              // Best-effort
            }
            throw commitErr;
          }
        }

        if (unlockGenerationRef.current !== gen) return;

        setDocuments((prev) => [
          {
            id: docId,
            version: updated.version,
            createdAt: createdDoc.created_at,
            updatedAt: updated.updated_at,
            data: finalMeta,
            attachments: updated.attachments,
          },
          ...prev,
        ]);
        toast.success("Document saved to keeper.");
        return;
      }

      // ==========================================
      // CASE 2: EDITING AN EXISTING DOCUMENT
      // ==========================================
      const docId = id;

      // 1. Filter out removed attachments for the new manifest, BUT DO NOT DELETE THEM YET!
      // They must remain intact in Hostinger storage until the updated metadata version is committed.
      const activeExistingAttachments = meta.attachments.filter(
        (a) => !removedAttachmentIds?.includes(a.id),
      );

      const newlyUploadedAttIds: string[] = [];
      const updatedAttachments: DocumentAttachmentMeta[] = [...activeExistingAttachments];

      try {
        // 2. Upload any newly staged files
        if (newFiles && newFiles.length > 0) {
          for (const item of newFiles) {
            if (unlockGenerationRef.current !== gen) {
              throw new Error("Vault locked during attachment upload.");
            }

            const attachmentId = crypto.randomUUID();
            const attKey = await getAttachmentKey(rootKeyRef.current, attachmentId);
            const fileBytes = await readFileAsArrayBuffer(item.file);

            const { ciphertextBuffer, iv } = await encryptDocumentFile(
              fileBytes,
              attKey,
              docId,
              attachmentId,
              user.id,
            );

            await uploadVaultAttachmentApi(docId, attachmentId, iv, ciphertextBuffer);
            newlyUploadedAttIds.push(attachmentId);

            updatedAttachments.push({
              id: attachmentId,
              label: item.label || item.file.name,
              fileName: item.file.name,
              fileSize: item.file.size,
              mimeType: item.file.type || "application/octet-stream",
              iv,
            });
          }
        }
      } catch (uploadErr) {
        // Confirmed upload failure BEFORE document metadata commit was attempted.
        // Clean up newly uploaded files only. Existing attachments remain 100% untouched!
        for (const attId of newlyUploadedAttIds) {
          try {
            await deleteVaultAttachmentApi(attId);
          } catch {
            // Best-effort rollback
          }
        }
        throw uploadErr;
      }

      // 3. Encrypt updated document metadata including complete attachment manifest
      const finalMeta: DocumentMetadata = {
        ...meta,
        attachments: updatedAttachments,
      };

      const encrypted = await encryptDocumentMeta(finalMeta, docMetaKeyRef.current, docId, user.id);

      if (unlockGenerationRef.current !== gen) {
        for (const attId of newlyUploadedAttIds) {
          try {
            await deleteVaultAttachmentApi(attId);
          } catch {
            // Best-effort rollback
          }
        }
        throw new Error("Vault locked during document update.");
      }

      // 4. ATOMIC METADATA COMMIT WITH POST-COMMIT RETIREMENT
      // The server verifies expected_version, commits the new metadata, and ONLY THEN retires obsolete attachments!
      const retainedAttachmentIds = updatedAttachments.map((a) => a.id);
      const obsoleteAttachmentIds = removedAttachmentIds || [];
      const currentExpectedVersion = expectedVersion ?? 1;

      let updated: EncryptedDocumentDto;
      try {
        updated = await updateVaultDocumentApi(id, {
          encrypted_data: encrypted.ciphertext,
          iv: encrypted.iv,
          expected_version: currentExpectedVersion,
          retained_attachment_ids: retainedAttachmentIds,
          obsolete_attachment_ids: obsoleteAttachmentIds,
        });
      } catch (commitErr) {
        if (isAmbiguousNetworkError(commitErr)) {
          try {
            const serverDoc = await getVaultDocumentApi(id);
            // Require exact verification of the intended commit (ciphertext and IV):
            if (
              serverDoc.encrypted_data === encrypted.ciphertext &&
              serverDoc.iv === encrypted.iv
            ) {
              // The exact intended commit SUCCEEDED on the server despite the lost HTTP response!
              updated = serverDoc;
            } else {
              // Either another device committed (version > expectedVersion with different ciphertext)
              // or the delayed PATCH is still in-flight on the server.
              // In ALL ambiguous cases, NEVER delete newly uploaded or existing attachments!
              console.warn(
                "[vault] Document update commit outcome ambiguous or modified concurrently. Preserving all files without rollback.",
                { serverDocVersion: serverDoc.version },
              );
              toast.error(
                "Document update status is unconfirmed or was modified concurrently. Your uploaded attachments have been safely preserved. Please reload to inspect the current document state.",
              );
              throw new Error(
                "AMBIGUOUS_OR_CONCURRENT_EDIT: Document status could not be verified or was modified concurrently. Files have been preserved.",
              );
            }
          } catch (recoveryErr) {
            const recMsg = recoveryErr instanceof Error ? recoveryErr.message : "";
            if (recMsg.includes("AMBIGUOUS_OR_CONCURRENT_EDIT")) {
              throw recoveryErr;
            }
            // Recovery query itself could NOT reach server (e.g. offline / DNS failure)
            // CRITICAL: NEVER destroy newlyUploadedAttIds or existing attachments!
            console.warn(
              "[vault] Network lost during document update. Preserving files without rollback.",
              recoveryErr,
            );
            toast.error(
              "Network interrupted while updating document. Your uploaded attachments have been safely preserved. Please check your connection and reload.",
            );
            throw new Error(
              "NETWORK_AMBIGUOUS_COMMIT: Document commit status is unconfirmed due to network interruption. Files have been preserved.",
            );
          }
        } else {
          // Confirmed rejection by server (e.g. 409 Conflict, 400 Bad Request)
          // Do NOT destroy newly uploaded attachments because another device or delayed retry may reference them.
          const errorObj = commitErr as { status?: number; message?: string };
          if (
            errorObj?.status === 409 ||
            errorObj?.message?.includes("Conflict") ||
            errorObj?.message?.includes("409")
          ) {
            toast.error("Conflict: Document was modified by another session. Please reload.");
          }
          throw commitErr;
        }
      }

      if (unlockGenerationRef.current !== gen) return;

      setDocuments((prev) => {
        const exists = prev.some((d) => d.id === id);
        if (exists) {
          return prev.map((d) =>
            d.id === id
              ? {
                  id,
                  version: updated.version,
                  createdAt: d.createdAt,
                  updatedAt: updated.updated_at,
                  data: finalMeta,
                  attachments: updated.attachments,
                }
              : d,
          );
        }
        return [
          {
            id,
            version: updated.version,
            createdAt: updated.created_at,
            updatedAt: updated.updated_at,
            data: finalMeta,
            attachments: updated.attachments,
          },
          ...prev,
        ];
      });
      toast.success("Document updated.");
    },
    [user],
  );

  // Delete Document
  const deleteDocument = useCallback(async (id: string) => {
    await deleteVaultDocumentApi(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    toast.success("Document deleted.");
  }, []);

  // Get CryptoKey for decrypting a file attachment
  const getAttachmentCryptoKey = useCallback(
    async (attachmentId: string): Promise<CryptoKey | null> => {
      if (!rootKeyRef.current) return null;
      return getAttachmentKey(rootKeyRef.current, attachmentId);
    },
    [],
  );

  return (
    <VaultContext.Provider
      value={{
        status,
        vaultMeta,
        timeoutMinutes,
        setTimeoutMinutes,
        secondsUntilLock,
        isWindowBlurred,
        passwords,
        documents,
        isLoadingData,
        setupVault,
        unlockVault: unlockVaultAction,
        lockVault,
        changeMasterPassword,
        savePassword,
        deletePassword,
        saveDocument,
        deleteDocument,
        getAttachmentCryptoKey,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault(): VaultContextType {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error("useVault must be used within a VaultProvider");
  }
  return context;
}
