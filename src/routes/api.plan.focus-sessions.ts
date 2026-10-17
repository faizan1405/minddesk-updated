import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/plan/focus-sessions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const date = api.DateKey.parse(new URL(request.url).searchParams.get("date"));
          const rows = await api.db().focusSession.findMany({
            where: { userId: user.id, date: new Date(`${date}T00:00:00Z`) }, orderBy: { startedAt: "asc" },
          });
          return api.json(rows.map(api.focusDto));
        });
      },
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const b = z.object({
            activity_id: z.string().uuid().nullable(),
            title: z.string().trim().min(1).max(200),
            date: api.DateKey,
            planned_minutes: z.number().int().min(1).max(240),
            focused_seconds: z.number().int().min(0).max(240 * 60),
            completed: z.boolean(),
            started_at: z.string().datetime(),
            ended_at: z.string().datetime(),
          }).parse(await api.readJson(request));
          if (b.activity_id) {
            const a = await api.db().planActivity.findFirst({ where: { id: b.activity_id, userId: user.id } });
            if (!a) throw new api.ApiError(404, "Activity not found");
          }
          if (new Date(b.ended_at) < new Date(b.started_at)) throw new api.ApiError(400, "Session ends before it starts");
          const f = await api.db().focusSession.create({
            data: {
              userId: user.id, activityId: b.activity_id, title: b.title, date: new Date(`${b.date}T00:00:00Z`),
              plannedMinutes: b.planned_minutes, focusedSeconds: b.focused_seconds, completed: b.completed,
              startedAt: new Date(b.started_at), endedAt: new Date(b.ended_at),
            },
          });
          return api.json(api.focusDto(f), { status: 201 });
        });
      },
    },
  },
});
