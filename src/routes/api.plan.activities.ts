import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/plan/activities")({
  server: {
    handlers: {
      // ?from=YYYY-MM-DD&to=YYYY-MM-DD → one-off activities in range (plus the day before, for overnight
      // blocks) and every recurring series active in the range, each with its per-day exceptions.
      GET: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const url = new URL(request.url);
          const from = api.DateKey.parse(url.searchParams.get("from"));
          const to = api.DateKey.parse(url.searchParams.get("to"));
          if (to < from) throw new api.ApiError(400, "Invalid range");
          const lo = new Date(Date.parse(`${from}T00:00:00Z`) - 864e5);
          const hi = new Date(`${to}T00:00:00Z`);
          const rows = await api.db().planActivity.findMany({
            where: {
              userId: user.id,
              startDate: { lte: hi },
              OR: [
                { repeatDays: 0, startDate: { gte: lo } },
                { repeatDays: { gt: 0 }, OR: [{ endDate: null }, { endDate: { gte: lo } }] },
              ],
            },
            include: { exceptions: { where: { date: { gte: lo, lte: hi } } } },
            orderBy: { startMinute: "asc" },
          });
          return api.json(rows.map(api.planActivityDto));
        });
      },
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const data = await api.activityData(await api.readJson(request), user.id);
          const a = await api.db().planActivity.create({ data: { ...data, userId: user.id }, include: { exceptions: true } });
          return api.json(api.planActivityDto(a), { status: 201 });
        });
      },
    },
  },
});
