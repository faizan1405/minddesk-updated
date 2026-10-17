import { createFileRoute } from "@tanstack/react-router";

// Set membership and order of a routine (or of standalone habits when routine_id is null) in one transaction.
export const Route = createFileRoute("/api/habits/order")({
  server: {
    handlers: {
      PUT: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const { OrderInput } = await import("@/lib/habits-shared");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const b = OrderInput.parse(await api.readJson(request));
          await api.ownRoutine(b.routine_id, user.id);
          const prisma = api.db();
          const owned = await prisma.habit.count({ where: { id: { in: b.habit_ids }, userId: user.id } });
          if (owned !== new Set(b.habit_ids).size) throw new api.ApiError(404, "Habit not found");
          await prisma.$transaction(
            b.habit_ids.map((id, i) => prisma.habit.update({ where: { id }, data: { routineId: b.routine_id, position: i + 1 } })),
          );
          return api.json({ ok: true });
        });
      },
    },
  },
});
