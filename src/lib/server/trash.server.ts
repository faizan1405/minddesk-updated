import { db, ApiError } from "@/lib/server/api.server";

export type TrashItemType =
  "note" | "task" | "task_list" | "project" | "mind_map" | "event" | "habit" | "routine";

export type TrashFilter = "all" | "note" | "task" | "project" | "mind_map" | "calendar" | "habit";

export interface TrashItem {
  id: string;
  type: TrashItemType;
  title: string;
  deleted_at: string;
  days_remaining: number;
  details?: string | undefined;
  parent_id?: string | null | undefined;
  parent_title?: string | null | undefined;
  is_locked?: boolean | undefined;
}

export const RETENTION_DAYS = 30;

export function calculateDaysRemaining(deletedAt: Date, now: Date = new Date()): number {
  const elapsedMs = now.getTime() - deletedAt.getTime();
  const totalMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const remainingMs = totalMs - elapsedMs;
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}

export function getExpirationCutoff(days: number = RETENTION_DAYS, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Lists all deleted items for the given user, filtered and searched.
 */
export async function listTrash(
  userId: string,
  filter: TrashFilter = "all",
  search?: string,
  now: Date = new Date(),
): Promise<{ items: TrashItem[]; counts: Record<TrashFilter, number> }> {
  const prisma = db();

  const [taskLists, tasks, projects, pages, events, mindMaps, routines, habits] = await Promise.all(
    [
      prisma.taskList.findMany({
        where: { userId, deletedAt: { not: null } },
        include: { tasks: { select: { id: true } } },
        orderBy: { deletedAt: "desc" },
      }),
      prisma.task.findMany({
        where: { userId, deletedAt: { not: null } },
        include: {
          list: { select: { title: true } },
          parent: { select: { title: true } },
          subtasks: { select: { id: true } },
        },
        orderBy: { deletedAt: "desc" },
      }),
      prisma.project.findMany({
        where: { userId, deletedAt: { not: null } },
        include: { pages: { select: { id: true } } },
        orderBy: { deletedAt: "desc" },
      }),
      prisma.page.findMany({
        where: { userId, deletedAt: { not: null } },
        include: { project: { select: { title: true } }, parent: { select: { title: true } } },
        orderBy: { deletedAt: "desc" },
      }),
      prisma.event.findMany({
        where: { userId, deletedAt: { not: null } },
        orderBy: { deletedAt: "desc" },
      }),
      prisma.mindMap.findMany({
        where: { userId, deletedAt: { not: null } },
        select: { id: true, title: true, deletedAt: true, isLocked: true, nodeCount: true },
        orderBy: { deletedAt: "desc" },
      }),
      prisma.routine.findMany({
        where: { userId, deletedAt: { not: null } },
        include: { habits: { select: { id: true } } },
        orderBy: { deletedAt: "desc" },
      }),
      prisma.habit.findMany({
        where: { userId, deletedAt: { not: null } },
        include: { routine: { select: { title: true } } },
        orderBy: { deletedAt: "desc" },
      }),
    ],
  );

  const allItems: TrashItem[] = [];

  for (const l of taskLists) {
    if (!l.deletedAt) continue;
    const taskCount = l.tasks.length;
    allItems.push({
      id: l.id,
      type: "task_list",
      title: l.title || "Untitled List",
      deleted_at: l.deletedAt.toISOString(),
      days_remaining: calculateDaysRemaining(l.deletedAt, now),
      details: taskCount === 1 ? "1 task" : `${taskCount} tasks`,
    });
  }

  for (const t of tasks) {
    if (!t.deletedAt) continue;
    const subCount = t.subtasks.length;
    let details = t.list?.title ? `In list: ${t.list.title}` : undefined;
    if (t.parent?.title) {
      details = `Subtask of: ${t.parent.title}`;
    } else if (subCount > 0) {
      details = `${subCount === 1 ? "1 subtask" : `${subCount} subtasks`}${details ? ` • ${details}` : ""}`;
    }
    allItems.push({
      id: t.id,
      type: "task",
      title: t.title || "Untitled Task",
      deleted_at: t.deletedAt.toISOString(),
      days_remaining: calculateDaysRemaining(t.deletedAt, now),
      details,
      parent_id: t.parentId ?? t.listId,
      parent_title: t.parent?.title ?? t.list?.title,
    });
  }

  for (const p of projects) {
    if (!p.deletedAt) continue;
    const pageCount = p.pages.length;
    allItems.push({
      id: p.id,
      type: "project",
      title: p.title || "Untitled Project",
      deleted_at: p.deletedAt.toISOString(),
      days_remaining: calculateDaysRemaining(p.deletedAt, now),
      details: pageCount === 1 ? "1 page" : `${pageCount} pages`,
    });
  }

  for (const pg of pages) {
    if (!pg.deletedAt) continue;
    let details = pg.project?.title ? `In project: ${pg.project.title}` : "Personal note";
    if (pg.parent?.title) {
      details = `Subpage of: ${pg.parent.title}`;
    }
    allItems.push({
      id: pg.id,
      type: "note",
      title: pg.title || "Untitled Note",
      deleted_at: pg.deletedAt.toISOString(),
      days_remaining: calculateDaysRemaining(pg.deletedAt, now),
      details,
      parent_id: pg.parentId ?? pg.projectId,
      parent_title: pg.parent?.title ?? pg.project?.title,
    });
  }

  for (const e of events) {
    if (!e.deletedAt) continue;
    const dStr = e.startAt.toISOString().slice(0, 10);
    allItems.push({
      id: e.id,
      type: "event",
      title: e.title || "Untitled Event",
      deleted_at: e.deletedAt.toISOString(),
      days_remaining: calculateDaysRemaining(e.deletedAt, now),
      details: e.allDay ? `All-day event on ${dStr}` : `Event on ${dStr}`,
    });
  }

  for (const m of mindMaps) {
    if (!m.deletedAt) continue;
    allItems.push({
      id: m.id,
      type: "mind_map",
      title: m.title || "Untitled Mind Map",
      deleted_at: m.deletedAt.toISOString(),
      days_remaining: calculateDaysRemaining(m.deletedAt, now),
      details: `${m.nodeCount} ${m.nodeCount === 1 ? "node" : "nodes"}${m.isLocked ? " • Locked" : ""}`,
      is_locked: m.isLocked,
    });
  }

  for (const r of routines) {
    if (!r.deletedAt) continue;
    const habitCount = r.habits.length;
    allItems.push({
      id: r.id,
      type: "routine",
      title: r.title || "Untitled Routine",
      deleted_at: r.deletedAt.toISOString(),
      days_remaining: calculateDaysRemaining(r.deletedAt, now),
      details: habitCount === 1 ? "1 habit" : `${habitCount} habits`,
    });
  }

  for (const h of habits) {
    if (!h.deletedAt) continue;
    allItems.push({
      id: h.id,
      type: "habit",
      title: h.title || "Untitled Habit",
      deleted_at: h.deletedAt.toISOString(),
      days_remaining: calculateDaysRemaining(h.deletedAt, now),
      details: h.routine?.title ? `In routine: ${h.routine.title}` : "Standalone habit",
      parent_id: h.routineId,
      parent_title: h.routine?.title,
    });
  }

  // Sort all items newest deleted first
  allItems.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());

  // Count items per filter category
  const counts: Record<TrashFilter, number> = {
    all: allItems.length,
    note: allItems.filter((i) => i.type === "note").length,
    task: allItems.filter((i) => i.type === "task" || i.type === "task_list").length,
    project: allItems.filter((i) => i.type === "project").length,
    mind_map: allItems.filter((i) => i.type === "mind_map").length,
    calendar: allItems.filter((i) => i.type === "event").length,
    habit: allItems.filter((i) => i.type === "habit" || i.type === "routine").length,
  };

  // Apply filter
  let filtered = allItems;
  if (filter === "note") {
    filtered = allItems.filter((i) => i.type === "note");
  } else if (filter === "task") {
    filtered = allItems.filter((i) => i.type === "task" || i.type === "task_list");
  } else if (filter === "project") {
    filtered = allItems.filter((i) => i.type === "project");
  } else if (filter === "mind_map") {
    filtered = allItems.filter((i) => i.type === "mind_map");
  } else if (filter === "calendar") {
    filtered = allItems.filter((i) => i.type === "event");
  } else if (filter === "habit") {
    filtered = allItems.filter((i) => i.type === "habit" || i.type === "routine");
  }

  // Apply search query if present
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(
      (i) =>
        i.title.toLowerCase().includes(q) || (i.details && i.details.toLowerCase().includes(q)),
    );
  }

  return { items: filtered, counts };
}

