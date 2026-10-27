import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/plan/activities/$id")({
  server: {
    handlers: {
      // Replaces the activity (the whole series for recurring ones). Per-day exceptions are kept.
      PUT: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const owned = await api.db().planActivity.findFirst({ where: { id: params.id, userId: user.id } });
          if (!owned) throw new api.ApiError(404, "Activity not found");
          const data = await api.activityData(await api.readJson(request), user.id);
          const a = await api.db().planActivity.update({ where: { id: owned.id }, data, include: { exceptions: true } });
          return api.json(api.planActivityDto(a));
        });
      },
      DELETE: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        const { assertBulkDeletionAllowed } = await import("@/lib/server/preservation.server");
        return api.handle(async () => {
          assertBulkDeletionAllowed("plan_activity_deletion");
          const user = await api.requireUser(request);
          const res = await api.db().planActivity.deleteMany({ where: { id: params.id, userId: user.id } });
          if (res.count === 0) throw new api.ApiError(404, "Activity not found");
          return api.json({ ok: true });
        });
      },
    },
  },
});
