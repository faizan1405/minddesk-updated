import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/pages/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        const { parseContent } = await import("@/lib/page-content");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const page = await api.db().page.findFirst({ where: { id: params.id, userId: user.id, deletedAt: null } });
          if (!page) throw new api.ApiError(404, "Page not found");
          return api.json({ ...api.pageMetaDto(page), content: parseContent(page.content) });
        });
      },
      // Title-only edits are always accepted. Content edits require base_version (optimistic
      // concurrency): a stale version returns 409 instead of silently overwriting newer content.
      PATCH: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        const { ContentSchema } = await import("@/lib/page-content");
        const Patch = z.object({
          title: z.string().max(300).optional(),
          content: ContentSchema.optional(),
          base_version: z.number().int().optional(),
          is_pinned: z.boolean().optional(),
        });
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const b = Patch.parse(await api.readJson(request));
          const prisma = api.db();
          const where = { id: params.id, userId: user.id, deletedAt: null };
          if (b.content) {
            if (b.base_version === undefined) throw new api.ApiError(400, "base_version is required with content");
            const res = await prisma.page.updateMany({
              where: { ...where, version: b.base_version },
              data: api.defined({
                title: b.title, content: JSON.stringify(b.content), isPinned: b.is_pinned, version: { increment: 1 },
              }),
            });
            if (res.count === 0) {
              const exists = await prisma.page.findFirst({ where, select: { version: true } });
              if (!exists) throw new api.ApiError(404, "Page not found");
              return api.json({ error: "This page was changed elsewhere.", version: exists.version }, { status: 409 });
            }
          } else if (b.title !== undefined || b.is_pinned !== undefined) {
            const res = await prisma.page.updateMany({
              where,
              data: api.defined({ title: b.title, isPinned: b.is_pinned }),
            });
            if (res.count === 0) throw new api.ApiError(404, "Page not found");
          }
          const page = await prisma.page.findFirst({ where, select: api.pageMetaSelect });
          if (!page) throw new api.ApiError(404, "Page not found");
          return api.json(api.pageMetaDto(page));
        });
      },
      DELETE: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const prisma = api.db();
          const page = await prisma.page.findFirst({ where: { id: params.id, userId: user.id, deletedAt: null } });
          if (!page) throw new api.ApiError(404, "Page not found");
          const now = new Date();
          const toDelete = [page.id];
          let queue = [page.id];
          while (queue.length > 0) {
            const children = await prisma.page.findMany({
              where: { parentId: { in: queue }, userId: user.id, deletedAt: null },
              select: { id: true },
            });
            const nextIds = children.map((c) => c.id);
            toDelete.push(...nextIds);
            queue = nextIds;
          }
          await prisma.page.updateMany({
            where: { id: { in: toDelete }, userId: user.id },
            data: { deletedAt: now },
          });
          return api.json({ ok: true });
        });
      },
    },
  },
});
