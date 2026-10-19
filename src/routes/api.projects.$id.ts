import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Patch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  is_pinned: z.boolean().optional(),
});

export const Route = createFileRoute("/api/projects/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const b = Patch.parse(await api.readJson(request));
          const owned = await api.db().project.findFirst({ where: { id: params.id, userId: user.id, deletedAt: null } });
          if (!owned) throw new api.ApiError(404, "Project not found");
          const p = await api.db().project.update({
            where: { id: owned.id },
            data: api.defined({ title: b.title, isPinned: b.is_pinned }),
          });
          return api.json(api.projectDto(p));
        });
      },
      DELETE: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const prisma = api.db();
          const owned = await prisma.project.findFirst({ where: { id: params.id, userId: user.id, deletedAt: null } });
          if (!owned) throw new api.ApiError(404, "Project not found");
          const now = new Date();
          await prisma.$transaction([
            prisma.project.update({ where: { id: owned.id }, data: { deletedAt: now } }),
            prisma.page.updateMany({ where: { projectId: owned.id, userId: user.id, deletedAt: null }, data: { deletedAt: now } }),
          ]);
          return api.json({ ok: true });
        });
      },
    },
  },
});
