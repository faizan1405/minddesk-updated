import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/data/export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          return api.json(await api.exportUserData(user));
        });
      },
    },
  },
});
