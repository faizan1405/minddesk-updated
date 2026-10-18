import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Create = z.object({ title: z.string().trim().min(1).max(200), position: z.number().finite().optional() });

export const Route = createFileRoute("/api/task-lists")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const lists = await api.db().taskList.findMany({
            where: { userId: user.id, deletedAt: null }, orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          });
          return api.json(lists.map(api.listDto));
        });
      },
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const body = Create.parse(await api.readJson(request));
          const list = await api.db().taskList.create({
            data: { userId: user.id, title: body.title, position: body.position ?? Date.now() },
          });
          return api.json(api.listDto(list), { status: 201 });
        });
      },
    },
  },
});
