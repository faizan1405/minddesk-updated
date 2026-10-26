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
  createVaultDocumentApi,
  updateVaultDocumentApi,
  deleteVaultDocumentApi,
  uploadVaultAttachmentApi,
  type VaultMetaResponse,
  type EncryptedAttachmentDto,
} from "@/lib/vault-client";
import { useAuth } from "@/hooks/use-auth";

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
  changeMasterPassword: (newPassword: string) => Promise<void>;

  // Password operations
  savePassword: (data: PasswordEntryData, id?: string) => Promise<void>;
  deletePassword: (id: string) => Promise<void>;

  // Document operations
  saveDocument: (
    meta: DocumentMetadata,
    id?: string,
    newFiles?: Array<{ label: string; file: File }>,
  ) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;

  // Key accessor for binary file decryption
  getAttachmentCryptoKey: (attachmentId: string) => Promise<CryptoKey | null>;
}

const VaultContext = createContext<VaultContextType | null>(null);

const DEFAULT_TIMEOUT_MINUTES = 5;

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<VaultStatus>("loading");
  const [vaultMeta, setVaultMeta] = useState<VaultMetaResponse | null>(null);

  // In-memory ONLY references
  const rootKeyRef = useRef<Uint8Array | null>(null);
  const passKeyRef = useRef<CryptoKey | null>(null);
  const docMetaKeyRef = useRef<CryptoKey | null>(null);

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

  // Securely clear memory keys
  const purgeKeys = useCallback(() => {
    if (rootKeyRef.current) {
      rootKeyRef.current.fill(0);
      rootKeyRef.current = null;
    }
    passKeyRef.current = null;
    docMetaKeyRef.current = null;
    setPasswords([]);
    setDocuments([]);
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
        setVaultMeta(meta);
        setStatus(meta.initialized ? "locked" : "uninitialized");
      } catch (err) {
        console.error("[vault] Failed to fetch meta:", err);
        if (!cancelled) setStatus("uninitialized");
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

  // Decrypt all entries and documents upon unlock
  const loadVaultData = useCallback(async (rootKeyBytes: Uint8Array, userId: string) => {
    setIsLoadingData(true);
    try {
      const passKey = await getPasswordKey(rootKeyBytes);
      const docMetaKey = await getDocumentMetaKey(rootKeyBytes);
      passKeyRef.current = passKey;
      docMetaKeyRef.current = docMetaKey;

      const [encEntries, encDocs] = await Promise.all([
        fetchVaultEntries(),
        fetchVaultDocuments(),
      ]);

      // Decrypt passwords
      const decryptedPasswords: DecryptedPasswordItem[] = [];
      for (const entry of encEntries) {
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
          console.warn("[vault] Skipping tampered or undecryptable password entry:", entry.id, err);
        }
      }

      // Decrypt documents
      const decryptedDocs: DecryptedDocumentItem[] = [];
      for (const doc of encDocs) {
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

      setPasswords(decryptedPasswords);
      setDocuments(decryptedDocs);
    } finally {
      setIsLoadingData(false);
    }
  }, []);

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

      setVaultMeta(meta);
      rootKeyRef.current = keys.rootKeyBytes;

      const passKey = await getPasswordKey(keys.rootKeyBytes);
      const docMetaKey = await getDocumentMetaKey(keys.rootKeyBytes);
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
      if (!user || !vaultMeta || !vaultMeta.salt || !vaultMeta.wrapped_key || !vaultMeta.wrapped_key_iv) {
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

        rootKeyRef.current = rootKeyBytes;
        lastActivityRef.current = Date.now();
        setSecondsUntilLock(timeoutMinutes * 60);
        setStatus("unlocked");

        await loadVaultData(rootKeyBytes, user.id);
        toast.success("Vault unlocked.");
        return true;
      } catch {
        toast.error("Incorrect master password. Please try again.");
        return false;
      }
    },
    [user, vaultMeta, timeoutMinutes, loadVaultData],
  );

  // Change master password
  const changeMasterPassword = useCallback(
    async (newPassword: string) => {
      if (!rootKeyRef.current || !vaultMeta) {
        throw new Error("Vault must be unlocked to change master password.");
      }

      const rewrapped = await rewrapVaultKeys(rootKeyRef.current, newPassword, {
        iterations: vaultMeta.iterations,
        memoryCost: vaultMeta.memory_cost,
        parallelism: vaultMeta.parallelism,
      });

      const res = await changeVaultPasswordApi({
        salt: rewrapped.saltHex,
        wrapped_key: rewrapped.wrappedKey,
        wrapped_key_iv: rewrapped.wrappedKeyIv,
      });

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
    },
    [vaultMeta],
  );

  // Save (Create or Edit) Password Entry
  const savePassword = useCallback(
    async (data: PasswordEntryData, id?: string) => {
      if (!user || !passKeyRef.current) throw new Error("Vault is locked.");

      const entryId = id || crypto.randomUUID();
      const encrypted = await encryptPasswordEntry(data, passKeyRef.current, entryId, user.id);

      if (id) {
        const updated = await updateVaultEntryApi(id, {
          encrypted_data: encrypted.ciphertext,
          iv: encrypted.iv,
        });
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
      } else {
        const created = await createVaultEntryApi({
          id: entryId,
          encrypted_data: encrypted.ciphertext,
          iv: encrypted.iv,
        });
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

  // Save (Create or Edit) Document
  const saveDocument = useCallback(
    async (
      meta: DocumentMetadata,
      id?: string,
      newFiles?: Array<{ label: string; file: File }>,
    ) => {
      if (!user || !docMetaKeyRef.current || !rootKeyRef.current) {
        throw new Error("Vault is locked.");
      }

      const docId = id || crypto.randomUUID();
      const updatedMeta: DocumentMetadata = {
        ...meta,
        attachments: [...meta.attachments],
      };

      // 1. If there are new files to attach, encrypt and upload each one
      if (newFiles && newFiles.length > 0) {
        for (const item of newFiles) {
          const attachmentId = crypto.randomUUID();
          const attKey = await getAttachmentKey(rootKeyRef.current, attachmentId);
          const fileBytes = await item.file.arrayBuffer();

          const { ciphertextBuffer, iv } = await encryptDocumentFile(
            fileBytes,
            attKey,
            docId,
            attachmentId,
            user.id,
          );

          // Upload encrypted blob to server storage
          await uploadVaultAttachmentApi(docId, attachmentId, iv, ciphertextBuffer);

          const attachmentMeta: DocumentAttachmentMeta = {
            id: attachmentId,
            label: item.label || item.file.name,
            fileName: item.file.name,
            fileSize: item.file.size,
            mimeType: item.file.type || "application/octet-stream",
            iv,
          };
          updatedMeta.attachments.push(attachmentMeta);
        }
      }

      // 2. Encrypt document metadata including updated attachment manifest
      const encrypted = await encryptDocumentMeta(
        updatedMeta,
        docMetaKeyRef.current,
        docId,
        user.id,
      );

      if (id) {
        const updated = await updateVaultDocumentApi(id, {
          encrypted_data: encrypted.ciphertext,
          iv: encrypted.iv,
        });
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === id
              ? {
                  id,
                  version: updated.version,
                  createdAt: d.createdAt,
                  updatedAt: updated.updated_at,
                  data: updatedMeta,
                  attachments: updated.attachments,
                }
              : d,
          ),
        );
        toast.success("Document updated.");
      } else {
        const created = await createVaultDocumentApi({
          id: docId,
          encrypted_data: encrypted.ciphertext,
          iv: encrypted.iv,
        });
        setDocuments((prev) => [
          {
            id: created.id,
            version: created.version,
            createdAt: created.created_at,
            updatedAt: created.updated_at,
            data: updatedMeta,
            attachments: created.attachments,
          },
          ...prev,
        ]);
        toast.success("Document saved to keeper.");
      }
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
