// Server-side storage manager for client-encrypted vault document attachments.
// Files stored here are pure AES-256-GCM ciphertexts with zero unencrypted headers or metadata.
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { db, ApiError } from "./api.server";

export const MAX_VAULT_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB

export function getVaultStorageDir(): string {
  if (process.env["VAULT_STORAGE_DIR"]) {
    return resolve(process.env["VAULT_STORAGE_DIR"]);
  }
  // Hostinger Managed Node.js persistent storage outside ephemeral deployment directories
  if (existsSync("/home/u256504187")) {
    return "/home/u256504187/storage/minddesk-vault-documents";
  }
  return resolve(process.cwd(), "storage/vault-documents");
}

export async function ensureVaultStorageDir(): Promise<string> {
  const dir = getVaultStorageDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function saveEncryptedAttachmentFile(
  userId: string,
  documentId: string,
  attachmentId: string,
  encryptedBuffer: Buffer,
  iv: string,
): Promise<{
  id: string;
  storageKey: string;
  encryptedSize: number;
  iv: string;
}> {
  if (encryptedBuffer.length > MAX_VAULT_ATTACHMENT_BYTES) {
    throw new ApiError(400, "Encrypted attachment exceeds maximum size (25 MB).");
  }

  const storageDir = await ensureVaultStorageDir();
  const storageKey = `${attachmentId}.enc`;
  const filePath = join(storageDir, storageKey);

  await writeFile(filePath, encryptedBuffer);

  try {
    const prisma = db();
    const record = await prisma.vaultDocumentAttachment.create({
      data: {
        id: attachmentId,
        documentId,
        userId,
        storageKey,
        encryptedSize: encryptedBuffer.length,
        iv,
      },
    });

    return {
      id: record.id,
      storageKey: record.storageKey,
      encryptedSize: record.encryptedSize,
      iv: record.iv,
    };
  } catch (err) {
    try {
      await unlink(filePath);
    } catch {
      // Best-effort cleanup on failure
    }
    throw err;
  }
}

export async function readEncryptedAttachmentFile(
  userId: string,
  attachmentId: string,
): Promise<{ buffer: Buffer; iv: string; storageKey: string }> {
  const prisma = db();
  const record = await prisma.vaultDocumentAttachment.findFirst({
    where: { id: attachmentId, userId },
  });

  if (!record) {
    throw new ApiError(404, "Attachment not found or access denied.");
  }

  const storageDir = getVaultStorageDir();
  const filePath = join(storageDir, record.storageKey);

  try {
    const buffer = await readFile(filePath);
    return { buffer, iv: record.iv, storageKey: record.storageKey };
  } catch {
    throw new ApiError(404, "Encrypted attachment file missing on server disk.");
  }
}

export async function deleteEncryptedAttachmentFile(
  userId: string,
  attachmentId: string,
): Promise<void> {
  const prisma = db();
  const record = await prisma.vaultDocumentAttachment.findFirst({
    where: { id: attachmentId, userId },
  });

  if (!record) {
    throw new ApiError(404, "Attachment not found or access denied.");
  }

  const storageDir = getVaultStorageDir();
  const filePath = join(storageDir, record.storageKey);

  try {
    await unlink(filePath);
  } catch {
    // Best-effort file removal
  }

  await prisma.vaultDocumentAttachment.delete({
    where: { id: attachmentId },
  });
}
