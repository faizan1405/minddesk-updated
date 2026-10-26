import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/vault/documents/files/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const api = await import("@/lib/server/api.server");
        const vaultStorage = await import("@/lib/server/vault-storage.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);

          if (!vaultStorage.isValidUuid(params.id)) {
            throw new api.ApiError(400, "Invalid attachment ID: must be a valid UUID.");
          }

          const { buffer, iv } = await vaultStorage.readEncryptedAttachmentFile(
            user.id,
            params.id,
          );

          return new Response(new Uint8Array(buffer), {
            status: 200,
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-Length": buffer.length.toString(),
              "X-Attachment-IV": iv,
              "Cache-Control": "no-store, no-cache, must-revalidate, private",
              "X-Content-Type-Options": "nosniff",
            },
          });
        });
      },
    },
  },
});
