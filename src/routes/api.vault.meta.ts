import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const InitInput = z.object({
  salt: z.string().min(16).max(64),
  wrapped_key: z.string().min(16),
  wrapped_key_iv: z.string().min(12).max(64),
  iterations: z.number().int().min(1).max(10).optional(),
  memory_cost: z.number().int().min(1024).max(65536).optional(),
  parallelism: z.number().int().min(1).max(4).optional(),
});

export const Route = createFileRoute("/api/vault/meta")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const meta = await api.db().vaultMeta.findUnique({
            where: { userId: user.id },
          });

          if (!meta) {
            return api.json({
              initialized: false,
              salt: null,
              wrapped_key: null,
              wrapped_key_iv: null,
              iterations: 3,
              memory_cost: 19456,
              parallelism: 1,
              version: 1,
            });
          }

          return api.json({
            initialized: true,
            salt: meta.salt,
            wrapped_key: meta.wrappedKey,
            wrapped_key_iv: meta.wrappedKeyIv,
            iterations: meta.iterations,
            memory_cost: meta.memoryCost,
            parallelism: meta.parallelism,
            version: meta.version,
            created_at: meta.createdAt.toISOString(),
            updated_at: meta.updatedAt.toISOString(),
          });
        });
      },

      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const body = InitInput.parse(await api.readJson(request));

          const existing = await api.db().vaultMeta.findUnique({
            where: { userId: user.id },
          });

          if (existing) {
            throw new api.ApiError(409, "Vault is already initialized.");
          }

          const created = await api.db().vaultMeta.create({
            data: {
              userId: user.id,
              salt: body.salt,
              wrappedKey: body.wrapped_key,
              wrappedKeyIv: body.wrapped_key_iv,
              iterations: body.iterations ?? 3,
              memoryCost: body.memory_cost ?? 19456,
              parallelism: body.parallelism ?? 1,
              version: 1,
            },
          });

          return api.json(
            {
              initialized: true,
              salt: created.salt,
              wrapped_key: created.wrappedKey,
              wrapped_key_iv: created.wrappedKeyIv,
              iterations: created.iterations,
              memory_cost: created.memoryCost,
              parallelism: created.parallelism,
              version: created.version,
            },
            { status: 201 },
          );
        });
      },
    },
  },
});
