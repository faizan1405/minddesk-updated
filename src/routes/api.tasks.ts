import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Create = z.object({
  list_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(10000).nullable().optional(),
  due_date: date.nullable().optional(),
  position: z.number().finite().optional(),
});

export const Route = createFileRoute("/api/tasks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const tasks = await api.db().task.findMany({
            where: { userId: user.id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          });
          return api.json(tasks.map(api.taskDto));
        });
      },
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const b = Create.parse(await api.readJson(request));
          const list = await api.db().taskList.findFirst({ where: { id: b.list_id, userId: user.id } });
          if (!list) throw new api.ApiError(404, "List not found");
          if (b.parent_id) {
            const parent = await api.db().task.findFirst({ where: { id: b.parent_id, userId: user.id, listId: list.id } });
            if (!parent || parent.parentId) throw new api.ApiError(400, "Invalid parent task");
          }
          const task = await api.db().task.create({
            data: {
              userId: user.id, listId: list.id, parentId: b.parent_id ?? null, title: b.title,
              description: b.description ?? null, dueDate: api.toDate(b.due_date) ?? null,
              position: b.position ?? (b.parent_id ? Date.now() : -Date.now()),
            },
          });
          return api.json(api.taskDto(task), { status: 201 });
        });
      },
    },
  },
});
