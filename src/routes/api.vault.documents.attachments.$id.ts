import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/vault/documents/attachments/$id")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        const vaultStorage = await import("@/lib/server/vault-storage.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);

          if (!vaultStorage.isValidUuid(params.id)) {
            throw new api.ApiError(400, "Invalid attachment ID: must be a valid UUID.");
          }

          await vaultStorage.deleteEncryptedAttachmentFile(user.id, params.id);

          return api.json({ success: true, id: params.id });
        });
      },
    },
  },
});
