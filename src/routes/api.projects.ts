import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Create = z.object({ title: z.string().trim().min(1).max(200) });

export const Route = createFileRoute("/api/projects")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const rows = await api.db().project.findMany({
            where: { userId: user.id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          });
          return api.json(rows.map(api.projectDto));
        });
      },
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const { title } = Create.parse(await api.readJson(request));
          const p = await api.db().project.create({ data: { userId: user.id, title, position: Date.now() } });
          return api.json(api.projectDto(p), { status: 201 });
        });
      },
    },
  },
});
