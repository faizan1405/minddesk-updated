// MindDesk Note Images — Strictly Read-Only Audit & Inventory Script
// Reports unreferenced storage files and database records for audit and diagnosis.
// GUARANTEE: Never deletes, unlinks, purges, or mutates any data or files.
//
// Usage:
//   node scripts/reconcile-note-images.mjs
//   node scripts/reconcile-note-images.mjs --age-hours 4
//   node scripts/reconcile-note-images.mjs --user-id <uuid>

import { PrismaClient } from "@prisma/client";
import { readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const prisma = new PrismaClient();

function getStorageDirectory() {
  if (process.env.STORAGE_DIR) {
    return resolve(process.env.STORAGE_DIR);
  }
  if (existsSync("/home/u256504187")) {
    return "/home/u256504187/storage/minddesk-uploads";
  }
  return resolve(process.cwd(), "storage/uploads");
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--execute") || args.includes("--force")) {
    console.warn(
      "\n[NOTICE] Automatic deletion is disabled by policy. This script operates exclusively in read-only audit mode.\n",
    );
  }

  const ageArgIdx = args.indexOf("--age-hours");
  const ageHours = ageArgIdx !== -1 && args[ageArgIdx + 1] ? parseFloat(args[ageArgIdx + 1]) : 2;
  const gracePeriodMs = ageHours * 60 * 60 * 1000;

  const userArgIdx = args.indexOf("--user-id");
  const targetUserId = userArgIdx !== -1 && args[userArgIdx + 1] ? args[userArgIdx + 1] : undefined;

  const storageDir = getStorageDirectory();

  console.log("==========================================================");
  console.log("MindDesk Note Image Audit & Inventory (READ-ONLY)");
  console.log("==========================================================");
  console.log(`Mode:            STRICTLY READ-ONLY (Zero Deletion / Zero Data Loss)`);
  console.log(`Storage Dir:     ${storageDir}`);
  console.log(`Grace Period:    ${ageHours} hours (${gracePeriodMs} ms)`);
  if (targetUserId) console.log(`Target User ID:  ${targetUserId}`);
  console.log("==========================================================");

  const now = Date.now();
  const cutoffDate = new Date(now - gracePeriodMs);

  // Phase 1: Audit disk files
  let totalDiskFiles = 0;
  let activeDiskFiles = 0;
  let inGraceDiskFiles = 0;
  const orphanedDiskFiles = [];

  if (existsSync(storageDir)) {
    const files = await readdir(storageDir);
    for (const fileName of files) {
      const match = fileName.match(
        /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(png|jpe?g|webp)$/i,
      );
      if (!match) continue;
      totalDiskFiles++;
      const imageId = match[1];
      const filePath = join(storageDir, fileName);

      try {
        const fileStat = await stat(filePath);
        const ageMs = now - fileStat.mtimeMs;

        const dbRecord = await prisma.noteImage.findUnique({
          where: { id: imageId },
        });

        if (dbRecord) {
          activeDiskFiles++;
        } else if (ageMs < gracePeriodMs) {
          inGraceDiskFiles++;
        } else {
          orphanedDiskFiles.push({ fileName, ageHours: (ageMs / 3600000).toFixed(1) });
        }
      } catch (err) {
        console.error(`[audit] Error inspecting file ${fileName}:`, err);
      }
    }
  }

  // Phase 2: Audit database records
  const whereClause = {
    createdAt: { lte: cutoffDate },
  };
  if (targetUserId) whereClause.userId = targetUserId;

  const dbRecords = await prisma.noteImage.findMany({
    where: whereClause,
    select: { id: true, userId: true, storageKey: true, createdAt: true },
  });

  let totalDbRecords = dbRecords.length;
  let activeDbRecords = 0;
  const orphanedDbRecords = [];

  for (const record of dbRecords) {
    try {
      const referencingPage = await prisma.page.findFirst({
        where: {
          userId: record.userId,
          content: { contains: record.id },
        },
        select: { id: true },
      });

      if (referencingPage) {
        activeDbRecords++;
      } else {
        const ageMs = now - new Date(record.createdAt).getTime();
        orphanedDbRecords.push({
          id: record.id,
          storageKey: record.storageKey,
          ageHours: (ageMs / 3600000).toFixed(1),
        });
      }
    } catch (err) {
      console.error(`[audit] Error checking DB record ${record.id}:`, err);
    }
  }

  console.log("\nDISK AUDIT SUMMARY:");
  console.log(`Total image files on disk:       ${totalDiskFiles}`);
  console.log(`Active (matched in DB):          ${activeDiskFiles}`);
  console.log(`In-flight (within grace period):  ${inGraceDiskFiles}`);
  console.log(`Unmatched disk files (>grace):   ${orphanedDiskFiles.length}`);

  console.log("\nDATABASE AUDIT SUMMARY:");
  console.log(`Total NoteImage records (>age):  ${totalDbRecords}`);
  console.log(`Active (referenced by notes):    ${activeDbRecords}`);
  console.log(`Unreferenced DB records (>age):  ${orphanedDbRecords.length}`);

  console.log("\n==========================================================");
  console.log("AUDIT COMPLETE. No files or database records were modified or deleted.");
  console.log("==========================================================");
}

main()
  .catch((e) => {
    console.error("[audit-note-images] Fatal error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
