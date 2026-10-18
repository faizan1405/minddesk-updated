import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Create = z.object({
  title: z.string().max(300).optional(),
  parent_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
});

export const Route = createFileRoute("/api/pages")({
  server: {
    handlers: {
      // Metadata for all of the user's pages (notes + project pages); content is fetched per page.
      GET: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const rows = await api.db().page.findMany({
            where: { userId: user.id, deletedAt: null }, select: api.pageMetaSelect,
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          });
          return api.json(rows.map(api.pageMetaDto));
        });
      },
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const { emptyContent, ContentSchema } = await import("@/lib/page-content");
        const CreateWithContent = Create.extend({
          content: ContentSchema.optional(),
        });
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const b = CreateWithContent.parse(await api.readJson(request));
          const prisma = api.db();
          let projectId = b.project_id ?? null;
          if (b.parent_id) {
            const parent = await prisma.page.findFirst({ where: { id: b.parent_id, userId: user.id, deletedAt: null }, select: { projectId: true } });
            if (!parent) throw new api.ApiError(404, "Parent page not found");
            if (b.project_id !== undefined && parent.projectId !== projectId)
              throw new api.ApiError(400, "Parent page belongs to a different project");
            projectId = parent.projectId;
          }
          if (projectId) {
            const proj = await prisma.project.findFirst({ where: { id: projectId, userId: user.id, deletedAt: null } });
            if (!proj) throw new api.ApiError(404, "Project not found");
          }
          const page = await prisma.page.create({
            data: {
              userId: user.id, projectId, parentId: b.parent_id ?? null, title: b.title?.trim() ?? "",
              content: JSON.stringify(b.content ?? emptyContent()), position: Date.now(),
            },
          });
          return api.json(api.pageMetaDto(page), { status: 201 });
        });
      },
    },
  },
});