/**
 * Restores a single trashed item and its related child items safely.
 */
export async function restoreItem(
  userId: string,
  type: TrashItemType,
  id: string,
): Promise<{ success: boolean; id: string; type: TrashItemType }> {
  const prisma = db();

  switch (type) {
    case "task_list": {
      const list = await prisma.taskList.findFirst({
        where: { id, userId, deletedAt: { not: null } },
      });
      if (!list) throw new ApiError(404, "Task list not found in Recycle Bin");

      await prisma.$transaction(async (tx) => {
        await tx.taskList.update({ where: { id: list.id }, data: { deletedAt: null } });
        await tx.task.updateMany({
          where: { listId: list.id, userId, deletedAt: { not: null } },
          data: { deletedAt: null },
        });
      });
      return { success: true, id, type };
    }

    case "task": {
      const task = await prisma.task.findFirst({
        where: { id, userId, deletedAt: { not: null } },
      });
      if (!task) throw new ApiError(404, "Task not found in Recycle Bin");

      await prisma.$transaction(async (tx) => {
        let targetListId = task.listId;
        const list = await tx.taskList.findFirst({ where: { id: task.listId, userId } });
        if (!list) {
          // Parent list missing: recover to first active list or create a default list
          let fallback = await tx.taskList.findFirst({
            where: { userId, deletedAt: null },
            orderBy: { position: "asc" },
          });
          if (!fallback) {
            fallback = await tx.taskList.create({
              data: { userId, title: "My Tasks", position: 1 },
            });
          }
          targetListId = fallback.id;
        } else if (list.deletedAt !== null) {
          // Parent list is in trash -> restore parent list too
          await tx.taskList.update({ where: { id: list.id }, data: { deletedAt: null } });
        }

        let targetParentId = task.parentId;
        if (task.parentId) {
          const parentTask = await tx.task.findFirst({ where: { id: task.parentId, userId } });
          if (!parentTask) {
            targetParentId = null; // Parent task was permanently removed -> top-level task
          } else if (parentTask.deletedAt !== null) {
            await tx.task.update({ where: { id: parentTask.id }, data: { deletedAt: null } });
          }
        }

        await tx.task.update({
          where: { id: task.id },
          data: { deletedAt: null, listId: targetListId, parentId: targetParentId },
        });

        // Also restore its subtasks if any were deleted
        await tx.task.updateMany({
          where: { parentId: task.id, userId, deletedAt: { not: null } },
          data: { deletedAt: null, listId: targetListId },
        });
      });
      return { success: true, id, type };
    }

    case "project": {
      const project = await prisma.project.findFirst({
        where: { id, userId, deletedAt: { not: null } },
      });
      if (!project) throw new ApiError(404, "Project not found in Recycle Bin");

      await prisma.$transaction(async (tx) => {
        await tx.project.update({ where: { id: project.id }, data: { deletedAt: null } });
        await tx.page.updateMany({
          where: { projectId: project.id, userId, deletedAt: { not: null } },
          data: { deletedAt: null },
        });
      });
      return { success: true, id, type };
    }

    case "note": {
      const page = await prisma.page.findFirst({ where: { id, userId, deletedAt: { not: null } } });
      if (!page) throw new ApiError(404, "Note not found in Recycle Bin");

      await prisma.$transaction(async (tx) => {
        let targetProjectId = page.projectId;
        if (page.projectId) {
          const proj = await tx.project.findFirst({ where: { id: page.projectId, userId } });
          if (!proj) {
            targetProjectId = null; // Project missing -> turn into standalone note
          } else if (proj.deletedAt !== null) {
            await tx.project.update({ where: { id: proj.id }, data: { deletedAt: null } });
          }
        }

        let targetParentId = page.parentId;
        if (page.parentId) {
          const parentPage = await tx.page.findFirst({ where: { id: page.parentId, userId } });
          if (!parentPage) {
            targetParentId = null; // Parent page missing -> top level
          } else if (parentPage.deletedAt !== null) {
            await tx.page.update({ where: { id: parentPage.id }, data: { deletedAt: null } });
          }
        }

        await tx.page.update({
          where: { id: page.id },
          data: { deletedAt: null, projectId: targetProjectId, parentId: targetParentId },
        });

        // Restore any descendant pages
        const toRestore: string[] = [];
        let queue = [page.id];
        while (queue.length > 0) {
          const children = await tx.page.findMany({
            where: { parentId: { in: queue }, userId, deletedAt: { not: null } },
            select: { id: true },
          });
          const childIds = children.map((c) => c.id);
          toRestore.push(...childIds);
          queue = childIds;
        }
        if (toRestore.length > 0) {
          await tx.page.updateMany({
            where: { id: { in: toRestore }, userId },
            data: { deletedAt: null, projectId: targetProjectId },
          });
        }
      });
      return { success: true, id, type };
    }

    case "mind_map": {
      const map = await prisma.mindMap.findFirst({
        where: { id, userId, deletedAt: { not: null } },
      });
      if (!map) throw new ApiError(404, "Mind map not found in Recycle Bin");

      await prisma.mindMap.update({ where: { id: map.id }, data: { deletedAt: null } });
      return { success: true, id, type };
    }

    case "event": {
      const ev = await prisma.event.findFirst({ where: { id, userId, deletedAt: { not: null } } });
      if (!ev) throw new ApiError(404, "Event not found in Recycle Bin");

      await prisma.event.update({ where: { id: ev.id }, data: { deletedAt: null } });
      return { success: true, id, type };
    }

    case "routine": {
      const routine = await prisma.routine.findFirst({
        where: { id, userId, deletedAt: { not: null } },
      });
      if (!routine) throw new ApiError(404, "Routine not found in Recycle Bin");

      await prisma.$transaction(async (tx) => {
        await tx.routine.update({ where: { id: routine.id }, data: { deletedAt: null } });
        await tx.habit.updateMany({
          where: { routineId: routine.id, userId, deletedAt: { not: null } },
          data: { deletedAt: null },
        });
      });
      return { success: true, id, type };
    }

    case "habit": {
      const habit = await prisma.habit.findFirst({
        where: { id, userId, deletedAt: { not: null } },
      });
      if (!habit) throw new ApiError(404, "Habit not found in Recycle Bin");

      await prisma.$transaction(async (tx) => {
        let targetRoutineId = habit.routineId;
        if (habit.routineId) {
          const routine = await tx.routine.findFirst({ where: { id: habit.routineId, userId } });
          if (!routine) {
            targetRoutineId = null; // Routine missing -> standalone habit
          } else if (routine.deletedAt !== null) {
            await tx.routine.update({ where: { id: routine.id }, data: { deletedAt: null } });
          }
        }

        await tx.habit.update({
          where: { id: habit.id },
          data: { deletedAt: null, routineId: targetRoutineId },
        });
      });
      return { success: true, id, type };
    }

    default:
      throw new ApiError(400, "Unknown item type");
  }
}

