import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const EntryInput = z.object({
  id: z.string().uuid().optional(),
  encrypted_data: z.string().min(1),
  iv: z.string().min(12).max(64),
});

export const Route = createFileRoute("/api/vault/entries")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const entries = await api.db().vaultEntry.findMany({
            where: { userId: user.id },
            orderBy: { updatedAt: "desc" },
          });

          return api.json(
            entries.map((e) => ({
              id: e.id,
              encrypted_data: e.encryptedData,
              iv: e.iv,
              version: e.version,
              created_at: e.createdAt.toISOString(),
              updated_at: e.updatedAt.toISOString(),
            })),
          );
        });
      },

      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const body = EntryInput.parse(await api.readJson(request));

          const created = await api.db().vaultEntry.create({
            data: {
              ...(body.id ? { id: body.id } : {}),
              userId: user.id,
              encryptedData: body.encrypted_data,
              iv: body.iv,
              version: 1,
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
            },
            { status: 201 },
          );
        });
      },
    },
  },
});
