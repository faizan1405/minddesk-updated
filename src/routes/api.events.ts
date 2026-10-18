import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      // ?from=ISO&to=ISO → one-off events overlapping the range + every recurring series starting before `to`.
      GET: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const url = new URL(request.url);
          const from = new Date(url.searchParams.get("from") ?? "");
          const to = new Date(url.searchParams.get("to") ?? "");
          if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) throw new api.ApiError(400, "Invalid range");
          // All-day rows are stored at 00:00 UTC; widen by a day so any time zone is covered.
          const lo = new Date(from.getTime() - 864e5);
          const hi = new Date(to.getTime() + 864e5);
          const rows = await api.db().event.findMany({
            where: {
              userId: user.id,
              deletedAt: null,
              OR: [
                { recurrenceRule: null, startAt: { lte: hi }, endAt: { gte: lo } },
                { recurrenceRule: { not: null }, startAt: { lte: hi } },
              ],
            },
            orderBy: { startAt: "asc" },
          });
          return api.json(rows.map(api.eventDto));
        });
      },
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const data = api.eventData(await api.readJson(request));
          const e = await api.db().event.create({ data: { ...data, userId: user.id } });
          return api.json(api.eventDto(e), { status: 201 });
        });
      },
    },
  },
});
