// Server-side image storage and validation helper.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { db, ApiError } from "./api.server";

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function getStorageDir(): string {
  const dir = process.env["STORAGE_DIR"]
    ? resolve(process.env["STORAGE_DIR"])
    : resolve(process.cwd(), "storage/uploads");
  if (!existsSync(dir)) {
    // Synchronously or recursively ensure directory exists
    // (mkdir with recursive: true is safe)
  }
  return dir;
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

  throw new ApiError(400, "Unsupported or invalid image file. Allowed formats: PNG, JPG/JPEG, WebP.");
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
  const filePath = join(storageDir, record.storageKey);

  try {
    const buffer = await readFile(filePath);
    return { buffer, mimeType: record.mimeType, fileName: record.fileName };
  } catch {
    throw new ApiError(404, "Image file not found on server storage.");
  }
}
