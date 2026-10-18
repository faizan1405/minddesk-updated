import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const QuerySchema = z.object({
  range: z.enum(["7d", "30d", "90d"]).optional(),
  tz: z.string().optional(),
});

export const Route = createFileRoute("/api/analytics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const { calculateProductivityAnalytics } = await import("@/lib/server/analytics-calc");
        const { parseSettings } = await import("@/lib/settings-shared");

        return api.handle(async () => {
          const user = await api.requireUser(request);
          const url = new URL(request.url);
          const query = QuerySchema.parse({
            range: url.searchParams.get("range") || undefined,
            tz: url.searchParams.get("tz") || undefined,
          });

          const prisma = api.db();

          // Query real MySQL data belonging strictly to the authenticated user
          const [tasks, focusSessions, habits, settingsRow] = await Promise.all([
            prisma.task.findMany({
              where: { userId: user.id },
              select: {
                id: true,
                completed: true,
                completedAt: true,
                dueDate: true,
                createdAt: true,
                updatedAt: true,
              },
            }),
            prisma.focusSession.findMany({
              where: { userId: user.id },
              select: {
                id: true,
                date: true,
                plannedMinutes: true,
                focusedSeconds: true,
                completed: true,
                startedAt: true,
                endedAt: true,
              },
            }),
            prisma.habit.findMany({
              where: { userId: user.id },
              include: {
                completions: {
                  select: { date: true },
                },
              },
            }),
            prisma.userSettings.findUnique({
              where: { userId: user.id },
              select: { data: true },
            }),
          ]);

          const userSettings = parseSettings(settingsRow?.data);
          const effectiveTz = query.tz || userSettings.time_zone || "Asia/Kolkata";
          const range = query.range ?? "30d";

          const analytics = calculateProductivityAnalytics({
            tasks,
            focusSessions,
            habits: habits.map((h) => ({
              id: h.id,
              title: h.title,
              color: h.color,
              repeatDays: h.repeatDays,
              startDate: h.startDate,
              completions: h.completions.map((c) => c.date),
            })),
            range,
            timeZone: effectiveTz,
          });

          return api.json(analytics);
        });
      },
    },
  },
});
