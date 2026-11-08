import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/data/summary")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const { isDataPreservationMode } = await import("@/lib/server/preservation.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const counts = await api.dataCounts(user.id);
          return api.json({
            ...counts,
            preservation_mode: isDataPreservationMode(),
          });
        });
      },
    },
  },
});
