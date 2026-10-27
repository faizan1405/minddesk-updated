// MindDesk 30-Day Recycle Bin Automatic Cleanup Script
// Intended to be run periodically (e.g. daily at midnight) via Hostinger Cron Jobs or Node CLI:
// node scripts/cleanup-trash.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const RETENTION_DAYS = 30;

async function main() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  console.log(
    `[cleanup-trash] Running auto-deletion cleanup. Cutoff: ${cutoff.toISOString()} (items older than 30 days)`,
  );

  const whereExpired = { deletedAt: { lte: cutoff } };

  try {
    const result = await prisma.$transaction(async (tx) => {
      // -----------------------------------------------------------------------
      // Phase 1: Reparent and preserve active/restored child records BEFORE
      // permanently deleting their expired parents.
      // -----------------------------------------------------------------------

      // 1. Pages (subpages): Protect active or non-expired child pages of expired parent pages
      const expiredPages = await tx.page.findMany({
        where: whereExpired,
        select: { id: true },
      });
      const expiredPageIds = expiredPages.map((p) => p.id);

      if (expiredPageIds.length > 0) {
        await tx.page.updateMany({
          where: {
            parentId: { in: expiredPageIds },
            OR: [{ deletedAt: null }, { deletedAt: { gt: cutoff } }],
          },
          data: { parentId: null },
        });
      }

      // 2. Projects: Protect active or non-expired notes inside expired projects
      const expiredProjects = await tx.project.findMany({
        where: whereExpired,
        select: { id: true },
      });
      const expiredProjectIds = expiredProjects.map((p) => p.id);

      if (expiredProjectIds.length > 0) {
        await tx.page.updateMany({
          where: {
            projectId: { in: expiredProjectIds },
            OR: [{ deletedAt: null }, { deletedAt: { gt: cutoff } }],
          },
          data: { projectId: null },
        });
      }

      // 3. Tasks (subtasks): Protect active or non-expired subtasks of expired parent tasks
      const expiredTasks = await tx.task.findMany({
        where: whereExpired,
        select: { id: true },
      });
      const expiredTaskIds = expiredTasks.map((t) => t.id);

      if (expiredTaskIds.length > 0) {
        await tx.task.updateMany({
          where: {
            parentId: { in: expiredTaskIds },
            OR: [{ deletedAt: null }, { deletedAt: { gt: cutoff } }],
          },
          data: { parentId: null },
        });
      }

      // 4. Task Lists: Protect active or non-expired tasks inside expired task lists
      const expiredLists = await tx.taskList.findMany({
        where: whereExpired,
        select: { id: true, userId: true },
      });

      if (expiredLists.length > 0) {
        const expiredListIds = expiredLists.map((l) => l.id);

        const tasksToProtect = await tx.task.findMany({
          where: {
            listId: { in: expiredListIds },
            OR: [{ deletedAt: null }, { deletedAt: { gt: cutoff } }],
          },
          select: { id: true, userId: true },
        });

        if (tasksToProtect.length > 0) {
          const userTasks = new Map();
          for (const t of tasksToProtect) {
            const ids = userTasks.get(t.userId) || [];
            ids.push(t.id);
            userTasks.set(t.userId, ids);
          }

          for (const [uid, taskIds] of userTasks.entries()) {
            let fallbackList = await tx.taskList.findFirst({
              where: { userId: uid, deletedAt: null },
              orderBy: { position: "asc" },
            });
            if (!fallbackList) {
              fallbackList = await tx.taskList.create({
                data: { userId: uid, title: "My Tasks", position: 1 },
              });
            }
            await tx.task.updateMany({
              where: { id: { in: taskIds } },
              data: { listId: fallbackList.id },
            });
          }
        }
      }

      // -----------------------------------------------------------------------
      // Phase 2: Permanently delete expired records
      // -----------------------------------------------------------------------
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
    console.log(
      `[cleanup-trash] Success. Permanently removed ${total} expired items:`,
      JSON.stringify(result),
    );
  } catch (err) {
    console.error("[cleanup-trash] Error during cleanup:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
