// MindDesk Private Vault — Operational Storage Reconciliation Script
// Safe, controlled maintenance utility to report and clean unreferenced abandoned .enc files.
//
// Usage:
//   node scripts/reconcile-vault-storage.mjs              # Defaults to --dry-run (safe report only)
//   node scripts/reconcile-vault-storage.mjs --dry-run    # Explicit dry-run
//   node scripts/reconcile-vault-storage.mjs --execute    # Performs safe unlinking of unreferenced files
//   node scripts/reconcile-vault-storage.mjs --execute --age-hours 4 # Custom grace period

import { PrismaClient } from "@prisma/client";
import { readdir, stat, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const prisma = new PrismaClient();

function getStorageDirectory() {
  if (process.env.VAULT_STORAGE_DIR) {
    return resolve(process.env.VAULT_STORAGE_DIR);
  }
  if (existsSync("/home/u256504187")) {
    return "/home/u256504187/storage/minddesk-vault-documents";
  }
  return resolve(process.cwd(), "storage/vault-documents");
}

async function main() {
  const envVal = process.env.DATA_PRESERVATION_MODE?.trim().toLowerCase();
  const isPreservationMode = envVal !== "false" && envVal !== "disabled" && envVal !== "off";

  const args = process.argv.slice(2);
  const isExecuteRequested = args.includes("--execute") || args.includes("--force");
  // When Data Preservation Mode is active, force dry-run to ensure strictly non-destructive behavior
  const isDryRun = isPreservationMode || !isExecuteRequested || args.includes("--dry-run");

  const ageArgIdx = args.indexOf("--age-hours");
  const ageHours = ageArgIdx !== -1 && args[ageArgIdx + 1] ? parseFloat(args[ageArgIdx + 1]) : 2;
  const gracePeriodMs = ageHours * 60 * 60 * 1000;

  const storageDir = getStorageDirectory();

  console.log("==========================================================");
  console.log("MindDesk Vault Storage Reconciliation");
  console.log("==========================================================");
  console.log(
    `Mode:            ${isDryRun ? "DRY-RUN (Safe Report Only - No files deleted)" : "EXECUTE (Live Cleanup)"}`,
  );
  if (isPreservationMode && isExecuteRequested) {
    console.log(
      "Notice:          Data Preservation Mode is ACTIVE. Live execution is disabled — running in safe report mode.",
    );
  }
  console.log(`Storage Dir:     ${storageDir}`);
  console.log(`Grace Period:    ${ageHours} hours (${gracePeriodMs} ms)`);
  console.log("==========================================================");

  if (!existsSync(storageDir)) {
    console.log(`[reconcile] Directory does not exist: ${storageDir}. Nothing to scan.`);
    process.exit(0);
  }

  const files = await readdir(storageDir);
  const now = Date.now();
  let totalEncFiles = 0;
  let activeFiles = 0;
  let inGracePeriod = 0;
  let candidateFiles = [];
  let cleanedCount = 0;

  for (const fileName of files) {
    if (!fileName.endsWith(".enc")) continue;
    totalEncFiles++;

    const match = fileName.match(
      /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.enc$/i,
    );
    if (!match) {
      console.warn(`[reconcile] Skipping non-conforming file: ${fileName}`);
      continue;
    }
    const attachmentId = match[1];
    const filePath = join(storageDir, fileName);

    try {
      const fileStat = await stat(filePath);
      const ageMs = now - fileStat.mtimeMs;

      // Check if referenced in database
      const dbRecord = await prisma.vaultDocumentAttachment.findUnique({
        where: { id: attachmentId },
      });

      if (dbRecord) {
        activeFiles++;
      } else if (ageMs < gracePeriodMs) {
        inGracePeriod++;
      } else {
        candidateFiles.push({ fileName, filePath, ageHours: (ageMs / 3600000).toFixed(1) });
      }
    } catch (err) {
      console.error(`[reconcile] Error inspecting file ${fileName}:`, err);
    }
  }

  console.log(`Total .enc files scanned:   ${totalEncFiles}`);
  console.log(`Active (referenced in DB):  ${activeFiles}`);
  console.log(`In-flight (grace period):   ${inGracePeriod}`);
  console.log(`Abandoned candidates:      ${candidateFiles.length}`);

  if (candidateFiles.length > 0) {
    console.log("\nCandidate files identified for removal:");
    for (const c of candidateFiles) {
      console.log(`  - ${c.fileName} (Age: ${c.ageHours} hours)`);
    }

    if (!isDryRun && !isPreservationMode) {
      console.log("\nProceeding with live file unlinking...");
      for (const c of candidateFiles) {
        try {
          await unlink(c.filePath);
          cleanedCount++;
          console.log(`  [DELETED] ${c.fileName}`);
        } catch (unlinkErr) {
          console.error(`  [FAILED] ${c.fileName}:`, unlinkErr);
        }
      }
      console.log(`\nCleanup complete: ${cleanedCount} orphaned files removed.`);
    } else {
      console.log("\nDRY-RUN COMPLETE: No files were deleted.");
      if (isPreservationMode) {
        console.log(
          "Data Preservation Mode is active. Storage reconciliation remains strictly non-destructive.",
        );
      } else {
        console.log(
          "To execute actual removal, re-run with: node scripts/reconcile-vault-storage.mjs --execute",
        );
      }
    }
  } else {
    console.log("\nZero abandoned files detected. Storage is clean and healthy.");
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[reconcile] Fatal error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
