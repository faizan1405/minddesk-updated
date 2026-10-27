// MindDesk Note Images — Operational Storage & Database Reconciliation Script
// Safe, controlled maintenance utility to report and clean unreferenced note image files and records.
//
// Usage:
//   node scripts/reconcile-note-images.mjs              # Defaults to --dry-run (safe report only)
//   node scripts/reconcile-note-images.mjs --dry-run    # Explicit dry-run
//   node scripts/reconcile-note-images.mjs --execute    # Performs safe cleanup
//   node scripts/reconcile-note-images.mjs --execute --age-hours 4 # Custom grace period

import { PrismaClient } from "@prisma/client";
import { readdir, stat, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";

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

function getSafeImagePath(storageDir, storageKey) {
  if (!storageKey || typeof storageKey !== "string") return null;
  if (/[\0/\\]/.test(storageKey) || storageKey.includes("..")) return null;
  const resolvedDir = resolve(storageDir);
  const resolvedPath = resolve(resolvedDir, storageKey);
  const prefix = resolvedDir.endsWith(sep) ? resolvedDir : resolvedDir + sep;
  if (!resolvedPath.startsWith(prefix)) return null;
  return resolvedPath;
}

async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes("--execute") || args.includes("--force");
  const isDryRun = !isExecute || args.includes("--dry-run");

  const ageArgIdx = args.indexOf("--age-hours");
  const ageHours = ageArgIdx !== -1 && args[ageArgIdx + 1] ? parseFloat(args[ageArgIdx + 1]) : 2;
  const gracePeriodMs = ageHours * 60 * 60 * 1000;

  const userArgIdx = args.indexOf("--user-id");
  const targetUserId = userArgIdx !== -1 && args[userArgIdx + 1] ? args[userArgIdx + 1] : undefined;

  const storageDir = getStorageDirectory();

  console.log("==========================================================");
  console.log("MindDesk Note Image Reconciliation");
  console.log("==========================================================");
  console.log(
    `Mode:            ${isDryRun ? "DRY-RUN (Safe Report Only - No files deleted)" : "EXECUTE (Live Cleanup)"}`,
  );
  console.log(`Storage Dir:     ${storageDir}`);
  console.log(`Grace Period:    ${ageHours} hours (${gracePeriodMs} ms)`);
  if (targetUserId) console.log(`Target User ID:  ${targetUserId}`);
  console.log("==========================================================");

  const now = Date.now();
  const cutoffDate = new Date(now - gracePeriodMs);

  // Phase 1: Reconcile disk files missing from DB
  let totalDiskFiles = 0;
  let activeDiskFiles = 0;
  let inGraceDiskFiles = 0;
  let orphanedDiskFiles = [];
  let cleanedDiskFiles = 0;

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
          orphanedDiskFiles.push({ fileName, filePath, ageHours: (ageMs / 3600000).toFixed(1) });
          if (!isDryRun) {
            await unlink(filePath);
            cleanedDiskFiles++;
          }
        }
      } catch (err) {
        console.error(`[reconcile] Error inspecting file ${fileName}:`, err);
      }
    }
  }

  // Phase 2: Reconcile DB NoteImage records not referenced by any surviving page
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
  let orphanedDbRecords = [];
  let cleanedDbRecords = 0;

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
        if (!isDryRun) {
          await prisma.noteImage.delete({ where: { id: record.id } });
          const safePath = getSafeImagePath(storageDir, record.storageKey);
          if (safePath) {
            try {
              await unlink(safePath);
            } catch (e) {
              if (e?.code !== "ENOENT")
                console.warn(`[reconcile] Error unlinking ${record.storageKey}:`, e);
            }
          }
          cleanedDbRecords++;
        }
      }
    } catch (err) {
      console.error(`[reconcile] Error checking DB record ${record.id}:`, err);
    }
  }

  console.log("\nDISK RECONCILIATION SUMMARY:");
  console.log(`Total image files on disk:      ${totalDiskFiles}`);
  console.log(`Active (matched in DB):         ${activeDiskFiles}`);
  console.log(`In-flight (within grace period): ${inGraceDiskFiles}`);
  console.log(`Orphaned disk candidates:       ${orphanedDiskFiles.length}`);
  if (!isDryRun) console.log(`Unlinked disk files:            ${cleanedDiskFiles}`);

  console.log("\nDATABASE RECONCILIATION SUMMARY:");
  console.log(`Total NoteImage records (>age): ${totalDbRecords}`);
  console.log(`Active (referenced by a note):  ${activeDbRecords}`);
  console.log(`Orphaned DB candidates:         ${orphanedDbRecords.length}`);
  if (!isDryRun) console.log(`Deleted DB records:             ${cleanedDbRecords}`);

  console.log("\n==========================================================");
  if (isDryRun) {
    console.log("DRY-RUN COMPLETE. No changes were made to storage or DB.");
    console.log("Run with --execute to perform actual cleanup.");
  } else {
    console.log("EXECUTE COMPLETE. Cleaned up orphaned files and records.");
  }
  console.log("==========================================================");
}

main()
  .catch((e) => {
    console.error("[reconcile-note-images] Fatal error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
