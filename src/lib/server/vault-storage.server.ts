// Server-side storage manager for client-encrypted vault document attachments.
// Files stored here are pure AES-256-GCM ciphertexts with zero unencrypted headers or metadata.
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { db, ApiError } from "./api.server";

export const MAX_VAULT_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: unknown): id is string {
  return typeof id === "string" && UUID_REGEX.test(id.trim());
}

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

export function getSafeAttachmentPath(storageDir: string, storageKey: string): string {
  if (!storageKey || typeof storageKey !== "string") {
    throw new ApiError(400, "Invalid storage key: must be a non-empty string.");
  }
  // Disallow any path traversal characters
  if (storageKey.includes("/") || storageKey.includes("\\") || storageKey.includes("..")) {
    throw new ApiError(400, "Path traversal sequence detected in storage key.");
  }

  // Storage filename must strictly be <uuid>.enc
  const match = storageKey.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.enc$/i,
  );
  if (!match) {
    throw new ApiError(400, "Invalid attachment storage key format: must match <uuid>.enc.");
  }

  const resolvedDir = resolve(storageDir);
  const resolvedPath = resolve(resolvedDir, storageKey);
  const prefix = resolvedDir.endsWith(sep) ? resolvedDir : resolvedDir + sep;

  if (!resolvedPath.startsWith(prefix)) {
    throw new ApiError(403, "Storage path traversal detected: directory confinement violation.");
  }

  return resolvedPath;
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
  if (!isValidUuid(documentId)) {
    throw new ApiError(400, "Invalid document ID: must be a valid UUID.");
  }
  if (!isValidUuid(attachmentId)) {
    throw new ApiError(400, "Invalid attachment ID: must be a valid UUID.");
  }

  if (encryptedBuffer.length > MAX_VAULT_ATTACHMENT_BYTES) {
    throw new ApiError(400, "Encrypted attachment exceeds maximum size (25 MB).");
  }

  const storageDir = await ensureVaultStorageDir();
  const storageKey = `${attachmentId}.enc`;
  const filePath = getSafeAttachmentPath(storageDir, storageKey);

  let fileWritten = false;
  try {
    // Exclusive creation: fails with EEXIST if file already exists
    await writeFile(filePath, encryptedBuffer, { flag: "wx" });
    fileWritten = true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "EEXIST") {
      // Check for safe idempotent retry: exact same attachment uploaded previously
      const prisma = db();
      const existing = await prisma.vaultDocumentAttachment.findFirst({
        where: { id: attachmentId, documentId, userId },
      });
      if (existing && existing.encryptedSize === encryptedBuffer.length && existing.iv === iv) {
        return {
          id: existing.id,
          storageKey: existing.storageKey,
          encryptedSize: existing.encryptedSize,
          iv: existing.iv,
        };
      }
      throw new ApiError(409, "Attachment file with this ID already exists on storage.");
    }
    throw err;
  }

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
    // Safe cleanup: ONLY unlink if this specific invocation wrote the file
    if (fileWritten) {
      try {
        await unlink(filePath);
      } catch {
        // Best-effort cleanup
      }
    }
    throw err;
  }
}

export async function readEncryptedAttachmentFile(
  userId: string,
  attachmentId: string,
): Promise<{ buffer: Buffer; iv: string; storageKey: string }> {
  if (!isValidUuid(attachmentId)) {
    throw new ApiError(400, "Invalid attachment ID: must be a valid UUID.");
  }

  const prisma = db();
  const record = await prisma.vaultDocumentAttachment.findFirst({
    where: { id: attachmentId, userId },
  });

  if (!record) {
    throw new ApiError(404, "Attachment not found or access denied.");
  }

  const storageDir = getVaultStorageDir();
  const filePath = getSafeAttachmentPath(storageDir, record.storageKey);

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
  if (!isValidUuid(attachmentId)) {
    throw new ApiError(400, "Invalid attachment ID: must be a valid UUID.");
  }

  const prisma = db();
  const record = await prisma.vaultDocumentAttachment.findFirst({
    where: { id: attachmentId, userId },
  });

  if (!record) {
    throw new ApiError(404, "Attachment not found or access denied.");
  }

  const storageDir = getVaultStorageDir();
  const filePath = getSafeAttachmentPath(storageDir, record.storageKey);

  try {
    await unlink(filePath);
  } catch {
    // Best-effort file removal (e.g. file already unlinked)
  }

  await prisma.vaultDocumentAttachment.delete({
    where: { id: attachmentId },
  });
}

/**
 * Safely reconciles abandoned storage files.
 * Rules:
 * 1. Scans storage directory for .enc files.
 * 2. Compares against vault_document_attachments database records.
 * 3. Only removes .enc files on disk if:
 *    a) No matching database record exists for that attachment ID, AND
 *    b) File was created more than olderThanMs ago (grace period for active in-flight uploads).
 * 4. NEVER deletes an active or valid document attachment!
 */
export async function reconcileAbandonedVaultStorage(
  olderThanMs: number = 2 * 60 * 60 * 1000,
): Promise<{ scannedFiles: number; cleanedFiles: number }> {
  const { readdir, stat } = await import("node:fs/promises");
  const storageDir = getVaultStorageDir();
  if (!existsSync(storageDir)) {
    return { scannedFiles: 0, cleanedFiles: 0 };
  }

  const files = await readdir(storageDir);
  const prisma = db();
  let scannedFiles = 0;
  let cleanedFiles = 0;
  const now = Date.now();

  for (const fileName of files) {
    if (!fileName.endsWith(".enc")) continue;
    scannedFiles++;
    const match = fileName.match(
      /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.enc$/i,
    );
    if (!match) continue;
    const attachmentId = match[1]!;

    const filePath = join(storageDir, fileName);
    try {
      const fileStat = await stat(filePath);
      const ageMs = now - fileStat.mtimeMs;
      if (ageMs < olderThanMs) {
        continue;
      }

      const record = await prisma.vaultDocumentAttachment.findUnique({
        where: { id: attachmentId },
      });

      if (!record) {
        await unlink(filePath);
        cleanedFiles++;
      }
    } catch {
      // Best-effort
    }
  }

  return { scannedFiles, cleanedFiles };
}
