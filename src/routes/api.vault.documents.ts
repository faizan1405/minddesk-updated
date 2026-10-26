import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const DocumentInput = z.object({
  id: z.string().uuid().optional(),
  encrypted_data: z.string().min(1),
  iv: z.string().min(12).max(64),
});

export const Route = createFileRoute("/api/vault/documents")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const docs = await api.db().vaultDocument.findMany({
            where: { userId: user.id },
            include: {
              attachments: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  encryptedSize: true,
                  iv: true,
                  createdAt: true,
                },
              },
            },
            orderBy: { updatedAt: "desc" },
          });

          return api.json(
            docs.map((d) => ({
              id: d.id,
              encrypted_data: d.encryptedData,
              iv: d.iv,
              version: d.version,
              created_at: d.createdAt.toISOString(),
              updated_at: d.updatedAt.toISOString(),
              attachments: d.attachments.map((a) => ({
                id: a.id,
                encrypted_size: a.encryptedSize,
                iv: a.iv,
                created_at: a.createdAt.toISOString(),
              })),
            })),
          );
        });
      },

      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const body = DocumentInput.parse(await api.readJson(request));

          const created = await api.db().vaultDocument.create({
            data: {
              ...(body.id ? { id: body.id } : {}),
              userId: user.id,
              encryptedData: body.encrypted_data,
              iv: body.iv,
              version: 1,
            },
            include: {
              attachments: true,
            },
          });

          return api.json(
            {
              id: created.id,
              encrypted_data: created.encryptedData,
              iv: created.iv,
              version: created.version,
              created_at: created.createdAt.toISOString(),
              updated_at: created.updatedAt.toISOString(),
              attachments: [],
            },
            { status: 201 },
          );
        });
      },
    },
  },
});
