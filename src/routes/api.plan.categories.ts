import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/plan/categories")({
  server: {
    handlers: {
      // Lists categories; creates the five defaults the first time a user opens Plan Your Day.
      GET: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const { DEFAULT_PLAN_CATEGORIES } = await import("@/lib/plan-shared");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const prisma = api.db();
          const hasDefaults = await prisma.planCategory.count({ where: { userId: user.id, isDefault: true } });
          if (hasDefaults === 0) {
            await prisma.planCategory.createMany({
              data: DEFAULT_PLAN_CATEGORIES.map((c, i) => ({ userId: user.id, name: c.name, color: c.color, position: i, isDefault: true })),
            });
          }
          const rows = await prisma.planCategory.findMany({ where: { userId: user.id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
          return api.json(rows.map(api.planCategoryDto));
        });
      },
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const b = z.object({ name: z.string().trim().min(1).max(60), color: z.enum(api.PLAN_COLORS) }).parse(await api.readJson(request));
          const c = await api.db().planCategory.create({ data: { userId: user.id, name: b.name, color: b.color, position: Date.now() } });
          return api.json(api.planCategoryDto(c), { status: 201 });
        });
      },
    },
  },
});
