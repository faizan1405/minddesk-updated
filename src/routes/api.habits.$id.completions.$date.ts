import { createFileRoute } from "@tanstack/react-router";

// Idempotent: PUT marks the habit done on that date (repeat calls never duplicate), DELETE undoes it.
export const Route = createFileRoute("/api/habits/$id/completions/$date")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        const { completionError, todayIn } = await import("@/lib/habits-shared");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const prisma = api.db();
          const h = await prisma.habit.findFirst({ where: { id: params.id, userId: user.id } });
          if (!h) throw new api.ApiError(404, "Habit not found");
          const msg = completionError({ repeat_days: h.repeatDays, start_date: h.startDate }, params.date, todayIn("Pacific/Kiritimati"));
          if (msg) throw new api.ApiError(400, msg);
          const key = { userId_habitId_date: { userId: user.id, habitId: h.id, date: params.date } };
          await prisma.habitCompletion.upsert({ where: key, create: { userId: user.id, habitId: h.id, date: params.date }, update: {} });
          return api.json({ habit_id: h.id, date: params.date, completed: true });
        });
      },
      DELETE: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        const { isDateKey } = await import("@/lib/habits-shared");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          if (!isDateKey(params.date)) throw new api.ApiError(400, "Invalid date");
          const prisma = api.db();
          const h = await prisma.habit.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
          if (!h) throw new api.ApiError(404, "Habit not found");
          await prisma.habitCompletion.deleteMany({ where: { userId: user.id, habitId: h.id, date: params.date } });
          return api.json({ habit_id: h.id, date: params.date, completed: false });
        });
      },
    },
  },
});
