import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/vault/documents/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const api = await import("@/lib/server/api.server");
        const vaultStorage = await import("@/lib/server/vault-storage.server");
        return api.handle(async () => {
          const user = await api.requireUser(request);

          const formData = await request.formData().catch(() => {
            throw new api.ApiError(400, "Invalid form data in upload request.");
          });

          const documentId = formData.get("document_id") as string | null;
          const attachmentId = formData.get("attachment_id") as string | null;
          const iv = formData.get("iv") as string | null;
          const fileEntry = formData.get("file");

          if (!documentId || !attachmentId || !iv || !fileEntry || typeof fileEntry === "string") {
            throw new api.ApiError(400, "Missing required upload parameters (document_id, attachment_id, iv, file).");
          }

          // Verify document ownership
          const doc = await api.db().vaultDocument.findFirst({
            where: { id: documentId, userId: user.id },
          });

          if (!doc) {
            throw new api.ApiError(404, "Target document not found or access denied.");
          }

          const arrayBuffer = await fileEntry.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          if (buffer.length === 0) {
            throw new api.ApiError(400, "Uploaded encrypted file is empty.");
          }

          const saved = await vaultStorage.saveEncryptedAttachmentFile(
            user.id,
            documentId,
            attachmentId,
            buffer,
            iv,
          );

          return api.json(
            {
              id: saved.id,
              document_id: documentId,
              encrypted_size: saved.encryptedSize,
              iv: saved.iv,
            },
            { status: 201 },
          );
        });
      },
    },
  },
});
