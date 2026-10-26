import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const RewrapInput = z.object({
  salt: z.string().min(16).max(64),
  wrapped_key: z.string().min(16),
  wrapped_key_iv: z.string().min(12).max(64),
});

export const Route = createFileRoute("/api/vault/password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);
          const body = RewrapInput.parse(await api.readJson(request));

          const existing = await api.db().vaultMeta.findUnique({
            where: { userId: user.id },
          });

          if (!existing) {
            throw new api.ApiError(404, "Vault not found. Please initialize first.");
          }

          const updated = await api.db().vaultMeta.update({
            where: { userId: user.id },
            data: {
              salt: body.salt,
              wrappedKey: body.wrapped_key,
              wrappedKeyIv: body.wrapped_key_iv,
              version: { increment: 1 },
            },
          });

          return api.json({
            success: true,
            version: updated.version,
            updated_at: updated.updatedAt.toISOString(),
          });
        });
      },
    },
  },
});
