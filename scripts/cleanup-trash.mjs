// MindDesk 30-Day Recycle Bin Automatic Cleanup Script
// Intended to be run periodically (e.g. daily at midnight) via Hostinger Cron Jobs or Node CLI:
// node scripts/cleanup-trash.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const RETENTION_DAYS = 30;

async function main() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  console.log(`[cleanup-trash] Running auto-deletion cleanup. Cutoff: ${cutoff.toISOString()} (items older than 30 days)`);

  const whereExpired = { deletedAt: { lte: cutoff } };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const habitsRes = await tx.habit.deleteMany({ where: whereExpired });
      const routinesRes = await tx.routine.deleteMany({ where: whereExpired });
      const tasksRes = await tx.task.deleteMany({ where: whereExpired });
      const listsRes = await tx.taskList.deleteMany({ where: whereExpired });
      const pagesRes = await tx.page.deleteMany({ where: whereExpired });
      const projectsRes = await tx.project.deleteMany({ where: whereExpired });
      const eventsRes = await tx.event.deleteMany({ where: whereExpired });
      const mapsRes = await tx.mindMap.deleteMany({ where: { ...whereExpired, isLocked: false } });

      return {
        tasks: tasksRes.count,
        task_lists: listsRes.count,
        pages: pagesRes.count,
        projects: projectsRes.count,
        mind_maps: mapsRes.count,
        events: eventsRes.count,
        habits: habitsRes.count,
        routines: routinesRes.count,
      };
    });

    const total = Object.values(result).reduce((a, b) => a + b, 0);
    console.log(`[cleanup-trash] Success. Permanently removed ${total} expired items:`, JSON.stringify(result));
  } catch (err) {
    console.error("[cleanup-trash] Error during cleanup:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
