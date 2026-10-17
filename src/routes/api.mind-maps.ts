import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/mind-maps")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const rows = await api.db().mindMap.findMany({
            where: { userId: user.id }, select: api.mindMapMetaSelect, orderBy: { updatedAt: "desc" },
          });
          return api.json(rows.map(api.mindMapMetaDto));
        });
      },
      // Create an empty map (one central topic) or, with `data`, an imported/duplicated map.
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const { DocSchema, newDoc } = await import("@/lib/mindmap-doc");
        const Create = z.object({ title: z.string().trim().min(1).max(200), data: DocSchema.optional() });
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const b = Create.parse(await api.readJson(request));
          const doc = b.data ?? newDoc(b.title);
          const m = await api.db().mindMap.create({
            data: { userId: user.id, title: b.title, data: JSON.stringify(doc), nodeCount: doc.nodes.length },
            select: api.mindMapMetaSelect,
          });
          return api.json(api.mindMapMetaDto(m), { status: 201 });
        });
      },
    },
  },
});
