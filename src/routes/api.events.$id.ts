import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/events/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const e = await api.db().event.findFirst({ where: { id: params.id, userId: user.id, deletedAt: null } });
          if (!e) throw new api.ApiError(404, "Event not found");
          return api.json(api.eventDto(e));
        });
      },
      // Full replace of the event (applies to the whole series for recurring events).
      PUT: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const data = api.eventData(await api.readJson(request));
          const owned = await api.db().event.findFirst({ where: { id: params.id, userId: user.id, deletedAt: null } });
          if (!owned) throw new api.ApiError(404, "Event not found");
          const e = await api.db().event.update({ where: { id: owned.id }, data });
          return api.json(api.eventDto(e));
        });
      },
      DELETE: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const owned = await api.db().event.findFirst({ where: { id: params.id, userId: user.id, deletedAt: null } });
          if (!owned) throw new api.ApiError(404, "Event not found");
          await api.db().event.update({ where: { id: owned.id }, data: { deletedAt: new Date() } });
          return api.json({ ok: true });
        });
      },
    },
  },
});
