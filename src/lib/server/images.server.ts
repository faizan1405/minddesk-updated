// Server-side image storage and validation helper.
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, extname, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { db, ApiError } from "./api.server";

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_MULTIPART_OVERHEAD_BYTES = 64 * 1024; // 64 KB overhead for boundaries and form headers

export const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function getStorageDir(): string {
  if (process.env["STORAGE_DIR"]) {
    return resolve(process.env["STORAGE_DIR"]);
  }
  // Hostinger Managed Node.js persistent storage outside ephemeral deployment directories
  if (existsSync("/home/u256504187")) {
    return "/home/u256504187/storage/minddesk-uploads";
  }
  return resolve(process.cwd(), "storage/uploads");
}

export async function ensureStorageDir(): Promise<string> {
  const dir = getStorageDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Validates actual binary file signatures (magic bytes) to prevent disguised/malicious payloads.
 */
export function validateImageSignature(buffer: Buffer): AllowedMimeType {
  if (buffer.length < 12) {
    throw new ApiError(400, "File too small or corrupted image");
  }

  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // JPEG magic bytes: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // WebP magic bytes: "RIFF" .... "WEBP"
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  throw new ApiError(
    400,
    "Unsupported or invalid image file. Allowed formats: PNG, JPG/JPEG, WebP.",
  );
}

export function extensionForMime(mime: AllowedMimeType): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
  }
}

export async function saveImageFile(
  userId: string,
  fileName: string,
  buffer: Buffer,
): Promise<{
  id: string;
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: AllowedMimeType;
}> {
  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new ApiError(400, "Image exceeds maximum allowed size (10 MB).");
  }

  const mimeType = validateImageSignature(buffer);
  const ext = extensionForMime(mimeType);
  const storageDir = await ensureStorageDir();

  const id = randomUUID();
  const storageKey = `${id}.${ext}`;
  const filePath = join(storageDir, storageKey);

  await writeFile(filePath, buffer);

  try {
    const prisma = db();
    const sanitizedName = (fileName || `image.${ext}`).slice(0, 250);

    const record = await prisma.noteImage.create({
      data: {
        id,
        userId,
        fileName: sanitizedName,
        fileSize: buffer.length,
        mimeType,
        storageKey,
      },
    });

    return {
      id: record.id,
      url: `/api/images/${record.id}`,
      fileName: record.fileName,
      fileSize: record.fileSize,
      mimeType: record.mimeType as AllowedMimeType,
    };
  } catch (err) {
    // Prevent an orphaned file on disk when database insertion fails
    try {
      await unlink(filePath);
    } catch {
      // Best-effort cleanup
    }
    throw err;
  }
}

export async function readImageFile(
  userId: string,
  imageId: string,
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const prisma = db();
  const record = await prisma.noteImage.findFirst({
    where: { id: imageId, userId },
  });

  if (!record) {
    throw new ApiError(404, "Image not found or access denied.");
  }

  const storageDir = getStorageDir();
  const filePath = getSafeImagePath(storageDir, record.storageKey);

  try {
    const buffer = await readFile(filePath);
    return { buffer, mimeType: record.mimeType, fileName: record.fileName };
  } catch {
    throw new ApiError(404, "Image file not found on server storage.");
  }
}

/**
 * Safely resolves an image storage key inside the storage directory,
 * preventing directory traversal attacks.
 */
export function getSafeImagePath(storageDir: string, storageKey: string): string {
  if (!storageKey || typeof storageKey !== "string") {
    throw new ApiError(400, "Invalid storage key.");
  }
  // Disallow null bytes or path separators in raw storageKey
  if (/[\0/\\]/.test(storageKey) || storageKey.includes("..")) {
    throw new ApiError(400, "Invalid image storage key: directory traversal attempt.");
  }
  const resolvedDir = resolve(storageDir);
  const resolvedPath = resolve(resolvedDir, storageKey);
  const prefix = resolvedDir.endsWith(sep) ? resolvedDir : resolvedDir + sep;
  if (!resolvedPath.startsWith(prefix)) {
    throw new ApiError(400, "Invalid image storage key: directory traversal detected.");
  }
  return resolvedPath;
}

/**
 * Extracts all note image IDs/UUIDs referenced in a note's content.
 * Supports both JSON blocks and markdown/HTML/text formats.
 */