/**
 * Restores all items in the Recycle Bin (or matching a filter category) for the user.
 */
export async function restoreAll(
  userId: string,
  filter: TrashFilter = "all",
): Promise<{ restoredCount: number }> {
  const { items } = await listTrash(userId, filter);
  let count = 0;

  for (const item of items) {
    try {
      await restoreItem(userId, item.type, item.id);
      count++;
    } catch (e) {
      console.error(`[trash] Failed restoring ${item.type} ${item.id}:`, e);
    }
  }

  return { restoredCount: count };
}

/**
 * Permanently removes a single item from the database.
 * Respects Mind Map Lock protection.
 */
export async function permanentlyDeleteItem(
  userId: string,
  type: TrashItemType,
  id: string,
): Promise<{ success: boolean; id: string }> {
  const prisma = db();

  return prisma.$transaction(async (tx) => {
    switch (type) {
      case "task_list": {
        // 1. Verify parent task list exists, belongs to user, and is trashed (deletedAt != null)
        const list = await tx.taskList.findFirst({
          where: { id, userId, deletedAt: { not: null } },
        });
        if (!list) throw new ApiError(404, "Item not found in Recycle Bin");

        // 2. Protect all surviving child tasks (both active and recently trashed)
        // by reparenting them to an active fallback list so MySQL foreign-key cascade does not delete them
        const survivingTasks = await tx.task.findMany({
          where: { listId: id, userId },
          select: { id: true },
        });

        if (survivingTasks.length > 0) {
          let fallback = await tx.taskList.findFirst({
            where: { userId, deletedAt: null },
            orderBy: { position: "asc" },
          });
          if (!fallback) {
            fallback = await tx.taskList.create({
              data: { userId, title: "My Tasks", position: 1 },
            });
          }
          await tx.task.updateMany({
            where: { listId: id, userId },
            data: { listId: fallback.id },
          });
        }

        // 3. Permanently delete the task list
        await tx.taskList.delete({ where: { id: list.id } });
        return { success: true, id };
      }

      case "task": {
        // 1. Verify parent task exists, belongs to user, and is trashed
        const task = await tx.task.findFirst({
          where: { id, userId, deletedAt: { not: null } },
        });
        if (!task) throw new ApiError(404, "Item not found in Recycle Bin");

        // 2. Unparent all surviving subtasks (both active and recently trashed)
        // so MySQL foreign key cascade does not delete them
        await tx.task.updateMany({
          where: { parentId: id, userId },
          data: { parentId: null },
        });

        // 3. Permanently delete the task
        await tx.task.delete({ where: { id: task.id } });
        return { success: true, id };
      }

      case "project": {
        // 1. Verify project exists, belongs to user, and is trashed
        const project = await tx.project.findFirst({
          where: { id, userId, deletedAt: { not: null } },
        });
        if (!project) throw new ApiError(404, "Item not found in Recycle Bin");

        // 2. Unlink all surviving project pages (both active and recently trashed)
        // to standalone notes so MySQL foreign key cascade does not delete them
        await tx.page.updateMany({
          where: { projectId: id, userId },
          data: { projectId: null },
        });

        // 3. Permanently delete the project
        await tx.project.delete({ where: { id: project.id } });
        return { success: true, id };
      }

      case "note": {
        // 1. Verify note exists, belongs to user, and is trashed
        const page = await tx.page.findFirst({
          where: { id, userId, deletedAt: { not: null } },
        });
        if (!page) throw new ApiError(404, "Item not found in Recycle Bin");

        // 2. Unparent all surviving subpages (both active and recently trashed)
        // so MySQL foreign key cascade does not delete them
        await tx.page.updateMany({
          where: { parentId: id, userId },
          data: { parentId: null },
        });

        // 3. Permanently delete the note
        await tx.page.delete({ where: { id: page.id } });
        return { success: true, id };
      }

      case "mind_map": {
        const map = await tx.mindMap.findFirst({
          where: { id, userId, deletedAt: { not: null } },
        });
        if (!map) throw new ApiError(404, "Item not found in Recycle Bin");
        if (map.isLocked) {
          throw new ApiError(423, "423 Locked — Unlock this mind map before permanently deleting.");
        }
        await tx.mindMap.delete({ where: { id: map.id } });
        return { success: true, id };
      }

      case "event": {
        const event = await tx.event.findFirst({
          where: { id, userId, deletedAt: { not: null } },
        });
        if (!event) throw new ApiError(404, "Item not found in Recycle Bin");
        await tx.event.delete({ where: { id: event.id } });
        return { success: true, id };
      }

      case "routine": {
        const routine = await tx.routine.findFirst({
          where: { id, userId, deletedAt: { not: null } },
        });
        if (!routine) throw new ApiError(404, "Item not found in Recycle Bin");
        await tx.habit.updateMany({
          where: { routineId: routine.id, userId },
          data: { routineId: null },
        });
        await tx.routine.delete({ where: { id: routine.id } });
        return { success: true, id };
      }

      case "habit": {
        const habit = await tx.habit.findFirst({
          where: { id, userId, deletedAt: { not: null } },
        });
        if (!habit) throw new ApiError(404, "Item not found in Recycle Bin");
        await tx.habit.delete({ where: { id: habit.id } });
        return { success: true, id };
      }

      default:
        throw new ApiError(400, "Unknown item type");
    }
  });
}

