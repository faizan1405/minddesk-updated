import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const RestoreSchema = z.object({
  type: z.enum(["note", "task", "task_list", "project", "mind_map", "event", "habit", "routine"]),
  id: z.string().uuid(),
});

export const Route = createFileRoute("/api/trash/restore")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const { restoreItem } = await import("@/lib/server/trash.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const body = RestoreSchema.parse(await api.readJson(request));
          const res = await restoreItem(user.id, body.type, body.id);
          return api.json(res);
        });
      },
    },
  },
});
