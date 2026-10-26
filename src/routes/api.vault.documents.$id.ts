import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const UpdateInput = z.object({
  encrypted_data: z.string().min(1),
  iv: z.string().min(12).max(64),
});

export const Route = createFileRoute("/api/vault/documents/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const body = UpdateInput.parse(await api.readJson(request));

          const existing = await api.db().vaultDocument.findFirst({
            where: { id: params.id, userId: user.id },
          });

          if (!existing) {
            throw new api.ApiError(404, "Document not found");
          }

          const updated = await api.db().vaultDocument.update({
            where: { id: params.id },
            data: {
              encryptedData: body.encrypted_data,
              iv: body.iv,
              version: { increment: 1 },
            },
            include: {
              attachments: {
                select: {
                  id: true,
                  encryptedSize: true,
                  iv: true,
                  createdAt: true,
                },
              },
            },
          });

          return api.json({
            id: updated.id,
            encrypted_data: updated.encryptedData,
            iv: updated.iv,
            version: updated.version,
            created_at: updated.createdAt.toISOString(),
            updated_at: updated.updatedAt.toISOString(),
            attachments: updated.attachments.map((a) => ({
              id: a.id,
              encrypted_size: a.encryptedSize,
              iv: a.iv,
              created_at: a.createdAt.toISOString(),
            })),
          });
        });
      },

      DELETE: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        const vaultStorage = await import("@/lib/server/vault-storage.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);

          const existing = await api.db().vaultDocument.findFirst({
            where: { id: params.id, userId: user.id },
            include: { attachments: true },
          });

          if (!existing) {
            throw new api.ApiError(404, "Document not found");
          }

          // Delete attachment files from disk
          for (const att of existing.attachments) {
            try {
              await vaultStorage.deleteEncryptedAttachmentFile(user.id, att.id);
            } catch {
              // Best-effort disk cleanup
            }
          }

          await api.db().vaultDocument.delete({
            where: { id: params.id },
          });

          return api.json({ success: true, id: params.id });
        });
      },
    },
  },
});
