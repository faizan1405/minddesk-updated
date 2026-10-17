import { createFileRoute } from "@tanstack/react-router";

// Per-day override of a recurring activity: PUT moves/skips that one date, DELETE restores it.
export const Route = createFileRoute("/api/plan/activities/$id/exceptions/$date")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const date = api.DateKey.parse(params.date);
          const b = api.ExceptionInput.parse(await api.readJson(request));
          const prisma = api.db();
          const a = await prisma.planActivity.findFirst({ where: { id: params.id, userId: user.id } });
          if (!a) throw new api.ApiError(404, "Activity not found");
          if (a.repeatDays === 0) throw new api.ApiError(400, "Only repeating activities have per-day changes");
          if (!b.cancelled) {
            if (b.start_minute == null || b.end_minute == null) throw new api.ApiError(400, "Start and end times are required");
            if (b.start_minute === b.end_minute % 1440 && b.end_minute !== 1440) throw new api.ApiError(400, "End time must differ from the start time");
          }
          const d = new Date(`${date}T00:00:00Z`);
          const data = { cancelled: b.cancelled, startMinute: b.cancelled ? null : b.start_minute ?? null, endMinute: b.cancelled ? null : b.end_minute ?? null };
          await prisma.planActivityException.upsert({
            where: { activityId_date: { activityId: a.id, date: d } },
            create: { activityId: a.id, date: d, ...data },
            update: data,
          });
          const full = await prisma.planActivity.findFirstOrThrow({ where: { id: a.id }, include: { exceptions: true } });
          return api.json(api.planActivityDto(full));
        });
      },
      DELETE: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const date = api.DateKey.parse(params.date);
          const prisma = api.db();
          const a = await prisma.planActivity.findFirst({ where: { id: params.id, userId: user.id } });
          if (!a) throw new api.ApiError(404, "Activity not found");
          await prisma.planActivityException.deleteMany({ where: { activityId: a.id, date: new Date(`${date}T00:00:00Z`) } });
          const full = await prisma.planActivity.findFirstOrThrow({ where: { id: a.id }, include: { exceptions: true } });
          return api.json(api.planActivityDto(full));
        });
      },
    },
  },
});