export function extractImageIdsFromContent(content: unknown): string[] {
  if (!content) return [];
  const imageIds = new Set<string>();

  const checkUrl = (url: unknown) => {
    if (typeof url !== "string") return;
    const match = url.match(/\/api\/images\/([a-zA-Z0-9_-]+)(?:\.[a-zA-Z0-9]+)?/);
    if (match && match[1]) {
      imageIds.add(match[1]);
    }
  };

  if (typeof content === "object" && content !== null) {
    const blocks = (content as { blocks?: unknown[] }).blocks;
    if (Array.isArray(blocks)) {
      for (const b of blocks) {
        if (b && typeof b === "object") {
          const blockObj = b as { type?: unknown; url?: unknown };
          if (blockObj.type === "image" && blockObj.url) {
            checkUrl(blockObj.url);
          }
        }
      }
    }
  }

  // Also scan raw string (or serialized JSON) to ensure no inline references are missed
  const str = typeof content === "string" ? content : JSON.stringify(content);
  if (str) {
    const regex = /\/api\/images\/([a-zA-Z0-9_-]+)(?:\.[a-zA-Z0-9]+)?/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(str)) !== null) {
      if (m[1]) {
        imageIds.add(m[1]);
      }
    }
  }

  return Array.from(imageIds);
}

/**
 * Safely unlinks an array of image storage files from disk, ignoring missing files (ENOENT).
 */
export async function unlinkImageFiles(storageKeys: string[]): Promise<number> {
  const storageDir = getStorageDir();
  let unlinked = 0;
  for (const key of storageKeys) {
    if (!key) continue;
    try {
      const filePath = getSafeImagePath(storageDir, key);
      await unlink(filePath);
      unlinked++;
    } catch (err: unknown) {
      if ((err as { code?: string })?.code !== "ENOENT") {
        console.warn(`[images] Non-critical warning unlinking image ${key}:`, err);
      }
    }
  }
  return unlinked;
}

export interface CleanupPagesImageResult {
  candidateImageIds: string[];
  preservedImageIds: string[];
  deletedImageIds: string[];
  unlinkedKeys: string[];
}

/**
 * Cleans up note images referenced by pages being permanently deleted,
 * BUT ONLY if no surviving note or project page (active or trashed) still references the image.
 */
export async function cleanupNoteImagesForPages(
  userId: string,
  targetPages: Array<{ id: string; content: string }>,
  txClient?: Prisma.TransactionClient | PrismaClient,
): Promise<CleanupPagesImageResult> {
  if (!targetPages || targetPages.length === 0) {
    return { candidateImageIds: [], preservedImageIds: [], deletedImageIds: [], unlinkedKeys: [] };
  }

  // 1. Extract all image IDs across the target pages
  const candidateSet = new Set<string>();
  for (const page of targetPages) {
    const ids = extractImageIdsFromContent(page.content);
    for (const id of ids) candidateSet.add(id);
  }

  const candidateImageIds = Array.from(candidateSet);
  if (candidateImageIds.length === 0) {
    return { candidateImageIds: [], preservedImageIds: [], deletedImageIds: [], unlinkedKeys: [] };
  }

  const prisma = txClient || db();
  const targetPageIds = targetPages.map((p) => p.id);

  // 2. Query surviving pages for this user that contain any candidate ID
  const orFilters = candidateImageIds.map((id) => ({
    content: { contains: id },
  }));

  const survivingPages = await prisma.page.findMany({
    where: {
      userId,
      id: { notIn: targetPageIds },
      OR: orFilters,
    },
    select: { id: true, content: true },
  });

  const preservedSet = new Set<string>();
  for (const sp of survivingPages) {
    const idsInSurviving = extractImageIdsFromContent(sp.content);
    for (const id of idsInSurviving) {
      if (candidateSet.has(id)) {
        preservedSet.add(id);
      }
    }
  }

  const preservedImageIds = Array.from(preservedSet);
  const imagesToDelete = candidateImageIds.filter((id) => !preservedSet.has(id));

  if (imagesToDelete.length === 0) {
    return {
      candidateImageIds,
      preservedImageIds,
      deletedImageIds: [],
      unlinkedKeys: [],
    };
  }

  // 3. Find database records for images to delete (ensuring user ownership)
  const records = await prisma.noteImage.findMany({
    where: {
      userId,
      id: { in: imagesToDelete },
    },
    select: { id: true, storageKey: true },
  });

  if (records.length === 0) {
    return {
      candidateImageIds,
      preservedImageIds,
      deletedImageIds: [],
      unlinkedKeys: [],
    };
  }

  // 4. Delete the NoteImage records in the database
  const recordIds = records.map((r) => r.id);
  const storageKeys = records.map((r) => r.storageKey);

  await prisma.noteImage.deleteMany({
    where: {
      userId,
      id: { in: recordIds },
    },
  });

  // 5. Unlink the physical files on disk
  await unlinkImageFiles(storageKeys);

  return {
    candidateImageIds,
    preservedImageIds,
    deletedImageIds: recordIds,
    unlinkedKeys: storageKeys,
  };
}

