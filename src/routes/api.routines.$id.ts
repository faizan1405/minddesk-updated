import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/routines/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        const { RoutinePatch } = await import("@/lib/habits-shared");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const b = RoutinePatch.parse(await api.readJson(request));
          const prisma = api.db();
          const res = await prisma.routine.updateMany({ where: { id: params.id, userId: user.id }, data: api.defined({ title: b.title, collapsed: b.collapsed }) });
          if (res.count === 0) throw new api.ApiError(404, "Routine not found");
          return api.json(api.routineDto(await prisma.routine.findFirstOrThrow({ where: { id: params.id } })));
        });
      },
      // Keeps the habits (and their history): they become standalone habits.
      DELETE: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const prisma = api.db();
          const r = await prisma.routine.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
          if (!r) throw new api.ApiError(404, "Routine not found");
          await prisma.$transaction([
            prisma.habit.updateMany({ where: { routineId: r.id, userId: user.id }, data: { routineId: null, position: Date.now() } }),
            prisma.routine.delete({ where: { id: r.id } }),
          ]);
          return api.json({ ok: true });
        });
      },
    },
  },
});
