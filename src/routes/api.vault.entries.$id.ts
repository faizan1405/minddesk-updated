import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const UpdateInput = z.object({
  encrypted_data: z.string().min(1),
  iv: z.string().min(12).max(64),
  expected_version: z.number().int().min(1),
});

export const Route = createFileRoute("/api/vault/entries/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const body = UpdateInput.parse(await api.readJson(request));

          // P1: Atomic version-checked optimistic concurrency update
          const result = await api.db().vaultEntry.updateMany({
            where: {
              id: params.id,
              userId: user.id,
              version: body.expected_version,
            },
            data: {
              encryptedData: body.encrypted_data,
              iv: body.iv,
              version: { increment: 1 },
            },
          });

          if (result.count === 0) {
            const existing = await api.db().vaultEntry.findFirst({
              where: { id: params.id, userId: user.id },
            });
            if (!existing) {
              throw new api.ApiError(404, "Vault entry not found");
            }
            throw new api.ApiError(
              409,
              "Conflict: Password entry was modified by another session. Please reload.",
            );
          }

          const updated = await api.db().vaultEntry.findUniqueOrThrow({
            where: { id: params.id },
          });

          return api.json({
            id: updated.id,
            encrypted_data: updated.encryptedData,
            iv: updated.iv,
            version: updated.version,
            created_at: updated.createdAt.toISOString(),
            updated_at: updated.updatedAt.toISOString(),
          });
        });
      },

      DELETE: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);

          const existing = await api.db().vaultEntry.findFirst({
            where: { id: params.id, userId: user.id },
          });

          if (!existing) {
            throw new api.ApiError(404, "Vault entry not found");
          }

          await api.db().vaultEntry.delete({
            where: { id: params.id },
          });

          return api.json({ success: true, id: params.id });
        });
      },
    },
  },
});
