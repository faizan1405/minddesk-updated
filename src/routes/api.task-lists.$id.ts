import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Patch = z.object({ title: z.string().trim().min(1).max(200).optional(), position: z.number().finite().optional() });

export const Route = createFileRoute("/api/task-lists/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const body = Patch.parse(await api.readJson(request));
          const owned = await api.db().taskList.findFirst({ where: { id: params.id, userId: user.id, deletedAt: null } });
          if (!owned) throw new api.ApiError(404, "List not found");
          const list = await api.db().taskList.update({ where: { id: owned.id }, data: api.defined(body) });
          return api.json(api.listDto(list));
        });
      },
      DELETE: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const prisma = api.db();
          const owned = await prisma.taskList.findFirst({ where: { id: params.id, userId: user.id, deletedAt: null } });
          if (!owned) throw new api.ApiError(404, "List not found");
          const now = new Date();
          await prisma.$transaction([
            prisma.taskList.update({ where: { id: owned.id }, data: { deletedAt: now } }),
            prisma.task.updateMany({ where: { listId: owned.id, userId: user.id, deletedAt: null }, data: { deletedAt: now } }),
          ]);
          return api.json({ ok: true });
        });
      },
    },
  },
});
