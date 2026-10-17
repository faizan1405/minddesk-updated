import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/habits")({
  server: {
    handlers: {
      // Everything the Habits page needs: habits (with completion dates) and routines.
      GET: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const prisma = api.db();
          const [habits, routines] = await Promise.all([
            prisma.habit.findMany({ where: { userId: user.id }, include: api.habitInclude, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
            prisma.routine.findMany({ where: { userId: user.id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
          ]);
          return api.json({ habits: habits.map(api.habitDto), routines: routines.map(api.routineDto) });
        });
      },
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const { HabitInput, todayIn } = await import("@/lib/habits-shared");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const b = HabitInput.parse(await api.readJson(request));
          await api.ownRoutine(b.routine_id, user.id);
          const h = await api.db().habit.create({
            data: {
              userId: user.id, routineId: b.routine_id ?? null, title: b.title, description: b.description?.trim() || null,
              color: b.color, repeatDays: b.repeat_days, position: Date.now(), startDate: b.start_date ?? todayIn(),
            },
            include: api.habitInclude,
          });
          return api.json(api.habitDto(h), { status: 201 });
        });
      },
    },
  },
});
