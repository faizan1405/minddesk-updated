import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/plan/categories/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const b = z.object({ name: z.string().trim().min(1).max(60).optional(), color: z.enum(api.PLAN_COLORS).optional() })
            .parse(await api.readJson(request));
          const owned = await api.db().planCategory.findFirst({ where: { id: params.id, userId: user.id } });
          if (!owned) throw new api.ApiError(404, "Category not found");
          const c = await api.db().planCategory.update({ where: { id: owned.id }, data: api.defined(b) });
          return api.json(api.planCategoryDto(c));
        });
      },
      // Custom categories only; their activities become uncategorised (FK ON DELETE SET NULL).
      DELETE: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        const { assertBulkDeletionAllowed } = await import("@/lib/server/preservation.server");
        return api.handle(async () => {
          assertBulkDeletionAllowed("plan_category_deletion");
          const user = await api.requireUser(request);
          const owned = await api.db().planCategory.findFirst({ where: { id: params.id, userId: user.id } });
          if (!owned) throw new api.ApiError(404, "Category not found");
          if (owned.isDefault) throw new api.ApiError(400, "Default categories can't be deleted");
          await api.db().planCategory.delete({ where: { id: owned.id } });
          return api.json({ ok: true });
        });
      },
    },
  },
});
