import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Patch = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(10000).nullable().optional(),
  completed: z.boolean().optional(),
  starred: z.boolean().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  list_id: z.string().uuid().optional(),
  position: z.number().finite().optional(),
});

export const Route = createFileRoute("/api/tasks/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const b = Patch.parse(await api.readJson(request));
          const prisma = api.db();
          const task = await prisma.task.findFirst({ where: { id: params.id, userId: user.id, deletedAt: null } });
          if (!task) throw new api.ApiError(404, "Task not found");
          if (b.list_id && b.list_id !== task.listId) {
            if (task.parentId) throw new api.ApiError(400, "Move the parent task instead");
            const list = await prisma.taskList.findFirst({ where: { id: b.list_id, userId: user.id, deletedAt: null } });
            if (!list) throw new api.ApiError(404, "List not found");
          }
          const updated = await prisma.$transaction(async (tx) => {
            const t = await tx.task.update({
              where: { id: task.id },
              data: api.defined({
                title: b.title, description: b.description, starred: b.starred, position: b.position,
                listId: b.list_id, dueDate: api.toDate(b.due_date),
                ...(b.completed !== undefined
                  ? { completed: b.completed, completedAt: b.completed ? new Date() : null } : {}),
              }),
            });
            if (b.list_id && b.list_id !== task.listId)
              await tx.task.updateMany({ where: { parentId: task.id, userId: user.id }, data: { listId: b.list_id } });
            return t;
          });
          return api.json(api.taskDto(updated));
        });
      },
      DELETE: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const prisma = api.db();
          const task = await prisma.task.findFirst({ where: { id: params.id, userId: user.id, deletedAt: null } });
          if (!task) throw new api.ApiError(404, "Task not found");
          const now = new Date();
          await prisma.$transaction([
            prisma.task.update({ where: { id: task.id }, data: { deletedAt: now } }),
            prisma.task.updateMany({ where: { parentId: task.id, userId: user.id, deletedAt: null }, data: { deletedAt: now } }),
          ]);
          return api.json({ ok: true });
        });
      },
    },
  },
});
