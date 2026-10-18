import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/habits/$id")({
  server: {
    handlers: {
      // Schedule changes never delete completion history.
      PATCH: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        const { HabitPatch } = await import("@/lib/habits-shared");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const b = HabitPatch.parse(await api.readJson(request));
          const prisma = api.db();
          const h = await prisma.habit.findFirst({ where: { id: params.id, userId: user.id, deletedAt: null } });
          if (!h) throw new api.ApiError(404, "Habit not found");
          if (b.routine_id !== undefined) await api.ownRoutine(b.routine_id, user.id);
          const moving = b.routine_id !== undefined && b.routine_id !== h.routineId;
          const updated = await prisma.habit.update({
            where: { id: h.id },
            data: api.defined({
              title: b.title, description: b.description === undefined ? undefined : b.description?.trim() || null,
              color: b.color, repeatDays: b.repeat_days, startDate: b.start_date,
              routineId: b.routine_id, position: moving ? Date.now() : undefined,
            }),
            include: api.habitInclude,
          });
          return api.json(api.habitDto(updated));
        });
      },
      DELETE: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const h = await api.db().habit.findFirst({ where: { id: params.id, userId: user.id, deletedAt: null } });
          if (!h) throw new api.ApiError(404, "Habit not found");
          await api.db().habit.update({ where: { id: h.id }, data: { deletedAt: new Date() } });
          return api.json({ ok: true });
        });
      },
    },
  },
});
