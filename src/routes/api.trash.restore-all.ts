import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import type { TrashFilter } from "@/lib/server/trash.server";

const RestoreAllSchema = z.object({
  filter: z.enum(["all", "note", "task", "project", "mind_map", "calendar", "habit"]).optional(),
});

export const Route = createFileRoute("/api/trash/restore-all")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const { restoreAll } = await import("@/lib/server/trash.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          let filter: TrashFilter = "all";
          try {
            const json = await api.readJson(request);
            const parsed = RestoreAllSchema.safeParse(json);
            if (parsed.success && parsed.data.filter) filter = parsed.data.filter;
          } catch {
            // body is optional
          }
          const res = await restoreAll(user.id, filter);
          return api.json(res);
        });
      },
    },
  },
});
