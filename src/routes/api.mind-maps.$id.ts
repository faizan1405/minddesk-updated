import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/mind-maps/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        const { parseDoc } = await import("@/lib/mindmap-doc");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const m = await api.db().mindMap.findFirst({ where: { id: params.id, userId: user.id, deletedAt: null } });
          if (!m) throw new api.ApiError(404, "Mind map not found");
          return api.json({ ...api.mindMapMetaDto(m), data: parseDoc(JSON.parse(m.data)) });
        });
      },
      // Title-only edits are always accepted. Document edits need base_version: a stale
      // version returns 409, so an older request can never overwrite newer work.
      PATCH: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        const { DocSchema } = await import("@/lib/mindmap-doc");
        const Patch = z.object({
          title: z.string().trim().min(1).max(200).optional(),
          data: DocSchema.optional(),
          base_version: z.number().int().optional(),
          is_locked: z.boolean().optional(),
          is_pinned: z.boolean().optional(),
        });
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const b = Patch.parse(await api.readJson(request));
          const prisma = api.db();
          const where = { id: params.id, userId: user.id };

          const current = await prisma.mindMap.findFirst({ where });
          if (!current || current.deletedAt) throw new api.ApiError(404, "Mind map not found");

          const isModifyingContent = b.data !== undefined || b.title !== undefined;
          if (current.isLocked && isModifyingContent) {
            throw new api.ApiError(423, "423 Locked — Unlock this mind map before editing.");
          }

          if (b.data) {
            if (b.base_version === undefined) throw new api.ApiError(400, "base_version is required with data");
            const res = await prisma.mindMap.updateMany({
              where: { ...where, version: b.base_version },
              data: api.defined({
                title: b.title,
                data: JSON.stringify(b.data),
                nodeCount: b.data.nodes.length,
                isLocked: b.is_locked,
                isPinned: b.is_pinned,
                version: { increment: 1 },
              }),
            });
            if (res.count === 0) {
              const exists = await prisma.mindMap.findFirst({ where, select: { version: true } });
              if (!exists) throw new api.ApiError(404, "Mind map not found");
              return api.json({ error: "This mind map was changed elsewhere.", version: exists.version }, { status: 409 });
            }
          } else if (b.title !== undefined || b.is_locked !== undefined || b.is_pinned !== undefined) {
            const res = await prisma.mindMap.updateMany({
              where,
              data: api.defined({ title: b.title, isLocked: b.is_locked, isPinned: b.is_pinned }),
            });
            if (res.count === 0) throw new api.ApiError(404, "Mind map not found");
          }

          const m = await prisma.mindMap.findFirst({ where, select: api.mindMapMetaSelect });
          if (!m) throw new api.ApiError(404, "Mind map not found");
          return api.json(api.mindMapMetaDto(m));
        });
      },
      DELETE: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const prisma = api.db();
          const where = { id: params.id, userId: user.id };
          const current = await prisma.mindMap.findFirst({ where });
          if (!current || current.deletedAt) throw new api.ApiError(404, "Mind map not found");
          if (current.isLocked) {
            throw new api.ApiError(423, "423 Locked — Unlock this mind map before deleting.");
          }
          await prisma.mindMap.updateMany({ where, data: { deletedAt: new Date() } });
          return api.json({ ok: true });
        });
      },
    },
  },
});
