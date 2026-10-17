import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/routines")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const { RoutineInput } = await import("@/lib/habits-shared");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const b = RoutineInput.parse(await api.readJson(request));
          const r = await api.db().routine.create({ data: { userId: user.id, title: b.title, position: Date.now() } });
          return api.json(api.routineDto(r), { status: 201 });
        });
      },
    },
  },
});