/**
 * Permanently deletes all items in Recycle Bin for the given user, respecting locked mind maps.
 */
export async function emptyTrash(
  userId: string,
  filter: TrashFilter = "all",
): Promise<{ deletedCount: number; lockedSkipped: number }> {
  const { items } = await listTrash(userId, filter);
  let deletedCount = 0;
  let lockedSkipped = 0;

  for (const item of items) {
    if (item.type === "mind_map" && item.is_locked) {
      lockedSkipped++;
      continue;
    }
    try {
      await permanentlyDeleteItem(userId, item.type, item.id);
      deletedCount++;
    } catch (e) {
      console.error(`[trash] Failed permanently deleting ${item.type} ${item.id}:`, e);
    }
  }

  return { deletedCount, lockedSkipped };
}

/**
 * Automated permanent cleanup for expired items older than 30 days.
 * Safe, idempotent, can be called repeatedly without harm.
 * Never deletes active items (deletedAt IS NULL).
 */
export async function cleanupExpiredTrash(options?: { simulatedCutoff?: Date }): Promise<{
  cutoff: string;
  deleted: {
    tasks: number;
    task_lists: number;
    pages: number;
    projects: number;
    mind_maps: number;
    events: number;
    habits: number;
    routines: number;
  };
}> {
  const prisma = db();
  const cutoff = options?.simulatedCutoff ?? getExpirationCutoff(RETENTION_DAYS);
  const whereExpired = { deletedAt: { lte: cutoff } };

  // Run in transaction to maintain referential consistency and prevent cascade deletions of active children
  const result = await prisma.$transaction(async (tx) => {
    // -------------------------------------------------------------------------
    // Phase 1: Reparent and preserve active/restored child records BEFORE
    // permanently deleting their expired parents.
    // -------------------------------------------------------------------------

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

    // 2. Projects: Protect active or non-expired notes inside expired projects by converting them to standalone notes
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

    // 4. Task Lists: Protect active or non-expired tasks inside expired task lists by moving them to an active fallback list
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
        const userTasks = new Map<string, string[]>();
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

    // -------------------------------------------------------------------------
    // Phase 2: Permanently delete expired records
    // -------------------------------------------------------------------------

    // 1. Habits (deleting habit cascades completions)
    const habitsRes = await tx.habit.deleteMany({ where: whereExpired });

    // 2. Routines (habits have onDelete: SetNull in schema)
    const routinesRes = await tx.routine.deleteMany({ where: whereExpired });

    // 3. Tasks (subtasks cascade)
    const tasksRes = await tx.task.deleteMany({ where: whereExpired });

    // 4. Task lists (tasks cascade)
    const listsRes = await tx.taskList.deleteMany({ where: whereExpired });

    // 5. Pages
    const pagesRes = await tx.page.deleteMany({ where: whereExpired });

    // 6. Projects (pages cascade)
    const projectsRes = await tx.project.deleteMany({ where: whereExpired });

    // 7. Events
    const eventsRes = await tx.event.deleteMany({ where: whereExpired });

    // 8. Mind maps: only unlocked mind maps are auto-deleted. Locked mind maps remain safe.
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

  return {
    cutoff: cutoff.toISOString(),
    deleted: result,
  };
}