/**
 * Removes all NoteImage records and physical files for a user (used during complete workspace wipe).
 */
export async function cleanupAllUserImages(
  userId: string,
  txClient?: Prisma.TransactionClient | PrismaClient,
): Promise<{ deletedCount: number }> {
  const prisma = txClient || db();

  const records = await prisma.noteImage.findMany({
    where: { userId },
    select: { id: true, storageKey: true },
  });

  if (records.length === 0) {
    return { deletedCount: 0 };
  }

  await prisma.noteImage.deleteMany({
    where: { userId },
  });

  await unlinkImageFiles(records.map((r) => r.storageKey));

  return { deletedCount: records.length };
}

export interface ReconcileImageOptions {
  olderThanMs?: number;
  dryRun?: boolean;
  userId?: string;
}

export interface ReconcileImageResult {
  scannedFiles: number;
  unlinkedFiles: number;
  scannedDbRecords: number;
  deletedDbRecords: number;
  dryRun: boolean;
}

/**
 * Safely reconciles orphaned note image files on disk and orphaned database records.
 * 1. Removes files on disk that have no matching DB record (older than olderThanMs).
 * 2. Removes DB records that are not referenced by any surviving page (older than olderThanMs).
 */
export async function reconcileOrphanedNoteImages(
  options?: ReconcileImageOptions | number,
): Promise<ReconcileImageResult> {
  const olderThanMs =
    typeof options === "number" ? options : (options?.olderThanMs ?? 2 * 60 * 60 * 1000);
  const dryRun =
    typeof options === "object" && options.dryRun !== undefined
      ? options.dryRun
      : typeof options === "number"
        ? false
        : false;
  const targetUserId = typeof options === "object" ? options.userId : undefined;

  const { readdir, stat } = await import("node:fs/promises");
  const storageDir = getStorageDir();
  const prisma = db();
  const now = Date.now();
  const cutoffDate = new Date(now - olderThanMs);

  let scannedFiles = 0;
  let unlinkedFiles = 0;
  let scannedDbRecords = 0;
  let deletedDbRecords = 0;

  // Phase 1: Reconcile disk files without DB records
  if (existsSync(storageDir)) {
    const files = await readdir(storageDir);
    for (const fileName of files) {
      // MindDesk note images have format: <uuid>.<ext>
      const match = fileName.match(
        /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(png|jpe?g|webp)$/i,
      );
      if (!match) continue;
      scannedFiles++;
      const imageId = match[1]!;
      const filePath = join(storageDir, fileName);

      try {
        const fileStat = await stat(filePath);
        const ageMs = now - fileStat.mtimeMs;
        if (ageMs < olderThanMs) {
          continue; // In grace period
        }

        const record = await prisma.noteImage.findUnique({
          where: { id: imageId },
        });

        if (!record) {
          if (!dryRun) {
            await unlink(filePath);
          }
          unlinkedFiles++;
        }
      } catch {
        // Best-effort
      }
    }
  }

  // Phase 2: Reconcile DB records not referenced by any page (active or trashed)
  const whereClause: Prisma.NoteImageWhereInput = {
    createdAt: { lte: cutoffDate },
  };
  if (targetUserId) {
    whereClause.userId = targetUserId;
  }

  const dbRecords = await prisma.noteImage.findMany({
    where: whereClause,
    select: { id: true, userId: true, storageKey: true },
  });

  scannedDbRecords = dbRecords.length;

  for (const record of dbRecords) {
    try {
      const referencingPage = await prisma.page.findFirst({
        where: {
          userId: record.userId,
          content: { contains: record.id },
        },
        select: { id: true },
      });

      if (!referencingPage) {
        // Orphaned NoteImage record
        if (!dryRun) {
          await prisma.noteImage.delete({
            where: { id: record.id },
          });
          const filePath = getSafeImagePath(storageDir, record.storageKey);
          try {
            await unlink(filePath);
          } catch {
            // Ignore if missing
          }
        }
        deletedDbRecords++;
      }
    } catch (err) {
      console.warn(`[images] Error checking reference for NoteImage ${record.id}:`, err);
    }
  }

  return {
    scannedFiles,
    unlinkedFiles,
    scannedDbRecords,
    deletedDbRecords,
    dryRun,
  };
}
