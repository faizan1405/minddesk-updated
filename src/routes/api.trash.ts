import { createFileRoute } from "@tanstack/react-router";
import type { TrashFilter } from "@/lib/server/trash.server";

export const Route = createFileRoute("/api/trash")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const { listTrash } = await import("@/lib/server/trash.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const url = new URL(request.url);
          const filter = (url.searchParams.get("filter") || "all") as TrashFilter;
          const search = url.searchParams.get("q") || undefined;
          const result = await listTrash(user.id, filter, search);
          return api.json(result);
        });
      },
    },
  },
});
