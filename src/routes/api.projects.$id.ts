import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Patch = z.object({ title: z.string().trim().min(1).max(200) });

export const Route = createFileRoute("/api/projects/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const { title } = Patch.parse(await api.readJson(request));
          const owned = await api.db().project.findFirst({ where: { id: params.id, userId: user.id } });
          if (!owned) throw new api.ApiError(404, "Project not found");
          const p = await api.db().project.update({ where: { id: owned.id }, data: { title } });
          return api.json(api.projectDto(p));
        });
      },
      DELETE: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const res = await api.db().project.deleteMany({ where: { id: params.id, userId: user.id } });
          if (res.count === 0) throw new api.ApiError(404, "Project not found");
          return api.json({ ok: true });
        });
      },
    },
  },
});
